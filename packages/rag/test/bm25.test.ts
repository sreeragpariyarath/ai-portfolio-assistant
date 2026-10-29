import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIndex, search, tokenize } from "@portfolio/rag";

describe("bm25", () => {
  const index = buildIndex([
    { id: "a", text: "TypeScript API for support" },
    { id: "b", text: "Python scripts for data" },
    { id: "c", text: "TypeScript web client" },
  ]);

  it("drops stopwords and punctuation", () => {
    assert.deepEqual(tokenize("What is the Next.js app?"), ["next", "js", "app"]);
  });

  it("ranks documents that match rarer terms higher", () => {
    assert.equal(search(index, "python", 3)[0]?.id, "b");
  });

  it("returns only documents that match", () => {
    assert.deepEqual(search(index, "rust", 3), []);
  });

  it("breaks score ties by id", () => {
    const hits = search(index, "typescript", 3).map((hit) => hit.id);
    assert.equal(hits[0], "a");
    assert.equal(hits[1], "c");
  });

  it("respects the limit", () => {
    assert.equal(search(index, "typescript", 1).length, 1);
  });
});
