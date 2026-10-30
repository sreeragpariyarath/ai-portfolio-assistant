import type { ReactNode } from "react";
import type { StarterId } from "@/features/home/site";

// Small stroke icons, one colour each, as in the design. Drawn inline to avoid an icon dependency.
const ICONS: Record<StarterId, { color: string; paths: ReactNode }> = {
  me: {
    color: "#329696",
    paths: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2" />
        <path d="M9 9.5h.01M15 9.5h.01" />
      </>
    ),
  },
  projects: {
    color: "#3e9858",
    paths: (
      <>
        <rect x="2.5" y="7" width="19" height="13" rx="2" />
        <path d="M8.5 7V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2M2.5 13a17 17 0 0 0 19 0" />
      </>
    ),
  },
  skills: {
    color: "#856ed9",
    paths: (
      <>
        <path d="m12 3 9 4.5-9 4.5-9-4.5z" />
        <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
      </>
    ),
  },
  fun: {
    color: "#b95f9d",
    paths: (
      <>
        <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
        <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8zM5 3l.6 1.4L7 5l-1.4.6L5 7l-.6-1.4L3 5l1.4-.6z" />
      </>
    ),
  },
  contact: {
    color: "#c19433",
    paths: (
      <>
        <circle cx="10" cy="8" r="4.5" />
        <path d="M2.5 21a7.5 7.5 0 0 1 9.6-7.2" />
        <circle cx="18" cy="18" r="3" />
        <path d="m22 22-1.9-1.9" />
      </>
    ),
  },
};

export function StarterIcon({ id }: { id: StarterId }) {
  const { color, paths } = ICONS[id];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}
