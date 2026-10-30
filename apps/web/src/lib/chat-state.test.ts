import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { friendlyMessage } from "./chat-client.ts";
import { behaviorNote, chatReducer, initialChatState } from "./chat-state.ts";
import type { ChatState } from "./chat-state.ts";
import { citedIds, splitCitations } from "./citations.ts";

const ask = (state: ChatState, id: string, question = "Who are you?") => chatReducer(state, { type: "ask", id, question });
const token = (state: ChatState, id: string, text: string) => chatReducer(state, { type: "event", id, event: { type: "token", text } });
const assistant = (state: ChatState, id: string) => state.messages.find((message) => message.id === id && message.role === "assistant");

describe("chatReducer", () => {
  it("adds the question and an empty streaming answer", () => {
    const state = ask(initialChatState, "a1");
    assert.equal(state.activeId, "a1");
    assert.deepEqual(
      state.messages.map((message) => [message.role, message.text, message.status]),
      [
        ["user", "Who are you?", "done"],
        ["assistant", "", "streaming"],
      ],
    );
  });

  it("builds the answer from meta, tokens and done", () => {
    let state = ask(initialChatState, "a1");
    state = chatReducer(state, { type: "event", id: "a1", event: { type: "meta", behavior: "qualify", behaviorValid: true, retrieved: ["x"], degraded: false } });
    state = token(state, "a1", "Alex built ");
    state = token(state, "a1", "it [project-demo-001].");
    state = chatReducer(state, {
      type: "event",
      id: "a1",
      event: { type: "done", citations: ["project-demo-001"], invalidCitationsDropped: 0, truncated: true, model: "m" },
    });
    const answer = assistant(state, "a1");
    assert.equal(answer?.text, "Alex built it [project-demo-001].");
    assert.equal(answer?.behavior, "qualify");
    assert.equal(answer?.status, "done");
    assert.deepEqual(answer?.citations, ["project-demo-001"]);
    assert.equal(answer?.truncated, true);
    assert.equal(state.activeId, null);
  });

  it("shows a friendly sentence for a server error event, never the server's words, and keeps the text", () => {
    let state = token(ask(initialChatState, "a1"), "a1", "Partial answer");
    state = chatReducer(state, { type: "event", id: "a1", event: { type: "error", code: "timeout", message: "SERVER WORDS" } });
    const answer = assistant(state, "a1");
    assert.equal(answer?.status, "error");
    assert.equal(answer?.error, friendlyMessage("timeout"));
    assert.equal(answer?.text, "Partial answer");
    assert.equal(state.activeId, null);
  });

  it("maps an unknown server error code to the generic message", () => {
    const state = chatReducer(ask(initialChatState, "a1"), { type: "event", id: "a1", event: { type: "error", code: "brand_new", message: "x" } });
    assert.equal(assistant(state, "a1")?.error, friendlyMessage("internal_error"));
  });

  it("shows a client failure with the wait time when there is one", () => {
    const state = chatReducer(ask(initialChatState, "a1"), { type: "fail", id: "a1", code: "rate_limited", retryAfterSeconds: 60 });
    assert.equal(assistant(state, "a1")?.error, friendlyMessage("rate_limited", 60));
    assert.equal(state.activeId, null);
  });

  it("a new question stops the answer still streaming, and late events from it are ignored", () => {
    let state = token(ask(initialChatState, "a1"), "a1", "first");
    state = ask(state, "a2", "Second?");
    assert.equal(assistant(state, "a1")?.status, "stopped");
    assert.equal(state.activeId, "a2");
    state = token(state, "a1", " late");
    assert.equal(assistant(state, "a1")?.text, "first");
    assert.equal(state.messages.length, 4);
  });

  it("stop only affects the active answer and leaves a finished one alone", () => {
    let state = ask(initialChatState, "a1");
    state = chatReducer(state, { type: "event", id: "a1", event: { type: "done", citations: [], invalidCitationsDropped: 0, truncated: false, model: "m" } });
    const before = state;
    state = chatReducer(state, { type: "stop", id: "a1" });
    assert.equal(state, before);
  });

  it("ignores events for an id it does not know, and reset clears everything", () => {
    const state = ask(initialChatState, "a1");
    assert.equal(token(state, "nope", "x"), state);
    assert.deepEqual(chatReducer(state, { type: "reset" }), initialChatState);
  });
});

describe("behaviorNote", () => {
  it("explains every answer that is not a plain answer", () => {
    assert.equal(behaviorNote("answer"), null);
    assert.equal(behaviorNote(undefined), null);
    for (const behavior of ["qualify", "abstain", "refuse"] as const) assert.ok((behaviorNote(behavior) ?? "").length > 5);
  });
});

describe("splitCitations", () => {
  it("splits text and numbers citations by first appearance", () => {
    const segments = splitCitations("A [p-1] and B [d-2], again A [p-1].");
    assert.deepEqual(segments, [
      { type: "text", text: "A " },
      { type: "cite", id: "p-1", n: 1 },
      { type: "text", text: " and B " },
      { type: "cite", id: "d-2", n: 2 },
      { type: "text", text: ", again A " },
      { type: "cite", id: "p-1", n: 1 },
      { type: "text", text: "." },
    ]);
    assert.deepEqual(citedIds(segments), ["p-1", "d-2"]);
  });

  it("leaves brackets that are not record ids, or not allowed, as text", () => {
    assert.deepEqual(splitCitations("a [ not an id ] b"), [{ type: "text", text: "a [ not an id ] b" }]);
    assert.deepEqual(splitCitations("x [p-1] [q-2]", new Set(["p-1"])), [
      { type: "text", text: "x " },
      { type: "cite", id: "p-1", n: 1 },
      { type: "text", text: " [q-2]" },
    ]);
  });

  it("handles empty text, text with no citations, and a citation at the very start", () => {
    assert.deepEqual(splitCitations(""), []);
    assert.deepEqual(splitCitations("plain"), [{ type: "text", text: "plain" }]);
    assert.deepEqual(splitCitations("[p-1] first"), [
      { type: "cite", id: "p-1", n: 1 },
      { type: "text", text: " first" },
    ]);
  });
});
