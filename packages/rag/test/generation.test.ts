import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GenerationError,
  PromptBlockedError,
  QuotaError,
  createGenerationClient,
  type GenerationClientOptions,
  type GenerationEvent,
} from "../src/generation.ts";

const API_KEY = "test-key-should-never-appear";
const PROMPT = { systemInstruction: "SYSTEM-TEXT", userText: "USER-TEXT-SECRET-QUESTION" };

interface Call {
  url: string;
  headers: Record<string, string>;
  body: any;
}

type Reply = Response | Error | (() => Promise<Response>);

function chunk(text: string, finishReason?: string, extra: Record<string, unknown> = {}) {
  return {
    candidates: [{ content: { role: "model", parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }],
    ...extra,
  };
}

function sse(events: unknown[], eol = "\n"): string {
  return events.map((event) => `data: ${JSON.stringify(event)}${eol}${eol}`).join("");
}

// Splits a string into a streamed body at the given cut points (in characters).
function streamBody(text: string, cuts: number[] = []): Response {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const points = [0, ...cuts.map((cut) => encoder.encode(text.slice(0, cut)).length), bytes.length];
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i + 1 < points.length; i++) controller.enqueue(bytes.slice(points[i], points[i + 1]));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

function mockFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)]!;
    if (reply instanceof Error) throw reply;
    if (typeof reply === "function") return reply();
    return reply.clone();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function client(replies: Reply[], extra: Partial<GenerationClientOptions> = {}) {
  const { calls, fetchImpl } = mockFetch(replies);
  const sleeps: number[] = [];
  const gemini = createGenerationClient({
    apiKey: API_KEY,
    model: "primary-model",
    fetch: fetchImpl,
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0,
    ...extra,
  });
  return { gemini, calls, sleeps };
}

async function collect(events: AsyncIterable<GenerationEvent>): Promise<GenerationEvent[]> {
  const out: GenerationEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

const textOf = (events: GenerationEvent[]) => events.flatMap((event) => (event.type === "text" ? [event.text] : [])).join("");

describe("streamGenerate", () => {
  it("sends the prompt to streamGenerateContent with alt=sse and the key in a header only", async () => {
    const { gemini, calls } = client([streamBody(sse([chunk("Hi", "STOP")]))]);
    await collect((await gemini.streamGenerate(PROMPT)).events);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "https://generativelanguage.googleapis.com/v1beta/models/primary-model:streamGenerateContent?alt=sse");
    assert.equal(calls[0]!.headers["x-goog-api-key"], API_KEY);
    assert.ok(!calls[0]!.url.includes(API_KEY));
    assert.deepEqual(calls[0]!.body.systemInstruction, { parts: [{ text: "SYSTEM-TEXT" }] });
    assert.deepEqual(calls[0]!.body.contents, [{ role: "user", parts: [{ text: "USER-TEXT-SECRET-QUESTION" }] }]);
    assert.equal(calls[0]!.body.generationConfig.maxOutputTokens, 800);
  });

  it("yields the text pieces in order, then done", async () => {
    const { gemini } = client([
      streamBody(sse([chunk("BEHAVIOR: answer\n"), chunk("Alex built it."), chunk(" Done.", "STOP", { usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 9 } })])),
    ]);
    const stream = await gemini.streamGenerate(PROMPT);
    const events = await collect(stream.events);

    assert.equal(stream.model, "primary-model");
    assert.deepEqual(events.slice(0, 3), [
      { type: "text", text: "BEHAVIOR: answer\n" },
      { type: "text", text: "Alex built it." },
      { type: "text", text: " Done." },
    ]);
    assert.deepEqual(events[3], { type: "done", finishReason: "STOP", truncated: false, usage: { promptTokens: 120, outputTokens: 9 } });
  });

  it("parses the same events whatever way the network cuts the bytes, including mid-line and mid-character", async () => {
    const body = sse([chunk("Café – first. "), chunk("Second.", "STOP")]);
    const expected = "Café – first. Second.";
    for (let cut = 0; cut <= body.length; cut++) {
      const { gemini } = client([streamBody(body, [cut])]);
      const events = await collect((await gemini.streamGenerate(PROMPT)).events);
      assert.equal(textOf(events), expected, `cut at ${cut}`);
      assert.equal(events.at(-1)?.type, "done");
    }
  });

  it("accepts CRLF line endings and ignores comments, event names and the [DONE] marker", async () => {
    const body = `: keep-alive\r\nevent: message\r\n${sse([chunk("One.")], "\r\n")}data: [DONE]\r\n\r\n${sse([chunk(" Two.", "STOP")], "\r\n")}`;
    const { gemini } = client([streamBody(body)]);
    assert.equal(textOf(await collect((await gemini.streamGenerate(PROMPT)).events)), "One. Two.");
  });

  it("reads the last data line even without a trailing newline", async () => {
    const body = `data: ${JSON.stringify(chunk("Last.", "STOP"))}`;
    const { gemini } = client([streamBody(body)]);
    assert.equal(textOf(await collect((await gemini.streamGenerate(PROMPT)).events)), "Last.");
  });

  it("ignores thought parts", async () => {
    const thoughtChunk = { candidates: [{ content: { parts: [{ text: "secret reasoning", thought: true }, { text: "Answer." }] }, finishReason: "STOP" }] };
    const { gemini } = client([streamBody(sse([thoughtChunk]))]);
    assert.equal(textOf(await collect((await gemini.streamGenerate(PROMPT)).events)), "Answer.");
  });

  it("marks MAX_TOKENS and CONTINUATION as truncated, not as failures", async () => {
    for (const reason of ["MAX_TOKENS", "CONTINUATION"]) {
      const { gemini } = client([streamBody(sse([chunk("Cut off", reason)]))]);
      const events = await collect((await gemini.streamGenerate(PROMPT)).events);
      assert.deepEqual(events.at(-1), { type: "done", finishReason: reason, truncated: true });
    }
  });

  it("throws a typed error for other finish reasons, after the text already streamed", async () => {
    const { gemini } = client([streamBody(sse([chunk("Partial"), chunk(" text", "SAFETY")]))]);
    const stream = await gemini.streamGenerate(PROMPT);
    const seen: string[] = [];
    await assert.rejects(
      (async () => {
        for await (const event of stream.events) if (event.type === "text") seen.push(event.text);
      })(),
      (error: unknown) => error instanceof GenerationError && error.code === "finish_reason" && /SAFETY/.test(error.message),
    );
    assert.deepEqual(seen, ["Partial", " text"]);
  });

  it("rejects an empty answer and a stream that ends without a finish reason", async () => {
    const empty = client([streamBody(sse([chunk("", "STOP")]))]);
    await assert.rejects(
      async () => collect((await empty.gemini.streamGenerate(PROMPT)).events),
      (error: unknown) => error instanceof GenerationError && error.code === "empty_response",
    );

    const cutOff = client([streamBody(sse([chunk("Some text")]))]);
    const stream = await cutOff.gemini.streamGenerate(PROMPT);
    await assert.rejects(collect(stream.events), (error: unknown) => error instanceof GenerationError && error.code === "incomplete_stream");
  });

  it("rejects before streaming when the prompt is blocked, with the reason", async () => {
    const { gemini } = client([streamBody(sse([{ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }]))]);
    await assert.rejects(
      gemini.streamGenerate(PROMPT),
      (error: unknown) => error instanceof PromptBlockedError && error.blockReason === "PROHIBITED_CONTENT" && error.code === "prompt_blocked",
    );
  });

  it("rejects with a typed error when a data line is not JSON", async () => {
    const { gemini } = client([streamBody("data: {not json\n\n")]);
    await assert.rejects(
      gemini.streamGenerate(PROMPT),
      (error: unknown) => error instanceof GenerationError && error.code === "invalid_stream",
    );
  });

  it("maps 429 to QuotaError at once, without retrying or sleeping", async () => {
    const { gemini, calls, sleeps } = client([new Response("quota body with USER-TEXT-SECRET-QUESTION", { status: 429, headers: { "retry-after": "20" } })]);
    await assert.rejects(gemini.streamGenerate(PROMPT), (error: unknown) => error instanceof QuotaError && error.status === 429);
    assert.equal(calls.length, 1);
    assert.deepEqual(sleeps, []);
  });

  it("retries a 503 once before the first byte, then succeeds", async () => {
    const { gemini, calls, sleeps } = client([new Response("", { status: 503 }), streamBody(sse([chunk("OK", "STOP")]))]);
    assert.equal(textOf(await collect((await gemini.streamGenerate(PROMPT)).events)), "OK");
    assert.equal(calls.length, 2);
    assert.equal(sleeps.length, 1);
  });

  it("does not retry a 400, and the error leaks no key, prompt or response body", async () => {
    const { gemini, calls } = client([new Response(`bad request ${API_KEY} USER-TEXT-SECRET-QUESTION`, { status: 400 })]);
    await assert.rejects(gemini.streamGenerate(PROMPT), (error: unknown) => {
      assert.ok(error instanceof GenerationError);
      assert.equal(error.code, "http");
      assert.equal(error.status, 400);
      assert.ok(!error.message.includes(API_KEY) && !error.message.includes("USER-TEXT"));
      return true;
    });
    assert.equal(calls.length, 1);
  });

  it("times out a hung request with a typed network error", async () => {
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch;
    const gemini = createGenerationClient({ apiKey: API_KEY, model: "primary-model", fetch: fetchImpl, timeoutMs: 20, maxRetries: 0 });
    // AbortSignal.timeout does not keep Node's event loop alive, so hold it open while the request hangs.
    const keepAlive = setTimeout(() => {}, 5_000);
    try {
      await assert.rejects(gemini.streamGenerate(PROMPT), (error: unknown) => error instanceof GenerationError && error.code === "network");
    } finally {
      clearTimeout(keepAlive);
    }
  });

  it("fails with a typed error when the stream dies mid-answer, and keeps the text that arrived", async () => {
    const encoder = new TextEncoder();
    let pulls = 0;
    const broken = new Response(
      new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            // First read delivers the text; the next one fails like a dropped connection.
            if (pulls++ === 0) controller.enqueue(encoder.encode(sse([chunk("Half an answer")])));
            else controller.error(new Error("connection reset"));
          },
        },
        { highWaterMark: 0 },
      ),
    );
    const { gemini } = client([broken]);
    const stream = await gemini.streamGenerate(PROMPT);
    const seen: string[] = [];
    await assert.rejects(
      (async () => {
        for await (const event of stream.events) if (event.type === "text") seen.push(event.text);
      })(),
      (error: unknown) => error instanceof GenerationError && error.code === "network",
    );
    assert.deepEqual(seen, ["Half an answer"]);
  });
});

describe("fallback model", () => {
  const options = { fallbackModel: "fallback-model" };

  it("uses the fallback when the primary returns 429, and says which model answered", async () => {
    const { gemini, calls } = client([new Response("", { status: 429 }), streamBody(sse([chunk("From fallback", "STOP")]))], options);
    const stream = await gemini.streamGenerate(PROMPT);

    assert.equal(stream.model, "fallback-model");
    assert.equal(textOf(await collect(stream.events)), "From fallback");
    assert.ok(calls[0]!.url.includes("/models/primary-model:"));
    assert.ok(calls[1]!.url.includes("/models/fallback-model:"));
  });

  it("uses the fallback after the primary keeps returning 503, and after a network failure", async () => {
    const down = client([new Response("", { status: 503 }), new Response("", { status: 503 }), streamBody(sse([chunk("ok", "STOP")]))], options);
    assert.equal((await down.gemini.streamGenerate(PROMPT)).model, "fallback-model");

    const offline = client([new Error("offline"), new Error("offline"), streamBody(sse([chunk("ok", "STOP")]))], options);
    assert.equal((await offline.gemini.streamGenerate(PROMPT)).model, "fallback-model");
  });

  it("does not use the fallback for a blocked prompt or a client error", async () => {
    const blocked = client([streamBody(sse([{ promptFeedback: { blockReason: "SAFETY" } }]))], options);
    await assert.rejects(blocked.gemini.streamGenerate(PROMPT), PromptBlockedError);
    assert.equal(blocked.calls.length, 1);

    const forbidden = client([new Response("", { status: 403 })], options);
    await assert.rejects(forbidden.gemini.streamGenerate(PROMPT), GenerationError);
    assert.equal(forbidden.calls.length, 1);
  });

  it("throws QuotaError when the fallback is also out of quota", async () => {
    const { gemini, calls } = client([new Response("", { status: 429 })], options);
    await assert.rejects(gemini.streamGenerate(PROMPT), QuotaError);
    assert.equal(calls.length, 2);
  });

  it("does not switch models once streaming has started", async () => {
    const { gemini, calls } = client([streamBody(sse([chunk("Start"), chunk(" end", "SAFETY")]))], options);
    const stream = await gemini.streamGenerate(PROMPT);
    await assert.rejects(collect(stream.events), GenerationError);
    assert.equal(calls.length, 1);
  });

  it("ignores a fallback that is the same model as the primary", async () => {
    const { gemini, calls } = client([new Response("", { status: 429 })], { fallbackModel: "primary-model" });
    await assert.rejects(gemini.streamGenerate(PROMPT), QuotaError);
    assert.equal(calls.length, 1);
  });
});

describe("generate", () => {
  it("returns the text, finish reason and usage from generateContent", async () => {
    const reply = Response.json(chunk("BEHAVIOR: answer\nHello.", "STOP", { usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 7 } }));
    const { gemini, calls } = client([reply]);
    const result = await gemini.generate(PROMPT);

    assert.deepEqual(result, {
      text: "BEHAVIOR: answer\nHello.",
      model: "primary-model",
      finishReason: "STOP",
      truncated: false,
      usage: { promptTokens: 50, outputTokens: 7 },
    });
    assert.equal(calls[0]!.url, "https://generativelanguage.googleapis.com/v1beta/models/primary-model:generateContent");
  });

  it("maps a blocked prompt, a quota error and a bad finish reason to typed errors", async () => {
    await assert.rejects(client([Response.json({ promptFeedback: { blockReason: "OTHER" } })]).gemini.generate(PROMPT), PromptBlockedError);
    await assert.rejects(client([new Response("", { status: 429 })]).gemini.generate(PROMPT), QuotaError);
    await assert.rejects(
      client([Response.json(chunk("x", "RECITATION"))]).gemini.generate(PROMPT),
      (error: unknown) => error instanceof GenerationError && error.code === "finish_reason",
    );
  });

  it("falls back on 429 too", async () => {
    const { gemini } = client([new Response("", { status: 429 }), Response.json(chunk("ok", "STOP"))], { fallbackModel: "fallback-model" });
    assert.equal((await gemini.generate(PROMPT)).model, "fallback-model");
  });
});

describe("createGenerationClient", () => {
  it("refuses an empty API key", () => {
    assert.throws(() => createGenerationClient({ apiKey: "  ", model: "m" }), GenerationError);
  });
});
