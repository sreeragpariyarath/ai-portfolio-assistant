import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// Proves the settings in wrangler.jsonc reach the Worker's `env`. Secrets are not checked here:
// they come from apps/api/.dev.vars locally and from `wrangler secret put` when deployed, so CI has none.
describe("Worker env", () => {
  it("exposes the non-secret settings from wrangler.jsonc", () => {
    expect(env.QDRANT_COLLECTION).toBe("portfolio_knowledge");
    expect(env.GEMINI_MODEL).toBe("gemini-3.5-flash-lite");
    expect(env.EMBEDDING_MODEL).toBe("gemini-embedding-2");
    expect(env.ALLOWED_ORIGIN).toBe("http://localhost:3000");
  });

  it("keeps ALLOWED_ORIGIN a plain origin: no path, no wildcard", () => {
    const url = new URL(env.ALLOWED_ORIGIN);
    expect(url.origin).toBe(env.ALLOWED_ORIGIN);
    expect(env.ALLOWED_ORIGIN).not.toContain("*");
  });
});
