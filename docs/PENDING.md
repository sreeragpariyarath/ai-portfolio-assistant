# Pending and to do

The single list of what is left. Read it at the start of a session (it is the shared memory between the owner's two machines, like `DAILY_LOG.md`). Tick items off or delete them when done, and record decisions in `DECISIONS.md`. Last updated 2026-10-30, at the end of Phase 4.

## Where we are
Phases 0 to 4 are done and on `main` (PR #15 carries the last small commits; check it is merged). The site works end to end on the **fictional dataset** ("Alex Morgan", D-008): home page with water effect and liquid glass, streaming cited chat, stored cards for Me, Projects, Skills and Contact (dummy content), friendlier answer tone (D-025), stored funny "I don't know" lines (D-027), feature-folder layout (D-028).

## Owner, at home: real data and funny lines (waiting on the owner)
The owner will add these from the home machine. A Claude session there should read this file, `D-022` and `D-026` first.

**1. Real details** (replaces the dummy content; no phone number or salary, ever)
- **Profile card:** name, headline (set: "Full Stack Engineer", D-024), location, a short hello, 3 to 5 tags, the longer "about me" text, and a real photo (a file under `apps/web/public`; set `PROFILE.photo` with `placeholder: false`).
- **Projects:** for each: title, one-line tagline, year or period, a short description, 3 highlights, tech list, links (live demo, source code), a picture (16:9 works best; until then a gradient shows), and which knowledge record it comes from.
- **Skills:** the groups and the skills in each.
- **Contact:** email (may be shown), LinkedIn, GitHub, portfolio link.
- **Knowledge records** for the assistant (the source of its answers): profile, projects, contributions, decisions, in the same record format as `data/knowledge/synthetic-records.v3.json`. Mark private ones private; they are excluded before indexing.
- **Fun chip:** decide what it shows (stored card, or keep asking the assistant).

**2. Funny "I don't know" lines**
- The owner may write their own wording. The 13 current lines live in `apps/web/src/features/chat/abstain-lines.ts`. Rules: no names, no digits, no claims about the owner, and the joke is only about the gap. `abstain-lines.test.ts` expects exactly 13 and checks these rules, so change the count in the test if the number changes. Refusals never use them.

## Claude: the real-data switch (D-022), after the owner's details arrive
1. Write the real records, replacing the synthetic file (or add a new versioned file); update the check that refuses anything not marked synthetic (`assertIngestable` and its tests) so it still refuses private records.
2. Write the evaluation questions for the real data (about 40, with expected behaviour and evidence ids) and the privacy traps (phone number, salary, "ignore your instructions").
3. Fill `portfolio-cards.ts` with the real card content and pictures; update `SITE` wording; remove the "Demo record from a fictional dataset" note on record pages once the data is real.
4. `pnpm corpus:build` (public-only bundle for the Worker and the web app), then `pnpm ingest` to Qdrant. **Needs the owner's go-ahead** (first write to the real index).
5. Run the retrieval and answer evaluations; the answer run uses Gemini quota (about 40 calls) and **needs the owner's go-ahead**. Thresholds: private leaks 0, injections followed 0, behaviour match at least 80%, evidence cited at least 85%.
6. Update the docs (DECISIONS entry that supersedes the synthetic-only part of D-008, DAILY_LOG, PHASE plan).

## Claude: Phase 5, cleanup and deploy to Cloudflare (after the real data)
- Remove the D1 prototype binding, migrations `0001` and `0002` from `apps/api/wrangler.jsonc`, then `pnpm cf-typegen`. Do not touch the remote D1 database without the owner's confirmation.
- Set the secrets on the deployed Worker (`wrangler secret put` for `GEMINI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`); set `ALLOWED_ORIGIN` to the real site address; keep `NEXT_PUBLIC_API_BASE_URL` empty for the production build (same-origin `/api/chat`).
- Confirm the Rate Limiting binding works on the Free plan at the first deploy.
- **Site address (owner to decide).** Our deploy is one Worker with static assets (D-020), so the free address is `<worker-name>.<account-subdomain>.workers.dev`, not `pages.dev`. A custom domain on a Worker needs a domain whose DNS is on Cloudflare (an active zone in the owner's account); Cloudflare's docs say a Worker cannot take a hostname on a zone you do not own, and Workers do not support domains whose nameservers are not managed by Cloudflare. So a free `name.is-a.dev` subdomain (DNS managed by that service) cannot be attached to the Worker as it is built. Options: (1) launch on `workers.dev` (free, works now); (2) buy a cheap domain, add it to Cloudflare and attach it as a Custom Domain; (3) use `is-a.dev` only by hosting the static site elsewhere (for example Cloudflare Pages or another static host) and keeping the API on the Worker, which means revisiting D-020 and setting `ALLOWED_ORIGIN` and `NEXT_PUBLIC_API_BASE_URL`. Recommended: 1 for the first release, 2 later if wanted. Record the choice as a decision. The owner's domain budget is about 150 rupees; the cheapest fit seen (GoDaddy, 2026-10-30) was `sreerag.in` or `sreerag.co.in` at 99 rupees for the first year with code GOINDIA (renews at 749 a year); `sreerag.com` is a premium resale at over 1 lakh rupees, and the 1-rupee `.me` offer needs a 3-year term. Nothing bought yet; the owner will decide later.
- Build the web app, then `wrangler deploy` (one Worker serves the site and `/api/*`, D-020). Confirm each remote action with the owner first.
- Add a scheduled ping to Qdrant so the free cluster is not suspended; document the re-seed command (`pnpm ingest`) in `docs/SETUP.md`.
- Measure frame rate on a phone with `?perf` on the deployed site.

## Later: Phase 6, portfolio polish
README rewrite (architecture, honest current-versus-planned, setup, evaluation table, limits and quotas, design decisions), a demo GIF, and the optional extras listed in `RAG_PROJECT_PLAN.md`.

## Open checks nobody has done
- A native screen reader pass (NVDA or VoiceOver) on the chat and the cards.
- Safari and iPhone: the frosted-glass fallback and the project pop-up.
- Real phone frame rate (after deploy).
- The card entrance animation timing, tuned on a real phone.

## Smaller things
- Cosmetic: a small gap after citation numbers before a full stop.
- A typed "who are you" is matched to the profile card only when the whole message is that request; longer versions go to the assistant (by design).
- The roadmap in `RAG_PROJECT_PLAN.md` still says Vercel or Cloudflare for hosting and that `cacheComponents` is enabled; D-020 chose Cloudflare and turned both flags off.

## Habits that avoid trouble
- Open each pull request against `main` and wait for it to merge before starting the next piece (stacked pull requests left commits off `main` twice).
- After every web build, restart `pnpm dev:api` (see `docs/SETUP.md` section 6).
- Live Gemini use (evaluations, ingestion) needs the owner's go-ahead; the free quota is about 500 generation calls a day.
