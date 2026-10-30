/*
MIT License

Copyright (c) 2017 Pavel Dobryakov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// The water effect: a TypeScript port of PavelDoGreat/WebGL-Fluid-Simulation (D-019). This file is
// the browser-facing part (frame loop, input, visibility, reduced motion, clean teardown); the
// WebGL work is in engine.ts. See THIRD_PARTY_NOTICES.md for what was removed and added.
//
// Usage (the home screen, task 4.5):
//   const result = createFluid(canvas);
//   if (result.ok) result.fluid.start();   // later: result.fluid.destroy()
//   else /* plain white page: result.reason says why */;
// The page should set `touch-action: none` on the home screen so a finger drag stirs the water
// instead of scrolling, and give the canvas `pointer-events: none` so it never blocks the controls.
//
// Use a NEW canvas element for every createFluid call. destroy() releases the GPU context, and a
// canvas whose context was released can never get a working one again; React Strict Mode runs an
// effect, cleans it up and runs it again on the same element, so create the canvas inside the
// effect (document.createElement) and remove it in the cleanup.

import { DEFAULT_CONFIG, resolveConfig } from "./config.ts";
import type { FluidConfig } from "./config.ts";
import { FluidSetupError, createEngine, getWebGLContext } from "./engine.ts";
import type { FluidCanvas, FluidFailure } from "./engine.ts";
import { browserEnv, prefersReducedMotion } from "./env.ts";
import type { FluidEnv } from "./env.ts";
import { attachInput } from "./input.ts";
import type { InputSink } from "./input.ts";
import { deltaTime, effectivePixelRatio, generateColor, isMobileUserAgent, scaleByPixelRatio, wrap } from "./math.ts";
import { createPointer, pointerDown, pointerMove } from "./pointers.ts";
import type { PointerData } from "./pointers.ts";

export { DEFAULT_CONFIG, FluidSetupError, prefersReducedMotion, resolveConfig };
export type { FluidConfig, FluidEnv, FluidFailure };

export interface FluidSurface extends FluidCanvas {
  readonly clientWidth: number;
  readonly clientHeight: number;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

export interface FluidOptions {
  config?: Partial<FluidConfig>;
  // Replaces the browser, for tests.
  env?: FluidEnv;
  // Called if the effect has to stop on its own after starting (the GPU context was lost).
  onFailure?: (reason: FluidFailure) => void;
  // When true (the default) a visitor who prefers reduced motion gets no effect at all.
  respectReducedMotion?: boolean;
}

export interface Fluid {
  // Begins drawing and listening for pointers. Safe to call again.
  start(): void;
  // Stops drawing and stops listening, but keeps the picture. Safe to call again.
  stop(): void;
  // Stops and releases every GPU resource. The object cannot be used afterwards.
  destroy(): void;
  // Paints dye at a position in 0..1 (origin bottom-left) with a push of (dx, dy); for the page's
  // own use, such as a welcome swirl. Does nothing until the first frame has been drawn.
  splat(x: number, y: number, dx: number, dy: number): void;
  readonly running: boolean;
  readonly destroyed: boolean;
}

export type FluidResult = { ok: true; fluid: Fluid } | { ok: false; reason: FluidFailure; detail?: string };

function failure(reason: FluidFailure, detail?: string): FluidResult {
  return detail === undefined ? { ok: false, reason } : { ok: false, reason, detail };
}

export function createFluid(canvas: FluidSurface, options: FluidOptions = {}): FluidResult {
  const env = options.env ?? browserEnv();

  if ((options.respectReducedMotion ?? true) && prefersReducedMotion(env)) return failure("reduced-motion");

  let gl: WebGL2RenderingContext | undefined;
  let config: FluidConfig;
  let engine: ReturnType<typeof createEngine>;
  try {
    const context = getWebGLContext(canvas);
    gl = context.gl;
    config = resolveConfig(options.config ?? {}, {
      mobile: isMobileUserAgent(env.userAgent),
      linearFiltering: context.ext.supportLinearFiltering,
    });
    engine = createEngine(canvas, config, context.gl, context.ext, env.random);
  } catch (error) {
    // Losing the context frees everything created on it, including a half-built engine.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    if (error instanceof FluidSetupError) return failure(error.reason, error.detail);
    throw error;
  }

  const pointers = new Map<number, PointerData>();
  const newColor = () => generateColor(env.random, config.COLOR_INTENSITY);

  let wantRunning = false;
  let destroyed = false;
  let initialized = false;
  let rafId: number | null = null;
  let lastTime = env.now();
  let colorUpdateTimer = 0;
  let detachInput: (() => void) | null = null;

  const hidden = () => env.document.visibilityState === "hidden";

  // Returns true when the canvas changed size.
  function resizeCanvas(): boolean {
    const ratio = effectivePixelRatio(env.window.devicePixelRatio, config.MAX_PIXEL_RATIO);
    const width = scaleByPixelRatio(canvas.clientWidth, ratio);
    const height = scaleByPixelRatio(canvas.clientHeight, ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      return true;
    }
    return false;
  }

  const sink: InputSink = {
    down(id, _kind, x, y) {
      const pointer = pointers.get(id) ?? createPointer(id);
      pointerDown(pointer, x, y, canvas.width, canvas.height, newColor());
      pointers.set(id, pointer);
    },
    move(id, kind, x, y) {
      const pointer = pointers.get(id);
      if (pointer === undefined) {
        // A mouse that has not pressed anything stirs the water by moving; the first movement
        // only plants it, so it does not splat from wherever the last pointer was.
        if (kind === "mouse" && config.HOVER) {
          const planted = createPointer(id);
          pointerDown(planted, x, y, canvas.width, canvas.height, newColor());
          pointers.set(id, planted);
        }
        return;
      }
      if (pointer.down) pointerMove(pointer, x, y, canvas.width, canvas.height);
    },
    up(id, kind) {
      // A hovering mouse stays planted when a button is released; touch and pen are forgotten.
      if (kind === "mouse" && config.HOVER) return;
      pointers.delete(id);
    },
    leave() {
      pointers.clear();
    },
  };

  function updateColors(dt: number): void {
    if (!config.COLORFUL) return;
    colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
    if (colorUpdateTimer >= 1) {
      colorUpdateTimer = wrap(colorUpdateTimer, 0, 1);
      for (const pointer of pointers.values()) pointer.color = newColor();
    }
  }

  function applyInputs(): void {
    for (const pointer of pointers.values()) {
      if (!pointer.moved) continue;
      pointer.moved = false;
      engine.splat(pointer.texcoordX, pointer.texcoordY, pointer.deltaX * config.SPLAT_FORCE, pointer.deltaY * config.SPLAT_FORCE, pointer.color);
    }
  }

  function schedule(): void {
    if (rafId === null) rafId = env.window.requestAnimationFrame(frame);
  }

  function cancelScheduled(): void {
    if (rafId !== null) {
      env.window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function frame(): void {
    rafId = null;
    if (!wantRunning || destroyed || hidden()) return;

    const now = env.now();
    const dt = deltaTime(now, lastTime);
    lastTime = now;

    // A canvas with no size (display: none, a collapsed layout) has nothing to draw; wait for one.
    if (canvas.clientWidth < 1 || canvas.clientHeight < 1) {
      schedule();
      return;
    }

    if (resizeCanvas() || !initialized) {
      engine.initFramebuffers();
      if (!initialized) {
        initialized = true;
        if (config.INITIAL_SPLATS > 0) engine.randomSplats(config.INITIAL_SPLATS, newColor);
      }
    }

    updateColors(dt);
    applyInputs();
    engine.step(dt);
    engine.render();
    schedule();
  }

  // Drawing pauses while the tab is hidden and resumes, with a fresh clock, when it is visible.
  function onVisibilityChange(): void {
    if (!wantRunning || destroyed) return;
    if (hidden()) {
      cancelScheduled();
    } else {
      lastTime = env.now();
      schedule();
    }
  }

  function onContextLost(event: Event): void {
    // Give up rather than rebuild: the page falls back to plain white.
    event.preventDefault();
    fluid.destroy();
    options.onFailure?.("context-lost");
  }
  canvas.addEventListener("webglcontextlost", onContextLost);

  const fluid: Fluid = {
    start() {
      if (destroyed || wantRunning) return;
      wantRunning = true;
      detachInput = attachInput(env, canvas, sink);
      env.document.addEventListener("visibilitychange", onVisibilityChange);
      lastTime = env.now();
      if (!hidden()) schedule();
    },
    stop() {
      if (!wantRunning) return;
      wantRunning = false;
      cancelScheduled();
      detachInput?.();
      detachInput = null;
      env.document.removeEventListener("visibilitychange", onVisibilityChange);
      pointers.clear();
    },
    destroy() {
      if (destroyed) return;
      fluid.stop();
      destroyed = true;
      // Before releasing the context, so the browser's context-lost event is not mistaken for a failure.
      canvas.removeEventListener("webglcontextlost", onContextLost);
      engine.dispose();
    },
    splat(x, y, dx, dy) {
      if (destroyed || !initialized) return;
      engine.splat(x, y, dx, dy, newColor());
    },
    get running() {
      return wantRunning;
    },
    get destroyed() {
      return destroyed;
    },
  };

  return { ok: true, fluid };
}
