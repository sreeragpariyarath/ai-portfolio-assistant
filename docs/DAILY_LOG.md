# Daily log

What was done, newest day first. Why we chose things: [DECISIONS.md](DECISIONS.md). Roadmap: [RAG_PROJECT_PLAN.md](RAG_PROJECT_PLAN.md).

**Rule:** after every commit, add one short entry under today's date in the same commit: `` `hash` subject: what changed. Verified: ... Open: ... `` (keep it to 1-3 lines). The hash isn't known until the commit exists, so add it in the next update.

## 2026-10-29
Next: create Gemini key and Qdrant cluster, fill `.env`, `pnpm env:check` (finishes Phase 0), then Phase 1.

- `4894a4d` docs: add decisions log and daily log. Two-device shared memory; `CLAUDE.md` tells sessions to read both and log after each commit. Docs only.
- `6e91b08` merge: list scoring by completeness and root TypeScript tooling pulled in. Verified: 28 tests pass, typecheck clean. Open: re-run `pnpm eval:baseline` and record new numbers (old 83.6% Recall@5 predates list scoring).
- docs: shorten this log to one line per commit. Verified: `pnpm test:scripts` green.

## 2026-10-28
Next: env setup, then Phase 1.

- `ee7de21` feat(env): `.env.example`, `pnpm env:check` (never prints values), `docs/SETUP.md`. Verified: 25 tests pass, checked with no and fake `.env`. Open: owner fills `.env`.
- `9f52380` docs: phased RAG plan (`docs/RAG_PROJECT_PLAN.md`), source of D-001 to D-007.
- `7a45ee8` feat(ingest): D1 embedding ingest prototype (`embeddings:ingest:local`). Replaced by Qdrant ingest in Phase 1. Script not re-run.
- `1590228`, `3e3fae0` chore(api): D1 binding and migrations 0001/0002, applied locally only. Removed in Phase 5.
- `0cd0ad7`, `1c1788c` root TypeScript tooling; list questions (E032) scored by completeness.

## 2026-10-27
- `6ca8e6c`, `3ca4bbe` initial commit; pnpm monorepo and stock Next.js app.
- `2397cad`, `d0c6e52` Cloudflare Worker with `GET /api/health`, 404/405 handling.
- `3393627`, `38e29eb` synthetic dataset (40 records, 40 cases), validator, BM25 baseline; PR #1 merged. See [evaluation-notes.md](evaluation-notes.md).
