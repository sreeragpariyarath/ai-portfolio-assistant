import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PUBLIC_ONLY_FILTER, denseSearch, denseSearchByVector } from "@portfolio/rag";
import type { DenseDeps, ScoredPoint } from "@portfolio/rag";

function fakeDeps(points: ScoredPoint[]) {
  const calls: { question?: string; collection?: string; vector?: number[]; options?: unknown }[] = [];
  const deps: DenseDeps = {
    collection: "portfolio_knowledge",
    gemini: {
      async embedQuery(question) {
        calls.push({ question });
        return [0.1, 0.2, 0.3];
      },
    },
    qdrant: {
      async query(collection, vector, options) {
        calls.push({ collection, vector, options });
        return points;
      },
    },
  };
  return { deps, calls };
}

const point = (recordId: unknown, score: number, visibility = "public"): ScoredPoint => ({
  id: `uuid-${String(recordId)}`,
  score,
  payload: { record_id: recordId, visibility },
});

describe("denseSearch", () => {
  it("embeds the question and returns record ids with scores, best first", async () => {
    const { deps, calls } = fakeDeps([point("a", 0.9), point("b", 0.7)]);
    const hits = await denseSearch(deps, "What does Alex build?");
    assert.deepEqual(hits, [
      { id: "a", score: 0.9 },
      { id: "b", score: 0.7 },
    ]);
    assert.equal(calls[0]!.question, "What does Alex build?");
    assert.deepEqual(calls[1]!.vector, [0.1, 0.2, 0.3]);
    assert.equal(calls[1]!.collection, "portfolio_knowledge");
  });

  it("always sends the public-only filter and the limit", async () => {
    const { deps, calls } = fakeDeps([]);
    await denseSearch(deps, "q", { limit: 7 });
    assert.deepEqual(calls[1]!.options, { filter: PUBLIC_ONLY_FILTER, limit: 7, withPayload: true });
    assert.deepEqual(PUBLIC_ONLY_FILTER, { must: [{ key: "visibility", match: { value: "public" } }] });
  });

  it("drops points without a record id or not marked public", async () => {
    const { deps } = fakeDeps([point("a", 0.9), point(undefined, 0.8), point("secret", 0.7, "private"), point("b", 0.6)]);
    const hits = await denseSearch(deps, "q");
    assert.deepEqual(hits.map((hit) => hit.id), ["a", "b"]);
  });

  it("searches with a precomputed vector without calling Gemini", async () => {
    const { deps, calls } = fakeDeps([point("a", 0.5)]);
    const hits = await denseSearchByVector(deps.qdrant, deps.collection, [1, 0, 0], { limit: 3 });
    assert.deepEqual(hits, [{ id: "a", score: 0.5 }]);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]!.vector, [1, 0, 0]);
  });
});
