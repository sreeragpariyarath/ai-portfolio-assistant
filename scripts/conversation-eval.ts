// Live conversation evaluation (D-041). Plays each chat in evals/conversation-eval.v1.json through the same
// retrieval, prompts and memory steps as the Worker and scores the answer to the last question.
// It makes Gemini and Qdrant calls, so it runs only with --live, and live runs need the owner's go-ahead.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  CANDIDATE_DEPTH,
  buildCompactionPrompt,
  buildPrompt,
  buildRewritePrompt,
  createCorpus,
  createGeminiClient,
  createGenerationClient,
  createQdrantClient,
  denseSearchByVector,
  parseAnswer,
  parseRewrite,
  parseSummary,
  retrieve,
} from "@portfolio/rag";
import type { PublicRecord } from "@portfolio/rag";
import { EVAL_TODAY } from "./lib/answer-eval.ts";
import { formatConversationReport, playConversation, scoreConversation, validateConversationSet } from "./lib/conversation-eval.ts";
import type { ConversationSet } from "./lib/conversation-eval.ts";
import { EmbeddingCache } from "./lib/embedding-cache.ts";
import { checkEnv } from "./lib/env.ts";
import { REPO_ROOT } from "./lib/eval-data.ts";

const SET_FILE = resolve(REPO_ROOT, "evals/conversation-eval.v1.json");
const RESULTS_FILE = resolve(REPO_ROOT, "evals/results/conversation-eval.md");
const BUNDLE_FILE = resolve(REPO_ROOT, "apps/api/src/generated/public-corpus.json");
const QUERY_CACHE_FILE = resolve(REPO_ROOT, "evals/.cache/query-embeddings.json");
const EMBEDDING_MODEL = "gemini-embedding-2";
const DIMS = 768;

const USAGE = `Usage: pnpm eval:conversation [options]

Without --live this only validates evals/conversation-eval.v1.json and makes NO network calls.
--live          play the chats against Qdrant and Gemini (needs .env; live runs need the owner's go-ahead)
--ids=C01,C02   only these cases (the results file is not written for a subset)
--delay-ms=N    pause after each Gemini call (default 4500, to stay under 15 requests a minute)`;

function flag(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function workerVar(name: string): string {
  const source = readFileSync(resolve(REPO_ROOT, "apps/api/wrangler.jsonc"), "utf8");
  const match = new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`).exec(source);
  if (!match?.[1]) throw new Error(`${name} not found in apps/api/wrangler.jsonc.`);
  return match[1];
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(USAGE);
    return;
  }
  const set = JSON.parse(readFileSync(SET_FILE, "utf8")) as ConversationSet;
  const errors = validateConversationSet(set);
  if (errors.length > 0) throw new Error(`Conversation set is not valid:\n${errors.join("\n")}`);
  if (!process.argv.includes("--live")) {
    console.log(`ok: ${set.cases.length} conversation cases. Add --live to run them (Gemini and Qdrant calls).`);
    return;
  }

  const ids = flag("ids")?.split(",").map((id) => id.trim()).filter(Boolean);
  const cases = ids ? set.cases.filter((item) => ids.includes(item.id)) : set.cases;
  if (cases.length === 0) throw new Error("No cases selected.");
  const delayMs = Number(flag("delay-ms") ?? 4500);

  const envFile = resolve(REPO_ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const problems = checkEnv(process.env).filter((result) => result.status !== "ok");
  if (problems.length > 0) throw new Error(`Environment not ready (${problems.map((p) => p.name).join(", ")}).`);

  const corpus = createCorpus((JSON.parse(readFileSync(BUNDLE_FILE, "utf8")) as { records: PublicRecord[] }).records);
  const embedder = createGeminiClient({ apiKey: process.env.GEMINI_API_KEY!, model: EMBEDDING_MODEL, dims: DIMS });
  const qdrant = createQdrantClient({ url: process.env.QDRANT_URL!, apiKey: process.env.QDRANT_API_KEY! });
  const queryCache = new EmbeddingCache(QUERY_CACHE_FILE, EMBEDDING_MODEL, DIMS);
  const model = process.env.GEMINI_MODEL ?? workerVar("GEMINI_MODEL");
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL ?? workerVar("GEMINI_FALLBACK_MODEL");
  const base = { apiKey: process.env.GEMINI_API_KEY!, model, fallbackModel, maxRetries: 1 };
  // The same settings as the Worker's calls (apps/api/src/chat.ts), with longer timeouts for a batch run.
  const answerer = createGenerationClient({ ...base, timeoutMs: 60_000 });
  const helper = (maxOutputTokens: number) => createGenerationClient({ ...base, timeoutMs: 30_000, maxOutputTokens, temperature: 0 });
  const paced = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } finally {
      await sleep(delayMs);
    }
  };

  const rows = [];
  for (const item of cases) {
    console.error(`${item.id}: ${item.description}`);
    const result = await playConversation(item, {
      rewrite: (question, history, summary) =>
        paced(() => helper(100).generate(buildRewritePrompt(question, history, summary))).then((reply) => parseRewrite(reply.text), () => null),
      compact: (summary, turns) =>
        paced(() => helper(400).generate(buildCompactionPrompt(summary, turns))).then((reply) => parseSummary(reply.text), () => null),
      answer: async (question, searchText, history, summary) => {
        const dense = async () => {
          const vector = await queryCache.get(searchText, (text) => embedder.embedQuery(text));
          return denseSearchByVector(qdrant, process.env.QDRANT_COLLECTION!, vector, { limit: CANDIDATE_DEPTH });
        };
        const retrieval = await retrieve(searchText, dense, { corpus });
        const prompt = buildPrompt(question, retrieval.records, { today: EVAL_TODAY, history, ...(summary !== undefined ? { summary } : {}) });
        const reply = await paced(() => answerer.generate(prompt));
        const parsed = parseAnswer(reply.text, retrieval.records.map((record) => record.id));
        return { text: parsed.text, behavior: parsed.behavior, citations: parsed.citations };
      },
    });
    const score = scoreConversation(item, result);
    console.error(`  ${score.passed ? "pass" : `FAIL: ${score.failures.join("; ")}`}`);
    rows.push({ item, result, score });
  }

  const report = formatConversationReport(rows, { model, date: new Date().toISOString().slice(0, 10) });
  console.log(report);
  if (!ids) {
    mkdirSync(dirname(RESULTS_FILE), { recursive: true });
    writeFileSync(RESULTS_FILE, `${report}\n`);
    console.error(`Wrote ${RESULTS_FILE.slice(REPO_ROOT.length + 1)}.`);
  }
  if (rows.some((row) => !row.score.passed)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
