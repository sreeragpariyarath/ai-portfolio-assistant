import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// Proves the settings in wrangler.jsonc reach the Worker's `env`. Secrets are not checked here:
// they come from apps/api/.dev.vars locally and from `wrangler secret put` when deployed, so CI has none.
describe("Worker env", () => {
  it("exposes the non-secret settings from wrangler.jsonc", () => {
    expect(env.QDRANT_COLLECTION).toBe("portfolio_knowledge");
    expect(env.GEMINI_MODEL).toBe("gemini-3.1-flash-lite");
    expect(env.GEMINI_FALLBACK_MODEL).toBe("gemini-3.5-flash-lite");
    expect(env.EMBEDDING_MODEL).toBe("gemini-embedding-2");
    expect(env.ALLOWED_ORIGIN).toBe("https://sreerag.pariyarath.workers.dev http://localhost:3000");
  });

  it("keeps every ALLOWED_ORIGIN entry a plain origin: no path, no wildcard", () => {
    const origins = env.ALLOWED_ORIGIN.split(/\s+/).filter(Boolean);
    expect(origins.length).toBeGreaterThan(0);
    for (const origin of origins) {
      expect(new URL(origin).origin).toBe(origin);
      expect(origin).not.toContain("*");
    }
  });
});
