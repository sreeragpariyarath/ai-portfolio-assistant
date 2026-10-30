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
  await expect(page.locator('main [aria-live="polite"]')).not.toContainText("[project-demo-006]");
  await accessible(page);
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("link", { name: "1. project-demo-006 (opens in a new tab)", exact: true }).click();
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
    await page.goto("/records/project-demo-006");
    await noOverflow(page);
    await accessible(page);
    const response = await page.goto("/records/private-demo-001");
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
  await expect(page.locator('main [aria-live="polite"]')).toContainText("Profile card shown below.");
  await accessible(page);

  await page.getByRole("button", { name: "Skills", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Skills", level: 2 })).toBeVisible();
  await expect(page.getByText("Cloudflare Workers")).toBeVisible();
  await accessible(page);

  await page.getByRole("button", { name: "Contact", exact: true }).click();
  const email = page.getByRole("link", { name: "hello@example.com" });
  await expect(email).toHaveAttribute("href", "mailto:hello@example.com");
  await expect(page.getByRole("link", { name: /LinkedIn/ })).toHaveAttribute("href", /^https:\/\//);
  await expect(page.locator("main")).not.toContainText(/\+?\d{1,3}[-. ]\d{3}[-. ]\d{3}[-. ]\d{4}/);
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
  await expect(dialog.getByRole("link", { name: /Source record/ })).toHaveAttribute("href", "/records/project-demo-001");
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

test("an I-don't-know reply opens with a stored line; a refusal does not", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox").fill("nothing");
  await page.getByRole("textbox").press("Enter");
  const live = page.locator('main [aria-live="polite"]');
  await expect(live).toContainText("I can tell you about the projects instead.");
  const announced = (await live.innerText()).replace(/\s+/g, " ");
  expect(announced).not.toContain("I do not have that information");
  await expect(page.locator("ol").getByText("I do not have that information")).toHaveCount(0);
  await expect(page.locator("ol").getByText("I can tell you about the projects instead.")).toBeVisible();
  await expect(page.locator("ol").getByText("Not something I have on record")).toBeVisible();
  await accessible(page);
  const lead = await page.locator("li p.font-medium").last().innerText();
  expect(lead.length).toBeGreaterThan(20);
  expect(announced.startsWith(lead)).toBe(true);

  await page.getByRole("textbox").fill("private");
  await page.getByRole("textbox").press("Enter");
  await expect(page.locator("ol").getByText("That one stays private")).toBeVisible();
  await expect(page.locator("ol").getByText("I do not have that information")).toBeVisible();
  await expect(page.locator("li p.font-medium")).toHaveCount(1);
});
