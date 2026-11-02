# Retrieval comparison: BM25, dense and hybrid

Development set of 73 cases (`evals/retrieval-eval.v3.json`); **not a held-out benchmark**, and any tuning of the hybrid settings uses these same cases.
82 public records searched; 2 private record(s) excluded before indexing.
Dense: `gemini-embedding-2`, 768 dimensions, cosine, Qdrant with a public-only filter. Hybrid: reciprocal rank fusion, k=60, top 20 candidates from each method.

| Method | Recall@5 | Recall@10 | Full evidence @5 | Full evidence @10 |  | Private retrieved |
|---|---:|---:|---:|---:||---|
| bm25 | 85.7% | 90.7% | 50/63 | 56/63 |  | none |
| dense | 97.2% | 99.6% | 59/63 | 62/63 |  | none |
| hybrid | 94.6% | 98.6% | 58/63 | 61/63 |  | none |

## Cases missing expected evidence at k=5

| Case | bm25 | dense | hybrid |
|---|---|---|---|
| E005 | profile-005 | ok | ok |
| E006 | profile-006, profile-009, profile-008 | profile-009, profile-008 | profile-009, profile-008 |
| E007 | profile-011 | ok | ok |
| E016 | profile-013 | ok | ok |
| E020 | contribution-lwh-001 | contribution-lwh-001 | contribution-lwh-001 |
| E022 | project-lwh-001 | ok | project-lwh-001 |
| E023 | project-lwh-001 | ok | project-lwh-001 |
| E024 | contribution-lwh-001 | ok | ok |
| E039 | contribution-hrms-004 | contribution-hrms-002 | ok |
| E040 | contribution-hrms-004 | ok | ok |
| E046 | contribution-pmt-003 | ok | ok |
| E061 | profile-020, profile-021, profile-024 | profile-020, profile-022 | profile-020, profile-024 |
| E066 | profile-007 | ok | ok |

## Questions with no expected evidence

Every retriever returns its best matches anyway. The top score is what an abstention threshold would have to separate from real answers (BM25 and cosine scores are on different scales).

| Case | bm25 top score | dense top score | dense top record |
|---|---:|---:|---|
| E010 | 4.56 | 0.6740 | profile-026 |
| E011 | 1.76 | 0.6687 | profile-003 |
| E012 | 5.85 | 0.6954 | profile-002 |
| E013 | 6.31 | 0.6169 | decision-portfolio-001 |
| E014 | 7.63 | 0.7237 | profile-002 |
| E063 | 8.19 | 0.6781 | profile-021 |
| E064 | 1.76 | 0.6697 | profile-012 |
| E065 | 6.34 | 0.7246 | profile-006 |
| E067 | 4.56 | 0.6402 | profile-019 |
| E068 | 11.57 | 0.6643 | decision-portfolio-002 |
