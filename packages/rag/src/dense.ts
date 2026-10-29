import type { Hit } from "./bm25.ts";
import type { GeminiClient } from "./gemini.ts";
import type { QdrantClient } from "./qdrant.ts";

export interface DenseDeps {
  gemini: Pick<GeminiClient, "embedQuery">;
  qdrant: Pick<QdrantClient, "query">;
  collection: string;
}

// Every dense query carries this filter; it is not optional.
export const PUBLIC_ONLY_FILTER = { must: [{ key: "visibility", match: { value: "public" } }] };

// Searches with an already-computed query vector, so callers can cache embeddings.
// Returns record ids (not Qdrant point ids), best first.
export async function denseSearchByVector(
  qdrant: Pick<QdrantClient, "query">,
  collection: string,
  vector: number[],
  { limit = 20 }: { limit?: number } = {},
): Promise<Hit[]> {
  const points = await qdrant.query(collection, vector, { filter: PUBLIC_ONLY_FILTER, limit, withPayload: true });
  return points.flatMap((point) => {
    const recordId = point.payload.record_id;
    // Defense in depth: drop anything without a record id or not marked public, even though the filter excludes it.
    if (typeof recordId !== "string" || point.payload.visibility !== "public") return [];
    return [{ id: recordId, score: point.score }];
  });
}

export async function denseSearch(deps: DenseDeps, question: string, options: { limit?: number } = {}): Promise<Hit[]> {
  const vector = await deps.gemini.embedQuery(question);
  return denseSearchByVector(deps.qdrant, deps.collection, vector, options);
}
