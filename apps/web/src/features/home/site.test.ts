import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_QUESTION_CHARS } from "../chat/chat-client.ts";
import { SITE, STARTERS } from "./site.ts";

describe("home page content", () => {
  it("greets the owner by name", () => {
    assert.equal(SITE.name, "sreerag");
    assert.equal(SITE.greeting, "Hey, I'm");
  });

  it("has the five starter chips of the design, in order", () => {
    assert.deepEqual(
      STARTERS.map((starter) => starter.label),
      ["Me", "Projects", "Skills", "Fun", "Contact"],
    );
  });

  it("gives every chip a unique id and a question the API accepts", () => {
    assert.equal(new Set(STARTERS.map((starter) => starter.id)).size, STARTERS.length);
    for (const { label, question } of STARTERS) {
      assert.equal(question, question.trim(), label);
      assert.ok(question.length >= 1 && question.length <= MAX_QUESTION_CHARS, label);
    }
  });

  it("never puts a phone number or salary in the visible text", () => {
    const text = JSON.stringify({ SITE, STARTERS });
    assert.doesNotMatch(text, /\+?\d{1,3}[-. ]\d{3}[-. ]\d{3}[-. ]\d{4}/);
    assert.doesNotMatch(text, /\b\d{2,3},\d{3}\b/);
  });
});
