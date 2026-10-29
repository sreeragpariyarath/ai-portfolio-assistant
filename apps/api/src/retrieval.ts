// Retrieval for POST /api/chat (Phase 3 task 3.4): hybrid search over the bundled public corpus. The search
// itself lives in @portfolio/rag (shared with the answer eval); this file holds what is specific to the Worker:
// the bundled corpus, built once per isolate, and the Gemini and Qdrant clients for dense search.
import {
  EmbeddingCache,
  cachedEmbedQuery,
  createCorpus,
  createGeminiClient,
  createQdrantClient,
  denseSearch,
  retrieve as retrieveFrom,
  CANDIDATE_DEPTH,
  CONTEXT_LIMIT,
  type Corpus,
  type DenseSearcher,
  type GeminiClient,
  type PublicRecord,
  type RetrievalResult,
} from "@portfolio/rag";
import corpusFile from "./generated/public-corpus.json";

export { CANDIDATE_DEPTH, CONTEXT_LIMIT, createCorpus, toContextRecord } from "@portfolio/rag";
export type { ContextRecord, Corpus, DenseSearcher, RetrievalResult } from "@portfolio/rag";

// Query vectors must have the same size as the ingested ones (see scripts/ingest.ts).
export const EMBEDDING_DIMS = 768;
// Per isolate. Holds vectors under hash keys only, never question text (D-015).
export const EMBEDDING_CACHE_ENTRIES = 200;
export const sharedEmbeddingCache = new EmbeddingCache(EMBEDDING_CACHE_ENTRIES);

// Built once per isolate, at module load.
const bundledCorpus = createCorpus((corpusFile as { records: PublicRecord[] }).records);

export function retrieve(
  question: string,
  dense: DenseSearcher,
  { corpus = bundledCorpus, limit = CONTEXT_LIMIT }: { corpus?: Corpus; limit?: number } = {},
): Promise<RetrievalResult> {
  return retrieveFrom(question, dense, { corpus, limit });
}

// Dense search against Qdrant with the public-only filter (applied inside denseSearch). Query embeddings are
// cached per isolate, so a repeated question skips the Gemini embedding call.
// Retries are short so a slow upstream cannot hold the request: after that, BM25 answers.
export function createDenseSearcher(
  env: Pick<Env, "GEMINI_API_KEY" | "EMBEDDING_MODEL" | "QDRANT_URL" | "QDRANT_API_KEY" | "QDRANT_COLLECTION">,
  overrides: { gemini?: Pick<GeminiClient, "embedQuery">; fetch?: typeof fetch; cache?: EmbeddingCache } = {},
): DenseSearcher {
  const inner =
    overrides.gemini ??
    createGeminiClient({
      apiKey: env.GEMINI_API_KEY,
      model: env.EMBEDDING_MODEL,
      dims: EMBEDDING_DIMS,
      maxRetries: 1,
      timeoutMs: 8_000,
      ...(overrides.fetch ? { fetch: overrides.fetch } : {}),
    });
  const gemini = {
    embedQuery: cachedEmbedQuery(inner, {
      model: env.EMBEDDING_MODEL,
      dims: EMBEDDING_DIMS,
      cache: overrides.cache ?? sharedEmbeddingCache,
    }),
  };
  const qdrant = createQdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY,
    maxRetries: 1,
    timeoutMs: 8_000,
    ...(overrides.fetch ? { fetch: overrides.fetch } : {}),
  });
  return (question) => denseSearch({ gemini, qdrant, collection: env.QDRANT_COLLECTION }, question, { limit: CANDIDATE_DEPTH });
}
