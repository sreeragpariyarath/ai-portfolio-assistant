# Phase 1 plan: `packages/rag` and Qdrant ingestion

## Context
Phase 0 is done on the PC: the Gemini key and a Qdrant Cloud free cluster (AWS, Frankfurt) are in `.env`, and `pnpm env:check` passes. The data source stays the current synthetic JSON (`data/knowledge/synthetic-records.v3.json`, 40 records, 39 public). PDFs, images and an upload system are out of scope (agreed: file-based ingestion, no upload system).

Phase 1 replaces the D1 prototype (`scripts/ingest/gemini-embeddings.ts`, which shells out to Wrangler and writes SQL) with a Qdrant ingest. It also creates a shared package, `packages/rag`, that the eval scripts now and the Worker later both import, so the eval tests the same code that runs in production.

**Outcome:** `pnpm ingest` validates the data, embeds only new or changed public records, upserts them to Qdrant with stable IDs, deletes stale points, and verifies the result. Running it twice upserts nothing the second time, and no private record ever reaches Gemini or Qdrant.

## Ground rules for every task
- Before each commit, run `pnpm eval:validate`, `pnpm test:scripts`, `pnpm typecheck:scripts`, and `cd apps/api && pnpm vitest run`. Commit and push only when all are green; otherwise fix and retest.
- Each commit has a descriptive message (subject plus a body on what and why), no AI attribution, and its own `docs/DAILY_LOG.md` entry written in the same commit.
- New decisions go in `docs/DECISIONS.md`.
- Code in `packages/rag/src` must be runtime-neutral: no `node:` imports, only `fetch` and `globalThis.crypto` (both exist in Node 24 and Workers). File loading and env reading stay in `scripts/`.
- Match the existing style in `scripts/lib`: 2-space indent, erasable-syntax TypeScript, `.ts` import extensions, `node:test` tests.
- **Live checkpoints:** before the first write to Qdrant or the first full Gemini run, pause and get the owner's go-ahead.

## Tasks
Each task is one commit, unless noted.

### 1.0 Merge Phase 0 and branch
- Open a PR for `chore/ingest-prototype-and-rag-plan` into `main`. The owner reviews and merges it.
- Create `feat/phase-1-qdrant-ingestion` from the updated `main`.
- Re-run `pnpm eval:baseline` and record the new BM25 numbers in the daily log. This is the comparison point for Phase 2.

### 1.1 Spike: package skeleton and import resolution (highest risk, do first)
- Create `packages/rag` with `package.json` (`"name": "@portfolio/rag"`, `"type": "module"`, `"private": true`, `exports` pointing at `./src/*.ts` source files with no build step) and `src/index.ts`.
- Add `"@portfolio/rag": "workspace:*"` to the root and `apps/api` dev dependencies, then run `pnpm install`.
- Move `scripts/lib/bm25.ts` to `packages/rag/src/bm25.ts` as the first real module.
- Prove the import resolves in all four places:
  1. Node scripts: `pnpm test:scripts` and `pnpm eval:baseline`, with output identical to before.
  2. `pnpm typecheck:scripts`, after adding `packages/rag/**/*.ts` to the root `tsconfig.json` `include`.
  3. The Workers vitest pool: a new test `apps/api/test/rag-package.spec.ts` builds a BM25 index and searches it inside the Workers runtime. This test stays permanently.
  4. Wrangler: `pnpm --filter api exec wrangler deploy --dry-run --outdir <scratch dir>` bundles successfully. A dry run does not deploy.
- **Fallback:** if Node refuses to strip types through the `node_modules` symlink, scripts import with relative paths (`../packages/rag/src/bm25.ts`), and the Worker keeps using the package name. Record whichever works as decision D-011.

### 1.2 Move shared retrieval code
- Move `recallAtK` from `scripts/lib/baseline.ts` to `packages/rag/src/metrics.ts`. `runBaseline` and the report types stay in `scripts`, since they are eval-only.
- Move the `KnowledgeRecord` type and the `VISIBILITIES` and `RECORD_TYPES` constants to `packages/rag/src/types.ts`. `scripts/lib/eval-data.ts` re-exports them and keeps `loadJson` (which needs `node:fs`) and the eval-only types.
- Move the BM25 and recall tests from `scripts/eval.test.ts` into `packages/rag/test/*.test.ts`, and widen the `test:scripts` glob to also run `packages/rag/test/**/*.test.ts`.
- Add a test that fails if any file in `packages/rag/src` imports a `node:` module, so Worker safety is enforced.
- Verify: the baseline output is byte-identical to the 1.0 run.

### 1.3 Ingestion primitives (pure, extracted from the D1 script)
In `packages/rag/src/ingest.ts`:
- `recordText(record)` returns `title\n\ncontent` (same as the prototype).
- `contentHash(record, model, dims)` returns the SHA-256 hex of `model\ndims\ntext`, computed with `crypto.subtle`. It is async but produces the same hex as the prototype's `node:crypto` version.
- `validateVector(values, dims)` checks the length and that every value is finite.
- `assertIngestable(record)` throws unless the record is public and synthetic. This is the per-record privacy guard from the prototype.
- `pointId(recordId)` returns a deterministic UUID v5 built from a fixed project namespace and the record ID, via `crypto.subtle` SHA-1. Qdrant accepts only unsigned integers or UUIDs as point IDs.
- `toPayload(record, hash)` returns: `record_id`, `type`, `title`, `content`, `visibility`, `verification_status`, `is_synthetic`, `updated_at`, the optional `project_id`, `valid_from` and `valid_until`, plus `content_hash`, `embedding_model` and `embedding_dimensions`.
- Tests: the hash matches a known vector; the UUID is stable and correctly formatted (version 5 and variant bits); a private record throws; payload fields are correct.

### 1.4 Gemini client
- **Check the current Gemini docs first and record the answers in D-012:**
  - whether `gemini-embedding-2` supports query and document task types (`RETRIEVAL_QUERY` / `RETRIEVAL_DOCUMENT`);
  - whether `batchEmbedContents` is supported and how many items a request can hold;
  - whether truncated 768-dimension vectors should be normalized;
  - the current free-tier rate limits, and whether this model is free-tier eligible.
- In `packages/rag/src/gemini.ts`, `createGeminiClient({ apiKey, model, dims, fetch })` exposes `embedDocuments(texts)` (batched if supported) and `embedQuery(text)`.
  - `fetch` is injected for tests.
  - Each request times out via `AbortSignal.timeout`, and 429 and 5xx responses are retried with exponential backoff and jitter, honoring `Retry-After` when present.
  - Error messages never include the API key or the request text.
- On normalization: Qdrant's cosine distance normalizes vectors on upload, so we upload vectors as returned. We document that any client-side dot product needs normalized vectors.
- Tests with a mocked fetch: request shape, batching, retry on 429 and then success, no retry on 400, key absent from errors, dimension check.

### 1.5 Qdrant client
In `packages/rag/src/qdrant.ts`, `createQdrantClient({ url, apiKey, fetch })` uses the REST API with the `api-key` header. Confirm the endpoints against the current Qdrant docs first.
- `ensureCollection(name, { size: 768, distance: "Cosine" })`: if the collection is missing, create it. If it exists with a different size or distance, fail with a clear message and never silently recreate it.
- `ensurePayloadIndex(name, field, "keyword")` for `visibility`, `record_id` and `type`, so filters are indexed.
- `upsertPoints(name, points)` with `wait=true`, in batches.
- `scrollAll(name, { withPayload: [...] })`, which pages through all points.
- `deletePoints(name, ids)`, `count(name, filter?)`, `retrieve(name, ids)`.
- `query(name, vector, { filter, limit })` for the sanity-check script in 1.8. Retrieval proper is Phase 2.
- Tests with a mocked fetch: URL and header, an existing collection with the wrong size raises an error, scroll pagination, and HTTP error mapping that never includes the key.

### 1.6 Ingest planner (pure)
In `packages/rag/src/ingest.ts`, `planIngest(publicRecords, existingPoints, { model, dims })` returns `{ toUpsert, unchanged, toDelete }`.
- A record goes in `toUpsert` when it's new, when its hash changed, or when the stored model or dimensions differ.
- A point goes in `toDelete` when its `record_id` is no longer among the public records. That covers a record that was removed and one that was switched to private.
- Tests: first run (all upsert), rerun (all unchanged), one record edited, one record removed, one record switched to private (deleted and never upserted), a model change (all upsert).

### 1.7 Ingest script
New `scripts/ingest/ingest-qdrant.ts`, exposed as `pnpm ingest`, plus `pnpm ingest:dry` (passes `--dry-run`).
1. Load `.env` with `process.loadEnvFile` and check it with `checkEnv` from `scripts/lib/env.ts`. Stop if anything is missing.
2. Load and validate the corpus and the eval set, reusing `validateEvalData` from `scripts/validate-eval.ts` and the corpus checks from the prototype (moved into `scripts/lib`).
3. Filter to public records, and run `assertIngestable` on each one.
4. Ensure the collection and payload indexes exist. Dry run: only read; if the collection doesn't exist, report that it would be created.
5. Scroll the existing points, compute the plan, and print counts: to upsert, unchanged, to delete.
6. Unless this is a dry run: embed only the records in `toUpsert`, validate each vector, upsert in batches, then delete the stale points.
7. **Verify:** the point count equals the number of public records; `retrieve` on every private record's point ID returns nothing; every stored payload has the expected model and dimensions.
8. Print a summary. Never print keys, vectors or record content. Exit non-zero on any failure.

### 1.8 Live run (checkpoint: owner's go-ahead first)
- Run `pnpm ingest:dry`. Expect: the collection would be created, 39 to upsert.
- Run `pnpm ingest`. Expect: 39 upserted, and verification passes.
- Run `pnpm ingest` again. Expect: 0 upserted, 39 unchanged.
- Add `scripts/qdrant-query.ts` (`pnpm qdrant:query "question"`), which embeds a question and prints the top 5 record IDs and scores. Try a few eval questions by hand as a sanity check; the full dense-versus-BM25 eval is Phase 2.
- Record the results in the daily log.

### 1.9 Retire the D1 ingest path and update docs
- Delete `scripts/ingest/gemini-embeddings.ts` and the `embeddings:ingest:local` script, since they are now superseded. The D1 binding and migrations stay until Phase 5, as planned.
- Update `docs/SETUP.md` (ingest commands and what to do when the Qdrant cluster is suspended or deleted), `docs/RAG_PROJECT_PLAN.md` (Phase 1 marked done, linking `docs/PHASE_1_PLAN.md`), and `docs/DECISIONS.md` (D-011 package import strategy, D-012 Gemini embedding settings, D-013 collection design: UUID v5 point IDs, cosine distance, payload indexes, and the delete-on-unpublish rule).
- Save this plan as `docs/PHASE_1_PLAN.md` in the first commit of 1.0, as the owner asked earlier for plans to live in `docs/`.

## Reuse (do not rewrite)
- `scripts/lib/bm25.ts`: moved as-is in 1.1.
- `recallAtK` in `scripts/lib/baseline.ts`: moved in 1.2.
- `validateEvalData` in `scripts/validate-eval.ts`, plus its phone and salary checks.
- `checkEnv` in `scripts/lib/env.ts`.
- From `scripts/ingest/gemini-embeddings.ts`: `recordText`, `contentHash`, `validateVector`, `validateCorpus`, the per-record privacy guard, and the Gemini request shape.
- The `SELF.fetch` and Workers vitest pattern in `apps/api/test/`.

## Risks and mitigations
- **Type stripping through pnpm symlinks:** handled by the spike in 1.1, with relative imports as the fallback.
- **Gemini free-tier quota and rate limits:** batch embeddings, ingest only changed records, and retry with backoff. Check model eligibility in 1.4 before any full run.
- **Qdrant free cluster suspended:** the client reports a clear connection error; `docs/SETUP.md` explains how to resume it or recreate it and re-ingest.
- **Changing the hash from sync to async:** the test in 1.3 checks it produces the same hex as the prototype.

## Verification (end of Phase 1)
- All four check commands are green, and the Workers vitest test imports `@portfolio/rag`. `wrangler deploy --dry-run` bundles successfully.
- The baseline output is unchanged after the code move.
- `pnpm ingest` twice: the second run upserts 0. The point count is 39, and no private point ID is present.
- `pnpm qdrant:query` returns sensible top hits for a few eval questions.
- Planner tests cover the edited, removed, made-private and model-change cases.
