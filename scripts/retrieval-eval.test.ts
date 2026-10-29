import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runBaseline } from "./lib/baseline.ts";
import { EmbeddingCache } from "./lib/embedding-cache.ts";
import { EVAL_FILE, RECORDS_FILE, loadJson } from "./lib/eval-data.ts";
import type { Corpus, EvalSet } from "./lib/eval-data.ts";
import { bm25Rankings, compareMethods, formatComparison } from "./lib/retrieval-eval.ts";
import type { Rankings } from "./lib/retrieval-eval.ts";

const corpus = loadJson(RECORDS_FILE) as Corpus;
const evalSet = loadJson(EVAL_FILE) as EvalSet;
const config = { k: 60, depth: 20 };

// A dense retriever that ranks every expected record first: an upper bound to test the scoring.
function perfectDense(): Rankings {
  return new Map(
    evalSet.cases.map((evalCase) => [
      evalCase.id,
      evalCase.expectedEvidenceIds.map((id, index) => ({ id, score: 1 - index * 0.01 })),
    ]),
  );
}

describe("compareMethods", () => {
  it("scores BM25 exactly like the existing baseline", () => {
    const comparison = compareMethods(corpus, evalSet, bm25Rankings(corpus, evalSet), new Map(), config);
    assert.deepEqual(comparison.reports.bm25, runBaseline(corpus, evalSet));
  });

  it("gives a perfect dense ranking full recall and full list completeness", () => {
    const { reports } = compareMethods(corpus, evalSet, bm25Rankings(corpus, evalSet), perfectDense(), config);
    assert.ok(reports.dense.byK.every((row) => row.meanRecall === 1));
    assert.deepEqual(reports.dense.misses, []);
    assert.ok(reports.dense.listCases.every((item) => item.found === item.expected));
  });

  it("hybrid falls back to BM25 order when dense returns nothing", () => {
    const bm25 = bm25Rankings(corpus, evalSet);
    const { rankings } = compareMethods(corpus, evalSet, bm25, new Map(), config);
    const caseId = evalSet.cases.find((evalCase) => evalCase.scoring !== "list")!.id;
    assert.deepEqual(
      rankings.hybrid.get(caseId)!.map((hit) => hit.id),
      bm25.get(caseId)!.slice(0, 10).map((hit) => hit.id),
    );
  });

  it("hybrid fuses every candidate for list cases, not just the top depth", () => {
    const { reports } = compareMethods(corpus, evalSet, bm25Rankings(corpus, evalSet), perfectDense(), {
      k: 60,
      depth: 1,
    });
    assert.ok(reports.hybrid.listCases.every((item) => item.found === item.expected));
  });

  it("reports a private record if a retriever returns one", () => {
    const privateId = corpus.records.find((record) => record.visibility !== "public")!.id;
    const leaky: Rankings = new Map([[evalSet.cases[0]!.id, [{ id: privateId, score: 1 }]]]);
    const { reports } = compareMethods(corpus, evalSet, bm25Rankings(corpus, evalSet), leaky, config);
    assert.deepEqual(reports.dense.privateRecordsRetrieved, [privateId]);
    assert.deepEqual(reports.hybrid.privateRecordsRetrieved, [privateId]);
  });
});

describe("formatComparison", () => {
  it("prints one table row per method and states it is not a held-out benchmark", () => {
    const comparison = compareMethods(corpus, evalSet, bm25Rankings(corpus, evalSet), perfectDense(), config);
    const markdown = formatComparison(comparison, { model: "m", dims: 768 });
    assert.match(markdown, /not a held-out benchmark/);
    assert.match(markdown, /^\| bm25 \| 85\.7% \| 95\.0% \|/m);
    assert.match(markdown, /^\| dense \| 100\.0% \| 100\.0% \|/m);
    assert.match(markdown, /^\| hybrid \|/m);
    assert.match(markdown, /k=60, top 20 candidates/);
  });
});

describe("EmbeddingCache", () => {
  it("embeds a question once, then serves it from the file, keyed by model and size", async () => {
    const dir = mkdtempSync(join(tmpdir(), "embed-cache-"));
    try {
      const file = join(dir, "cache.json");
      let calls = 0;
      const embed = async () => {
        calls++;
        return [0.1, 0.2];
      };
      const cache = new EmbeddingCache(file, "m", 2);
      await cache.get("q", embed);
      await cache.get("q", embed);
      assert.equal(calls, 1);
      assert.deepEqual([cache.hits, cache.misses], [1, 1]);

      // A fresh instance reads the saved file.
      await new EmbeddingCache(file, "m", 2).get("q", embed);
      assert.equal(calls, 1);
      // A different model or size is a different key.
      await new EmbeddingCache(file, "other", 2).get("q", embed);
      assert.equal(calls, 2);
      assert.equal(Object.keys(JSON.parse(readFileSync(file, "utf8"))).length, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
