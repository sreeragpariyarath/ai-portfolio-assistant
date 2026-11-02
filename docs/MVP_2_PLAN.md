# MVP 2 plan: from a working portfolio to a more useful one

Part of [RAG_PROJECT_PLAN.md](RAG_PROJECT_PLAN.md). Written 2 Nov 2026, with the owner's approval of the ideas ("I liked the MVP 2 ideas"). Status: **planned, not started.** Nothing here is built.

## What MVP 1 is
MVP 1 is Phases 0 to 6: a deployed portfolio site where a visitor can open stored cards (Me, Projects, Skills, Fun, Contact) or ask any question and get a streamed, cited, first-person answer from the owner's real records, with private details protected and the quality measured (answer evaluation, retrieval comparison). It runs on free tiers only (Cloudflare Workers, Gemini, Qdrant).

## The goal of MVP 2
A portfolio exists so that a recruiter or hiring manager decides to get in touch. MVP 2 makes the site better at that, and lets the owner learn from real visitors. It is **not** about making the system bigger.

## Start only when
1. Phase 5 is done: the site is deployed and the owner has opened it on a phone.
2. Phase 6 is done: README, evaluation table, demo GIF, and the live and GitHub links are on the CV and LinkedIn.
3. The site has had a few days of real use, so the order below can be changed by what was seen.

## The order, and why

| # | Item | Size | Needs new storage? | Why this position |
| --- | --- | --- | --- | --- |
| 1 | Follow-up questions | M | no | The most visible weakness today: every question is answered alone. |
| 2 | "Paste a job description" match | M to L | no | The most memorable feature for the people the site is for. Reuses the search. |
| 3 | Unanswered-questions log (owner only) | M | yes (D1) | Only useful once real visitors exist. |
| 4 | Thumbs up and down | S | yes (same D1) | Same, and cheap once item 3 exists. |
| 5 | CV download and contact path | S to M | no | Small, but has a privacy decision (see below). |
| 6 | Later: read the CV and write-ups directly (chunked ingestion) | L | no | Only if the hand-written records become a burden. |

Each item is one feature branch and one pull request, and ends with tests, a documented decision, and (where the model's behaviour changes) one evaluation run.

## 1. Follow-up questions
**What the visitor sees:** "Tell me more about that one" or "and what did you use for the backend?" works, because the assistant remembers the last few turns.

**How:**
- The web app sends the last 3 turns (the questions and the answers' plain text, each cut to about 600 characters) with the new question. The Worker stores nothing.
- **The history is untrusted client data.** It goes into the prompt inside its own delimiters, marked as data, never as instructions, and it can never carry records or ids (only retrieved records may be cited).
- **Retrieval:** a short or pronoun-only question ("what about that?") is searched together with the previous question, so the right records are found. Start with that simple rule; an extra Gemini call to rewrite the question is only added if the evaluation shows it is needed.
- The per-visitor rate limit, the size limits and the embedding cache keep working; the cache key is the text actually searched.
- **Tests:** new multi-turn questions in the evaluation set (follow-ups that must resolve "that one", plus attempts to smuggle instructions or records through the history), unit tests for the history validation and the prompt, and a browser check.
- **Done when:** the multi-turn cases pass the same thresholds as D-017 (private leaks 0, injections followed 0), and a pasted history cannot change a refusal.

## 2. "Paste a job description"
**What the visitor sees:** a "Match a job" card with a text box. They paste a job post and get a short, honest comparison: where the owner's real experience matches (with sources), where it matches partly, and what is not in the records.

**How:**
- Input limit about 3,000 characters. The text is data, never instructions.
- Split the post into up to 5 requirements, search the records for each one with the existing hybrid search, then one generation call writes the comparison from those records only.
- **Honesty rules, as strict as the chat:** never claim a skill that no record states; say "not in my records" for gaps; keep team work as team work; cite every claim; refuse nothing private is shown.
- It costs two Gemini calls per use, so it gets its own, stricter rate limit (for example 3 a minute) and a clear "busy" message.
- **Tests:** 6 to 8 sample job posts written for the evaluation, each with the expected matches and the expected gaps (including a post that asks for skills the owner does not have, and a post carrying hidden instructions), plus unit and browser tests.
- **Done when:** the sample posts get no invented skills, the gaps are stated, and the safety thresholds hold.

## 3. Unanswered-questions log (only the owner sees it)
**Why:** it shows what visitors ask that the records cannot answer, so the owner knows what to add.

**How:**
- Store in Cloudflare D1 (free tier; confirm the current limits in the Cloudflare docs before building). Only for replies where the assistant had nothing, or only part: the day (not the time), the question text cut to 300 characters, the behaviour, and the ids that were retrieved. **No IP address, no browser details, no identifiers.**
- Before saving, remove anything that looks like an email address or a phone number, and drop the question if it still does.
- Keep for 90 days, then delete automatically.
- A small owner-only view: an endpoint protected by a secret token (or Cloudflare Access), listing the questions grouped by how often they repeat.
- **A short notice on the page:** "Questions I can't answer may be saved, without any personal information, so I can improve this site."
- **Tests:** redaction, retention, the token check (an unauthenticated request gets nothing), and a check that answered questions are never stored.
- **Decision to record:** exactly what is stored, for how long, and why.

## 4. Thumbs up and down
- A small thumbs control under each answer; one request stores the rating, the behaviour and the cited ids (the question text only for a thumbs-down, with the same redaction as item 3), in the same D1 database.
- The owner reads the pattern, for example which behaviour gets the most thumbs-down, and tunes the instructions with real data instead of guesses.
- Rate-limited, and ignored if it repeats from the same visitor in a short time.

## 5. CV download and contact path
- **A Download CV button** on the Contact card. **Decision needed:** the CV normally contains a phone number, and this project never stores a phone number in any file. So the button should link to a hosted copy (for example a shared document) or to a **version of the CV without the phone number**, not to a file committed to the repository.
- **A contact form** (optional): a Worker route that emails the owner. Spam protection with Cloudflare Turnstile (free), a hidden field, and a rate limit; the message is not stored. The simpler alternative, the email link that already exists, may be enough. Decide after seeing whether visitors use the Contact card.

## 6. Later, only if needed
- Read the CV and project write-ups (PDF or Markdown) directly: split them into chunks, embed and index them, instead of writing records by hand. This also needs a rule for what is private.
- A held-out question set written by someone else, and an optional second model as a judge (D-007), so quality claims do not rest on the author's own questions.
- A reranker, only if the evaluation shows the search misses things (it currently does not at this data size).

## Things MVP 2 will not do
- No accounts, logins or saved chat history: they add cost and privacy duties and do not help a portfolio.
- No microservices or bigger database: the single Worker is the right size.
- No tracking or analytics that identify a visitor.

## Rules that stay the same
- Zero cost: every addition must fit the free tiers (Cloudflare, Gemini about 500 generation calls a day, Qdrant free cluster). Anything that could exceed them gets a limit and a friendly "busy" message.
- Never a phone number, salary, home address or date of birth in any file; private records never reach the model.
- Records and visitor text are data, never instructions.
- One feature branch and pull request per item; tests first; no AI attribution lines in commits; the daily log and a decision entry with each item; live Gemini use only with the owner's go-ahead.
- Keep each pull request open against `main` and merge it before starting the next (stacked pull requests left commits off `main` three times).

## Success measures
- **Item 1:** the multi-turn evaluation cases pass; no safety regressions.
- **Item 2:** the sample posts produce honest matches and gaps with no invented skills.
- **Items 3 and 4:** after two weeks the owner can name two things to add to the records, and one thing to change in the answers, from real data.
- **Overall:** more visitors reach the Contact card or the email link than before (the owner can check this by hand from the questions and any messages; there is no tracking).

## Questions for the owner (answer before the item they belong to)
1. Item 2: should the comparison also offer a downloadable summary, or only show it on the page?
2. Item 3: is 90 days the right retention, and is a notice at the bottom of the page enough?
3. Item 5: which CV copy can be linked (hosted, or one without the phone number)?
4. Item 5: is the email link enough, or is a contact form wanted?
