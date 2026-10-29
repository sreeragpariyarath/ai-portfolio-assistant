import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GeminiError, createGeminiClient } from "../src/gemini.ts";

const API_KEY = "test-key-should-never-appear";
const MODEL = "gemini-embedding-2";
const DIMS = 4;

interface Call {
  url: string;
  headers: Record<string, string>;
  body: any;
}

type Reply = Response | Error;

function vector(seed: number): number[] {
  return Array.from({ length: DIMS }, (_, i) => seed + i / 10);
}

function batchReply(count: number, seed = 0): Response {
  return Response.json({ embeddings: Array.from({ length: count }, (_, i) => ({ values: vector(seed + i) })) });
}

// Replies are consumed in order; the last one repeats if the client asks again.
function mockFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)),
    });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)]!;
    if (reply instanceof Error) throw reply;
    return reply.clone();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function client(replies: Reply[], extra: Partial<Parameters<typeof createGeminiClient>[0]> = {}) {
  const { calls, fetchImpl } = mockFetch(replies);
  const sleeps: number[] = [];
  const gemini = createGeminiClient({
    apiKey: API_KEY,
    model: MODEL,
    dims: DIMS,
    fetch: fetchImpl,
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0,
    ...extra,
  });
  return { gemini, calls, sleeps };
}

describe("createGeminiClient request shape", () => {
  it("sends documents with the document prefix, one request item each, to batchEmbedContents", async () => {
    const { gemini, calls } = client([batchReply(2)]);
    const vectors = await gemini.embedDocuments([
      { title: "A", content: "first" },
      { title: "B", content: "second" },
    ]);

    assert.equal(vectors.length, 2);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`);
    assert.equal(calls[0]!.headers["x-goog-api-key"], API_KEY);
    assert.deepEqual(calls[0]!.body.requests, [
      {
        model: `models/${MODEL}`,
        content: { parts: [{ text: "title: A | text: first" }] },
        output_dimensionality: DIMS,
      },
      {
        model: `models/${MODEL}`,
        content: { parts: [{ text: "title: B | text: second" }] },
        output_dimensionality: DIMS,
      },
    ]);
  });

  it("sends a query with the query prefix to embedContent", async () => {
    const { gemini, calls } = client([Response.json({ embedding: { values: vector(1) } })]);
    assert.deepEqual(await gemini.embedQuery("what did Alex build?"), vector(1));
    assert.ok(calls[0]!.url.endsWith(`/models/${MODEL}:embedContent`));
    assert.equal(calls[0]!.body.content.parts[0].text, "task: search result | query: what did Alex build?");
    assert.equal(calls[0]!.body.output_dimensionality, DIMS);
  });
});

describe("batching", () => {
  it("splits into batches and keeps the input order", async () => {
    const docs = Array.from({ length: 5 }, (_, i) => ({ title: `T${i}`, content: `C${i}` }));
    const { gemini, calls } = client([batchReply(2, 0), batchReply(2, 2), batchReply(1, 4)], { batchSize: 2 });

    const vectors = await gemini.embedDocuments(docs);

    assert.deepEqual(calls.map((call) => call.body.requests.length), [2, 2, 1]);
    assert.deepEqual(vectors, [0, 1, 2, 3, 4].map(vector));
  });

  it("makes no request for an empty list", async () => {
    const { gemini, calls } = client([batchReply(0)]);
    assert.deepEqual(await gemini.embedDocuments([]), []);
    assert.equal(calls.length, 0);
  });

  it("rejects a response with the wrong number of embeddings", async () => {
    const { gemini } = client([batchReply(1)]);
    await assert.rejects(
      gemini.embedDocuments([
        { title: "A", content: "a" },
        { title: "B", content: "b" },
      ]),
      GeminiError,
    );
  });
});

describe("retries", () => {
  it("retries a 429 and then succeeds, backing off exponentially", async () => {
    const { gemini, calls, sleeps } = client([
      new Response("quota", { status: 429 }),
      new Response("quota", { status: 429 }),
      batchReply(1),
    ]);
    const vectors = await gemini.embedDocuments([{ title: "A", content: "a" }]);
    assert.equal(vectors.length, 1);
    assert.equal(calls.length, 3);
    assert.deepEqual(sleeps, [500, 1000]);
  });

  it("honors Retry-After when it is longer than the backoff", async () => {
    const { gemini, sleeps } = client([
      new Response("slow down", { status: 429, headers: { "retry-after": "7" } }),
      batchReply(1),
    ]);
    await gemini.embedDocuments([{ title: "A", content: "a" }]);
    assert.deepEqual(sleeps, [7000]);
  });

  it("retries a 503 and a network error", async () => {
    const { gemini, calls } = client([new Response("", { status: 503 }), new TypeError("fetch failed"), batchReply(1)]);
    await gemini.embedDocuments([{ title: "A", content: "a" }]);
    assert.equal(calls.length, 3);
  });

  it("does not retry a 400", async () => {
    const { gemini, calls } = client([new Response("bad request", { status: 400 }), batchReply(1)]);
    await assert.rejects(
      gemini.embedDocuments([{ title: "A", content: "a" }]),
      (error: GeminiError) => error.status === 400,
    );
    assert.equal(calls.length, 1);
  });

  it("gives up after maxRetries and reports the status", async () => {
    const { gemini, calls } = client([new Response("", { status: 429 })], { maxRetries: 2 });
    await assert.rejects(
      gemini.embedDocuments([{ title: "A", content: "a" }]),
      (error: GeminiError) => error.status === 429,
    );
    assert.equal(calls.length, 3);
  });
});

describe("safety", () => {
  it("never puts the API key, the request text or Google's error body in an error message", async () => {
    const secretText = "private-looking-text-xyz";
    const { gemini } = client([new Response(`echo: ${secretText} ${API_KEY}`, { status: 400 })]);
    await assert.rejects(gemini.embedDocuments([{ title: "T", content: secretText }]), (error: Error) => {
      assert.ok(!error.message.includes(API_KEY));
      assert.ok(!error.message.includes(secretText));
      return true;
    });
  });

  it("does not leak the key or text when the network fails", async () => {
    const { gemini } = client([new TypeError(`fetch failed for key ${API_KEY}`)], { maxRetries: 0 });
    await assert.rejects(gemini.embedQuery("secret question"), (error: Error) => {
      assert.ok(!error.message.includes(API_KEY));
      assert.ok(!error.message.includes("secret question"));
      return true;
    });
  });

  it("rejects vectors of the wrong dimension", async () => {
    const wrong = Response.json({ embeddings: [{ values: [0.1, 0.2] }] });
    const { gemini } = client([wrong]);
    await assert.rejects(gemini.embedDocuments([{ title: "A", content: "a" }]), /finite embedding values/);
  });

  it("rejects an empty API key up front", () => {
    assert.throws(() => createGeminiClient({ apiKey: "  ", model: MODEL, dims: DIMS }), GeminiError);
  });
});
