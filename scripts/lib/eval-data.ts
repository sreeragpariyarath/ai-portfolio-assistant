import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RECORD_TYPES, VISIBILITIES } from "@portfolio/rag";
import type { KnowledgeRecord } from "@portfolio/rag";

// Shared with the Worker, so they live in @portfolio/rag; re-exported for the scripts.
export { RECORD_TYPES, VISIBILITIES };
export type { KnowledgeRecord };

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
// The owner's real portfolio data (D-029) is what the tools use. The fictional "Alex Morgan" files stay in the
// repository as test fixtures: the unit tests that need a fixed, well-known corpus read them by name.
export const PORTFOLIO_RECORDS_FILE = "data/knowledge/portfolio-records.v1.json";
export const PORTFOLIO_EVAL_FILE = "evals/portfolio-eval.v1.json";
export const SYNTHETIC_RECORDS_FILE = "data/knowledge/synthetic-records.v3.json";
export const SYNTHETIC_EVAL_FILE = "evals/retrieval-eval.v3.json";
export const RECORDS_FILE = PORTFOLIO_RECORDS_FILE;
export const EVAL_FILE = PORTFOLIO_EVAL_FILE;

export const BEHAVIORS = ["answer", "qualify", "abstain", "refuse"] as const;
// "ranked" cases are scored with Recall@k; "list" cases ask for every matching record
// and are scored by completeness instead.
export const SCORING_MODES = ["ranked", "list"] as const;

export interface EvalCase {
  id: string;
  category: string;
  question: string;
  expectedEvidenceIds: string[];
  expectedBehavior: string;
  scoring?: string;
  requiredFacts: string[];
  forbiddenClaims: string[];
  split: string;
  isSynthetic: boolean;
}

export interface Corpus {
  datasetId: string;
  isSynthetic: boolean;
  records: KnowledgeRecord[];
}

export interface EvalSet {
  datasetId: string;
  version: number;
  isSynthetic: boolean;
  corpus: string;
  expectedBehaviorEnum: string[];
  cases: EvalCase[];
}

export function loadJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, relativePath), "utf8"));
}
