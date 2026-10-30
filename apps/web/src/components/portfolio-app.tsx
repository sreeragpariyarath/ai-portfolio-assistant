"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ChatClientError, askQuestion, isAbortError } from "@/lib/chat-client";
import { chatReducer, initialChatState } from "@/lib/chat-state";
import { ChatView } from "./chat-view";
import { HomeScreen } from "./home-screen";

// The whole page: the home screen until the first question, then the chat. Leaving the home screen
// unmounts the water effect, which stops it and gives the GPU back.
export function PortfolioApp() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [view, setView] = useState<"home" | "chat">("home");
  const controller = useRef<AbortController | null>(null);
  const currentId = useRef<string | null>(null);
  const counter = useRef(0);

  const ask = useCallback(async (question: string) => {
    // One answer at a time: a new question cancels the request still running.
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    counter.current += 1;
    const id = `answer-${counter.current}`;
    currentId.current = id;

    dispatch({ type: "ask", id, question });
    setView("chat");

    try {
      for await (const event of askQuestion(question, { signal: abort.signal })) {
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

  // Leaving the page cancels any answer still streaming.
  useEffect(() => () => controller.current?.abort(), []);

  if (view === "home") return <HomeScreen onAsk={(question) => void ask(question)} />;
  return (
    <ChatView
      messages={state.messages}
      busy={state.activeId !== null}
      onAsk={(question) => void ask(question)}
      onStop={stop}
      onHome={goHome}
    />
  );
}
