import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

const URL_CHAT = "https://example.com/api/chat";
const ORIGIN = "http://localhost:3000"; // ALLOWED_ORIGIN in wrangler.jsonc

function post(body: BodyInit | null, headers: Record<string, string> = {}) {
  return SELF.fetch(URL_CHAT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

function postJson(value: unknown, headers: Record<string, string> = {}) {
  return post(JSON.stringify(value), headers);
}

describe("POST /api/chat request validation", () => {
  it("accepts a valid question (the answer itself arrives in task 3.7)", async () => {
    const response = await postJson({ question: "  What has Alex built?  " });

    expect(response.status).toBe(501);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "Not implemented",
      code: "not_implemented",
    });
  });

  it("accepts a question of exactly 500 characters and rejects 501", async () => {
    expect((await postJson({ question: "a".repeat(500) })).status).toBe(501);

    const response = await postJson({ question: "a".repeat(501) });
    expect(response.status).toBe(400);
    expect((await response.json()) as { code: string }).toMatchObject({
      code: "invalid_question",
    });
  });

  it.each([
    ["missing question", {}],
    ["non-string question", { question: 42 }],
    ["empty question", { question: "" }],
    ["whitespace-only question", { question: "   \n\t " }],
  ])("returns 400 invalid_question for a %s", async (_name, body) => {
    const response = await postJson(body);

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()) as { code: string }).toMatchObject({
      code: "invalid_question",
    });
  });

  it.each([
    ["an array", "[]"],
    ["a string", '"hello"'],
    ["null", "null"],
  ])("returns 400 invalid_body when the body is %s", async (_name, raw) => {
    const response = await post(raw);

    expect(response.status).toBe(400);
    expect((await response.json()) as { code: string }).toMatchObject({
      code: "invalid_body",
    });
  });

  it("returns 400 invalid_json for malformed JSON, an empty body and invalid UTF-8", async () => {
    for (const body of [
      "{not json",
      "",
      new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]),
    ]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect((await response.json()) as { code: string }).toMatchObject({
        code: "invalid_json",
      });
    }
  });

  it("returns 415 when the content type is not JSON", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded"]) {
      const response = await post('{"question":"hi"}', { "Content-Type": type });
      expect(response.status).toBe(415);
      expect((await response.json()) as { code: string }).toMatchObject({
        code: "unsupported_media_type",
      });
    }
  });

  it("accepts application/json with a charset parameter", async () => {
    const response = await post('{"question":"hi"}', {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(response.status).toBe(501);
  });

  it("returns 413 for a body over 4 KB", async () => {
    const response = await postJson({ question: "a".repeat(5000) });

    expect(response.status).toBe(413);
    expect((await response.json()) as { code: string }).toMatchObject({
      code: "payload_too_large",
    });
  });

  it("returns 413 for an oversized streamed body with no Content-Length", async () => {
    const chunk = new TextEncoder().encode("x".repeat(1024));
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
    });

    const response = await SELF.fetch(URL_CHAT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stream,
      // @ts-expect-error `duplex` is required for streamed request bodies but is not in the DOM types
      duplex: "half",
    });

    expect(response.status).toBe(413);
  });

  it("returns 405 with an Allow header for other methods", async () => {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const response = await SELF.fetch(URL_CHAT, { method });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST, OPTIONS");
      expect(await response.json()).toEqual({
        error: "Method not allowed",
        allowedMethods: ["POST", "OPTIONS"],
      });
    }
  });
});

describe("POST /api/chat CORS", () => {
  it("answers the preflight for the allowed origin", async () => {
    const response = await SELF.fetch(URL_CHAT, {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "POST, OPTIONS",
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Content-Type",
    );
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("gives another origin no CORS permission", async () => {
    const response = await SELF.fetch(URL_CHAT, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-methods")).toBeNull();
  });

  it("adds the CORS header to success-path and error responses for the allowed origin only", async () => {
    const ok = await postJson({ question: "hi" }, { Origin: ORIGIN });
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);

    const bad = await postJson({ question: "" }, { Origin: ORIGIN });
    expect(bad.status).toBe(400);
    expect(bad.headers.get("access-control-allow-origin")).toBe(ORIGIN);

    const other = await postJson(
      { question: "hi" },
      { Origin: "https://evil.example" },
    );
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
    expect(other.headers.get("vary")).toContain("Origin");
  });

  it("never sends a wildcard origin", async () => {
    const response = await postJson({ question: "hi" }, { Origin: ORIGIN });
    expect(response.headers.get("access-control-allow-origin")).not.toBe("*");
  });
});
