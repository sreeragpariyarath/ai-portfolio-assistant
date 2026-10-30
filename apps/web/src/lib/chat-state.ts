import { friendlyMessage, normalizeErrorCode } from "./chat-client.ts";
import type { ChatErrorCode } from "./chat-client.ts";
import type { Behavior, ChatEvent } from "./chat-events.ts";
import { splitCitations } from "./citations.ts";

// The conversation shown in the chat view, as a reducer so every transition is a pure, tested
// function. Each question is answered on its own (the API takes no history); the list is only what
// the visitor sees.

export type MessageStatus = "streaming" | "done" | "error" | "stopped";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: MessageStatus;
  behavior?: Behavior;
  citations: string[];
  truncated: boolean;
  // A friendly, fixed sentence; never the server's own wording.
  error?: string;
}

export interface ChatState {
  messages: ChatMessage[];
  // The assistant message currently streaming, if any.
  activeId: string | null;
}

export type ChatAction =
  | { type: "ask"; id: string; question: string }
  | { type: "event"; id: string; event: ChatEvent }
  | { type: "fail"; id: string; code: ChatErrorCode; retryAfterSeconds?: number }
  | { type: "stop"; id: string }
  | { type: "reset" };

export const initialChatState: ChatState = { messages: [], activeId: null };

function update(state: ChatState, id: string, change: (message: ChatMessage) => ChatMessage): ChatState {
  let found = false;
  const messages = state.messages.map((message) => {
    if (message.id !== id || message.role !== "assistant") return message;
    found = true;
    return change(message);
  });
  return found ? { ...state, messages } : state;
}

function finish(state: ChatState, id: string): ChatState {
  return state.activeId === id ? { ...state, activeId: null } : state;
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "ask": {
      // A new question stops whatever was still streaming.
      const stopped = state.activeId === null ? state : chatReducer(state, { type: "stop", id: state.activeId });
      return {
        activeId: action.id,
        messages: [
          ...stopped.messages,
          { id: `${action.id}:q`, role: "user", text: action.question, status: "done", citations: [], truncated: false },
          { id: action.id, role: "assistant", text: "", status: "streaming", citations: [], truncated: false },
        ],
      };
    }

    case "event": {
      const { id, event } = action;
      // Events from a stream that was already stopped or replaced are ignored.
      if (state.activeId !== id) return state;
      switch (event.type) {
        case "meta":
          return update(state, id, (message) => ({ ...message, behavior: event.behavior }));
        case "token":
          return update(state, id, (message) => ({ ...message, text: message.text + event.text }));
        case "done":
          return finish(
            update(state, id, (message) => ({ ...message, status: "done", citations: event.citations, truncated: event.truncated })),
            id,
          );
        case "error":
          return finish(
            update(state, id, (message) => ({ ...message, status: "error", error: friendlyMessage(normalizeErrorCode(event.code)) })),
            id,
          );
      }
      return state;
    }

    case "fail":
      if (state.activeId !== action.id) return state;
      return finish(
        update(state, action.id, (message) => ({
          ...message,
          status: "error",
          error: friendlyMessage(action.code, action.retryAfterSeconds),
        })),
        action.id,
      );

    case "stop":
      if (state.activeId !== action.id) return state;
      return finish(
        update(state, action.id, (message) => (message.status === "streaming" ? { ...message, status: "stopped" } : message)),
        action.id,
      );

    case "reset":
      return initialChatState;
  }
}

// A short note shown under an answer that is not a plain answer, so visitors know why.
export function behaviorNote(behavior: Behavior | undefined): string | null {
  switch (behavior) {
    case "qualify":
      return "Partly supported by my records";
    case "abstain":
      return "Not in my records";
    case "refuse":
      return "I can't share that";
    default:
      return null;
  }
}

// What a screen reader hears: only finished answers (or why one failed), never each streamed word.
export function announcementFor(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message === undefined || message.role !== "assistant") continue;
    if (message.status === "streaming") return "";
    if (message.status === "error") return message.error ?? "";
    if (message.status === "stopped") return "Answer stopped.";
    const text = splitCitations(message.text)
      .map((segment) => (segment.type === "text" ? segment.text : ""))
      .join("")
      // Removing a citation can leave a space before punctuation ("built it ."); close it up.
      .replace(/\s+([.,;:!?])/g, "$1")
      .trim();
    const note = behaviorNote(message.behavior);
    const answer = note === null ? text : `${text} (${note})`;
    return message.truncated ? `${answer} The answer was cut short.` : answer;
  }
  return "";
}
