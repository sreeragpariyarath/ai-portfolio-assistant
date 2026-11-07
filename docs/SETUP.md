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

## 6. Web app (Phase 4)
The web app (`apps/web`) is a **static export**, and the API Worker serves it together with `/api/*` (D-020). There are two ways to run it:

```bash
# A. Development with live reload: web on :3000 calling the Worker on :8787
cd apps/web && cp .env.local.example .env.local     # sets NEXT_PUBLIC_API_BASE_URL=http://localhost:8787
pnpm dev:api                                         # terminal 1
pnpm dev:web                                         # terminal 2, then open http://localhost:3000

# B. Exactly what production serves: one Worker, one address
pnpm --filter web build                              # writes apps/web/out
pnpm dev:api                                         # open http://localhost:8787 (page) and /api/health (API)
```

- `NEXT_PUBLIC_API_BASE_URL` is empty in production, so the browser calls the same-origin path `/api/chat`. Next inlines
  `NEXT_PUBLIC_` values **at build time**, so changing it needs a rebuild. It must be an origin only (no path).
- **Restart `pnpm dev:api` after every web build.** `wrangler dev` reads the list of files in `apps/web/out` when it starts; if you rebuild (or switch branches and rebuild) while it runs, it can serve the page but answer 404 for its stylesheet, and the site shows unstyled (a huge black logo). Stop it (Ctrl+C), build, start it again, then hard refresh (Ctrl+Shift+R).
- The export must exist before `wrangler deploy` (or `wrangler dev`) can serve the site: build the web app first. The API tests
  do not need it.
- A static export cannot use `cacheComponents` or `partialPrefetching`, so both are off in `apps/web/next.config.ts`.

## 7. Measuring performance on a real device (Phase 4, task 4.9)
Open the site with `?perf` on the end of the address. A small readout in the bottom-left corner shows the page's frame rate, the worst frame in the last second, and the window size and pixel ratio. Move the mouse (or drag a finger) around to stir the water and watch the numbers: 60 is smooth, under 30 is a problem. Nothing is measured without `?perf`. On a phone the water also drifts by itself after a couple of seconds without a touch (the autopilot, D-031), and it lowers its own quality if the frames stay slow, so a readout that starts around 30 and settles near 60 is expected.

```bash
pnpm --filter web build      # build the site
pnpm dev:api                 # serves it at http://localhost:8787  (open http://localhost:8787/?perf)
```

- **A second computer:** pull the branch, run the two commands above and open the address on that machine.
- **A phone on the same Wi-Fi:** run `pnpm dev:api --ip 0.0.0.0` (**without** an extra `--` before the flag: with it, wrangler ignores the flag and stays on localhost), find the computer's address on the network (for example 192.168.1.20 from `ipconfig`) and open `http://192.168.1.20:8787/?perf` on the phone. This makes the dev server reachable by everyone on that network, so use a network you trust and stop it (Ctrl+C) when you are done. Windows may ask to allow Node through the firewall; allow it for private networks only. Forwarding of `--ip` and `--port` was checked on localhost only; the `0.0.0.0` form itself has not been run.
- Asking questions is not needed to measure the water, so no Gemini quota is used.
- Download sizes: `pnpm web:size` (after the build) prints what a visitor downloads.

## 8. Deploying to Cloudflare (Phase 5)
One Worker serves the site and `/api/*` (D-020), so there is one deploy. Everything below runs from the repository root.
Each step that touches your Cloudflare account is marked **(account)**; do them yourself, or ask Claude to run one with your go-ahead.

**Before the first deploy**
1. `git pull`, `pnpm install`.
2. Check the data is current: `pnpm eval:validate`, `pnpm corpus:check`, and `pnpm ingest:dry` (it must say 0 to add, 0 to delete).
3. Build the site **without** `NEXT_PUBLIC_API_BASE_URL` set (the page then calls `/api/chat` on its own address):
   `pnpm --filter web build`
4. Try the exact bundle without uploading it: `cd apps/api && pnpm exec wrangler deploy --dry-run --outdir ../../.tmp-dry`
   (it lists the bindings and reads `apps/web/out`; delete the folder afterwards).

**First deploy**
5. **(account)** `cd apps/api && pnpm exec wrangler login` (opens a browser; a free account is enough).
6. **(account)** Set the three secrets, one at a time (each prompts for the value, which is not echoed):
   `pnpm exec wrangler secret put GEMINI_API_KEY`, then `QDRANT_URL`, then `QDRANT_API_KEY`. Use the same values as in `.env`.
   On a Worker that does not exist yet, wrangler asks to create it: say yes. Never paste a secret into a file or a chat.
7. **(account)** `pnpm exec wrangler deploy`. The first time, Cloudflare asks you to choose your account's `workers.dev` name; the site is then at
   `https://sreerag.<that-name>.workers.dev` (the Worker's name is `sreerag` in `wrangler.jsonc`; change it **before** this step if you want another).
8. Put the printed address into: `ALLOWED_ORIGIN` in `apps/api/wrangler.jsonc` (an https origin, no trailing slash; CORS does not apply to the deployed site because the page
   and the API share one address, but keep it correct), and the Portfolio link in `CONTACT` in `apps/web/src/features/cards/portfolio-cards.ts`. Then
   `pnpm --filter web build` and `pnpm exec wrangler deploy` again (from `apps/api`).

**Check it**
9. `curl https://sreerag.<name>.workers.dev/api/health` answers `{"status":"ok"...}`. Open the site, ask a typed question, open a project card and a record page.
10. The free-plan rate limit: send 12 quick requests (for example `for i in $(seq 12); do curl -s -o /dev/null -w "%{http_code} " -X POST -H "Content-Type: application/json" -d "{}" https://sreerag.<name>.workers.dev/api/chat; done`).
    The first ten answer 400 (empty body) and then 429 should appear. If they never do, the binding is not enforced on the Free plan and the in-memory fallback is the only guard: record it in `docs/DECISIONS.md`.
11. **(account)** `pnpm exec wrangler tail` while you use the site shows the structured log lines (never keys or question text).
12. The keep-alive: after the first 04:23 UTC run, `wrangler tail` (or the Worker's logs in the dashboard) shows `{"event":"keep-alive","status":"ok","points":82}` (the number of public records; it becomes 120 after the ingest of the added records, D-037).
    Qdrant says a free cluster is suspended after a week without activity and deleted after four, but not which requests count as activity: look at the cluster in the Qdrant Cloud page after a week.
13. Open the site with `?perf` on a phone and note the frame rate (see section 7).

**Later changes**
- A change to the web app: `pnpm --filter web build`, then `cd apps/api && pnpm exec wrangler deploy`.
- A change to the records: `pnpm corpus:build`, `pnpm ingest` (needs `.env`), commit, build and deploy as above.
- Changing a secret: `pnpm exec wrangler secret put <NAME>` again.
- The empty D1 database `portfolio-knowledge` from the prototype still exists in the Cloudflare account (0 tables; nothing uses it): delete it from the dashboard whenever you like.
