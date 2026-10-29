# Phase 2 plan: retrieval and evaluation

Part of [RAG_PROJECT_PLAN.md](RAG_PROJECT_PLAN.md). Phase 1 left 39 public records in Qdrant and a BM25 baseline (Recall@5 85.7%, Recall@10 95.0%, list question E032 found 2/10). Phase 2 adds dense and hybrid retrieval and measures all three on the same eval cases.

**Outcome:** `pnpm eval:retrieval` prints and saves a table comparing BM25, dense and hybrid, so the README can say which method wins, even if hybrid does not.

## Ground rules
- Same loop as Phase 1: run `pnpm eval:validate`, `pnpm test:scripts`, `pnpm typecheck:scripts`, and in `apps/api` `pnpm typecheck` and `pnpm vitest run` before each commit; descriptive commit message, no AI attribution, a daily log entry in the same commit, new decisions in `docs/DECISIONS.md`.
- Code in `packages/rag/src` stays runtime-neutral (no `node:` imports). File and env access stays in `scripts/`.
- Private records never appear in results: dense search always filters `visibility=public`, and the eval reports any private ID retrieved.
- **Live checkpoint:** the first run that calls Gemini for the 40 eval questions needs the owner's go-ahead.
- The eval set is a development set, not a held-out benchmark. Tuning uses it, so say so in the results and README.

## Tasks
Each task is one commit.

### 2.1 Fusion (pure)
In `packages/rag`: `rrf(lists, { k = 60 })` merges ranked ID lists (score = sum of 1/(k + rank)), and `hybridSearch` fuses a BM25 list and a dense list with configurable `k` and candidate depth. Tests: known small rankings, ties are deterministic, one empty list, an ID only in one list, and invalid `k`.

### 2.2 Dense search
`denseSearch(deps, question, { limit })` embeds the question with `embedQuery`, queries Qdrant with the `visibility=public` filter and returns record IDs with scores. Tests use mocked Gemini and Qdrant: the filter is always sent, results map to record IDs, and a result without a `record_id` is skipped.

### 2.3 Eval runner
`pnpm eval:retrieval` runs BM25, dense and hybrid over all cases and reports, per method: Recall@5 and Recall@10, full-evidence coverage, E032 list completeness, zero-evidence top scores, and private IDs retrieved (must be none). Query embeddings are cached in a git-ignored local file so reruns make no Gemini calls. The pure scoring and table formatting are tested with fixed rankings. Writes a markdown table to `evals/results/`. **Live checkpoint before the first run.**

### 2.4 Tune on the development split
Try RRF `k` and candidate depth values on the development cases, change one thing at a time, and keep the simplest setting that is not clearly worse. Record the grid and the choice.

### 2.5 Record results
Add the final table to `evals/results/`, a decision entry in `docs/DECISIONS.md` (which method wins and why, including if hybrid does not), the daily log, and mark Phase 2 done in the roadmap.

## Risks
- **Gemini free-tier quota:** about 40 query embeddings, cached, with the existing retry and backoff.
- **Overfitting to 40 cases:** keep the tuning grid small and say so in the results.
- **Free cluster suspended:** see `docs/SETUP.md`.
