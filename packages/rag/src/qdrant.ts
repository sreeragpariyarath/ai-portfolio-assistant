import { defaultSleep, sendWithRetry } from "./retry.ts";

export interface QdrantClientOptions {
  url: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface VectorSpec {
  size: number;
  distance: "Cosine" | "Dot" | "Euclid" | "Manhattan";
}

export type QdrantFilter = Record<string, unknown>;
export type Payload = Record<string, unknown>;

export interface UpsertPoint {
  id: string;
  vector: number[];
  payload: Payload;
}

export interface StoredPoint {
  id: string;
  payload: Payload;
}

export interface ScoredPoint extends StoredPoint {
  score: number;
}

export interface QdrantClient {
  collectionExists(name: string): Promise<boolean>;
  // Throws if the collection exists with a different vector size or distance. Never recreates it.
  checkCollection(name: string, spec: VectorSpec): Promise<"missing" | "ok">;
  ensureCollection(name: string, spec: VectorSpec): Promise<"created" | "exists">;
  ensurePayloadIndex(name: string, field: string, schema: "keyword"): Promise<void>;
  upsertPoints(name: string, points: UpsertPoint[], options?: { batchSize?: number }): Promise<void>;
  scrollAll(name: string, options?: { withPayload?: string[] | boolean; pageSize?: number }): Promise<StoredPoint[]>;
  deletePoints(name: string, ids: string[]): Promise<void>;
  count(name: string, filter?: QdrantFilter): Promise<number>;
  retrieve(name: string, ids: string[], options?: { withPayload?: boolean }): Promise<StoredPoint[]>;
  query(
    name: string,
    vector: number[],
    options?: { filter?: QdrantFilter; limit?: number; withPayload?: boolean },
  ): Promise<ScoredPoint[]>;
}

// Messages never contain the API key. Qdrant's own error text is included for 4xx (it explains things like
// a wrong vector size) but is truncated and has the key redacted in case anything echoed it.
export class QdrantError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "QdrantError";
    this.status = status;
  }
}

const MAX_DETAIL_LENGTH = 200;

export function createQdrantClient(options: QdrantClientOptions): QdrantClient {
  const {
    apiKey,
    fetch: fetchImpl = globalThis.fetch.bind(globalThis),
    timeoutMs = 30_000,
    maxRetries = 3,
    sleep = defaultSleep,
    random = Math.random,
  } = options;
  const baseUrl = options.url.trim().replace(/\/+$/, "");

  if (baseUrl === "") throw new QdrantError("Qdrant URL is empty.");
  if (apiKey.trim() === "") throw new QdrantError("Qdrant API key is empty.");

  function detailOf(body: unknown): string {
    const error = (body as { status?: { error?: unknown } } | null)?.status?.error;
    if (typeof error !== "string") return "";
    return `: ${error.replaceAll(apiKey, "[redacted]").slice(0, MAX_DETAIL_LENGTH)}`;
  }

  async function call(method: "GET" | "PUT" | "POST", path: string, body?: unknown): Promise<any> {
    const response = await sendWithRetry(
      `${baseUrl}${path}`,
      {
        method,
        headers: { "api-key": apiKey, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      { fetch: fetchImpl, timeoutMs, maxRetries, sleep, random },
    );

    if (response === undefined) {
      throw new QdrantError(
        `Qdrant ${method} ${path} failed: network error or timeout. If the free cluster has been idle it may be suspended; resume it in Qdrant Cloud.`,
      );
    }
    if (!response.ok) {
      const parsed = await response.json().catch(() => null);
      throw new QdrantError(`Qdrant ${method} ${path} failed with HTTP ${response.status}${detailOf(parsed)}`, response.status);
    }
    return response.json();
  }

  const collectionPath = (name: string) => `/collections/${encodeURIComponent(name)}`;

  async function collectionExists(name: string): Promise<boolean> {
    const result = await call("GET", `${collectionPath(name)}/exists`);
    return result?.result?.exists === true;
  }

  async function checkCollection(name: string, spec: VectorSpec): Promise<"missing" | "ok"> {
    if (!(await collectionExists(name))) return "missing";

    const info = await call("GET", collectionPath(name));
    const vectors = info?.result?.config?.params?.vectors;
    if (vectors?.size !== spec.size || vectors?.distance !== spec.distance) {
      const found =
        typeof vectors?.size === "number" ? `size ${vectors.size}, distance ${vectors.distance}` : "named or unknown vectors";
      throw new QdrantError(
        `Collection "${name}" exists with ${found}, but this project needs size ${spec.size}, distance ${spec.distance}. ` +
          "Refusing to recreate it automatically: delete it in Qdrant Cloud yourself if that is what you want.",
      );
    }
    return "ok";
  }

  return {
    collectionExists,
    checkCollection,

    async ensureCollection(name, spec) {
      if ((await checkCollection(name, spec)) === "ok") return "exists";
      await call("PUT", collectionPath(name), { vectors: { size: spec.size, distance: spec.distance } });
      return "created";
    },

    async ensurePayloadIndex(name, field, schema) {
      await call("PUT", `${collectionPath(name)}/index?wait=true`, { field_name: field, field_schema: schema });
    },

    async upsertPoints(name, points, { batchSize = 32 } = {}) {
      for (let start = 0; start < points.length; start += batchSize) {
        await call("PUT", `${collectionPath(name)}/points?wait=true`, { points: points.slice(start, start + batchSize) });
      }
    },

    async scrollAll(name, { withPayload = true, pageSize = 100 } = {}) {
      const points: StoredPoint[] = [];
      let offset: unknown = undefined;

      for (;;) {
        const page = await call("POST", `${collectionPath(name)}/points/scroll`, {
          limit: pageSize,
          with_payload: withPayload,
          with_vector: false,
          ...(offset === undefined ? {} : { offset }),
        });
        const batch: { id: string; payload?: Payload }[] = page?.result?.points ?? [];
        for (const point of batch) points.push({ id: point.id, payload: point.payload ?? {} });

        const next = page?.result?.next_page_offset;
        // Stop on null/missing, an empty page, or an offset that did not advance (guards against looping forever).
        if (next === null || next === undefined || batch.length === 0 || next === offset) return points;
        offset = next;
      }
    },

    async deletePoints(name, ids) {
      if (ids.length === 0) return;
      await call("POST", `${collectionPath(name)}/points/delete?wait=true`, { points: ids });
    },

    async count(name, filter) {
      const result = await call("POST", `${collectionPath(name)}/points/count`, {
        exact: true,
        ...(filter === undefined ? {} : { filter }),
      });
      return result?.result?.count as number;
    },

    async retrieve(name, ids, { withPayload = true } = {}) {
      if (ids.length === 0) return [];
      const result = await call("POST", `${collectionPath(name)}/points`, {
        ids,
        with_payload: withPayload,
        with_vector: false,
      });
      return (result?.result ?? []).map((point: { id: string; payload?: Payload }) => ({
        id: point.id,
        payload: point.payload ?? {},
      }));
    },

    async query(name, vector, { filter, limit = 5, withPayload = true } = {}) {
      const result = await call("POST", `${collectionPath(name)}/points/query`, {
        query: vector,
        limit,
        with_payload: withPayload,
        ...(filter === undefined ? {} : { filter }),
      });
      return (result?.result?.points ?? []).map((point: { id: string; score: number; payload?: Payload }) => ({
        id: point.id,
        score: point.score,
        payload: point.payload ?? {},
      }));
    },
  };
}
