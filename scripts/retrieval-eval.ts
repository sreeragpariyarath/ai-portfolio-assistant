import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createGeminiClient, createQdrantClient, denseSearchByVector } from "@portfolio/rag";
import { EmbeddingCache } from "./lib/embedding-cache.ts";
import { checkEnv } from "./lib/env.ts";
import { EVAL_FILE, RECORDS_FILE, REPO_ROOT, loadJson } from "./lib/eval-data.ts";
import type { Corpus, EvalSet } from "./lib/eval-data.ts";
import { bm25Rankings, compareMethods, formatComparison } from "./lib/retrieval-eval.ts";
import type { Rankings } from "./lib/retrieval-eval.ts";
import { publicRecordsOf } from "./lib/baseline.ts";
import { validateEvalData } from "./validate-eval.ts";

const MODEL = "gemini-embedding-2";
const DIMS = 768;
const CACHE_FILE = resolve(REPO_ROOT, "evals/.cache/query-embeddings.json");
const RESULTS_FILE = resolve(REPO_ROOT, "evals/results/retrieval-comparison.md");

function numberFlag(name: string, fallback: number): number {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (arg === undefined) return fallback;
  const value = Number(arg.slice(name.length + 3));
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number.`);
  return value;
}

async function main(): Promise<void> {
  const config = { k: numberFlag("k", 60), depth: numberFlag("depth", 20) };
  const write = !process.argv.includes("--no-write");

  const envFile = resolve(REPO_ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const problems = checkEnv(process.env).filter((result) => result.status !== "ok");
  if (problems.length > 0) throw new Error(`Environment not ready (${problems.map((p) => p.name).join(", ")}).`);

  const corpus = loadJson(RECORDS_FILE) as Corpus;
  const evalSet = loadJson(EVAL_FILE) as EvalSet;
  const errors = validateEvalData(corpus, evalSet);
  if (errors.length > 0) throw new Error(`Dataset validation failed:\n${errors.join("\n")}`);

  const gemini = createGeminiClient({ apiKey: process.env.GEMINI_API_KEY!, model: MODEL, dims: DIMS });
  const qdrant = createQdrantClient({ url: process.env.QDRANT_URL!, apiKey: process.env.QDRANT_API_KEY! });
  const cache = new EmbeddingCache(CACHE_FILE, MODEL, DIMS);
  const publicCount = publicRecordsOf(corpus).length;

  const dense: Rankings = new Map();
  for (const evalCase of evalSet.cases) {
    const vector = await cache.get(evalCase.question, (question) => gemini.embedQuery(question));
    dense.set(evalCase.id, await denseSearchByVector(qdrant, process.env.QDRANT_COLLECTION!, vector, { limit: publicCount }));
  }
  console.error(`Query embeddings: ${cache.hits} cached, ${cache.misses} new Gemini calls.`);

  const comparison = compareMethods(corpus, evalSet, bm25Rankings(corpus, evalSet), dense, config);
  const markdown = formatComparison(comparison, { model: MODEL, dims: DIMS });
  console.log(markdown);
  if (write) {
    mkdirSync(resolve(RESULTS_FILE, ".."), { recursive: true });
    writeFileSync(RESULTS_FILE, markdown);
    console.error(`Wrote ${RESULTS_FILE.slice(REPO_ROOT.length + 1)}`);
  }

  const leaked = Object.values(comparison.reports).some((report) => report.privateRecordsRetrieved.length > 0);
  if (leaked) throw new Error("A private record was retrieved. Failing the eval.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Retrieval eval failed.");
  process.exitCode = 1;
});
