import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  PUBLIC_CORPUS_FILE,
  buildPublicCorpus,
  normalizeNewlines,
  serializePublicCorpus,
} from "./lib/corpus-build.ts";
import { RECORDS_FILE, REPO_ROOT, loadJson } from "./lib/eval-data.ts";
import type { Corpus } from "./lib/eval-data.ts";

const ALLOWED_FIELDS = new Set([
  "id",
  "type",
  "title",
  "content",
  "verificationStatus",
  "createdAt",
  "updatedAt",
  "validFrom",
  "validUntil",
  "projectId",
]);

function load(): Corpus {
  return structuredClone(loadJson(RECORDS_FILE)) as Corpus;
}

describe("buildPublicCorpus", () => {
  it("keeps every public record and drops every private one", () => {
    const corpus = load();
    const built = buildPublicCorpus(corpus);
    const publicIds = corpus.records.filter((r) => r.visibility === "public").map((r) => r.id).sort();
    assert.deepEqual(built.records.map((r) => r.id), publicIds);
    assert.ok(corpus.records.some((r) => r.visibility === "private"), "the dataset should contain a private record");
  });

  it("contains no private id, title or content anywhere in the output", () => {
    const corpus = load();
    const output = serializePublicCorpus(buildPublicCorpus(corpus));
    for (const record of corpus.records.filter((r) => r.visibility !== "public")) {
      assert.ok(!output.includes(record.id), `private id ${record.id} leaked`);
      assert.ok(!output.includes(record.title), `private title of ${record.id} leaked`);
      assert.ok(!output.includes(record.content), `private content of ${record.id} leaked`);
    }
    assert.ok(!output.includes("555-0147") && !output.includes("123,456"));
  });

  it("writes only the fields the Worker needs", () => {
    const built = buildPublicCorpus(load());
    for (const record of built.records) {
      for (const key of Object.keys(record)) assert.ok(ALLOWED_FIELDS.has(key), `unexpected field ${key}`);
    }
  });

  it("is deterministic and does not depend on the order of the source", () => {
    const corpus = load();
    const forward = serializePublicCorpus(buildPublicCorpus(corpus));
    assert.equal(forward, serializePublicCorpus(buildPublicCorpus(corpus)));

    const reversed = { ...corpus, records: [...corpus.records].reverse() };
    assert.equal(serializePublicCorpus(buildPublicCorpus(reversed)), forward);
  });

  it("refuses a public record that is not marked synthetic", () => {
    const corpus = load();
    const target = corpus.records.find((r) => r.visibility === "public");
    assert.ok(target);
    target.isSynthetic = false;
    assert.throws(() => buildPublicCorpus(corpus), /failed the privacy check/);
  });

  it("matches the committed file (run `pnpm corpus:build` if this fails)", () => {
    const file = resolve(REPO_ROOT, PUBLIC_CORPUS_FILE);
    assert.ok(existsSync(file), `${PUBLIC_CORPUS_FILE} does not exist; run "pnpm corpus:build"`);
    const committed = normalizeNewlines(readFileSync(file, "utf8"));
    assert.equal(committed, serializePublicCorpus(buildPublicCorpus(load())));
  });
});
