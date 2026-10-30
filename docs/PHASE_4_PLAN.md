# Phase 4 plan: Next.js chat UI (`apps/web`)

Part of [RAG_PROJECT_PLAN.md](RAG_PROJECT_PLAN.md). Phase 3 finished the API: `POST /api/chat` streams cited answers over server-sent events (SSE) and was checked live (D-017). Phase 4 gives visitors a page to ask questions and read those answers.

**Outcome:** a visitor opens a pure white one-screen home page, stirs the water effect with a cursor or a finger, asks a question, and sees the answer stream in with citation chips that link to the source records, with clear loading, error and "demo busy" states. `pnpm --filter web build` and `pnpm --filter web lint` pass.

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

## Decisions
**Decided with the owner (2026-10-30):** the visual direction (D-018) and the fluid source (D-019), below.

**Still open (answer before task 4.1 and 4.10):**
1. **How the browser reaches the API.**
   - *Option A (proposed):* the browser calls the Worker directly at `NEXT_PUBLIC_API_BASE_URL`. Simple, streams natively. Trade-off: the URL is inlined at build time (changing the Worker URL needs a rebuild), and CORS must match the web origin.
   - *Option B:* a Next route handler proxies to the Worker. Hides the URL and avoids CORS, but adds a hop, and the proxy must pass the stream through without buffering.
   Recommendation: A, since it matches the existing CORS design and the streaming path is simpler. To be recorded as D-020.
2. **Hosting for the web app.** Phase 5 covers deployment; Phase 4 only needs a working local build.
3. **Who builds what.** Proposal: Claude builds the code and tests, the owner reviews the visuals in a real browser and on a real phone (WebGL, touch and glass cannot be fully judged from screenshots).

## Visual direction (decided: D-018)
Reference: a template-based portfolio (`aaabadcode.com`, "Powered by Fastfolio"). We copy the **idea**, not its content, name, avatar, logo or code.
- **Home screen:** pure white, exactly one screen (`100dvh` by `100vw`), **no scrolling**. A centered logo, greeting, headline, avatar, one "Ask me anything" input and five starter chips.
- **Water effect:** moving the cursor stirs coloured paint in water that fades back to white. On phones the **same effect works by dragging a finger**. It runs only on the home screen; once a chat starts the page is plain white and the effect is stopped, which also saves GPU.
- **Glass:** the input, chips and buttons use an Apple "liquid glass" look (refraction plus a highlight edge), not just blur.
- **Identity:** the owner's own name and avatar, and a logo the owner will provide. Replace every reference-site asset. The page text must not claim facts that are not in the dataset.
- **Assets needed from the owner:** logo as SVG (and a PNG fallback), avatar as a transparent PNG or WebP at about 1000 px, and the name and headline text.

## Fluid source (locked: D-019)
**[PavelDoGreat/WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation)** (live demo: https://paveldogreat.github.io/WebGL-Fluid-Simulation/). MIT licence, "Copyright (c) 2017 Pavel Dobryakov". The licence requires keeping that copyright and permission notice in all copies, so the ported file keeps the header and the repo gets a `THIRD_PARTY_NOTICES.md` entry.

What the source is (read from `script.js` on 2026-10-30): about 1,200 lines of plain JavaScript, roughly a third of it GLSL shader strings, one `config` object, WebGL2 with a WebGL1 fallback, no build step and no dependencies except dat.GUI.

**How we use it:** port it to a typed TypeScript module (`apps/web/src/lib/fluid/`) rather than copying the demo file, so it passes our lint and type checks, and wrap it in one client component.

**What must be removed** (all present in the original):
- Google Analytics `ga(...)` calls. `ga` is undefined here, so `getWebGLContext` would throw.
- The promo popup and App Store / Google Play links, and the GitHub, Twitter and Discord buttons.
- dat.GUI and the settings panel (`startGUI`).
- The keyboard shortcuts (P to pause, space for a burst), unless we want a debug mode.
- The network load of the dithering texture `LDR_LLL1_0.png`. Decide in the spike: bundle it if its licence allows, or drop the dithering, or generate noise in the shader.

**What must be added** (missing in the original):
- **Lifecycle:** `start`, `stop` and `destroy`. The original's animation loop never stops and has no cleanup, so we add `cancelAnimationFrame`, removal of every listener, and release of the WebGL resources.
- **Pause rules:** stop drawing when the tab is hidden (`visibilitychange`), when the home screen is left for the chat, and when the visitor prefers reduced motion.
- **Graceful failure:** the original throws if there is no WebGL context or no float texture format. Ours detects that, shows plain white and the rest of the page works.
- **Pixel-ratio cap:** the original multiplies by `devicePixelRatio` every frame; we cap it for GPU cost.
- **Input from the whole window:** the original listens on the canvas, but here the canvas sits **behind** the page content, so movement over the input or chips would be missed. We listen on the home container instead. For touch, the original calls `preventDefault` on the canvas, which would block taps on the input and chips, so drag handling must ignore touches that start on an interactive element and use `touch-action: none` only on the background layer.

**Look on white** (the original is built for a black background; this is the main unknown, settled by the spike):
- The original draws dye onto `BACK_COLOR` (default black) and sets `TRANSPARENT: false`. Its `TRANSPARENT` mode writes alpha as the largest colour channel, which may composite coloured paint over a white page. The bloom and sunrays effects glow on black and may look washed out on white, so they are likely off.
- The default colour is a random hue scaled by 0.15 to keep splats dim on black; on white we want softer but visible colours, so `generateColor` needs tuning.
- Tuning knobs from the config: `DENSITY_DISSIPATION` (how fast colour fades to white), `VELOCITY_DISSIPATION`, `SPLAT_RADIUS`, `SPLAT_FORCE`, `CURL`, `SIM_RESOLUTION` (128) and `DYE_RESOLUTION` (1024; the original already lowers it to 512 on mobile).

**Other options considered and not chosen:** the `webgl-fluid-enhanced` npm package (MIT, 85 stars, has `TRANSPARENT`, `BACK_COLOR`, `HOVER` and a `pause` method but no destroy shown) and small React wrappers. The owner chose the original.

## Liquid glass (open: decided by spike 4.5b)
The libraries found do real refraction with an SVG `feDisplacementMap` through `backdrop-filter: url()`, for example [rizroze/liquid-glass](https://github.com/rizroze/liquid-glass) (MIT). That works fully **only in Chromium** (Chrome, Edge, Android Chrome); Safari, Firefox and iOS fall back to plain blur, and it is untested over a WebGL canvas.
- *A. Library, SVG filter:* quick and CSS-driven, but iPhones would see plain frosted glass.
- *B. Our own refraction in the WebGL pass:* the only thing behind the glass is our own fluid canvas, so a shader can bend that texture inside each glass shape. It looks the same on every browser including iOS, at the cost of custom shader work and passing each glass element's position to the canvas. Text stays normal HTML on top.

## Design
- **Home route** (`app/page.tsx`) stays a Server Component that renders the static shell; one client component owns the home-to-chat state. After the first question the home layout gives way to the chat view, and the fluid stops.
- **Streaming:** `fetch` with `POST`, read `response.body` through a reader, and parse SSE frames by hand (`EventSource` cannot send a POST body). Keep the parser small and unit-tested with recorded frames (the same kind of fixture used in `packages/rag`).
- **States:** idle, streaming, done, error. Map API codes to plain messages: `rate_limited` (wait the `Retry-After` time), `demo_busy` (the demo is busy, try later), network or `timeout` (try again), `prompt_blocked` (rephrase). Never show raw server text.
- **Citations:** each `[record-id]` in the answer becomes a chip. Chips link to a record view, either an anchor on the same page or a small `app/records/[id]` route. The record list comes from the bundled public corpus, so only public records can be linked (the web app must not bundle private data).
- **Starter chips:** Me, Projects, Skills, Fun, Contact each send a fixed question that is answerable from the public dataset.
- **Accessibility:** a labelled input, the streamed answer in an `aria-live="polite"` region (throttled so screen readers are not flooded), keyboard submit, visible focus, no information carried by colour alone, and `prefers-reduced-motion` turns the water off.
- **Responsive:** works at phone width, with no horizontal scroll. The home screen uses `100dvh` so mobile browser bars do not cause scrolling; the chat view scrolls normally.

## Tasks
Each task is one commit with a daily log entry, using the same loop as earlier phases (tests and checks first, descriptive message, no AI attribution, feature branch and draft PR). Run `pnpm --filter web lint` and `pnpm --filter web build` for every task that touches `apps/web`.

### 4.0 Close the open decisions (docs only)
Owner answers the three open decisions. Record the API URL approach as D-020. Owner supplies the logo, avatar and name.

### 4.1 Environment and config
Add `NEXT_PUBLIC_API_BASE_URL` to `.env.example` and `apps/web/.env.local.example` with no secret values, and document it in `docs/SETUP.md`. Confirm `next.config.ts` keeps `cacheComponents` and `partialPrefetching`. Tests: a small module that reads and validates the base URL and fails with a clear message if it is missing.

### 4.2 SSE frame parser
A pure TypeScript module that turns streamed bytes into `{ event, data }` frames, handling chunk boundaries and multi-byte characters. Tests with recorded frames, split at every position, and the error shapes.

### 4.3 Chat client
A typed client `askQuestion(question, { signal })` that returns an async iterable of events and maps HTTP errors to a typed error with a code (never the raw body). Cancellation through `AbortController` when the visitor submits again or leaves. Tests with a mocked `fetch`.

### 4.4 Fluid module (port of the locked source)
Port `script.js` to `apps/web/src/lib/fluid/` as described above: keep the MIT header, remove the analytics, promo, GUI, keyboard and network-texture code, add `start`/`stop`/`destroy`, the pause rules, WebGL failure handling, the pixel-ratio cap and window-level pointer and touch input. Add the `THIRD_PARTY_NOTICES.md` entry. Tests cover the pure parts (resolution maths, colour generation, input routing that ignores interactive elements, the lifecycle calls on a stubbed context). The look itself is reviewed by the owner in a browser.

### 4.5 Home screen and white look
The `100dvh` home layout with the owner's logo, avatar, greeting, headline, input and five chips, over the fluid canvas. Tune the config for a white page (transparent or white compositing, bloom and sunrays off, softer colours, fade speed, splat size) and check pointer and touch drag, no page scroll on a phone, the tab-hidden pause, and `prefers-reduced-motion`. Owner reviews on the low-spec laptop and a real phone.

### 4.5b Liquid glass spike
A throwaway page testing glass approach A and B over the live fluid: how it looks over moving colours, what Chrome, Firefox and an iPhone show, and the GPU cost. Record the outcome as D-021, then apply the winner to the input, chips and buttons.

### 4.6 Chat view
The client component that sends a question, streams the answer, shows the states, turns `[record-id]` citations into chips, and stops the fluid when the home screen is left. Check the Next guides for `'use client'` boundaries and `loading`/`error` files before adding them.

### 4.7 Record view and citation links
Public record pages or anchors generated from the bundled public corpus. Only `visibility: public` records are present. A test confirms no private ID appears in the generated output.

### 4.8 Accessibility and responsive pass
Keyboard-only walk-through, a screen-reader check of the live region, phone width at 360 px, contrast over the coloured water, and reduced-motion behaviour.

### 4.9 Performance check
Measure frame rate on the owner's low-spec laptop and a phone, confirm the effect stops drawing when hidden or left, and check the production bundle size of the fluid module. Record numbers in the daily log.

### 4.10 Verification and record (docs)
Run `pnpm --filter web lint` and `pnpm --filter web build`. Run `pnpm dev:api` with `pnpm dev:web` and ask one answer, one abstain and one injection question in the browser, recording what was seen (no secrets). Mark Phase 4 done in the roadmap and the daily log.

## Live checkpoint
The browser checks in 4.10 call the real API, which calls Gemini for generation. Each check is one generation call from the free quota (500 a day for the default model). That run needs the owner's go-ahead.

## Risks
- **Fluid on white:** the original is tuned for black, so the white look may need shader changes, not only config. Mitigation: do it early (4.4 and 4.5) and review in a browser before building the chat view.
- **Touch input vs. a page full of controls:** blocking default touch behaviour could stop taps on the input. Mitigation: window-level input that ignores interactive elements, tested on a real phone.
- **Glass on iPhones:** the library route is Chromium-only. Mitigation: the 4.5b spike, with option B as the fallback plan.
- **Licence:** the MIT notice must stay with the ported code. Mitigation: keep the header and add the notices file in 4.4.
- **Build-time API URL:** Option A bakes the URL into the build. Mitigation: document the rebuild step in `docs/SETUP.md`.
- **Free quota:** repeated test questions use the daily generation quota. Mitigation: use eval questions and keep checks few.
- **Accessibility regressions:** a streaming region can be noisy and colour behind text can lower contrast. Mitigation: throttle announcements, keep text on blurred or solid surfaces, and test with a screen reader.

## Done when
A visitor can open the white one-screen home page, stir the water with a cursor or finger, ask a question and get a streamed, cited answer. The abstain, refuse and error states read clearly. `pnpm --filter web build` and `pnpm --filter web lint` pass, and the browser checks in 4.10 are recorded.
