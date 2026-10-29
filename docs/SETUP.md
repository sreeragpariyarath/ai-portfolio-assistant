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

## Worker secrets (later phases)
Local Worker development reads secrets from `apps/api/.dev.vars` (git-ignored). Deployed secrets
are set with `wrangler secret put <NAME>`. Never put secrets in `wrangler.jsonc`.
