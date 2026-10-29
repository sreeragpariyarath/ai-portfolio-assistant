# Daily log

A brief record of the work done each day, newest first. Why we chose things: [DECISIONS.md](DECISIONS.md). Roadmap: [RAG_PROJECT_PLAN.md](RAG_PROJECT_PLAN.md).

**Rule:** after every commit, add a few plain-language lines under today's date, in the same commit, saying what we did, what we tested (command and result), and any manual step such as creating an account or key. Don't copy commit message titles or hashes. Never write secret values, only that the step was done.

## 2026-10-29
Next: Phase 1 task 1.6 (the ingest planner: which records to add, skip or delete).

- Read the current Qdrant API docs and built the Qdrant client in `packages/rag` (create and check the collection, payload indexes, batched upserts, paging through all points, delete, count, retrieve, search). It refuses to touch a collection with the wrong vector size instead of recreating it. Moved the shared timeout and retry logic into one helper used by both the Gemini and Qdrant clients. No real Qdrant call was made: all tests use a mocked fetch. `pnpm test:scripts` 87 pass, both type-checks clean, API `vitest run` 7 pass, `pnpm eval:baseline` unchanged (85.7% / 95.0%). Two Qdrant behaviours the docs do not spell out are listed in D-013 to confirm in the live run.

- Read the current Gemini docs and built the Gemini client in `packages/rag` (batching, timeouts, retries on rate-limit and server errors, no key or text in error messages). Important finding: `gemini-embedding-2` has no task types, so documents and questions are embedded with a text prefix instead, and the stored hash now covers that exact text. The docs give no free-tier numbers for this model; recorded in D-012. No real Gemini call was made: all tests use a mocked fetch. `pnpm test:scripts` 65 pass, `pnpm typecheck:scripts` and API typecheck clean, API `vitest run` 6 pass (one runs the client inside the Workers runtime).

- Added the ingestion helpers to `packages/rag`: the text and hash for each record (same hash as the old D1 script), vector checks, the privacy guard, stable point IDs and the payload stored in Qdrant. Tests: the hash matches Node's own sha256; the point ID code matches the official UUID v5 reference example, and a real ID matched Python's `uuid5`; a private record is rejected without leaking its content. `pnpm test:scripts` 49 pass, `pnpm typecheck:scripts` clean, API `vitest run` 5 pass (one runs the hash and ID code in the Workers runtime).
- Found that the API's own type-check had been failing since the shared package was added (the API config did not allow `.ts` imports) and nothing ran it. Fixed it and added `pnpm typecheck` in `apps/api`, now also run in CI.

- Added CI (GitHub Actions) that runs on every pull request and on pushes to `main`: data validation, script tests, type-check, API tests in the Workers runtime, and web lint and build. It uses no secrets and never calls Gemini or Qdrant or deploys. Ran `pnpm --filter web lint` and `build` locally first: both pass. Deploy and the Qdrant keep-alive stay for Phase 5.

- Moved the recall metric and the record types into `packages/rag`, and moved the BM25 and recall tests there too. Added a test that fails if any package file imports a `node:` module (checked it fails on a deliberately bad file, then removed that file). `pnpm eval:baseline` is still byte-identical, `pnpm test:scripts` 33 pass, `pnpm typecheck:scripts` clean, API `vitest run` 4 pass.

- Installed the GitHub CLI on the PC (winget, already logged in). Opened and merged the Phase 0 PR, then started the Phase 1 branch from `main`.
- Created the shared package `packages/rag` and moved BM25 into it. Checked that it loads everywhere it will be used: `pnpm eval:baseline` output is byte-identical to before, `pnpm test:scripts` 28 pass, `pnpm typecheck:scripts` clean, API tests (`pnpm vitest run`) 4 pass including a new one that runs BM25 inside the Workers runtime, and `wrangler deploy --dry-run` bundles it (nothing deployed). Recorded as D-011.

- Planned Phase 1 in detail as ten small tasks (`docs/PHASE_1_PLAN.md`). Data source stays the synthetic JSON; no PDFs, images or upload system.
- Re-ran the BM25 baseline with the new list scoring (`pnpm eval:baseline`): Recall@5 85.7% (28/35 cases fully covered), Recall@10 95.0% (31/35), list question E032 found 2/10, private records retrieved: none. This is the comparison point for dense and hybrid retrieval.

- Phase 0 complete on this PC: Gemini API key created (billing not linked), Qdrant Cloud free cluster created (AWS, Frankfurt), `.env` filled, `pnpm env:check` passes. The laptop still needs its own `.env`.

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
