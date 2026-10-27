
import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

describe("AI Portfolio Assistant API", () => {
  it("returns a healthy status from GET /api/health", async () => {
    const response = await SELF.fetch(
      "https://example.com/api/health",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/json",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "ok",
      service: "ai-portfolio-assistant-api",
    });
  });

  it("rejects unsupported methods on /api/health", async () => {
    const response = await SELF.fetch(
      "https://example.com/api/health",
      { method: "POST" },
    );

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({
      error: "Method not allowed",
      allowedMethods: ["GET"],
    });
  });

  it("returns 404 for unknown paths", async () => {
    const response = await SELF.fetch(
      "https://example.com/unknown",
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Not found",
    });
  });
});
