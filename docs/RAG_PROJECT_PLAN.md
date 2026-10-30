# RAG Project Plan: ai-portfolio-assistant

## Context
Goal: a portfolio project that demonstrates real RAG engineering for full-stack/AI roles, at zero cost. The repo currently has validated synthetic data (40 records, 39 public), an eval set (40 cases), a BM25 baseline, and a D1 prototype that stores embeddings as JSON text. The README and the earlier KT agree the target is Qdrant + Gemini + hybrid retrieval (BM25 + dense + RRF) + grounded streaming answers. The D1 work is a throwaway prototype. Nothing user-facing exists yet (the API has only `/api/health`; the web app is the stock create-next-app page).

## Decisions
- **Qdrant Cloud free cluster** for dev and deploy (Docker is not installed). Free clusters are suspended after about 1 week idle and deleted after about 4, so we need a keep-alive cron and a re-ingest script. Verify current terms before relying on them.
- **Scope: core + polish.** Core pipeline, evals, README with results, CI evals, Worker logs. Add a reranker only if evals justify it.
- **Shared package `packages/rag`**, so eval scripts and the Worker run the same code.
- **Privacy:** no real personal data (phone, salary) in any file. Private records never reach Gemini, Qdrant or the Worker bundle.
- **Commits:** plain messages, no AI attribution.

## Target architecture
```
data/knowledge/*.json -> validate -> public filter -> embed (gemini-embedding-2, 768d) -> Qdrant upsert (stable IDs, hash skip)

query -> guardrails -> embed query -> Qdrant dense search (visibility filter) --\
                                   -> BM25 (in-memory, public bundle) ---------> RRF -> context -> Gemini (SSE stream) -> citations / abstain
```
Worker free-plan constraints: 10 ms CPU per request (network waits excluded), 50 subrequests, 100k requests/day. BM25 + RRF over about 39 records is tiny; no heavy compute in the Worker.

## Phases
Each phase ends runnable and is committed separately.

### Phase 0: Baseline and hygiene
- Re-run `pnpm eval:validate`, `pnpm test:scripts`, `pnpm eval:baseline` and record the numbers.
- Commit existing uncommitted work (`package.json`, `pnpm-lock.yaml`, `scripts/ingest/`) in its own commit(s).
- Add `.env.example` (`GEMINI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`); gitignore `.env` and `.dev.vars`.
- Owner creates a Gemini key in AI Studio **without billing linked**, and a Qdrant Cloud free cluster plus API key.

### Phase 1: `packages/rag` and Qdrant ingestion (done; detailed plan in [PHASE_1_PLAN.md](PHASE_1_PLAN.md))
- Create `packages/rag` (the workspace already globs `packages/*`). Move or reuse `scripts/lib/bm25.ts`, `recallAtK`/metrics from `scripts/lib/baseline.ts`, and types from `scripts/lib/eval-data.ts`. Scripts import from the package. Keep erasable-syntax TS with `.ts` import extensions so Node scripts, vitest and wrangler all consume it.
- Add `qdrant.ts` (thin fetch-based REST client: create collection, upsert batch, filtered query, count, scroll) and `gemini.ts` (embed document/query, streaming generate).
- Verify against current docs before coding: embedding task types for `gemini-embedding-2`, normalization of truncated 768d vectors, Qdrant distance metric (cosine), point ID format (UUID v5 from record id).
- Rewrite `scripts/ingest/gemini-embeddings.ts` as `scripts/ingest/ingest-qdrant.ts`: reuse validation, public-only filter, the content hash (`MODEL\nDIM\ntitle\n\ncontent`), batching and error reporting. Drop Wrangler, SQL temp files and shell code. Store the hash in the payload so unchanged records are skipped; delete points for records that are no longer public.
- Tests: private-leak test (private IDs absent after ingest), idempotent rerun, client tests with mocked fetch.
- **Done when:** 39 points exist, a rerun skips all, and a direct query returns sensible hits.

### Phase 2: Retrieval and evaluation (done; results in D-014; detailed plan in [PHASE_2_PLAN.md](PHASE_2_PLAN.md))
- In `packages/rag`: `denseSearch` (Qdrant filter `visibility=public`), `bm25Search`, `rrf(lists, k=60)` with configurable k and candidate counts, and `hybridSearch`.
- Extend `scripts/retrieval-baseline.ts` into `pnpm eval:retrieval`, comparing BM25 / dense / hybrid on Recall@5/10, full-evidence coverage, private leakage and E032 list completeness. Write a markdown table to `evals/results/`.
- Tune RRF k and candidate depth on the development split only. The eval file says it is not a held-out test set; say so in the README.
- **Done when:** a results table exists and the README can state which method wins, even if hybrid does not.

### Phase 3: Grounded generation and API (done; results in D-017; detailed plan in [PHASE_3_PLAN.md](PHASE_3_PLAN.md))
- Worker `POST /api/chat` in `apps/api/src/index.ts`, following the existing `jsonResponse` pattern (JSON errors, `Cache-Control: no-store`; SSE for success). Use the generated `Env` from `worker-configuration.d.ts` (`pnpm cf-typegen`) with secrets `GEMINI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`.
- Request validation (size cap, schema), per-IP rate limit, timeouts with retry/backoff, friendly "demo busy" response when the Gemini quota is hit, and an embedding cache for repeated queries.
- Prompt policy implements answer / qualify / abstain / refuse (definitions in `evals/retrieval-eval.v3.json`). Retrieved text is treated as data, not instructions. Citations are record IDs. Visibility is checked a second time at context assembly.
- The public-only corpus for BM25 is generated at build time from the validated data; private records are never bundled.
- Answer-level evals: expected behavior, `requiredFacts` present, `forbiddenClaims` absent, valid citations, injection and private-data probes. Rule-based first, optional LLM judge later. Run in the Workers vitest pool with mocked Gemini/Qdrant, plus an opt-in live eval script.
- **Done when:** the answer-level eval passes at a recorded threshold.

### Phase 4: Next.js chat UI (`apps/web`) (done, tasks 4.1 to 4.11; see PHASE_4_PLAN.md)
- Read `apps/web/AGENTS.md` and the relevant guide in `apps/web/node_modules/next/dist/docs/` first. This Next version has breaking changes. `cacheComponents` and `partialPrefetching` are off because the app is a static export (D-020).
- Streaming chat, citation chips linking to source records, suggested questions, loading/error/"demo busy" states, responsive and accessible. API base URL comes from an env var.
- **Done when:** a visitor can ask a question and get a streamed, cited answer, and `pnpm --filter web build` and `pnpm --filter web lint` pass.

### Phase 5: Cleanup and deploy
- Remove the D1 binding from `apps/api/wrangler.jsonc`, migrations `0001` and `0002`, the old ingest script and `embeddings:ingest:local`; run `pnpm cf-typegen`. Do not touch the remote D1 database without the owner's confirmation.
- `wrangler secret put` for secrets; deploy the Worker and the web app (one Cloudflare Worker serves both, D-020); add a scheduled trigger that pings Qdrant to prevent suspension; document a `pnpm ingest` re-seed command.
- Confirm each remote action with the owner first.

### Phase 6: Portfolio polish
- README rewrite: architecture diagram, current-vs-planned honesty, setup, eval results table, limitations and quotas, design decisions (why Qdrant, why hybrid, why RRF, client-side fusion vs Qdrant server-side, why synthetic data).
- GitHub Actions: validate, script tests, API tests, web lint and build on pull requests (evals that need no secrets).
- Demo GIF. Worker observability is already enabled in the wrangler config.
- Stretch, only if time and evals justify: reranker, Langfuse, chunked document ingestion.

## Reuse (do not rewrite)
- `scripts/lib/bm25.ts` (`buildIndex`, `search`)
- `scripts/lib/baseline.ts` (`recallAtK`, `runBaseline`)
- `scripts/lib/eval-data.ts` and the validator in `scripts/validate-eval.ts`
- Hash, validation and batching logic in `scripts/ingest/gemini-embeddings.ts`
- `jsonResponse` in `apps/api/src/index.ts`
- The `SELF.fetch` test pattern in `apps/api/test/`

## Risks
- **Free quotas** (Gemini rate limits, Qdrant suspension): mitigate with caching, rate limiting, a fallback message and a re-ingest script.
- **Embedding free-tier eligibility:** confirm `gemini-embedding-2` is free-tier eligible before the first full ingest (39 short records is tiny either way).
- **Worker CPU:** 10 ms per request. Keep fusion and BM25 small and watch for Error 1102.
- **Shared TS across runtimes:** verify `.ts`-extension imports resolve in Node scripts, the vitest pool and the wrangler bundle early in Phase 1.

## Verification
- After each phase: `pnpm eval:validate`, `pnpm test:scripts`, `cd apps/api && pnpm vitest run`, `pnpm --filter web build && pnpm --filter web lint`.
- Phase 1: ingest twice (second run skips all); Qdrant point count is 39; no private ID present.
- Phase 2: `pnpm eval:retrieval` table for BM25 / dense / hybrid; private leakage is none.
- Phase 3: `wrangler dev`, then `curl -N` POST `/api/chat` for an answer, an abstain and an injection case; run the answer-level eval.
- Phase 4: run `pnpm dev:api` and `pnpm dev:web`, ask questions in the browser.
- Phase 5: hit the deployed `/api/health` and `/api/chat`; confirm the cron ping.
