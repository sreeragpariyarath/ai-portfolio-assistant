// Retrieval for POST /api/chat (Phase 3 task 3.4): hybrid search over the bundled public corpus.
// Privacy is enforced here as the third layer (D-015): a record is used only if it exists in the
// bundled corpus, which `pnpm corpus:build` fills with public records only.
import {
  buildIndex,
  createGeminiClient,
  createQdrantClient,
  denseSearch,
  hybridSearch,
  search,
  type Bm25Index,
  type GeminiClient,
  type Hit,
} from "@portfolio/rag";
import corpusFile from "./generated/public-corpus.json";

// Query vectors must have the same size as the ingested ones (see scripts/ingest.ts).
export const EMBEDDING_DIMS = 768;
export const CONTEXT_LIMIT = 8;
export const CANDIDATE_DEPTH = 20;

interface PublicRecord {
  id: string;
  type: string;
  title: string;
  content: string;
  verificationStatus: string;
  validUntil?: string;
}

// The only fields that may reach the prompt (3.5). No visibility, no dates other than validUntil.
export interface ContextRecord {
  id: string;
  type: string;
  title: string;
  verificationStatus: string;
  validUntil?: string;
  content: string;
}

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

export function createCorpus(records: PublicRecord[]): Corpus {
  return {
    records: new Map(records.map((record) => [record.id, record])),
    index: buildIndex(records.map((record) => ({ id: record.id, text: `${record.title} ${record.content}` }))),
  };
}

// Built once per isolate, at module load.
const bundledCorpus = createCorpus((corpusFile as { records: PublicRecord[] }).records);

export type DenseSearcher = (question: string) => Promise<Hit[]>;

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
  { corpus = bundledCorpus, limit = CONTEXT_LIMIT }: { corpus?: Corpus; limit?: number } = {},
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

  // Drop any dense hit that is not in the bundled public corpus (a private or stale Qdrant point).
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

// Dense search against Qdrant with the public-only filter (applied inside denseSearch).
// Retries are short so a slow upstream cannot hold the request: after that, BM25 answers.
export function createDenseSearcher(
  env: Pick<Env, "GEMINI_API_KEY" | "EMBEDDING_MODEL" | "QDRANT_URL" | "QDRANT_API_KEY" | "QDRANT_COLLECTION">,
  overrides: { gemini?: Pick<GeminiClient, "embedQuery">; fetch?: typeof fetch } = {},
): DenseSearcher {
  const gemini =
    overrides.gemini ??
    createGeminiClient({
      apiKey: env.GEMINI_API_KEY,
      model: env.EMBEDDING_MODEL,
      dims: EMBEDDING_DIMS,
      maxRetries: 1,
      timeoutMs: 8_000,
      ...(overrides.fetch ? { fetch: overrides.fetch } : {}),
    });
  const qdrant = createQdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY,
    maxRetries: 1,
    timeoutMs: 8_000,
    ...(overrides.fetch ? { fetch: overrides.fetch } : {}),
  });
  return (question) => denseSearch({ gemini, qdrant, collection: env.QDRANT_COLLECTION }, question, { limit: CANDIDATE_DEPTH });
}
