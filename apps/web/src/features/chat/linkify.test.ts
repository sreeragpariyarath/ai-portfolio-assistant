import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkify } from "./linkify.ts";

describe("linkify", () => {
  it("links emails and bare addresses and leaves the sentence punctuation out", () => {
    assert.deepEqual(linkify("Mail me at a.b@gmail.com, or see linkedin.com/in/sreerag-p or github.com/sreeragpariyarath."), [
      { type: "text", text: "Mail me at " },
      { type: "link", text: "a.b@gmail.com", href: "mailto:a.b@gmail.com" },
      { type: "text", text: ", or see " },
      { type: "link", text: "linkedin.com/in/sreerag-p", href: "https://linkedin.com/in/sreerag-p" },
      { type: "text", text: " or " },
      { type: "link", text: "github.com/sreeragpariyarath", href: "https://github.com/sreeragpariyarath" },
      { type: "text", text: "." },
    ]);
  });
  it("keeps full urls and ignores plain words", () => {
    assert.deepEqual(linkify("See https://example.com/x. Node.js e.g. is fine"), [
      { type: "text", text: "See " },
      { type: "link", text: "https://example.com/x", href: "https://example.com/x" },
      { type: "text", text: ". Node.js e.g. is fine" },
    ]);
  });
});
