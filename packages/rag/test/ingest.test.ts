import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  POINT_ID_NAMESPACE,
  assertIngestable,
  contentHash,
  pointId,
  recordText,
  toPayload,
  uuidV5,
  validateVector,
} from "../src/ingest.ts";
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

describe("recordText", () => {
  it("joins title and content with a blank line", () => {
    assert.equal(recordText(record()), "Support portal\n\nBuilt a TypeScript support portal.");
  });
});

describe("contentHash", () => {
  it("matches the node:crypto hash the D1 prototype produced", async () => {
    const expected = createHash("sha256")
      .update(`${MODEL}\n${DIMS}\n${recordText(record())}`)
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
