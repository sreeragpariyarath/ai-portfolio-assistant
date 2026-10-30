"use client";

import Image from "next/image";
import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MAX_QUESTION_CHARS } from "@/lib/chat-client";
import { SITE, STARTERS } from "@/lib/site";
import type { StarterId } from "@/lib/site";
import { FluidBackground } from "./fluid-background";
import { LiquidGlass } from "./liquid-glass";

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

function StarterIcon({ id }: { id: StarterId }) {
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

// The one-screen home page: no scrolling, pure white, water that follows the mouse or a finger.
// `onAsk` starts the chat (task 4.6). Until it is given, the chips fill the input and sending is off.
export function HomeScreen({ onAsk }: { onAsk?: (question: string) => void }) {
  const [question, setQuestion] = useState("");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const canSend = onAsk !== undefined && question.trim() !== "";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (canSend) onAsk(question.trim());
  }

  function pickStarter(text: string) {
    if (onAsk) {
      onAsk(text);
    } else {
      setQuestion(text);
      inputRef.current?.focus();
    }
  }

  return (
    // touch-none: a finger drag stirs the water instead of scrolling; taps on the controls still work.
    <main className="relative flex h-dvh w-screen touch-none flex-col items-center justify-center overflow-hidden overscroll-none bg-white px-4 pb-[clamp(0.75rem,5dvh,3rem)]">
      <FluidBackground />

      {/* A very faint oversized name behind everything, as in the design. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-0 flex justify-center overflow-hidden">
        <div
          className="hidden bg-gradient-to-b from-neutral-500/10 to-neutral-500/0 bg-clip-text text-[10rem] leading-none font-black text-transparent select-none sm:block lg:text-[16rem]"
          style={{ marginBottom: "-2.5rem" }}
        >
          {SITE.name}
        </div>
      </div>

      {/* Sizes follow the reference design's proportions and shrink with the screen height. */}
      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-[clamp(0.4rem,1.6dvh,0.85rem)] text-center">
          <LiquidGlass radius={16} bezel={10} strength={10} className="mx-auto mb-1 w-fit p-[clamp(0.45rem,1.3dvh,0.65rem)]">
            <Image src="/logo.svg" alt={`${SITE.name} logo`} width={1358} height={1159} unoptimized className="h-[clamp(1.1rem,2.8dvh,1.6rem)] w-auto" priority />
          </LiquidGlass>
          <h2 className="mt-1 text-[clamp(0.95rem,2.2dvh,1.35rem)] font-semibold text-neutral-700">
            {SITE.greeting} {SITE.name} <span aria-hidden="true">👋</span>
          </h2>
          <h1 className="text-[clamp(2rem,min(9vw,7dvh),4rem)] leading-[1.05] font-bold text-neutral-950">{SITE.headline}</h1>
        </div>

        <div className="aspect-square h-[clamp(6rem,24dvh,15rem)]">
          <Image
            src="/avatar-placeholder.svg"
            alt={`Portrait of ${SITE.name} (placeholder)`}
            width={600}
            height={600}
            unoptimized
            className="h-full w-full object-contain object-bottom"
            priority
          />
        </div>

        <form onSubmit={submit} className="relative mt-[clamp(0.5rem,1.8dvh,0.9rem)] w-full max-w-[29rem]">
          <label htmlFor={inputId} className="sr-only">
            {SITE.inputPlaceholder}
          </label>
          <LiquidGlass radius={999} bezel={12} strength={16} className="flex items-center py-1.5 pr-1.5 pl-5">
            <input
              id={inputId}
              ref={inputRef}
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={MAX_QUESTION_CHARS}
              autoComplete="off"
              placeholder={SITE.inputPlaceholder}
              className="w-full border-none bg-transparent text-[0.95rem] text-neutral-800 placeholder:text-neutral-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send question"
              className="flex shrink-0 items-center justify-center rounded-full bg-[#0171E3] p-2 text-white transition-colors hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0171E3] disabled:opacity-60"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </button>
          </LiquidGlass>
        </form>

        <ul className="mt-[clamp(0.5rem,1.6dvh,0.75rem)] grid w-full max-w-[38rem] grid-cols-5 gap-2 sm:gap-3">
          {STARTERS.map((starter) => (
            <li key={starter.id}>
              <LiquidGlass radius={16} bezel={10} strength={12} className="h-[clamp(3.4rem,7.5dvh,4.5rem)] transition-transform active:scale-95">
                <button
                  type="button"
                  onClick={() => pickStarter(starter.question)}
                  className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl text-gray-700 transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0171E3]"
                >
                  <StarterIcon id={starter.id} />
                  <span className="text-xs font-medium sm:text-[0.8rem]">{starter.label}</span>
                </button>
              </LiquidGlass>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
