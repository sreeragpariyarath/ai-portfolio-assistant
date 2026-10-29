# Hybrid (RRF) tuning on the development set

Command: `pnpm eval:retrieval --k=<k> --depth=<depth> --no-write` (question embeddings cached, so no Gemini calls). 40 development cases, 35 with ranked evidence; **these are the same cases the results are reported on, so this is not a held-out tuning.**

`k` is the RRF damping constant (smaller favours each method's first places); `depth` is how many candidates each method contributes before fusion (39 = every public record).

| k | depth | Recall@5 | Recall@10 | Full evidence @5 | Full evidence @10 | E032 list | Private |
|---:|---:|---:|---:|---:|---:|---:|---|
| 10 | 10 | 94.3% | 98.6% | 31/35 | 34/35 | 10/10 | none |
| 10 | 20 | 97.1% | 99.3% | 33/35 | 34/35 | 10/10 | none |
| 10 | 39 | 97.1% | 98.6% | 33/35 | 34/35 | 10/10 | none |
| 30 | 10 | 94.3% | 98.6% | 31/35 | 34/35 | 10/10 | none |
| 30 | 20 | 95.7% | 99.3% | 32/35 | 34/35 | 10/10 | none |
| 30 | 39 | 95.7% | 98.6% | 32/35 | 34/35 | 10/10 | none |
| **60** | **20** | **95.7%** | **99.3%** | **32/35** | **34/35** | **10/10** | **none** |
| 60 | 10 | 94.3% | 98.6% | 31/35 | 34/35 | 10/10 | none |
| 60 | 39 | 95.7% | 99.3% | 32/35 | 34/35 | 10/10 | none |

**Choice: keep k=60, depth 20** (the standard RRF default, already used in `retrieval-comparison.md`).

- The best row (k=10, depth 20) differs from the default by one case at k=5 (33 vs 32 of 35). With 40 cases that is within noise, and picking it would be fitting the evaluation set.
- depth 10 is consistently a little worse, so candidates beyond each method's top 10 do help.
- No setting retrieved a private record, and the list question is 10/10 in every setting.
- Revisit with more eval cases; until then the default avoids tuning to these 40.
