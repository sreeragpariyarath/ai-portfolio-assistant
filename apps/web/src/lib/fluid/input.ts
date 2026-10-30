// Pointer input for the water effect, replacing the demo's canvas-only mouse and touch handlers.
//
// The demo listens on its canvas, but here the canvas sits behind the page, so every event is
// listened for on the window. Pointer events cover mouse, touch and pen in one set. Nothing calls
// preventDefault (the demo did, for touch, which would block taps on the input and chips); a touch
// drag stays ours because the page sets `touch-action: none` on the home screen.

import { toCanvasPixels } from "./pointers.ts";
import type { FluidEnv } from "./env.ts";

export type PointerKind = "mouse" | "touch" | "pen";

export interface InputSink {
  down(id: number, kind: PointerKind, x: number, y: number): void;
  move(id: number, kind: PointerKind, x: number, y: number): void;
  up(id: number, kind: PointerKind): void;
  // The mouse left the page, or the window lost focus: forget every pointer.
  leave(): void;
}

const INTERACTIVE =
  "input, textarea, select, button, a[href], [role='button'], [role='textbox'], [contenteditable=''], [contenteditable='true'], [data-fluid-ignore]";

// True when `target` is, or sits inside, something the visitor operates (a field, a button, a link).
// A touch that starts there is not a stir: it is a tap, a text selection or a scroll.
export function isInteractiveTarget(target: unknown): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  return typeof element?.closest === "function" && element.closest(INTERACTIVE) !== null;
}

function kindOf(pointerType: string): PointerKind {
  if (pointerType === "mouse" || pointerType === "pen") return pointerType;
  // Touch, and anything unknown, needs contact: the safer reading.
  return "touch";
}

export function attachInput(
  env: FluidEnv,
  canvas: { width: number; height: number; getBoundingClientRect(): { left: number; top: number; width: number; height: number } },
  sink: InputSink,
): () => void {
  const options: AddEventListenerOptions = { passive: true };
  const position = (event: PointerEvent) => toCanvasPixels(event.clientX, event.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height);

  const onDown = (raw: Event) => {
    const event = raw as PointerEvent;
    const kind = kindOf(event.pointerType);
    if (kind !== "mouse" && isInteractiveTarget(event.target)) return;
    const { x, y } = position(event);
    sink.down(event.pointerId, kind, x, y);
  };
  const onMove = (raw: Event) => {
    const event = raw as PointerEvent;
    const { x, y } = position(event);
    sink.move(event.pointerId, kindOf(event.pointerType), x, y);
  };
  const onUp = (raw: Event) => {
    const event = raw as PointerEvent;
    sink.up(event.pointerId, kindOf(event.pointerType));
  };
  const onOut = (raw: Event) => {
    const event = raw as PointerEvent;
    // relatedTarget is null when the pointer leaves the page entirely, not just one element.
    if (event.pointerType === "mouse" && event.relatedTarget === null) sink.leave();
  };
  const onBlur = () => sink.leave();

  const win = env.window;
  win.addEventListener("pointerdown", onDown, options);
  win.addEventListener("pointermove", onMove, options);
  win.addEventListener("pointerup", onUp, options);
  win.addEventListener("pointercancel", onUp, options);
  win.addEventListener("pointerout", onOut, options);
  win.addEventListener("blur", onBlur, options);

  return () => {
    win.removeEventListener("pointerdown", onDown, options);
    win.removeEventListener("pointermove", onMove, options);
    win.removeEventListener("pointerup", onUp, options);
    win.removeEventListener("pointercancel", onUp, options);
    win.removeEventListener("pointerout", onOut, options);
    win.removeEventListener("blur", onBlur, options);
  };
}
