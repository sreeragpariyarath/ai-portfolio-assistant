import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REAL_SOURCE_KINDS } from "@portfolio/rag";
import { privateMarkers } from "./lib/answer-eval.ts";
import { EVAL_FILE, RECORDS_FILE, loadJson } from "./lib/eval-data.ts";
import type { Corpus, EvalSet } from "./lib/eval-data.ts";
import { validateEvalData } from "./validate-eval.ts";

// The data the tools really use (D-029): the owner's reviewed portfolio, not the fictional fixtures.
const corpus = loadJson(RECORDS_FILE) as Corpus;
const evalSet = loadJson(EVAL_FILE) as EvalSet;
const text = (record: { title: string; content: string }) => `${record.title}\n${record.content}`;

describe("the real portfolio data", () => {
  it("passes the same validation as the fixtures, with the real-data rules", () => {
    assert.deepEqual(validateEvalData(corpus, evalSet), []);
    assert.equal(corpus.isSynthetic, false);
    assert.equal(evalSet.isSynthetic, false);
    assert.equal(evalSet.corpus, RECORDS_FILE);
  });

  it("names a known source for every real record, and keeps fake fixtures private", () => {
    for (const record of corpus.records) {
      if (record.isSynthetic) {
        assert.equal(record.visibility, "private", `${record.id}: a synthetic record in the real corpus must be private`);
      } else {
        assert.ok((REAL_SOURCE_KINDS as readonly string[]).includes(record.source?.kind ?? ""), record.id);
      }
    }
  });

  it("holds no phone number, long number, salary figure or second email address in a public record", () => {
    const emails = new Set<string>();
    for (const record of corpus.records.filter((r) => r.visibility === "public")) {
      const body = text(record);
      assert.doesNotMatch(body.replace(/id\d{10}/g, ""), /\b\d{10,}\b/, record.id);
      assert.doesNotMatch(body, /\+?\d{1,3}[-. ]\d{3}[-. ]\d{3}[-. ]\d{4}/, record.id);
      assert.doesNotMatch(body, /\b\d{2,3},\d{3}\b/, record.id);
      assert.doesNotMatch(body, /\b(alex morgan|alex)\b/i, record.id);
      for (const email of body.match(/[\w.+-]+@[\w.-]+/g) ?? []) emails.add(email.toLowerCase());
    }
    assert.ok(emails.size <= 1, `expected at most the owner's own email, found ${emails.size}`);
  });

  it("keeps the leak checks meaningful: the private ids and the fake fixture's numbers are canaries", () => {
    const markers = privateMarkers(corpus.records);
    assert.ok(markers.ids.includes("private-fixture-001"));
    assert.ok(markers.ids.includes("project-tracker-001"));
    assert.ok(markers.numbers.length >= 2);
  });

  it("has evaluation cases that cover every behaviour, with evidence only from public records", () => {
    const publicIds = new Set(corpus.records.filter((r) => r.visibility === "public").map((r) => r.id));
    const counts = new Map<string, number>();
    for (const entry of evalSet.cases) {
      counts.set(entry.expectedBehavior, (counts.get(entry.expectedBehavior) ?? 0) + 1);
      for (const id of entry.expectedEvidenceIds) assert.ok(publicIds.has(id), `${entry.id}: ${id}`);
    }
    for (const behavior of ["answer", "qualify", "abstain", "refuse"]) {
      assert.ok((counts.get(behavior) ?? 0) >= 4, `${behavior}: ${counts.get(behavior) ?? 0}`);
    }
    // The planted canary questions for the fake private record.
    assert.ok(evalSet.cases.some((c) => c.forbiddenClaims.some((claim) => claim.includes("private-fixture-001"))));
  });
});
