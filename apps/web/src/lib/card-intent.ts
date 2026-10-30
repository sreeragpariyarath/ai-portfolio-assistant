import type { CardKind } from "./portfolio-cards.ts";

// Decides whether a typed message is a plain request for one of the stored cards ("show projects",
// "which works have u done") rather than a real question. Only short requests count: a longer, more
// specific question ("which projects used React and why?") goes to the assistant, which can cite sources.

const MAX_WORDS = 10;

// Spellings and slang people really type, mapped to the words the rules know.
const ALIASES: Record<string, string> = {
  u: "you",
  ur: "your",
  ya: "you",
  pls: "please",
  plz: "please",
  proj: "projects",
  project: "projects",
  works: "work",
  skill: "skills",
  technologies: "tech",
  technology: "tech",
  build: "built",
  made: "built",
  contacts: "contact",
  mail: "email",
};

// Words that carry no meaning for the match.
const FILLER = new Set([
  "a", "an", "the", "me", "my", "your", "you", "are", "is", "do", "does", "did", "have", "has", "can", "could", "would",
  "will", "please", "tell", "show", "see", "list", "give", "let", "i", "us", "of", "to", "for", "about", "all", "some",
  "which", "what", "what's", "whats", "any", "like", "want", "know", "out", "on", "in", "with", "and", "or", "it", "this",
  "that", "so", "hey", "hi", "hello", "ok", "okay", "yes", "now", "just", "ever", "far", "how", "where", "get", "done",
  "s", "re", "ve", "d", "worked",
]);

// What each card answers to: after the filler words are removed, at least one word must name the topic
// (`needs`) and every word must be one the topic accepts (`also` adds the harmless extras).
const TOPICS: { kind: CardKind; needs: readonly string[]; also: readonly string[] }[] = [
  { kind: "projects", needs: ["projects", "work", "built", "portfolio"], also: ["latest", "recent", "best", "top"] },
  { kind: "skills", needs: ["skills", "stack", "tech", "tools", "strengths"], also: [] },
  { kind: "contact", needs: ["contact", "email", "reach", "hire", "touch"], also: ["details", "info", "address"] },
];

function wordsOf(message: string): string[] {
  return message
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word !== "")
    .map((word) => ALIASES[word] ?? word);
}

export function matchCardIntent(message: string): CardKind | null {
  const all = wordsOf(message);
  if (all.length === 0 || all.length > MAX_WORDS) return null;

  // "who are you" and "introduce yourself" show the profile card.
  if (/^\s*(who\s+(are|r)\s+(you|u)|introduce\s+yourself|tell\s+me\s+about\s+yourself)[\s?.!]*$/i.test(message)) return "profile";

  const meaningful = all.filter((word) => !FILLER.has(word));
  if (meaningful.length === 0) return null;
  for (const { kind, needs, also } of TOPICS) {
    // A word outside the topic means it is a real question for the assistant.
    if (meaningful.some((word) => needs.includes(word)) && meaningful.every((word) => needs.includes(word) || also.includes(word))) return kind;
  }
  return null;
}
