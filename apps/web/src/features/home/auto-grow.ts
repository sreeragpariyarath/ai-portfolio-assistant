// The box a visitor types a question in grows with the text, like the message box in ChatGPT: it starts as one line,
// gets taller as the text wraps, and stops at a few lines (then it scrolls inside). This is the plain arithmetic;
// the hook that applies it to the page is in components/use-auto-grow.ts.

export const MAX_INPUT_LINES = 6;

export type GrowResult = {
  // Height to give the box, in px.
  height: number;
  // True when the text needs more than one line.
  multiline: boolean;
  // True when the text is taller than the maximum, so the box has to scroll inside.
  scrolls: boolean;
};

// `contentHeight` is the text's own height (scrollHeight minus the padding), `lineHeight` one line, `padding` the
// top and bottom padding together.
export function growBox(contentHeight: number, lineHeight: number, padding: number, maxLines = MAX_INPUT_LINES): GrowResult {
  const line = lineHeight > 0 ? lineHeight : 1;
  const lines = Math.max(1, Math.round(contentHeight / line));
  const shown = Math.min(lines, maxLines);
  return { height: shown * line + padding, multiline: lines > 1, scrolls: lines > maxLines };
}

// Enter sends; Shift+Enter makes a new line. Never send while an input method (such as a phone's predictive text or
// an East Asian keyboard) is still composing a word.
export function isSendKey(event: { key: string; shiftKey: boolean; isComposing: boolean }): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing;
}
