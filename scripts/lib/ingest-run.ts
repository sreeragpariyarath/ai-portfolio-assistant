import { assertIngestable, planIngest, pointId, toPayload, validateVector } from "@portfolio/rag";
import type { GeminiClient, KnowledgeRecord, QdrantClient } from "@portfolio/rag";

export const PAYLOAD_INDEXES = ["visibility", "record_id", "type"] as const;

export interface IngestDeps {
  qdrant: Pick<
    QdrantClient,
    | "checkCollection"
    | "ensureCollection"
    | "ensurePayloadIndex"
    | "scrollAll"
    | "upsertPoints"
    | "deletePoints"
    | "count"
    | "retrieve"
  >;
  gemini: Pick<GeminiClient, "embedDocuments">;
  collection: string;
  model: string;
  dims: number;
  dryRun: boolean;
  log: (message: string) => void;
}

export interface IngestSummary {
  collectionCreated: boolean;
  upserted: number;
  unchanged: number;
  deleted: number;
}

// Orchestrates one ingest run. Never logs keys, vectors or record content.
export async function runIngest(records: KnowledgeRecord[], deps: IngestDeps): Promise<IngestSummary> {
  const { qdrant, gemini, collection, model, dims, dryRun, log } = deps;
  const spec = { size: dims, distance: "Cosine" } as const;

  // Private records are dropped here, before any embedding or storage call.
  const publicRecords = records.filter((record) => record.visibility === "public");
  if (publicRecords.length === 0) throw new Error("No public records found. Refusing to continue.");
  for (const record of publicRecords) assertIngestable(record);
  log(`Public synthetic records: ${publicRecords.length}; private excluded: ${records.length - publicRecords.length}`);

  let collectionCreated = false;
  if (dryRun) {
    const state = await qdrant.checkCollection(collection, spec);
    collectionCreated = state === "missing";
    log(collectionCreated ? "Collection does not exist; a real run would create it." : "Collection exists.");
  } else {
    collectionCreated = (await qdrant.ensureCollection(collection, spec)) === "created";
    for (const field of PAYLOAD_INDEXES) await qdrant.ensurePayloadIndex(collection, field, "keyword");
    log(collectionCreated ? "Collection created." : "Collection exists.");
  }

  const existing = collectionCreated ? [] : await qdrant.scrollAll(collection);
  const plan = await planIngest(publicRecords, existing, { model, dims });
  log(`Plan: ${plan.toUpsert.length} to upsert, ${plan.unchanged.length} unchanged, ${plan.toDelete.length} to delete`);

  const summary: IngestSummary = {
    collectionCreated,
    upserted: plan.toUpsert.length,
    unchanged: plan.unchanged.length,
    deleted: plan.toDelete.length,
  };
  if (dryRun) {
    log("Dry run: nothing was embedded or written.");
    return summary;
  }

  if (plan.toUpsert.length > 0) {
    const vectors = await gemini.embedDocuments(
      plan.toUpsert.map(({ record }) => ({ title: record.title, content: record.content })),
    );
    if (vectors.length !== plan.toUpsert.length) {
      throw new Error(`Expected ${plan.toUpsert.length} embeddings, got ${vectors.length}.`);
    }
    const points = plan.toUpsert.map(({ record, id, hash }, index) => ({
      id,
      vector: validateVector(vectors[index], dims),
      payload: { ...toPayload(record, hash, model, dims) },
    }));
    await qdrant.upsertPoints(collection, points);
    log(`Upserted ${points.length} points.`);
  }
  if (plan.toDelete.length > 0) {
    await qdrant.deletePoints(collection, plan.toDelete);
    log(`Deleted ${plan.toDelete.length} stale points.`);
  }

  await verify(publicRecords, records, deps);
  log("Verification passed.");
  return summary;
}

async function verify(publicRecords: KnowledgeRecord[], all: KnowledgeRecord[], deps: IngestDeps): Promise<void> {
  const { qdrant, collection, model, dims } = deps;
  const problems: string[] = [];

  const count = await qdrant.count(collection);
  if (count !== publicRecords.length) problems.push(`point count is ${count}, expected ${publicRecords.length}`);

  const wanted = new Set(await Promise.all(publicRecords.map((record) => pointId(record.id))));
  const stored = await qdrant.scrollAll(collection);
  if (stored.some((point) => !wanted.has(point.id))) problems.push("a stored point has no public record");
  const badMeta = stored.filter(
    (point) =>
      point.payload.embedding_model !== model ||
      point.payload.embedding_dimensions !== dims ||
      point.payload.visibility !== "public",
  );
  if (badMeta.length > 0) problems.push(`${badMeta.length} point(s) have the wrong model, dimensions or visibility`);

  const privateIds = await Promise.all(
    all.filter((record) => record.visibility !== "public").map((record) => pointId(record.id)),
  );
  if (privateIds.length > 0 && (await qdrant.retrieve(collection, privateIds, { withPayload: false })).length > 0) {
    problems.push("a private record is present in the collection");
  }

  if (problems.length > 0) throw new Error(`Verification failed: ${problems.join("; ")}.`);
}
