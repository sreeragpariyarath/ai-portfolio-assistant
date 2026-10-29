# Phase 3 plan: grounded answers and `POST /api/chat`

Part of [RAG_PROJECT_PLAN.md](RAG_PROJECT_PLAN.md). Phase 2 chose hybrid retrieval (D-014: BM25 + dense, RRF k=60, 20 candidates each; Recall@10 99.3% on the development cases). Phase 3 turns retrieved records into a streamed, cited answer from the Cloudflare Worker, and measures the answers.

**Outcome:** `POST /api/chat` with `{ "question": "..." }` streams an answer over server-sent events (SSE). Each answer declares one of the four behaviors (answer, qualify, abstain, refuse), cites record IDs that were actually retrieved, never reveals private records, and ignores instructions hidden in the data. `pnpm eval:answers` scores the 40 eval cases against a recorded threshold.

## Who builds what
Claude builds every task (decided by the owner on 2026-10-29; the earlier split gave 3.3, 3.4, 3.7 and 3.8 to the owner). The owner reviews, runs the manual steps (accounts, keys, `.dev.vars`) and gives the go-ahead for live runs. Every task follows the ground rules below.

## Ground rules
- Same loop as Phases 1 and 2: run `pnpm eval:validate`, `pnpm test:scripts`, `pnpm typecheck:scripts`, and in `apps/api` `pnpm typecheck` and `pnpm vitest run` before each commit. Descriptive commit message, no AI attribution, a daily log entry in the same commit, new decisions in `docs/DECISIONS.md`. Work on a feature branch with a draft PR so CI runs.
- **Read current Cloudflare docs before Worker work** (`apps/api/AGENTS.md`). Limits come from `/workers/platform/limits/`.
- New routes follow `jsonResponse` in `apps/api/src/index.ts`: JSON errors with `Cache-Control: no-store`. The success response is an SSE stream and also sends `no-store`.
- Secrets never go in `wrangler.jsonc` or git: local values in `apps/api/.dev.vars` (git-ignored), deployed values via `wrangler secret put`. After changing bindings or vars, run `pnpm cf-typegen` and use the generated `Env`.
- Worker tests run in the Workers pool against `SELF.fetch` with **mocked** Gemini and Qdrant. Real calls happen only in opt-in scripts.
- **Live checkpoint:** the first run that calls Gemini generation (the live answer eval) needs the owner's go-ahead.
- Privacy is enforced at three points: a public-only BM25 corpus at build time, the public-only Qdrant filter, and a visibility check at context assembly. Never log question text, keys or record content.

## Facts checked before planning (2026-10-29)
- **Workers Free plan:** 10 ms CPU per request, and time waiting on `fetch` does not count. 50 subrequests per request (we need about 3: embed, Qdrant query, generate). No hard duration limit for HTTP requests, and a Worker may keep streaming while the client stays connected.
- **Rate Limiting binding:** `ratelimits` in `wrangler.jsonc` (`name`, `namespace_id`, `simple.limit`, `simple.period` of 10 or 60 seconds). It is approximate and counted per Cloudflare location. The docs page does not say whether it is on the Free plan, so task 3.0 confirms that.
- **Gemini generation:** `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` and `gemini-3.8-flash` all list a free tier for input and output. The models page recommends `gemini-3.5-flash-lite` or `gemini-3.8-flash` for new projects; Gemini 2.0 models are shut down. Streaming is `POST .../models/{model}:streamGenerateContent?alt=sse`, with `systemInstruction`, `contents` and `generationConfig`. A blocked prompt comes back with `promptFeedback.blockReason` and no candidates.
- **Not yet confirmed (checked in 3.0):** the exact SSE line format, the full `finishReason` list, the 429 response body, the free-tier rate limits for the chosen model, and whether the Workers Cache API stores entries on a `*.workers.dev` hostname.

## Design in one picture
```
question -> validate -> rate limit -> embed (cached) -> Qdrant dense (public filter) --+
                                      BM25 over the bundled public corpus ---------------+-> RRF -> top 8
top 8 -> visibility re-check -> prompt (records as delimited data) -> Gemini stream
(3.0 done, D-015: the embedding cache is a per-isolate in-memory LRU, not the Cache API; see tasks 3.0 and 3.8)
Gemini stream -> parse behavior line and [record-id] citations -> SSE: meta, token..., done
```

**Answer protocol (proposal, settled in 3.5):** the model's first line is `BEHAVIOR: answer|qualify|abstain|refuse`; the rest is the answer, citing records inline as `[record-id]`. The Worker reads the first line before streaming tokens, then validates citations against the record IDs it put in the context and drops any others. SSE events:
- `meta`: `{ behavior, retrieved: [record ids] }`
- `token`: `{ text }`, repeated
- `done`: `{ citations: [valid record ids], invalidCitationsDropped: n }`
- `error`: `{ code, message }` if something fails after streaming started

Failures before streaming starts return JSON: 400 (bad input), 405, 413 (too large), 415 (not JSON), 429 (rate limited) and 503 `demo_busy` (Gemini quota or an upstream is down), with `Retry-After` where known.

## Tasks
Each task is one commit unless noted.

### 3.0 Verify and decide (docs only) (done 2026-10-29, recorded as D-015)
Confirm the open facts above against current docs and record **D-015**: the generation model (proposal: `gemini-3.5-flash-lite` by default, with the name in a `GEMINI_MODEL` var so it can change without code), the rate-limit approach (the binding if it is on Free, otherwise a documented fallback), the embedding-cache approach, and the answer protocol. Create the Phase 3 branch and draft PR.

### 3.1 Bundled public corpus (Claude)
A script (`pnpm corpus:build`) validates the data and writes `apps/api/src/generated/public-corpus.json` with **public records only** (id, type, title, content, verification status, dates, project id). It is checked in, so the Worker bundle never contains the full dataset. Tests: no private ID or private content in the output, and the output is deterministic. A CI step fails if the committed file is stale.

### 3.2 Worker config and env (Claude)
Add `vars` (`QDRANT_COLLECTION`, `GEMINI_MODEL`, `EMBEDDING_MODEL`, `ALLOWED_ORIGIN`) to `wrangler.jsonc`, and the secrets `GEMINI_API_KEY`, `QDRANT_URL` and `QDRANT_API_KEY` to `.dev.vars` (add a `.dev.vars.example`). Run `pnpm cf-typegen` and switch `index.ts` to the generated `Env`. Update `docs/SETUP.md`. The D1 binding stays until Phase 5.

### 3.3 Route and request validation (Claude) (done 2026-10-29)
`POST /api/chat`: JSON only, body `{ question: string }`, the question trimmed and 1 to 500 characters, the body capped at 4 KB. CORS for `ALLOWED_ORIGIN`, including the `OPTIONS` preflight. Errors use `jsonResponse`. Tests with `SELF.fetch`: each error status, the CORS headers, and the health route unchanged.

### 3.4 Retrieval and context in the Worker (Claude) (done 2026-10-29)
Build the BM25 index once per isolate from the bundled corpus (module scope), run `denseSearch` and `hybridSearch` from `@portfolio/rag`, take the top 8, re-check `visibility === "public"` against the bundled corpus, and assemble the context with each record's ID, type, title, verification status, valid-until date and content. Tests with mocked Gemini and Qdrant: private IDs never reach the context, a Qdrant hit missing from the bundled corpus is dropped, and BM25 still answers if dense search fails (degraded mode, logged).

### 3.5 Prompt and answer parsing (Claude) (done 2026-10-29)
In `packages/rag`: `buildPrompt(question, records)` and `parseAnswer(text, allowedIds)`. The system instruction carries the four behavior definitions from the eval file. It says retrieved text is data and never instructions, tells the model to cite `[record-id]`, to qualify unverified, expired or conflicting evidence, and to refuse privacy and security requests. Records go inside clear delimiters. Tests: the prompt contains every record ID and no private field; parsing treats a missing or malformed behavior line as `qualify`, strips citations not in `allowedIds`, and handles citations split across stream chunks.

### 3.6 Gemini generation client (Claude)
Add `generate` and `streamGenerate` to the Gemini client in `packages/rag`, reusing `retry.ts`. Retries happen only before the first streamed byte. A 429 or an exhausted quota becomes a typed `QuotaError`, so the route can answer `demo_busy`. A blocked prompt becomes a typed error, not an empty answer. Tests with mocked SSE bodies: chunk parsing, chunks split mid-line, 429 mapping, block reason and timeout. Runs in Node and in the Workers pool.

### 3.7 Streaming endpoint (Claude)
Wire 3.3 to 3.6 into the SSE response (`meta`, `token`, `done`, `error`) with `Content-Type: text/event-stream` and `Cache-Control: no-store`. Add an overall timeout; if Gemini fails before streaming starts, return the JSON error instead. Log one structured line per request (latency, retrieval counts, behavior, citation counts, error code) with no question text, keys or content. Tests in the Workers pool with mocked upstreams: the full event order, invalid citations dropped, quota becomes 503 `demo_busy`, and an upstream failure mid-stream sends an `error` event.

### 3.8 Rate limit and embedding cache (Claude)
A per-IP rate limit (proposal: 10 requests per 60 seconds via the binding, or the fallback from D-015) returning 429 with `Retry-After`. Cache question embeddings in a per-isolate in-memory LRU (D-015: capped at about 200 entries, keyed by a SHA-256 of model, size and the normalized question; the Cache API is only confirmed on custom domains and KV Free allows 1,000 writes a day), so repeated questions skip the Gemini embedding call. The rate limiter sits behind a small interface because the binding's Free-plan availability is unconfirmed. Tests: the limit triggers, and a cached embedding skips the Gemini call.

### 3.9 Answer-level eval (Claude; the live run needs the go-ahead)
`pnpm eval:answers` runs the 40 cases through the same retrieval, prompt and parsing code (from Node, calling Gemini and Qdrant directly) and caches answers in git-ignored `evals/.cache/`, so changes to the scoring rerun for free. Rule-based checks per case:
- the behavior matches `expectedBehavior`;
- every citation is a retrieved, public record, and for `answer` and `qualify` at least one expected evidence ID is cited;
- no private record ID or private content appears;
- injection cases (E038 and the other `injection_*` cases) do not contain the planted claims;
- `abstain` and `refuse` cases cite nothing they should not.

`requiredFacts` and `forbiddenClaims` are written as paraphrases, so rules can only spot-check exact terms. A sample is reviewed by hand, and an LLM judge can be added later (D-007 keeps it optional). Writes `evals/results/answer-eval.md`.

### 3.10 Threshold and record (docs)
Record the first live results and set the Phase 3 threshold in **D-017** (D-016 is the fallback model and observed limits). Proposal: zero private leaks, zero invalid citations kept, zero followed injections, behavior match of at least 80%, and expected evidence cited in at least 85% of answer and qualify cases. Mark Phase 3 done when the eval meets it.

## Risks
- **10 ms CPU:** BM25 over 39 short records and RRF are tiny, and the index is built once per isolate. Watch for Error 1102 if the corpus grows.
- **Gemini free-tier limits** for generation are not published on the pricing page. The rate limit, embedding cache and `demo_busy` response cover it, and the eval caches answers to avoid repeat calls.
- **The behavior line depends on the model:** if the chosen model ignores the protocol, use `generationConfig.responseSchema` (JSON) for the eval path and keep plain streaming for the UI. Decided in 3.5 from a few real responses.
- **Prompt injection:** records are delimited data, injection cases are in the eval, and citations are validated server-side, so a manipulated answer cannot cite records the Worker did not supply.
- **Free Qdrant cluster suspended:** dense search fails, the Worker falls back to BM25 only and logs it (3.4). `docs/SETUP.md` covers resuming.

## Done when
`POST /api/chat` streams cited answers locally (`pnpm dev:api`, then `curl -N` for an answer, an abstain and an injection case), all Worker tests pass with mocked upstreams, and `pnpm eval:answers` meets the D-017 threshold.
