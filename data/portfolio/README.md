# Real portfolio data (draft, written 2 Nov 2026 on the laptop)

This folder holds Sreerag's **real portfolio content**, ready for review. It replaces the fictional "Alex Morgan" dataset (D-008 is superseded by D-029; see `docs/REAL_DATA_HANDOFF.md` for the plan to switch the app over).

**Nothing in this folder is used by the app yet.** The tools (`pnpm corpus:build`, `pnpm ingest`, `pnpm eval:*`) still read the synthetic files in `data/knowledge/` and `evals/`. Switching over is a planned, reviewed step.

## Files
| File | What it is |
| --- | --- |
| `records.draft.v1.json` | **78 knowledge records** (77 public, 1 private) in the repo's record format. This is the source the assistant answers from. Edit this file. |
| `eval-questions.draft.v1.json` | **66 development questions** with expected behaviour and evidence ids, same shape as `evals/retrieval-eval.v3.json`. 53 answer, 4 qualify, 4 abstain, 5 refuse. |
| `portfolio-source.md` | A readable copy of the records, grouped by topic (generated; do not edit). |
| `cards-content.draft.md` | The content for the stored cards (profile, projects, skills, contact, a new Fun card), ready to paste into `portfolio-cards.ts`. |
| `open-questions.md` | What is still unverified or undecided, and the resume fixes. |

## How the records are written
- **Third person, plain facts.** The assistant turns them into first person when it answers (D-029).
- **One focused fact cluster per record**, about 50 words on average, so retrieval finds the right record and citations are precise.
- **Status per record** (`verificationStatus`): `verified-public` (checked on a public page, store, npm or repository), `verified-document` (a document the owner showed), `owner-stated` (the owner's own account, not independently checked), `unverified` (needs confirming; the assistant must say so). The assistant's prompt already tells it to flag `unverified` records.
- **Project status** (`status`): `shipped`, `planned` (not publicly launched, for example Warvox), `prototype`.
- **Private records** (`visibility: "private"`) are never indexed or shown. The only one here is a personal tracker app (publishing it would show he is job hunting, so it is off until the owner decides).

## Hard privacy rules (checked by the generator, and to be re-checked before any index or push)
Never in any file: a phone number, a salary, a home address, a date of birth, a colleague's name, a client's name, an internal company address, or anything under NDA. Company-internal systems (HRMS, PM tool, billing) are described **at a high level only**. The email address, LinkedIn, GitHub and portfolio link are public on purpose.

A quick re-check from the repo root: no run of 10 or more digits except the public App Store listing id, and no other email address. Then read the diff by eye for any colleague name, client name, internal company address, staging address or home address (do not keep a list of those words in the repo: the list itself would leak them).
```bash
node -e "const t=require('fs').readFileSync('data/portfolio/records.draft.v1.json','utf8');console.log((t.replace(/idd{10}/g,'').match(/d{10,}/g)||[]), (t.match(/[w.+-]+@[w.-]+/g)||[]))"
```
It must print two empty lists, apart from the owner's own public email address.

## Where the facts came from
The owner's own words in conversation (2 Nov 2026), his resume and full-profile notes, and public pages checked on 30 Oct 2026: the npm pages for Erris and Norix, the Erris and Yexora repositories (read-only), the LearnWithHupe store listings, the Yexora site, and the Warvox "coming soon" page. Git histories of company repositories were **not** available, so company-project roles are the owner's account.
