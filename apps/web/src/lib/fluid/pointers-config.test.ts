import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONFIG, resolveConfig } from "./config.ts";
import { createPointer, pointerDown, pointerMove, pointerUp, toCanvasPixels } from "./pointers.ts";

const COLOR = { r: 0.1, g: 0.2, b: 0.3 };

describe("toCanvasPixels", () => {
  it("maps a screen position into canvas pixels, whatever the pixel ratio", () => {
    const rect = { left: 10, top: 20, width: 400, height: 200 };
    assert.deepEqual(toCanvasPixels(210, 120, rect, 800, 400), { x: 400, y: 200 });
    assert.deepEqual(toCanvasPixels(10, 20, rect, 800, 400), { x: 0, y: 0 });
  });

  it("returns the origin for a canvas with no size instead of dividing by zero", () => {
    assert.deepEqual(toCanvasPixels(5, 5, { left: 0, top: 0, width: 0, height: 0 }, 800, 400), { x: 0, y: 0 });
  });
});

describe("pointer state", () => {
  it("starts at a position with no movement, flipping y so the origin is bottom-left", () => {
    const pointer = createPointer(7);
    pointerDown(pointer, 200, 100, 800, 400, COLOR);
    assert.equal(pointer.down, true);
    assert.equal(pointer.moved, false);
    assert.equal(pointer.texcoordX, 0.25);
    assert.equal(pointer.texcoordY, 0.75);
    assert.deepEqual([pointer.deltaX, pointer.deltaY], [0, 0]);
    assert.deepEqual(pointer.color, COLOR);
  });

  it("records the movement since the last position and marks the pointer moved", () => {
    const pointer = createPointer(1);
    pointerDown(pointer, 400, 200, 800, 400, COLOR);
    pointerMove(pointer, 600, 100, 800, 400);
    assert.equal(pointer.moved, true);
    assert.equal(pointer.deltaX, 0.25);
    // 0.25 up, divided by the aspect ratio of 2 on a landscape canvas.
    assert.equal(pointer.deltaY, 0.125);
    assert.equal(pointer.prevTexcoordX, 0.5);
  });

  it("does not mark a pointer moved when the position did not change", () => {
    const pointer = createPointer(1);
    pointerDown(pointer, 400, 200, 800, 400, COLOR);
    pointerMove(pointer, 400, 200, 800, 400);
    assert.equal(pointer.moved, false);
  });

  it("goes up", () => {
    const pointer = createPointer(1);
    pointerDown(pointer, 1, 1, 800, 400, COLOR);
    pointerUp(pointer);
    assert.equal(pointer.down, false);
  });
});

describe("resolveConfig", () => {
  const desktop = { mobile: false, linearFiltering: true };

  it("uses the values of the reference page's control panel: calm, water-like movement", () => {
    const config = resolveConfig({}, desktop);
    assert.equal(config.SIM_RESOLUTION, 256);
    assert.equal(config.DYE_RESOLUTION, 1024);
    assert.equal(config.DENSITY_DISSIPATION, 2.5);
    assert.equal(config.VELOCITY_DISSIPATION, 3.71);
    assert.equal(config.PRESSURE, 0.6);
    assert.equal(config.CURL, 0);
    assert.equal(config.SPLAT_RADIUS, 0.23);
    assert.equal(config.SHADING, true);
    assert.equal(config.COLORFUL, false);
    assert.deepEqual([config.BLOOM, config.BLOOM_INTENSITY, config.BLOOM_THRESHOLD], [true, 1, 1]);
    assert.deepEqual([config.SUNRAYS, config.SUNRAYS_WEIGHT], [true, 1]);
  });

  it("starts pure white (no start-up splats) and lets a mouse stir by moving", () => {
    const config = resolveConfig({}, desktop);
    assert.equal(config.INITIAL_SPLATS, 0);
    assert.equal(config.HOVER, true);
  });

  it("applies overrides without changing the defaults object", () => {
    const before = { ...DEFAULT_CONFIG };
    const config = resolveConfig({ CURL: 5, DENSITY_DISSIPATION: 3 }, desktop);
    assert.equal(config.CURL, 5);
    assert.equal(config.DENSITY_DISSIPATION, 3);
    assert.deepEqual(DEFAULT_CONFIG, before);
    assert.notEqual(config, DEFAULT_CONFIG);
  });

  it("uses a smaller dye texture on phones, as the original does", () => {
    assert.equal(resolveConfig({}, { mobile: true, linearFiltering: true }).DYE_RESOLUTION, 512);
    assert.equal(resolveConfig({ DYE_RESOLUTION: 256 }, { mobile: true, linearFiltering: true }).DYE_RESOLUTION, 256);
  });

  it("turns off shading, bloom and sunrays without linear filtering", () => {
    const config = resolveConfig({ BLOOM: true, SUNRAYS: true }, { mobile: false, linearFiltering: false });
    assert.equal(config.DYE_RESOLUTION, 512);
    assert.equal(config.SHADING, false);
    assert.equal(config.BLOOM, false);
    assert.equal(config.SUNRAYS, false);
  });
});
