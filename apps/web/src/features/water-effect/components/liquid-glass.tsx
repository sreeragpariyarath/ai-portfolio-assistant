"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { displacementPixels, supportsSvgBackdropFilter } from "@/features/water-effect/liquid-glass";

// A liquid-glass surface: the backdrop (the water) is bent at the rim like a lens, lightly blurred
// and brightened, with a bright inner rim on top. Chromium browsers get the real refraction through
// an SVG filter; Safari, Firefox and iOS get frosted glass with the same rim (task 4.5b, option A).
//
// The displacement map depends on the element's size, so it is rebuilt when the size changes.
export function LiquidGlass({
  children,
  className = "",
  radius,
  bezel = 14,
  strength = 28,
}: {
  children: ReactNode;
  className?: string;
  // Corner radius in px; use a large number for a pill.
  radius: number;
  // How far in from the edge the glass bends the backdrop, in px.
  bezel?: number;
  // Maximum bend in px.
  strength?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const filterId = `glass-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [map, setMap] = useState<{ href: string; width: number; height: number } | null>(null);
  const [refract, setRefract] = useState(false);

  useEffect(() => {
    const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands?.map((b) => b.brand) ?? [];
    if (!supportsSvgBackdropFilter(navigator.userAgent, brands)) return;
    const element = box.current;
    if (element === null) return;

    const build = () => {
      const width = Math.round(element.offsetWidth);
      const height = Math.round(element.offsetHeight);
      if (width < 2 || height < 2) return;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (context === null) return;
      const image = context.createImageData(width, height);
      image.data.set(displacementPixels(width, height, radius, bezel));
      context.putImageData(image, 0, 0);
      setMap({ href: canvas.toDataURL(), width, height });
      setRefract(true);
    };

    build();
    const observer = new ResizeObserver(build);
    observer.observe(element);
    return () => observer.disconnect();
  }, [radius, bezel]);

  const frosted = "blur(10px) saturate(160%) brightness(1.04)";
  const backdrop = refract && map !== null ? `url(#${filterId})` : frosted;

  return (
    <div
      ref={box}
      className={`relative isolate ${className}`}
      style={{
        borderRadius: radius,
        backdropFilter: backdrop,
        WebkitBackdropFilter: frosted,
        // Keep readable contrast even when the water beneath the control is dark.
        background: "rgba(255, 255, 255, 0.18)",
        boxShadow:
          "inset 0 1px 1px rgba(255,255,255,0.85), inset 0 -1px 1px rgba(255,255,255,0.35), inset 0 0 0 1px rgba(255,255,255,0.35), 0 4px 18px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.06)",
      }}
    >
      {refract && map !== null ? (
        <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
          <filter id={filterId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feImage href={map.href} x="0" y="0" width={map.width} height={map.height} result="map" preserveAspectRatio="none" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={strength * 2} xChannelSelector="R" yChannelSelector="G" result="bent" />
            <feGaussianBlur in="bent" stdDeviation="1.2" result="soft" />
            <feColorMatrix in="soft" type="saturate" values="1.6" result="vivid" />
            <feComponentTransfer in="vivid">
              <feFuncR type="linear" slope="1.04" />
              <feFuncG type="linear" slope="1.04" />
              <feFuncB type="linear" slope="1.04" />
            </feComponentTransfer>
          </filter>
        </svg>
      ) : null}
      {children}
    </div>
  );
}
