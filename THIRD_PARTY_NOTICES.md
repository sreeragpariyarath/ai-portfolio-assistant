# Third-party notices

This project includes code derived from the following open-source work. The licence text must stay with it.

## WebGL Fluid Simulation

- **Source:** https://github.com/PavelDoGreat/WebGL-Fluid-Simulation (`script.js`), by Pavel Dobryakov
- **Used in:** `apps/web/src/features/water-effect/fluid/` (the water effect on the home page), as a TypeScript port. The shader code in `shaders.ts` is the original GLSL, unchanged apart from leaving out the demo's checkerboard backdrop. The other files are ported and restructured; each carries the licence header below.
- **What was changed:** typed and split into modules; the demo's Google Analytics calls, promo popup and store links, dat.GUI panel, social buttons, keyboard shortcuts, screenshot capture and checkerboard backdrop were removed; the dithering texture is generated instead of downloaded; rendering is always transparent so the paint composites over a white page; mouse, touch and pen input uses pointer events on the window; and lifecycle, pause, fallback and cleanup code was added. See D-019 in `docs/DECISIONS.md`.
- **Licence:** MIT

```text
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
```
