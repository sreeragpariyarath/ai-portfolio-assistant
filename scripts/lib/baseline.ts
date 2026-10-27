import { buildIndex, search } from "./bm25.ts";
import type { Hit } from "./bm25.ts";
import type { Corpus, EvalSet } from "./eval-data.ts";

export const KS = [5, 10] as const;

export interface CaseResult {
  id: string;
  question: string;
  expected: string[];
  retrieved: Hit[];
}

export interface KSummary {
  k: number;
  casesWithEvidence: number;
  meanRecall: number;
  fullCoverageCases: number;
}

export interface Miss {
  caseId: string;
  k: number;
  missing: string[];
}

export interface ZeroEvidenceCase {
  caseId: string;
  question: string;
  topScore: number;
  topIds: string[];
}

export interface BaselineReport {
  indexedRecords: number;
  excludedPrivateRecords: number;
  totalCases: number;
  byK: KSummary[];
  misses: Miss[];
  zeroEvidence: ZeroEvidenceCase[];
  privateRecordsRetrieved: string[];
}

export function recallAtK(expected: string[], retrievedIds: string[], k: number): number {
  if (expected.length === 0) throw new Error("recall is undefined without expected evidence");
  const top = new Set(retrievedIds.slice(0, k));
  return expected.filter((id) => top.has(id)).length / expected.length;
}

export function runBaseline(corpus: Corpus, evalSet: EvalSet): BaselineReport {
  // Private records are removed before indexing, so they can never be retrieved.
  const publicRecords = corpus.records.filter((record) => record.visibility === "public");
  const privateIds = new Set(
    corpus.records.filter((record) => record.visibility !== "public").map((record) => record.id),
  );
  const index = buildIndex(publicRecords.map((record) => ({ id: record.id, text: `${record.title} ${record.content}` })));

  const results: CaseResult[] = evalSet.cases.map((evalCase) => ({
    id: evalCase.id,
    question: evalCase.question,
    expected: evalCase.expectedEvidenceIds,
    retrieved: search(index, evalCase.question, Math.max(...KS)),
  }));

  const withEvidence = results.filter((result) => result.expected.length > 0);
  const byK: KSummary[] = [];
  const misses: Miss[] = [];

  for (const k of KS) {
    let recallSum = 0;
    let fullCoverageCases = 0;
    for (const result of withEvidence) {
      const retrievedIds = result.retrieved.map((hit) => hit.id);
      recallSum += recallAtK(result.expected, retrievedIds, k);
      const top = new Set(retrievedIds.slice(0, k));
      const missing = result.expected.filter((id) => !top.has(id));
      if (missing.length === 0) fullCoverageCases++;
      else misses.push({ caseId: result.id, k, missing });
    }
    byK.push({
      k,
      casesWithEvidence: withEvidence.length,
      meanRecall: withEvidence.length > 0 ? recallSum / withEvidence.length : 0,
      fullCoverageCases,
    });
  }

  const zeroEvidence = results
    .filter((result) => result.expected.length === 0)
    .map((result) => ({
      caseId: result.id,
      question: result.question,
      topScore: result.retrieved[0]?.score ?? 0,
      topIds: result.retrieved.slice(0, 3).map((hit) => hit.id),
    }));

  const privateRecordsRetrieved = [
    ...new Set(results.flatMap((result) => result.retrieved.map((hit) => hit.id)).filter((id) => privateIds.has(id))),
  ];

  return {
    indexedRecords: publicRecords.length,
    excludedPrivateRecords: privateIds.size,
    totalCases: results.length,
    byK,
    misses,
    zeroEvidence,
    privateRecordsRetrieved,
  };
}
