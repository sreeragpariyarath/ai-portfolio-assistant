import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkDisplay } from "./contact-links.ts";

describe("linkDisplay", () => {
  it("drops the scheme and www, and keeps the path", () => {
    assert.equal(linkDisplay("https://www.linkedin.com/in/example"), "linkedin.com/in/example");
    assert.equal(linkDisplay("https://github.com/example"), "github.com/example");
  });

  it("drops a trailing slash and a bare root path", () => {
    assert.equal(linkDisplay("https://example.com/"), "example.com");
    assert.equal(linkDisplay("https://example.com/in/me/"), "example.com/in/me");
  });

  it("returns the original text when it is not a valid address", () => {
    assert.equal(linkDisplay("not a url"), "not a url");
  });
});
