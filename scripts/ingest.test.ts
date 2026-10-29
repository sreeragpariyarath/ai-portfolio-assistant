import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pointId } from "@portfolio/rag";
import type { KnowledgeRecord, StoredPoint, UpsertPoint } from "@portfolio/rag";
import { runIngest } from "./lib/ingest-run.ts";
import type { IngestDeps } from "./lib/ingest-run.ts";

const DIMS = 3;

function record(id: string, overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return {
    id,
    type: "project",
    title: `Title ${id}`,
    content: `Content ${id}`,
    verificationStatus: "synthetic",
    isSynthetic: true,
    visibility: "public",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    ...overrides,
  };
}

// In-memory stand-ins for Qdrant and Gemini that record every call.
function fakes(initial: StoredPoint[] | null) {
  let points = initial === null ? null : new Map(initial.map((p) => [p.id, p]));
  const calls = { embedded: [] as string[], created: 0, upserts: 0, deletes: 0 };
  const deps: Omit<IngestDeps, "dryRun" | "log"> = {
    collection: "c",
    model: "m",
    dims: DIMS,
    gemini: {
      async embedDocuments(docs) {
        calls.embedded.push(...docs.map((d) => d.title));
        return docs.map(() => [0.1, 0.2, 0.3]);
      },
    },
    qdrant: {
      async checkCollection() {
        return points === null ? "missing" : "ok";
      },
      async ensureCollection() {
        if (points !== null) return "exists";
        points = new Map();
        calls.created++;
        return "created";
      },
      async ensurePayloadIndex() {},
      async scrollAll() {
        return [...(points ?? new Map()).values()];
      },
      async upsertPoints(_name: string, batch: UpsertPoint[]) {
        calls.upserts += batch.length;
        for (const p of batch) points!.set(p.id, { id: p.id, payload: p.payload });
      },
      async deletePoints(_name: string, ids: string[]) {
        calls.deletes += ids.length;
        for (const id of ids) points!.delete(id);
      },
      async count() {
        return points?.size ?? 0;
      },
      async retrieve(_name: string, ids: string[]) {
        return ids.flatMap((id) => (points?.has(id) ? [points.get(id)!] : []));
      },
    },
  };
  return { deps, calls, stored: () => points };
}

const run = (records: KnowledgeRecord[], f: ReturnType<typeof fakes>, dryRun = false) =>
  runIngest(records, { ...f.deps, dryRun, log: () => {} });

describe("runIngest", () => {
  const records = [record("a"), record("b"), record("secret", { visibility: "private" })];

  it("embeds and stores only public records on a first run", async () => {
    const f = fakes(null);
    const summary = await run(records, f);
    assert.deepEqual(summary, { collectionCreated: true, upserted: 2, unchanged: 0, deleted: 0 });
    assert.deepEqual(f.calls.embedded, ["Title a", "Title b"]);
    assert.equal(f.stored()!.has(await pointId("secret")), false);
  });

  it("upserts nothing on the second run", async () => {
    const f = fakes(null);
    await run(records, f);
    const embeddedBefore = f.calls.embedded.length;
    const summary = await run(records, f);
    assert.deepEqual(summary, { collectionCreated: false, upserted: 0, unchanged: 2, deleted: 0 });
    assert.equal(f.calls.embedded.length, embeddedBefore);
  });

  it("dry run reads only: no creation, embedding, upsert or delete", async () => {
    const f = fakes(null);
    const summary = await run(records, f, true);
    assert.equal(summary.upserted, 2);
    assert.equal(summary.collectionCreated, true);
    assert.deepEqual(f.calls, { embedded: [], created: 0, upserts: 0, deletes: 0 });
    assert.equal(f.stored(), null);
  });

  it("removes the point of a record that was made private", async () => {
    const f = fakes(null);
    await run(records, f);
    const nowPrivate = [record("a"), record("b", { visibility: "private" })];
    const summary = await run(nowPrivate, f);
    assert.equal(summary.deleted, 1);
    assert.equal(f.stored()!.has(await pointId("b")), false);
  });

  it("fails verification when a private record is in the collection", async () => {
    const f = fakes(null);
    const secretId = await pointId("secret");
    await run([record("a")], f);
    // Simulate a leaked private point that the planner never sees.
    const original = f.deps.qdrant.retrieve;
    f.deps.qdrant.retrieve = async (name, ids, options) =>
      ids.includes(secretId) ? [{ id: secretId, payload: {} }] : original(name, ids, options);
    await assert.rejects(run([record("a"), record("secret", { visibility: "private" })], f), /private record is present/);
  });

  it("refuses to run with no public records", async () => {
    await assert.rejects(run([record("x", { visibility: "private" })], fakes(null)), /No public records/);
  });

  it("rejects a wrong-size vector instead of storing it", async () => {
    const f = fakes(null);
    f.deps.gemini.embedDocuments = async (docs) => docs.map(() => [1, 2]);
    await assert.rejects(run(records, f), /finite embedding values/);
    assert.equal(f.calls.upserts, 0);
  });
});
