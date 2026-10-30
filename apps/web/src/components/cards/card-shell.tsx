import type { ReactNode } from "react";

// The common look of every stored card: a soft white surface with a hairline border and a gentle shadow.
export const CARD_SURFACE = "rounded-3xl border border-neutral-200/80 bg-white shadow-[0_10px_40px_-12px_rgba(23,23,23,0.14)]";

export function Pill({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">{children}</span>;
}

export function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

export const LINK_PILL =
  "inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-800 transition-colors hover:border-[#0171E3] hover:text-[#0171E3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0171E3]";
