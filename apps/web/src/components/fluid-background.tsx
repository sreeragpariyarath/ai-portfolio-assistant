"use client";

import { useEffect, useRef } from "react";
import { createFluid } from "@/lib/fluid";

// The water effect behind the home screen. While `active` is true it paints on a full-screen canvas
// that ignores the pointer (so the controls above it keep working) and listens for the mouse and
// finger on the whole window. When `active` turns false, or the component unmounts, the effect is
// destroyed and the GPU context is given back.
//
// A NEW canvas is created for every run of the effect: destroy() releases the GPU context for good,
// and React Strict Mode runs an effect, cleans it up and runs it again on the same element.
// If the effect cannot start (no WebGL, reduced motion), the page simply stays plain white.
export function FluidBackground({ active = true }: { active?: boolean }) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = holder.current;
    if (!active || container === null) return;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    container.appendChild(canvas);

    const result = createFluid(canvas);
    if (!result.ok) {
      canvas.remove();
      return;
    }
    result.fluid.start();

    return () => {
      result.fluid.destroy();
      canvas.remove();
    };
  }, [active]);

  return <div ref={holder} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" />;
}
