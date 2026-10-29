// Gemini text generation (Phase 3 task 3.6): one-shot `generate` and streamed `streamGenerate`, with an
// optional fallback model. Runtime-neutral (fetch and streams only). Errors never contain the API key,
// the prompt, or Google's error body.
import type { Prompt } from "./prompt.ts";
import { defaultSleep, sendWithRetry } from "./retry.ts";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
// 429 is not retried: it is a quota signal, so the caller fails over or answers `demo_busy` at once.
const RETRY_STATUSES: ReadonlySet<number> = new Set([500, 502, 503, 504]);
// Finish reasons that mean the text is cut short but usable (D-015). STOP is normal; anything else is a failure.
const TRUNCATED_FINISH_REASONS = new Set(["MAX_TOKENS", "CONTINUATION"]);

export type GenerationErrorCode =
  | "quota"
  | "prompt_blocked"
  | "http"
  | "network"
  | "invalid_stream"
  | "incomplete_stream"
  | "finish_reason"
  | "empty_response";

export class GenerationError extends Error {
  readonly code: GenerationErrorCode;
  readonly status: number | undefined;

  constructor(code: GenerationErrorCode, message: string, status?: number) {
    super(message);
    this.name = "GenerationError";
    this.code = code;
    this.status = status;
  }
}

// HTTP 429 (RESOURCE_EXHAUSTED). The route answers 503 `demo_busy`.
export class QuotaError extends GenerationError {
  constructor(model: string) {
    super("quota", `Gemini quota exhausted for ${model}.`, 429);
    this.name = "QuotaError";
  }
}

// The prompt was blocked before any answer (promptFeedback.blockReason).
export class PromptBlockedError extends GenerationError {
  readonly blockReason: string;

  constructor(blockReason: string) {
    super("prompt_blocked", `Gemini blocked the prompt (${blockReason}).`);
    this.name = "PromptBlockedError";
    this.blockReason = blockReason;
  }
}

export interface GenerationUsage {
  promptTokens?: number;
  outputTokens?: number;
}

export interface GenerationDone {
  finishReason: string;
  // True when the answer hit the output limit (MAX_TOKENS or CONTINUATION).
  truncated: boolean;
  usage?: GenerationUsage;
}

export type GenerationEvent = { type: "text"; text: string } | ({ type: "done" } & GenerationDone);

export interface GenerationResult extends GenerationDone {
  text: string;
  // The model that produced the answer: the fallback if the primary was unavailable.
  model: string;
}

export interface GenerationStream {
  model: string;
  events: AsyncIterable<GenerationEvent>;
}

export interface GenerationClientOptions {
  apiKey: string;
  model: string;
  // Tried when the primary model returns 429, a 5xx or a network failure before any answer text.
  fallbackModel?: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  // Per attempt, and for a streamed answer it covers the whole stream.
  timeoutMs?: number;
  // Retries for 5xx and network errors only, and only before the first byte.
  maxRetries?: number;
  maxOutputTokens?: number;
  temperature?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface GenerationClient {
  generate(prompt: Prompt): Promise<GenerationResult>;
  // Resolves once the first event has arrived, so a quota error, a blocked prompt or an HTTP error rejects
  // here (the route can still answer with JSON). Failures after that surface while iterating `events`.
  streamGenerate(prompt: Prompt): Promise<GenerationStream>;
}

// What one parsed response object (a whole reply, or one stream event) contributes.
interface ChunkInfo {
  text: string;
  finishReason?: string;
  usage?: GenerationUsage;
}

function readChunk(value: unknown): ChunkInfo {
  const body = (value ?? {}) as {
    promptFeedback?: { blockReason?: unknown };
    candidates?: { content?: { parts?: { text?: unknown; thought?: unknown }[] }; finishReason?: unknown }[];
    usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown };
  };

  const blockReason = body.promptFeedback?.blockReason;
  if (typeof blockReason === "string" && blockReason !== "") throw new PromptBlockedError(blockReason);

  const candidate = Array.isArray(body.candidates) ? body.candidates[0] : undefined;
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const text = parts.map((part) => (part.thought === true || typeof part.text !== "string" ? "" : part.text)).join("");

  const info: ChunkInfo = { text };
  if (typeof candidate?.finishReason === "string" && candidate.finishReason !== "") info.finishReason = candidate.finishReason;

  const usage: GenerationUsage = {};
  if (typeof body.usageMetadata?.promptTokenCount === "number") usage.promptTokens = body.usageMetadata.promptTokenCount;
  if (typeof body.usageMetadata?.candidatesTokenCount === "number") usage.outputTokens = body.usageMetadata.candidatesTokenCount;
  if (Object.keys(usage).length > 0) info.usage = usage;
  return info;
}

function finish(finishReason: string | undefined, usage: GenerationUsage | undefined, sawText: boolean): GenerationDone {
  if (finishReason === undefined) throw new GenerationError("incomplete_stream", "Gemini ended the answer without a finish reason.");
  const truncated = TRUNCATED_FINISH_REASONS.has(finishReason);
  if (finishReason !== "STOP" && !truncated) {
    throw new GenerationError("finish_reason", `Gemini stopped the answer early (${finishReason}).`);
  }
  if (!sawText) throw new GenerationError("empty_response", "Gemini returned an empty answer.");
  return { finishReason, truncated, ...(usage ? { usage } : {}) };
}

// Turns a text/event-stream body into parsed `data:` payloads. Tolerant on purpose (D-015): accepts \r\n,
// ignores lines that do not start with `data:` (comments, `event:`, blank lines) and the `[DONE]` marker, and
// handles a line split across network chunks. A `data:` line that is not JSON is a typed error.
async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  function* parseLine(rawLine: string): Generator<unknown> {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (payload === "" || payload === "[DONE]") return;
    try {
      yield JSON.parse(payload);
    } catch {
      throw new GenerationError("invalid_stream", "Gemini sent stream data that is not valid JSON.");
    }
  }

  function* lines(flush: boolean): Generator<unknown> {
    for (;;) {
      const newline = pending.indexOf("\n");
      if (newline === -1) break;
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      yield* parseLine(line);
    }
    if (flush && pending !== "") {
      const line = pending;
      pending = "";
      yield* parseLine(line);
    }
  }

  try {
    for (;;) {
      let read: ReadableStreamReadResult<Uint8Array>;
      try {
        read = await reader.read();
      } catch {
        throw new GenerationError("network", "Gemini stream failed: network error or timeout.");
      }
      if (read.done) break;
      pending += decoder.decode(read.value, { stream: true });
      yield* lines(false);
    }
    pending += decoder.decode();
    yield* lines(true);
  } finally {
    reader.cancel().catch(() => {});
  }
}

async function* toEvents(payloads: AsyncIterable<unknown>): AsyncGenerator<GenerationEvent> {
  let finishReason: string | undefined;
  let usage: GenerationUsage | undefined;
  let sawText = false;
  for await (const payload of payloads) {
    const chunk = readChunk(payload);
    if (chunk.text !== "") {
      sawText = true;
      yield { type: "text", text: chunk.text };
    }
    if (chunk.finishReason !== undefined) finishReason = chunk.finishReason;
    if (chunk.usage) usage = chunk.usage;
  }
  yield { type: "done", ...finish(finishReason, usage, sawText) };
}

function shouldFallBack(error: unknown): boolean {
  if (!(error instanceof GenerationError)) return false;
  return error.code === "quota" || error.code === "network" || (error.code === "http" && (error.status ?? 0) >= 500);
}

export function createGenerationClient(options: GenerationClientOptions): GenerationClient {
  const {
    apiKey,
    model,
    fallbackModel,
    fetch: fetchImpl = globalThis.fetch.bind(globalThis),
    baseUrl = DEFAULT_BASE_URL,
    timeoutMs = 30_000,
    maxRetries = 1,
    maxOutputTokens = 800,
    temperature = 0.2,
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  if (apiKey.trim() === "") throw new GenerationError("http", "Gemini API key is empty.");

  function requestBody(prompt: Prompt) {
    return {
      systemInstruction: { parts: [{ text: prompt.systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: prompt.userText }] }],
      generationConfig: { temperature, maxOutputTokens, candidateCount: 1 },
    };
  }

  async function send(targetModel: string, method: "generateContent" | "streamGenerateContent", prompt: Prompt): Promise<Response> {
    const query = method === "streamGenerateContent" ? "?alt=sse" : "";
    const response = await sendWithRetry(
      `${baseUrl}/models/${targetModel}:${method}${query}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(requestBody(prompt)),
      },
      { fetch: fetchImpl, timeoutMs, maxRetries, sleep, random, retryStatuses: RETRY_STATUSES },
    );

    if (response === undefined) throw new GenerationError("network", `Gemini ${method} failed: network error or timeout.`);
    if (response.status === 429) throw new QuotaError(targetModel);
    if (!response.ok) throw new GenerationError("http", `Gemini ${method} failed with HTTP ${response.status}.`, response.status);
    return response;
  }

  async function connect(targetModel: string, prompt: Prompt): Promise<GenerationStream> {
    const response = await send(targetModel, "streamGenerateContent", prompt);
    if (response.body === null) throw new GenerationError("invalid_stream", "Gemini returned no stream body.");

    // Read up to the first event now, so errors that arrive first reject this call instead of the stream.
    const iterator = toEvents(readSse(response.body))[Symbol.asyncIterator]();
    const first = await iterator.next();
    async function* events(): AsyncGenerator<GenerationEvent> {
      if (first.done) return;
      yield first.value;
      for (;;) {
        const next = await iterator.next();
        if (next.done) return;
        yield next.value;
      }
    }
    return { model: targetModel, events: events() };
  }

  async function complete(targetModel: string, prompt: Prompt): Promise<GenerationResult> {
    const response = await send(targetModel, "generateContent", prompt);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new GenerationError("invalid_stream", "Gemini sent a reply that is not valid JSON.");
    }
    const chunk = readChunk(payload);
    return { text: chunk.text, model: targetModel, ...finish(chunk.finishReason, chunk.usage, chunk.text !== "") };
  }

  async function withFallback<T>(run: (targetModel: string) => Promise<T>): Promise<T> {
    try {
      return await run(model);
    } catch (error) {
      if (fallbackModel !== undefined && fallbackModel !== model && shouldFallBack(error)) return run(fallbackModel);
      throw error;
    }
  }

  return {
    generate: (prompt) => withFallback((targetModel) => complete(targetModel, prompt)),
    streamGenerate: (prompt) => withFallback((targetModel) => connect(targetModel, prompt)),
  };
}
