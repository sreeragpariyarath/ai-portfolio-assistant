import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(n => n.target) }))).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  // Catch any accidentally configured remote API before it can use quota.
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("keyboard focus, quiet streaming, completed answer and sources", async ({ page, context }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const input = page.getByRole("textbox");
  await expect(input).toBeFocused();
  await expect(input).toHaveCSS("outline-style", "none");
  await expect(page.locator(".question-pill")).toHaveCSS("outline-style", "solid");
  await expect(page.locator(".question-pill")).toHaveCSS("outline-color", "rgb(1, 113, 227)");
  await input.fill("Tell me about the booking app");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox")).toBeFocused();
  await expect(page.getByRole("textbox")).toHaveCSS("outline-style", "none");
  await expect(page.locator(".question-pill")).toHaveCSS("outline-color", "rgb(1, 113, 227)");
  await expect(page.getByText("A completed answer", { exact: false })).toBeVisible();
  await expect(page.locator('main [aria-live="polite"]')).toHaveText("");
  await expect(page.locator('main [aria-live="polite"]')).toContainText("A completed answer");
  await expect(page.locator('main [aria-live="polite"]')).not.toContainText("[project-lwh-001]");
  await accessible(page);
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("link", { name: "LearnWithHupe: what it is (opens in a new tab)", exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await expect(popup.getByRole("heading", { level: 1 })).toBeVisible();
  await popup.close();
  await page.getByRole("button", { name: "Back to the home page" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox")).toBeFocused();
});

test("clicking and typing leave the glass input borderless", async ({ page }) => {
  await page.goto("/");
  const input = page.getByRole("textbox");
  await input.click();
  await input.pressSequentially("hello");
  await expect(input).toHaveCSS("outline-style", "none");
  await expect(page.locator(".question-pill")).toHaveCSS("outline-style", "none");
  await input.press("Enter");
  await expect(page.getByRole("textbox")).toBeFocused();
  await expect(page.locator(".question-pill")).toHaveCSS("outline-style", "none");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(".question-pill")).toHaveCSS("outline-style", "solid");
  await page.getByRole("textbox").click();
  await expect(page.locator(".question-pill")).toHaveCSS("outline-style", "none");
});

test("error and stop each use a single announcement channel", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox").fill("error");
  await page.getByRole("textbox").press("Enter");
  await expect(page.locator('main [aria-live="polite"]')).not.toBeEmpty();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await accessible(page);
  await page.getByRole("textbox").fill("stop");
  await page.getByRole("textbox").press("Enter");
  await expect(page.locator('main [aria-live="polite"]')).toHaveText("");
  await expect(page.locator(".animate-bounce").first()).toHaveCSS("animation-name", "none");
  await page.getByRole("button", { name: "Stop the answer" }).click();
  await expect(page.locator('main [aria-live="polite"]')).toHaveText("Answer stopped.");
  await expect(page.getByRole("textbox")).toBeFocused();
});

for (const viewport of [{ width: 360, height: 640 }, { width: 320, height: 300 }]) {
  test(`reflow and contrast at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await noOverflow(page);
    await accessible(page);
    await page.screenshot({ path: testInfo.outputPath("home.png"), fullPage: true });
    await page.getByRole("button", { name: "Contact", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Contact", exact: true })).toBeInViewport();
    await expect(page.getByRole("textbox")).toHaveCSS("font-size", "16px");
    await page.getByRole("textbox").fill("x".repeat(500));
    await page.getByRole("textbox").press("Enter");
    await expect(page.locator('main [aria-live="polite"]')).toContainText("A completed answer");
    await noOverflow(page);
    await accessible(page);
    await page.screenshot({ path: testInfo.outputPath("chat.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(viewport.height);
    await page.goto("/records/project-lwh-001");
    await noOverflow(page);
    await accessible(page);
    const response = await page.goto("/records/project-tracker-001");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "This page doesn't exist" })).toBeVisible();
    await accessible(page);
  });
}

test("motion preference changes remove and recreate the water canvas", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.mouse.move(40, 100);
  await page.mouse.move(300, 250, { steps: 10 });
  await accessible(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("200 percent text stays reachable and scrollable", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/");
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await noOverflow(page);
  await expect(page.getByRole("main")).toHaveCSS("touch-action", "pan-y pinch-zoom");
  await page.getByRole("button", { name: "Contact", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Contact", exact: true })).toBeInViewport();
  await accessible(page);
});

// Stored cards (task 4.11): chips show them instantly, and nothing reaches the assistant.
function countChatRequests(page: Page) {
  const seen: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/chat")) seen.push(request.url());
  });
  return seen;
}

test("chips show stored cards with no assistant call", async ({ page }) => {
  const chatRequests = countChatRequests(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Me", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sreerag", level: 2 })).toBeVisible();
  await expect(page.locator('main [aria-live="polite"]')).toContainText("Profile card shown.");
  await accessible(page);

  await page.getByRole("button", { name: "Skills", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Skills", level: 2 })).toBeVisible();
  await expect(page.getByText("NestJS")).toBeVisible();
  await accessible(page);

  await page.getByRole("button", { name: "Contact", exact: true }).click();
  const email = page.getByRole("link", { name: "psreerag69@gmail.com" });
  await expect(email).toHaveAttribute("href", "mailto:psreerag69@gmail.com");
  await expect(page.getByRole("link", { name: /LinkedIn/ })).toHaveAttribute("href", /^https:\/\//);
  await expect(page.locator("main")).not.toContainText(/\+?\d{1,3}[-. ]\d{3}[-. ]\d{3}[-. ]\d{4}/);
  await accessible(page);

  await page.getByRole("button", { name: "Fun", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Beyond the code", level: 2 })).toBeVisible();
  await expect(page.getByText("Attack on Titan")).toBeVisible();
  await accessible(page);

  expect(chatRequests).toEqual([]);
});

test("a project card opens a dialog that traps focus, closes with Escape and returns focus", async ({ page }) => {
  const chatRequests = countChatRequests(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const card = page.getByRole("button", { name: /View details for AI Portfolio Assistant/ });
  await card.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "AI Portfolio Assistant" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Source record/ })).toHaveAttribute("href", "/records/project-portfolio-001");
  await accessible(page);

  // Tab never reaches the page behind: focus stays in the dialog or leaves for the browser's own controls.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement?.closest("dialog") != null)).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(card).toBeFocused();

  // The close button and a click on the backdrop work too.
  await card.click();
  await page.getByRole("button", { name: "Close project details" }).click();
  await expect(dialog).toBeHidden();
  await card.click();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();

  expect(chatRequests).toEqual([]);
});

test("a short typed request shows the cards; a real question still reaches the assistant", async ({ page }) => {
  const chatRequests = countChatRequests(page);
  await page.goto("/");
  await page.getByRole("textbox").fill("can u tell me which works are have u done");
  await page.getByRole("textbox").press("Enter");
  await expect(page.getByRole("heading", { name: "Projects", level: 2 })).toBeVisible();
  expect(chatRequests).toEqual([]);

  await page.getByRole("textbox").fill("Which projects used React and why?");
  await page.getByRole("textbox").press("Enter");
  await expect(page.locator('main [aria-live="polite"]')).toContainText("A completed answer");
  expect(chatRequests.length).toBe(1);
});

for (const viewport of [{ width: 360, height: 640 }, { width: 1280, height: 800 }]) {
  test(`cards fit and have no contrast problems at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    for (const name of ["Me", "Projects", "Skills", "Contact"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await noOverflow(page);
    }
    await accessible(page);
    await page.screenshot({ path: testInfo.outputPath("cards.png"), fullPage: true });
  });
}

test("every reply is the model's own words: no stored line is added to off-topic, unknown or refused replies", async ({ page }) => {
  await page.goto("/");
  const ask = async (q: string) => {
    await page.getByRole("textbox").fill(q);
    await page.getByRole("textbox").press("Enter");
  };
  await ask("nothing");
  await expect(page.locator("ol").getByText("I do not have that information")).toBeVisible();
  await expect(page.locator("ol").getByText("Where this comes from")).toHaveCount(0);
  await accessible(page);
  await ask("private");
  await ask("unknown");
  await expect(page.locator("ol").getByText("I do not have that information")).toHaveCount(3);
  await expect(page.locator("li p.font-medium")).toHaveCount(0);
});

test("a new card slides in, but not for visitors who ask for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.getByRole("button", { name: "Skills", exact: true }).click();
  const reply = page.locator('[data-animate="true"]');
  await expect(reply).toHaveCSS("animation-name", "rise-in");
  await expect(page.locator(".anim-pop")).toHaveCSS("animation-name", "pop-in");
  await expect(page.locator(".stagger-item").first()).toHaveCSS("animation-name", "rise-in");
  // It settles fully visible.
  await expect(reply).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(reply).toHaveCSS("animation-name", "none");
  await expect(page.locator(".anim-pop")).toHaveCSS("animation-name", "none");
});

// The project card grows into its dialog and back with a view transition, and only when motion is welcome.
type Tracked = { __transitions: number; __running: number };
async function countViewTransitions(page: Page) {
  await page.addInitScript(() => {
    const tracked = window as unknown as Tracked;
    tracked.__transitions = 0;
    tracked.__running = 0;
    const original = document.startViewTransition?.bind(document);
    if (original === undefined) return;
    document.startViewTransition = (callback) => {
      tracked.__transitions++;
      tracked.__running++;
      const transition = original(callback);
      void transition.finished.finally(() => tracked.__running--);
      return transition;
    };
  });
  return () => page.evaluate(() => (window as unknown as Tracked).__transitions);
}
// The page ignores the pointer while a transition runs, so wait until none is running.
const transitionsFinished = (page: Page) => page.waitForFunction(() => (window as unknown as Tracked).__running === 0);

test("a project card grows into its dialog and back, and focus and names are put right afterwards", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const transitions = await countViewTransitions(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const card = page.getByRole("button", { name: /View details for AI Portfolio Assistant/ });
  // The chip click moves the input and chips with their own glide (also a view transition): wait for it, then count from zero.
  await transitionsFinished(page);
  await page.evaluate(() => {
    (window as unknown as Tracked).__transitions = 0;
  });
  await card.click();
  const dialog = page.getByRole("dialog", { name: "AI Portfolio Assistant" });
  await expect(dialog).toBeVisible();
  // Chromium has view transitions; where a browser does not, the dialog still opens (the fallback grows it from the card).
  const supported = await page.evaluate(() => typeof document.startViewTransition === "function");
  if (supported) expect(await transitions()).toBe(1);
  // Escape closes with the closing transition, returns focus to the card and leaves no transition name on it.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(card).toBeFocused();
  await expect(card).toHaveCSS("view-transition-name", "none");
  if (supported) expect(await transitions()).toBe(2);
  // The close button and the backdrop go through the same path.
  await card.click();
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Close project details" }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toBeFocused();
  await card.click();
  await expect(dialog).toBeVisible();
  await transitionsFinished(page);
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
  await expect(card).toHaveCSS("view-transition-name", "none");
});

test("with reduced motion the project dialog just appears, with no transition", async ({ page }) => {
  const transitions = await countViewTransitions(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const card = page.getByRole("button", { name: /View details for Erris/ });
  await card.click();
  await expect(page.getByRole("dialog", { name: "Erris" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Erris" })).toBeHidden();
  await expect(card).toBeFocused();
  expect(await transitions()).toBe(0);
});

test("in a browser without view transitions the project dialog still opens and closes, growing from its card", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    Object.defineProperty(document, "startViewTransition", { value: undefined, configurable: true });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const card = page.getByRole("button", { name: /View details for Upthrust/ });
  await card.click();
  const dialog = page.getByRole("dialog", { name: "Upthrust" });
  await expect(dialog).toBeVisible();
  // The fallback animates the dialog from the card's box (Web Animations).
  expect(await dialog.evaluate(element => element.getAnimations().length)).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(card).toBeFocused();
});

test("chat memory: follow-ups carry the chat, older turns are folded into notes, a refresh keeps it and New chat forgets it", async ({ page }) => {
  await page.goto("/");
  const sent: { history?: unknown[]; compact?: unknown[]; summary?: string }[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/chat") && request.method() === "POST") sent.push(request.postDataJSON());
  });
  const answers = page.getByText("Where this comes from");
  const ask = async (question: string, done: number) => {
    await page.getByRole("textbox").fill(question);
    await page.getByRole("textbox").press("Enter");
    await expect(answers).toHaveCount(done);
  };

  await ask("I am Ren from ABC, what has he built?", 1);
  expect(sent[0]).toEqual({ question: "I am Ren from ABC, what has he built?" });
  await ask("And what stack did it use?", 2);
  expect(sent[1]?.history).toHaveLength(2);
  await expect(page.locator("ol").getByText("(remembering 2 turns)")).toBeVisible();

  // A refresh brings the chat back from sessionStorage, and the next question still carries it.
  await page.reload();
  await expect(page.locator("ol").getByText("I am Ren from ABC, what has he built?")).toBeVisible();
  await expect(answers).toHaveCount(2);
  await accessible(page);
  for (let i = 3; i <= 6; i++) await ask(`Question number ${i} about his backend work`, i);
  // Six questions in, the sixth carried 8 latest turns and asked for the 2 oldest to be folded.
  expect(sent.at(-1)?.history).toHaveLength(8);
  expect(sent.at(-1)?.compact).toHaveLength(2);
  await ask("Question number 7 about his backend work", 7);
  // The notes came back, so the first two turns are not sent again; the next two oldest are folded now.
  expect(sent.at(-1)?.summary).toBe("Notes about 2 older turns.");
  expect(sent.at(-1)?.compact).toEqual([
    { role: "user", text: "And what stack did it use?" },
    expect.objectContaining({ role: "assistant" }),
  ]);

  // New chat forgets everything, also after a refresh.
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page.locator("ol").getByText("I am Ren from ABC, what has he built?")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("ol").getByText("I am Ren from ABC, what has he built?")).toHaveCount(0);
  await page.getByRole("textbox").fill("A fresh question about his work");
  await page.getByRole("textbox").press("Enter");
  await expect(answers).toHaveCount(1);
  expect(sent.at(-1)).toEqual({ question: "A fresh question about his work" });
});
