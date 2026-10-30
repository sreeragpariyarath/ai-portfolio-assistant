import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFpsMeter, perfRequested } from "./perf.ts";

// Feeds frames `intervalMs` apart for `seconds` and returns every reading.
function run(intervalMs: number, seconds: number, start = 5000) {
  const meter = createFpsMeter();
  const readings = [];
  for (let now = start; now <= start + seconds * 1000; now += intervalMs) {
    const reading = meter.tick(now);
    if (reading !== null) readings.push(reading);
  }
  return readings;
}

describe("createFpsMeter", () => {
  it("reads about 60 fps for 16.7 ms frames, once per second", () => {
    const readings = run(1000 / 60, 3.5);
    assert.equal(readings.length, 3);
    for (const reading of readings) {
      assert.ok(reading.fps >= 59 && reading.fps <= 61, `fps ${reading.fps}`);
      assert.ok(reading.worstFrameMs <= 18);
    }
  });

  it("reads 20 fps for 50 ms frames", () => {
    for (const reading of run(50, 3)) assert.equal(reading.fps, 20);
  });

  it("shows one long frame as the worst frame even when the average stays high", () => {
    const meter = createFpsMeter();
    let reading = null;
    let now = 0;
    meter.tick(now);
    for (let i = 0; i < 59; i++) meter.tick((now += 16));
    reading = meter.tick((now += 120));
    assert.ok(reading !== null);
    assert.equal(reading.worstFrameMs, 120);
    assert.ok(reading.fps >= 50);
  });

  it("gives nothing before the first window is complete, and starts fresh after each reading", () => {
    const meter = createFpsMeter();
    assert.equal(meter.tick(0), null);
    assert.equal(meter.tick(500), null);
    assert.ok(meter.tick(1000) !== null);
    assert.equal(meter.tick(1100), null);
  });
});

describe("perfRequested", () => {
  it("is true only when the address has ?perf", () => {
    assert.equal(perfRequested("?perf"), true);
    assert.equal(perfRequested("?a=1&perf=1"), true);
    assert.equal(perfRequested(""), false);
    assert.equal(perfRequested("?performance=1"), false);
  });
});
