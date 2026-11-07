import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_INPUT_LINES, growBox, isSendKey } from "./auto-grow.ts";

describe("growBox", () => {
  it("keeps one line as it is", () => {
    assert.deepEqual(growBox(24, 24, 10), { height: 34, multiline: false, scrolls: false });
  });

  it("gets taller for each wrapped line", () => {
    assert.deepEqual(growBox(72, 24, 10), { height: 82, multiline: true, scrolls: false });
  });

  it("stops at the maximum and then scrolls inside", () => {
    const result = growBox(24 * 10, 24, 10);
    assert.equal(result.height, MAX_INPUT_LINES * 24 + 10);
    assert.equal(result.scrolls, true);
    assert.equal(result.multiline, true);
  });

  it("treats an empty or zero-height measurement as one line", () => {
    assert.deepEqual(growBox(0, 24, 10), { height: 34, multiline: false, scrolls: false });
    // A missing line height (NaN from the browser) must not produce a broken height.
    assert.ok(Number.isFinite(growBox(30, Number.NaN, 0).height));
  });
});

describe("isSendKey", () => {
  it("sends on Enter", () => {
    assert.equal(isSendKey({ key: "Enter", shiftKey: false, isComposing: false }), true);
  });

  it("makes a new line on Shift+Enter", () => {
    assert.equal(isSendKey({ key: "Enter", shiftKey: true, isComposing: false }), false);
  });

  it("does not send while a word is being composed, or on other keys", () => {
    assert.equal(isSendKey({ key: "Enter", shiftKey: false, isComposing: true }), false);
    assert.equal(isSendKey({ key: "a", shiftKey: false, isComposing: false }), false);
  });
});
