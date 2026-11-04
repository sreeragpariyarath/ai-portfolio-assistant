# Pending and to do

The single list of what is left. Read it at the start of a session (it is the shared memory between the owner's two machines, like `DAILY_LOG.md`). Tick items off or delete them when done, and record decisions in `DECISIONS.md`. Last updated 2026-10-30, at the end of Phase 4.

## Update 4 Nov 2026 (laptop, Phase 6): README written; GIF and held-out set left
The README is rewritten (what it does, architecture diagram, layout, both evaluation tables, run steps, design decisions, limitations); CI already runs the secret-free checks on pull requests. **Left for the owner:** record the demo GIF and save it as `docs/demo.gif` (the README already points to it; the image shows broken until the file is added). **Not built:** a held-out question set (new questions, never used for tuning; the live run needs the owner's go-ahead, about 70 Gemini calls). **Also open, and listed in the README limitations:** conversation memory, a warmer reply to greetings and introductions, a friendlier rate-limit message, the Fun card redesign, the contact-record re-ingest, and `ALLOWED_ORIGIN`. No licence file exists yet: the owner decides which licence to use.

## Update 2 Nov 2026 (laptop): real data drafted, handoff to the PC
The owner's real details have arrived and the drafts are in `data/portfolio/` (78 records, 66 questions, card content, open questions). The end-to-end plan, the decisions already taken and the approval gates are in **`docs/REAL_DATA_HANDOFF.md`** (decision **D-029**). The section "Owner, at home" below is now mostly done: what remains for the owner is to **review the drafts and answer `data/portfolio/open-questions.md`**, send project pictures (portrait crops; never the HRMS or PM-tool screenshots as they are), and say when to push the UI work that exists only on the laptop. Then Claude follows the handoff: code changes, then index and eval, each live step with the owner's go-ahead.
## Update 2 Nov 2026 (PC): real data wired in
The owner reviewed the records. They are now the active data (D-029): the records and the evaluation questions are promoted, the guards accept real records, the Worker and web bundles hold the real public records, and the cards (profile, 8 projects, skills, contact, the new Fun card) carry the real content. **Next, in order:** the prompt voice and tone rewrite with the labels and sources changes (handoff step B6), then **index to Qdrant** and **one evaluation run** (each needs the owner's go-ahead; Qdrant still holds the old fictional points until then, so do not deploy yet). Still waiting on the owner: answers to `data/portfolio/open-questions.md`, project pictures (portrait, never the HR or PM-tool screenshots as they are), and a decision on the site address (the Portfolio link on the contact card says `sreerag.pages.dev`, which our Worker deploy will not serve; fix it when the address is chosen).

## Update 2 Nov 2026 (PC, later): records checked against the company repositories
The records were corrected from the Warvox, LearnWithHupe and PM and Sales repositories and five LearnWithHupe records were added (now 84 records, 82 public; 73 questions). **For the owner:** tell your team lead that a Firebase service-account key file is committed in the Project and Sales repository (it should be rotated and removed). The Socket.io (LearnWithHupe), ElevenLabs and HRMS 2025 facts are the owner's own account and stay `owner-stated`; they are not visible in the repositories checked, so expect to be asked about them in an interview.

## Update 2 Nov 2026 (PC, evaluation): done
The final full evaluation passed every threshold (private leaks 0, injections followed 0, behaviour 93.2%, evidence cited 95.2%) and the results are committed (`evals/results/answer-eval.md`, `evals/results/retrieval-comparison.md`). Qdrant holds the current records. **Left, in order:** (1) merge the open pull requests; (2) the UI work from the handoff: the water autopilot and a lower simulation size on phones, and the profile card and project dialog in the new glass style; (3) the owner's project pictures, answers to `data/portfolio/open-questions.md`, and the site address; (4) Phase 5: deploy; (5) Phase 6: README and demo GIF. Optional: the keyword half of the search misses the LearnWithHupe overview for "What is LearnWithHupe?".

## Update 4 Nov 2026 (PC, live): the site is deployed
Live at **https://sreerag.pariyarath.workers.dev** (D-035). Health, pages, the private-record 404 and one real question all work; the rate limit works but is approximate. **Left:** (1) the final evaluation on the new, faster chat model (about 81 Gemini calls, needs a go-ahead); (2) Phase 6: README, evaluation table, demo GIF, and the live and GitHub links for the CV and LinkedIn; (3) the owner checks the iPhone frame rate with `?perf` on the live address; (4) refresh the Norix download numbers; (5) delete the empty D1 database in the Cloudflare dashboard (optional); (6) after about a week, look at the Qdrant cluster page to confirm it was not suspended, and check the Worker logs for a daily `keep-alive` line; (7) set `ALLOWED_ORIGIN` to the live address (no effect on the live site, tidiness only); (8) MVP 2 after some real use.

## Update 3 Nov 2026 (PC, Phase 5 preparation): ready for the owner's account steps
The local work for Phase 5 is done (D-033): the D1 prototype and its migrations are removed, the Worker is named `sreerag`, a daily cron keeps the free Qdrant cluster alive, and the exact deploy steps are in **`docs/SETUP.md` section 8**. **Next, from the owner (account steps, one at a time, or ask Claude to run one with a go-ahead):** `wrangler login`, set the three secrets, `wrangler deploy`, then give Claude the printed address so the contact card's Portfolio link and `ALLOWED_ORIGIN` can be set and redeployed. **Then Claude:** check the live site, test the free-plan rate limit, run the one final evaluation (about 81 Gemini calls, needs a go-ahead). The Worker name `sreerag` is public in the address: say now if you want another before the first deploy.

## Update 3 Nov 2026 (PC, owner's decisions): no Norix card, home avatar stays, Firebase key reported
The owner decided: **no Norix card** (its records stay), **the home page keeps the current cartoon avatar**, and the team lead **has been told about the Firebase key** in the company repository. So the owner's list is now: the address of this site (at the first deploy), and refreshing the Norix download numbers before the deploy.

## Update 3 Nov 2026 (PC, addresses): the addresses are in; only this site's own address is missing
Warvox (live as "upcoming" and staging), Upthrust and the Carina website have their addresses, and Carina has its own card (nine cards now). **Left from the owner:** the address of this site (decide at the first deploy), refresh the Norix download numbers before the deploy, and a note to the team lead about the Firebase key. **Then:** one final evaluation (about 81 Gemini calls, needs the go-ahead), Phase 5 (deploy), Phase 6, MVP 2.

## Update 3 Nov 2026 (PC, pictures): all eight project pictures are in
All eight cards have pictures (see `data/portfolio/open-questions.md`; the PM tool and HRMS ones are invented demo data the owner made with ChatGPT). **Left from the owner:** the Warvox staging and live addresses, the Carina website address and picture, the Upthrust address, and the site address. The home page still shows the cartoon placeholder avatar, not the real photo: say if you want the photo there too.

## Update 2 Nov 2026 (PC, answers): the open questions are answered; tonight's data is next
The owner answered `data/portfolio/open-questions.md` and the answers are applied (see the daily log). **Tonight, from the owner:** the project pictures (portrait, about 3:4, `apps/web/public/projects/<id>.webp`); the Warvox staging and live addresses (shown as "upcoming"); the Carina website address, images and any measured result (this may become a card); the Upthrust address and images; the site address. **Then Claude:** add the addresses to the records and cards, set `image` on each project, add cards for the Carina website migration and Norix if wanted, rebuild and re-seed, and run **one** full evaluation (the data and 78 questions changed since the last run; about 78 Gemini calls, needs the owner's go-ahead). Before the deploy: the owner refreshes the Norix download numbers.

## Update 2 Nov 2026 (PC, UI): phone water and glass cards done, needs a phone test
The water autopilot, the lighter phone simulation and adaptive quality (D-031), and the glass Me card and project dialog, are built. **Left from the owner:** open the site on the iPhone with `?perf` and report the frame rate; the project pictures (being made tonight; save them as `apps/web/public/projects/<id>.webp`, portrait about 3:4, and set `image` on each project in `portfolio-cards.ts`); the open questions; the site address.

## Earlier: next is the evaluation
Qdrant holds the 82 public real records and the voice rewrite is in (first person, plain English, no labels, readable sources; D-030). **Next:** run one live evaluation of data and voice together (`pnpm eval:retrieval` about 73 query embeddings, then `pnpm eval:answers --live` about 73 Gemini calls), with the owner's go-ahead, and read a sample of answers by hand (refusals, small talk, the unanswered-detail questions, anything about the first-person voice and the identity question). Then the remaining UI work and Phase 5.

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

## After Phase 6: MVP 2 (planned)
The owner approved the MVP 2 ideas on 2 Nov 2026; the plan is **`docs/MVP_2_PLAN.md`**: follow-up questions, a "paste a job description" match, an owner-only unanswered-questions log, thumbs up and down, a CV download and contact path, and later chunked ingestion. Start only after Phase 5 and 6 are done and the site has had a few days of real use.

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
