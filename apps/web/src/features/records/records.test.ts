import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { findRecord, formatDate, recordPath, recordTypeLabel, verificationLabel } from "./records.ts";
import type { PublicRecord } from "./records.ts";

// Paths are from the repo root, where `pnpm test:scripts` runs (import.meta is not available here:
// the root type-check treats apps/web files as CommonJS).
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const webBundle = read("apps/web/src/generated/public-corpus.json") as { records: PublicRecord[] };
const source = read("data/knowledge/synthetic-records.v3.json") as { records: { id: string; visibility: string; content: string }[] };

describe("the web app's public record bundle", () => {
  it("holds every public record and no private one", () => {
    const publicIds = source.records.filter((record) => record.visibility === "public").map((record) => record.id).sort();
    const privateRecords = source.records.filter((record) => record.visibility !== "public");
    assert.deepEqual(webBundle.records.map((record) => record.id).sort(), publicIds);
    assert.ok(privateRecords.length > 0, "the dataset has a private record to test against");
    const text = JSON.stringify(webBundle);
    for (const record of privateRecords) {
      assert.ok(!text.includes(record.id), `private id ${record.id} leaked`);
      assert.ok(!text.includes(record.content), `private content of ${record.id} leaked`);
    }
  });

  it("carries no visibility or synthetic flags, only what a page shows", () => {
    for (const record of webBundle.records) {
      assert.equal("visibility" in record, false);
      assert.equal("isSynthetic" in record, false);
    }
  });
});

describe("record helpers", () => {
  it("builds a safe page path", () => {
    assert.equal(recordPath("project-demo-001"), "/records/project-demo-001");
    assert.equal(recordPath("a b/c"), "/records/a%20b%2Fc");
  });

  it("finds a record by id", () => {
    assert.equal(findRecord(webBundle.records, "project-demo-001")?.title, "Support knowledge assistant");
    assert.equal(findRecord(webBundle.records, "nope"), undefined);
  });

  it("labels types and verification statuses, with a sensible fallback", () => {
    assert.equal(recordTypeLabel("project"), "Project");
    assert.equal(recordTypeLabel("talk"), "Talk");
    assert.equal(verificationLabel("unverified"), "Unverified");
    assert.equal(verificationLabel("custom"), "custom");
  });

  it("formats data dates and leaves anything else alone", () => {
    assert.equal(formatDate("2026-10-03"), "3 Oct 2026");
    assert.equal(formatDate("2026-13-01"), "2026-13-01");
    assert.equal(formatDate("soon"), "soon");
  });
});
