import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  PUBLIC_CORPUS_FILE,
  buildPublicCorpus,
  normalizeNewlines,
  serializePublicCorpus,
} from "./lib/corpus-build.ts";
import { EVAL_FILE, RECORDS_FILE, REPO_ROOT, loadJson } from "./lib/eval-data.ts";
import type { Corpus } from "./lib/eval-data.ts";
import { validateEvalData } from "./validate-eval.ts";

// `pnpm corpus:build` writes the bundle the Worker ships. `--check` only compares and fails if the committed file is stale.
function main(): number {
  const check = process.argv.includes("--check");

  let corpus: unknown;
  let evalSet: unknown;
  try {
    corpus = loadJson(RECORDS_FILE);
    evalSet = loadJson(EVAL_FILE);
  } catch (error) {
    console.error(`Cannot read data: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const errors = validateEvalData(corpus, evalSet);
  if (errors.length > 0) {
    console.error(`Refusing to build: validation failed with ${errors.length} error(s):`);
    for (const message of errors) console.error(`  - ${message}`);
    return 1;
  }

  const built = buildPublicCorpus(corpus as Corpus);
  const next = serializePublicCorpus(built);
  const target = resolve(REPO_ROOT, PUBLIC_CORPUS_FILE);

  if (check) {
    const current = existsSync(target) ? normalizeNewlines(readFileSync(target, "utf8")) : undefined;
    if (current !== next) {
      console.error(`${PUBLIC_CORPUS_FILE} is missing or stale. Run "pnpm corpus:build" and commit the result.`);
      return 1;
    }
    console.log(`ok: ${PUBLIC_CORPUS_FILE} is current (${built.records.length} public records)`);
    return 0;
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, next, "utf8");
  console.log(`wrote ${built.records.length} public records to ${PUBLIC_CORPUS_FILE}`);
  return 0;
}

if (resolve(process.argv[1] ?? "") === import.meta.filename) {
  process.exitCode = main();
}
