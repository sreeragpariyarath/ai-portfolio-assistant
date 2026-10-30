// Stored opening lines for an answer that has nothing relevant in the records (behavior "abstain").
// Written by the owner's pick, not by the model: the joke is always about the gap, never about a fact,
// and a stored line costs no assistant call. Refusals, partial answers and real answers never use these.
// Keep them free of names (the dataset's name and the site's name differ until D-022) and of any claim.
export const ABSTAIN_LINES: readonly string[] = [
  "Plot twist: I have no idea. My notes are as confused as you are.",
  "You've just found the one thing my notes don't cover. Congratulations, I guess?",
  "I searched my whole memory for that. Found one dust bunny and a blank page.",
  "That's a great question. Shame my brain only holds portfolio facts.",
  "My notes went quiet on that one. Even the footnotes.",
  "I'd answer, but I'd have to make it up, and I'm a terrible liar.",
  "I'm a portfolio assistant, not a psychic. That one's out of my range.",
  "If I had an answer for that, I'd tell you. I'd also be suspicious of myself.",
  "Not in my notes. I checked twice, and a third time just to be dramatic.",
  "Bold question. Zero data. I admire the confidence, though.",
  "You've out-asked my notes. Round one goes to you.",
  "That one's not in the files. Maybe it's in a different file, in a different universe.",
  "Ask me something I can answer and I'll look brilliant. This isn't that.",
];

// The same message always gets the same line (so a re-render never changes it), and different messages
// spread across the list.
export function pickAbstainLine(messageId: string): string {
  let hash = 0;
  for (const char of messageId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ABSTAIN_LINES[hash % ABSTAIN_LINES.length] as string;
}

// The model's own reply starts with its own "I don't have that" sentence, which the stored line replaces.
// What follows (the offer of topics it can talk about) is kept. While the first sentence is still arriving
// there is nothing to show yet.
export function withoutFirstSentence(text: string): string {
  const match = /^[\s\S]*?[.!?](?=\s|$)\s*/.exec(text);
  return match === null ? "" : text.slice(match[0].length);
}
