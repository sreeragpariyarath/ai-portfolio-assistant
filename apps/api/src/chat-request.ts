// Validation for POST /api/chat (Phase 3 task 3.3). Pure request handling: no upstream calls.

export const MAX_BODY_BYTES = 4 * 1024;
export const MAX_QUESTION_CHARS = 500;

export type ChatRequestError = {
  status: 400 | 413 | 415;
  code:
    | "unsupported_media_type"
    | "payload_too_large"
    | "invalid_json"
    | "invalid_body"
    | "invalid_question";
  error: string;
};

export type ChatRequestResult =
  | { ok: true; question: string }
  | { ok: false; failure: ChatRequestError };

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

  return { ok: true, question };
}
