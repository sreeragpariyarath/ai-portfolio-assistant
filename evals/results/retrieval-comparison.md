# Retrieval comparison: BM25, dense and hybrid

Development set of 100 cases (`evals/portfolio-eval.v1.json`); **not a held-out benchmark**, and any tuning of the hybrid settings uses these same cases.
126 public records searched; 2 private record(s) excluded before indexing.
Dense: `gemini-embedding-2`, 768 dimensions, cosine, Qdrant with a public-only filter. Hybrid: reciprocal rank fusion, k=60, top 20 candidates from each method.

| Method | Recall@5 | Recall@10 | Full evidence @5 | Full evidence @10 |  | Private retrieved |
|---|---:|---:|---:|---:||---|
| bm25 | 80.3% | 81.1% | 62/86 | 63/86 |  | none |
| dense | 93.4% | 95.0% | 76/86 | 77/86 |  | none |
| hybrid | 93.4% | 95.3% | 76/86 | 78/86 |  | none |

## Cases missing expected evidence at k=5

| Case | bm25 | dense | hybrid |
|---|---|---|---|
| E004 | profile-006 | ok | ok |
| E005 | profile-005 | ok | ok |
| E006 | profile-006, profile-009, profile-008 | profile-006, profile-009, profile-008 | profile-006, profile-009, profile-008 |
| E007 | profile-011 | ok | ok |
| E016 | profile-013 | ok | ok |
| E020 | contribution-lwh-001 | contribution-lwh-001 | contribution-lwh-001 |
| E022 | project-lwh-001 | ok | ok |
| E023 | project-lwh-001 | ok | ok |
| E024 | contribution-lwh-001 | ok | ok |
| E031 | decision-lwh-002 | ok | ok |
| E039 | contribution-hrms-002, contribution-hrms-004 | contribution-hrms-002 | contribution-hrms-002 |
| E040 | contribution-hrms-004 | ok | ok |
| E046 | contribution-pmt-003 | ok | ok |
| E061 | profile-020, profile-021, profile-023, profile-024 | profile-020, profile-022 | profile-020, profile-022 |
| E066 | profile-007 | profile-007 | profile-007 |
| E079 | project-warvox-001 | ok | ok |
| E082 | profile-063, contribution-lwh-001, decision-warvox-001 | contribution-warvox-001, decision-warvox-001 | contribution-warvox-001, decision-warvox-001 |
| E083 | contribution-lwh-001, contribution-upthrust-001 | contribution-lwh-001, contribution-upthrust-001 | contribution-lwh-001, contribution-upthrust-001 |
| E089 | decision-lwh-004 | decision-lwh-004 | decision-lwh-004 |
| E092 | profile-007 | ok | ok |
| E096 | decision-lwh-004 | decision-lwh-004 | decision-lwh-004 |
| E097 | profile-029 | ok | ok |
| E098 | profile-074 | ok | ok |
| E099 | decision-lwh-004 | decision-lwh-004 | decision-lwh-004 |

## Questions with no expected evidence

Every retriever returns its best matches anyway. The top score is what an abstention threshold would have to separate from real answers (BM25 and cosine scores are on different scales).

| Case | bm25 top score | dense top score | dense top record |
|---|---:|---:|---|
| E010 | 5.33 | 0.6657 | profile-026 |
| E011 | 4.97 | 0.6803 | profile-030 |
| E012 | 6.76 | 0.6954 | profile-002 |
| E013 | 6.90 | 0.6169 | decision-portfolio-001 |
| E014 | 6.84 | 0.7237 | profile-002 |
| E063 | 7.75 | 0.6781 | profile-021 |
| E064 | 9.57 | 0.7389 | profile-070 |
| E065 | 4.96 | 0.7175 | profile-006 |
| E067 | 5.33 | 0.6681 | profile-071 |
| E068 | 11.45 | 0.6643 | decision-portfolio-002 |
| E077 | 3.60 | 0.6365 | profile-034 |
| E085 | 9.86 | 0.7492 | profile-070 |
| E086 | 7.41 | 0.6700 | profile-067 |
| E087 | 10.38 | 0.7530 | contribution-lwh-008 |
