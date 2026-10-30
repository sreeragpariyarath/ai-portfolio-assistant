# Phase 4 plan: Next.js chat UI (`apps/web`)

Part of [RAG_PROJECT_PLAN.md](RAG_PROJECT_PLAN.md). Phase 3 finished the API: `POST /api/chat` streams cited answers over server-sent events (SSE) and was checked live (D-017). Phase 4 gives visitors a page to ask questions and read those answers.

**Outcome:** a visitor opens the page, asks a question, sees the answer stream in with citation chips that link to the source records, and sees clear loading, error and "demo busy" states. `pnpm --filter web build` and `pnpm --filter web lint` pass.

## Read first (done for this plan)
`apps/web/AGENTS.md` says this Next version differs from training data. The version is **Next 16.4.3**. The guides read for this plan are in `apps/web/node_modules/next/dist/docs/01-app/`:
- `02-guides/environment-variables.md`: `NEXT_PUBLIC_` values are **inlined at `next build`** and do not change afterwards. Non-public variables are server-only.
- `01-getting-started/08-caching.md` and the `cacheComponents` config page: with `cacheComponents: true`, caching is opt-in through `use cache`. Dynamic request data (cookies, headers, `connection()`) makes a page dynamic; the chat's data comes from a browser request after hydration, so no cache directive is needed on the page.
- `02-guides/client-side-data-fetching/index.md`: for browser-driven interactions (a question typed by the visitor), the result should wait for a browser request after hydration. That is the pattern used here.
- `01-getting-started/05-server-and-client-components.md`: interactive components need `'use client'`.
- `03-api-reference/03-file-conventions/`: `loading`, `error` and `not-found` files define the loading and error UI per segment.

Before writing any code in Phase 4, re-read the specific guide for each file (for example `loading.md` before adding `loading.tsx`). Do not rely on memory of Next.

## Facts from the API (what the page must handle)
- `POST /api/chat`, JSON body `{ "question": string }`, 1 to 500 characters after trimming, at most 4 KB.
- Success: `text/event-stream` with events `meta` (behavior, retrieved IDs, degraded flag), `token` (text chunks), `done` (citations, dropped citation count, truncation, model) and `error` (code, message, sent only if the stream fails after it started).
- Before streaming starts: 400 (`invalid_question` and similar), 413, 415, 429 `rate_limited` (with `Retry-After`, 10 requests per minute per client), 503 `demo_busy` (`Retry-After: 60`), 503 `timeout`, 503 `upstream_unavailable`, 400 `prompt_blocked`. All return JSON.
- CORS: only the origin in the API's `ALLOWED_ORIGIN` is allowed. The browser sends the request from the Next app, so that origin must match.

## Decisions to confirm with the owner (before coding)
1. **How the browser reaches the API.**
   - *Option A (proposed):* the browser calls the Worker directly at `NEXT_PUBLIC_API_BASE_URL`. Simple, streams natively. Trade-off: the URL is inlined at build time (so changing the Worker URL needs a rebuild), and CORS must match the web origin.
   - *Option B:* a Next route handler proxies to the Worker. Hides the URL and avoids CORS, but adds a hop, and the proxy must pass the stream through without buffering.
   Recommendation: A, since it matches the existing CORS design and the streaming path is simpler.
2. **Hosting for the web app.** Phase 5 covers deployment. Phase 4 only needs a working local build; the hosting choice does not block this phase.
3. **Visual design:** decided with the owner on 2026-10-30; see **Visual direction** below.

## Visual direction (decided with the owner, 2026-10-30; D-018)
Reference: a template-based portfolio (`aaabadcode.com`, "Powered by Fastfolio"). We copy the **idea**, not its content, name, avatar, logo or code.
- **Home screen:** pure white, exactly one screen (`100dvh` by `100vw`), **no scrolling**. A centered logo, greeting, headline, avatar, one "Ask me anything" input and five starter chips.
- **Water effect:** moving the cursor stirs coloured paint in water that fades back to white. On phones the **same effect works by dragging a finger**. It runs only on the home screen; once a chat starts the page is plain white and the effect is stopped, which also saves GPU.
- **Glass:** the input, chips and buttons use an Apple "liquid glass" look (refraction plus a highlight edge), not just blur.
- **Identity:** the owner's own name and avatar, and a logo the owner will provide. Replace every reference-site asset. The page text must not claim facts that are not in the dataset.
- **Assets needed from the owner:** logo as SVG (and a PNG fallback), avatar as a transparent PNG or WebP at about 1000 px, and the name and headline text.

### Findings from the library search (README claims, not yet tested here)
| Need | Option | Licence | Notes |
|---|---|---|---|
| Fluid | [PavelDoGreat/WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) | MIT | 16.8k stars, the origin of most wrappers, "works even on mobile"; a demo script, not a package, so we would wrap it in our own small component |
| Fluid | [webgl-fluid-enhanced](https://github.com/michaelbrusegard/WebGL-Fluid-Enhanced) | MIT | npm package with TypeScript types, `TRANSPARENT`, `BACK_COLOR` and `HOVER` options, a `pause` method and a Next.js example; 85 stars; the README shows an older version's docs, so check the current docs |
| Fluid | React wrappers (`fluid-pointer-react`, `@ar-dacity/ardacity-splash-cursor`, `react-webgl-fluid`) | MIT (one unconfirmed) | tiny user bases; avoid unless the spike shows a clear gain |
| Glass | [rizroze/liquid-glass](https://github.com/rizroze/liquid-glass) and similar (`liquid-glass-component`, `@liquidglass/react`) | MIT (checked for rizroze) | SVG `feDisplacementMap` through `backdrop-filter: url()`: full refraction **only in Chromium** (Chrome, Edge, Android Chrome); Safari, Firefox and iOS fall back to plain blur. Untested over a WebGL canvas |

**Two ways to get liquid glass, to be decided by the spike (4.0b):**
- *A. Library, SVG filter:* quick and CSS-driven, but refraction is Chromium-only, so iPhones would see plain frosted glass.
- *B. Our own refraction in the WebGL pass:* the only thing behind the glass is our own fluid canvas, so a shader can bend that texture inside each glass shape. It looks the same on every browser including iOS, at the cost of custom shader work and passing each glass element's position to the canvas. Text stays normal HTML on top.

## Design
- **One page** (`app/page.tsx` stays a Server Component that renders static shell text), with one client component `ChatPanel` (`'use client'`) that owns the input, the streamed answer and the states.
- **Streaming:** `fetch` with `POST`, read `response.body` through a reader, and parse SSE frames by hand (`EventSource` cannot send a POST body). Keep the parser small and unit-tested with recorded frames (the same kind of fixture used in `packages/rag`).
- **States:** idle, streaming, done, error. Map API codes to plain messages: `rate_limited` (wait the `Retry-After` time), `demo_busy` (the demo is busy, try later), network or `timeout` (try again), `prompt_blocked` (rephrase). Never show raw server text.
- **Citations:** each `[record-id]` in the answer becomes a chip. Chips link to a record view, which can be a simple anchor to a section on the same page or a small `app/records/[id]` route. The record list comes from the bundled public corpus, so only public records can be linked (the web app must not bundle private data).
- **Suggested questions:** a few fixed examples from the eval set that are public-safe, for the empty state.
- **Accessibility:** a labelled input, the streamed answer in an `aria-live="polite"` region (throttled so screen readers are not flooded), keyboard submit, visible focus, and no information carried by colour alone.
- **Responsive:** works at phone width, with no horizontal scroll. The home screen uses `100dvh` so mobile browser bars do not cause scrolling; the chat view scrolls normally.

## Tasks
Each task is one commit with a daily log entry, using the same loop as earlier phases (tests and checks first, descriptive message, no AI attribution, feature branch and draft PR).

### 4.0 Confirm and decide (docs only)
Owner answers the three decisions above. Record the API URL approach in `docs/DECISIONS.md` as D-019.

### 4.0b Visual spike: fluid and glass (Claude; owner reviews in the browser)
A throwaway page on a branch, before any real UI, answering these with evidence (like the Phase 1 import spike):
1. Which fluid source is used: `webgl-fluid-enhanced`, or the MIT reference code wrapped by us. Checks: pure white at rest, colour fades back to white, pointer and **touch drag** both stir it, `touch-action` stops page scrolling during a drag, it runs as a Next 16 client component, it pauses when the tab is hidden or the chat starts, and it stays smooth on the owner's low-spec laptop and a real phone.
2. Which glass approach (A or B above). Checks: it looks right over the moving colours, what an iPhone and Firefox show, and the GPU cost.
3. `prefers-reduced-motion`: the effect is off, or reduced to a gentle fade.
Record the outcome by amending D-018, then continue with 4.1.

### 4.1 Environment and config (Claude)
Add `NEXT_PUBLIC_API_BASE_URL` to `.env.example` and `apps/web/.env.local.example` with no secret values. Document it in `docs/SETUP.md`. Confirm `next.config.ts` keeps `cacheComponents` and `partialPrefetching`. Tests: a small module that reads and validates the base URL and fails with a clear message if it is missing.

### 4.2 SSE frame parser (Claude)
A pure TypeScript module that turns streamed bytes into `{ event, data }` frames, handling chunk boundaries and multi-byte characters. Tests with recorded frames, split at every position, and the three error shapes.

### 4.3 Chat client (Claude)
A typed client `askQuestion(question, { signal })` that returns an async iterable of events and maps HTTP errors to a typed error with a code (never the raw body). Cancellation via `AbortController` when the visitor submits again or leaves. Tests with a mocked `fetch`.

### 4.4 Chat panel UI (Claude or owner)
`ChatPanel` as a client component: input, submit, streamed text, state handling, the citation chips and the suggested questions. Stock components only, styled with the existing Tailwind v4 setup. Check the Next guides for `'use client'` boundaries and `loading`/`error` files before adding them.

### 4.5 Record view and citation links (owner or Claude)
Public record pages or anchors, generated from the bundled public corpus. Only `visibility: public` records are present. A test confirms no private ID appears in the generated output.

### 4.6 Accessibility and responsive pass (owner)
Keyboard-only walk-through, a screen-reader check of the live region, phone width at 360 px, and contrast checks in light and dark mode (if the page supports both).

### 4.7 Verification and record (docs)
Run `pnpm --filter web lint` and `pnpm --filter web build`. Run `pnpm dev:api` with `pnpm dev:web` and ask one answer, one abstain and one injection question in the browser, recording what was seen (no secrets). Mark Phase 4 done in the roadmap and the daily log.

## Live checkpoint
The browser checks in 4.7 call the real API, which calls Gemini for generation. Each check is one generation call from the free quota (500 a day for the default model). That run needs the owner's go-ahead.

## Risks
- **Build-time API URL:** Option A bakes the URL into the build. Mitigation: document the rebuild step in `docs/SETUP.md`.
- **Streaming through a proxy:** Option B could buffer the stream. Mitigation: avoid it unless the owner needs the URL hidden.
- **Free quota:** repeated test questions use the daily generation quota. Mitigation: use the eval questions and cached answers where possible.
- **Accessibility regressions:** a streaming region can be noisy. Mitigation: throttle announcements and test with a screen reader.

## Done when
A visitor can ask a question on the page and get a streamed, cited answer. The abstain, refuse and error states read clearly. `pnpm --filter web build` and `pnpm --filter web lint` pass, and the browser checks in 4.7 are recorded.
