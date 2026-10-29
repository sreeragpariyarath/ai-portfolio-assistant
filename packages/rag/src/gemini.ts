import { documentInput, queryInput } from "./embedding-input.ts";
import { validateVector } from "./ingest.ts";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRY_DELAY_MS = 30_000;

export interface GeminiClientOptions {
  apiKey: string;
  model: string;
  dims: number;
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  // The docs give no maximum for batchEmbedContents, so stay conservative.
  batchSize?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface EmbedDocument {
  title: string;
  content: string;
}

export interface GeminiClient {
  embedDocuments(documents: EmbedDocument[]): Promise<number[][]>;
  embedQuery(question: string): Promise<number[]>;
}

// Messages carry the status only: never the API key, the request text or Google's error body.
export class GeminiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

function retryAfterMs(header: string | null): number | undefined {
  if (header === null) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

export function createGeminiClient(options: GeminiClientOptions): GeminiClient {
  const {
    apiKey,
    model,
    dims,
    fetch: fetchImpl = globalThis.fetch.bind(globalThis),
    baseUrl = DEFAULT_BASE_URL,
    timeoutMs = 30_000,
    maxRetries = 4,
    batchSize = 20,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
  } = options;

  if (apiKey.trim() === "") throw new GeminiError("Gemini API key is empty.");

  async function post(method: "embedContent" | "batchEmbedContents", body: unknown): Promise<unknown> {
    const url = `${baseUrl}/models/${model}:${method}`;

    for (let attempt = 0; ; attempt++) {
      let response: Response | undefined;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        // Timeouts and network failures are retried. The underlying error is dropped on purpose.
        if (attempt >= maxRetries) throw new GeminiError(`Gemini ${method} failed: network error or timeout.`);
      }

      if (response !== undefined) {
        if (response.ok) return response.json();
        if (!RETRYABLE_STATUSES.has(response.status) || attempt >= maxRetries) {
          throw new GeminiError(`Gemini ${method} failed with HTTP ${response.status}.`, response.status);
        }
      }

      const backoff = Math.min(500 * 2 ** attempt + random() * 250, MAX_RETRY_DELAY_MS);
      const requested = response === undefined ? undefined : retryAfterMs(response.headers.get("retry-after"));
      await sleep(Math.min(Math.max(backoff, requested ?? 0), MAX_RETRY_DELAY_MS));
    }
  }

  function request(text: string) {
    return {
      model: `models/${model}`,
      content: { parts: [{ text }] },
      output_dimensionality: dims,
    };
  }

  function readValues(embedding: unknown): number[] {
    return validateVector((embedding as { values?: unknown } | undefined)?.values, dims);
  }

  return {
    async embedDocuments(documents) {
      const vectors: number[][] = [];
      for (let start = 0; start < documents.length; start += batchSize) {
        const batch = documents.slice(start, start + batchSize);
        const result = (await post("batchEmbedContents", {
          requests: batch.map((document) => request(documentInput(document.title, document.content))),
        })) as { embeddings?: unknown[] };

        if (!Array.isArray(result.embeddings) || result.embeddings.length !== batch.length) {
          throw new GeminiError("Gemini returned an unexpected number of embeddings.");
        }
        for (const embedding of result.embeddings) vectors.push(readValues(embedding));
      }
      return vectors;
    },

    async embedQuery(question) {
      const result = (await post("embedContent", request(queryInput(question)))) as { embedding?: unknown };
      return readValues(result.embedding);
    },
  };
}
