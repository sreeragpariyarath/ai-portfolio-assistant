// How a project card grows into its detail dialog. The browser's View Transitions API does the real work
// (the card and the dialog share a transition name, so the card becomes the dialog); this file holds the
// two decisions that need testing: when to use it, and the fallback motion for browsers without it.

// The name the card and the dialog share while one becomes the other.
export const PROJECT_PANEL_TRANSITION = "project-panel";

export interface MorphSupport {
  // `document.startViewTransition`, or undefined where the browser does not have it.
  startViewTransition: unknown;
  reducedMotion: boolean;
}

// Visitors who ask for reduced motion get an instant dialog, never an animation.
export function canMorph({ startViewTransition, reducedMotion }: MorphSupport): boolean {
  return !reducedMotion && typeof startViewTransition === "function";
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Keyframes that make the dialog start where the card was (same place, same size) and settle in its own place.
// For browsers without view transitions: the whole dialog is scaled, which is simpler than the morph but still
// shows where it came from. A box with no size gives a plain fade.
export function growFrom(from: Box, to: Box): { opacity: number; transform: string }[] {
  if (from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) {
    return [{ opacity: 0, transform: "none" }, { opacity: 1, transform: "none" }];
  }
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const scaleX = from.width / to.width;
  const scaleY = from.height / to.height;
  return [
    { opacity: 0.35, transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})` },
    { opacity: 1, transform: "none" },
  ];
}
