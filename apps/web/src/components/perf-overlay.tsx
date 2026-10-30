"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createFpsMeter, perfRequested } from "@/lib/perf";
import type { FpsReading } from "@/lib/perf";

// The address never changes while the page is open, so there is nothing to subscribe to.
const noSubscription = () => () => {};

// A small frame-rate readout for testing on a real device: add ?perf to the address
// (for example http://localhost:8787/?perf), then stir the water and watch the numbers.
// Without ?perf it renders nothing and runs nothing.
export function PerfOverlay() {
  // false while prerendering and hydrating, then the real answer: no mismatch, and no setState in an effect.
  const enabled = useSyncExternalStore(
    noSubscription,
    () => perfRequested(window.location.search),
    () => false,
  );
  const [reading, setReading] = useState<FpsReading | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const meter = createFpsMeter();
    let frame = 0;
    const loop = (now: number) => {
      const next = meter.tick(now);
      if (next !== null) setReading(next);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-2 left-2 z-50 rounded-md bg-neutral-900/85 px-2 py-1 font-mono text-[11px] leading-tight text-white"
    >
      {reading === null ? "measuring…" : `${reading.fps} fps · worst frame ${reading.worstFrameMs} ms`}
      <br />
      {`${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`}
    </div>
  );
}
