// Chat memory on the browser side (D-041). What each question carries to the API, and how the chat is kept in
// sessionStorage so a refresh keeps it and closing the tab clears it. Pure functions (storage is passed in), so
// the root tests can run them. The API holds nothing between questions.

import { splitCitations } from "./citations.ts";
import type { ChatMessage, ChatState } from "./chat-state.ts";
import type { CardKind } from "../cards/portfolio-cards.ts";

export interface Turn {
  role: "user" | "assistant";
  text: string;
}

// Same limits as the API (packages/rag/src/conversation.ts). Text is cut here too, so a long chat never makes
// the request body too large.
export const MAX_HISTORY_TURNS = 8;
export const MAX_COMPACT_TURNS = 8;
const MAX_USER_TURN_CHARS = 500;
const MAX_ASSISTANT_TURN_CHARS = 1500;
const MAX_SUMMARY_CHARS = 800;

const CARD_LABELS: Record<CardKind, string> = { profile: "profile", projects: "projects", skills: "skills", contact: "contact", fun: "fun facts" };

function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

// A message as the model should remember it, or null when there is nothing to remember: an answer that failed,
// was stopped or is still streaming.
export function turnFor(message: ChatMessage): Turn | null {
  if (message.role === "user") {
    const text = message.text.trim();
    return text === "" ? null : { role: "user", text: cut(text, MAX_USER_TURN_CHARS) };
  }
  if (message.status !== "done") return null;
  const words = splitCitations(message.text)
    .map((segment) => (segment.type === "text" ? segment.text : ""))
    .join("")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
  const text = message.card !== undefined ? `${words} (showed the ${CARD_LABELS[message.card]} card)`.trim() : words;
  return text === "" ? null : { role: "assistant", text: cut(text, MAX_ASSISTANT_TURN_CHARS) };
}

export interface RequestMemory {
  history: Turn[];
  compact: Turn[];
  summary?: string;
  // When `compact` is not empty: the number of messages the notes will cover once the API sends them back.
  foldThrough?: number;
}

// What the next question carries: the latest turns as they are, the older turns not yet in the notes (for the
// API to fold in), and the notes. Call it before the new question is added to the state.
export function memoryForRequest(state: ChatState): RequestMemory {
  const pending: { index: number; turn: Turn }[] = [];
  state.messages.forEach((message, index) => {
    if (index < state.summarized) return;
    const turn = turnFor(message);
    if (turn !== null) pending.push({ index, turn });
  });

  const recent = pending.slice(-MAX_HISTORY_TURNS);
  const older = pending.slice(0, Math.max(0, pending.length - MAX_HISTORY_TURNS));
  // If folding kept failing, only the newest older turns are sent; the oldest are let go.
  const compact = older.slice(-MAX_COMPACT_TURNS);
  const memory: RequestMemory = { history: recent.map((item) => item.turn), compact: compact.map((item) => item.turn) };
  if (state.summary !== undefined) memory.summary = state.summary;
  if (compact.length > 0) memory.foldThrough = (compact.at(-1)?.index ?? 0) + 1;
  return memory;
}

// ---------------------------------------------------------------------------------------------------------
// sessionStorage

export const STORAGE_KEY = "sreerag-chat-v1";
// Enough for a long chat; older messages are dropped from storage first.
export const MAX_STORED_MESSAGES = 60;

export interface SavedChat {
  messages: ChatMessage[];
  summary?: string;
  summarized: number;
}

// The parts of the state worth keeping. A message still streaming is kept as stopped.
export function toSaved(state: ChatState): SavedChat {
  const dropped = Math.max(0, state.messages.length - MAX_STORED_MESSAGES);
  const messages = state.messages.slice(dropped).map((message) => (message.status === "streaming" ? { ...message, status: "stopped" as const } : message));
  return {
    messages,
    ...(state.summary !== undefined ? { summary: state.summary } : {}),
    summarized: Math.max(0, state.summarized - dropped),
  };
}

function isMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.text === "string" &&
    (message.status === "done" || message.status === "error" || message.status === "stopped") &&
    Array.isArray(message.citations) &&
    message.citations.every((id) => typeof id === "string") &&
    typeof message.truncated === "boolean"
  );
}

// Reads a saved chat back, or null when there is none or it is not something this page wrote.
export function parseSaved(raw: string | null): SavedChat | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const saved = value as Record<string, unknown>;
  if (!Array.isArray(saved.messages) || !saved.messages.every(isMessage) || saved.messages.length === 0) return null;
  const summarized = typeof saved.summarized === "number" && Number.isInteger(saved.summarized) ? Math.min(Math.max(0, saved.summarized), saved.messages.length) : 0;
  const summary = typeof saved.summary === "string" && saved.summary.trim() !== "" ? cut(saved.summary.trim(), MAX_SUMMARY_CHARS) : undefined;
  return { messages: saved.messages.slice(-MAX_STORED_MESSAGES), summarized, ...(summary !== undefined ? { summary } : {}) };
}

// Storage can be missing or throw (a private window, blocked site data): then the chat simply is not kept.
export function loadChat(storage: Pick<Storage, "getItem"> | undefined): SavedChat | null {
  try {
    return parseSaved(storage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

// An empty chat is not written: the first render, before the saved chat is restored, must not wipe it.
// `clearChat` is how a chat is forgotten.
export function saveChat(storage: Pick<Storage, "setItem"> | undefined, state: ChatState): void {
  if (state.messages.length === 0) return;
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(toSaved(state)));
  } catch {
    // Full or blocked: the chat still works, it just is not kept.
  }
}

export function clearChat(storage: Pick<Storage, "removeItem"> | undefined): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}
