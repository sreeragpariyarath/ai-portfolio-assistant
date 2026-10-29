export { buildIndex, search, tokenize } from "./bm25.ts";
export type { Bm25Index, Doc, Hit } from "./bm25.ts";
export {
  POINT_ID_NAMESPACE,
  assertIngestable,
  contentHash,
  planIngest,
  pointId,
  toPayload,
  uuidV5,
  validateVector,
} from "./ingest.ts";
export type { IngestPlan, PlannedRecord, PointPayload } from "./ingest.ts";
export { documentInput, queryInput } from "./embedding-input.ts";
export { hybridSearch, rrf } from "./fusion.ts";
export type { HybridOptions, RrfOptions } from "./fusion.ts";
export { GeminiError, createGeminiClient } from "./gemini.ts";
export type { EmbedDocument, GeminiClient, GeminiClientOptions } from "./gemini.ts";
export { recallAtK } from "./metrics.ts";
export { QdrantError, createQdrantClient } from "./qdrant.ts";
export type {
  Payload,
  QdrantClient,
  QdrantClientOptions,
  QdrantFilter,
  ScoredPoint,
  StoredPoint,
  UpsertPoint,
  VectorSpec,
} from "./qdrant.ts";
export { RECORD_TYPES, VISIBILITIES } from "./types.ts";
export type { KnowledgeRecord } from "./types.ts";
