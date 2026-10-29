# Environment setup

The RAG pipeline needs two free accounts. Neither requires a payment card.

## 1. Gemini API key (embeddings and answers)
1. Open Google AI Studio and sign in.
2. Create an API key. Do **not** link a billing account, so the free tier cannot charge you.
3. Put it in `.env` as `GEMINI_API_KEY`.

Free-tier rate limits apply and can change. Check your AI Studio dashboard for current limits.
Free-tier content may be used by Google to improve its products, so keep real personal data
out of the project. The dataset here is synthetic.

## 2. Qdrant Cloud free cluster (vector database)
1. Sign up at Qdrant Cloud and create a free cluster.
2. Copy the cluster URL (it includes the port, usually `:6333`) into `QDRANT_URL`.
3. Create an API key for the cluster and put it in `QDRANT_API_KEY`.

Free clusters are suspended after about a week without use and deleted after about four weeks,
per Qdrant's documentation. Resume a suspended cluster from the Qdrant dashboard. If one is
deleted, create a new cluster and re-run ingestion. Re-check the current terms on Qdrant's site.

## 3. Create `.env`
```bash
cp .env.example .env
# edit .env and fill in the values
pnpm env:check
```

`.env` is git-ignored. `pnpm env:check` reports which variables are set, missing or malformed.
It never prints their values.

## 4. Load the knowledge into Qdrant
```bash
pnpm ingest:dry                 # read-only: shows what would be uploaded
pnpm ingest                     # embeds changed public records, uploads, verifies
pnpm qdrant:query "question"    # top 5 record ids and scores
```

`pnpm ingest` is safe to repeat: unchanged records are skipped, records removed or made private
are deleted from Qdrant, and it ends by checking the point count and that no private record is
stored. It uses `QDRANT_COLLECTION` and never recreates a collection that has the wrong vector
size; it stops with an error instead.

**If the cluster is suspended:** resume it from the Qdrant dashboard, wait a minute, run
`pnpm ingest:dry`. **If it was deleted:** create a new cluster, put the new URL and key in `.env`,
then run `pnpm ingest`; the empty collection is recreated and all records are re-uploaded.

## 5. Worker settings and secrets (Phase 3)
The Worker has two kinds of configuration, both declared in `apps/api/wrangler.jsonc`:

- **Settings (not secret), committed:** `QDRANT_COLLECTION`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`,
  `EMBEDDING_MODEL` and `ALLOWED_ORIGIN` live under `vars`. `ALLOWED_ORIGIN` is `http://localhost:3000` for now; set the real
  web origin when deploying.
- **Secrets, never committed:** `GEMINI_API_KEY`, `QDRANT_URL` and `QDRANT_API_KEY` are only *named* under
  `secrets.required`. Their values come from `apps/api/.dev.vars` locally and from `wrangler secret put <NAME>`
  when deployed. Never put a secret value in `wrangler.jsonc`.

To run the Worker locally with real upstreams (needed from task 3.7, not before; tests use mocks):
```bash
cd apps/api
cp .dev.vars.example .dev.vars
# edit .dev.vars: use the same three values as the repo-root .env
pnpm dev          # wrangler dev; warns by name if a required secret is missing
```
`.dev.vars` is git-ignored. Wrangler loads only the three required names from it. After editing
`wrangler.jsonc`, run `pnpm cf-typegen` and commit the regenerated `worker-configuration.d.ts`; CI fails
if it is out of date (`pnpm cf-typegen:check`).
