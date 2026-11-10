import type { SseFrame } from "./sse.ts";

// The four events POST /api/chat streams (apps/api/src/chat.ts). Pure logic with no imports besides
// the frame type, so the root test suite can run it.

export type Behavior = "answer" | "qualify" | "abstain" | "refuse" | "offtopic";

export type ChatEvent =
  | { type: "meta"; behavior: Behavior; behaviorValid: boolean; retrieved: string[]; degraded: boolean }
  | { type: "token"; text: string }
  // `suggestions`: follow-up questions to offer as buttons (D-043); empty from an older API.
  | { type: "done"; citations: string[]; invalidCitationsDropped: number; truncated: boolean; model: string; suggestions?: string[] }
  // New notes about the older turns of this chat (D-041), sent just before `done` when the API compacted them.
  | { type: "memory"; summary: string }
  | { type: "error"; code: string; message: string };

// A known event whose payload is not valid JSON or has the wrong shape. The message never includes
// the payload, which is server text and is not shown to visitors.
export class MalformedEventError extends Error {
  readonly event: string;

  constructor(event: string, reason: string) {
    super(`Malformed "${event}" event: ${reason}.`);
    this.name = "MalformedEventError";
    this.event = event;
  }
}

const BEHAVIORS: readonly string[] = ["answer", "qualify", "abstain", "refuse", "offtopic"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

// Turns one frame into a typed event. Returns null for an event name this client does not know, so
// the server can add events later without breaking older pages. Throws MalformedEventError for a
// known event with a bad payload.
export function decodeChatEvent(frame: SseFrame): ChatEvent | null {
  const name = frame.event;
  if (name !== "meta" && name !== "token" && name !== "done" && name !== "error" && name !== "memory") return null;

  let payload: unknown;
  try {
    payload = JSON.parse(frame.data);
  } catch {
    throw new MalformedEventError(name, "the data is not valid JSON");
  }
  if (!isRecord(payload)) throw new MalformedEventError(name, "the data is not an object");

  if (name === "token") {
    if (typeof payload.text !== "string") throw new MalformedEventError(name, "text must be a string");
    return { type: "token", text: payload.text };
  }

  if (name === "memory") {
    if (typeof payload.summary !== "string") throw new MalformedEventError(name, "summary must be a string");
    return { type: "memory", summary: payload.summary };
  }

  if (name === "meta") {
    const { behavior, behaviorValid, retrieved, degraded } = payload;
    if (typeof behavior !== "string" || !BEHAVIORS.includes(behavior)) {
      throw new MalformedEventError(name, "behavior must be answer, qualify, abstain, refuse or offtopic");
    }
    if (typeof behaviorValid !== "boolean" || typeof degraded !== "boolean") {
      throw new MalformedEventError(name, "behaviorValid and degraded must be booleans");
    }
    if (!isStringArray(retrieved)) throw new MalformedEventError(name, "retrieved must be a list of strings");
    return { type: "meta", behavior: behavior as Behavior, behaviorValid, retrieved, degraded };
  }

  if (name === "done") {
    const { citations, invalidCitationsDropped, truncated, model, suggestions = [] } = payload;
    if (!isStringArray(citations)) throw new MalformedEventError(name, "citations must be a list of strings");
    if (typeof invalidCitationsDropped !== "number" || !Number.isInteger(invalidCitationsDropped) || invalidCitationsDropped < 0) {
      throw new MalformedEventError(name, "invalidCitationsDropped must be a non-negative integer");
    }
    if (typeof truncated !== "boolean") throw new MalformedEventError(name, "truncated must be a boolean");
    if (typeof model !== "string") throw new MalformedEventError(name, "model must be a string");
    if (!isStringArray(suggestions)) throw new MalformedEventError(name, "suggestions must be a list of strings");
    return { type: "done", citations, invalidCitationsDropped, truncated, model, suggestions: suggestions.slice(0, 3) };
  }

  const { code, message } = payload;
  if (typeof code !== "string" || typeof message !== "string") {
    throw new MalformedEventError(name, "code and message must be strings");
  }
  return { type: "error", code, message };
}
