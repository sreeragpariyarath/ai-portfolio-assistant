# Real data and next steps: handoff from the laptop to the PC (2 Nov 2026)

Read this first in a new session. It is the end-to-end plan for switching the app from the fictional "Alex Morgan" dataset to Sreerag's real portfolio, plus the UI and deploy work around it. The shared memory still lives in `DECISIONS.md` (see **D-029**), `DAILY_LOG.md` and `PENDING.md`; this file is the detailed plan.

## 1. What now exists (all in `data/portfolio/`, nothing wired into the app yet)
- `records.draft.v1.json`: 78 records (77 public, 1 private), `isSynthetic: false`.
- `eval-questions.draft.v1.json`: 66 development questions (53 answer, 4 qualify, 4 abstain, 5 refuse).
- `cards-content.draft.md`: ready-to-paste content for the cards, plus a new Fun card.
- `portfolio-source.md` (readable copy), `open-questions.md`, `README.md`.

The generator checks passed: unique ids, every expected evidence id exists and is public, no phone number, address, birth date, colleague or client name, or internal address. The owner has **not yet reviewed** the drafts.

## 2. Decisions already taken with the owner (do not re-ask)
1. **First-person voice** for all answers ("I built…"), matching the cards and the funny lines. A small "AI answering from my portfolio" label stays on the page. Records stay in third person.
2. **Plain, short, friendly English**: short sentences, everyday words, no "I would be happy to…", at most one emoji, warm and a little playful. This is a **prompt rewrite** (`packages/rag/src/prompt.ts`).
3. **Order of work**: real data first, then the voice rewrite, then **one** eval run that covers both (to save Gemini quota: 500 generation calls and 1,000 embedding calls a day).
4. **Remove the italic labels** under answers ("I can only confirm part of this", "Not something I have on record"). Caveats go into the answer's own words. Keep the behaviour in the data for the evals.
5. **Sources** stay, but friendlier: readable record titles instead of ids, soft glass chips, at most three, and **hidden for small talk, "I don't know" and refusals**.
6. **Water on phones**: add an autopilot (slow wandering swirls when idle, a finger takes over, stops when the tab is hidden, honours reduced motion) and a lower simulation resolution on phones (the owner measured 30 fps on an iPhone).
7. **Hobbies are included** (anime, movies, travel, music and guitar, science), told only when asked, plus a stored Fun card.
8. **Company-internal decisions** (billing, translation pipeline, sync) are included at a high level. Phaser.js is included. QuickBite, DocuBot and any note about leaving Carina are excluded. The personal tracker app is **private** by default.
9. **Location line**: "Indore, India · open to relocating". Carina Softlabs may be named.
10. Company-repository git history could not be shared, so company-project roles are the owner's account (`owner-stated`).

## 3. Step plan (who does what, and which steps need the owner's go-ahead)

**A. Owner review (owner).** Read `data/portfolio/portfolio-source.md` and `open-questions.md`; correct anything wrong; answer what you can.

**B. Code changes, no network (Claude).**
1. Promote the reviewed drafts: `data/knowledge/portfolio-records.v1.json` and `evals/portfolio-eval.v1.json` (keep the synthetic v3 files as test fixtures).
2. Allow real data in the guards: `assertIngestable` in `packages/rag/src/ingest.ts` currently demands `isSynthetic: true`. Change it to: public visibility, and `isSynthetic` true **or** an allowed `source.kind` (`owner_statement`, `public_page`, `document`). **Private records must still be refused.** Update `scripts/validate-eval.ts` (it requires a synthetic corpus), `scripts/lib/eval-data.ts` (file names), `scripts/lib/corpus-build.ts`, the ingest scripts and every test that asserts the old rule.
3. Keep leak tests meaningful: the answer eval derives its private markers from the numbers in private records. Add a **fake** private record (obviously fictional phone and salary, never real ones) to the real corpus so those checks still work. The tracker record stays private too.
4. `pnpm corpus:build` (writes both bundles: Worker and web), then all checks.
5. Fill `portfolio-cards.ts` and `site.ts` from `cards-content.draft.md`; add the Fun card kind and component; remove the "Demo record from a fictional dataset" note.
6. **Voice and tone rewrite** of the prompt, first person (decision 2), with prompt tests; remove the labels; friendlier Sources; hide Sources for non-answers.
7. Update `DAILY_LOG.md` (D-029 is already written).

**C. Index the real data (owner's go-ahead needed).**
`pnpm ingest:dry` first and read the plan: it should add about 77 records and **delete** the old synthetic points. Then `pnpm ingest` (about 77 embedding calls of the 1,000 a day). It ends by checking the point count and that no private record is stored.

**D. Evaluate once (owner's go-ahead needed).**
`pnpm eval:retrieval` (about 66 query embeddings) and `pnpm eval:answers --live` (about 66 Gemini generation calls at 4.5 s each, about 5 minutes; resumable if the quota stops).
- Thresholds (D-017): private leaks 0, injections followed 0, behaviour match at least 80%, expected evidence cited at least 85% of answer and qualify cases.
- Read a sample of answers by hand, especially the refusals, the "which refresh window" abstain and the qualify cases. Record the results as the next decision.
- Do **not** tune the prompt on these cases and then call them held-out: they are development questions written by the same author.
- The answer cache is keyed by the prompt and the data: changing either asks Gemini again.

**E. UI work still on the owner's list (Claude, no Gemini calls).**
- Phone water autopilot and a lower phone resolution (decision 6).
- Match the profile ("Me") card and the project details dialog to the new glass style; decide on the line above each card; the two small arrow send buttons still have the old hover (use the quiet brightness change).
- Project cards need real pictures (portrait crop). **Never use the HRMS or PM-tool screenshots as they are** (phone number, address, birth date, names, internal addresses); use demo data or redactions. LearnWithHupe store art is fine.
- **Unpushed laptop work:** the contact card redesign, the frosted glass cards, the tall full-image project cards and the quieter Send email hover exist **only as uncommitted changes on the laptop** (branch `feat/glass-cards`, draft PR #21, which contains only the first glass-surface commit). The owner wants to see UI work before anything is pushed. Ask the owner to say "push" on the laptop; if that never happens, redo them from this description:
  - **Glass cards:** `.glass-card` (frosted surface: bright rim, hairline edge, faint inner shade, soft deep shadow) used by `CARD_SURFACE` in `card-shell.tsx`; `LINK_PILL` becomes a flat outlined pill.
  - **Contact card** (`contact-card.tsx`, about 640 px wide, centred in the column, no centred text): header row with "Get in touch" left and "● Open to full-stack roles" right (a `note` field on `CONTACT`); an email row with the address left (large, labelled EMAIL) and the buttons right (a dark `glass-send` "Send email" whose hover is only a brightness change, plus a flat "Copy"); then three link rows with the label left and the host and path right (a small `linkDisplay` helper with tests). On a phone the buttons stack under the email.
  - **Project carousel** (`project-cards.tsx`): tall portrait cards (about 250 by 350 px) with a full-bleed picture or gradient, a dark fade behind the year and big white title at the top, and a frosted glass strip at the bottom with the one-line tagline and an arrow; equal heights, `scroll-px-4` so the first card lines up with the title, soft edge fades, glass arrow buttons that dim at the ends, a barely-there hover lift.

**F. Phase 5, deploy (the owner confirms every remote action).** See `PENDING.md`: remove the D1 prototype, set the three secrets, choose the site address (`*.workers.dev` or a custom domain), `wrangler deploy`, add the Qdrant keep-alive ping, confirm the Rate Limiting binding works on the Free plan, check frame rate on a phone with `?perf`. **Before deploy, refresh the Norix download numbers** in `project-norix-001`.

**G. Phase 6, polish.** README rewrite (architecture, honest current-versus-planned, evaluation table, limits, decisions), a demo GIF, a held-out question set and an optional LLM judge (D-007).

## 4. Numbers to plan with
- Embeddings: 77 records once, plus 66 query embeddings per retrieval eval (cached after the first run).
- Generation: about 66 calls per full answer eval. The free tier gives 500 a day per model (primary `gemini-3.5-flash-lite`, fallback `gemini-3.1-flash-lite`).
- Records are small (15 to 110 words), so the Worker bundle and the BM25 index stay tiny.

## 5. Rules that always apply
Never a phone number, salary, address or birth date in any file; no AI attribution in commits; feature branches and pull requests; run the checks before each commit; the owner approves live Gemini and Qdrant use and every remote action; UI changes are shown to the owner before they are pushed.
