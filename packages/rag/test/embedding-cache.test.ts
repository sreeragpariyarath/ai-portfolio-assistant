import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EmbeddingCache, cachedEmbedQuery, embeddingKey, normalizeQuestion } from "@portfolio/rag";

function counting(vector = [0.1, 0.2]) {
  const asked: string[] = [];
  return {
    asked,
    inner: {
      async embedQuery(question: string) {
        asked.push(question);
        return vector;
      },
    },
  };
}

describe("embedding cache", () => {
  it("skips the embedding call for a repeated question", async () => {
    const { inner, asked } = counting();
    const embed = cachedEmbedQuery(inner, { model: "m", dims: 2, cache: new EmbeddingCache() });

    assert.deepEqual(await embed("What did Alex build?"), [0.1, 0.2]);
    assert.deepEqual(await embed("What did Alex build?"), [0.1, 0.2]);
    assert.equal(asked.length, 1);
  });

  it("treats case, extra spaces and surrounding whitespace as the same question", async () => {
    const { inner, asked } = counting();
    const embed = cachedEmbedQuery(inner, { model: "m", dims: 2, cache: new EmbeddingCache() });

    await embed("What did Alex build?");
    await embed("  what   did ALEX build?  ");
    assert.equal(asked.length, 1);
    assert.equal(normalizeQuestion("  A   B\n c "), "a b c");
  });

  it("does not share a vector between models or dimensions", async () => {
    assert.notEqual(await embeddingKey("m1", 768, "q"), await embeddingKey("m2", 768, "q"));
    assert.notEqual(await embeddingKey("m", 768, "q"), await embeddingKey("m", 512, "q"));
    assert.equal(await embeddingKey("m", 768, "q"), await embeddingKey("m", 768, " Q "));
  });

  it("keys are hashes: the question text is never part of what is stored", async () => {
    const key = await embeddingKey("m", 768, "What is the salary of Alex?");
    assert.match(key, /^[0-9a-f]{64}$/);
    assert.ok(!key.includes("salary"));
  });

  it("shares one call between identical questions asked at the same time", async () => {
    let calls = 0;
    const inner = {
      async embedQuery() {
        calls++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return [1];
      },
    };
    const embed = cachedEmbedQuery(inner, { model: "m", dims: 1, cache: new EmbeddingCache() });

    const results = await Promise.all([embed("same question"), embed("Same question"), embed("same question ")]);
    assert.equal(calls, 1);
    assert.deepEqual(results, [[1], [1], [1]]);
  });

  it("does not cache a failure", async () => {
    let calls = 0;
    const inner = {
      async embedQuery() {
        calls++;
        if (calls === 1) throw new Error("upstream down");
        return [7];
      },
    };
    const cache = new EmbeddingCache();
    const embed = cachedEmbedQuery(inner, { model: "m", dims: 1, cache });

    await assert.rejects(embed("q"), /upstream down/);
    assert.equal(cache.stats().size, 0);
    assert.deepEqual(await embed("q"), [7]);
    assert.equal(calls, 2);
  });

  it("evicts the least recently used entry when full", async () => {
    const { inner, asked } = counting();
    const cache = new EmbeddingCache(2);
    const embed = cachedEmbedQuery(inner, { model: "m", dims: 2, cache });

    await embed("a");
    await embed("b");
    await embed("a"); // a is now more recent than b
    await embed("c"); // evicts b
    assert.equal(cache.stats().size, 2);

    asked.length = 0;
    await embed("a");
    await embed("c");
    assert.deepEqual(asked, []);
    await embed("b");
    assert.deepEqual(asked, ["b"]);
  });

  it("counts hits and misses", async () => {
    const { inner } = counting();
    const cache = new EmbeddingCache();
    const embed = cachedEmbedQuery(inner, { model: "m", dims: 2, cache });

    await embed("a");
    await embed("a");
    await embed("b");
    assert.deepEqual(cache.stats(), { hits: 1, misses: 2, size: 2 });
  });

  it("rejects a bad size", () => {
    assert.throws(() => new EmbeddingCache(0));
    assert.throws(() => new EmbeddingCache(1.5));
  });
});
