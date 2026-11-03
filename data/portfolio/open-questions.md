# Open questions and fixes (updated 2 Nov 2026)

## Answered by the owner on 2 Nov 2026 (and applied)
1. **Carina full-time date:** go with the resume, so **Sep 2025** (joined as an intern in Jul 2025). Applied in `profile-005` and `profile-006`.
2. **Mentoring:** confirmed. Three junior interns: two worked with him on Warvox, and one on the PM tool afterwards. Applied in `profile-007`, now `owner-stated`.
3. **Warvox launch:** show the website addresses with the word "upcoming", **both the staging and the live address**. Waiting for the addresses (see below).
4. **LearnWithHupe refresh windows:** the owner asked me to decide; I read it from the LearnWithHupe code instead of guessing. Subscriptions in a **grace period or billing retry** are re-checked after **6 hours** without verification; **active or trial** ones after **24 hours**; a dropped notification can leave an active subscription wrongly entitled for up to about 25 hours (a deliberate trade-off). Applied in `decision-lwh-002` (now `verified-document`); the evaluation question about it is now an answer case. The "about 87 endpoints" figure was replaced earlier by "more than 120 (about 60 for the admin panel)", from the code.
5. **Carina website migration:** show images and the live address. Waiting for both (see below).
6. **Upthrust:** the owner will send the address and images tonight.
7. **Erris:** trusted publishing is set up. Checked in the repository at `D:\sreerag\erris`: the release workflow has `id-token: write`, publishes with provenance through Changesets and keeps no npm token. Applied in `project-erris-001`. `@erris/express` is still unpublished (its package is at 0.2.0 locally).
8. **Norix:** the start date (Aug 2026) is correct. The owner will refresh the download numbers (6 weekly, 26 monthly on 30 Oct 2026) before the deploy.
9. **Personal tracker app:** stays **private** for now. It is the owner's own tool, with an MCP server, cron jobs and Firebase push notifications that remind him when to follow up on an application; a phase 2 will let other people use it. The private record was updated; it is never indexed or shown.
10. **Source repository of this assistant:** the repository is public (`github.com/sreeragpariyarath/ai-portfolio-assistant`). Added to the project card and to the record `project-portfolio-001`.

## Project pictures (3 Nov 2026)
The owner sent screenshots in `C:\Users\acer\Downloads\images`. They were checked one by one for private details, cropped to portrait 750 by 1000 and saved as `apps/web/public/projects/<id>.webp` (about 22 to 104 KB each):
- **Used:** `learnwithhupe` (the app's subject cards), `warvox` (the logo from the site's hero), `yexora` (the light beams and logo), `upthrust` (the headline from the home page), `erris` (the npm page of `@erris/core`), `hrms` (the demo-data **top two panels only**: the calendar and the leave summary), and `portfolio-assistant` (a screenshot of this site's home page, made from the build).
- **Not used on purpose:** the third panel of the HRMS collage and the second HRMS screenshot show a phone number, a date of birth and home addresses (demo values, but this project keeps those out of every file); the three PM tool screenshots show a client company name, a client project name and code, a colleague's name on a "created by" line, and task titles from a real client project. **`pm-tool` still shows its gradient.** A redacted candidate (the employee dashboard with the task titles and the project name blurred) is ready for the owner to approve; the red profile avatar in it looks like artwork that may not be his, so a different avatar or demo data would be safer.

## Still waiting for the owner (tonight)
- **PM tool picture:** approve the redacted candidate, or send a screenshot made with demo data (the seeding script in the PM repository can create a demo project).
- **Addresses:** Warvox staging and live (shown as "upcoming"), the Carina company website (live), Upthrust, and the site address for the Portfolio link on the contact card. (The pictures arrived; the addresses did not yet.)
- **Carina website:** images, and any measurable result (page-speed scores before and after are much stronger than "faster").
- **Norix:** refresh the download numbers in `project-norix-001` before the deploy.
- **Erris:** update the records when `@erris/express` is published.

## Decisions already made (do not ask again)
- First-person voice for answers (cards and funny lines already use "I"); a small "AI answering from my portfolio" label stays on the page.
- Location: "Indore, India" and "open to relocating" (no city named).
- Company-internal decisions (billing, translation pipeline, progress sync) are included at a high level so recruiters can ask about them.
- Excluded for good: QuickBite, DocuBot, the kids' YouTube idea, the coloring book, any note about leaving Carina.
- Hobbies and interests are included (anime, movies, travel, music and guitar, science). The assistant mentions them only when asked, plus the Fun card.
- Phaser.js is included (he built the LearnWithHupe games).

## Resume fixes (recruiters compare the resume with the portfolio)
- Joining month: **Jul 2025**, not Jun 2025 (his HRMS profile also says 06-Jul-2025).
- Erris: **four** npm packages are published; the fifth (`@erris/express`) is not.
- Yexora: **Framer Motion is not used**; the site uses Three.js (react-three-fiber), Next.js, Tailwind and Lenis.
- Warvox is spelled **Warvox** (not Warox).
- Add: Angular (migrated the Carina website from Angular 16 to 22 with SSR), Norix CLI, Phaser.js games, Firebase push notifications.
- Warvox: the Redis caching claim is not supported by the code (the site caches in the browser with SWR); Redis is in the PM tool backend only. See the record corrections of 2 Nov 2026.

## Optional content for the Fun card
Favourite Marvel or DC character or movie; a favourite artist or song; which anime to start with; whether he wants to write his own funny "I don't know" lines (the 13 current ones are in `apps/web/src/features/chat/abstain-lines.ts`; rules: no names, no digits, no claims, the joke is only about the gap).

## Pictures needed for the project cards
Portrait crops (about 3:4) work best because the cards are tall: LearnWithHupe, the AI portfolio assistant, the PM tool (a redacted or demo-data screenshot, never a real one: it shows client and colleague names), Warvox, Erris, Upthrust, Yexora. **Never use the HRMS or PM tool screenshots as they are**: they contain a phone number, a home address, a date of birth, colleague and client names, and internal addresses. LearnWithHupe store art is fine.
