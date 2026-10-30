"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { MAX_QUESTION_CHARS } from "@/lib/chat-client";
import { SITE, STARTERS } from "@/lib/site";
import { FluidBackground } from "./fluid-background";
import { LiquidGlass } from "./liquid-glass";
import { StarterIcon } from "./starter-icon";

// The one-screen home page: no scrolling, pure white, water that follows the mouse or a finger.
// `onAsk` starts the chat (task 4.6). Until it is given, the chips fill the input and sending is off.
export function HomeScreen({ onAsk, restoreFocus = false }: { onAsk?: (question: string) => void; restoreFocus?: boolean }) {
  const [question, setQuestion] = useState("");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const screen = useRef<HTMLElement>(null);
  const canSend = onAsk !== undefined && question.trim() !== "";
  useEffect(() => {
    if (restoreFocus) inputRef.current?.focus({ preventScroll: true });
  }, [restoreFocus]);
  useEffect(() => {
    const element = screen.current;
    if (!element) return;
    const update = () => {
      // Text enlargement can overflow even a tall viewport. Keep those controls reachable by touch.
      element.style.touchAction = element.scrollHeight > window.innerHeight ? "pan-y pinch-zoom" : "";
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

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
    // touch-pinch-zoom: one finger stirs the water instead of scrolling, two fingers still zoom the page
    // (touch-none would block zooming, which people with low vision rely on). Taps on controls still work.
    <main ref={screen} className="home-screen relative flex min-h-dvh w-full touch-pinch-zoom flex-col items-center justify-center bg-white px-4 py-[clamp(0.75rem,5dvh,3rem)]">
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
        <div className="mb-[clamp(0.4rem,1.6dvh,0.85rem)] px-2 text-center">
          <LiquidGlass radius={16} bezel={10} strength={10} className="mx-auto mb-1 w-fit p-[clamp(0.45rem,1.3dvh,0.65rem)]">
            <Image src="/logo.svg" alt={`${SITE.name} logo`} width={1358} height={1159} unoptimized className="h-[clamp(1.1rem,2.8dvh,1.6rem)] w-auto" priority />
          </LiquidGlass>
          <p className="mt-1 text-[clamp(0.95rem,2.2dvh,1.35rem)] font-semibold text-neutral-700">
            {SITE.greeting} {SITE.name} <span aria-hidden="true">👋</span>
          </p>
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
          <LiquidGlass radius={999} bezel={12} strength={16} className="question-pill flex items-center py-1.5 pr-1.5 pl-5">
            <input
              id={inputId}
              ref={inputRef}
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={MAX_QUESTION_CHARS}
              autoComplete="off"
              placeholder={SITE.inputPlaceholder}
              className="question-input min-w-0 w-full border-none bg-transparent text-base text-neutral-800 placeholder:text-neutral-600"
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

        <ul className="mt-[clamp(0.5rem,1.6dvh,0.75rem)] grid w-full max-w-[38rem] grid-cols-[repeat(auto-fit,minmax(3.5rem,1fr))] gap-2 sm:gap-3">
          {STARTERS.map((starter) => (
            <li key={starter.id}>
              <LiquidGlass radius={16} bezel={10} strength={12} className="h-[clamp(3.4rem,7.5dvh,4.5rem)] transition-transform active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100">
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
