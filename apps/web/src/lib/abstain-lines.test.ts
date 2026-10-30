import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ABSTAIN_LINES, pickAbstainLine, withoutFirstSentence } from "./abstain-lines.ts";

describe("ABSTAIN_LINES", () => {
  it("has thirteen distinct, short, claim-free lines", () => {
    assert.equal(ABSTAIN_LINES.length, 13);
    assert.equal(new Set(ABSTAIN_LINES).size, ABSTAIN_LINES.length);
    for (const line of ABSTAIN_LINES) {
      assert.ok(line.length > 20 && line.length <= 120, line);
      assert.equal(line, line.trim());
      assert.doesNotMatch(line, /\b(sreerag|alex|morgan)\b/i, line);
      assert.doesNotMatch(line, /\d/, line);
    }
  });
});

describe("pickAbstainLine", () => {
  it("gives the same line for the same message and spreads across messages", () => {
    assert.equal(pickAbstainLine("answer-3"), pickAbstainLine("answer-3"));
    const used = new Set(Array.from({ length: 60 }, (_, i) => pickAbstainLine(`answer-${i + 1}`)));
    assert.ok(used.size >= 8, `only ${used.size} different lines`);
    for (const line of used) assert.ok(ABSTAIN_LINES.includes(line));
  });
});

describe("withoutFirstSentence", () => {
  it("drops the model's own opening sentence and keeps the offer that follows", () => {
    assert.equal(withoutFirstSentence("I do not have that. I can talk about projects."), "I can talk about projects.");
    assert.equal(withoutFirstSentence("No idea! Ask me about skills. Or projects."), "Ask me about skills. Or projects.");
  });

  it("shows nothing while the first sentence is still arriving, and nothing when it is the only one", () => {
    assert.equal(withoutFirstSentence("I do not have"), "");
    assert.equal(withoutFirstSentence("I do not have that."), "");
    assert.equal(withoutFirstSentence(""), "");
  });
});
