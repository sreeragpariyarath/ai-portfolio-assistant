// Frame-rate counting for the `?perf` readout. Pure, so the root tests can run it.

export interface FpsReading {
  fps: number;
  // The longest gap between two frames in the window, in ms: stutter shows here even when the
  // average looks fine.
  worstFrameMs: number;
}

// Call tick(now) from every animation frame, with the frame's timestamp in ms. It returns a new
// reading once per window (one second by default) and null in between.
export function createFpsMeter(windowMs = 1000) {
  let windowStart: number | null = null;
  let last = 0;
  let frames = 0;
  let worst = 0;

  return {
    tick(now: number): FpsReading | null {
      if (windowStart === null) {
        windowStart = now;
        last = now;
        return null;
      }
      frames += 1;
      worst = Math.max(worst, now - last);
      last = now;
      if (now - windowStart < windowMs) return null;

      const reading = { fps: Math.round((frames * 1000) / (now - windowStart)), worstFrameMs: Math.round(worst) };
      windowStart = now;
      frames = 0;
      worst = 0;
      return reading;
    },
  };
}

// The readout is for the owner's own testing, so it is only shown when the address ends in ?perf.
export function perfRequested(search: string): boolean {
  return new URLSearchParams(search).has("perf");
}
