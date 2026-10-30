import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displacementAt, displacementPixels, supportsSvgBackdropFilter } from "./liquid-glass.ts";

describe("displacementAt", () => {
  const W = 200;
  const H = 80;
  const R = 20;
  const BEZEL = 16;

  it("looks straight through the middle", () => {
    assert.deepEqual(displacementAt(100, 40, W, H, R, BEZEL), { dx: 0, dy: 0 });
  });

  it("bends inwards near each straight edge, most at the border", () => {
    assert.ok(displacementAt(1, 40, W, H, R, BEZEL).dx > 0.8, "left edge looks right");
    assert.ok(displacementAt(W - 1, 40, W, H, R, BEZEL).dx < -0.8, "right edge looks left");
    assert.ok(displacementAt(100, 1, W, H, R, BEZEL).dy > 0.8, "top edge looks down");
    assert.ok(displacementAt(100, H - 1, W, H, R, BEZEL).dy < -0.8, "bottom edge looks up");
    const near = displacementAt(2, 40, W, H, R, BEZEL).dx;
    const far = displacementAt(10, 40, W, H, R, BEZEL).dx;
    assert.ok(near > far && far > 0, "the bend fades towards the inside of the bezel");
  });

  it("bends along the diagonal in a rounded corner", () => {
    const { dx, dy } = displacementAt(7, 7, W, H, R, BEZEL);
    assert.ok(dx > 0 && dy > 0);
    assert.ok(Math.abs(dx - dy) < 1e-9);
  });

  it("does nothing outside the rounded shape or with no bezel", () => {
    assert.deepEqual(displacementAt(0.5, 0.5, W, H, R, BEZEL), { dx: 0, dy: 0 });
    assert.deepEqual(displacementAt(1, 40, W, H, R, 0), { dx: 0, dy: 0 });
  });

  it("caps the radius for a pill shape", () => {
    const pill = displacementAt(2, 40, W, H, 999, BEZEL);
    assert.ok(pill.dx > 0 && Math.abs(pill.dy) < 1e-9);
  });

  it("stays within -1..1", () => {
    for (let y = 0.5; y < H; y += 3) {
      for (let x = 0.5; x < W; x += 3) {
        const { dx, dy } = displacementAt(x, y, W, H, R, BEZEL);
        assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1);
      }
    }
  });
});

describe("displacementPixels", () => {
  it("encodes no bend as 128 and fills every pixel opaque", () => {
    const pixels = displacementPixels(40, 20, 10, 6);
    assert.equal(pixels.length, 40 * 20 * 4);
    const centre = (10 * 40 + 20) * 4;
    assert.deepEqual([...pixels.slice(centre, centre + 4)], [128, 128, 128, 255]);
    for (let i = 3; i < pixels.length; i += 4) assert.equal(pixels[i], 255);
  });
});

describe("supportsSvgBackdropFilter", () => {
  it("is true for Chromium browsers", () => {
    assert.equal(supportsSvgBackdropFilter("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"), true);
    assert.equal(supportsSvgBackdropFilter("Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36 Edg/130.0"), true);
    assert.equal(supportsSvgBackdropFilter("Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36"), true);
    assert.equal(supportsSvgBackdropFilter("anything", ["Chromium", "Not A Brand"]), true);
  });

  it("is false for Safari, Firefox and any iOS browser, which get the frosted fallback", () => {
    assert.equal(supportsSvgBackdropFilter("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15"), false);
    assert.equal(supportsSvgBackdropFilter("Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0"), false);
    assert.equal(supportsSvgBackdropFilter("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) CriOS/130.0 Mobile/15E148"), false);
  });
});
