# Decisions log

Why the project is built the way it is. Read this first on any device or in any new Claude session, because a session's own memory does not sync between machines. This file does.

**How to maintain it:** add a new entry (next number, newest at the bottom) whenever a design, tooling or workflow decision is made. Never rewrite history: if a decision changes, mark the old entry `Superseded by D-0XX` and add a new one. Keep each entry short: context, decision, consequences.

Status values: `Accepted`, `Superseded`, `Proposed`.

---

## D-001: Qdrant is the vector database
- **Date:** 2026-10-28 · **Status:** Accepted
- **Context:** The README and the earlier ChatGPT knowledge-transfer notes target Qdrant. A Cloudflare D1 prototype stores embeddings as JSON text, which has no vector index, so search would mean loading every row and computing cosine similarity in JavaScript.
- **Decision:** Qdrant is the vector store. D1 stays only as a prototype until Phase 5 of [RAG_PROJECT_PLAN.md](RAG_PROJECT_PLAN.md), then its binding, migrations and ingest script are removed.
- **Consequences:** Ingestion and retrieval are rewritten against Qdrant. Remote D1 is never touched without the owner's confirmation.

## D-002: Gemini embeddings, `gemini-embedding-2`, 768 dimensions
- **Date:** 2026-10-28 · **Status:** Accepted
- **Context:** The prototype generated 39 embeddings successfully with this model and size.
- **Decision:** Use `gemini-embedding-2` at 768 dimensions for documents and queries. The ingest content hash covers model, dimensions and text, so any change re-embeds affected records.
- **Open checks before relying on it:** query vs document task types, normalization of truncated vectors, free-tier eligibility of this model.

## D-003: Zero-cost infrastructure
- **Date:** 2026-10-28 · **Status:** Accepted
- **Context:** The owner cannot pay for AI or infrastructure.
- **Decision:** Free tiers only: Gemini API key created without linking billing, Qdrant Cloud free cluster, Cloudflare Workers free plan, Vercel or Cloudflare for the web app.
- **Consequences:** Qdrant free clusters suspend after about 1 week idle and are deleted after about 4, so we need a keep-alive cron and a re-ingest command. The Worker free plan allows 10 ms CPU per request, so BM25 and fusion stay tiny. Gemini quotas need rate limiting, caching and a "demo busy" fallback. Limits change, so recheck vendor pages before relying on them.

## D-004: Qdrant Cloud for development too
- **Date:** 2026-10-28 · **Status:** Accepted
- **Context:** Docker was not installed on the machine used for planning.
- **Decision:** Use a Qdrant Cloud free cluster for both dev and deploy rather than installing Docker.
- **Consequences:** Dev needs internet and an account. If Docker is later installed, a local Qdrant is a drop-in alternative via `QDRANT_URL`.

## D-005: Hybrid retrieval with client-side RRF
- **Date:** 2026-10-28 · **Status:** Accepted
- **Decision:** Dense search in Qdrant plus in-memory BM25 over a bundled public-only corpus, fused with Reciprocal Rank Fusion in our own code. Qdrant's server-side hybrid is documented as an alternative in the README.
- **Why:** Simple, testable, explainable, and comparable under the same eval cases. Hybrid is kept only if the eval shows it helps.

## D-006: Shared `packages/rag` workspace package
- **Date:** 2026-10-28 · **Status:** Accepted
- **Decision:** BM25, RRF, metrics and the Qdrant and Gemini clients move into `packages/rag`, used by both the eval scripts and the Worker.
- **Why:** The eval then tests the exact production code and the two cannot drift.

## D-007: Scope is "core + polish"
- **Date:** 2026-10-28 · **Status:** Accepted
- **Decision:** Core pipeline, answer-level evals, CI, README with results, Worker logs. A reranker, Langfuse tracing and chunked document ingestion only if time allows and the evals justify them.

## D-008: Privacy and synthetic data are hard rules
- **Date:** 2026-10-27 · **Status:** Accepted
- **Decision:** The dataset is fictional (persona "Alex Morgan"). Private records are excluded before any embedding call, before Qdrant upsert, and from the Worker bundle, and visibility is enforced again at retrieval and context assembly. Never put a phone number, salary or other real personal data in any file.

## D-009: Commit and push workflow
- **Date:** 2026-10-28 · **Status:** Accepted
- **Decision:** Run the relevant tests before every commit. If green, commit and push; if not, fix, retest, then commit and push. Commit messages are descriptive: a conventional-commit subject plus a body saying what and why. No AI attribution lines in commits or PR descriptions. Work on feature branches and merge through PRs, not directly on `main`.
- **Checks:** `pnpm eval:validate`, `pnpm test:scripts`, `pnpm typecheck:scripts`, `cd apps/api && pnpm vitest run`, plus web lint and build when `apps/web` changes.

## D-010: Two-device workflow, repo docs are the shared memory
- **Date:** 2026-10-29 · **Status:** Accepted
- **Context:** The owner works from a PC and a laptop, and Claude on one machine does not remember what Claude on the other did.
- **Decision:** This file records decisions and [DAILY_LOG.md](DAILY_LOG.md) records what was done. After every commit, Claude adds a few plain-language lines to the log: what was done, what was tested, and manual steps like creating a Gemini key (never the secret value). It does not copy commit titles. `CLAUDE.md` tells every session to read both files first. Run `git pull` before starting on either device.
- **Consequences:** Secrets are never synced: `.env` is per device, so each device creates its own from `.env.example` (see [SETUP.md](SETUP.md)).

## D-011: `@portfolio/rag` is imported by package name, as TypeScript source
- **Date:** 2026-10-29 · **Status:** Accepted
- **Context:** The shared package (D-006) has no build step. The risk was that Node refuses to strip types from files under `node_modules`, and pnpm links workspace packages there.
- **Decision:** Scripts and the API both import `@portfolio/rag` by name (a `workspace:*` dev dependency). Its `exports` point straight at `./src/*.ts`. Node resolves the symlink to the real path in `packages/rag`, so type stripping works. Checked in four places: Node scripts (baseline output byte-identical), root `tsc`, the Workers vitest pool (`apps/api/test/rag-package.spec.ts`), and a `wrangler deploy --dry-run` bundle.
- **Consequences:** No relative-import fallback is needed. Package code must stay erasable-syntax TypeScript with `.ts` import extensions and no `node:` imports. Running Node with `--preserve-symlinks` would break this.
