import { describe, expect, it } from "vitest";
import { QuotaError, createGenerationClient } from "@portfolio/rag";

// Runs the generation client in the Workers runtime (real streams and TextDecoder) with a mocked fetch.
const PROMPT = { systemInstruction: "system", userText: "user" };

function sse(...texts: string[]): Response {
  const events = texts.map((text, i) => ({
    candidates: [{ content: { parts: [{ text }] }, ...(i === texts.length - 1 ? { finishReason: "STOP" } : {}) }],
  }));
  const body = events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

describe("generation client in the Workers runtime", () => {
  it("streams text and a done event", async () => {
    const fetchImpl = (async () => sse("BEHAVIOR: answer\n", "Hello.")) as typeof fetch;
    const client = createGenerationClient({ apiKey: "k", model: "primary", fetch: fetchImpl });
    const stream = await client.streamGenerate(PROMPT);

    const events = [];
    for await (const event of stream.events) events.push(event);

    expect(events.map((event) => event.type)).toEqual(["text", "text", "done"]);
    expect(events.filter((event) => event.type === "text").map((event) => event.text).join("")).toBe("BEHAVIOR: answer\nHello.");
  });

  it("fails over to the fallback model on 429, and reports QuotaError when both are out", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      urls.push(String(url));
      return urls.length === 1 ? new Response("", { status: 429 }) : sse("From fallback");
    }) as typeof fetch;
    const client = createGenerationClient({ apiKey: "k", model: "primary", fallbackModel: "fallback", fetch: fetchImpl });
    expect((await client.streamGenerate(PROMPT)).model).toBe("fallback");

    const busy = createGenerationClient({
      apiKey: "k",
      model: "primary",
      fallbackModel: "fallback",
      fetch: (async () => new Response("", { status: 429 })) as typeof fetch,
    });
    await expect(busy.streamGenerate(PROMPT)).rejects.toBeInstanceOf(QuotaError);
  });
});
