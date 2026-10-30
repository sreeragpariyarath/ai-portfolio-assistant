// The stored content behind the home-page chips (task 4.11): shown instantly, with no assistant call.
// Dummy values for now; the owner's real ones arrive with the real-data switch (D-022). It is kept apart
// from the knowledge records on purpose, so what the assistant retrieves and is evaluated on stays as it is.
// A phone number is never stored here (the tests check for one).

export type CardKind = "profile" | "projects" | "skills" | "contact";

export interface ProfileCard {
  name: string;
  headline: string;
  location: string;
  // Replace with the owner's photo (a path under /public, placeholder: false) when it is supplied.
  photo: { src: string; alt: string; placeholder: boolean };
  bio: string;
  // Short, plain facts shown as small pills.
  facts: readonly string[];
}

export interface ProjectCard {
  id: string;
  title: string;
  tagline: string;
  period: string;
  description: string;
  highlights: readonly string[];
  tech: readonly string[];
  // A path under /public once the owner supplies a picture; until then the gradient below is the image.
  image?: string;
  // Two CSS colours for the placeholder gradient.
  colors: readonly [string, string];
  links: readonly { label: string; href: string }[];
  // The knowledge record this project comes from, for "read the source record".
  recordId?: string;
}

export interface SkillGroup {
  name: string;
  skills: readonly string[];
}

export interface ContactCard {
  email: string;
  links: readonly { label: string; href: string }[];
}

export const PROFILE: ProfileCard = {
  name: "Sreerag",
  headline: "Full Stack Engineer",
  location: "Kerala, India",
  photo: { src: "/avatar-placeholder.svg", alt: "Portrait of Sreerag (placeholder)", placeholder: true },
  bio: "I'm a full stack engineer who builds web products from the database to the pixels.",
  facts: ["Full stack", "TypeScript", "Cloud and AI"],
};

// Shown under the profile header, so it reads as the "about me" text (dummy until the real wording).
export const PROFILE_INTRO =
  "Hi, I'm Sreerag, a full stack engineer. I build web products from the database to the pixels, and lately I've been working on AI search and assistants.\n\nThis page is a portfolio you can talk to. Pick a card below, or type any question and my assistant will answer from my portfolio. What brings you here?";

export const PROJECTS: readonly ProjectCard[] = [
  {
    id: "portfolio-assistant",
    title: "AI Portfolio Assistant",
    tagline: "Ask questions about my work and get cited answers.",
    period: "2026",
    description: "A chat assistant that answers from my portfolio only. It searches my public records, writes a short answer with sources and refuses private questions.",
    highlights: ["Hybrid search over keywords and meaning", "Answers stream live, with source links", "Private records never reach the model"],
    tech: ["TypeScript", "Cloudflare Workers", "Next.js", "Gemini", "Qdrant"],
    colors: ["#7dd3fc", "#a78bfa"],
    links: [{ label: "Source code", href: "https://example.com/portfolio-assistant" }],
    recordId: "project-demo-001",
  },
  {
    id: "dashboard",
    title: "Analytics Dashboard",
    tagline: "Live charts for a small sales team.",
    period: "2025",
    description: "A dashboard that turns raw orders into daily, weekly and monthly views, with filters the team can share as a link.",
    highlights: ["Loads in under a second on a phone", "Shareable filtered views", "Role based access for managers"],
    tech: ["React", "Node.js", "PostgreSQL", "Docker"],
    colors: ["#86efac", "#38bdf8"],
    links: [{ label: "Live demo", href: "https://example.com/dashboard" }],
    recordId: "project-demo-002",
  },
  {
    id: "booking-app",
    title: "Booking App",
    tagline: "Appointments without the phone calls.",
    period: "2024",
    description: "A booking tool for a local clinic: patients pick a slot, get a reminder and can reschedule in two taps.",
    highlights: ["Reminders by email", "Works on slow networks", "Cut no-shows by a third"],
    tech: ["Next.js", "Prisma", "PostgreSQL", "Tailwind"],
    colors: ["#fcd34d", "#fb7185"],
    links: [{ label: "Case study", href: "https://example.com/booking-app" }],
    recordId: "project-demo-003",
  },
  {
    id: "design-system",
    title: "Component Library",
    tagline: "One set of buttons for every product.",
    period: "2024",
    description: "A shared, accessible component library with a documentation site, used across three internal products.",
    highlights: ["Keyboard and screen reader tested", "Themeable with design tokens", "Published as a package"],
    tech: ["React", "TypeScript", "Storybook", "Vitest"],
    colors: ["#f9a8d4", "#818cf8"],
    links: [{ label: "Documentation", href: "https://example.com/components" }],
    recordId: "project-demo-004",
  },
];

export const SKILL_GROUPS: readonly SkillGroup[] = [
  { name: "Front end", skills: ["TypeScript", "React", "Next.js", "Tailwind CSS", "Accessibility"] },
  { name: "Back end", skills: ["Node.js", "Cloudflare Workers", "PostgreSQL", "REST APIs"] },
  { name: "AI and search", skills: ["Gemini", "RAG", "Qdrant", "Evaluation"] },
  { name: "Tools", skills: ["Git", "Docker", "GitHub Actions", "Playwright"] },
];

// example.com addresses are reserved for examples; the real ones come with the real-data switch.
export const CONTACT: ContactCard = {
  email: "hello@example.com",
  links: [
    { label: "LinkedIn", href: "https://www.linkedin.com/in/example" },
    { label: "GitHub", href: "https://github.com/example" },
    { label: "Portfolio", href: "https://example.com" },
  ],
};

// What the assistant says above each card.
export const CARD_INTROS: Record<CardKind, string> = {
  profile: PROFILE_INTRO,
  projects: "Here are some things I've built. Tap a card for the details.",
  skills: "Here is what I work with, grouped by area.",
  contact: "Here's how to reach me.",
};
