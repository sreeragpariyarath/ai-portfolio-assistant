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

## Worker secrets (later phases)
Local Worker development reads secrets from `apps/api/.dev.vars` (git-ignored). Deployed secrets
are set with `wrangler secret put <NAME>`. Never put secrets in `wrangler.jsonc`.
