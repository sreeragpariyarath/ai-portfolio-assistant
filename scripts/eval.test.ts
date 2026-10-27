import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIndex, search, tokenize } from "./lib/bm25.ts";
import { recallAtK, runBaseline } from "./lib/baseline.ts";
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
});

describe("bm25", () => {
  const index = buildIndex([
    { id: "a", text: "TypeScript API for support" },
    { id: "b", text: "Python scripts for data" },
    { id: "c", text: "TypeScript web client" },
  ]);

  it("drops stopwords and punctuation", () => {
    assert.deepEqual(tokenize("What is the Next.js app?"), ["next", "js", "app"]);
  });

  it("ranks documents that match rarer terms higher", () => {
    assert.equal(search(index, "python", 3)[0]?.id, "b");
  });

  it("returns only documents that match", () => {
    assert.deepEqual(search(index, "rust", 3), []);
  });

  it("breaks score ties by id", () => {
    const hits = search(index, "typescript", 3).map((hit) => hit.id);
    assert.equal(hits[0], "a");
    assert.equal(hits[1], "c");
  });

  it("respects the limit", () => {
    assert.equal(search(index, "typescript", 1).length, 1);
  });
});

describe("recallAtK", () => {
  it("counts expected ids found in the top k", () => {
    assert.equal(recallAtK(["a", "b"], ["a", "x", "b"], 2), 0.5);
    assert.equal(recallAtK(["a", "b"], ["a", "x", "b"], 3), 1);
  });

  it("is undefined when no evidence is expected", () => {
    assert.throws(() => recallAtK([], ["a"], 5));
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

  it("is deterministic", () => {
    const data = load();
    assert.deepEqual(runBaseline(data.corpus, data.evalSet), runBaseline(data.corpus, data.evalSet));
  });
});
