import { resolve } from "node:path";
import { runBaseline } from "./lib/baseline.ts";
import type { BaselineReport } from "./lib/baseline.ts";
import { EVAL_FILE, RECORDS_FILE, loadJson } from "./lib/eval-data.ts";
import type { Corpus, EvalSet } from "./lib/eval-data.ts";
import { validateEvalData } from "./validate-eval.ts";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatReport(report: BaselineReport): string {
  const lines: string[] = [
    "Retrieval baseline: BM25 lexical search (no embeddings, no model calls)",
    `Development set of ${report.totalCases} cases; not a held-out benchmark.`,
    `Indexed ${report.indexedRecords} public records; ${report.excludedPrivateRecords} private record(s) excluded before indexing.`,
    "",
    "Retrieval metrics (ranked cases with expected evidence):",
  ];

  for (const row of report.byK) {
    lines.push(
      `  k=${String(row.k).padEnd(2)}  Recall@${row.k}: ${percent(row.meanRecall)}   ` +
        `full evidence coverage: ${row.fullCoverageCases}/${row.casesWithEvidence} cases`,
    );
  }

  lines.push("", "Cases missing expected evidence:");
  if (report.misses.length === 0) lines.push("  none");
  for (const miss of report.misses) {
    lines.push(`  ${miss.caseId} @${miss.k}: missing ${miss.missing.join(", ")}`);
  }

  lines.push("", "List questions (completeness over all retrieved records, not Recall@k):");
  if (report.listCases.length === 0) lines.push("  none");
  for (const item of report.listCases) {
    lines.push(
      `  ${item.caseId}: found ${item.found}/${item.expected} expected records` +
        (item.missing.length > 0 ? `; missing ${item.missing.join(", ")}` : ""),
    );
  }

  lines.push(
    "",
    `Cases with no expected evidence (${report.zeroEvidence.length}): a retriever always returns its best matches,`,
    "so these show the top score a future abstention threshold would have to separate.",
  );
  for (const item of report.zeroEvidence) {
    lines.push(`  ${item.caseId} top score ${item.topScore.toFixed(2)}  top: ${item.topIds.join(", ") || "none"}`);
  }

  lines.push(
    "",
    report.privateRecordsRetrieved.length === 0
      ? "Private records retrieved: none"
      : `Private records retrieved: ${report.privateRecordsRetrieved.join(", ")} (FAIL)`,
  );
  return lines.join("\n");
}

function main(): number {
  let corpus: unknown;
  let evalSet: unknown;
  try {
    corpus = loadJson(RECORDS_FILE);
    evalSet = loadJson(EVAL_FILE);
  } catch (error) {
    console.error(`Cannot read evaluation data: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const errors = validateEvalData(corpus, evalSet);
  if (errors.length > 0) {
    console.error(`Refusing to run: validation failed with ${errors.length} error(s):`);
    for (const message of errors) console.error(`  - ${message}`);
    return 1;
  }

  const report = runBaseline(corpus as Corpus, evalSet as EvalSet);
  console.log(formatReport(report));
  return report.privateRecordsRetrieved.length === 0 ? 0 : 1;
}

if (resolve(process.argv[1] ?? "") === import.meta.filename) {
  process.exitCode = main();
}
