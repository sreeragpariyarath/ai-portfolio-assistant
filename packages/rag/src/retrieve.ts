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

export async function retrieve(
  question: string,
  dense: DenseSearcher,
  { corpus, limit = CONTEXT_LIMIT }: { corpus: Corpus; limit?: number },
): Promise<RetrievalResult> {
  const bm25Hits = search(corpus.index, question, CANDIDATE_DEPTH);

  let denseHits: Hit[] = [];
  let degraded = false;
  try {
    denseHits = await dense(question);
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
