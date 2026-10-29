# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A pnpm monorepo for an AI portfolio assistant. The README describes the target system: RAG over portfolio content, Gemini for generation, Qdrant for vectors, Cloudflare Workers for the backend, streaming answers, and retrieval evaluation. **Most of that is not built yet.** Current state:

- `apps/api` — a Cloudflare Worker with a single route, `GET /api/health`, plus 404/405 handling. `Env` is an empty interface; no bindings are configured.
- `apps/web` — the stock `create-next-app` page. No real UI or API calls yet.

Don't assume RAG, Gemini, Qdrant, or streaming code exists. Check before extending.

## Two-device workflow: read and update the docs

The owner works from two machines, and a Claude session on one has no memory of the other. These files are the shared memory:

- `docs/DECISIONS.md` — why things are built the way they are. Read it before proposing design or tooling changes. Add a numbered entry for every new decision; supersede, never rewrite.
- `docs/DAILY_LOG.md` — what was done, newest day first. Read the latest entries at the start of a session. **After every commit, add a few plain-language lines in the same commit** saying what we did, what we tested (command and result), and manual steps such as creating a Gemini API key or Qdrant cluster. Don't copy commit titles or hashes, and never write secret values.
- `docs/RAG_PROJECT_PLAN.md` — the phased roadmap.

Run `git pull` before starting. `.env` is per device and never synced; create it from `.env.example` (see `docs/SETUP.md`).

Commit workflow: run the relevant tests first; commit and push only if green, otherwise fix and retest. Write descriptive commit messages (subject plus a body on what and why), no AI attribution lines, and work on feature branches.

## Commands

Run from the repo root unless noted. The root uses pnpm (`packageManager` is pinned in `package.json`).

```bash
pnpm install                 # install all workspace packages
pnpm dev:api                 # wrangler dev (API, local Worker runtime)
pnpm dev:web                 # next dev (web, http://localhost:3000)

pnpm --filter web build     # next build
pnpm --filter web lint      # eslint (flat config, eslint-config-next + TypeScript)

cd apps/api
pnpm test                    # vitest (watch mode by default; use `pnpm vitest run` for one pass)
pnpm typecheck               # tsc over src and test (CI runs this too)
pnpm vitest run test/index.spec.ts -t "returns 404"   # single test by name
pnpm deploy                  # wrangler deploy
pnpm cf-typegen              # wrangler types -> regenerates worker-configuration.d.ts
```

Evaluation scripts live in `scripts/` and run directly on Node's built-in TypeScript support (no build step, no extra dependencies; keep to erasable syntax and `.ts` import extensions):

```bash
pnpm eval:validate     # validate data/knowledge/synthetic-records.v3.json and evals/retrieval-eval.v3.json
pnpm eval:baseline     # validate, then run the BM25 retrieval baseline on the 40 development cases
pnpm eval:retrieval    # BM25 vs dense (Qdrant) vs hybrid; needs .env; caches question embeddings in evals/.cache/
pnpm test:scripts      # node:test suite for the validator, BM25 and metrics
```

The dataset is fictional (persona "Alex Morgan"). Private records are excluded before indexing; do not add real personal data, and never put a phone number or salary in any file.

Run `pnpm cf-typegen` after changing bindings in `apps/api/wrangler.jsonc`. There is no root-level test or lint script; run them per package.

## Architecture

**Workspace layout:** `pnpm-workspace.yaml` includes `apps/*` and `packages/*`. `packages/rag` (`@portfolio/rag`) holds retrieval code shared by the eval scripts and the API. It is imported by name as raw TypeScript (no build step), so it must stay runtime-neutral: no `node:` imports, erasable syntax, `.ts` import extensions (see D-011 in `docs/DECISIONS.md`).

**API tests run inside the Workers runtime.** `apps/api/vitest.config.mts` uses `@cloudflare/vitest-plugin`, pointed at `wrangler.jsonc`. Tests import `SELF` from `cloudflare:test` and call `SELF.fetch(...)` against the real `default.fetch` handler. They do not spin up a Node HTTP server, so Node-only APIs may not be available in tests or at runtime.

**Request handling** is a single `fetch` handler in `apps/api/src/index.ts` that routes on `url.pathname` with `if` checks. All responses go through `jsonResponse`, which sets `Cache-Control: no-store`. New routes should follow that pattern (JSON body, same header) so the tests' header assertions still hold.

**Typed env:** `Env` is declared locally in `index.ts` and is currently empty. When adding bindings (KV, D1, R2, Vectorize, AI, secrets), add them to `wrangler.jsonc`, run `pnpm cf-typegen`, and use the generated `Env` type rather than hand-writing one.

**Web app** is Next.js App Router under `apps/web/src/app/` (`layout.tsx`, `page.tsx`, `globals.css`). Tailwind v4 is wired through `@tailwindcss/turbopack` in `next.config.ts`, which uses a custom turbopack CSS rule. `next.config.ts` also enables `cacheComponents` and `partialPrefetching`, so check the Next docs before changing caching or prefetch behavior.

## Read before coding in these areas

Both app directories have an `AGENTS.md` with stricter instructions than general knowledge. Read the relevant one first.

- **Next.js (`apps/web`)**: `apps/web/AGENTS.md` says this Next version has breaking changes from training data. Read the relevant guide in `apps/web/node_modules/next/dist/docs/` before writing Next code, and heed deprecation notices. (`next` may not be resolvable from the repo root, so look under `apps/web`.)
- **Cloudflare Workers (`apps/api`)**: `apps/api/AGENTS.md` says to retrieve current Cloudflare docs before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK work. For limits, use the product's `/platform/limits/` page. Error 1102 means CPU/memory limits were exceeded.

## Tooling notes

- `apps/web` runs ESLint 9 flat config (`apps/web/eslint.config.mjs`), which keeps the Next.js core-web-vitals and TypeScript rule sets and ignores `.next/`, `out/`, `build/`, and `next-env.d.ts`.
- `apps/api` has its own `.prettierrc` and `.editorconfig`. Note the two packages differ: the API uses tabs in its vitest config and two-space indent in `src/`; match the file you are editing.
