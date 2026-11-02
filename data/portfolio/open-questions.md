# Open questions and fixes (2 Nov 2026)

Answer these when convenient. Anything unanswered stays marked `unverified` or is left out.

## Facts to confirm
1. **Carina full-time date.** The records say he joined as an intern in Jul 2025 and is now full-time. His resume says full-time from Sep 2025. Confirm the month.
2. **Mentoring three junior interns** (from the resume). Marked `unverified` (`profile-007`).
3. **Warvox launch.** Public launch has not happened (the production address shows "coming soon"; the working site is on staging, whose address is kept out of the records). Add the planned launch date when known.
4. **LearnWithHupe numbers.** "About 87 REST endpoints" comes from his own notes. The 6-hour and 24-hour billing refresh windows are real, but **which case uses which window is not recorded**, so the assistant must say it does not know (there is an eval question for this).
5. **Carina website migration.** Public address of the new site, and any measurable result (page-speed scores before and after). A number is far stronger than "faster".
6. **Upthrust.** Is the site public? If yes, add the address and a picture.
7. **Erris.** Confirm npm trusted publishing is set up (the release workflow has the permissions and no stored token, which fits). Update when `@erris/express` is published.
8. **Norix.** The start date (Aug 2026) is approximate. The download numbers (6 weekly, 26 monthly) are from 30 Oct 2026 and will go stale: refresh them before deploy.
9. **Personal tracker app.** Private by default. Publish it only if he is comfortable showing a job-search tool.
10. **Source repository link for this AI portfolio assistant.** Add it to the project card once the repository is public.

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

## Optional content for the Fun card
Favourite Marvel or DC character or movie; a favourite artist or song; which anime to start with; whether he wants to write his own funny "I don't know" lines (the 13 current ones are in `apps/web/src/features/chat/abstain-lines.ts`; rules: no names, no digits, no claims, the joke is only about the gap).

## Pictures needed for the project cards
Portrait crops (about 3:4) work best because the cards are tall: LearnWithHupe, the AI portfolio assistant, the PM tool (a redacted or demo-data screenshot, never a real one: it shows client and colleague names), Warvox, Erris, Upthrust, Yexora. **Never use the HRMS or PM tool screenshots as they are**: they contain a phone number, a home address, a date of birth, colleague and client names, and internal addresses. LearnWithHupe store art is fine.
