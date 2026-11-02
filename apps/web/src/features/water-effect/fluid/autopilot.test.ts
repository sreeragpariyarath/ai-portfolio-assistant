import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AUTOPILOT_IDLE_MS, autopilotActive, autopilotPosition } from "./autopilot.ts";

describe("autopilotPosition", () => {
  it("stays inside the screen, always", () => {
    for (let seconds = 0; seconds < 600; seconds += 0.37) {
      const { x, y } = autopilotPosition(seconds);
      assert.ok(x > 0.05 && x < 0.95, `x ${x} at ${seconds}`);
      assert.ok(y > 0.05 && y < 0.95, `y ${y} at ${seconds}`);
    }
  });

  it("moves slowly and smoothly: no jump between two frames", () => {
    let previous = autopilotPosition(0);
    for (let frame = 1; frame < 60 * 120; frame++) {
      const next = autopilotPosition(frame / 60);
      assert.ok(Math.hypot(next.x - previous.x, next.y - previous.y) < 0.01, `jump at frame ${frame}`);
      previous = next;
    }
  });

  it("wanders instead of repeating: it does not come back to the same place within a minute", () => {
    const start = autopilotPosition(0);
    for (let seconds = 5; seconds < 60; seconds += 0.5) {
      const here = autopilotPosition(seconds);
      assert.ok(Math.hypot(here.x - start.x, here.y - start.y) > 0.005, `back at the start after ${seconds}s`);
    }
  });
});

describe("autopilotActive", () => {
  it("starts only after the page has been left alone long enough", () => {
    assert.equal(autopilotActive(1000, 1000), false);
    assert.equal(autopilotActive(1000 + AUTOPILOT_IDLE_MS - 1, 1000), false);
    assert.equal(autopilotActive(1000 + AUTOPILOT_IDLE_MS, 1000), true);
  });
});
