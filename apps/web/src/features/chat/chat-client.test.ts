import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ChatClientError,
  MAX_QUESTION_CHARS,
  askQuestion,
  friendlyMessage,
  isAbortError,
  normalizeErrorCode,
} from "./chat-client.ts";
import type { ChatErrorCode } from "./chat-client.ts";
import type { ChatEvent } from "./chat-events.ts";

const encoder = new TextEncoder();
const URL_UNDER_TEST = "https://example.test/api/chat";

function frame(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

const META = frame("meta", { behavior: "answer", behaviorValid: true, retrieved: ["project-demo-001"], degraded: false });
const TOKEN_A = frame("token", { text: "Alex built " });
const TOKEN_B = frame("token", { text: "it — café 🚀 [project-demo-001]" });
const DONE = frame("done", { citations: ["project-demo-001"], invalidCitationsDropped: 0, truncated: false, model: "m" });

function sseResponse(chunks: (string | Uint8Array)[], init: ResponseInit = {}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" }, ...init });
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

type Call = { url: string; init: RequestInit };
function mockFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { fetchMock, calls };
}

async function collect(iterable: AsyncIterable<ChatEvent>): Promise<{ events: ChatEvent[]; error: unknown }> {
  const events: ChatEvent[] = [];
  try {
    for await (const event of iterable) events.push(event);
    return { events, error: undefined };
  } catch (error) {
    return { events, error };
  }
}

const ask = (question: string, fetchMock: typeof fetch, extra: { signal?: AbortSignal } = {}) =>
  askQuestion(question, { url: URL_UNDER_TEST, fetch: fetchMock, ...extra });

describe("askQuestion: a successful answer", () => {
  it("yields meta, tokens and done, in order, from a stream split into awkward chunks", async () => {
    const bytes = encoder.encode(META + TOKEN_A + TOKEN_B + DONE);
    const chunks = Array.from({ length: Math.ceil(bytes.length / 7) }, (_, i) => bytes.slice(i * 7, i * 7 + 7));
    const { fetchMock } = mockFetch(() => sseResponse(chunks));

    const { events, error } = await collect(ask("What does Alex build?", fetchMock));

    assert.equal(error, undefined);
    assert.deepEqual(
      events.map((event) => event.type),
      ["meta", "token", "token", "done"],
    );
    const text = events.flatMap((event) => (event.type === "token" ? [event.text] : [])).join("");
    assert.equal(text, "Alex built it — café 🚀 [project-demo-001]");
    assert.deepEqual(events.at(-1), {
      type: "done",
      citations: ["project-demo-001"],
      invalidCitationsDropped: 0,
      truncated: false,
      model: "m",
    });
  });

  it("sends one POST with the trimmed question as JSON, asking for an event stream", async () => {
    const controller = new AbortController();
    const { fetchMock, calls } = mockFetch(() => sseResponse([META + DONE]));

    await collect(ask("  Who is Alex?  ", fetchMock, { signal: controller.signal }));

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, URL_UNDER_TEST);
    assert.equal(calls[0]!.init.method, "POST");
    assert.deepEqual(calls[0]!.init.headers, { "Content-Type": "application/json", Accept: "text/event-stream" });
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { question: "Who is Alex?" });
    assert.equal(calls[0]!.init.signal, controller.signal);
  });

  it("ignores events it does not know", async () => {
    const { fetchMock } = mockFetch(() => sseResponse([META, frame("ping", {}), TOKEN_A, DONE]));
    const { events } = await collect(ask("q", fetchMock));
    assert.deepEqual(
      events.map((event) => event.type),
      ["meta", "token", "done"],
    );
  });

  it("yields a server error event and ends without throwing", async () => {
    const { fetchMock } = mockFetch(() =>
      sseResponse([META, TOKEN_A, frame("error", { code: "timeout", message: "server words" })]),
    );
    const { events, error } = await collect(ask("q", fetchMock));
    assert.equal(error, undefined);
    assert.deepEqual(events.at(-1), { type: "error", code: "timeout", message: "server words" });
  });

  it("releases the connection when the consumer stops early", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(META + TOKEN_A));
      },
      cancel() {
        cancelled = true;
      },
    });
    const { fetchMock } = mockFetch(() => new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));
    for await (const event of ask("q", fetchMock)) {
      if (event.type === "token") break;
    }
    assert.equal(cancelled, true);
  });
});

describe("askQuestion: the question is checked before anything is sent", () => {
  it("rejects an empty, blank or too long question without calling fetch", async () => {
    const { fetchMock, calls } = mockFetch(() => sseResponse([DONE]));
    for (const question of ["", "   \n\t ", "x".repeat(MAX_QUESTION_CHARS + 1)]) {
      const { error } = await collect(ask(question, fetchMock));
      assert.ok(error instanceof ChatClientError && error.code === "invalid_question");
    }
    assert.equal(calls.length, 0);
  });

  it("accepts exactly the maximum length, counted after trimming", async () => {
    const { fetchMock, calls } = mockFetch(() => sseResponse([META + DONE]));
    const { error } = await collect(ask(`  ${"x".repeat(MAX_QUESTION_CHARS)}  `, fetchMock));
    assert.equal(error, undefined);
    assert.equal(calls.length, 1);
  });
});

describe("askQuestion: HTTP errors", () => {
  const cases: [number, unknown, ChatErrorCode][] = [
    [429, { error: "Too many requests", code: "rate_limited" }, "rate_limited"],
    [503, { error: "busy", code: "demo_busy" }, "demo_busy"],
    [503, { error: "slow", code: "timeout" }, "timeout"],
    [503, { error: "down", code: "upstream_unavailable" }, "upstream_unavailable"],
    [400, { error: "blocked", code: "prompt_blocked" }, "prompt_blocked"],
    [400, { error: "bad", code: "invalid_question" }, "invalid_question"],
    [413, { error: "big", code: "payload_too_large" }, "payload_too_large"],
    [400, { error: "bad json", code: "invalid_json" }, "bad_request"],
    [415, { error: "type", code: "unsupported_media_type" }, "bad_request"],
    [500, { error: "oops", code: "internal_error" }, "internal_error"],
    [503, { error: "x", code: "a_code_added_later" }, "upstream_unavailable"],
    [429, {}, "rate_limited"],
    [500, { code: 5 }, "upstream_unavailable"],
  ];

  for (const [status, body, expected] of cases) {
    it(`maps ${status} ${JSON.stringify(body)} to ${expected}`, async () => {
      const { fetchMock } = mockFetch(() => jsonResponse(status, body));
      const { events, error } = await collect(ask("q", fetchMock));
      assert.deepEqual(events, []);
      assert.ok(error instanceof ChatClientError);
      assert.equal(error.code, expected);
      assert.equal(error.status, status);
    });
  }

  it("falls back to the status when the body is not JSON, such as an HTML error page", async () => {
    const { fetchMock } = mockFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }));
    const { error } = await collect(ask("q", fetchMock));
    assert.ok(error instanceof ChatClientError && error.code === "upstream_unavailable");
  });

  it("reads Retry-After in whole seconds and ignores anything else", async () => {
    for (const [header, expected] of [["60", 60], [" 30 ", 30], ["0", undefined], ["abc", undefined], ["Wed, 21 Oct 2026 07:28:00 GMT", undefined], ["99999", undefined]] as const) {
      const { fetchMock } = mockFetch(() => jsonResponse(429, { code: "rate_limited" }, { "Retry-After": header }));
      const { error } = await collect(ask("q", fetchMock));
      assert.ok(error instanceof ChatClientError);
      assert.equal(error.retryAfterSeconds, expected, header);
    }
  });

  it("never shows the server's own wording, whether from the body or an error event", async () => {
    const { fetchMock } = mockFetch(() => jsonResponse(503, { error: "SECRET-SERVER-TEXT", code: "demo_busy" }));
    const { error } = await collect(ask("q", fetchMock));
    assert.ok(error instanceof Error && !error.message.includes("SECRET-SERVER-TEXT"));
    assert.equal(error.message, friendlyMessage("demo_busy"));
  });

  it("puts the wait time in the message for a rate limit", async () => {
    const { fetchMock } = mockFetch(() => jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "60" }));
    const { error } = await collect(ask("q", fetchMock));
    assert.ok(error instanceof Error && error.message.includes("60 seconds"));
  });
});

describe("askQuestion: a bad or broken stream", () => {
  it("reports a network failure as network", async () => {
    const { fetchMock } = mockFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    const { error } = await collect(ask("q", fetchMock));
    assert.ok(error instanceof ChatClientError && error.code === "network");
  });

  it("rejects a 200 that is not an event stream, such as an HTML fallback page", async () => {
    const { fetchMock } = mockFetch(() => new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    const { error } = await collect(ask("q", fetchMock));
    assert.ok(error instanceof ChatClientError && error.code === "bad_response");
  });

  it("rejects an event whose payload has the wrong shape, without echoing it", async () => {
    const { fetchMock } = mockFetch(() => sseResponse([META, 'event: token\ndata: {"text": 5, "secret": "SECRET-PAYLOAD"}\n\n']));
    const { events, error } = await collect(ask("q", fetchMock));
    assert.deepEqual(
      events.map((event) => event.type),
      ["meta"],
    );
    assert.ok(error instanceof ChatClientError && error.code === "bad_response" && !error.message.includes("SECRET-PAYLOAD"));
  });

  it("reports a stream that ends without done or error as interrupted, keeping the text already shown", async () => {
    const { fetchMock } = mockFetch(() => sseResponse([META + TOKEN_A]));
    const { events, error } = await collect(ask("q", fetchMock));
    assert.deepEqual(
      events.map((event) => event.type),
      ["meta", "token"],
    );
    assert.ok(error instanceof ChatClientError && error.code === "stream_interrupted");
  });

  it("reports a stream cut in the middle of a frame as interrupted", async () => {
    const { fetchMock } = mockFetch(() => sseResponse([META + TOKEN_A + 'event: done\ndata: {"cit']));
    const { events, error } = await collect(ask("q", fetchMock));
    assert.equal(events.length, 2);
    assert.ok(error instanceof ChatClientError && error.code === "stream_interrupted");
  });

  it("reports a connection that dies mid-answer as interrupted", async () => {
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(encoder.encode(META + TOKEN_A));
        } else {
          controller.error(new Error("connection reset"));
        }
      },
    });
    const { fetchMock } = mockFetch(() => new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));
    const { events, error } = await collect(ask("q", fetchMock));
    assert.equal(events.length, 2);
    assert.ok(error instanceof ChatClientError && error.code === "stream_interrupted");
  });
});

describe("askQuestion: cancelling", () => {
  it("passes the abort through as the browser's AbortError, not as a ChatClientError", async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetchMock } = mockFetch(({ init }) => {
      if (init.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      return sseResponse([DONE]);
    });
    const { error } = await collect(ask("q", fetchMock, { signal: controller.signal }));
    assert.ok(isAbortError(error));
    assert.ok(!(error instanceof ChatClientError));
  });

  it("stops mid-stream with an AbortError after the events already received", async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(encoder.encode(META + TOKEN_A));
        controller.signal.addEventListener("abort", () =>
          streamController.error(new DOMException("The operation was aborted.", "AbortError")),
        );
      },
    });
    const { fetchMock } = mockFetch(() => new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));

    const events: ChatEvent[] = [];
    let thrown: unknown;
    try {
      for await (const event of ask("q", fetchMock, { signal: controller.signal })) {
        events.push(event);
        if (event.type === "token") controller.abort();
      }
    } catch (error) {
      thrown = error;
    }
    assert.ok(isAbortError(thrown), "an AbortError");
    assert.deepEqual(
      events.map((event) => event.type),
      ["meta", "token"],
    );
  });
});

describe("error codes and messages", () => {
  it("has a non-empty friendly message for every code", () => {
    const codes: ChatErrorCode[] = [
      "invalid_question", "rate_limited", "demo_busy", "timeout", "upstream_unavailable", "prompt_blocked",
      "payload_too_large", "bad_request", "network", "bad_response", "stream_interrupted", "internal_error",
    ];
    for (const code of codes) {
      assert.ok(friendlyMessage(code).length > 10, code);
      assert.equal(normalizeErrorCode(code), code);
    }
  });

  it("falls back for a code it does not know", () => {
    assert.equal(normalizeErrorCode("brand_new_code"), "internal_error");
    assert.equal(normalizeErrorCode("brand_new_code", "bad_request"), "bad_request");
  });

  it("adds the wait time only for the codes where waiting helps", () => {
    assert.match(friendlyMessage("rate_limited", 60), /60 seconds/);
    assert.match(friendlyMessage("demo_busy", 60), /60 seconds/);
    assert.doesNotMatch(friendlyMessage("timeout", 60), /seconds\)/);
  });
});
