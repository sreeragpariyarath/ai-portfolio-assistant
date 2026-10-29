import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkEnv } from "./lib/env.ts";

const VALID = {
  GEMINI_API_KEY: "test-gemini-key",
  QDRANT_URL: "https://example.cloud.qdrant.io:6333",
  QDRANT_API_KEY: "test-qdrant-key",
  QDRANT_COLLECTION: "portfolio_knowledge",
};

function statuses(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(checkEnv(env).map((check) => [check.name, check.status]));
}

describe("checkEnv", () => {
  it("passes when every variable is set and well formed", () => {
    assert.ok(checkEnv(VALID).every((check) => check.status === "ok"));
  });

  it("reports missing and blank variables", () => {
    const result = statuses({ ...VALID, GEMINI_API_KEY: undefined, QDRANT_API_KEY: "   " });
    assert.equal(result.GEMINI_API_KEY, "missing");
    assert.equal(result.QDRANT_API_KEY, "missing");
    assert.equal(result.QDRANT_URL, "ok");
  });

  it("rejects a Qdrant URL that is not https", () => {
    assert.equal(statuses({ ...VALID, QDRANT_URL: "http://localhost:6333" }).QDRANT_URL, "invalid");
    assert.equal(statuses({ ...VALID, QDRANT_URL: "not a url" }).QDRANT_URL, "invalid");
  });

  it("never includes secret values in its output", () => {
    const output = JSON.stringify(checkEnv({ ...VALID, QDRANT_URL: "http://secret-host" }));
    for (const secret of ["test-gemini-key", "test-qdrant-key", "secret-host"]) {
      assert.ok(!output.includes(secret), `output leaked ${secret}`);
    }
  });
});
