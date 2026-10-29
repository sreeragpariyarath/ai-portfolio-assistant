import { env } from "cloudflare:test";
import { createWorker } from "../src/index";
import { OVERALL_TIMEOUT_MS } from "../src/chat";

// Secrets come from .dev.vars locally and do not exist in CI, so tests set their own fake ones.
export const testEnv = {
  ...env,
  GEMINI_API_KEY: "test-gemini-key",
  QDRANT_URL: "https://qdrant.test:6333",
  QDRANT_API_KEY: "test-qdrant-key",
} as Env;

export const ORIGIN = "http://localhost:3000"; // ALLOWED_ORIGIN in wrangler.jsonc

export interface UpstreamCall {
  url: string;
  body: any;
}

export interface UpstreamOptions {
  // Called for each streamGenerateContent request: the model name from the URL and a 0-based call number.
  generation?: (model: string, call: number) => Response | Promise<Response>;
  // Points Qdrant returns; a Response replaces the whole reply (for failures).
  qdrant?: { id: string; score: number }[] | Response;
  embed?: Response;
}

export function sseResponse(texts: string[], finishReason: string | null = "STOP"): Response {
  const events = texts.map((text, i) => ({
    candidates: [{ content: { parts: [{ text }] }, ...(finishReason && i === texts.length - 1 ? { finishReason } : {}) }],
  }));
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

// A fetch that plays Gemini (embedding and generation) and Qdrant. Nothing leaves the test.
export function mockUpstreams(options: UpstreamOptions = {}) {
  const calls: UpstreamCall[] = [];
  let generationCalls = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });

    if (url.includes(":embedContent")) {
      return options.embed?.clone() ?? Response.json({ embedding: { values: new Array(768).fill(0.01) } });
    }
    if (url.includes("/points/query")) {
      const qdrant = options.qdrant ?? [];
      if (qdrant instanceof Response) return qdrant.clone();
      return Response.json({
        result: {
          points: qdrant.map((point) => ({ id: `p-${point.id}`, score: point.score, payload: { record_id: point.id, visibility: "public" } })),
        },
      });
    }
    if (url.includes(":streamGenerateContent")) {
      const model = /models\/([^:]+):/.exec(url)?.[1] ?? "";
      const reply = options.generation ? options.generation(model, generationCalls++) : sseResponse(["BEHAVIOR: answer\n", "Hello."]);
      return reply;
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  }) as typeof fetch;
  return { calls, fetch: fetchImpl };
}

export function workerWith(options: UpstreamOptions = {}, overrides: { overallTimeoutMs?: number } = {}) {
  const upstreams = mockUpstreams(options);
  const worker = createWorker({
    fetch: upstreams.fetch,
    now: () => new Date("2026-10-29T12:00:00Z"),
    overallTimeoutMs: overrides.overallTimeoutMs ?? OVERALL_TIMEOUT_MS,
  });
  return { ...upstreams, worker };
}

export function chatRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export interface SseEvent {
  event: string;
  data: any;
}

export async function readEvents(response: Response): Promise<SseEvent[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((block) => block.trim() !== "")
    .map((block) => {
      const lines = block.split("\n");
      const event = lines.find((line) => line.startsWith("event: "))?.slice(7) ?? "";
      const data = lines.find((line) => line.startsWith("data: "))?.slice(6) ?? "null";
      return { event, data: JSON.parse(data) };
    });
}
