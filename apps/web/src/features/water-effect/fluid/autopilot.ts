// Original to this project (not part of the ported simulation). The autopilot: when nobody is touching the
// screen, a slow, wandering swirl keeps the water alive. Pure, so the root test suite can run it.

// How long the page must be left alone before the swirl starts. A finger or a mouse takes over at once.
export const AUTOPILOT_IDLE_MS = 2500;

// How hard the swirl pushes, as a multiple of what a pointer moving the same distance would push.
// Small distances per frame, so this is what makes the strokes readable but still gentle.
export const AUTOPILOT_GAIN = 10;

// How often the swirl's colour changes, in seconds (a pointer changes about ten times a second).
export const AUTOPILOT_COLOR_SECONDS = 1.4;

export interface Point {
  x: number;
  y: number;
}

// Where the swirl is `seconds` after it started, in 0..1 with the origin bottom-left. Two slow sine
// waves per axis with unrelated periods, so the path wanders and does not visibly repeat, and it
// always stays inside the screen.
export function autopilotPosition(seconds: number): Point {
  const x = 0.5 + 0.3 * Math.sin(0.37 * seconds + 0.6) + 0.1 * Math.sin(0.91 * seconds);
  const y = 0.5 + 0.28 * Math.sin(0.29 * seconds) + 0.12 * Math.cos(0.73 * seconds + 1.1);
  return { x, y };
}

// True while the page has been left alone for long enough.
export function autopilotActive(nowMs: number, lastInputMs: number, idleMs = AUTOPILOT_IDLE_MS): boolean {
  return nowMs - lastInputMs >= idleMs;
}
