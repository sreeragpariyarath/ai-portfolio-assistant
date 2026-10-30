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
**Decided with the owner (2026-10-30):** the visual direction (D-018), the fluid source (D-019), hosting on Cloudflare, and the work split: **Claude builds the code and tests; the owner tests in a real browser and on a real phone.** The owner supplies the logo, avatar and name for task 4.5.

**Decided (D-020, accepted 2026-10-30): one Cloudflare Worker serves both the web app and the API.**
- The web app is built as a **static export** (`output: "export"`): plain files, no Next server. The home page, chat view and record pages are static shells; the chat happens in the browser, which calls the API.
- The existing API Worker serves those files through its static assets setting (`assets.directory`) and runs its code only for `/api/*` (`run_worker_first`).
- The browser calls the relative path `/api/chat`: same origin, so **no CORS in production** and **no API URL baked into the build**. For local development the web app (port 3000) calls the Worker (port 8787) through `NEXT_PUBLIC_API_BASE_URL=http://localhost:8787`, using the CORS support already built.

| Option | CORS | API URL baked in at build | Next server needed on Cloudflare | Notes |
|---|---|---|---|---|
| A. Browser calls a separately hosted Worker | needed | yes | depends on the web host | simplest code, but two hosts and a rebuild to change the URL |
| B. Next route handler proxies to the Worker | no | no | **yes** | needs vinext or OpenNext on Workers; extra hop; must pass the stream through unbuffered |
| **C. One Worker: static export plus `/api/*` (recommended)** | **no (production)** | **no** | **no** | web and API deploy together; static export limits (below) |

Facts behind the recommendation (checked 2026-10-30):
- Cloudflare now recommends **vinext** (a Vite plugin that reimplements the Next API, "in beta") for Next.js on Workers, with OpenNext as a fallback. Next's own docs say Cloudflare's adapter is not yet a verified adapter. Option C avoids depending on either.
- Workers static assets: a request that matches a file is served without running Worker code, `run_worker_first` can be limited to `/api/*`, and "requests to static assets are free and unlimited". Requests to `/api/*` count as Worker requests, so the Free plan's request limit applies to chat calls only.
- Next's static export does not support: route handlers that rely on the request, Server Actions, rewrites, redirects, headers, `proxy`, ISR, draft mode, intercepting routes, or the default image loader. This plan uses none of them. Dynamic routes need `generateStaticParams` (the record pages will have it).

**Checks (1 done; 2 to 4 inside task 4.1):**
1. **Done:** static export with `cacheComponents` does **not** work: a throwaway copy of `apps/web` built with `output: "export"` (Next 16.4.3, 2026-10-30) failed with `Invariant: PPR cannot be enabled in export mode` while `cacheComponents` was `true`, whatever `partialPrefetching` was set to, and built cleanly (with `out/index.html`) once both were `false`. So 4.1 turns both flags off.
2. `next/image` with `unoptimized` (or plain `img`), because the default image loader is not supported in a static export.
3. **Done:** Cloudflare's limits page gives 20,000 static files per version and 25 MiB per file on the Free plan, and 100,000 Worker requests a day.
4. How a missing path behaves: `not_found_handling: "404-page"` so unknown pages get the web app's 404 instead of the API's JSON 404.

**Cost of option C:** web and API deploy together (one web build, then one `wrangler deploy`), so a web-only change redeploys the Worker. The API's Vitest pool reads `wrangler.jsonc`; an `assets.directory` that does not exist could break the API tests and CI, so 4.1 must handle that (for example a committed placeholder folder, or building the web app first in CI).

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

### 4.0 Close the open decision (done)
The owner accepted option C on 2026-10-30 (D-020). The logo, avatar and name arrive by task 4.5.

### 4.1 Environment, static export and Worker assets (done)
- The four checks are recorded in D-020 (static export, flags off, file limits, 404 handling and the routing check with `wrangler dev`).
- `NEXT_PUBLIC_API_BASE_URL` is documented in `apps/web/.env.local.example` and `docs/SETUP.md`: empty in production, `http://localhost:8787` for local development.
- `apps/web/next.config.ts` uses `output: "export"` with `cacheComponents` and `partialPrefetching` off, keeping the Tailwind turbopack rule.
- `apps/api/wrangler.jsonc` serves `../web/out` with `run_worker_first: ["/api/*"]` and `not_found_handling: "404-page"`. The API suite passes with and without the export folder.
- `apps/web/src/lib/api-base-url.ts` (pure, tested) validates the base URL (empty means same origin; origin only, never echoes the rejected value) and `config.ts` reads it once, because Next inlines `NEXT_PUBLIC_` values only for a literal `process.env.NAME`.
- **Testing convention for the rest of Phase 4:** web library code is plain erasable TypeScript with `.ts` import extensions, with tests beside it. The root `pnpm test:scripts` runs them (`apps/web/src/**/*.test.ts`) and the root `tsc` checks them. `apps/web/tsconfig.json` allows `.ts` imports.
- CI: the web job fails if `apps/web/out/index.html` or `404.html` is missing.

### 4.2 SSE frame parser (done)
- `apps/web/src/lib/sse.ts`: `createSseParser()` turns streamed bytes into `{ event, data }` frames by the SSE line rules (LF, CRLF and CR endings including a CRLF split across chunks, comments, multi-line `data`, one leading space dropped, BOM dropped, no frame without `data`). `finish()` reports `incomplete` when a cut-off stream left bytes that never formed a frame, so the chat client can show an error instead of a half answer.
- `apps/web/src/lib/chat-events.ts`: `decodeChatEvent(frame)` returns a typed `meta`, `token`, `done` or `error` event, `null` for an event name it does not know (so the server can add events), and throws `MalformedEventError` for a known event with a bad payload. The error message never contains the payload, which is server text.
- Tests use the server's exact framing and cut a stream with multi-byte characters (accents, Japanese, an emoji) at **every byte position**, one byte at a time, and as one chunk, expecting identical frames.

### 4.3 Chat client (done)
`apps/web/src/lib/chat-client.ts`: `askQuestion(question, { signal, url, fetch })` is an async generator of `ChatEvent`s built on the 4.2 parser.
- Checks the question first (trimmed, 1 to 500 characters counted like the API's `.length`) so a bad one does not use a rate-limited request.
- Sends one `POST` with the trimmed question as JSON. HTTP errors become a `ChatClientError` with a code, the status and `retryAfterSeconds` (whole seconds only). The API's own codes win when this client knows them; otherwise the status decides (429 rate limited, 413 too large, 400 or 415 bad request, 5xx unavailable). A non-JSON body such as an HTML error page falls back to the status.
- A 200 that is not an event stream, a malformed event, a stream that ends without `done` or `error`, a cut-off frame and a connection that dies mid-answer are all errors (`bad_response` or `stream_interrupted`), and the events already received were already yielded, so the page can keep the text shown.
- A server `error` event is yielded like any other and ends the stream; `normalizeErrorCode` maps its code to one the client knows.
- **Server wording is never shown.** Every `ChatClientError` message comes from a fixed table (`friendlyMessage`), with the wait time added for `rate_limited` and `demo_busy`.
- Cancelling (`signal` aborted) passes the browser's `AbortError` through, not a `ChatClientError`; `isAbortError` lets the page tell them apart. The connection is released after `done`, `error`, an early `break` or a failure.
- Tests use real `Response` and `ReadableStream` objects with a mocked `fetch`: no network, no Gemini.

### 4.4 Fluid module (done)
`apps/web/src/lib/fluid/` is the typed port of the locked source (D-019), with the MIT header on every ported file and an entry in `THIRD_PARTY_NOTICES.md`.
- `shaders.ts`: the 19 GLSL programs extracted from the original by a script (not retyped), minus the checkerboard backdrop.
- `engine.ts`: the WebGL side. Setup failures are typed (`no-webgl`, `no-float-textures`, `shader-error`, `context-lost`); replaced framebuffers are deleted; `dispose()` frees everything and gives the context back. Rendering is always transparent: the display shader writes alpha as the strongest channel, so empty water shows the white page and the paint fades back into it.
- `index.ts`: `createFluid(canvas)` returns `{ ok: true, fluid }` or `{ ok: false, reason }`, never throws for a missing GPU. `fluid.start()`, `stop()`, `destroy()`, `splat()`. Pauses while the tab is hidden, waits for a canvas with no size, caps the pixel ratio at 1.5, gives up cleanly if the GPU context is lost, and does nothing for visitors who prefer reduced motion.
- `input.ts`: pointer events on the window. A mouse stirs by **moving** (the reference page's behaviour; the demo needed a button press); touch and pen stir while down. A touch that starts on an input, button or link is ignored, so taps still work. Nothing calls `preventDefault`.
- `math.ts`, `pointers.ts`, `config.ts`: pure helpers and the settings, with the demo's names.
- **Rule for the page code (4.5):** use a **new canvas element for every `createFluid` call**. `destroy()` releases the GPU context and a canvas can never get a working one again. React Strict Mode (on by default in the Next App Router, development only) runs an effect, cleans it up and runs it again on the same element, so create the canvas inside the effect and remove it in the cleanup. The module detects a reused canvas and reports `context-lost` with a message saying so.
- **Checked in a real browser** (a temporary lab page, not committed, with a scripted mouse path): the effect renders and looks like paint stirred through water on pure white, and the paint fades back to white after a stir. The original demo was run in the same browser first as a control. This found the Strict Mode bug above, which the unit tests could not.
- **Look settings:** the reference page's real settings, read from its published JavaScript (see D-019): dim colours (0.15) that change about ten times a second while the pointer moves, slow fade (0.5), low pressure (0.1), a little curl (3), shading on, no bloom or sunrays. An earlier attempt with the values from a control-panel screenshot looked too vivid, single-coloured and flat; the owner caught it on a real screen.
- Tests (no browser, no GPU): 61 tests cover the maths, config, pointer state, input routing and, with a stub WebGL context, the whole lifecycle: failures, start and stop, pausing, resizing, stirring by mouse and by touch, teardown, and context loss.

### 4.5 Home screen and white look (built; the owner still has to judge the water effect on real devices)
Built: `apps/web/src/components/home-screen.tsx` and `fluid-background.tsx`, `src/lib/site.ts` (the wording), `public/logo.svg`, `public/avatar-placeholder.svg`, and a light-only `globals.css` with the **Segoe UI** font stack.
- **Layout (checked in a real browser at phone, short-laptop and desktop sizes):** pure white, exactly one screen (`100dvh`), no scrolling; logo tile, "Hey, I'm sreerag 👋", the headline "AI Engineer", the avatar, the "Ask me anything…" pill, five chips (Me, Projects, Skills, Fun, Contact) and a very faint oversized "sreerag" behind. Everything that has height (headline, avatar, chips, gaps) is sized from the screen height with `clamp(..dvh..)`. A first version with fixed sizes overflowed on a 640 px-tall screen (logo off the top, chips cut off), which is a common laptop height; the final version fits at 780, 640 and even 440 px of height, and at 360 px wide.
- **Water:** `FluidBackground` creates a **new canvas inside the effect** (the Strict Mode rule from 4.4), ignores the pointer so the controls keep working, and the home `main` has `touch-none` so a finger drag stirs the water instead of scrolling. If WebGL is missing, or the visitor prefers reduced motion, the page just stays plain white. The canvas being present in the page confirmed in a real browser that the effect starts.
- **Behaviour for now:** typing works, a chip fills the input with its question, and the send button is **disabled** until the chat exists (4.6 passes `onAsk`; then a chip or the button starts the chat directly, as in the design).
- **Logo:** the owner's SVG (a 52 KB vector trace, 522 black paths) was scanned first (no scripts, handlers, links or images) and copied with a `viewBox` added so it scales.
- **Avatar:** a temporary placeholder drawn for this project (a simple vector bust). Replace it with the real image (transparent PNG or WebP) by swapping one file.
- **Removed:** the stock create-next-app page and its five sample SVGs, the Geist fonts (also removes a build-time download from Google Fonts), and dark mode (the design is pure white).
- **Not yet verified:** the feel of the water by a real hand (mouse hover, finger drag), smoothness on the owner's low-spec laptop and a phone, and the colour and fade tuning (D-019: overlapping hues add up to white; faint ghosting after a stir). The unit tests cannot cover these.

### Open questions for the owner (from 4.5)
1. **Whose facts does the assistant tell?** The page now says "Hey, I'm sreerag", but the answers come from the synthetic dataset about the persona "Alex Morgan" (D-008: fictional, no real personal data). Asking "Who are you?" will answer about Alex. Options: keep the dataset as a demo and say so on the page, rename the persona to sreerag in the dataset (still fictional or only facts the owner is happy to publish), or replace the dataset with the owner's real public details (a data decision with privacy rules).
2. **Headline.** Decided: "Full Stack Engineer" (D-024).
3. **Fun and Contact chips.** The dataset has nothing about hobbies or contact details (and contact details are private by rule), so those two chips lead to an honest "I don't have that" answer. Keep, or change the labels or questions?
4. **Avatar.** The placeholder stays until the owner supplies an image.

### 4.5b Liquid glass spike (done: option A, D-021)
In-house SVG displacement filter through `backdrop-filter: url()` (`src/components/liquid-glass.tsx`, maths in `src/lib/liquid-glass.ts` with tests). Refraction in Chromium browsers; frosted glass with the same rim in Safari, Firefox and iOS. Applied to the logo tile, input pill and chips. At the same time the home screen was scaled down to the reference's proportions after the owner found it too big (input about 29rem wide, chips about 72 px tall on a 966 px screen, headline up to 4rem, avatar up to 15rem), still sized from the screen height.

### 4.6 Chat view (done)
- `src/components/portfolio-app.tsx`: the page. Home screen until the first question, then the chat. Leaving home unmounts the water effect (it stops and gives the GPU back). One answer at a time: a new question cancels the request still running; leaving the page cancels it too.
- `src/components/chat-view.tsx`: the conversation in the reference layout (small avatar at the top, which goes back home; question bubbles; answers streaming in with typing dots before the first words; quick-question pills that can be hidden; the liquid-glass input at the bottom, whose send button becomes a stop button while an answer streams). It follows new text only while the visitor is near the bottom. Citations show as small numbers with a "Sources" row once the answer is done; 4.7 turns them into links. Answers that are not plain answers get a short note ("Partly supported by my records", "Not in my records", "I can't share that"); errors show a fixed friendly sentence, never the server's words.
- `src/lib/chat-state.ts` (a reducer: ask, meta, token, done, server error, client failure, stop, reset; late events from a replaced answer are ignored) and `src/lib/citations.ts` (splits `[record-id]` out of the text and numbers them), both pure and tested.
- Checked in a real browser with a fake API (no Gemini calls): a streamed answer with three citations, the "demo busy" message with the wait time, and a stream cut off mid-answer (the text stays, with "The answer was cut off").

### 4.7 Record view and citation links (done)
- `pnpm corpus:build` now writes the same public-only bundle to `apps/api/src/generated/` and `apps/web/src/generated/` (every record passes the same privacy guard as ingestion), and `pnpm corpus:check`, now a CI step, fails if either copy is stale.
- `src/app/records/[id]/page.tsx`: one static page per public record (`generateStaticParams`, `dynamicParams = false`, so any other id is a 404): type, title, content, status, dates, a link to the related project, and a note that this is demo data while the fictional dataset is in use (D-022).
- In the chat, the citation numbers and the "Sources" chips link to these pages in a new tab, so the conversation stays put.
- `src/lib/records.ts` (path, lookup, labels, dates) is pure and tested. A test checks the web bundle holds every public record and no private id or content, and a scan of the whole built site found the private record nowhere.

### 4.8 Accessibility and responsive pass
Keyboard-only walk-through, a screen-reader check of the live region, phone width at 360 px, contrast over the coloured water, and reduced-motion behaviour.

**Coding and automated checks complete (2026-10-30); owner device checks pending.** Visible input focus, focus on entering/leaving chat and after Stop, keyboard-scrollable history, one completion/error announcement channel, heading order, pinch zoom, long-word wrapping, darker text on the glass (contrast over the water is still an owner check), dynamic reduced-motion handling, and the white custom 404 are implemented. Short viewports and enlarged text can scroll instead of clipping controls; the normal home layout still fits one screen (D-023).

`pnpm --filter web build`, then `pnpm test:web:a11y` runs Playwright and axe against the static export with a local mock SSE API. First install Chromium with `pnpm exec playwright install chromium`. CI runs this too. Coverage includes keyboard focus, quiet streaming, completed answers, errors, Stop, source tabs, 360×640 and 320×300 layouts, long strings, 200% text, record/404 pages and changing reduced-motion settings. No Gemini or Qdrant calls.

The owner has tested the page on a phone and it works. Still manual: listen with an actual screen reader, and check Safari's glass fallback on an iPhone. Automated ARIA/axe checks are not a native screen-reader or physical-device certification. Performance measurements remain task 4.9 and the approved live API run remains 4.10.

### 4.9 Performance check (done for desktop; a phone reading is optional and can wait for the deployed site)
**Download size** (`pnpm web:size`, production export, gzipped): the home page loads **197 KB of JavaScript**, of which about 165 KB is React and Next. Our own code (the water effect, the glass and the chat) is one chunk of **22.6 KB**. CSS is 5.4 KB and the two images 12 KB (the traced logo is 11 KB). The command can also fail a build over a size limit (`--max-gzip-kb=N`); no limit is set yet.

**Behaviour, checked in a real browser** (headless Chromium driven by Playwright against the production export with the mock API, no Gemini calls): while the tab is hidden the water makes **0 draw calls** and resumes when the tab is visible; opening the chat **removes the water canvas** and drawing stays at 0; going back home creates a new canvas and drawing resumes. One frame is 28 draw calls (the 20 pressure steps plus the rest).

**Frame rate, measured by the owner on a real screen** (1920×957 at 100% scaling, water at full resolution, stirring the mouse around): the readout stays mostly at **60 fps**, dips to about **56 fps** now and then, with a **worst frame of 33 ms** (one frame took two refreshes), and the owner saw no lag or stutter. The automation browser on the build PC renders in software (SwiftShader), so its 7 to 14 fps says nothing about real hardware and is not used. The settings are the reference page's own (simulation 128, dye 1440), with our pixel ratio capped at 1.5.

**Decision:** no automatic quality drop is needed for desktop. A phone reading is optional for now: the easier way to take it is on the deployed site in Phase 5 (open the real address with `?perf`), with no network setup. If a phone turns out slow, the plan is an automatic quality drop (smaller dye texture, shading off).

**The measuring tool:** add `?perf` to the address and a small readout shows the page's frame rate, the worst frame in the last second, the window size and pixel ratio (nothing runs without the flag). See `docs/SETUP.md` for how to run it on the laptop and the phone. 

### 4.10 Verification and record (docs)
Run `pnpm --filter web lint` and `pnpm --filter web build`. Run `pnpm dev:api` with `pnpm dev:web` and ask one answer, one abstain and one injection question in the browser, recording what was seen (no secrets). Mark Phase 4 done in the roadmap and the daily log.

### 4.11 Rich cards and stored chip content (planned, after 4.10; before the switch to the owner's real data)
Requested by the owner from the reference page: a profile card, a swipeable project carousel whose cards open a detail pop-up, and a contact card with an email link and social links.

Decided with the owner (2026-10-30):
- **Pressing a chip shows stored content instantly, with no Gemini call.** Me: a profile card and a stored intro message. Projects: swipeable project cards; pressing one opens a pop-up with its details, tags, links and image. Skills: grouped skill tags. Contact: a card with the email (approved for display) and links (LinkedIn, GitHub, portfolio); **a phone number is never shown or stored**. Fun: to be decided.
- **Typed questions still go to the assistant** (retrieval and Gemini as now). When an answer cites a project, its card can be shown too.
- **Images:** the owner will supply project images; placeholders until then.
- **Data:** optional fields (tagline, period, tech tags, links, image) are added to the records, with dummy values now and the real ones at the real-data switch (D-022).
- **Order:** finish 4.10, then these cards, then the real-data switch, then Phase 5 (deployment).

Still open: the wording of the stored messages, what the Fun chip shows, and whether a typed "who are you" should also use the stored message (the default is no, so the assistant stays honest about what it retrieves). The pop-up needs keyboard focus kept inside it, Esc to close, and a proper name for screen readers, tested in the existing Playwright and axe suite. The cards copy the layout idea of the reference page, never its content, photos or code.

## Live checkpoint
Because the chips will show stored content (4.11), the 4.10 checks use **typed questions**, the ones that really reach Gemini: a normal question, a question whose answer is not in the records (to see the honest "not in my records" answer) and a trick question that tries to make the assistant ignore its rules or reveal something private (to see it refuse). The browser checks in 4.10 call the real API, which calls Gemini for generation. Each check is one generation call from the free quota (500 a day for the default model). That run needs the owner's go-ahead.

## Risks
- **Fluid on white:** the original is tuned for black, so the white look may need shader changes, not only config. Mitigation: do it early (4.4 and 4.5) and review in a browser before building the chat view.
- **Touch input vs. a page full of controls:** blocking default touch behaviour could stop taps on the input. Mitigation: window-level input that ignores interactive elements, tested on a real phone.
- **Glass on iPhones:** the library route is Chromium-only. Mitigation: the 4.5b spike, with option B as the fallback plan.
- **Licence:** the MIT notice must stay with the ported code. Mitigation: keep the header and add the notices file in 4.4.
- **Static export limits:** no server features in the web app. Mitigation: the plan needs none; the four checks in 4.1 catch surprises early.
- **`cacheComponents` with static export:** confirmed incompatible by a test build. Mitigation: both flags are turned off in 4.1; the app does not use them.
- **Free plan request limit:** chat calls count as Worker requests, and over the limit they get 429 instead of the static page. Mitigation: the API already rate-limits per client; static pages are free and unlimited.
- **Deploying web and API together:** a web-only change redeploys the Worker. Mitigation: acceptable for a portfolio; revisit in Phase 5 if it gets in the way.
- **Free quota:** repeated test questions use the daily generation quota. Mitigation: use eval questions and keep checks few.
- **Accessibility regressions:** a streaming region can be noisy and colour behind text can lower contrast. Mitigation: throttle announcements, keep text on blurred or solid surfaces, and test with a screen reader.

## Done when
A visitor can open the white one-screen home page, stir the water with a cursor or finger, ask a question and get a streamed, cited answer. The abstain, refuse and error states read clearly. `pnpm --filter web build` and `pnpm --filter web lint` pass, and the browser checks in 4.10 are recorded.
