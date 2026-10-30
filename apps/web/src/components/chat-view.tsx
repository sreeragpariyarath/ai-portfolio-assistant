"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { MAX_QUESTION_CHARS } from "@/lib/chat-client";
import { announcementFor, behaviorNote } from "@/lib/chat-state";
import type { ChatMessage } from "@/lib/chat-state";
import { splitCitations } from "@/lib/citations";
import { recordPath } from "@/lib/records";
import { SITE, STARTERS } from "@/lib/site";
import { LiquidGlass } from "./liquid-glass";
import { StarterIcon } from "./starter-icon";

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-2" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-500 motion-reduce:animate-none" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  // While streaming, the API has already removed invalid citations; once done, only the final list counts.
  const allowed = message.status === "done" ? new Set(message.citations) : undefined;
  const segments = splitCitations(message.text, allowed);
  const note = behaviorNote(message.behavior);

  return (
    <div className="text-[0.95rem] leading-relaxed text-neutral-800" aria-busy={message.status === "streaming"}>
      {message.text === "" && message.status === "streaming" ? (
        <>
          <TypingDots />
          <span className="sr-only">Thinking…</span>
        </>
      ) : (
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
          {segments.map((segment, index) =>
            segment.type === "text" ? (
              <span key={index}>{segment.text}</span>
            ) : (
              <sup key={index} className="mx-0.5">
                {/* A new tab, so the conversation stays where it is. */}
                <a
                  href={recordPath(segment.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Source: ${segment.id}`}
                  className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral-100 px-1 align-middle text-[10px] font-semibold text-neutral-600 no-underline hover:bg-[#0171E3] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0171E3]"
                >
                  {segment.n}
                  <span className="sr-only">, open source {segment.id} in a new tab</span>
                </a>
              </sup>
            ),
          )}
        </p>
      )}

      {message.status === "done" && message.citations.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
          <span>Sources:</span>
          {message.citations.map((id, index) => (
            <a
              key={id}
              href={recordPath(id)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-neutral-600 hover:border-[#0171E3] hover:text-[#0171E3] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0171E3]"
            >
              {index + 1}. {id}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ))}
        </div>
      ) : null}

      {note !== null && message.status !== "streaming" ? <p className="mt-2 text-xs text-neutral-500 italic">{note}</p> : null}
      {message.truncated ? <p className="mt-2 text-xs text-neutral-500">The answer was cut short.</p> : null}
      {message.status === "stopped" ? <p className="mt-2 text-xs text-neutral-500">Stopped.</p> : null}
      {message.status === "error" && message.error !== undefined ? (
        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {message.error}
        </p>
      ) : null}
    </div>
  );
}

// The conversation: answers stream in above, quick questions and the input stay at the bottom.
export function ChatView({
  messages,
  busy,
  onAsk,
  onStop,
  onHome,
}: {
  messages: ChatMessage[];
  busy: boolean;
  onAsk: (question: string) => void;
  onStop: () => void;
  onHome: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [showStarters, setShowStarters] = useState(true);
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);

  // The chat replaces the home screen, so whatever had focus is gone: put it in the chat input.
  useEffect(() => {
    input.current?.focus();
  }, []);
  const list = useRef<HTMLDivElement>(null);
  // Follow new text only while the visitor is at (or near) the bottom, so reading back is not interrupted.
  const followBottom = useRef(true);

  useEffect(() => {
    const element = list.current;
    if (element !== null && followBottom.current) element.scrollTop = element.scrollHeight;
  }, [messages]);

  function send(text: string) {
    const trimmed = text.trim();
    if (trimmed === "") return;
    followBottom.current = true;
    onAsk(trimmed);
    setQuestion("");
    input.current?.focus({ preventScroll: true });
  }

  return (
    <main className="flex h-dvh w-full flex-col bg-white">
      <h1 className="sr-only">Chat with {SITE.name}&apos;s assistant</h1>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcementFor(messages)}
      </div>
      <header className="flex shrink-0 justify-center pt-4 pb-1">
        <button
          type="button"
          onClick={onHome}
          aria-label="Back to the home page"
          className="rounded-full transition-transform hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0171E3]"
        >
          <Image src="/avatar-placeholder.svg" alt="" width={48} height={48} unoptimized className="h-12 w-12" />
        </button>
      </header>

      <div
        ref={list}
        onScroll={(event) => {
          const element = event.currentTarget;
          followBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
        tabIndex={0}
        role="region"
        aria-label="Conversation history"
        className="relative min-h-0 flex-1 overflow-y-auto px-4 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#0171E3]"
      >
        <ol className="mx-auto flex max-w-3xl flex-col gap-6 py-4" aria-label={`Conversation with ${SITE.name}'s assistant`}>
          {messages.map((message) =>
            message.role === "user" ? (
              <li key={message.id} className="flex justify-center">
                <p className="max-w-[85%] rounded-3xl bg-[#0171E3] px-4 py-2 text-[0.95rem] text-white [overflow-wrap:anywhere]">{message.text}</p>
              </li>
            ) : (
              <li key={message.id}>
                <AssistantMessage message={message} />
              </li>
            ),
          )}
        </ol>
      </div>

      <footer className="shrink-0 px-4 pb-[max(clamp(1rem,6dvh,4rem),env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setShowStarters((value) => !value)}
            aria-expanded={showStarters}
            className="flex min-h-6 items-center gap-1 rounded text-xs text-neutral-500 hover:text-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0171E3]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={showStarters ? "" : "rotate-180"}>
              <path d="m6 9 6 6 6-6" />
            </svg>
            {showStarters ? "Hide quick questions" : "Show quick questions"}
          </button>

          {showStarters ? (
            <ul className="flex flex-wrap justify-center gap-2">
              {STARTERS.map((starter) => (
                <li key={starter.id}>
                  <button
                    type="button"
                    onClick={() => send(starter.question)}
                    className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0171E3]"
                  >
                    <StarterIcon id={starter.id} />
                    {starter.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <form
            className="w-full max-w-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              send(question);
            }}
          >
            <label htmlFor={inputId} className="sr-only">
              {SITE.inputPlaceholder}
            </label>
            <LiquidGlass radius={999} bezel={12} strength={16} className="question-pill flex items-center bg-neutral-100/60 py-1.5 pr-1.5 pl-5">
              <input
                id={inputId}
                ref={input}
                type="text"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={MAX_QUESTION_CHARS}
                autoComplete="off"
                placeholder="Ask me anything"
                className="question-input min-w-0 w-full border-none bg-transparent text-base text-neutral-800 placeholder:text-neutral-600"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => {
                    onStop();
                    input.current?.focus({ preventScroll: true });
                  }}
                  aria-label="Stop the answer"
                  className="flex shrink-0 items-center justify-center rounded-full bg-neutral-800 p-2 text-white hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0171E3]"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="7" y="7" width="10" height="10" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={question.trim() === ""}
                  aria-label="Send question"
                  className="flex shrink-0 items-center justify-center rounded-full bg-[#0171E3] p-2 text-white transition-colors hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0171E3] disabled:opacity-60"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 19V5" />
                    <path d="m5 12 7-7 7 7" />
                  </svg>
                </button>
              )}
            </LiquidGlass>
          </form>
        </div>
      </footer>
    </main>
  );
}
