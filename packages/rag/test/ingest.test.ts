import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  POINT_ID_NAMESPACE,
  assertIngestable,
  contentHash,
  planIngest,
  pointId,
  toPayload,
  uuidV5,
  validateVector,
} from "../src/ingest.ts";
import { documentInput, queryInput } from "../src/embedding-input.ts";
import type { KnowledgeRecord } from "../src/types.ts";

const MODEL = "gemini-embedding-2";
const DIMS = 768;

function record(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return {
    id: "project-demo-001",
    type: "project",
    title: "Support portal",
    content: "Built a TypeScript support portal.",
    verificationStatus: "synthetic",
    isSynthetic: true,
    visibility: "public",
    createdAt: "2024-01-01",
    updatedAt: "2024-02-01",
    ...overrides,
  };
}

describe("embedding input formats", () => {
  it("formats documents and queries the way gemini-embedding-2 expects", () => {
    assert.equal(documentInput("Support portal", "Built it."), "title: Support portal | text: Built it.");
    assert.equal(documentInput("", "Built it."), "title: none | text: Built it.");
    assert.equal(queryInput("What did Alex build?"), "task: search result | query: What did Alex build?");
  });
});

describe("contentHash", () => {
  it("is the node:crypto sha256 of model, dimensions and the embedded document text", async () => {
    const expected = createHash("sha256")
      .update(`${MODEL}\n${DIMS}\n${documentInput(record().title, record().content)}`)
      .digest("hex");
    assert.equal(await contentHash(record(), MODEL, DIMS), expected);
  });

  it("changes when the text, model or dimensions change", async () => {
    const base = await contentHash(record(), MODEL, DIMS);
    assert.notEqual(await contentHash(record({ content: "Other." }), MODEL, DIMS), base);
    assert.notEqual(await contentHash(record(), "other-model", DIMS), base);
    assert.notEqual(await contentHash(record(), MODEL, 512), base);
  });

  it("ignores fields that are not embedded", async () => {
    const base = await contentHash(record(), MODEL, DIMS);
    assert.equal(await contentHash(record({ updatedAt: "2030-01-01" }), MODEL, DIMS), base);
  });
});

describe("validateVector", () => {
  it("accepts the right length of finite numbers", () => {
    const vector = new Array<number>(DIMS).fill(0.1);
    assert.equal(validateVector(vector, DIMS), vector);
  });

  it("rejects wrong length, NaN, Infinity and non-numbers", () => {
    assert.throws(() => validateVector([0.1], DIMS));
    assert.throws(() => validateVector(new Array<number>(DIMS).fill(Number.NaN), DIMS));
    assert.throws(() => validateVector(new Array<number>(DIMS).fill(Infinity), DIMS));
    assert.throws(() => validateVector(new Array<unknown>(DIMS).fill("0.1"), DIMS));
    assert.throws(() => validateVector(null, DIMS));
  });
});

describe("assertIngestable", () => {
  it("accepts a public synthetic record", () => {
    assert.doesNotThrow(() => assertIngestable(record()));
  });

  it("rejects a private record without leaking its content", () => {
    const secret = "do-not-leak-this";
    assert.throws(
      () => assertIngestable(record({ id: "private-demo-001", visibility: "private", content: secret })),
      (error: Error) => error.message.includes("private-demo-001") && !error.message.includes(secret),
    );
  });

  it("rejects a record that is not synthetic", () => {
    assert.throws(() => assertIngestable(record({ isSynthetic: false })));
  });
});

describe("uuidV5", () => {
  it("matches the RFC 4122 reference vector (DNS namespace, python.org)", async () => {
    const dns = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    assert.equal(await uuidV5("python.org", dns), "886313e1-3b8a-5372-9b90-0c9aee199e5d");
  });
});

describe("pointId", () => {
  it("is stable and a well-formed version 5 UUID", async () => {
    const id = await pointId("project-demo-001");
    assert.equal(id, await pointId("project-demo-001"));
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("differs per record and derives from the project namespace", async () => {
    assert.notEqual(await pointId("project-demo-001"), await pointId("project-demo-002"));
    assert.equal(await pointId("project-demo-001"), await uuidV5("project-demo-001", POINT_ID_NAMESPACE));
  });

  it("is pinned so stored points are never orphaned by an accidental change", async () => {
    assert.equal(await pointId("project-demo-001"), "26b377a6-c4ff-5d6b-9218-1ec0ede74fb9");
  });
});

describe("toPayload", () => {
  it("maps record fields and embedding metadata", () => {
    const payload = toPayload(record(), "abc123", MODEL, DIMS);
    assert.deepEqual(payload, {
      record_id: "project-demo-001",
      type: "project",
      title: "Support portal",
      content: "Built a TypeScript support portal.",
      visibility: "public",
      verification_status: "synthetic",
      is_synthetic: true,
      created_at: "2024-01-01",
      updated_at: "2024-02-01",
      content_hash: "abc123",
      embedding_model: MODEL,
      embedding_dimensions: DIMS,
    });
  });

  it("includes the optional fields only when the record has them", () => {
    const payload = toPayload(
      record({ projectId: "project-demo-009", validFrom: "2023-01-01", validUntil: "2024-01-01" }),
      "abc123",
      MODEL,
      DIMS,
    );
    assert.equal(payload.project_id, "project-demo-009");
    assert.equal(payload.valid_from, "2023-01-01");
    assert.equal(payload.valid_until, "2024-01-01");
    assert.ok(!("project_id" in toPayload(record(), "abc123", MODEL, DIMS)));
  });
});

describe("planIngest", () => {
  const options = { model: MODEL, dims: DIMS };
  const a = record({ id: "a", title: "A", content: "Alpha" });
  const b = record({ id: "b", title: "B", content: "Beta" });

  async function stored(records: KnowledgeRecord[], model = MODEL, dims = DIMS) {
    return Promise.all(
      records.map(async (r) => ({
        id: await pointId(r.id),
        payload: toPayload(r, await contentHash(r, model, dims), model, dims) as unknown as Record<string, unknown>,
      })),
    );
  }

  it("upserts everything on the first run", async () => {
    const plan = await planIngest([a, b], [], options);
    assert.deepEqual(plan.toUpsert.map((p) => p.record.id), ["a", "b"]);
    assert.equal(plan.unchanged.length, 0);
    assert.deepEqual(plan.toDelete, []);
  });

  it("changes nothing on a rerun", async () => {
    const plan = await planIngest([a, b], await stored([a, b]), options);
    assert.equal(plan.toUpsert.length, 0);
    assert.deepEqual(plan.unchanged.map((p) => p.record.id), ["a", "b"]);
    assert.deepEqual(plan.toDelete, []);
  });

  it("re-embeds only the edited record", async () => {
    const edited = { ...b, content: "Beta, revised" };
    const plan = await planIngest([a, edited], await stored([a, b]), options);
    assert.deepEqual(plan.toUpsert.map((p) => p.record.id), ["b"]);
    assert.deepEqual(plan.unchanged.map((p) => p.record.id), ["a"]);
  });

  it("deletes the point of a removed record", async () => {
    const plan = await planIngest([a], await stored([a, b]), options);
    assert.deepEqual(plan.toDelete, [await pointId("b")]);
    assert.equal(plan.toUpsert.length, 0);
  });

  it("deletes a record made private and never upserts it", async () => {
    // The caller filters to public records, so a now-private record is simply absent.
    const plan = await planIngest([a], await stored([a, b]), options);
    assert.deepEqual(plan.toDelete, [await pointId("b")]);
    assert.ok(plan.toUpsert.every((p) => p.record.id !== "b"));
  });

  it("refuses a private record handed to it by mistake", async () => {
    await assert.rejects(planIngest([{ ...b, visibility: "private" }], [], options), /privacy check/);
  });

  it("re-embeds everything when the model or dimensions change", async () => {
    const existing = await stored([a, b]);
    assert.equal((await planIngest([a, b], existing, { model: "other-model", dims: DIMS })).toUpsert.length, 2);
    assert.equal((await planIngest([a, b], existing, { model: MODEL, dims: 256 })).toUpsert.length, 2);
  });

  it("re-embeds when the stored payload metadata disagrees with a matching hash", async () => {
    const existing = await stored([a]);
    existing[0]!.payload.embedding_model = "stale";
    assert.equal((await planIngest([a], existing, options)).toUpsert.length, 1);
  });

  it("deletes points that have no matching record, such as strays", async () => {
    const plan = await planIngest([a], [...(await stored([a])), { id: "stray", payload: {} }], options);
    assert.deepEqual(plan.toDelete, ["stray"]);
  });
});
