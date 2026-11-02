# Stored card content (draft, in the owner's voice)

Paste these into `apps/web/src/features/cards/portfolio-cards.ts` (and `apps/web/src/features/home/site.ts`) at the real-data switch. Rules: first person, short, plain English; **no phone number, no home address**; no colleague or client names. The existing tests check for a phone number and for unsafe links.

## Site wording (`site.ts`)
```ts
export const SITE = {
  name: "sreerag",
  greeting: "Hey, I'm",
  headline: "Full Stack Engineer",
  title: "sreerag",
  description: "Ask my AI assistant anything about me, my projects and my skills.",
  inputPlaceholder: "Ask me anything…",
} as const; // remove recordsNote and the "Demo record from a fictional dataset" note on record pages
```

## Profile (`PROFILE`, `PROFILE_INTRO`)
```ts
export const PROFILE: ProfileCard = {
  name: "Sreerag",
  headline: "Full Stack Engineer",
  location: "Indore, India · open to relocating",
  photo: { src: "/sreerag.webp", alt: "Portrait of Sreerag P", placeholder: false },
  bio: "Hey 👋 I'm a full stack engineer. I build web products from the database to the pixels: APIs, admin panels, store billing, real-time features and the screens people use.",
  facts: ["Full stack", "TypeScript", "Angular", "AI and RAG"],
};

export const PROFILE_INTRO =
  "Hi, I'm Sreerag, a full stack engineer from Kerala, working in Indore. I mostly build the backend and admin side of products, and I love making the screens good too. Lately I've been building AI search and assistants.\n\nThis page is a portfolio you can talk to. Pick a card below, or type any question and my assistant will answer from my portfolio. What brings you here?";
```

## Projects (`PROJECTS`), in this order
Each card needs a picture at `apps/web/public/projects/<id>.webp` (portrait, about 3:4; until then the gradient shows). `recordId` points at the overview record in `records.draft.v1.json`.

| id | title | period | tagline (shown on the glass strip) | tech (first three shown) | links | recordId | gradient |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `learnwithhupe` | LearnWithHupe | 2026 | A learning app for kids aged 2 to 8, live on both app stores. | Node.js, MongoDB, React | Google Play, App Store (see `project-lwh-001`) | `project-lwh-001` | `#86efac` `#38bdf8` |
| `portfolio-assistant` | AI Portfolio Assistant | 2026 | This site: ask me anything and get cited answers. | TypeScript, Gemini, Qdrant | Source code (add once the repository is public) | `project-portfolio-001` | `#7dd3fc` `#a78bfa` |
| `pm-tool` | PM Tool and Sales Tool | 2026 | Project management and sales, connected. Built with my team. | Next.js, Node.js, MongoDB | none (internal) | `project-pmt-001` | `#fcd34d` `#fb7185` |
| `warvox` | Warvox | 2025 | A game website with a 3D model viewer and 11 languages. Launching soon. | Next.js, Node.js, Redis | none yet | `project-warvox-001` | `#f9a8d4` `#818cf8` |
| `erris` | Erris | 2026 | Typed error contracts for JavaScript and TypeScript. Open source. | TypeScript, Node.js, npm | GitHub, npm | `project-erris-001` | `#a5b4fc` `#67e8f9` |
| `upthrust` | Upthrust | 2025 | A learning platform with its own CMS and LMS. Built solo. | React, Node.js, MongoDB | add if public | `project-upthrust-001` | `#bef264` `#34d399` |
| `yexora` | Yexora Website | 2026 | A 3D, glass-style company site for a client. | Next.js, Three.js, Tailwind | yexoraitsolutions.com | `project-yexora-001` | `#c4b5fd` `#f0abfc` |
| `hrms` | HRMS | 2025 | An internal HR platform used by about 80 people. | React, Node.js, WebSockets | none (internal) | `project-hrms-001` | `#fdba74` `#fca5a5` |

Also available as extra cards if wanted: **Norix CLI** (`project-norix-001`, npm and GitHub links) and **Carina website migration** (`project-carina-001`).

The long descriptions, three highlights per project and the links come from the matching records; keep them short. For the dialog: `description` = the first sentence of the overview record; `highlights` = three bullets from the contribution records.

## Skills (`SKILL_GROUPS`)
```ts
export const SKILL_GROUPS: readonly SkillGroup[] = [
  { name: "Front end", skills: ["React", "Next.js", "Angular", "TypeScript", "Tailwind CSS", "Three.js"] },
  { name: "Back end", skills: ["Node.js", "Express", "NestJS", "REST APIs", "WebSockets", "Stripe"] },
  { name: "Data and cloud", skills: ["MongoDB", "PostgreSQL", "Redis", "AWS", "Cloudflare", "Docker"] },
  { name: "AI and tools", skills: ["Gemini", "RAG", "Qdrant", "Claude Code", "Git", "Playwright"] },
];
```

## Contact (`CONTACT`)
```ts
export const CONTACT: ContactCard = {
  email: "psreerag69@gmail.com",
  note: "Open to full-stack roles · open to relocating",
  links: [
    { label: "LinkedIn", href: "https://www.linkedin.com/in/sreerag-p" },
    { label: "GitHub", href: "https://github.com/sreeragpariyarath" },
    { label: "Portfolio", href: "https://sreerag.pages.dev" },
  ],
};
```
(`note` is a field added on the laptop in the unpushed contact-card redesign; if that work is not merged, drop the line.)

## New: the Fun card (needs a new card kind `fun`)
A stored card like Contact: no assistant call, appears instantly. Content, in his voice:
```ts
export const FUN = {
  title: "Beyond the code",
  intro: "When I'm not building, you'll find me here. Ask me about any of it!",
  groups: [
    { name: "Watching", items: ["Naruto", "Attack on Titan", "Demon Slayer", "Jujutsu Kaisen", "Frieren", "Solo Leveling"] },
    { name: "Movies", items: ["Marvel", "DC", "Sci-fi", "Action", "Mystery"] },
    { name: "Travel", items: ["Delhi", "Nepal", "Bengaluru", "Mumbai", "Madhya Pradesh", "Kerala"] },
    { name: "Music", items: ["Listening all day", "Learning guitar (week 3!)"] },
    { name: "Curious about", items: ["Space", "Physics", "Black holes", "The multiverse"] },
  ],
};
```
Work to do: add `"fun"` to `CardKind`, a `FunCardView` component with the same glass card style as the contact card, map the Fun starter to it, add `CARD_INTROS.fun` ("Here's what I do when I'm not coding.") and a test. The guitar line goes stale: change "week 3" to a neutral wording when it ages.
