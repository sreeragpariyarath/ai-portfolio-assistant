import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  correctDeltaX,
  correctDeltaY,
  correctRadius,
  deltaTime,
  effectivePixelRatio,
  generateColor,
  getResolution,
  hsvToRgb,
  isMobileUserAgent,
  scaleByPixelRatio,
  textureScale,
  wrap,
} from "./math.ts";

describe("hsvToRgb", () => {
  it("returns the primary and secondary colours at the six hue steps", () => {
    const close = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => {
      for (const key of ["r", "g", "b"] as const) assert.ok(Math.abs(a[key] - b[key]) < 1e-9, `${key}: ${a[key]} vs ${b[key]}`);
    };
    close(hsvToRgb(0, 1, 1), { r: 1, g: 0, b: 0 });
    close(hsvToRgb(1 / 6, 1, 1), { r: 1, g: 1, b: 0 });
    close(hsvToRgb(2 / 6, 1, 1), { r: 0, g: 1, b: 0 });
    close(hsvToRgb(3 / 6, 1, 1), { r: 0, g: 1, b: 1 });
    close(hsvToRgb(4 / 6, 1, 1), { r: 0, g: 0, b: 1 });
    close(hsvToRgb(5 / 6, 1, 1), { r: 1, g: 0, b: 1 });
  });

  it("returns grey when saturation is 0", () => {
    assert.deepEqual(hsvToRgb(0.3, 0, 0.5), { r: 0.5, g: 0.5, b: 0.5 });
  });

  it("wraps a hue of exactly 1 back to red instead of throwing", () => {
    assert.deepEqual(hsvToRgb(1, 1, 1), hsvToRgb(0, 1, 1));
  });
});

describe("generateColor", () => {
  it("scales a saturated hue by the intensity", () => {
    const color = generateColor(() => 0, 0.35);
    assert.deepEqual(color, { r: 0.35, g: 0, b: 0 });
  });

  it("keeps at least one channel at the full intensity for every hue", () => {
    for (let h = 0; h < 1; h += 0.05) {
      const { r, g, b } = generateColor(() => h, 0.5);
      assert.ok(Math.abs(Math.max(r, g, b) - 0.5) < 1e-9, `hue ${h}`);
    }
  });
});

describe("wrap", () => {
  it("wraps into [min, max) and handles an empty range", () => {
    assert.equal(wrap(1.25, 0, 1), 0.25);
    assert.equal(wrap(0.5, 0, 1), 0.5);
    assert.equal(wrap(3, 2, 2), 2);
  });
});

describe("pixel ratio", () => {
  it("scales and floors", () => {
    assert.equal(scaleByPixelRatio(801, 1.5), 1201);
    assert.equal(scaleByPixelRatio(800, 1.5), 1200);
  });

  it("caps the device ratio, and treats a missing or invalid one as 1", () => {
    assert.equal(effectivePixelRatio(3, 1.5), 1.5);
    assert.equal(effectivePixelRatio(1, 1.5), 1);
    assert.equal(effectivePixelRatio(1.25, 1.5), 1.25);
    for (const bad of [undefined, 0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(effectivePixelRatio(bad, 1.5), 1, String(bad));
    }
  });
});

describe("getResolution", () => {
  it("makes the short side `resolution` cells and keeps the aspect ratio, landscape", () => {
    assert.deepEqual(getResolution(128, 1920, 1080), { width: 228, height: 128 });
  });

  it("does the same in portrait, with the long side vertical", () => {
    assert.deepEqual(getResolution(128, 1080, 1920), { width: 128, height: 228 });
  });

  it("is square for a square buffer", () => {
    assert.deepEqual(getResolution(512, 600, 600), { width: 512, height: 512 });
  });
});

describe("aspect corrections", () => {
  it("widens the splat radius on landscape screens only", () => {
    assert.equal(correctRadius(0.01, 2000, 1000), 0.02);
    assert.equal(correctRadius(0.01, 1000, 2000), 0.01);
  });

  it("corrects the horizontal movement on portrait screens and the vertical on landscape", () => {
    assert.equal(correctDeltaX(0.1, 1000, 2000), 0.05);
    assert.equal(correctDeltaX(0.1, 2000, 1000), 0.1);
    assert.equal(correctDeltaY(0.1, 2000, 1000), 0.05);
    assert.equal(correctDeltaY(0.1, 1000, 2000), 0.1);
  });
});

describe("deltaTime", () => {
  it("is the elapsed seconds, capped at one 60 Hz frame, and never negative", () => {
    assert.equal(deltaTime(1008, 1000), 0.008);
    assert.equal(deltaTime(2000, 1000), 0.016666);
    assert.equal(deltaTime(1000, 1500), 0);
  });
});

describe("misc helpers", () => {
  it("recognises phones by user agent", () => {
    assert.equal(isMobileUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148"), true);
    assert.equal(isMobileUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)"), true);
    assert.equal(isMobileUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0"), false);
  });

  it("computes the texture scale", () => {
    assert.deepEqual(textureScale(64, 32, 640, 640), { x: 10, y: 20 });
  });
});
