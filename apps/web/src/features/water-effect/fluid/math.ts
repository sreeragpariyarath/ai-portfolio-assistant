/*
MIT License

Copyright (c) 2017 Pavel Dobryakov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// Pure helpers ported from PavelDoGreat/WebGL-Fluid-Simulation (script.js). No DOM and no WebGL, so
// the root test suite can run them. See THIRD_PARTY_NOTICES.md.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Size {
  width: number;
  height: number;
}

export function hsvToRgb(h: number, s: number, v: number): Rgb {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0:
      return { r: v, g: t, b: p };
    case 1:
      return { r: q, g: v, b: p };
    case 2:
      return { r: p, g: v, b: t };
    case 3:
      return { r: p, g: q, b: v };
    case 4:
      return { r: t, g: p, b: v };
    default:
      return { r: v, g: p, b: q };
  }
}

// A random fully saturated hue, scaled by `intensity`. The demo uses 0.15, which suits a black
// background; on white the dye is shown as paint, so the intensity is a setting.
export function generateColor(random: () => number, intensity: number): Rgb {
  const c = hsvToRgb(random(), 1.0, 1.0);
  return { r: c.r * intensity, g: c.g * intensity, b: c.b * intensity };
}

export function wrap(value: number, min: number, max: number): number {
  const range = max - min;
  if (range === 0) return min;
  return ((value - min) % range) + min;
}

export function scaleByPixelRatio(input: number, pixelRatio: number): number {
  return Math.floor(input * pixelRatio);
}

// The device pixel ratio, capped: the dye is shown through one full-screen pass, so a 3x phone
// screen would pay 9 times the pixels of a 1x screen for a soft effect that does not need them.
export function effectivePixelRatio(devicePixelRatio: number | undefined, max: number): number {
  const ratio = devicePixelRatio !== undefined && Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(ratio, max);
}

// Simulation grids keep the screen's aspect ratio: the short side is `resolution` cells.
export function getResolution(resolution: number, drawingBufferWidth: number, drawingBufferHeight: number): Size {
  let aspectRatio = drawingBufferWidth / drawingBufferHeight;
  if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;

  const min = Math.round(resolution);
  const max = Math.round(resolution * aspectRatio);

  return drawingBufferWidth > drawingBufferHeight ? { width: max, height: min } : { width: min, height: max };
}

export function correctRadius(radius: number, canvasWidth: number, canvasHeight: number): number {
  const aspectRatio = canvasWidth / canvasHeight;
  return aspectRatio > 1 ? radius * aspectRatio : radius;
}

export function correctDeltaX(delta: number, canvasWidth: number, canvasHeight: number): number {
  const aspectRatio = canvasWidth / canvasHeight;
  return aspectRatio < 1 ? delta * aspectRatio : delta;
}

export function correctDeltaY(delta: number, canvasWidth: number, canvasHeight: number): number {
  const aspectRatio = canvasWidth / canvasHeight;
  return aspectRatio > 1 ? delta / aspectRatio : delta;
}

export function isMobileUserAgent(userAgent: string): boolean {
  return /Mobi|Android/i.test(userAgent);
}

// Seconds since the last frame, capped at one 60 Hz frame so a slow device or a tab that was in the
// background does not make the simulation jump. Never negative.
export function deltaTime(nowMs: number, lastMs: number): number {
  return Math.max(0, Math.min((nowMs - lastMs) / 1000, 0.016666));
}

export function textureScale(textureWidth: number, textureHeight: number, width: number, height: number): { x: number; y: number } {
  return { x: width / textureWidth, y: height / textureHeight };
}
