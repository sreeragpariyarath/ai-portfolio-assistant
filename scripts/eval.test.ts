import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runBaseline } from "./lib/baseline.ts";
import { EVAL_FILE, RECORDS_FILE, loadJson } from "./lib/eval-data.ts";
import type { Corpus, EvalSet } from "./lib/eval-data.ts";
import { validateEvalData } from "./validate-eval.ts";

type Data = { corpus: Corpus; evalSet: EvalSet };

function load(): Data {
  return {
    corpus: structuredClone(loadJson(RECORDS_FILE)) as Corpus,
    evalSet: structuredClone(loadJson(EVAL_FILE)) as EvalSet,
  };
}

function errorsAfter(mutate: (data: Data) => void): string[] {
  const data = load();
  mutate(data);
  return validateEvalData(data.corpus, data.evalSet);
}

function caseById(data: Data, id: string) {
  const found = data.evalSet.cases.find((evalCase) => evalCase.id === id);
  assert.ok(found, `case ${id} should exist`);
  return found;
}

describe("validateEvalData", () => {
  it("accepts the committed dataset", () => {
    const data = load();
    assert.deepEqual(validateEvalData(data.corpus, data.evalSet), []);
  });

  it("rejects duplicate record ids", () => {
    const errors = errorsAfter(({ corpus }) => {
      corpus.records[1]!.id = corpus.records[0]!.id;
    });
    assert.ok(errors.some((message) => message.includes("duplicate record id")));
  });

  it("rejects evidence ids that do not resolve", () => {
    const errors = errorsAfter((data) => {
      caseById(data, "E001").expectedEvidenceIds = ["missing-record"];
    });
    assert.ok(errors.some((message) => message.includes("unknown record missing-record")));
  });

  it("rejects private records as expected evidence", () => {
    const errors = errorsAfter((data) => {
      caseById(data, "E001").expectedEvidenceIds = ["private-demo-001"];
    });
    assert.ok(errors.some((message) => message.includes("private record private-demo-001")));
  });

  it("rejects an unknown expectedBehavior", () => {
    const errors = errorsAfter((data) => {
      caseById(data, "E001").expectedBehavior = "guess";
    });
    assert.ok(errors.some((message) => message.includes("expectedBehavior must be one of")));
  });

  it("rejects duplicate case ids", () => {
    const errors = errorsAfter(({ evalSet }) => {
      evalSet.cases[1]!.id = evalSet.cases[0]!.id;
    });
    assert.ok(errors.some((message) => message.includes("duplicate case id")));
  });

  it("rejects a case without a split", () => {
    const errors = errorsAfter((data) => {
      delete (caseById(data, "E001") as { split?: string }).split;
    });
    assert.ok(errors.some((message) => message.includes('split must be "development"')));
  });

  it("rejects a phone number in a public record", () => {
    const errors = errorsAfter(({ corpus }) => {
      corpus.records[0]!.content += " Call +1-202-555-0100.";
    });
    assert.ok(errors.some((message) => message.includes("phone-number or salary-like")));
  });

  it("rejects a salary figure in a required fact", () => {
    const errors = errorsAfter((data) => {
      caseById(data, "E001").requiredFacts.push("earns 90,000");
    });
    assert.ok(errors.some((message) => message.includes("requiredFacts contains")));
  });

  it("requires at least one private record", () => {
    const errors = errorsAfter(({ corpus }) => {
      corpus.records = corpus.records.filter((record) => record.visibility !== "private");
    });
    assert.ok(errors.some((message) => message.includes("at least one private record")));
  });

  it("keeps the E024 fix", () => {
    const errors = errorsAfter((data) => {
      caseById(data, "E024").expectedEvidenceIds = ["project-demo-006", "profile-demo-002"];
    });
    assert.ok(errors.some((message) => message.startsWith("E024:")));
  });

  it("keeps the E032 fixes", () => {
    const errors = errorsAfter((data) => {
      const e032 = caseById(data, "E032");
      e032.requiredFacts = e032.requiredFacts.filter((fact) => fact !== "log search prototype");
      e032.forbiddenClaims = [];
      e032.expectedEvidenceIds.push("project-demo-004");
    });
    assert.ok(errors.some((message) => message.includes('missing "log search prototype"')));
    assert.ok(errors.some((message) => message.includes("older deployment note")));
    assert.ok(errors.some((message) => message.includes("scratch notes")));
    assert.ok(errors.some((message) => message.includes("must not include project-demo-004")));
  });

  it("rejects an unknown scoring mode", () => {
    const errors = errorsAfter((data) => {
      caseById(data, "E001").scoring = "fuzzy";
    });
    assert.ok(errors.some((message) => message.includes("scoring must be one of")));
  });

  it("keeps E032 scored as a list question", () => {
    const errors = errorsAfter((data) => {
      delete caseById(data, "E032").scoring;
    });
    assert.ok(errors.some((message) => message.includes('E032: scoring must be "list"')));
  });
});

describe("runBaseline", () => {
  it("never retrieves private records", () => {
    const data = load();
    const report = runBaseline(data.corpus, data.evalSet);
    assert.deepEqual(report.privateRecordsRetrieved, []);
    assert.equal(report.excludedPrivateRecords, 1);
    assert.equal(report.indexedRecords, 39);
  });

  it("scores list cases by completeness, not Recall@k", () => {
    const data = load();
    const report = runBaseline(data.corpus, data.evalSet);
    const listCaseIds = report.listCases.map((item) => item.caseId);
    assert.deepEqual(listCaseIds, ["E032"]);
    assert.equal(report.listCases[0]?.expected, 10);
    assert.ok(report.misses.every((miss) => miss.caseId !== "E032"));
    assert.equal(report.byK[0]?.casesWithEvidence, 35);
  });

  it("is deterministic", () => {
    const data = load();
    assert.deepEqual(runBaseline(data.corpus, data.evalSet), runBaseline(data.corpus, data.evalSet));
  });
});
