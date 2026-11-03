import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PROJECT_PANEL_TRANSITION, canMorph, growFrom } from "./card-morph.ts";

describe("canMorph", () => {
  it("is on when the browser has view transitions and the visitor has not asked for less motion", () => {
    assert.equal(canMorph({ startViewTransition: () => undefined, reducedMotion: false }), true);
  });

  it("is off for reduced motion, even where view transitions exist", () => {
    assert.equal(canMorph({ startViewTransition: () => undefined, reducedMotion: true }), false);
  });

  it("is off where the browser has no view transitions", () => {
    assert.equal(canMorph({ startViewTransition: undefined, reducedMotion: false }), false);
    assert.equal(canMorph({ startViewTransition: "yes", reducedMotion: false }), false);
  });
});

describe("growFrom", () => {
  const card = { left: 100, top: 200, width: 250, height: 350 };
  const dialog = { left: 300, top: 40, width: 800, height: 700 };

  it("starts at the card's place and size, and ends untransformed", () => {
    const [start, end] = growFrom(card, dialog);
    assert.ok(start !== undefined && end !== undefined);
    // The card's centre is at (225, 375), the dialog's at (700, 390).
    assert.equal(start.transform, `translate(${225 - 700}px, ${375 - 390}px) scale(${250 / 800}, ${350 / 700})`);
    assert.equal(end.transform, "none");
    assert.equal(end.opacity, 1);
    assert.ok(start.opacity < 1);
  });

  it("is a no-op move when the card and the dialog are the same box", () => {
    const [start] = growFrom(dialog, dialog);
    assert.equal(start?.transform, "translate(0px, 0px) scale(1, 1)");
  });

  it("falls back to a plain fade when a box has no size, instead of dividing by zero", () => {
    for (const broken of [{ ...card, width: 0 }, { ...card, height: 0 }]) {
      assert.deepEqual(growFrom(broken, dialog), [{ opacity: 0, transform: "none" }, { opacity: 1, transform: "none" }]);
    }
    assert.deepEqual(growFrom(card, { ...dialog, height: 0 }), [{ opacity: 0, transform: "none" }, { opacity: 1, transform: "none" }]);
  });

  it("uses one shared transition name", () => {
    assert.match(PROJECT_PANEL_TRANSITION, /^[a-z][a-z0-9-]*$/);
  });
});
