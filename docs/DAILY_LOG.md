# Daily log

A brief record of the work done each day, newest first. Why we chose things: [DECISIONS.md](DECISIONS.md). Roadmap: [RAG_PROJECT_PLAN.md](RAG_PROJECT_PLAN.md).

**Rule:** after every commit, add a few plain-language lines under today's date, in the same commit, saying what we did, what we tested (command and result), and any manual step such as creating an account or key. Don't copy commit message titles or hashes. Never write secret values, only that the step was done.

## 2026-10-29
Next: create the Gemini API key and the Qdrant cluster, fill `.env`, run `pnpm env:check` (finishes Phase 0), then Phase 1.

- Set up two-device shared memory: a decisions log and this daily log, and told Claude (in `CLAUDE.md`) to read them first and update this log after every commit.
- Made this log short, then changed it to describe the work done instead of listing commit titles.
- Pulled the latest branch: list questions are now scored by completeness, and root TypeScript tooling was added. Tests: 28 pass, type-check clean.
- Open: re-run `pnpm eval:baseline` and record the new numbers, because the older 83.6% Recall@5 predates the new list scoring.

## 2026-10-28
Next: env setup, then Phase 1.

- Reviewed the earlier ChatGPT plan and its notes. Confirmed Qdrant is the target and the D1 embedding store is only a prototype.
- Checked free-tier pricing and limits for Qdrant Cloud, Gemini and Cloudflare Workers. Everything planned can be free, with quota limits.
- Wrote the phased project plan (`docs/RAG_PROJECT_PLAN.md`).
- Committed the D1 embedding prototype script, kept for reference and replaced by Qdrant ingestion in Phase 1. Not re-run.
- Added `.env.example`, a `pnpm env:check` command that never prints secret values, and `docs/SETUP.md`. Tested with no `.env` and with a fake one: 25 tests pass, and it exits non-zero when variables are missing or the Qdrant URL isn't https.
- Open: fill `.env` with real values.

## 2026-10-27
- Set up the pnpm monorepo, the Next.js app, and a Cloudflare Worker with a health endpoint.
- Built the synthetic dataset (40 records, 40 eval cases), the validator and the BM25 retrieval baseline. See [evaluation-notes.md](evaluation-notes.md).
