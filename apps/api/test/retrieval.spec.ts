import { afterEach, describe, expect, it, vi } from "vitest";
import { search } from "@portfolio/rag";
import corpusFile from "../src/generated/public-corpus.json";
import { createCorpus, createDenseSearcher, retrieve } from "../src/retrieval";

// Mocked upstreams only: nothing here calls Gemini or Qdrant.
const records = (corpusFile as { records: Parameters<typeof createCorpus>[0] }).records;
const corpus = createCorpus(records);
const QUESTION = "What did Alex personally implement on the support assistant?";

afterEach(() => vi.restoreAllMocks());

describe("retrieve", () => {
  it("returns at most 8 public records, with only the allowed fields", async () => {
    const result = await retrieve(QUESTION, async () => []);

    expect(result.records.length).toBeGreaterThan(0);
    expect(result.records.length).toBeLessThanOrEqual(8);
    for (const record of result.records) {
      expect(Object.keys(record).every((key) => ["id", "type", "title", "verificationStatus", "validUntil", "content"].includes(key))).toBe(true);
      expect(corpus.records.has(record.id)).toBe(true);
    }
  });

  it("keeps validUntil for records that have one", async () => {
    const expiring = records.find((record) => record.validUntil !== undefined);
    expect(expiring).toBeDefined();
    const result = await retrieve(expiring!.title, async () => [{ id: expiring!.id, score: 1 }]);
    const found = result.records.find((record) => record.id === expiring!.id);
    expect(found?.validUntil).toBe(expiring!.validUntil);
  });

  it("never lets a private record reach the context, even if Qdrant returns one", async () => {
    const result = await retrieve(QUESTION, async () => [
      { id: "private-demo-001", score: 0.99 },
      { id: "contribution-demo-001", score: 0.5 },
    ]);

    expect(result.records.map((record) => record.id)).not.toContain("private-demo-001");
    expect(result.counts.droppedDense).toBe(1);
    expect(JSON.stringify(result.records)).not.toContain("private-demo-001");
    expect(corpus.records.has("private-demo-001")).toBe(false);
  });

  it("drops a Qdrant hit that is missing from the bundled corpus and keeps the rest", async () => {
    const result = await retrieve(QUESTION, async () => [
      { id: "not-in-corpus-999", score: 0.9 },
      { id: "contribution-demo-002", score: 0.8 },
    ]);

    expect(result.records.map((record) => record.id)).not.toContain("not-in-corpus-999");
    expect(result.records.map((record) => record.id)).toContain("contribution-demo-002");
    expect(result.counts).toMatchObject({ dense: 1, droppedDense: 1 });
    expect(result.degraded).toBe(false);
  });

  it("fuses dense hits with BM25: a dense-only record joins the context", async () => {
    const bm25Ids = new Set(search(corpus.index, QUESTION, 20).map((hit) => hit.id));
    const denseOnly = records.find((record) => !bm25Ids.has(record.id));
    expect(denseOnly).toBeDefined();

    const result = await retrieve(QUESTION, async () => [{ id: denseOnly!.id, score: 1 }]);
    expect(result.records.map((record) => record.id)).toContain(denseOnly!.id);
  });

  it("falls back to BM25 when dense search fails, and logs no question text", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await retrieve(QUESTION, async () => {
      throw new Error(`upstream said: ${QUESTION}`);
    });

    const expected = search(corpus.index, QUESTION, 8).map((hit) => hit.id);
    expect(result.degraded).toBe(true);
    expect(result.records.map((record) => record.id)).toEqual(expected);
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0]?.[0]);
    expect(logged).toContain("dense_search_failed");
    expect(logged).not.toContain("support assistant");
  });

  it("returns an empty context, not an error, when nothing matches", async () => {
    const result = await retrieve("zzzqqq xxxyyy", async () => []);
    expect(result.records).toEqual([]);
    expect(result.counts.context).toBe(0);
  });
});

describe("createDenseSearcher", () => {
  it("embeds the question, queries Qdrant with the public-only filter, and returns record ids", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, body });
      if (url.includes(":embedContent")) {
        return Response.json({ embedding: { values: new Array(768).fill(0.01) } });
      }
      return Response.json({
        result: {
          points: [
            { id: "p1", score: 0.9, payload: { record_id: "contribution-demo-001", visibility: "public" } },
            { id: "p2", score: 0.8, payload: { record_id: "private-demo-001", visibility: "private" } },
          ],
        },
      });
    }) as typeof fetch;

    const dense = createDenseSearcher(
      {
        GEMINI_API_KEY: "test-key",
        EMBEDDING_MODEL: "gemini-embedding-2",
        QDRANT_URL: "https://qdrant.example:6333",
        QDRANT_API_KEY: "test-qdrant-key",
        QDRANT_COLLECTION: "portfolio_knowledge",
      },
      { fetch: fakeFetch },
    );

    const hits = await dense(QUESTION);

    expect(hits.map((hit) => hit.id)).toEqual(["contribution-demo-001"]);
    const qdrantCall = calls.find((call) => call.url.includes("/points/query"));
    expect(JSON.stringify(qdrantCall?.body)).toContain('"visibility"');
    expect(JSON.stringify(qdrantCall?.body)).toContain('"public"');
  });
});
