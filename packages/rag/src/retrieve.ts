// Hybrid retrieval over a public-only corpus (Phase 3 tasks 3.4 and 3.9). Shared by the Worker and the answer
// eval so both run the same code. Privacy is enforced here as the third layer (D-015): a record is used only if
// it exists in the corpus passed in, which `pnpm corpus:build` fills with public records only.
import { buildIndex, search, type Bm25Index, type Hit } from "./bm25.ts";
import { hybridSearch } from "./fusion.ts";
import type { PromptRecord } from "./prompt.ts";

export const CONTEXT_LIMIT = 8;
export const CANDIDATE_DEPTH = 20;

export interface PublicRecord {
  id: string;
  type: string;
  title: string;
  content: string;
  verificationStatus: string;
  validUntil?: string;
}

// The only fields that may reach the prompt (see PromptRecord). No visibility, no dates other than validUntil.
export type ContextRecord = PromptRecord;

export interface Corpus {
  records: Map<string, PublicRecord>;
  index: Bm25Index;
}

export interface RetrievalResult {
  records: ContextRecord[];
  // True when dense search failed and the answer context comes from BM25 only.
  degraded: boolean;
  counts: { bm25: number; dense: number; droppedDense: number; context: number };
}

export type DenseSearcher = (question: string) => Promise<Hit[]>;

export function createCorpus(records: PublicRecord[]): Corpus {
  return {
    records: new Map(records.map((record) => [record.id, record])),
    index: buildIndex(records.map((record) => ({ id: record.id, text: `${record.title} ${record.content}` }))),
  };
}

export function toContextRecord(record: PublicRecord): ContextRecord {
  const context: ContextRecord = {
    id: record.id,
    type: record.type,
    title: record.title,
    verificationStatus: record.verificationStatus,
    content: record.content,
  };
  if (record.validUntil !== undefined) context.validUntil = record.validUntil;
  return context;
}

// Words that mark a "hardest problem" kind of question. The records that answer it (decisions, hard fixes,
// trade-offs) rarely share those words, so the search also looks for what such a story is made of.
const CHALLENGE_QUESTION = /\b(hardest|toughest|most difficult|most challenging|biggest challenge|biggest problem|proud(?:est)? of|difficult (?:problem|work|thing)|challenging (?:problem|work|thing))\b/i;
const CHALLENGE_TERMS = "decision problem fix trade-off race bug challenge solved";
// How many decision records a challenge-style question is guaranteed to see.
export const CHALLENGE_DECISIONS = 3;

export function isChallengeQuestion(question: string): boolean {
  return CHALLENGE_QUESTION.test(question);
}

// The text the search uses for a question. The visitor's own words come first; only a challenge-style question
// gets extra search terms, and the prompt still sees the original question.
export function searchText(question: string): string {
  return isChallengeQuestion(question) ? `${question} ${CHALLENGE_TERMS}` : question;
}

export async function retrieve(
  question: string,
  dense: DenseSearcher,
  { corpus, limit = CONTEXT_LIMIT }: { corpus: Corpus; limit?: number },
): Promise<RetrievalResult> {
  const text = searchText(question);
  const bm25Hits = search(corpus.index, text, CANDIDATE_DEPTH);

  let denseHits: Hit[] = [];
  let degraded = false;
  try {
    denseHits = await dense(text);
  } catch (error) {
    // Degraded mode: BM25 still answers. Log the error type only, never the question or upstream text.
    degraded = true;
    console.warn(JSON.stringify({ event: "dense_search_failed", error: error instanceof Error ? error.name : "unknown" }));
  }

  // Drop any dense hit that is not in the public corpus (a private or stale Qdrant point).
  const knownDense = denseHits.filter((hit) => corpus.records.has(hit.id));
  const fused = hybridSearch(bm25Hits, knownDense, { depth: CANDIDATE_DEPTH, limit });

  const records = fused.flatMap((hit) => {
    const record = corpus.records.get(hit.id);
    return record ? [toContextRecord(record)] : [];
  });

  // "What was your hardest problem?" shares few words with the records that answer it. Make sure a few decision
  // records (the hard fixes and trade-offs) are in the context, after the normal hits: the best matches first, then
  // the other decisions in file order, so there are always some to talk about.
  if (isChallengeQuestion(question)) {
    const inContext = new Set(records.map((record) => record.id));
    const ranked = search(corpus.index, text, corpus.records.size).map((hit) => hit.id);
    const decisions = [...corpus.records.values()].filter((record) => record.type === "decision");
    const rank = (id: string) => {
      const at = ranked.indexOf(id);
      return at === -1 ? Number.MAX_SAFE_INTEGER : at;
    };
    const ordered = [...decisions].sort((a, b) => rank(a.id) - rank(b.id));
    let added = records.filter((record) => record.type === "decision").length;
    for (const record of ordered) {
      if (added >= CHALLENGE_DECISIONS) break;
      if (inContext.has(record.id)) continue;
      records.push(toContextRecord(record));
      added++;
    }
  }

  return {
    records,
    degraded,
    counts: {
      bm25: bm25Hits.length,
      dense: knownDense.length,
      droppedDense: denseHits.length - knownDense.length,
      context: records.length,
    },
  };
}
