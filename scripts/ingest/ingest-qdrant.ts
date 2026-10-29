import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createGeminiClient, createQdrantClient } from "@portfolio/rag";
import { checkEnv } from "../lib/env.ts";
import { EVAL_FILE, RECORDS_FILE, REPO_ROOT, loadJson } from "../lib/eval-data.ts";
import type { Corpus } from "../lib/eval-data.ts";
import { runIngest } from "../lib/ingest-run.ts";
import { validateEvalData } from "../validate-eval.ts";

const MODEL = "gemini-embedding-2";
const DIMS = 768;

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const envFile = resolve(REPO_ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const problems = checkEnv(process.env).filter((result) => result.status !== "ok");
  if (problems.length > 0) {
    throw new Error(`Environment not ready (${problems.map((p) => p.name).join(", ")}). Run pnpm env:check.`);
  }

  const corpus = loadJson(RECORDS_FILE) as Corpus;
  const errors = validateEvalData(corpus, loadJson(EVAL_FILE));
  if (errors.length > 0) throw new Error(`Dataset validation failed:\n${errors.join("\n")}`);

  const summary = await runIngest(corpus.records, {
    qdrant: createQdrantClient({ url: process.env.QDRANT_URL!, apiKey: process.env.QDRANT_API_KEY! }),
    gemini: createGeminiClient({ apiKey: process.env.GEMINI_API_KEY!, model: MODEL, dims: DIMS }),
    collection: process.env.QDRANT_COLLECTION!,
    model: MODEL,
    dims: DIMS,
    dryRun,
    log: (message) => console.log(message),
  });
  console.log(
    `${dryRun ? "Would upsert" : "Upserted"} ${summary.upserted}, unchanged ${summary.unchanged}, ${dryRun ? "would delete" : "deleted"} ${summary.deleted}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Ingest failed.");
  process.exitCode = 1;
});
