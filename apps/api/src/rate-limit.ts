// Per-client rate limit for POST /api/chat (Phase 3 task 3.8, D-015). The Workers Rate Limiting binding is
// used when it exists; otherwise a best-effort in-memory counter (per isolate, reset when it restarts).
// The real protection of the Gemini quota is still the `demo_busy` answer when Gemini returns 429.

export const RATE_LIMIT = 10;
export const RATE_WINDOW_SECONDS = 60;

export interface RateLimiter {
  // True when the request may go ahead.
  check(key: string): Promise<boolean>;
}

// The client IP is the only key available (there are no accounts). It is used for counting only and is never logged.
export function clientKey(request: Request): string {
  const address = request.headers.get("CF-Connecting-IP")?.trim();
  return address ? address : "unknown";
}

export interface MemoryLimiterOptions {
  limit?: number;
  windowSeconds?: number;
  // Oldest keys are dropped beyond this, so many different clients cannot grow memory without bound.
  maxKeys?: number;
  now?: () => number;
}

// Fixed window per key. Approximate by design, like the binding.
export function createMemoryRateLimiter({
  limit = RATE_LIMIT,
  windowSeconds = RATE_WINDOW_SECONDS,
  maxKeys = 1000,
  now = Date.now,
}: MemoryLimiterOptions = {}): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  const windowMs = windowSeconds * 1000;

  return {
    async check(key) {
      const time = now();
      const current = windows.get(key);
      if (current === undefined || time - current.start >= windowMs) {
        windows.delete(key);
        windows.set(key, { start: time, count: 1 });
        while (windows.size > maxKeys) {
          const oldest = windows.keys().next().value;
          if (oldest === undefined) break;
          windows.delete(oldest);
        }
        return true;
      }
      current.count++;
      return current.count <= limit;
    },
  };
}

// A binding error must not take the endpoint down: allow the request and log the error type only.
export function limiterFromBinding(binding: RateLimit): RateLimiter {
  return {
    async check(key) {
      try {
        const { success } = await binding.limit({ key });
        return success;
      } catch (error) {
        console.warn(JSON.stringify({ event: "rate_limit_failed", error: error instanceof Error ? error.name : "unknown" }));
        return true;
      }
    },
  };
}

const fallbackLimiter = createMemoryRateLimiter();

export function createRateLimiter(env: Pick<Partial<Env>, "CHAT_RATE_LIMITER">): RateLimiter {
  return env.CHAT_RATE_LIMITER ? limiterFromBinding(env.CHAT_RATE_LIMITER) : fallbackLimiter;
}
