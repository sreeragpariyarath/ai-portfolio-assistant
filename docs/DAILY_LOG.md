# Daily log

What was done, newest day first. Read this to catch up on either device. Decisions and their reasons live in [DECISIONS.md](DECISIONS.md), and the roadmap is in [RAG_PROJECT_PLAN.md](RAG_PROJECT_PLAN.md).

**How to maintain it:** after every commit, add an entry under today's date in the same commit as the work. Each entry has: the commit subject, what changed and why, how it was verified (commands and results), and anything left open. The commit hash is not known until the commit exists, so add it to the entry in the next log update. Start each new day with a `## YYYY-MM-DD` heading and a one-line "Next" pointer.

Entry template:

```markdown
### <commit subject> (`<hash>`)
- **What:** ...
- **Why:** ...
- **Verified:** ...
- **Open:** ...
```

---

## 2026-10-29
**Next:** create the Gemini key and Qdrant cluster, fill `.env`, run `pnpm env:check` to finish Phase 0. Then Phase 1 (`packages/rag` and Qdrant ingestion).

### docs: add decisions log and daily log for two-device work
- **What:** Added `docs/DECISIONS.md` (ten decisions, D-001 to D-010) and this log, backfilled from git history. `CLAUDE.md` now tells every session to read both files and to log after each commit.
- **Why:** Work happens on a PC and a laptop, and a Claude session on one does not remember the other. The repo is the shared memory.
- **Verified:** Docs only. Ran `pnpm test:scripts` and `pnpm typecheck:scripts` to confirm nothing else changed.
- **Open:** None.

### Pulled `feat/eval-dataset-and-retrieval-baseline` (`6e91b08`, merge)
- **What:** Brought in list-question scoring by completeness (previously Recall@k) and root TypeScript tooling (`tsconfig.json`, `typecheck:scripts`, `typescript` dev dependency, `@types/node` at `^22.20.5`).
- **Verified:** `pnpm install`, `pnpm test:scripts` (28 pass), `pnpm typecheck:scripts` clean.
- **Open:** Baseline numbers changed with the new list scoring. Re-run `pnpm eval:baseline` and record them. The Recall@5 83.6% figure in the earlier KT predates this.

## 2026-10-28
**Next:** env setup, then Phase 1.

### feat(env): add .env template, setup guide and env:check validator (`ee7de21`)
- **What:** `.env.example` (`GEMINI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION`), `pnpm env:check` that reports ok, missing or invalid per variable without printing values, `docs/SETUP.md`.
- **Why:** Be ready to wire real services as soon as credentials exist.
- **Verified:** script tests 25 pass, `eval:validate` 40 records and 40 cases, tsc clean, api vitest 3 pass. `env:check` run with no `.env` and a fake `.env` (exit 1, no values printed).
- **Open:** Phase 0 finishes when the owner fills `.env` and `pnpm env:check` says ready.

### docs: add phased plan for the production-style RAG system (`9f52380`)
- **What:** `docs/RAG_PROJECT_PLAN.md`: target architecture and seven phases (0 to 6), reuse list, risks, verification steps.
- **Why:** Agree the roadmap before building. Decisions D-001 to D-007 came out of this.

### feat(ingest): add local D1 embedding ingestion prototype (`7a45ee8`)
- **What:** `scripts/ingest/gemini-embeddings.ts` and the `embeddings:ingest:local` script. Validates data, filters private records before any call, embeds with Gemini, skips unchanged records by hash, upserts to local D1 through Wrangler.
- **Why:** Proves the embedding pipeline. A prototype only, to be replaced by Qdrant ingestion (D-001).
- **Verified:** script tests 21 pass, `eval:validate` ok, tsc clean on the script, api vitest 3 pass. The script itself was not re-run.
- **Open:** Replaced in Phase 1.

### chore(api): enforce public visibility for embeddings (`1590228`) and chore(api): configure D1 knowledge database (`3e3fae0`)
- **What:** D1 binding `PORTFOLIO_KNOWLEDGE`, and migrations `0001` (embeddings table) and `0002` (`visibility` column limited to `public`). Applied locally only; remote D1 was not confirmed.
- **Open:** Removed in Phase 5.

### chore(scripts): add root TypeScript tooling for evaluation scripts (`0cd0ad7`) and feat(eval): score list questions by completeness instead of Recall@k (`1c1788c`)
- **What:** Root `tsconfig.json` and type-check script; list questions (for example E032) now scored by completeness.
- **Why:** E032 list completeness was the weak area in the BM25 baseline.

## 2026-10-27
**Next:** evaluation groundwork.

- `6ca8e6c` Initial commit.
- `3ca4bbe` chore: initialize pnpm monorepo and Next.js app (`apps/web` is the stock create-next-app page).
- `2397cad` feat(api): initialize Cloudflare Worker backend with Wrangler and TypeScript.
- `d0c6e52` feat(api): add health endpoint with method and not-found handling (`GET /api/health`, 404 and 405 handling).
- `3393627` feat(eval): add synthetic eval dataset, validator and BM25 retrieval baseline (40 records, 40 cases; see [evaluation-notes.md](evaluation-notes.md)).
- `38e29eb` Merge pull request #1 (eval dataset and retrieval baseline).
