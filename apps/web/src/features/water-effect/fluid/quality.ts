// Original to this project (not part of the ported simulation). Adaptive quality: if the frames keep taking
// too long, the water steps down to a smaller simulation, so a slow phone gets a smooth, simpler effect
// instead of a slideshow. It only ever steps down. Pure, so the root test suite can run it.

import type { FluidConfig } from "./config.ts";

// Each step is the most the simulation may use at that level; a config already below it keeps its value.
export const QUALITY_STEPS: readonly Pick<FluidConfig, "SIM_RESOLUTION" | "DYE_RESOLUTION" | "PRESSURE_ITERATIONS">[] = [
  { SIM_RESOLUTION: 64, DYE_RESOLUTION: 384, PRESSURE_ITERATIONS: 10 },
  { SIM_RESOLUTION: 48, DYE_RESOLUTION: 256, PRESSURE_ITERATIONS: 8 },
  { SIM_RESOLUTION: 32, DYE_RESOLUTION: 192, PRESSURE_ITERATIONS: 6 },
];

// The new settings for step `step` (0-based): never higher than what is configured now.
export function qualityStepSettings(config: FluidConfig, step: number): Pick<FluidConfig, "SIM_RESOLUTION" | "DYE_RESOLUTION" | "PRESSURE_ITERATIONS"> {
  const target = QUALITY_STEPS[Math.min(step, QUALITY_STEPS.length - 1)]!;
  return {
    SIM_RESOLUTION: Math.min(config.SIM_RESOLUTION, target.SIM_RESOLUTION),
    DYE_RESOLUTION: Math.min(config.DYE_RESOLUTION, target.DYE_RESOLUTION),
    PRESSURE_ITERATIONS: Math.min(config.PRESSURE_ITERATIONS, target.PRESSURE_ITERATIONS),
  };
}

export interface QualityMonitorOptions {
  // Frames judged together.
  windowFrames?: number;
  // A window whose average frame takes longer than this is too slow (28 ms is about 36 frames a second).
  slowMs?: number;
  // Frames ignored after the start and after each step down: shader warm-up and resizing are slow once.
  warmupFrames?: number;
  // A gap this long is a hidden tab or a stall, not the speed of the simulation.
  ignoreAboveMs?: number;
}

export interface QualityMonitor {
  // Feeds the time between two drawn frames. Returns the step to move to (0-based), or null to stay.
  record(intervalMs: number): number | null;
  readonly step: number;
}

export function createQualityMonitor(options: QualityMonitorOptions = {}): QualityMonitor {
  const { windowFrames = 90, slowMs = 28, warmupFrames = 30, ignoreAboveMs = 250 } = options;
  let step = -1; // -1: nothing lowered yet
  let skip = warmupFrames;
  let count = 0;
  let total = 0;

  return {
    record(intervalMs) {
      if (!Number.isFinite(intervalMs) || intervalMs <= 0 || intervalMs > ignoreAboveMs) return null;
      if (skip > 0) {
        skip -= 1;
        return null;
      }
      count += 1;
      total += intervalMs;
      if (count < windowFrames) return null;

      const average = total / count;
      count = 0;
      total = 0;
      if (average <= slowMs || step >= QUALITY_STEPS.length - 1) return null;

      step += 1;
      skip = warmupFrames;
      return step;
    },
    get step() {
      return step;
    },
  };
}
