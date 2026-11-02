// What the home page says. One place, so the wording is easy to change. Pure, so the root tests can run it.

export const SITE = {
  name: "sreerag",
  greeting: "Hey, I'm",
  headline: "Full Stack Engineer",
  title: "sreerag",
  description: "Ask my AI assistant anything about me, my projects and my skills.",
  inputPlaceholder: "Ask me anything…",
} as const;

import type { CardKind } from "../cards/portfolio-cards.ts";

export type StarterId = "me" | "projects" | "skills" | "fun" | "contact";

export interface Starter {
  id: StarterId;
  label: string;
  // Typed into the chat as the visitor's message when the chip is pressed.
  question: string;
  // When set, the chip shows this stored card instantly (task 4.11) instead of asking the assistant.
  card?: CardKind;
}

export const STARTERS: readonly Starter[] = [
  { id: "me", label: "Me", question: "Who are you? Give me a short introduction.", card: "profile" },
  { id: "projects", label: "Projects", question: "What projects have you worked on?", card: "projects" },
  { id: "skills", label: "Skills", question: "What are your web development skills?", card: "skills" },
  { id: "fun", label: "Fun", question: "What do you do for fun?", card: "fun" },
  { id: "contact", label: "Contact", question: "How can I contact you?", card: "contact" },
];
