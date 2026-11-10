import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chatReducer, initialChatState } from "./chat-state.ts";
import type { ChatMessage, ChatState } from "./chat-state.ts";
import { MAX_STORED_MESSAGES, STORAGE_KEY, clearChat, loadChat, memoryForRequest, parseSaved, saveChat, toSaved, turnFor } from "./memory.ts";

function message(id: string, role: "user" | "assistant", text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id, role, text, status: "done", citations: [], truncated: false, ...extra };
}

// A finished chat of `pairs` questions and answers.
function chat(pairs: number): ChatState {
  const messages: ChatMessage[] = [];
  for (let i = 1; i <= pairs; i++) messages.push(message(`a${i}:q`, "user", `question ${i}`), message(`a${i}`, "assistant", `answer ${i} [p-${i}]`));
  return { ...initialChatState, messages };
}

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

describe("turnFor", () => {
  it("keeps a question, and an answer without its citation markers", () => {
    assert.deepEqual(turnFor(message("q", "user", " hi ")), { role: "user", text: "hi" });
    assert.deepEqual(turnFor(message("a", "assistant", "I built it [p-1, p-2].")), { role: "assistant", text: "I built it." });
  });

  it("says which stored card was shown, and skips answers that failed, stopped or are streaming", () => {
    assert.deepEqual(turnFor(message("a", "assistant", "Here are some things I've built.", { card: "projects" })), {
      role: "assistant",
      text: "Here are some things I've built. (showed the projects card)",
    });
    for (const status of ["error", "stopped", "streaming"] as const) assert.equal(turnFor(message("a", "assistant", "partial", { status })), null);
  });
});

describe("memoryForRequest", () => {
  it("sends nothing for the first question", () => {
    assert.deepEqual(memoryForRequest(initialChatState), { history: [], compact: [] });
  });

  it("sends up to 8 latest turns as they are, with nothing to fold", () => {
    const memory = memoryForRequest(chat(4));
    assert.equal(memory.history.length, 8);
    assert.equal(memory.history[0]?.text, "question 1");
    assert.deepEqual(memory.compact, []);
    assert.equal(memory.foldThrough, undefined);
  });

  it("asks for the older turns to be folded once the chat is longer than 8 turns", () => {
    const memory = memoryForRequest(chat(6));
    assert.deepEqual(memory.history.map((turn) => turn.text).slice(0, 2), ["question 3", "answer 3"]);
    assert.deepEqual(memory.compact.map((turn) => turn.text), ["question 1", "answer 1", "question 2", "answer 2"]);
    assert.equal(memory.foldThrough, 4);
  });

  it("does not send turns the notes already cover, and sends the notes", () => {
    const memory = memoryForRequest({ ...chat(6), summary: "Visitor: Ren from ABC.", summarized: 4 });
    assert.deepEqual(memory.compact, []);
    assert.equal(memory.summary, "Visitor: Ren from ABC.");
    assert.equal(memory.history.length, 8);
  });
});

describe("notes in the chat state", () => {
  it("takes the notes from a memory event and moves the covered count forward", () => {
    let state = chatReducer(chat(6), { type: "ask", id: "a7", question: "question 7", foldThrough: 4 });
    state = chatReducer(state, { type: "event", id: "a7", event: { type: "memory", summary: "Visitor: Ren from ABC." } });
    assert.equal(state.summary, "Visitor: Ren from ABC.");
    assert.equal(state.summarized, 4);
    assert.equal(state.pendingFold, undefined);
  });

  it("ignores notes from an answer that did not ask for them, and reset forgets everything", () => {
    let state = chatReducer(chat(1), { type: "ask", id: "a2", question: "q" });
    state = chatReducer(state, { type: "event", id: "a2", event: { type: "memory", summary: "stray" } });
    assert.equal(state.summary, undefined);
    assert.deepEqual(chatReducer({ ...state, summary: "x", summarized: 2 }, { type: "reset" }), initialChatState);
  });
});

describe("sessionStorage", () => {
  it("saves and restores the chat and the notes", () => {
    const storage = memoryStorage();
    const state: ChatState = { ...chat(2), summary: "Visitor: Ren.", summarized: 2 };
    saveChat(storage, state);
    const saved = loadChat(storage);
    assert.deepEqual(saved, { messages: state.messages, summary: "Visitor: Ren.", summarized: 2 });
    const restored = chatReducer(initialChatState, { type: "restore", ...saved! });
    assert.deepEqual(restored.messages, state.messages);
    assert.equal(restored.activeId, null);
  });

  it("never writes an empty chat, so the first render cannot wipe a saved one; clearChat forgets it", () => {
    const storage = memoryStorage();
    saveChat(storage, chat(1));
    saveChat(storage, initialChatState);
    assert.ok(storage.items.has(STORAGE_KEY));
    clearChat(storage);
    assert.equal(loadChat(storage), null);
  });

  it("stores a streaming answer as stopped, and keeps only the newest messages", () => {
    const streaming = chatReducer(chat(1), { type: "ask", id: "a2", question: "q" });
    assert.equal(toSaved(streaming).messages.at(-1)?.status, "stopped");
    const long = { ...chat(40), summarized: 10 };
    const saved = toSaved(long);
    assert.equal(saved.messages.length, MAX_STORED_MESSAGES);
    assert.equal(saved.summarized, 0);
  });

  it("ignores anything it did not write, and storage that throws", () => {
    for (const raw of [null, "", "not json", "[]", '{"messages":[]}', '{"messages":[{"id":1}]}']) assert.equal(parseSaved(raw), null, String(raw));
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    assert.equal(loadChat(broken), null);
    saveChat(broken, chat(1));
    clearChat(broken);
    assert.equal(loadChat(undefined), null);
  });
});
