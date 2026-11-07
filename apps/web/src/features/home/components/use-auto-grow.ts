import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import { growBox } from "../auto-grow.ts";

// Makes a textarea as tall as its text (up to a few lines). Returns whether it needs more than one line, so the
// caller can change the pill's corners and where the buttons sit.
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string): boolean {
  const [multiline, setMultiline] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const style = window.getComputedStyle(element);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const lineHeight = parseFloat(style.lineHeight);
    // Measure the text at its natural height: collapse the box first, then read how tall the text is.
    element.style.height = "0px";
    const result = growBox(element.scrollHeight - padding, lineHeight, padding);
    element.style.height = `${result.height}px`;
    element.style.overflowY = result.scrolls ? "auto" : "hidden";
    setMultiline(result.multiline);
  }, [ref, value]);

  return multiline;
}
