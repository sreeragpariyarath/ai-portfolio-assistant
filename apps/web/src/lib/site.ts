// What the home page says. One place, so the wording is easy to change. Pure, so the root tests can run it.

export const SITE = {
  name: "sreerag",
  greeting: "Hey, I'm",
  headline: "Full Stack Engineer",
  title: "sreerag",
  description: "Ask my AI assistant anything about me, my projects and my skills.",
  inputPlaceholder: "Ask me anything…",
  // Shown on every record page while the assistant uses the fictional dataset (D-022).
  recordsNote: "Demo record from a fictional dataset, used while the assistant is being built.",
} as const;

import type { CardKind } from "./portfolio-cards.ts";

export type StarterId = "me" | "projects" | "skills" | "fun" | "contact";

export interface Starter {
  id: StarterId;
  label: string;
  // Typed into the chat as the visitor's message when the chip is pressed.
  question: string;
  // When set, the chip shows this stored card instantly (task 4.11) instead of asking the assistant.
  // "Fun" has none yet: it still asks the assistant.
  card?: CardKind;
}

export const STARTERS: readonly Starter[] = [
  { id: "me", label: "Me", question: "Who are you? Give me a short introduction.", card: "profile" },
  { id: "projects", label: "Projects", question: "What projects have you worked on?", card: "projects" },
  { id: "skills", label: "Skills", question: "What are your web development skills?", card: "skills" },
  { id: "fun", label: "Fun", question: "What are you curious about or learning right now?" },
  { id: "contact", label: "Contact", question: "How can I contact you?", card: "contact" },
];
