import { flushSync } from "react-dom";
import { canMorph } from "../../cards/card-morph.ts";

// Runs a state change that moves the input and the quick questions (named "dock-input" and "dock-chips" in the
// home screen and the chat). Where View Transitions work they glide to their new place instead of jumping.
export function withDockGlide(change: () => void) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!canMorph({ startViewTransition: document.startViewTransition, reducedMotion: reduce })) {
    change();
    return;
  }
  // The names exist only during this transition, so other transitions (the project dialog) are not affected.
  const root = document.documentElement;
  root.classList.add("dock-gliding");
  const transition = document.startViewTransition(() => flushSync(change));
  const done = () => root.classList.remove("dock-gliding");
  transition.finished.then(done, done);
}
