import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QdrantError, createQdrantClient } from "../src/qdrant.ts";

const API_KEY = "qdrant-key-should-never-appear";
const BASE = "https://example.cloud.qdrant.io:6333";
const SPEC = { size: 768, distance: "Cosine" } as const;

interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: any;
}

type Reply = Response | Error;
type Handler = (call: Call, index: number) => Reply;

function ok(result: unknown): Response {
  return Response.json({ status: "ok", time: 0.001, result });
}

function collectionInfo(vectors: unknown): Response {
  return ok({ config: { params: { vectors } } });
}

function setup(handler: Handler, extra: Partial<Parameters<typeof createQdrantClient>[0]> = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const parsed = new URL(String(url));
    const call: Call = {
      method: String(init?.method),
      path: parsed.pathname + parsed.search,
      headers: init?.headers as Record<string, string>,
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    };
    calls.push(call);
    const reply = handler(call, calls.length - 1);
    if (reply instanceof Error) throw reply;
    return reply;
  }) as typeof fetch;
  const sleeps: number[] = [];
  const qdrant = createQdrantClient({
    url: BASE,
    apiKey: API_KEY,
    fetch: fetchImpl,
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0,
    ...extra,
  });
  return { qdrant, calls, sleeps };
}

describe("requests", () => {
  it("sends the api-key header and tolerates a trailing slash on the URL", async () => {
    const { qdrant, calls } = setup(() => ok({ exists: true }), { url: `${BASE}/` });
    assert.equal(await qdrant.collectionExists("portfolio_knowledge"), true);
    assert.equal(calls[0]!.method, "GET");
    assert.equal(calls[0]!.path, "/collections/portfolio_knowledge/exists");
    assert.equal(calls[0]!.headers["api-key"], API_KEY);
  });

  it("rejects an empty URL or key up front", () => {
    assert.throws(() => createQdrantClient({ url: " ", apiKey: API_KEY }), QdrantError);
    assert.throws(() => createQdrantClient({ url: BASE, apiKey: " " }), QdrantError);
  });
});

describe("ensureCollection", () => {
  it("creates the collection when it is missing", async () => {
    const { qdrant, calls } = setup((call) => (call.path.endsWith("/exists") ? ok({ exists: false }) : ok(true)));
    assert.equal(await qdrant.ensureCollection("c", SPEC), "created");
    assert.deepEqual(
      calls.map((call) => `${call.method} ${call.path}`),
      ["GET /collections/c/exists", "PUT /collections/c"],
    );
    assert.deepEqual(calls[1]!.body, { vectors: { size: 768, distance: "Cosine" } });
  });

  it("leaves a matching collection alone", async () => {
    const { qdrant, calls } = setup((call) =>
      call.path.endsWith("/exists") ? ok({ exists: true }) : collectionInfo({ size: 768, distance: "Cosine" }),
    );
    assert.equal(await qdrant.ensureCollection("c", SPEC), "exists");
    assert.ok(calls.every((call) => call.method === "GET"));
  });

  it("fails on a wrong size and never recreates or deletes", async () => {
    const { qdrant, calls } = setup((call) =>
      call.path.endsWith("/exists") ? ok({ exists: true }) : collectionInfo({ size: 3072, distance: "Cosine" }),
    );
    await assert.rejects(qdrant.ensureCollection("c", SPEC), /size 3072.*size 768/s);
    assert.ok(calls.every((call) => call.method === "GET"));
  });

  it("fails on a wrong distance and on named vectors", async () => {
    const wrongDistance = setup((call) =>
      call.path.endsWith("/exists") ? ok({ exists: true }) : collectionInfo({ size: 768, distance: "Dot" }),
    );
    await assert.rejects(wrongDistance.qdrant.checkCollection("c", SPEC), /distance Dot/);

    const named = setup((call) =>
      call.path.endsWith("/exists") ? ok({ exists: true }) : collectionInfo({ default: { size: 768, distance: "Cosine" } }),
    );
    await assert.rejects(named.qdrant.checkCollection("c", SPEC), /named or unknown vectors/);
  });

  it("checkCollection reports a missing collection without creating it", async () => {
    const { qdrant, calls } = setup(() => ok({ exists: false }));
    assert.equal(await qdrant.checkCollection("c", SPEC), "missing");
    assert.equal(calls.length, 1);
  });
});

describe("points", () => {
  it("creates a keyword payload index and waits for it", async () => {
    const { qdrant, calls } = setup(() => ok({ status: "completed" }));
    await qdrant.ensurePayloadIndex("c", "visibility", "keyword");
    assert.equal(calls[0]!.method, "PUT");
    assert.equal(calls[0]!.path, "/collections/c/index?wait=true");
    assert.deepEqual(calls[0]!.body, { field_name: "visibility", field_schema: "keyword" });
  });

  it("upserts in batches with wait=true", async () => {
    const { qdrant, calls } = setup(() => ok({ status: "completed" }));
    const points = Array.from({ length: 5 }, (_, i) => ({ id: `id-${i}`, vector: [i], payload: { n: i } }));
    await qdrant.upsertPoints("c", points, { batchSize: 2 });
    assert.deepEqual(calls.map((call) => call.path), Array(3).fill("/collections/c/points?wait=true"));
    assert.deepEqual(calls.map((call) => call.body.points.length), [2, 2, 1]);
    assert.deepEqual(calls[0]!.body.points[0], { id: "id-0", vector: [0], payload: { n: 0 } });
  });

  it("scrolls through every page, asking only for the payload fields it needs", async () => {
    const pages = [
      ok({ points: [{ id: "a", payload: { record_id: "r1" } }, { id: "b", payload: { record_id: "r2" } }], next_page_offset: "c" }),
      ok({ points: [{ id: "c", payload: { record_id: "r3" } }], next_page_offset: null }),
    ];
    const { qdrant, calls } = setup((_, index) => pages[index]!);

    const points = await qdrant.scrollAll("c", { withPayload: ["record_id"], pageSize: 2 });

    assert.deepEqual(points.map((point) => point.id), ["a", "b", "c"]);
    assert.deepEqual(calls[0]!.body, { limit: 2, with_payload: ["record_id"], with_vector: false });
    assert.equal(calls[1]!.body.offset, "c");
    assert.equal(calls.length, 2);
  });

  it("stops if the offset does not advance instead of looping forever", async () => {
    const { qdrant, calls } = setup(() => ok({ points: [{ id: "a", payload: {} }], next_page_offset: "a" }));
    const points = await qdrant.scrollAll("c");
    assert.ok(points.length <= 2);
    assert.ok(calls.length <= 2);
  });

  it("deletes by id with wait=true, and does nothing for an empty list", async () => {
    const { qdrant, calls } = setup(() => ok({ status: "completed" }));
    await qdrant.deletePoints("c", []);
    assert.equal(calls.length, 0);
    await qdrant.deletePoints("c", ["a", "b"]);
    assert.equal(calls[0]!.path, "/collections/c/points/delete?wait=true");
    assert.deepEqual(calls[0]!.body, { points: ["a", "b"] });
  });

  it("counts exactly, optionally with a filter", async () => {
    const { qdrant, calls } = setup(() => ok({ count: 39 }));
    assert.equal(await qdrant.count("c"), 39);
    assert.deepEqual(calls[0]!.body, { exact: true });
    const filter = { must: [{ key: "visibility", match: { value: "public" } }] };
    await qdrant.count("c", filter);
    assert.deepEqual(calls[1]!.body, { exact: true, filter });
  });

  it("retrieves by id, and does nothing for an empty list", async () => {
    const { qdrant, calls } = setup(() => ok([{ id: "a", payload: { record_id: "r1" } }]));
    assert.deepEqual(await qdrant.retrieve("c", []), []);
    assert.equal(calls.length, 0);
    assert.deepEqual(await qdrant.retrieve("c", ["a"]), [{ id: "a", payload: { record_id: "r1" } }]);
    assert.equal(calls[0]!.path, "/collections/c/points");
    assert.deepEqual(calls[0]!.body, { ids: ["a"], with_payload: true, with_vector: false });
  });

  it("queries by vector with a filter and maps the scored points", async () => {
    const { qdrant, calls } = setup(() => ok({ points: [{ id: "a", score: 0.9, payload: { record_id: "r1" } }] }));
    const filter = { must: [{ key: "visibility", match: { value: "public" } }] };
    const hits = await qdrant.query("c", [0.1, 0.2], { filter, limit: 3 });
    assert.deepEqual(hits, [{ id: "a", score: 0.9, payload: { record_id: "r1" } }]);
    assert.equal(calls[0]!.path, "/collections/c/points/query");
    assert.deepEqual(calls[0]!.body, { query: [0.1, 0.2], limit: 3, with_payload: true, filter });
  });
});

describe("errors and retries", () => {
  it("retries a 503 and then succeeds", async () => {
    const { qdrant, calls, sleeps } = setup((_, index) => (index === 0 ? new Response("", { status: 503 }) : ok({ count: 1 })));
    assert.equal(await qdrant.count("c"), 1);
    assert.equal(calls.length, 2);
    assert.deepEqual(sleeps, [500]);
  });

  it("does not retry a 401 and keeps the key out of the message", async () => {
    const { qdrant, calls } = setup(() => new Response("Forbidden", { status: 401 }));
    await assert.rejects(qdrant.count("c"), (error: QdrantError) => {
      assert.equal(error.status, 401);
      assert.ok(!error.message.includes(API_KEY));
      return true;
    });
    assert.equal(calls.length, 1);
  });

  it("includes Qdrant's explanation for a 400, truncated and with the key redacted", async () => {
    const detail = `Wrong input: Vector dimension error: expected 768, got 3 ${API_KEY} ${"x".repeat(500)}`;
    const { qdrant } = setup(() => Response.json({ status: { error: detail } }, { status: 400 }));
    await assert.rejects(qdrant.upsertPoints("c", [{ id: "a", vector: [1], payload: {} }]), (error: QdrantError) => {
      assert.match(error.message, /expected 768, got 3/);
      assert.ok(!error.message.includes(API_KEY));
      assert.ok(error.message.length < 400);
      return true;
    });
  });

  it("explains a possibly suspended cluster on network failure, without leaking the key", async () => {
    const { qdrant } = setup(() => new TypeError(`fetch failed ${API_KEY}`), { maxRetries: 1 });
    await assert.rejects(qdrant.count("c"), (error: QdrantError) => {
      assert.match(error.message, /suspended/);
      assert.ok(!error.message.includes(API_KEY));
      return true;
    });
  });

  it("gives up after maxRetries on a persistent 429", async () => {
    const { qdrant, calls } = setup(() => new Response("", { status: 429 }), { maxRetries: 2 });
    await assert.rejects(qdrant.count("c"), (error: QdrantError) => error.status === 429);
    assert.equal(calls.length, 3);
  });
});
