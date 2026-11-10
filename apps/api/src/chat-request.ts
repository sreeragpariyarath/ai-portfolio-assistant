// Validation for POST /api/chat (Phase 3 task 3.3). Pure request handling: no upstream calls.
//
// Body: { question, history?, compact?, summary? } (D-041). `history` is the latest turns of the chat, `compact`
// the older turns the browser wants folded into the summary, `summary` the notes it holds about even older turns.
// All three are optional, so a plain { question } still works exactly as before.
import {
  MAX_COMPACT_TURNS,
  MAX_HISTORY_TURNS,
  MAX_SUMMARY_CHARS,
  cleanSummary,
  cleanTurns,
  type Turn,
} from "@portfolio/rag";

// Room for 8 + 8 turns of up to 1,500 characters, even in a script that needs three bytes per character.
export const MAX_BODY_BYTES = 48 * 1024;
export const MAX_QUESTION_CHARS = 500;
// A single turn longer than this is not a chat turn; shorter long text is cut, not rejected.
const MAX_RAW_TURN_CHARS = 6_000;

export type ChatRequestError = {
  status: 400 | 413 | 415;
  code:
    | "unsupported_media_type"
    | "payload_too_large"
    | "invalid_json"
    | "invalid_body"
    | "invalid_question"
    | "invalid_history";
  error: string;
};

export interface ChatInput {
  question: string;
  // Cleaned: citations stripped, long text cut, empty turns dropped.
  history: Turn[];
  compact: Turn[];
  summary?: string;
}

export type ChatRequestResult =
  | ({ ok: true } & ChatInput)
  | { ok: false; failure: ChatRequestError };

// Checks the shape of a turn list. Returns null when it is not a valid list of at most `max` turns.
function readTurns(value: unknown, max: number): Turn[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) return null;
  const turns: Turn[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
    const { role, text } = item as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof text !== "string" || text.length > MAX_RAW_TURN_CHARS) return null;
    turns.push({ role, text });
  }
  return cleanTurns(turns, max);
}

function fail(
  status: ChatRequestError["status"],
  code: ChatRequestError["code"],
  error: string,
): ChatRequestResult {
  return { ok: false, failure: { status, code, error } };
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const mediaType = value.split(";")[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}

// Reads at most `maxBytes`; returns null as soon as the body is known to be larger, so a
// chunked request without a Content-Length cannot make the Worker buffer an oversized body.
async function readBounded(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function parseChatRequest(
  request: Request,
): Promise<ChatRequestResult> {
  if (!isJsonContentType(request.headers.get("Content-Type"))) {
    return fail(
      415,
      "unsupported_media_type",
      "Content-Type must be application/json",
    );
  }

  const declared = request.headers.get("Content-Length");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) {
    return fail(413, "payload_too_large", "Request body is too large");
  }

  const bytes = await readBounded(request, MAX_BODY_BYTES);
  if (bytes === null) {
    return fail(413, "payload_too_large", "Request body is too large");
  }

  let parsed: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    parsed = JSON.parse(text);
  } catch {
    return fail(400, "invalid_json", "Request body is not valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return fail(400, "invalid_body", 'Body must be a JSON object: { "question": string }');
  }

  const raw = (parsed as Record<string, unknown>).question;
  if (typeof raw !== "string") {
    return fail(400, "invalid_question", "question must be a string");
  }

  const question = raw.trim();
  if (question.length < 1 || question.length > MAX_QUESTION_CHARS) {
    return fail(
      400,
      "invalid_question",
      `question must be 1 to ${MAX_QUESTION_CHARS} characters after trimming`,
    );
  }

  const body = parsed as Record<string, unknown>;
  const history = readTurns(body.history, MAX_HISTORY_TURNS);
  const compact = readTurns(body.compact, MAX_COMPACT_TURNS);
  const rawSummary = body.summary;
  if (
    history === null ||
    compact === null ||
    (rawSummary !== undefined && (typeof rawSummary !== "string" || rawSummary.length > MAX_SUMMARY_CHARS * 2))
  ) {
    return fail(
      400,
      "invalid_history",
      `history and compact must be lists of at most ${MAX_HISTORY_TURNS} { role, text } turns, and summary a short string`,
    );
  }

  const summary = cleanSummary(rawSummary);
  return { ok: true, question, history, compact, ...(summary !== undefined ? { summary } : {}) };
}
