import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  CANDIDATE_DEPTH,
  SYSTEM_INSTRUCTION,
  buildPrompt,
  createCorpus,
  createGenerationClient,
  createQdrantClient,
  createGeminiClient,
  denseSearchByVector,
  retrieve,
} from "@portfolio/rag";
import type { PublicRecord } from "@portfolio/rag";
import {
  EVAL_TODAY,
  checkThresholds,
  collectAnswers,
  formatAnswerReport,
  formatReview,
  privateMarkers,
  scoreAnswer,
  summarize,
} from "./lib/answer-eval.ts";
import type { CachedAnswer } from "./lib/answer-eval.ts";
import { EmbeddingCache } from "./lib/embedding-cache.ts";
import { checkEnv } from "./lib/env.ts";
import { EVAL_FILE, RECORDS_FILE, REPO_ROOT, loadJson } from "./lib/eval-data.ts";
import type { Corpus, EvalSet } from "./lib/eval-data.ts";
import { validateEvalData } from "./validate-eval.ts";

const EMBEDDING_MODEL = "gemini-embedding-2";
const DIMS = 768;
const BUNDLE_FILE = "apps/api/src/generated/public-corpus.json";
const WRANGLER_FILE = "apps/api/wrangler.jsonc";
const QUERY_CACHE_FILE = resolve(REPO_ROOT, "evals/.cache/query-embeddings.json");
const ANSWER_CACHE_FILE = resolve(REPO_ROOT, "evals/.cache/answers.json");
const REVIEW_FILE = resolve(REPO_ROOT, "evals/.cache/answers-review.md");
const RESULTS_FILE = resolve(REPO_ROOT, "evals/results/answer-eval.md");
const SSE_FIXTURE = resolve(REPO_ROOT, "packages/rag/test/fixtures/gemini-sse-sample.txt");

const USAGE = `Usage: pnpm eval:answers [options]

Without --live this makes NO network calls: it scores the answers already saved in evals/.cache/answers.json.
--live            call Qdrant and Gemini for cases that are not cached (needs .env; live runs need the owner's go-ahead)
--ids=E001,E002   only these cases (the results file is not written for a subset)
--limit=N         only the first N cases (the results file is not written for a subset)
--delay-ms=N      pause after each live Gemini call (default 4500, to stay under 15 requests a minute)
--no-write        print the report but do not write evals/results/answer-eval.md
--sse-sample      with --live: make one streaming request and save its raw text as a test fixture`;

function flag(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

// The models come from the Worker's own config, so the eval measures what the Worker would run.
function workerVar(name: string): string {
  const source = readFileSync(resolve(REPO_ROOT, WRANGLER_FILE), "utf8");
  const match = new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`).exec(source);
  if (!match?.[1]) throw new Error(`${name} not found in ${WRANGLER_FILE}.`);
  return match[1];
}

class AnswerCache {
  private readonly file: string;
  private readonly entries: Record<string, CachedAnswer>;

  constructor(file: string) {
    this.file = file;
    this.entries = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, CachedAnswer>) : {};
  }

  get(key: string): CachedAnswer | undefined {
    return this.entries[key];
  }

  set(key: string, value: CachedAnswer): void {
    this.entries[key] = value;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.entries));
  }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(USAGE);
    return;
  }
  const live = process.argv.includes("--live");
  const sseSample = process.argv.includes("--sse-sample");
  const delayMs = Number(flag("delay-ms") ?? 4500);
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new Error("--delay-ms must be a number of at least 0.");
  if (sseSample && !live) throw new Error("--sse-sample needs --live.");

  const dataset = loadJson(RECORDS_FILE) as Corpus;
  const evalSet = loadJson(EVAL_FILE) as EvalSet;
  const errors = validateEvalData(dataset, evalSet);
  if (errors.length > 0) throw new Error(`Dataset validation failed:\n${errors.join("\n")}`);

  const ids = flag("ids")?.split(",").map((id) => id.trim()).filter(Boolean);
  const limit = flag("limit") === undefined ? undefined : Number(flag("limit"));
  let cases = evalSet.cases;
  if (ids) cases = cases.filter((evalCase) => ids.includes(evalCase.id));
  if (limit !== undefined) cases = cases.slice(0, limit);
  if (cases.length === 0) throw new Error("No cases selected.");
  const subset = cases.length !== evalSet.cases.length;

  // The bundle is exactly what the Worker retrieves from. Its hash is part of every cache key.
  const bundleText = readFileSync(resolve(REPO_ROOT, BUNDLE_FILE), "utf8");
  const corpus = createCorpus((JSON.parse(bundleText) as { records: PublicRecord[] }).records);
  const bundleHash = sha256(bundleText.replace(/\r\n/g, "\n"));

  const primaryModel = process.env.GEMINI_MODEL ?? workerVar("GEMINI_MODEL");
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL ?? workerVar("GEMINI_FALLBACK_MODEL");
  const caseKey = (evalCase: { question: string }) =>
    sha256(JSON.stringify([primaryModel, SYSTEM_INSTRUCTION, EVAL_TODAY, bundleHash, evalCase.question]));

  let answerLive: (evalCase: { id: string; question: string }) => Promise<CachedAnswer> = async () => {
    throw new Error("Live mode is off.");
  };
  let promptFor: ((question: string) => Promise<{ prompt: ReturnType<typeof buildPrompt>; retrievedIds: string[]; degraded: boolean }>) | undefined;
  let rawStream: Promise<string> | undefined;
  let generation: ReturnType<typeof createGenerationClient> | undefined;

  if (live) {
    const envFile = resolve(REPO_ROOT, ".env");
    if (existsSync(envFile)) process.loadEnvFile(envFile);
    const problems = checkEnv(process.env).filter((result) => result.status !== "ok");
    if (problems.length > 0) throw new Error(`Environment not ready (${problems.map((p) => p.name).join(", ")}).`);

    const embedder = createGeminiClient({ apiKey: process.env.GEMINI_API_KEY!, model: EMBEDDING_MODEL, dims: DIMS });
    const qdrant = createQdrantClient({ url: process.env.QDRANT_URL!, apiKey: process.env.QDRANT_API_KEY! });
    const queryCache = new EmbeddingCache(QUERY_CACHE_FILE, EMBEDDING_MODEL, DIMS);
    const capturingFetch: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (String(input).includes(":streamGenerateContent")) rawStream = response.clone().text();
      return response;
    };
    generation = createGenerationClient({
      apiKey: process.env.GEMINI_API_KEY!,
      model: primaryModel,
      fallbackModel,
      fetch: capturingFetch,
      timeoutMs: 60_000,
      maxRetries: 1,
    });

    promptFor = async (question) => {
      // The same retrieval, prompt and parser as the Worker (packages/rag), with the Node-side embedding cache.
      const dense = async () => {
        const vector = await queryCache.get(question, (text) => embedder.embedQuery(text));
        return denseSearchByVector(qdrant, process.env.QDRANT_COLLECTION!, vector, { limit: CANDIDATE_DEPTH });
      };
      const retrieval = await retrieve(question, dense, { corpus });
      return {
        prompt: buildPrompt(question, retrieval.records, { today: EVAL_TODAY }),
        retrievedIds: retrieval.records.map((record) => record.id),
        degraded: retrieval.degraded,
      };
    };

    answerLive = async (evalCase) => {
      const { prompt, retrievedIds, degraded } = await promptFor!(evalCase.question);
      const result = await generation!.generate(prompt);
      return {
        retrievedIds,
        degraded,
        text: result.text,
        model: result.model,
        finishReason: result.finishReason,
        truncated: result.truncated,
        ...(result.usage?.outputTokens !== undefined ? { outputTokens: result.usage.outputTokens } : {}),
      };
    };
  }

  if (sseSample) {
    const first = cases[0]!;
    console.error(`Making one streaming request for ${first.id} to save a raw sample.`);
    const { prompt } = await promptFor!(first.question);
    const stream = await generation!.streamGenerate(prompt);
    for await (const _event of stream.events) {
      // Read to the end so the whole body is captured.
    }
    const raw = await rawStream;
    if (raw === undefined) throw new Error("No stream was captured.");
    mkdirSync(dirname(SSE_FIXTURE), { recursive: true });
    writeFileSync(SSE_FIXTURE, raw);
    console.error(`Wrote ${SSE_FIXTURE.slice(REPO_ROOT.length + 1)} (${raw.length} characters, from model ${stream.model}).`);
    return;
  }

  const cache = new AnswerCache(ANSWER_CACHE_FILE);
  const outcome = await collectAnswers({
    cases,
    caseKey,
    cache,
    live,
    answerLive,
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    delayMs,
    log: (message) => console.error(message),
  });
  console.error(`Answers: ${outcome.answers.size} ready (${outcome.liveCalls} new Gemini calls), ${outcome.missing.length} missing.`);

  if (outcome.missing.length > 0) {
    console.error(
      live
        ? `Missing: ${outcome.missing.join(", ")}${outcome.errors.length > 0 ? ` (errors: ${outcome.errors.map((e) => `${e.id} ${e.code}`).join(", ")})` : ""}. Run again to fill them; answered cases are cached.`
        : `${outcome.missing.length} cases have no saved answer. Nothing was sent anywhere. To fill them run: pnpm eval:answers --live (calls Gemini and Qdrant; needs the owner's go-ahead).`,
    );
    process.exitCode = 1;
    return;
  }

  const markers = privateMarkers(dataset.records);
  const scores = cases.map((evalCase) => scoreAnswer(evalCase, outcome.answers.get(evalCase.id)!, markers));
  const summary = summarize(scores);
  const report = formatAnswerReport(scores, summary, { datasetId: evalSet.datasetId, today: EVAL_TODAY, primaryModel, fallbackModel });
  console.log(report);

  mkdirSync(dirname(REVIEW_FILE), { recursive: true });
  writeFileSync(REVIEW_FILE, formatReview(scores, outcome.answers, cases));
  if (!process.argv.includes("--no-write") && !subset) {
    mkdirSync(dirname(RESULTS_FILE), { recursive: true });
    writeFileSync(RESULTS_FILE, report);
    console.error(`Wrote ${RESULTS_FILE.slice(REPO_ROOT.length + 1)}; full answers for hand review: ${REVIEW_FILE.slice(REPO_ROOT.length + 1)}`);
  }

  const failed = checkThresholds(summary).filter((result) => !result.pass);
  if (failed.length > 0) {
    console.error(`Below the proposed threshold: ${failed.map((result) => result.name).join("; ")}.`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Answer eval failed.");
  process.exitCode = 1;
});
