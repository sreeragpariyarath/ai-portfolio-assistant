import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chatUrl, resolveApiBaseUrl } from "./api-base-url.ts";

describe("resolveApiBaseUrl", () => {
  it("treats a missing, empty or blank value as same-origin", () => {
    assert.equal(resolveApiBaseUrl(undefined), "");
    assert.equal(resolveApiBaseUrl(""), "");
    assert.equal(resolveApiBaseUrl("   "), "");
  });

  it("accepts an http or https origin and drops any trailing slash", () => {
    assert.equal(resolveApiBaseUrl("http://localhost:8787"), "http://localhost:8787");
    assert.equal(resolveApiBaseUrl("http://localhost:8787/"), "http://localhost:8787");
    assert.equal(resolveApiBaseUrl("  https://api.example.com  "), "https://api.example.com");
  });

  it("rejects anything that is not a plain http(s) origin, with a message that names the variable", () => {
    for (const bad of [
      "localhost:8787",
      "not a url",
      "ftp://example.com",
      "javascript:alert(1)",
      "https://user:pass@example.com",
      "https://example.com/api",
      "https://example.com/?a=1",
      "https://example.com/#x",
    ]) {
      assert.throws(() => resolveApiBaseUrl(bad), /NEXT_PUBLIC_API_BASE_URL/, bad);
    }
  });

  it("never echoes the rejected value, which could carry credentials", () => {
    assert.throws(
      () => resolveApiBaseUrl("https://user:secret-password@example.com"),
      (error: Error) => !error.message.includes("secret-password"),
    );
  });
});

describe("chatUrl", () => {
  it("is a relative path when the base is empty and absolute otherwise", () => {
    assert.equal(chatUrl(""), "/api/chat");
    assert.equal(chatUrl("http://localhost:8787"), "http://localhost:8787/api/chat");
  });
});
