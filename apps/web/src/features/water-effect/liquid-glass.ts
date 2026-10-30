// The maths behind the liquid-glass controls. Pure, so the root tests can run it.
//
// A glass control bends what is behind it near its edges, like the rim of a lens. The bend is a
// displacement map: for every pixel, how far (and which way) to look for the backdrop pixel that
// shows there. The middle of the control looks straight through; within `bezel` pixels of the edge
// it looks further inwards, more strongly the closer to the edge, which magnifies and curves the
// backdrop at the rim. An SVG feDisplacementMap applies the map through `backdrop-filter`.

export interface Displacement {
  // In -1..1, scaled by the filter's `scale`.
  dx: number;
  dy: number;
}

// Displacement for the pixel centre (x, y) of a w×h rounded rectangle with corner radius r.
export function displacementAt(x: number, y: number, w: number, h: number, r: number, bezel: number): Displacement {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  // The core is the rectangle the rounded corners are drawn around.
  const qx = Math.min(Math.max(x, radius), w - radius);
  const qy = Math.min(Math.max(y, radius), h - radius);
  const vx = x - qx;
  const vy = y - qy;
  const outside = Math.hypot(vx, vy);

  let distance: number;
  let nx: number;
  let ny: number;
  if (outside > 0) {
    // In a corner: the edge is the arc around (qx, qy).
    distance = radius - outside;
    nx = vx / outside;
    ny = vy / outside;
  } else {
    // Along a straight side: the nearest of the four edges.
    const left = x;
    const right = w - x;
    const top = y;
    const bottom = h - y;
    distance = Math.min(left, right, top, bottom);
    nx = distance === left ? -1 : distance === right ? 1 : 0;
    ny = nx !== 0 ? 0 : distance === top ? -1 : 1;
  }

  if (distance < 0 || distance >= bezel || bezel <= 0) return { dx: 0, dy: 0 };
  // 0 at the inner edge of the bezel, 1 at the border; squared so the bend grows smoothly.
  const t = 1 - distance / bezel;
  const strength = t * t;
  // Look inwards: against the outward normal.
  return { dx: -nx * strength, dy: -ny * strength };
}

// RGBA bytes for a w×h map: red carries dx, green dy, 128 is "no bend", blue unused, alpha opaque.
export function displacementPixels(w: number, h: number, r: number, bezel: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const { dx, dy } = displacementAt(x + 0.5, y + 0.5, w, h, r, bezel);
      const i = (y * w + x) * 4;
      pixels[i] = Math.round(128 + dx * 127);
      pixels[i + 1] = Math.round(128 + dy * 127);
      pixels[i + 2] = 128;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

// Refraction through backdrop-filter: url(#svg-filter) works in Chromium browsers only (Chrome,
// Edge, Brave, Android Chrome). Safari, Firefox and every iOS browser get a frosted fallback.
export function supportsSvgBackdropFilter(userAgent: string, brands: readonly string[] = []): boolean {
  if (brands.some((brand) => /Chromium|Google Chrome|Microsoft Edge/i.test(brand))) return true;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return false; // every iOS browser is WebKit
  if (/Firefox\//i.test(userAgent)) return false;
  return /Chrome\/|Chromium\/|Edg\//i.test(userAgent);
}
