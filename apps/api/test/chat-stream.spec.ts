import { afterEach, describe, expect, it, vi } from "vitest";
import { ORIGIN, chatRequest, readEvents, sseResponse, testEnv, workerWith } from "./helpers";

// All upstreams (Gemini embedding, Qdrant, Gemini generation) are mocked: nothing here touches the network.
const QUESTION = "What did Alex personally implement on the support assistant?";

afterEach(() => vi.restoreAllMocks());

describe("POST /api/chat answer stream", () => {
  it("streams meta, then tokens, then done, with the right headers", async () => {
    const { worker } = workerWith({
      qdrant: [{ id: "contribution-demo-001", score: 0.9 }],
      generation: () => sseResponse(["BEHAVIOR: answer\n", "Alex wrote ", "the validation [contribution-demo-001]."]),
    });
    const response = await worker.fetch(chatRequest({ question: QUESTION }, { Origin: ORIGIN }), testEnv);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);

    const events = await readEvents(response);
    expect(events[0]?.event).toBe("meta");
    expect(events.at(-1)?.event).toBe("done");
    expect(events.slice(1, -1).every((event) => event.event === "token")).toBe(true);

    const meta = events[0]!.data;
    expect(meta.behavior).toBe("answer");
    expect(meta.behaviorValid).toBe(true);
    expect(meta.degraded).toBe(false);
    expect(meta.retrieved).toContain("contribution-demo-001");

    const text = events.filter((event) => event.event === "token").map((event) => event.data.text).join("");
    expect(text).toBe("Alex wrote the validation [contribution-demo-001].");
    expect(events.at(-1)!.data).toEqual({
      citations: ["contribution-demo-001"],
      invalidCitationsDropped: 0,
      truncated: false,
      model: "gemini-3.5-flash-lite",
    });
  });

  it("never streams a citation that was not retrieved, even when it is split across chunks", async () => {
    const { worker } = workerWith({
      qdrant: [{ id: "contribution-demo-001", score: 0.9 }],
      generation: () => sseResponse(["BEHAVIOR: answer\nTrue fact [contribution-demo-001]. Made up [project-de", "mo-404] and private [private-demo-001].", " End."]),
    });
    const response = await worker.fetch(chatRequest({ question: QUESTION }), testEnv);
    const events = await readEvents(response);

    const text = events.filter((event) => event.event === "token").map((event) => event.data.text).join("");
    expect(text).toBe("True fact [contribution-demo-001]. Made up and private. End.");
    expect(text).not.toContain("project-demo-404");
    expect(text).not.toContain("private-demo-001");
    expect(events.at(-1)!.data).toMatchObject({ citations: ["contribution-demo-001"], invalidCitationsDropped: 2 });
  });

  it("sends meta before the first token, and a missing behavior line becomes qualify", async () => {
    const { worker } = workerWith({ generation: () => sseResponse(["No behavior line here."]) });
    const events = await readEvents(await worker.fetch(chatRequest({ question: QUESTION }), testEnv));

    expect(events[0]?.event).toBe("meta");
    expect(events[0]!.data).toMatchObject({ behavior: "qualify", behaviorValid: false });
    expect(events[1]).toEqual({ event: "token", data: { text: "No behavior line here." } });
  });

  it("puts the question, the retrieved records and today's date in the prompt, and never a private record", async () => {
    const { worker, calls } = workerWith({
      qdrant: [
        { id: "private-demo-001", score: 0.99 },
        { id: "contribution-demo-001", score: 0.5 },
      ],
    });
    await (await worker.fetch(chatRequest({ question: QUESTION }), testEnv)).text();

    const generation = calls.find((call) => call.url.includes(":streamGenerateContent"))!;
    const prompt = JSON.stringify(generation.body);
    expect(prompt).toContain(QUESTION);
    expect(prompt).toContain('id=\\"contribution-demo-001\\"');
    expect(prompt).toContain("Today's date: 2026-10-29");
    expect(prompt).not.toContain("private-demo-001");
    expect(generation.url).toContain("/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse");
    expect(calls.find((call) => call.url.includes("/points/query"))!.body.filter).toEqual({
      must: [{ key: "visibility", match: { value: "public" } }],
    });
  });

  it("still answers from BM25 when Qdrant or the embedding call fails, and says it was degraded", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const broken of [{ qdrant: new Response("", { status: 500 }) }, { embed: new Response("", { status: 400 }) }]) {
      const { worker } = workerWith(broken);
      const events = await readEvents(await worker.fetch(chatRequest({ question: QUESTION }), testEnv));

      expect(events[0]!.data.degraded).toBe(true);
      expect(events[0]!.data.retrieved.length).toBeGreaterThan(0);
      expect(events.at(-1)?.event).toBe("done");
    }
  });

  it("uses the fallback model when the primary is out of quota, and reports it in done", async () => {
    const { worker, calls } = workerWith({
      generation: (model) => (model === "gemini-3.5-flash-lite" ? new Response("", { status: 429 }) : sseResponse(["BEHAVIOR: answer\nFrom fallback."])),
    });
    const events = await readEvents(await worker.fetch(chatRequest({ question: QUESTION }), testEnv));

    expect(events.at(-1)!.data.model).toBe("gemini-3.1-flash-lite");
    expect(calls.filter((call) => call.url.includes(":streamGenerateContent")).map((call) => /models\/([^:]+):/.exec(call.url)![1])).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
    ]);
  });

  it("returns 503 demo_busy as JSON, with Retry-After, when both models are out of quota", async () => {
    const { worker } = workerWith({ generation: () => new Response("", { status: 429 }) });
    const response = await worker.fetch(chatRequest({ question: QUESTION }, { Origin: ORIGIN }), testEnv);

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(await response.json()).toMatchObject({ code: "demo_busy" });
  });

  it("returns 503 upstream_unavailable as JSON when Gemini is down before streaming", async () => {
    const { worker } = workerWith({ generation: () => new Response("", { status: 500 }) });
    const response = await worker.fetch(chatRequest({ question: QUESTION }), testEnv);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "upstream_unavailable" });
  });

  it("returns 400 prompt_blocked when Gemini blocks the prompt", async () => {
    const blocked = new Response(`data: ${JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })}\n\n`, { headers: { "content-type": "text/event-stream" } });
    const { worker } = workerWith({ generation: () => blocked });
    const response = await worker.fetch(chatRequest({ question: QUESTION }), testEnv);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "prompt_blocked" });
  });

  it("sends an error event, after the tokens already sent, when Gemini fails mid-stream", async () => {
    const { worker } = workerWith({ generation: () => sseResponse(["BEHAVIOR: answer\nPartial answer", " cut"], "SAFETY") });
    const response = await worker.fetch(chatRequest({ question: QUESTION }), testEnv);

    expect(response.status).toBe(200);
    const events = await readEvents(response);
    expect(events[0]?.event).toBe("meta");
    expect(events.filter((event) => event.event === "token").map((event) => event.data.text).join("")).toContain("Partial answer");
    expect(events.at(-1)).toEqual({ event: "error", data: { code: "upstream_unavailable", message: "The answer service is unavailable. Please try again later." } });
    expect(events.some((event) => event.event === "done")).toBe(false);
  });

  it("marks a reply that hit the output limit as truncated", async () => {
    const { worker } = workerWith({ generation: () => sseResponse(["BEHAVIOR: answer\nLong answer"], "MAX_TOKENS") });
    const events = await readEvents(await worker.fetch(chatRequest({ question: QUESTION }), testEnv));
    expect(events.at(-1)!.data.truncated).toBe(true);
  });

  it("returns 503 timeout as JSON when the answer does not start within the overall budget", async () => {
    const { worker } = workerWith({ generation: () => new Promise<Response>(() => {}) as unknown as Response }, { overallTimeoutMs: 100 });
    const response = await worker.fetch(chatRequest({ question: QUESTION }), testEnv);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "timeout" });
  });

  it("logs one structured line per request, with no question text, answer text or keys", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { worker } = workerWith({
      qdrant: [{ id: "contribution-demo-001", score: 0.9 }],
      generation: () => sseResponse(["BEHAVIOR: answer\nAlex wrote validation [contribution-demo-001]."]),
    });
    await (await worker.fetch(chatRequest({ question: QUESTION }), testEnv)).text();

    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]?.[0]);
    const entry = JSON.parse(line);
    expect(entry).toMatchObject({ event: "chat", status: 200, behavior: "answer", citations: 1, invalidCitationsDropped: 0, model: "gemini-3.5-flash-lite" });
    expect(entry.retrieved).toMatchObject({ dense: 1, droppedDense: 0 });
    expect(typeof entry.latencyMs).toBe("number");
    for (const secret of ["support assistant", "Alex wrote", "test-gemini-key", "test-qdrant-key", "qdrant.test"]) {
      expect(line).not.toContain(secret);
    }
  });

  it("logs the failure code, still with no question text", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { worker } = workerWith({ generation: () => new Response("", { status: 429 }) });
    await worker.fetch(chatRequest({ question: QUESTION }), testEnv);

    const line = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toMatchObject({ event: "chat", status: 503, errorCode: "demo_busy" });
    expect(line).not.toContain("support assistant");
  });

  it("returns a generic 503 that does not name any secret when the Gemini key is missing", async () => {
    const { worker } = workerWith();
    const response = await worker.fetch(chatRequest({ question: QUESTION }), { ...testEnv, GEMINI_API_KEY: "" });

    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("GEMINI");
  });
});
