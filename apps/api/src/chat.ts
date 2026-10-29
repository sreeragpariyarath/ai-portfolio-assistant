// The answer path of POST /api/chat (Phase 3 task 3.7): retrieve, build the prompt, stream the model's
// answer as server-sent events. Request validation lives in chat-request.ts; CORS and routing in index.ts.
//
// Events: `meta` {behavior, behaviorValid, retrieved, degraded}, `token` {text}, `done` {citations,
// invalidCitationsDropped, truncated, model}, `error` {code, message}. Failures before the first event
// return JSON instead (the caller picks the status from the code).
import {
  buildPrompt,
  createAnswerParser,
  createGenerationClient,
  GenerationError,
  PromptBlockedError,
  QuotaError,
  type AnswerChunk,
  type GenerationEvent,
  type GenerationStream,
} from "@portfolio/rag";
import { createDenseSearcher, retrieve, type RetrievalResult } from "./retrieval";

// The whole request, retrieval plus the full answer, must finish inside this budget.
export const OVERALL_TIMEOUT_MS = 25_000;
// Per Gemini request, including the stream. No retries: after a failure the fallback model takes over.
const GEMINI_TIMEOUT_MS = 20_000;

export interface ChatDeps {
  fetch: typeof fetch;
  now: () => Date;
  overallTimeoutMs: number;
}

export const defaultChatDeps: ChatDeps = {
  // Wrapped so the call keeps its `this` in the Workers runtime.
  fetch: (input, init) => fetch(input, init),
  now: () => new Date(),
  overallTimeoutMs: OVERALL_TIMEOUT_MS,
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

type Outcome = { behavior?: string; behaviorValid?: boolean; citations?: number; invalidCitationsDropped?: number; truncated?: boolean; model?: string; outputTokens?: number; errorCode?: string };

export async function answerQuestion(
  question: string,
  env: Env,
  deps: ChatDeps,
  responseHeaders: Record<string, string>,
): Promise<{ response: Response } | { failure: ChatFailure }> {
  const started = Date.now();
  const deadline = started + deps.overallTimeoutMs;
  let retrieval: RetrievalResult | undefined;

  // One structured line per request. Never the question, the answer, record content or keys.
  function log(outcome: Outcome & { status: number }): void {
    console.log(
      JSON.stringify({
        event: "chat",
        latencyMs: Date.now() - started,
        retrieved: retrieval?.counts,
        degraded: retrieval?.degraded,
        ...outcome,
      }),
    );
  }

  let stream: GenerationStream;
  try {
    const dense = (text: string) => createDenseSearcher(env, { fetch: deps.fetch })(text);
    retrieval = await before(deadline, retrieve(question, dense));
    const generation = createGenerationClient({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      fallbackModel: env.GEMINI_FALLBACK_MODEL,
      fetch: deps.fetch,
      timeoutMs: GEMINI_TIMEOUT_MS,
      maxRetries: 0,
    });
    const today = deps.now().toISOString().slice(0, 10);
    stream = await before(deadline, generation.streamGenerate(buildPrompt(question, retrieval.records, { today })));
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
          send("done", {
            citations: result.citations,
            invalidCitationsDropped: result.invalidCitationsDropped,
            truncated: event.truncated,
            model: stream.model,
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
