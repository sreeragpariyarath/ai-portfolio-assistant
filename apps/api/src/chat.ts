// The answer path of POST /api/chat (Phase 3 task 3.7): retrieve, build the prompt, stream the model's
// answer as server-sent events. Request validation lives in chat-request.ts; CORS and routing in index.ts.
//
// Events: `meta` {behavior, behaviorValid, retrieved, degraded}, `token` {text}, `memory` {summary} (only
// when older turns were folded into new notes, D-041), `done` {citations, invalidCitationsDropped, truncated,
// model, suggestions}, `error` {code, message}. Failures before the first event return JSON instead (the caller picks the
// status from the code).
//
// Chat memory (D-041): a follow-up ("and the second one?") is rewritten into a standalone search question by a
// short extra call, only when `isFollowUp` says it is needed; the search falls back to the previous question
// plus the new one if that call fails. Older turns are folded into notes by a second short call that runs
// alongside the answer. Nothing is stored here: the browser keeps the chat and the notes.
import {
  buildCompactionPrompt,
  buildPrompt,
  buildRewritePrompt,
  createAnswerParser,
  createGenerationClient,
  fallbackSearchText,
  GenerationError,
  isFollowUp,
  parseRewrite,
  parseSummary,
  PromptBlockedError,
  QuotaError,
  type AnswerChunk,
  type GenerationClient,
  type GenerationEvent,
  type GenerationStream,
} from "@portfolio/rag";
import type { EmbeddingCache } from "@portfolio/rag";
import type { ChatInput } from "./chat-request";
import { createDenseSearcher, retrieve, sharedEmbeddingCache, type RetrievalResult } from "./retrieval";
import type { RateLimiter } from "./rate-limit";

// The whole request, retrieval plus the full answer, must finish inside this budget.
export const OVERALL_TIMEOUT_MS = 25_000;
// Per Gemini request, including the stream. No retries: after a failure the fallback model takes over.
const GEMINI_TIMEOUT_MS = 20_000;
// The two small helper calls. A slow rewrite only costs the follow-up a weaker search, so it is kept short.
const REWRITE_TIMEOUT_MS = 4_000;
const COMPACTION_TIMEOUT_MS = 10_000;

type RewriteOutcome = "none" | "model" | "fallback";

// The text the search runs on. The visitor's own words still go to the answer prompt unchanged.
async function searchQuestionFor(input: ChatInput, helper: () => GenerationClient, deadline: number): Promise<{ text: string; rewrite: RewriteOutcome }> {
  if (!isFollowUp(input.question, input.history)) return { text: input.question, rewrite: "none" };
  try {
    const reply = await before(deadline, helper().generate(buildRewritePrompt(input.question, input.history, input.summary)));
    const rewritten = parseRewrite(reply.text);
    if (rewritten !== null) return { text: rewritten, rewrite: "model" };
  } catch {
    // Any failure (quota, timeout, a blocked prompt) falls through to the cheap fallback below.
  }
  return { text: fallbackSearchText(input.question, input.history), rewrite: "fallback" };
}

// New notes that fold `compact` into the old summary, or null when there is nothing to fold or the call failed.
async function compactedSummary(input: ChatInput, client: GenerationClient): Promise<string | null> {
  if (input.compact.length === 0) return null;
  try {
    const reply = await client.generate(buildCompactionPrompt(input.summary, input.compact));
    return parseSummary(reply.text);
  } catch {
    return null;
  }
}

export interface ChatDeps {
  fetch: typeof fetch;
  now: () => Date;
  overallTimeoutMs: number;
  embeddingCache: EmbeddingCache;
  // Replaces the rate limiter built from `env` (tests only).
  rateLimiter?: RateLimiter;
}

export const defaultChatDeps: ChatDeps = {
  // Wrapped so the call keeps its `this` in the Workers runtime.
  fetch: (input, init) => fetch(input, init),
  now: () => new Date(),
  overallTimeoutMs: OVERALL_TIMEOUT_MS,
  embeddingCache: sharedEmbeddingCache,
};

class DeadlineError extends Error {
  constructor() {
    super("The request took too long.");
    this.name = "DeadlineError";
  }
}

async function before<T>(deadline: number, promise: Promise<T>): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new DeadlineError();
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new DeadlineError()), remaining);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// What the client is told when something fails. No upstream text, no question, no keys.
export interface ChatFailure {
  status: 400 | 500 | 503;
  code: "prompt_blocked" | "demo_busy" | "timeout" | "upstream_unavailable" | "internal_error";
  error: string;
  retryAfterSeconds?: number;
}

export function describeFailure(error: unknown): ChatFailure {
  if (error instanceof QuotaError) {
    return { status: 503, code: "demo_busy", error: "The demo is busy right now. Please try again in a minute.", retryAfterSeconds: 60 };
  }
  if (error instanceof PromptBlockedError) {
    return { status: 400, code: "prompt_blocked", error: "This question could not be answered." };
  }
  if (error instanceof DeadlineError) {
    return { status: 503, code: "timeout", error: "The answer took too long. Please try again." };
  }
  if (error instanceof GenerationError) {
    return { status: 503, code: "upstream_unavailable", error: "The answer service is unavailable. Please try again later." };
  }
  return { status: 500, code: "internal_error", error: "Something went wrong." };
}

const encoder = new TextEncoder();

function sseEvent(name: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

type Outcome = {
  behavior?: string;
  behaviorValid?: boolean;
  citations?: number;
  invalidCitationsDropped?: number;
  truncated?: boolean;
  model?: string;
  outputTokens?: number;
  errorCode?: string;
  compacted?: boolean;
};

export async function answerQuestion(
  input: ChatInput,
  env: Env,
  deps: ChatDeps,
  responseHeaders: Record<string, string>,
): Promise<{ response: Response } | { failure: ChatFailure }> {
  const started = Date.now();
  const deadline = started + deps.overallTimeoutMs;
  let retrieval: RetrievalResult | undefined;
  let rewrite: RewriteOutcome = "none";
  // Counts only: how much chat came with the question, and what memory did with it.
  const memory = { historyTurns: input.history.length, compactTurns: input.compact.length, hasSummary: input.summary !== undefined };

  const helperOptions = {
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
    fallbackModel: env.GEMINI_FALLBACK_MODEL,
    fetch: deps.fetch,
    maxRetries: 0,
    temperature: 0,
  };
  const rewriter = () => createGenerationClient({ ...helperOptions, timeoutMs: REWRITE_TIMEOUT_MS, maxOutputTokens: 100 });

  // One structured line per request. Never the question, the answer, record content or keys.
  function log(outcome: Outcome & { status: number }): void {
    console.log(
      JSON.stringify({
        event: "chat",
        latencyMs: Date.now() - started,
        retrieved: retrieval?.counts,
        degraded: retrieval?.degraded,
        embeddingCache: deps.embeddingCache.stats(),
        ...memory,
        rewrite,
        ...outcome,
      }),
    );
  }

  let stream: GenerationStream;
  // Started first, so it runs while the answer is searched and streamed. It never rejects.
  let compaction: Promise<string | null> = Promise.resolve(null);
  try {
    if (input.compact.length > 0) {
      compaction = compactedSummary(input, createGenerationClient({ ...helperOptions, timeoutMs: COMPACTION_TIMEOUT_MS, maxOutputTokens: 400 }));
    }
    const dense = (text: string) => createDenseSearcher(env, { fetch: deps.fetch, cache: deps.embeddingCache })(text);
    const search = await searchQuestionFor(input, rewriter, deadline);
    rewrite = search.rewrite;
    retrieval = await before(deadline, retrieve(search.text, dense));
    const generation = createGenerationClient({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      fallbackModel: env.GEMINI_FALLBACK_MODEL,
      fetch: deps.fetch,
      timeoutMs: GEMINI_TIMEOUT_MS,
      maxRetries: 0,
    });
    const today = deps.now().toISOString().slice(0, 10);
    const prompt = buildPrompt(input.question, retrieval.records, { today, history: input.history, summary: input.summary });
    stream = await before(deadline, generation.streamGenerate(prompt));
  } catch (error) {
    const failure = describeFailure(error);
    log({ status: failure.status, errorCode: failure.code });
    return { failure };
  }

  const records = retrieval.records;
  const retrievedIds = records.map((record) => record.id);
  const degraded = retrieval.degraded;
  const parser = createAnswerParser(retrievedIds);
  const iterator = stream.events[Symbol.asyncIterator]();
  let metaSent = false;
  let finished = false;

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      // A pull that enqueues nothing would never be called again, so keep reading until something is sent.
      let sent = false;
      const send = (name: string, data: unknown) => {
        controller.enqueue(sseEvent(name, data));
        sent = true;
      };
      const show = (chunk: AnswerChunk) => {
        if (chunk.header && !metaSent) {
          metaSent = true;
          send("meta", { behavior: chunk.header.behavior, behaviorValid: chunk.header.valid, retrieved: retrievedIds, degraded });
        }
        if (chunk.text !== "") send("token", { text: chunk.text });
      };

      try {
        while (!sent && !finished) {
          const next: IteratorResult<GenerationEvent> = await before(deadline, iterator.next());
          if (next.done) {
            finished = true;
            controller.close();
            return;
          }
          const event = next.value;
          if (event.type === "text") {
            show(parser.push(event.text));
            continue;
          }

          const end = parser.end();
          show(end);
          const { result } = end;
          // The notes go out before `done`, so the browser has them before it treats the answer as finished.
          // A slow or failed compaction only means the browser keeps its old notes and tries again next time.
          let summary: string | null = null;
          try {
            summary = await before(deadline, compaction);
          } catch {
            summary = null;
          }
          if (summary !== null) send("memory", { summary });
          send("done", {
            citations: result.citations,
            invalidCitationsDropped: result.invalidCitationsDropped,
            truncated: event.truncated,
            model: stream.model,
            // Follow-up questions from the reply's hidden NEXT: line (D-043); empty when there was none.
            suggestions: result.suggestions,
          });
          finished = true;
          log({
            status: 200,
            behavior: result.behavior,
            behaviorValid: result.behaviorValid,
            citations: result.citations.length,
            invalidCitationsDropped: result.invalidCitationsDropped,
            truncated: event.truncated,
            model: stream.model,
            compacted: summary !== null,
            ...(event.usage?.outputTokens !== undefined ? { outputTokens: event.usage.outputTokens } : {}),
          });
          controller.close();
          return;
        }
      } catch (error) {
        finished = true;
        const failure = describeFailure(error);
        send("error", { code: failure.code, message: failure.error });
        log({ status: 200, errorCode: failure.code, model: stream.model });
        controller.close();
        void iterator.return?.();
      }
    },
    cancel() {
      finished = true;
      log({ status: 200, errorCode: "client_cancelled", model: stream.model });
      void iterator.return?.();
    },
  });

  return {
    response: new Response(body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        ...responseHeaders,
      },
    }),
  };
}
