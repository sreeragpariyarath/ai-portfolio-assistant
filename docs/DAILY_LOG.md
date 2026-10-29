# Daily log

A brief record of the work done each day, newest first. Why we chose things: [DECISIONS.md](DECISIONS.md). Roadmap: [RAG_PROJECT_PLAN.md](RAG_PROJECT_PLAN.md).

**Rule:** after every commit, add a few plain-language lines under today's date, in the same commit, saying what we did, what we tested (command and result), and any manual step such as creating an account or key. Don't copy commit message titles or hashes. Never write secret values, only that the step was done.

## 2026-10-29
Next: Phase 2 task 2.4 (try a few RRF k and candidate-depth settings on the development cases and keep the simplest one that is not clearly worse).

- Built `pnpm eval:retrieval`: runs BM25, dense (Qdrant) and hybrid on the same 40 eval cases with the same scoring as the baseline, prints a table and writes it to `evals/results/retrieval-comparison.md`. Question embeddings are cached in a git-ignored file (`evals/.cache/`), so reruns make no Gemini calls. Refactored the baseline so the BM25 scoring is shared; `pnpm eval:baseline` output is byte-identical. Options `--k=` and `--depth=` for tuning.
- Live run, approved by the owner: 40 new Gemini query embeddings and read-only Qdrant searches; the rerun used 40 cached embeddings and 0 Gemini calls. Results (default k=60, depth 20): BM25 Recall@5 85.7% / Recall@10 95.0%, list question 2/10; dense 95.7% / 96.4%, list 10/10; hybrid 95.7% / 99.3%, list 10/10. No private record retrieved by any method. E015 still misses two decision records at k=5 with dense and hybrid.
- Tests: `pnpm test:scripts` 128 pass (7 new: BM25 scored the same as the baseline, a perfect dense ranking scores 100%, hybrid falls back to BM25 when dense is empty, list cases fuse every candidate, a leaked private record is reported, the table format, the embedding cache), both type-checks clean, API `vitest run` 8 pass, `pnpm eval:validate` ok.

- Opened draft PR #4 for Phase 2 so CI runs on the branch.
- Added dense search to `packages/rag`: it embeds the question and asks Qdrant for the closest public records, always sending the public-only filter, and drops any result that has no record id or is not marked public (a second safety net). A version that takes a ready-made vector lets the eval cache question embeddings. Mocked tests only, nothing run against Gemini or Qdrant. `pnpm test:scripts` 121 pass (5 new), both type-checks clean, API `vitest run` 8 pass, `pnpm eval:validate` ok.

- Added reciprocal rank fusion and hybrid search to `packages/rag`. RRF combines rankings by position only, so BM25 scores and cosine scores never need to be on the same scale; `k` (default 60), candidate depth (default 20) and result limit are configurable, and ties break in a fixed order. Pure code, nothing run against Gemini or Qdrant. `pnpm test:scripts` 116 pass (12 new), `pnpm typecheck:scripts` and API typecheck clean, API `vitest run` 8 pass (one new test runs hybrid search in the Workers runtime), `pnpm eval:validate` ok.

- Merged the Phase 1 PR, started the Phase 2 branch and wrote the Phase 2 plan (`docs/PHASE_2_PLAN.md`): fusion, dense search, an eval runner comparing BM25, dense and hybrid, tuning on the development split, then recording the results. The first run that embeds the eval questions needs the owner's go-ahead. Docs only, no code changed, nothing run.

- Retired the old D1 ingest script and its `embeddings:ingest:local` command (Qdrant ingest replaces it; the D1 binding and migrations stay until Phase 5). Added the ingest commands and the suspended or deleted cluster steps to `docs/SETUP.md`, and marked Phase 1 done in the roadmap. Nothing was run against Gemini or Qdrant this time. `pnpm test:scripts` 103 pass, `pnpm typecheck:scripts` clean, `pnpm eval:validate` ok, API typecheck and `vitest run` pass.

- Live run, with the owner's go-ahead. `pnpm ingest`: collection created on the Qdrant cluster, 39 public records embedded with Gemini and uploaded, 1 private excluded, verification passed (count 39, private id absent, model and size correct on every point). Second `pnpm ingest`: 0 uploaded, 39 unchanged, no Gemini call, verification passed.
- Added `pnpm qdrant:query "question"` (top 5 record ids and scores, public only). Tried three eval questions: "currently focused on" ranked the expected profile-demo-006 first; "built the onboarding tool alone" ranked contribution-demo-003 first (project-demo-006 second, both expected); "what roles is Alex looking for" ranked the expected profile-demo-001 only third, a hint for Phase 2's real dense-versus-BM25 eval. Returned query vector length is 768 with norm 1.0000, so no client-side normalization is needed (confirms D-012).
- D-013 checks: retrieving the private record's id returned nothing (verification passed), so retrieve omits missing ids. The scroll's last-page behaviour was only exercised on one page (39 points, page size 100), so a multi-page scroll is still untested live; the client stops safely either way.

- Built the ingest script: `pnpm ingest` and `pnpm ingest:dry`. It checks `.env`, validates the data, drops private records, makes sure the collection and indexes exist, plans, embeds only what changed, uploads, deletes stale points, then verifies (point count, no private record present, every stored point has the right model and size). The logic lives in `scripts/lib/ingest-run.ts` so it is tested with in-memory fake Qdrant and Gemini; the script only wires in the real clients. `pnpm test:scripts` 103 pass (7 new: first run, second run uploads nothing, dry run writes nothing, made-private is deleted, leaked private point fails verification, no public records, wrong-size vector rejected), type-checks clean, API `vitest run` 7 pass.
- Ran `pnpm ingest:dry` once against the real cluster. It is read-only (one "does the collection exist" request, no Gemini call, nothing written): the collection does not exist yet, 39 public records would be uploaded, 1 private excluded. This was a read of the cluster made before the 1.8 go-ahead, so noting it here.

- Added the ingest planner to `packages/rag`: given the public records and the points already in Qdrant, it says which records to embed and upload (new, edited, or embedded with a different model or size), which are unchanged, and which stored points to delete (record removed or made private, or a stray point). It makes no network calls and refuses any non-public record. `pnpm test:scripts` 96 pass (9 new planner tests: first run, rerun, edited, removed, made private, model change, stray point), `pnpm typecheck:scripts` and API typecheck clean, API `vitest run` 7 pass, `pnpm eval:validate` ok.

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
