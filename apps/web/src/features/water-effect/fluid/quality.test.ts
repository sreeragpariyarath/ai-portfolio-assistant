import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONFIG } from "./config.ts";
import { QUALITY_STEPS, createQualityMonitor, qualityStepSettings } from "./quality.ts";

// Feeds `frames` frames that each take `ms`; returns every step the monitor asked for.
function feed(monitor: ReturnType<typeof createQualityMonitor>, frames: number, ms: number): number[] {
  const steps: number[] = [];
  for (let i = 0; i < frames; i++) {
    const step = monitor.record(ms);
    if (step !== null) steps.push(step);
  }
  return steps;
}

describe("createQualityMonitor", () => {
  it("leaves a smooth 60 frames a second alone, however long it runs", () => {
    const monitor = createQualityMonitor();
    assert.deepEqual(feed(monitor, 5000, 16.7), []);
  });

  it("does not judge the first frames, which are slow while shaders warm up", () => {
    const monitor = createQualityMonitor();
    assert.deepEqual(feed(monitor, 30, 200), []);
    assert.deepEqual(feed(monitor, 89, 16), []);
  });

  it("steps down once after a window of slow frames, then waits before judging again", () => {
    const monitor = createQualityMonitor();
    const steps = feed(monitor, 30 + 90, 40); // warm-up, then one slow window
    assert.deepEqual(steps, [0]);
    // After a step the next frames are warm-up again, so the very next window is not judged slow too early.
    assert.deepEqual(feed(monitor, 30 + 89, 40), []);
    assert.deepEqual(feed(monitor, 1, 40), [1]);
  });

  it("goes down to the lowest step and no further", () => {
    const monitor = createQualityMonitor();
    const steps = feed(monitor, 5000, 60);
    assert.deepEqual(steps, QUALITY_STEPS.map((_, index) => index));
    assert.equal(monitor.step, QUALITY_STEPS.length - 1);
  });

  it("never steps back up", () => {
    const monitor = createQualityMonitor();
    feed(monitor, 120, 40);
    assert.deepEqual(feed(monitor, 5000, 8), []);
    assert.equal(monitor.step, 0);
  });

  it("ignores a hidden tab or a stall, and junk numbers", () => {
    const monitor = createQualityMonitor();
    feed(monitor, 30, 16);
    for (let i = 0; i < 500; i++) assert.equal(monitor.record(5000), null);
    for (const junk of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(monitor.record(junk), null);
    assert.deepEqual(feed(monitor, 90, 16), []);
  });

  it("does not step down for an average that is only a little slow", () => {
    const monitor = createQualityMonitor();
    assert.deepEqual(feed(monitor, 30 + 90 * 5, 25), []);
  });
});

describe("qualityStepSettings", () => {
  it("never raises a setting above what is configured", () => {
    const small = { ...DEFAULT_CONFIG, SIM_RESOLUTION: 32, DYE_RESOLUTION: 128, PRESSURE_ITERATIONS: 4 };
    for (let step = 0; step < QUALITY_STEPS.length; step++) {
      const settings = qualityStepSettings(small, step);
      assert.equal(settings.SIM_RESOLUTION, 32);
      assert.equal(settings.DYE_RESOLUTION, 128);
      assert.equal(settings.PRESSURE_ITERATIONS, 4);
    }
  });

  it("gets lower with each step, and clamps a step past the end to the last one", () => {
    const sims = QUALITY_STEPS.map((_, step) => qualityStepSettings(DEFAULT_CONFIG, step).SIM_RESOLUTION);
    assert.deepEqual(sims, [...sims].sort((a, b) => b - a));
    assert.deepEqual(qualityStepSettings(DEFAULT_CONFIG, 99), qualityStepSettings(DEFAULT_CONFIG, QUALITY_STEPS.length - 1));
  });
});
