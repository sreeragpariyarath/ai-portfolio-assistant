import { buildIndex, hybridSearch, search } from "@portfolio/rag";
import type { Hit } from "@portfolio/rag";
import { KS, depthFor, publicRecordsOf, scoreRankings } from "./baseline.ts";
import type { BaselineReport } from "./baseline.ts";
import type { Corpus, EvalSet } from "./eval-data.ts";

export type Rankings = Map<string, Hit[]>;
export const METHODS = ["bm25", "dense", "hybrid"] as const;
export type Method = (typeof METHODS)[number];

export interface HybridConfig {
  k: number;
  depth: number;
}

export interface Comparison {
  config: HybridConfig;
  reports: Record<Method, BaselineReport>;
  rankings: Record<Method, Rankings>;
}

// BM25 over public records only, returning up to every public record so hybrid has candidates to fuse.
export function bm25Rankings(corpus: Corpus, evalSet: EvalSet): Rankings {
  const publicRecords = publicRecordsOf(corpus);
  const index = buildIndex(publicRecords.map((record) => ({ id: record.id, text: `${record.title} ${record.content}` })));
  return new Map(evalSet.cases.map((evalCase) => [evalCase.id, search(index, evalCase.question, publicRecords.length)]));
}

export function hybridRankings(
  corpus: Corpus,
  evalSet: EvalSet,
  bm25: Rankings,
  dense: Rankings,
  config: HybridConfig,
): Rankings {
  const publicCount = publicRecordsOf(corpus).length;
  return new Map(
    evalSet.cases.map((evalCase) => {
      const limit = depthFor(evalCase, publicCount);
      // A list case asks for every matching record, so it fuses every candidate, not just the top `depth`.
      const depth = evalCase.scoring === "list" ? publicCount : config.depth;
      return [
        evalCase.id,
        hybridSearch(bm25.get(evalCase.id) ?? [], dense.get(evalCase.id) ?? [], { k: config.k, depth, limit }),
      ];
    }),
  );
}

export function compareMethods(
  corpus: Corpus,
  evalSet: EvalSet,
  bm25: Rankings,
  dense: Rankings,
  config: HybridConfig,
): Comparison {
  const rankings = { bm25, dense, hybrid: hybridRankings(corpus, evalSet, bm25, dense, config) };
  return {
    config,
    rankings,
    reports: {
      bm25: scoreRankings(corpus, evalSet, bm25),
      dense: scoreRankings(corpus, evalSet, dense),
      hybrid: scoreRankings(corpus, evalSet, rankings.hybrid),
    },
  };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatComparison(comparison: Comparison, details: { model: string; dims: number }): string {
  const { reports, config } = comparison;
  const first = reports.bm25;
  const lines: string[] = [
    "# Retrieval comparison: BM25, dense and hybrid",
    "",
    `Development set of ${first.totalCases} cases (\`evals/retrieval-eval.v3.json\`); **not a held-out benchmark**, and any tuning of the hybrid settings uses these same cases.`,
    `${first.indexedRecords} public records searched; ${first.excludedPrivateRecords} private record(s) excluded before indexing.`,
    `Dense: \`${details.model}\`, ${details.dims} dimensions, cosine, Qdrant with a public-only filter. Hybrid: reciprocal rank fusion, k=${config.k}, top ${config.depth} candidates from each method.`,
    "",
    `| Method | ${KS.map((k) => `Recall@${k}`).join(" | ")} | ${KS.map((k) => `Full evidence @${k}`).join(" | ")} | ${first.listCases.map((item) => `${item.caseId} list`).join(" | ")} | Private retrieved |`,
    `|---|${KS.map(() => "---:").join("|")}|${KS.map(() => "---:").join("|")}|${first.listCases.map(() => "---:").join("|")}|---|`,
  ];
  for (const method of METHODS) {
    const report = reports[method];
    lines.push(
      `| ${method} | ${report.byK.map((row) => percent(row.meanRecall)).join(" | ")} | ` +
        `${report.byK.map((row) => `${row.fullCoverageCases}/${row.casesWithEvidence}`).join(" | ")} | ` +
        `${report.listCases.map((item) => `${item.found}/${item.expected}`).join(" | ")} | ` +
        `${report.privateRecordsRetrieved.length === 0 ? "none" : report.privateRecordsRetrieved.join(", ")} |`,
    );
  }

  const k = Math.min(...KS);
  lines.push("", `## Cases missing expected evidence at k=${k}`, "", "| Case | bm25 | dense | hybrid |", "|---|---|---|---|");
  const missIds = [
    ...new Set(METHODS.flatMap((method) => reports[method].misses.filter((m) => m.k === k).map((m) => m.caseId))),
  ].sort();
  if (missIds.length === 0) lines.push("| none | | | |");
  for (const caseId of missIds) {
    const cell = (method: Method) =>
      reports[method].misses.find((m) => m.k === k && m.caseId === caseId)?.missing.join(", ") ?? "ok";
    lines.push(`| ${caseId} | ${cell("bm25")} | ${cell("dense")} | ${cell("hybrid")} |`);
  }

  lines.push(
    "",
    "## Questions with no expected evidence",
    "",
    "Every retriever returns its best matches anyway. The top score is what an abstention threshold would have to separate from real answers (BM25 and cosine scores are on different scales).",
    "",
    "| Case | bm25 top score | dense top score | dense top record |",
    "|---|---:|---:|---|",
  );
  for (const item of reports.bm25.zeroEvidence) {
    const dense = reports.dense.zeroEvidence.find((z) => z.caseId === item.caseId);
    lines.push(
      `| ${item.caseId} | ${item.topScore.toFixed(2)} | ${(dense?.topScore ?? 0).toFixed(4)} | ${dense?.topIds[0] ?? "none"} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}
