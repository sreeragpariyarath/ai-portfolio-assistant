import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hybridSearch, rrf } from "@portfolio/rag";

const hits = (...ids: string[]) => ids.map((id, index) => ({ id, score: 100 - index }));

describe("rrf", () => {
  it("scores each id as the sum of 1 / (k + rank)", () => {
    const fused = rrf([["a", "b"], ["b", "c"]], { k: 60 });
    assert.deepEqual(fused.map((hit) => hit.id), ["b", "a", "c"]);
    assert.equal(fused[0]!.score, 1 / 62 + 1 / 61);
    assert.equal(fused[1]!.score, 1 / 61);
    assert.equal(fused[2]!.score, 1 / 62);
  });

  it("ranks an id found by both lists above one found by only one", () => {
    const fused = rrf([["x", "shared"], ["y", "shared"]]);
    assert.equal(fused[0]!.id, "shared");
  });

  it("breaks ties on best rank, then id, so the order is deterministic", () => {
    // a and b each appear once at rank 1; c and d each appear once at rank 2.
    assert.deepEqual(rrf([["b", "d"], ["a", "c"]]).map((hit) => hit.id), ["a", "b", "c", "d"]);
    assert.deepEqual(rrf([["a", "c"], ["b", "d"]]).map((hit) => hit.id), ["a", "b", "c", "d"]);
  });

  it("handles empty lists", () => {
    assert.deepEqual(rrf([]), []);
    assert.deepEqual(rrf([[], ["a"]]).map((hit) => hit.id), ["a"]);
  });

  it("counts a repeated id once per list, at its first position", () => {
    const fused = rrf([["a", "a", "b"]], { k: 0 });
    assert.deepEqual(fused, [
      { id: "a", score: 1 },
      { id: "b", score: 1 / 2 },
    ]);
  });

  it("lets a smaller k favour first places over agreement between lists", () => {
    const lists = [["top", "both"], ["other", "both"]];
    // k=0: top = other = 1 and both = 1/2 + 1/2 = 1; ties go to the better best rank, so both is last.
    assert.deepEqual(rrf(lists, { k: 0 }).map((hit) => hit.id), ["other", "top", "both"]);
    // k=60: top = 1/61, both = 2/62, so appearing in both lists wins.
    assert.equal(rrf(lists, { k: 60 })[0]!.id, "both");
  });

  it("rejects a negative or non-finite k", () => {
    assert.throws(() => rrf([["a"]], { k: -1 }), /k must be/);
    assert.throws(() => rrf([["a"]], { k: Number.NaN }), /k must be/);
  });
});

describe("hybridSearch", () => {
  it("fuses BM25 and dense rankings, ignoring their raw score scales", () => {
    const bm25 = [{ id: "a", score: 12.5 }, { id: "b", score: 3.1 }];
    const dense = [{ id: "b", score: 0.81 }, { id: "c", score: 0.79 }];
    assert.deepEqual(hybridSearch(bm25, dense).map((hit) => hit.id), ["b", "a", "c"]);
  });

  it("only uses the top `depth` candidates from each retriever", () => {
    const fused = hybridSearch(hits("a", "b", "deep"), hits("c", "d", "deep"), { depth: 2 });
    assert.ok(!fused.some((hit) => hit.id === "deep"));
  });

  it("returns at most `limit` results", () => {
    assert.equal(hybridSearch(hits("a", "b", "c"), hits("d", "e", "f"), { limit: 4 }).length, 4);
  });

  it("works when one retriever returns nothing", () => {
    assert.deepEqual(hybridSearch(hits("a", "b"), []).map((hit) => hit.id), ["a", "b"]);
  });

  it("rejects a depth or limit that is not a positive integer", () => {
    assert.throws(() => hybridSearch([], [], { depth: 0 }), /depth/);
    assert.throws(() => hybridSearch([], [], { limit: 1.5 }), /limit/);
  });
});
