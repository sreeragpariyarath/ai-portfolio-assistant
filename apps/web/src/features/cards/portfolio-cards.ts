// The stored content behind the home-page chips (task 4.11): shown instantly, with no assistant call.
// The owner's real content (D-029), written in the first person. It is kept apart
// from the knowledge records on purpose, so what the assistant retrieves and is evaluated on stays as it is.
// A phone number is never stored here (the tests check for one).

export type CardKind = "profile" | "projects" | "skills" | "contact" | "fun";

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
  // Where the picture is anchored when it is cropped wide (the project dialog shows a strip of it), as a CSS
  // object-position, for example "center 60%" to keep the lower middle in view. Defaults to the centre.
  imagePosition?: string;
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

export interface FunGroup {
  name: string;
  items: readonly string[];
}

export interface FunCard {
  title: string;
  groups: readonly FunGroup[];
}

export interface ContactCard {
  email: string;
  // One short line about availability, shown with a small green dot. No location or phone number.
  note: string;
  links: readonly { label: string; href: string }[];
}

export const PROFILE: ProfileCard = {
  name: "Sreerag",
  headline: "Full Stack Engineer",
  location: "Indore, India · open to relocating",
  photo: { src: "/sreerag.webp", alt: "Portrait of Sreerag P", placeholder: false },
  bio: "I'm a full stack engineer. I build web products from the database to the pixels: APIs, admin panels, store billing, real-time features and the screens people use.",
  facts: ["Full stack", "TypeScript", "Angular", "AI and RAG"],
};

// Shown under the profile header, so it reads as the "about me" text.
export const PROFILE_INTRO =
  "Hi, I'm Sreerag, a full stack engineer from Kerala, working in Indore. I mostly build the backend and admin side of products, and I love making the screens good too. Lately I've been building AI search and assistants.\n\nThis page is a portfolio you can talk to. Pick a card below, or type any question and my assistant will answer from my portfolio. What brings you here?";

// In the order they appear. Pictures go in apps/web/public/projects/<id>.webp (portrait, about 3:4) and are
// named in `image`; until then the gradient is the picture.
export const PROJECTS: readonly ProjectCard[] = [
  {
    id: "learnwithhupe",
    image: "/projects/learnwithhupe.webp",
    imagePosition: "center 52%",
    title: "LearnWithHupe",
    tagline: "A learning app for kids aged 2 to 8, live on both app stores.",
    period: "2026",
    description:
      "A curriculum-based learning app for children aged 2 to 8, live on Google Play and the App Store. I built the backend, the billing and the games the children play.",
    highlights: [
      "Backend with sign-in, child profiles, progress and subscriptions",
      "The Phaser.js games children play",
      "Runs on AWS, with real-time features and an admin panel",
    ],
    tech: ["Node.js", "MongoDB", "React", "Phaser.js", "Express", "AWS"],
    colors: ["#86efac", "#38bdf8"],
    links: [
      { label: "Google Play", href: "https://play.google.com/store/apps/details?id=com.hupe.hupe_academy_app" },
      { label: "App Store", href: "https://apps.apple.com/pl/app/learn-with-hupe/id6760534126" },
    ],
    recordId: "project-lwh-001",
  },
  {
    id: "portfolio-assistant",
    image: "/projects/portfolio-assistant.webp",
    imagePosition: "center 42%",
    title: "AI Portfolio Assistant",
    tagline: "This site: ask me anything and get cited answers.",
    period: "2026",
    description:
      "This website is a portfolio you can talk to. It searches my portfolio, writes a short answer with its sources, and keeps private things private.",
    highlights: [
      "Hybrid search: keywords and meaning together",
      "Answers stream live, with source links",
      "Private records never reach the model",
    ],
    tech: ["TypeScript", "Gemini", "Qdrant", "Cloudflare Workers", "Next.js"],
    colors: ["#7dd3fc", "#a78bfa"],
    links: [{ label: "Source code", href: "https://github.com/sreeragpariyarath/ai-portfolio-assistant" }],
    recordId: "project-portfolio-001",
  },
  {
    id: "pm-tool",
    title: "PM Tool and Sales Tool",
    tagline: "Project management and sales, connected. Built with my team.",
    period: "2026",
    description:
      "My company's internal project management app. It connects to the Sales tool and the HR system, so a won deal can become a project without re-entering anything. I worked on it full stack, as part of a team.",
    highlights: [
      "Built the notification system end to end",
      "Employee dashboard with today's tasks and capacity",
      "One sign-in and roles shared with Sales and HR",
    ],
    tech: ["Next.js", "NestJS", "MongoDB", "Socket.io"],
    colors: ["#fcd34d", "#fb7185"],
    links: [],
    recordId: "project-pmt-001",
  },
  {
    id: "warvox",
    image: "/projects/warvox.webp",
    imagePosition: "center 58%",
    title: "Warvox",
    tagline: "A game website with a 3D model viewer and 11 languages. Launching soon.",
    period: "2025–26",
    description:
      "A website and content system for a game platform. It has game pages, a forum, an admin panel and automatic translation. It has not launched publicly yet.",
    highlights: [
      "Built the site, the backend and the admin APIs",
      "3D viewer for swords, weapons and armour",
      "Content translated automatically into 11 languages",
    ],
    tech: ["Next.js", "Node.js", "Three.js", "AWS Translate"],
    colors: ["#f9a8d4", "#818cf8"],
    links: [],
    recordId: "project-warvox-001",
  },
  {
    id: "erris",
    image: "/projects/erris.webp",
    imagePosition: "center 22%",
    title: "Erris",
    tagline: "Typed error contracts for JavaScript and TypeScript. Open source.",
    period: "2026",
    description:
      "My open source project: one typed way to describe failure in JavaScript and TypeScript apps. Four packages are published on npm.",
    highlights: [
      "Four packages live on npm",
      "A core with zero dependencies",
      "Built and tested with TypeScript and Vitest",
    ],
    tech: ["TypeScript", "Node.js", "npm"],
    colors: ["#a5b4fc", "#67e8f9"],
    links: [
      { label: "GitHub", href: "https://github.com/sreeragpariyarath/erris" },
      { label: "npm", href: "https://www.npmjs.com/package/@erris/core" },
    ],
    recordId: "project-erris-001",
  },
  {
    id: "upthrust",
    image: "/projects/upthrust.webp",
    imagePosition: "center 30%",
    title: "Upthrust",
    tagline: "A learning platform with its own CMS and LMS. Built solo.",
    period: "2025",
    description:
      "A learning and training platform for an education company, with a public website, a CMS admin panel and a learning management system. I built all of it alone.",
    highlights: [
      "The website, the APIs and the admin panel, all by me",
      "Includes a learning management system",
      "The company can hire students from it",
    ],
    tech: ["React", "Node.js", "MongoDB"],
    colors: ["#bef264", "#34d399"],
    links: [],
    recordId: "project-upthrust-001",
  },
  {
    id: "yexora",
    image: "/projects/yexora.webp",
    imagePosition: "center 50%",
    title: "Yexora Website",
    tagline: "A 3D, glass-style company site for a client.",
    period: "2026",
    description:
      "A marketing site I built for a client: one scrolling page over a 3D light scene, with glass panels, a works reel and a contact form. It is live.",
    highlights: [
      "A 3D light scene behind liquid-glass panels",
      "A works reel with videos from Cloudflare",
      "A static site with no backend",
    ],
    tech: ["Next.js", "Three.js", "Tailwind CSS"],
    colors: ["#c4b5fd", "#f0abfc"],
    links: [{ label: "Visit the site", href: "https://yexoraitsolutions.com" }],
    recordId: "project-yexora-001",
  },
  {
    id: "hrms",
    image: "/projects/hrms.webp",
    imagePosition: "center 22%",
    title: "HRMS",
    tagline: "An internal HR platform used by about 80 people.",
    period: "2025",
    description:
      "My company's internal HR platform, used by about 80 people. I built employee screens and connected them to the backend while it was already in progress.",
    highlights: [
      "Dashboard with check-in and a break timer",
      "Leave, calendar, policies and complaints screens",
      "Front end connected to the backend APIs",
    ],
    tech: ["React", "Node.js", "WebSockets"],
    colors: ["#fdba74", "#fca5a5"],
    links: [],
    recordId: "project-hrms-001",
  },
];

export const SKILL_GROUPS: readonly SkillGroup[] = [
  { name: "Front end", skills: ["React", "Next.js", "Angular", "TypeScript", "Tailwind CSS", "Three.js"] },
  { name: "Back end", skills: ["Node.js", "Express", "NestJS", "REST APIs", "WebSockets", "Stripe"] },
  { name: "Data and cloud", skills: ["MongoDB", "PostgreSQL", "Redis", "AWS", "Cloudflare", "Docker"] },
  { name: "AI and tools", skills: ["Gemini", "RAG", "Qdrant", "Claude Code", "Git", "Playwright"] },
];

export const CONTACT: ContactCard = {
  email: "psreerag69@gmail.com",
  note: "Open to full-stack roles · open to relocating",
  links: [
    { label: "LinkedIn", href: "https://www.linkedin.com/in/sreerag-p" },
    { label: "GitHub", href: "https://github.com/sreeragpariyarath" },
    { label: "Portfolio", href: "https://sreerag.pages.dev" },
  ],
};

export const FUN: FunCard = {
  title: "Beyond the code",
  groups: [
    { name: "Watching", items: ["Naruto", "Attack on Titan", "Demon Slayer", "Jujutsu Kaisen", "Frieren", "Solo Leveling"] },
    { name: "Movies", items: ["Marvel", "DC", "Sci-fi", "Action", "Mystery"] },
    { name: "Travel", items: ["Delhi", "Nepal", "Bengaluru", "Mumbai", "Madhya Pradesh", "Kerala"] },
    { name: "Music", items: ["Listening all day", "Learning the guitar"] },
    { name: "Curious about", items: ["Space", "Physics", "Black holes", "The multiverse"] },
  ],
};

// What the assistant says above each card.
export const CARD_INTROS: Record<CardKind, string> = {
  profile: PROFILE_INTRO,
  projects: "Here are some things I've built. Tap a card for the details.",
  skills: "Here is what I work with, grouped by area.",
  contact: "Here's how to reach me.",
  fun: "Here's what I do when I'm not coding. Ask me about any of it!",
};
