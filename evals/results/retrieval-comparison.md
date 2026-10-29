# Retrieval comparison: BM25, dense and hybrid

Development set of 40 cases (`evals/retrieval-eval.v3.json`); **not a held-out benchmark**, and any tuning of the hybrid settings uses these same cases.
39 public records searched; 1 private record(s) excluded before indexing.
Dense: `gemini-embedding-2`, 768 dimensions, cosine, Qdrant with a public-only filter. Hybrid: reciprocal rank fusion, k=60, top 20 candidates from each method.

| Method | Recall@5 | Recall@10 | Full evidence @5 | Full evidence @10 | E032 list | Private retrieved |
|---|---:|---:|---:|---:|---:|---|
| bm25 | 85.7% | 95.0% | 28/35 | 31/35 | 2/10 | none |
| dense | 95.7% | 96.4% | 33/35 | 33/35 | 10/10 | none |
| hybrid | 95.7% | 99.3% | 32/35 | 34/35 | 10/10 | none |

## Cases missing expected evidence at k=5

| Case | bm25 | dense | hybrid |
|---|---|---|---|
| E004 | profile-demo-006 | ok | ok |
| E005 | profile-demo-006 | ok | ok |
| E011 | contribution-demo-001 | ok | ok |
| E015 | project-demo-001, project-demo-005, decision-demo-004, decision-demo-006 | decision-demo-004, decision-demo-006 | decision-demo-004, decision-demo-006 |
| E018 | decision-demo-005 | ok | decision-demo-005 |
| E025 | ok | project-demo-010 | ok |
| E033 | contribution-demo-003 | ok | ok |
| E037 | profile-demo-009 | ok | profile-demo-009 |

## Questions with no expected evidence

Every retriever returns its best matches anyway. The top score is what an abstention threshold would have to separate from real answers (BM25 and cosine scores are on different scales).

| Case | bm25 top score | dense top score | dense top record |
|---|---:|---:|---|
| E021 | 3.15 | 0.7391 | contribution-demo-002 |
| E031 | 5.09 | 0.7635 | decision-demo-001 |
| E035 | 4.73 | 0.7264 | profile-demo-009 |
| E036 | 2.58 | 0.6407 | project-demo-011 |
