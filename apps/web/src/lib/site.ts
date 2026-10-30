// What the home page says. One place, so the wording is easy to change. Pure, so the root tests can run it.

export const SITE = {
  name: "sreerag",
  greeting: "Hey, I'm",
  headline: "AI Engineer",
  title: "sreerag",
  description: "Ask my AI assistant anything about me, my projects and my skills.",
  inputPlaceholder: "Ask me anything…",
} as const;

export type StarterId = "me" | "projects" | "skills" | "fun" | "contact";

export interface Starter {
  id: StarterId;
  label: string;
  // Sent as the question when the chip is pressed. Chosen to be answerable from the public records
  // (profile, projects, contributions, decisions); there is nothing in them about hobbies or contact
  // details, so "Fun" and "Contact" lead to an honest "I don't have that" answer.
  question: string;
}

export const STARTERS: readonly Starter[] = [
  { id: "me", label: "Me", question: "Who are you? Give me a short introduction." },
  { id: "projects", label: "Projects", question: "What projects have you worked on?" },
  { id: "skills", label: "Skills", question: "What are your web development skills?" },
  { id: "fun", label: "Fun", question: "What are you curious about or learning right now?" },
  { id: "contact", label: "Contact", question: "How can I contact you?" },
];
