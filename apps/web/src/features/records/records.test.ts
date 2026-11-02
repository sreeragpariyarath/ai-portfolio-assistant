import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { findRecord, formatDate, recordPath, recordTypeLabel, sourceChips, verificationLabel } from "./records.ts";
import type { PublicRecord } from "./records.ts";

// Paths are from the repo root, where `pnpm test:scripts` runs (import.meta is not available here:
// the root type-check treats apps/web files as CommonJS).
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const webBundle = read("apps/web/src/generated/public-corpus.json") as { records: PublicRecord[] };
const source = read("data/knowledge/portfolio-records.v1.json") as { records: { id: string; visibility: string; content: string }[] };

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
    assert.equal(findRecord(webBundle.records, "profile-001")?.title, "Who Sreerag is");
    assert.equal(findRecord(webBundle.records, "nope"), undefined);
  });

  it("labels types and verification statuses, with a sensible fallback", () => {
    assert.equal(recordTypeLabel("project"), "Project");
    assert.equal(recordTypeLabel("talk"), "Talk");
    assert.equal(verificationLabel("unverified"), "Unverified");
    assert.equal(verificationLabel("owner-stated"), "Stated by the owner");
    assert.equal(verificationLabel("verified-public"), "Verified on a public page");
    assert.equal(verificationLabel("custom"), "custom");
  });

  it("formats data dates and leaves anything else alone", () => {
    assert.equal(formatDate("2026-10-03"), "3 Oct 2026");
    assert.equal(formatDate("2026-13-01"), "2026-13-01");
    assert.equal(formatDate("soon"), "soon");
  });
});

describe("sourceChips", () => {
  const records = [
    { id: "a", title: "First" },
    { id: "b", title: "Second" },
    { id: "c", title: "Third" },
    { id: "d", title: "Fourth" },
  ];

  it("shows readable titles in citation order, with their citation numbers", () => {
    assert.deepEqual(sourceChips(["b", "a"], records, "answer"), [
      { id: "b", n: 1, title: "Second" },
      { id: "a", n: 2, title: "First" },
    ]);
  });

  it("shows at most three", () => {
    assert.equal(sourceChips(["a", "b", "c", "d"], records, "answer").length, 3);
    assert.equal(sourceChips(["a", "b", "c", "d"], records, "qualify", 2).length, 2);
  });

  it("shows none for an I-don't-know or a refusal, and skips ids the site does not ship", () => {
    assert.deepEqual(sourceChips(["a"], records, "abstain"), []);
    assert.deepEqual(sourceChips(["a"], records, "refuse"), []);
    assert.deepEqual(sourceChips(["missing", "a"], records, undefined), [{ id: "a", n: 2, title: "First" }]);
    assert.deepEqual(sourceChips([], records, "answer"), []);
  });
});
