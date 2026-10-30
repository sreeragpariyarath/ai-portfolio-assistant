import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MalformedEventError, decodeChatEvent } from "./chat-events.ts";

const frame = (event: string, data: unknown) => ({ event, data: typeof data === "string" ? data : JSON.stringify(data) });

describe("decodeChatEvent", () => {
  it("decodes meta", () => {
    const data = { behavior: "qualify", behaviorValid: false, retrieved: ["a", "b"], degraded: true };
    assert.deepEqual(decodeChatEvent(frame("meta", data)), { type: "meta", ...data });
  });

  it("decodes every behavior the API can send", () => {
    for (const behavior of ["answer", "qualify", "abstain", "refuse"]) {
      const event = decodeChatEvent(frame("meta", { behavior, behaviorValid: true, retrieved: [], degraded: false }));
      assert.equal(event?.type === "meta" && event.behavior, behavior);
    }
  });

  it("decodes token, including text that is empty-looking or has unusual characters", () => {
    assert.deepEqual(decodeChatEvent(frame("token", { text: "é 🚀 \n [x-1]" })), { type: "token", text: "é 🚀 \n [x-1]" });
  });

  it("decodes done", () => {
    const data = { citations: ["project-demo-001"], invalidCitationsDropped: 2, truncated: true, model: "gemini-3.5-flash-lite" };
    assert.deepEqual(decodeChatEvent(frame("done", data)), { type: "done", ...data });
  });

  it("decodes error", () => {
    assert.deepEqual(decodeChatEvent(frame("error", { code: "timeout", message: "x" })), {
      type: "error",
      code: "timeout",
      message: "x",
    });
  });

  it("ignores extra fields so the server can add some later", () => {
    assert.deepEqual(decodeChatEvent(frame("token", { text: "a", future: 1 })), { type: "token", text: "a" });
  });

  it("returns null for an event name it does not know, and never parses its data", () => {
    assert.equal(decodeChatEvent(frame("ping", "not json at all")), null);
    assert.equal(decodeChatEvent(frame("message", "{}")), null);
  });

  it("throws MalformedEventError for invalid JSON or a non-object", () => {
    for (const data of ["{broken", "null", "[]", '"text"', "42"]) {
      assert.throws(() => decodeChatEvent(frame("token", data)), MalformedEventError, data);
    }
  });

  it("throws MalformedEventError for a wrong shape in each event", () => {
    const bad: [string, unknown][] = [
      ["token", {}],
      ["token", { text: 5 }],
      ["meta", { behavior: "maybe", behaviorValid: true, retrieved: [], degraded: false }],
      ["meta", { behavior: "answer", behaviorValid: "yes", retrieved: [], degraded: false }],
      ["meta", { behavior: "answer", behaviorValid: true, retrieved: [1], degraded: false }],
      ["meta", { behavior: "answer", behaviorValid: true, retrieved: [] }],
      ["done", { citations: "a", invalidCitationsDropped: 0, truncated: false, model: "m" }],
      ["done", { citations: [], invalidCitationsDropped: -1, truncated: false, model: "m" }],
      ["done", { citations: [], invalidCitationsDropped: 1.5, truncated: false, model: "m" }],
      ["done", { citations: [], invalidCitationsDropped: 0, truncated: "no", model: "m" }],
      ["done", { citations: [], invalidCitationsDropped: 0, truncated: false }],
      ["error", { code: "x" }],
      ["error", { code: 1, message: "m" }],
    ];
    for (const [event, data] of bad) {
      assert.throws(() => decodeChatEvent(frame(event, data)), MalformedEventError, `${event} ${JSON.stringify(data)}`);
    }
  });

  it("never puts the payload in the error message", () => {
    assert.throws(
      () => decodeChatEvent(frame("token", "SECRET-PAYLOAD {")),
      (error: Error) => error instanceof MalformedEventError && !error.message.includes("SECRET-PAYLOAD") && error.event === "token",
    );
    assert.throws(
      () => decodeChatEvent(frame("meta", { behavior: "SECRET-BEHAVIOR", behaviorValid: true, retrieved: [], degraded: false })),
      (error: Error) => !error.message.includes("SECRET-BEHAVIOR"),
    );
  });
});
