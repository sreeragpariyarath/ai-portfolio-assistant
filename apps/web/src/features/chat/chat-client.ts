import { MalformedEventError, decodeChatEvent } from "./chat-events.ts";
import type { ChatEvent } from "./chat-events.ts";
import { CHAT_URL } from "./config.ts";
import { createSseParser } from "./sse.ts";

// The browser side of POST /api/chat. It asks one question and yields the typed events as they
// arrive. Every failure becomes a ChatClientError with a code and a fixed, friendly message: server
// text (`error` in a JSON body, `message` in an `error` event) is never shown to visitors.

// Same limits as the API (apps/api/src/chat-request.ts), checked here first so a bad question does
// not use up one of the visitor's rate-limited requests. The API counts UTF-16 units, like `.length`.
export const MAX_QUESTION_CHARS = 500;

export type ChatErrorCode =
  | "invalid_question"
  | "rate_limited"
  | "demo_busy"
  | "timeout"
  | "upstream_unavailable"
  | "prompt_blocked"
  | "payload_too_large"
  | "bad_request"
  | "network"
  | "bad_response"
  | "stream_interrupted"
  | "internal_error";

const MESSAGES: Record<ChatErrorCode, string> = {
  invalid_question: `Please ask a question of 1 to ${MAX_QUESTION_CHARS} characters.`,
  rate_limited: "Too many questions in a short time. Please wait a moment and try again.",
  demo_busy: "The demo is busy right now. Please try again in a minute.",
  timeout: "The answer took too long. Please try again.",
  upstream_unavailable: "The answer service is unavailable. Please try again later.",
  prompt_blocked: "This question could not be answered. Try rephrasing it.",
  payload_too_large: `Please ask a shorter question (up to ${MAX_QUESTION_CHARS} characters).`,
  bad_request: "That question could not be sent. Please try again.",
  network: "Could not reach the server. Check your connection and try again.",
  bad_response: "The server sent a reply this page could not read. Please try again.",
  stream_interrupted: "The answer was cut off. Please try again.",
  internal_error: "Something went wrong. Please try again.",
};

const CODES = new Set<string>(Object.keys(MESSAGES));

// Maps a code received from the server (an HTTP error body or an `error` event) to one this client
// knows. An unknown code falls back to a generic one, never to the server's own wording.
export function normalizeErrorCode(code: string, fallback: ChatErrorCode = "internal_error"): ChatErrorCode {
  return CODES.has(code) ? (code as ChatErrorCode) : fallback;
}

export function friendlyMessage(code: ChatErrorCode, retryAfterSeconds?: number): string {
  if ((code === "rate_limited" || code === "demo_busy") && retryAfterSeconds !== undefined) {
    return `${MESSAGES[code]} (about ${retryAfterSeconds} seconds)`;
  }
  return MESSAGES[code];
}

export class ChatClientError extends Error {
  readonly code: ChatErrorCode;
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(code: ChatErrorCode, details: { status?: number; retryAfterSeconds?: number } = {}) {
    super(friendlyMessage(code, details.retryAfterSeconds));
    this.name = "ChatClientError";
    this.code = code;
    this.status = details.status;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}

// A cancelled request is not a failure to show: the visitor asked a new question or left the page.
export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

// Only whole seconds, as the API sends. An HTTP date or anything odd is ignored.
function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d{1,4}$/.test(value.trim())) return undefined;
  const seconds = Number(value.trim());
  return seconds >= 1 && seconds <= 3600 ? seconds : undefined;
}

function codeFromStatus(status: number): ChatErrorCode {
  if (status === 429) return "rate_limited";
  if (status === 413) return "payload_too_large";
  if (status === 400 || status === 415) return "bad_request";
  if (status >= 500) return "upstream_unavailable";
  return "internal_error";
}

async function errorFromResponse(response: Response): Promise<ChatClientError> {
  let code = codeFromStatus(response.status);
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && typeof (body as { code?: unknown }).code === "string") {
      // The API's own codes win over the status when they are ones we know. 400 and 413 bodies carry
      // invalid_json, invalid_body and so on, which are not worth separate messages here.
      code = normalizeErrorCode((body as { code: string }).code, code);
    }
  } catch {
    // Not JSON (for example an HTML error page from a proxy): the status alone decides.
  }
  const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
  return new ChatClientError(code, {
    status: response.status,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  });
}

export interface AskOptions {
  signal?: AbortSignal;
  // Defaults to the configured chat URL; tests pass their own.
  url?: string;
  // Defaults to the global fetch; tests pass a mock.
  fetch?: typeof fetch;
}

// Asks one question and yields its events: `meta`, then `token`s, then `done`. A server `error` event
// is yielded like any other and ends the stream. Throws ChatClientError for everything that goes
// wrong before or during the stream, and the browser's AbortError when `signal` is aborted.
export async function* askQuestion(question: string, options: AskOptions = {}): AsyncGenerator<ChatEvent, void, void> {
  const { signal, url = CHAT_URL, fetch: doFetch = fetch } = options;

  const trimmed = question.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_QUESTION_CHARS) throw new ChatClientError("invalid_question");

  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ question: trimmed }),
      ...(signal !== undefined ? { signal } : {}),
    });
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw error;
    throw new ChatClientError("network");
  }

  if (!response.ok) throw await errorFromResponse(response);

  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("text/event-stream") || response.body === null) {
    await response.body?.cancel().catch(() => undefined);
    throw new ChatClientError("bad_response", { status: response.status });
  }

  const reader = response.body.getReader();
  const parser = createSseParser();
  let finished = false;
  let sawEnd = false;

  function decode(frames: ReturnType<typeof parser.push>): ChatEvent[] {
    const events: ChatEvent[] = [];
    for (const frame of frames) {
      let event: ChatEvent | null;
      try {
        event = decodeChatEvent(frame);
      } catch (error) {
        if (error instanceof MalformedEventError) throw new ChatClientError("bad_response", { status: response.status });
        throw error;
      }
      if (event === null) continue;
      if (event.type === "done" || event.type === "error") sawEnd = true;
      events.push(event);
    }
    return events;
  }

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (signal?.aborted || isAbortError(error)) throw error;
        throw new ChatClientError("stream_interrupted");
      }
      if (chunk.done) break;
      for (const event of decode(parser.push(chunk.value))) {
        yield event;
        // `done` and `error` end the answer; the finally block then releases the connection.
        if (event.type === "done" || event.type === "error") return;
      }
    }

    const end = parser.finish();
    for (const event of decode(end.frames)) yield event;
    finished = true;
    if (end.incomplete || !sawEnd) throw new ChatClientError("stream_interrupted");
  } finally {
    // Releases the connection after `done` or `error`, when the consumer stops early, when the
    // visitor cancels, or when something fails. Nothing to release once the stream has ended.
    if (!finished) await reader.cancel().catch(() => undefined);
  }
}
