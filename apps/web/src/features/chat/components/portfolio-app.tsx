"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { withDockGlide } from "./dock-glide";
import { ChatClientError, askQuestion, isAbortError } from "@/features/chat/chat-client";
import { chatReducer, initialChatState } from "@/features/chat/chat-state";
import { clearChat, loadChat, memoryForRequest, saveChat } from "@/features/chat/memory";
import { matchCardIntent } from "@/features/cards/card-intent";
import { CARD_INTROS } from "@/features/cards/portfolio-cards";
import type { CardKind } from "@/features/cards/portfolio-cards";
import { ChatView } from "./chat-view";
import { HomeScreen } from "@/features/home/components/home-screen";
import { PerfOverlay } from "@/shared/perf/perf-overlay";

// The whole page: the home screen until the first question, then the chat. Leaving the home screen
// unmounts the water effect, which stops it and gives the GPU back.
export function PortfolioApp() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  // "auto" until the visitor moves: the chat if one was restored from storage, otherwise the home screen.
  const [view, setView] = useState<"auto" | "home" | "chat">("auto");
  const shown = view === "auto" ? (state.messages.length > 0 ? "chat" : "home") : view;
  const controller = useRef<AbortController | null>(null);
  const currentId = useRef<string | null>(null);
  const counter = useRef(0);
  // The latest state, for building each request's memory inside the stable `ask` callback.
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  // Chat memory (D-041) lives in sessionStorage: a refresh brings the chat back, closing the tab forgets it.
  const storage = () => (typeof window === "undefined" ? undefined : window.sessionStorage);
  useEffect(() => {
    const saved = loadChat(storage());
    if (saved === null) return;
    // Ids continue after the restored ones, so a new answer never reuses an old id.
    counter.current = saved.messages.length;
    dispatch({ type: "restore", ...saved });
  }, []);
  // Saved whenever nothing is streaming, so a half-written answer is never stored as if it were finished.
  useEffect(() => {
    if (state.activeId === null) saveChat(storage(), state);
  }, [state]);

  // Text fields match :focus-visible even after a mouse click. Show the pill's
  // focus cue only when the visitor is navigating with Tab, not while typing.
  useEffect(() => {
    const root = document.documentElement;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") root.removeAttribute("data-pointer-navigation");
    };
    const onPointerDown = () => root.setAttribute("data-pointer-navigation", "");
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      root.removeAttribute("data-pointer-navigation");
    };
  }, []);

  const ask = useCallback(async (question: string, chipCard?: CardKind) => {
    // One answer at a time: a new question cancels the request still running.
    controller.current?.abort();
    counter.current += 1;
    const id = `answer-${counter.current}`;

    // A chip, or a short typed request for one ("show projects"), shows its stored card with no assistant call.
    const card = chipCard ?? matchCardIntent(question);
    if (card !== null) {
      controller.current = null;
      currentId.current = null;
      withDockGlide(() => {
        dispatch({ type: "show", id, question, card, intro: CARD_INTROS[card] });
        setView("chat");
      });
      return;
    }

    const abort = new AbortController();
    controller.current = abort;
    currentId.current = id;

    // Built before the question is added: the latest turns, older ones to fold into notes, and the notes.
    const memory = memoryForRequest(latest.current);
    withDockGlide(() => {
      dispatch({ type: "ask", id, question, ...(memory.foldThrough !== undefined ? { foldThrough: memory.foldThrough } : {}) });
      setView("chat");
    });

    try {
      const options = {
        signal: abort.signal,
        history: memory.history,
        compact: memory.compact,
        ...(memory.summary !== undefined ? { summary: memory.summary } : {}),
      };
      for await (const event of askQuestion(question, options)) {
        dispatch({ type: "event", id, event });
      }
    } catch (error) {
      if (isAbortError(error)) return;
      if (error instanceof ChatClientError) {
        dispatch({
          type: "fail",
          id,
          code: error.code,
          ...(error.retryAfterSeconds !== undefined ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
        });
      } else {
        dispatch({ type: "fail", id, code: "internal_error" });
      }
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    if (currentId.current !== null) dispatch({ type: "stop", id: currentId.current });
  }, []);

  const goHome = useCallback(() => {
    stop();
    setView("home");
  }, [stop]);

  const newChat = useCallback(() => {
    stop();
    clearChat(storage());
    dispatch({ type: "reset" });
    setView("home");
  }, [stop]);

  // Leaving the page cancels any answer still streaming.
  useEffect(() => () => controller.current?.abort(), []);

  return (
    <>
      {shown === "home" ? (
        <HomeScreen restoreFocus={state.messages.length > 0} onAsk={(question, card) => void ask(question, card)} />
      ) : (
        <ChatView
          messages={state.messages}
          busy={state.activeId !== null}
          onAsk={(question, card) => void ask(question, card)}
          onStop={stop}
          onHome={goHome}
          onNewChat={newChat}
        />
      )}
      <PerfOverlay />
    </>
  );
}
