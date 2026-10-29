import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createGeminiClient, createQdrantClient } from "@portfolio/rag";
import { checkEnv } from "./lib/env.ts";
import { REPO_ROOT } from "./lib/eval-data.ts";

const MODEL = "gemini-embedding-2";
const DIMS = 768;

async function main(): Promise<void> {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) throw new Error('Usage: pnpm qdrant:query "your question"');

  const envFile = resolve(REPO_ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const problems = checkEnv(process.env).filter((result) => result.status !== "ok");
  if (problems.length > 0) throw new Error(`Environment not ready (${problems.map((p) => p.name).join(", ")}).`);

  const gemini = createGeminiClient({ apiKey: process.env.GEMINI_API_KEY!, model: MODEL, dims: DIMS });
  const qdrant = createQdrantClient({ url: process.env.QDRANT_URL!, apiKey: process.env.QDRANT_API_KEY! });

  const vector = await gemini.embedQuery(question);
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  console.log(`query vector: ${vector.length} dims, norm ${norm.toFixed(4)}`);

  const hits = await qdrant.query(process.env.QDRANT_COLLECTION!, vector, {
    filter: { must: [{ key: "visibility", match: { value: "public" } }] },
    limit: 5,
  });
  for (const hit of hits) console.log(`${hit.score.toFixed(4)}  ${String(hit.payload.record_id)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Query failed.");
  process.exitCode = 1;
});
