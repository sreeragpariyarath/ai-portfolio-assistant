const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRY_DELAY_MS = 30_000;

export interface RetryOptions {
  fetch: typeof fetch;
  timeoutMs: number;
  maxRetries: number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  // Statuses worth retrying. Defaults to 429 and 5xx; callers that prefer to fail over on 429 pass their own set.
  retryStatuses?: ReadonlySet<number>;
}

export function defaultSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(header: string | null): number | undefined {
  if (header === null) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

// Sends a request with a per-attempt timeout. 429/5xx responses and network errors are retried with
// exponential backoff plus jitter, honoring Retry-After. Returns the final response (which may be an
// error status the caller must map), or undefined if every attempt failed at the network level. The
// underlying network error is dropped on purpose so it cannot carry a URL, key or request text.
export async function sendWithRetry(
  url: string,
  init: Omit<RequestInit, "signal">,
  options: RetryOptions,
): Promise<Response | undefined> {
  for (let attempt = 0; ; attempt++) {
    let response: Response | undefined;
    try {
      response = await options.fetch(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs) });
    } catch {
      response = undefined;
    }

    if (response !== undefined && (response.ok || !(options.retryStatuses ?? RETRYABLE_STATUSES).has(response.status))) return response;
    if (attempt >= options.maxRetries) return response;

    const backoff = Math.min(500 * 2 ** attempt + options.random() * 250, MAX_RETRY_DELAY_MS);
    const requested = response === undefined ? undefined : retryAfterMs(response.headers.get("retry-after"));
    await options.sleep(Math.min(Math.max(backoff, requested ?? 0), MAX_RETRY_DELAY_MS));
  }
}
