import { env, SELF } from "cloudflare:test";
import { EmbeddingCache } from "@portfolio/rag";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientKey, createMemoryRateLimiter, createRateLimiter, limiterFromBinding, type RateLimiter } from "../src/rate-limit";
import { ORIGIN, chatRequest, readEvents, testEnv, workerWith } from "./helpers";

afterEach(() => vi.restoreAllMocks());

describe("memory rate limiter", () => {
  it("allows the limit, then refuses, per key", async () => {
    const limiter = createMemoryRateLimiter({ limit: 3, windowSeconds: 60 });

    expect([await limiter.check("a"), await limiter.check("a"), await limiter.check("a")]).toEqual([true, true, true]);
    expect(await limiter.check("a")).toBe(false);
    expect(await limiter.check("b")).toBe(true);
  });

  it("starts a new window once the old one has passed", async () => {
    let time = 1_000;
    const limiter = createMemoryRateLimiter({ limit: 1, windowSeconds: 60, now: () => time });

    expect(await limiter.check("a")).toBe(true);
    expect(await limiter.check("a")).toBe(false);
    time += 59_999;
    expect(await limiter.check("a")).toBe(false);
    time += 1;
    expect(await limiter.check("a")).toBe(true);
  });

  it("defaults to 10 requests per 60 seconds", async () => {
    const limiter = createMemoryRateLimiter();
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await limiter.check("ip"));
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results[10]).toBe(false);
  });

  it("forgets the oldest keys beyond maxKeys, so memory stays bounded", async () => {
    const limiter = createMemoryRateLimiter({ limit: 1, maxKeys: 2 });

    expect(await limiter.check("a")).toBe(true);
    expect(await limiter.check("a")).toBe(false);
    await limiter.check("b");
    await limiter.check("c"); // pushes "a" out
    expect(await limiter.check("a")).toBe(true);
  });
});

describe("binding adapter and key", () => {
  it("passes the key to the binding and returns its answer", async () => {
    const seen: string[] = [];
    const binding = { limit: async ({ key }: { key: string }) => (seen.push(key), { success: key !== "blocked" }) } as unknown as RateLimit;
    const limiter = limiterFromBinding(binding);

    expect(await limiter.check("1.2.3.4")).toBe(true);
    expect(await limiter.check("blocked")).toBe(false);
    expect(seen).toEqual(["1.2.3.4", "blocked"]);
  });

  it("allows the request and logs only the error type when the binding fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const binding = {
      limit: async () => {
        throw new TypeError("secret detail 9.9.9.9");
      },
    } as unknown as RateLimit;

    expect(await limiterFromBinding(binding).check("9.9.9.9")).toBe(true);
    const logged = String(warn.mock.calls[0]?.[0]);
    expect(logged).toContain("rate_limit_failed");
    expect(logged).toContain("TypeError");
    expect(logged).not.toContain("9.9.9.9");
  });

  it("uses the binding from env when it exists, and the memory fallback when it does not", async () => {
    let calls = 0;
    const binding = { limit: async () => (calls++, { success: false }) } as unknown as RateLimit;
    expect(await createRateLimiter({ CHAT_RATE_LIMITER: binding }).check("x")).toBe(false);
    expect(calls).toBe(1);

    expect(await createRateLimiter({}).check(`fallback-${Math.random()}`)).toBe(true);
  });

  it("takes the client key from CF-Connecting-IP, and falls back to 'unknown'", () => {
    expect(clientKey(new Request("https://example.com", { headers: { "CF-Connecting-IP": " 203.0.113.7 " } }))).toBe("203.0.113.7");
    expect(clientKey(new Request("https://example.com"))).toBe("unknown");
  });
});

describe("POST /api/chat rate limit", () => {
  const deny: RateLimiter = { check: async () => false };

  it("returns 429 rate_limited as JSON with Retry-After and CORS, and calls no upstream", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { worker, calls } = workerWith({}, { rateLimiter: deny });
    const response = await worker.fetch(chatRequest({ question: "hello" }, { Origin: ORIGIN, "CF-Connecting-IP": "198.51.100.9" }), testEnv);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(await response.json()).toMatchObject({ code: "rate_limited" });
    expect(calls).toEqual([]);

    const line = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toMatchObject({ event: "chat", status: 429, errorCode: "rate_limited" });
    expect(line).not.toContain("198.51.100.9");
    expect(line).not.toContain("hello");
  });

  it("counts before reading the body: a malformed request from a limited client is still 429", async () => {
    const { worker } = workerWith({}, { rateLimiter: deny });
    const response = await worker.fetch(chatRequest("{not json"), testEnv);
    expect(response.status).toBe(429);
  });

  it("keys the limit on the client IP", async () => {
    const keys: string[] = [];
    const { worker } = workerWith({}, { rateLimiter: { check: async (key) => (keys.push(key), true) } });

    await (await worker.fetch(chatRequest({ question: "hi" }, { "CF-Connecting-IP": "203.0.113.7" }), testEnv)).text();
    await (await worker.fetch(chatRequest({ question: "hi" }), testEnv)).text();
    expect(keys).toEqual(["203.0.113.7", "unknown"]);
  });

  it("does not count preflight requests", async () => {
    let checks = 0;
    const { worker } = workerWith({}, { rateLimiter: { check: async () => (checks++, true) } });
    const response = await worker.fetch(new Request("https://example.com/api/chat", { method: "OPTIONS", headers: { Origin: ORIGIN } }), testEnv);

    expect(response.status).toBe(204);
    expect(checks).toBe(0);
  });

  it("is wired to the real binding in the default Worker: the 11th request in a minute is refused", async () => {
    // Invalid bodies, so no upstream is reached. Only this file sends POSTs through SELF.
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const response = await SELF.fetch("https://example.com/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.55" },
        body: "{}",
      });
      statuses.push(response.status);
      await response.text();
    }

    expect(statuses.slice(0, 10).every((status) => status === 400)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    expect(env.CHAT_RATE_LIMITER).toBeDefined();
  });
});

describe("embedding cache in POST /api/chat", () => {
  const embedCalls = (calls: { url: string }[]) => calls.filter((call) => call.url.includes(":embedContent")).length;

  it("embeds a repeated question only once, even with different case and spacing", async () => {
    const { worker, calls } = workerWith();

    for (const question of ["What did Alex build?", "  what did ALEX   build? "]) {
      const events = await readEvents(await worker.fetch(chatRequest({ question }), testEnv));
      expect(events.at(-1)?.event).toBe("done");
      expect(events[0]!.data.degraded).toBe(false);
    }
    expect(embedCalls(calls)).toBe(1);

    await (await worker.fetch(chatRequest({ question: "A different question" }), testEnv)).text();
    expect(embedCalls(calls)).toBe(2);
  });

  it("does not answer from another worker's cache", async () => {
    const first = workerWith();
    const second = workerWith();
    await (await first.worker.fetch(chatRequest({ question: "Same question" }), testEnv)).text();
    await (await second.worker.fetch(chatRequest({ question: "Same question" }), testEnv)).text();

    expect(embedCalls(first.calls)).toBe(1);
    expect(embedCalls(second.calls)).toBe(1);
  });

  it("logs the cache counters, and never the question", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const cache = new EmbeddingCache();
    const { worker } = workerWith({}, { embeddingCache: cache });

    await (await worker.fetch(chatRequest({ question: "Repeated question about validation" }), testEnv)).text();
    await (await worker.fetch(chatRequest({ question: "Repeated question about validation" }), testEnv)).text();

    const lines = log.mock.calls.map((call) => String(call[0]));
    expect(JSON.parse(lines[1]!).embeddingCache).toEqual({ hits: 1, misses: 1, size: 1 });
    expect(lines.join("")).not.toContain("validation");
  });

  it("does not cache a failed embedding: the next request tries again", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache = new EmbeddingCache();
    const failing = workerWith({ embed: new Response("", { status: 400 }) }, { embeddingCache: cache });
    await (await failing.worker.fetch(chatRequest({ question: "Will it fail?" }), testEnv)).text();
    expect(cache.stats().size).toBe(0);
  });
});
