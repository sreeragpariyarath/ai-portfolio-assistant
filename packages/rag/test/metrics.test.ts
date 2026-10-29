import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recallAtK } from "@portfolio/rag";

describe("recallAtK", () => {
  it("counts expected ids found in the top k", () => {
    assert.equal(recallAtK(["a", "b"], ["a", "x", "b"], 2), 0.5);
    assert.equal(recallAtK(["a", "b"], ["a", "x", "b"], 3), 1);
  });

  it("is undefined when no evidence is expected", () => {
    assert.throws(() => recallAtK([], ["a"], 5));
  });
});
