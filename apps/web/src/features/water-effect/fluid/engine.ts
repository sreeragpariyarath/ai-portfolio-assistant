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

// The WebGL side of the water effect: a typed port of PavelDoGreat/WebGL-Fluid-Simulation
// (script.js). See THIRD_PARTY_NOTICES.md. Changes from the original, all deliberate:
//   - Removed: Google Analytics calls, the promo popup and store links, dat.GUI, the social
//     buttons, the keyboard shortcuts, the screenshot capture, and the checkerboard backdrop.
//   - The result is always drawn with transparency, so the paint composites over the white page and
//     fades back to it. The demo's opaque BACK_COLOR mode is gone.
//   - The dithering texture is generated here instead of downloaded from the network.
//   - Setup failures throw a typed FluidSetupError instead of crashing later, the attribute
//     location is bound explicitly, replaced framebuffers are deleted, and everything is released
//     by dispose().
// The browser-facing parts (input, the frame loop, visibility, reduced motion) live in index.ts.

import type { FluidConfig } from "./config.ts";
import { correctRadius, getResolution, textureScale } from "./math.ts";
import type { Rgb } from "./math.ts";
import * as shaders from "./shaders.ts";

type GL = WebGL2RenderingContext;

export type FluidFailure = "no-webgl" | "no-float-textures" | "shader-error" | "reduced-motion" | "context-lost";

export class FluidSetupError extends Error {
  readonly reason: FluidFailure;
  readonly detail: string | undefined;

  constructor(reason: FluidFailure, detail?: string) {
    super(`The water effect could not start (${reason}).`);
    this.name = "FluidSetupError";
    this.reason = reason;
    this.detail = detail;
  }
}

export interface FluidCanvas {
  width: number;
  height: number;
  getContext(contextId: string, options?: unknown): unknown;
}

interface TextureFormat {
  internalFormat: number;
  format: number;
}

export interface GlExt {
  formatRGBA: TextureFormat;
  formatRG: TextureFormat;
  formatR: TextureFormat;
  halfFloatTexType: number;
  supportLinearFiltering: boolean;
}

export function getWebGLContext(canvas: FluidCanvas): { gl: GL; ext: GlExt } {
  const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };

  let context = canvas.getContext("webgl2", params) as GL | null;
  const isWebGL2 = context !== null;
  if (context === null) {
    context = (canvas.getContext("webgl", params) ?? canvas.getContext("experimental-webgl", params)) as GL | null;
  }
  if (context === null) throw new FluidSetupError("no-webgl");
  const gl = context;

  // destroy() gives the context back for good: a canvas element never yields a working context
  // again afterwards. React Strict Mode runs an effect, cleans it up and runs it again on the SAME
  // element, so without this check the second run would fail with a misleading message below.
  if (gl.isContextLost()) {
    throw new FluidSetupError("context-lost", "This canvas's WebGL context was already released. Use a new canvas element for each effect.");
  }

  // A context that cannot be used is given back at once: browsers allow only a handful of live ones.
  const unusable = (reason: FluidFailure): FluidSetupError => {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return new FluidSetupError(reason);
  };

  let halfFloatTexType: number;
  let supportLinearFiltering: boolean;
  if (isWebGL2) {
    gl.getExtension("EXT_color_buffer_float");
    supportLinearFiltering = gl.getExtension("OES_texture_float_linear") !== null;
    halfFloatTexType = gl.HALF_FLOAT;
  } else {
    const halfFloat = gl.getExtension("OES_texture_half_float") as { HALF_FLOAT_OES: number } | null;
    if (halfFloat === null) throw unusable("no-float-textures");
    supportLinearFiltering = gl.getExtension("OES_texture_half_float_linear") !== null;
    halfFloatTexType = halfFloat.HALF_FLOAT_OES;
  }

  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  const formatRGBA = isWebGL2 ? getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType) : getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
  const formatRG = isWebGL2 ? getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType) : formatRGBA;
  const formatR = isWebGL2 ? getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType) : formatRGBA;

  if (formatRGBA === null || formatRG === null || formatR === null) throw unusable("no-float-textures");

  return { gl, ext: { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering } };
}

function getSupportedFormat(gl: GL, internalFormat: number, format: number, type: number): TextureFormat | null {
  if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
    // Fall back to a wider format that can be rendered to, as the original does.
    if (internalFormat === gl.R16F) return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
    if (internalFormat === gl.RG16F) return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
    return null;
  }
  return { internalFormat, format };
}

function supportRenderTextureFormat(gl: GL, internalFormat: number, format: number, type: number): boolean {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;

  // The original leaks these probe objects; they are tiny but there is no reason to keep them.
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(texture);
  return complete;
}

interface Fbo {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach(id: number): number;
}

interface DoubleFbo {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: Fbo;
  write: Fbo;
  swap(): void;
}

interface NoiseTexture {
  texture: WebGLTexture;
  width: number;
  height: number;
  attach(id: number): number;
}

interface Program {
  bind(): void;
  uniform(name: string): WebGLUniformLocation | null;
}

export interface Engine {
  // (Re)creates the framebuffers for the current canvas size, keeping the dye and velocity.
  initFramebuffers(): void;
  step(dt: number): void;
  render(): void;
  // Position in 0..1 (origin bottom-left); (dx, dy) is the push, color the dye added.
  splat(x: number, y: number, dx: number, dy: number, color: Rgb): void;
  randomSplats(amount: number, makeColor: () => Rgb): void;
  dispose(): void;
}

export function createEngine(canvas: FluidCanvas, config: FluidConfig, gl: GL, ext: GlExt, random: () => number): Engine {
  const shadersCreated: WebGLShader[] = [];
  const programsCreated: WebGLProgram[] = [];
  const texturesCreated = new Set<WebGLTexture>();
  const fbosCreated = new Set<WebGLFramebuffer>();
  const buffersCreated: WebGLBuffer[] = [];

  function compileShader(type: number, source: string, keywords?: string[]): WebGLShader {
    const withKeywords = keywords === undefined ? source : keywords.map((keyword) => `#define ${keyword}\n`).join("") + source;
    const shader = gl.createShader(type);
    if (shader === null) throw new FluidSetupError("shader-error", "createShader returned null");
    gl.shaderSource(shader, withKeywords);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const detail = gl.getShaderInfoLog(shader) ?? "";
      gl.deleteShader(shader);
      throw new FluidSetupError("shader-error", detail);
    }
    shadersCreated.push(shader);
    return shader;
  }

  function createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
    const program = gl.createProgram();
    if (program === null) throw new FluidSetupError("shader-error", "createProgram returned null");
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    // Every vertex shader has the single attribute aPosition; pin it to location 0, which the
    // vertex buffer below is attached to.
    gl.bindAttribLocation(program, 0, "aPosition");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const detail = gl.getProgramInfoLog(program) ?? "";
      gl.deleteProgram(program);
      throw new FluidSetupError("shader-error", detail);
    }
    programsCreated.push(program);
    return program;
  }

  function getUniforms(program: WebGLProgram): Map<string, WebGLUniformLocation | null> {
    const uniforms = new Map<string, WebGLUniformLocation | null>();
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info !== null) uniforms.set(info.name, gl.getUniformLocation(program, info.name));
    }
    return uniforms;
  }

  function makeProgram(vertexShader: WebGLShader, fragmentSource: string, keywords?: string[]): Program {
    const program = createProgram(vertexShader, compileShader(gl.FRAGMENT_SHADER, fragmentSource, keywords));
    const uniforms = getUniforms(program);
    return {
      bind: () => gl.useProgram(program),
      uniform: (name) => uniforms.get(name) ?? null,
    };
  }

  // The display shader has optional parts, switched with #define keywords; one program per set.
  function makeMaterial(vertexShader: WebGLShader, fragmentSource: string) {
    const variants = new Map<string, Program>();
    let active: Program | null = null;
    return {
      setKeywords(keywords: string[]) {
        const key = keywords.join("|");
        let program = variants.get(key);
        if (program === undefined) {
          program = makeProgram(vertexShader, fragmentSource, keywords);
          variants.set(key, program);
        }
        active = program;
      },
      bind() {
        active?.bind();
      },
      uniform(name: string) {
        return active?.uniform(name) ?? null;
      },
    };
  }

  function createFBO(w: number, h: number, internalFormat: number, format: number, type: number, filter: number): Fbo {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    texturesCreated.add(texture);
    fbosCreated.add(fbo);

    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX: 1.0 / w,
      texelSizeY: 1.0 / h,
      attach(id) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      },
    };
  }

  function destroyFBO(target: Fbo): void {
    gl.deleteFramebuffer(target.fbo);
    gl.deleteTexture(target.texture);
    fbosCreated.delete(target.fbo);
    texturesCreated.delete(target.texture);
  }

  function createDoubleFBO(w: number, h: number, internalFormat: number, format: number, type: number, filter: number): DoubleFbo {
    let fbo1 = createFBO(w, h, internalFormat, format, type, filter);
    let fbo2 = createFBO(w, h, internalFormat, format, type, filter);
    return {
      width: w,
      height: h,
      texelSizeX: fbo1.texelSizeX,
      texelSizeY: fbo1.texelSizeY,
      get read() {
        return fbo1;
      },
      set read(value) {
        fbo1 = value;
      },
      get write() {
        return fbo2;
      },
      set write(value) {
        fbo2 = value;
      },
      swap() {
        const temp = fbo1;
        fbo1 = fbo2;
        fbo2 = temp;
      },
    };
  }

  function destroyDoubleFBO(target: DoubleFbo): void {
    destroyFBO(target.read);
    destroyFBO(target.write);
  }

  // Dither noise for the (optional) bloom pass. The demo downloads a blue-noise PNG; plain random
  // noise does the same job of hiding banding and needs no network request.
  function createNoiseTexture(size: number): NoiseTexture {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const data = new Uint8Array(size * size * 3);
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(random() * 256);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, size, size, 0, gl.RGB, gl.UNSIGNED_BYTE, data);
    texturesCreated.add(texture);
    return {
      texture,
      width: size,
      height: size,
      attach(id) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      },
    };
  }

  // ---- programs --------------------------------------------------------------------------------

  const baseVertexShader = compileShader(gl.VERTEX_SHADER, shaders.BASE_VERTEX);
  const blurVertexShader = compileShader(gl.VERTEX_SHADER, shaders.BLUR_VERTEX);

  const blurProgram = makeProgram(blurVertexShader, shaders.BLUR);
  const copyProgram = makeProgram(baseVertexShader, shaders.COPY);
  const clearProgram = makeProgram(baseVertexShader, shaders.CLEAR);
  const bloomPrefilterProgram = makeProgram(baseVertexShader, shaders.BLOOM_PREFILTER);
  const bloomBlurProgram = makeProgram(baseVertexShader, shaders.BLOOM_BLUR);
  const bloomFinalProgram = makeProgram(baseVertexShader, shaders.BLOOM_FINAL);
  const sunraysMaskProgram = makeProgram(baseVertexShader, shaders.SUNRAYS_MASK);
  const sunraysProgram = makeProgram(baseVertexShader, shaders.SUNRAYS);
  const splatProgram = makeProgram(baseVertexShader, shaders.SPLAT);
  const advectionProgram = makeProgram(baseVertexShader, shaders.ADVECTION, ext.supportLinearFiltering ? undefined : ["MANUAL_FILTERING"]);
  const divergenceProgram = makeProgram(baseVertexShader, shaders.DIVERGENCE);
  const curlProgram = makeProgram(baseVertexShader, shaders.CURL);
  const vorticityProgram = makeProgram(baseVertexShader, shaders.VORTICITY);
  const pressureProgram = makeProgram(baseVertexShader, shaders.PRESSURE);
  const gradientSubtractProgram = makeProgram(baseVertexShader, shaders.GRADIENT_SUBTRACT);
  const displayMaterial = makeMaterial(baseVertexShader, shaders.DISPLAY);
  // The demo also builds copy/clear/color programs it uses for screenshots and its opaque background;
  // only copy (for resizing) and clear (for the pressure decay) are needed here.

  const noiseTexture = createNoiseTexture(64);

  // A full-screen quad, drawn into whichever framebuffer is bound.
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  if (vertexBuffer === null || indexBuffer === null) throw new FluidSetupError("no-webgl", "createBuffer returned null");
  buffersCreated.push(vertexBuffer, indexBuffer);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  function blit(target: Fbo | null): void {
    if (target === null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  // ---- framebuffers ------------------------------------------------------------------------------

  let dye: DoubleFbo | null = null;
  let velocity: DoubleFbo | null = null;
  let divergence: Fbo | null = null;
  let curl: Fbo | null = null;
  let pressure: DoubleFbo | null = null;
  let bloom: Fbo | null = null;
  const bloomFramebuffers: Fbo[] = [];
  let sunrays: Fbo | null = null;
  let sunraysTemp: Fbo | null = null;

  function resizeFBO(target: Fbo, w: number, h: number, internalFormat: number, format: number, type: number, filter: number): Fbo {
    const newFBO = createFBO(w, h, internalFormat, format, type, filter);
    copyProgram.bind();
    gl.uniform1i(copyProgram.uniform("uTexture"), target.attach(0));
    blit(newFBO);
    destroyFBO(target);
    return newFBO;
  }

  function resizeDoubleFBO(target: DoubleFbo, w: number, h: number, internalFormat: number, format: number, type: number, filter: number): DoubleFbo {
    if (target.width === w && target.height === h) return target;
    target.read = resizeFBO(target.read, w, h, internalFormat, format, type, filter);
    destroyFBO(target.write);
    target.write = createFBO(w, h, internalFormat, format, type, filter);
    target.width = w;
    target.height = h;
    target.texelSizeX = 1.0 / w;
    target.texelSizeY = 1.0 / h;
    return target;
  }

  function updateKeywords(): void {
    const keywords: string[] = [];
    if (config.SHADING) keywords.push("SHADING");
    if (config.BLOOM) keywords.push("BLOOM");
    if (config.SUNRAYS) keywords.push("SUNRAYS");
    displayMaterial.setKeywords(keywords);
  }

  function initBloomFramebuffers(): void {
    const res = getResolution(config.BLOOM_RESOLUTION, gl.drawingBufferWidth, gl.drawingBufferHeight);
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    const rgba = ext.formatRGBA;

    if (bloom !== null) destroyFBO(bloom);
    bloom = createFBO(res.width, res.height, rgba.internalFormat, rgba.format, ext.halfFloatTexType, filtering);

    for (const old of bloomFramebuffers) destroyFBO(old);
    bloomFramebuffers.length = 0;
    for (let i = 0; i < config.BLOOM_ITERATIONS; i++) {
      const width = res.width >> (i + 1);
      const height = res.height >> (i + 1);
      if (width < 2 || height < 2) break;
      bloomFramebuffers.push(createFBO(width, height, rgba.internalFormat, rgba.format, ext.halfFloatTexType, filtering));
    }
  }

  function initSunraysFramebuffers(): void {
    const res = getResolution(config.SUNRAYS_RESOLUTION, gl.drawingBufferWidth, gl.drawingBufferHeight);
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    const r = ext.formatR;

    if (sunrays !== null) destroyFBO(sunrays);
    if (sunraysTemp !== null) destroyFBO(sunraysTemp);
    sunrays = createFBO(res.width, res.height, r.internalFormat, r.format, ext.halfFloatTexType, filtering);
    sunraysTemp = createFBO(res.width, res.height, r.internalFormat, r.format, ext.halfFloatTexType, filtering);
  }

  function initFramebuffers(): void {
    const simRes = getResolution(config.SIM_RESOLUTION, gl.drawingBufferWidth, gl.drawingBufferHeight);
    const dyeRes = getResolution(config.DYE_RESOLUTION, gl.drawingBufferWidth, gl.drawingBufferHeight);
    const texType = ext.halfFloatTexType;
    const { formatRGBA: rgba, formatRG: rg, formatR: r } = ext;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.BLEND);

    dye = dye === null
      ? createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering)
      : resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    velocity = velocity === null
      ? createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering)
      : resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);

    // These hold no state between frames, so they are simply recreated.
    if (divergence !== null) destroyFBO(divergence);
    if (curl !== null) destroyFBO(curl);
    if (pressure !== null) destroyDoubleFBO(pressure);
    divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    curl = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    pressure = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);

    initBloomFramebuffers();
    initSunraysFramebuffers();
  }

  // ---- simulation --------------------------------------------------------------------------------

  function step(dt: number): void {
    if (dye === null || velocity === null || divergence === null || curl === null || pressure === null) return;

    gl.disable(gl.BLEND);

    curlProgram.bind();
    gl.uniform2f(curlProgram.uniform("texelSize"), velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniform("uVelocity"), velocity.read.attach(0));
    blit(curl);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniform("texelSize"), velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniform("uVelocity"), velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniform("uCurl"), curl.attach(1));
    gl.uniform1f(vorticityProgram.uniform("curl"), config.CURL);
    gl.uniform1f(vorticityProgram.uniform("dt"), dt);
    blit(velocity.write);
    velocity.swap();

    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniform("texelSize"), velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniform("uVelocity"), velocity.read.attach(0));
    blit(divergence);

    clearProgram.bind();
    gl.uniform1i(clearProgram.uniform("uTexture"), pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniform("value"), config.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniform("texelSize"), velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniform("uDivergence"), divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressureProgram.uniform("uPressure"), pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    gradientSubtractProgram.bind();
    gl.uniform2f(gradientSubtractProgram.uniform("texelSize"), velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradientSubtractProgram.uniform("uPressure"), pressure.read.attach(0));
    gl.uniform1i(gradientSubtractProgram.uniform("uVelocity"), velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniform("texelSize"), velocity.texelSizeX, velocity.texelSizeY);
    if (!ext.supportLinearFiltering) gl.uniform2f(advectionProgram.uniform("dyeTexelSize"), velocity.texelSizeX, velocity.texelSizeY);
    const velocityId = velocity.read.attach(0);
    gl.uniform1i(advectionProgram.uniform("uVelocity"), velocityId);
    gl.uniform1i(advectionProgram.uniform("uSource"), velocityId);
    gl.uniform1f(advectionProgram.uniform("dt"), dt);
    gl.uniform1f(advectionProgram.uniform("dissipation"), config.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    if (!ext.supportLinearFiltering) gl.uniform2f(advectionProgram.uniform("dyeTexelSize"), dye.texelSizeX, dye.texelSizeY);
    gl.uniform1i(advectionProgram.uniform("uVelocity"), velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniform("uSource"), dye.read.attach(1));
    gl.uniform1f(advectionProgram.uniform("dissipation"), config.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
  }

  function applyBloom(source: Fbo, destination: Fbo): void {
    if (bloomFramebuffers.length < 2) return;

    let last = destination;

    gl.disable(gl.BLEND);
    bloomPrefilterProgram.bind();
    const knee = config.BLOOM_THRESHOLD * config.BLOOM_SOFT_KNEE + 0.0001;
    gl.uniform3f(bloomPrefilterProgram.uniform("curve"), config.BLOOM_THRESHOLD - knee, knee * 2, 0.25 / knee);
    gl.uniform1f(bloomPrefilterProgram.uniform("threshold"), config.BLOOM_THRESHOLD);
    gl.uniform1i(bloomPrefilterProgram.uniform("uTexture"), source.attach(0));
    blit(last);

    bloomBlurProgram.bind();
    for (const dest of bloomFramebuffers) {
      gl.uniform2f(bloomBlurProgram.uniform("texelSize"), last.texelSizeX, last.texelSizeY);
      gl.uniform1i(bloomBlurProgram.uniform("uTexture"), last.attach(0));
      blit(dest);
      last = dest;
    }

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);

    for (let i = bloomFramebuffers.length - 2; i >= 0; i--) {
      const baseTex = bloomFramebuffers[i];
      if (baseTex === undefined) continue;
      gl.uniform2f(bloomBlurProgram.uniform("texelSize"), last.texelSizeX, last.texelSizeY);
      gl.uniform1i(bloomBlurProgram.uniform("uTexture"), last.attach(0));
      gl.viewport(0, 0, baseTex.width, baseTex.height);
      blit(baseTex);
      last = baseTex;
    }

    gl.disable(gl.BLEND);
    bloomFinalProgram.bind();
    gl.uniform2f(bloomFinalProgram.uniform("texelSize"), last.texelSizeX, last.texelSizeY);
    gl.uniform1i(bloomFinalProgram.uniform("uTexture"), last.attach(0));
    gl.uniform1f(bloomFinalProgram.uniform("intensity"), config.BLOOM_INTENSITY);
    blit(destination);
  }

  function applySunrays(source: Fbo, mask: Fbo, destination: Fbo): void {
    gl.disable(gl.BLEND);
    sunraysMaskProgram.bind();
    gl.uniform1i(sunraysMaskProgram.uniform("uTexture"), source.attach(0));
    blit(mask);

    sunraysProgram.bind();
    gl.uniform1f(sunraysProgram.uniform("weight"), config.SUNRAYS_WEIGHT);
    gl.uniform1i(sunraysProgram.uniform("uTexture"), mask.attach(0));
    blit(destination);
  }

  function blur(target: Fbo, temp: Fbo, iterations: number): void {
    blurProgram.bind();
    for (let i = 0; i < iterations; i++) {
      gl.uniform2f(blurProgram.uniform("texelSize"), target.texelSizeX, 0.0);
      gl.uniform1i(blurProgram.uniform("uTexture"), target.attach(0));
      blit(temp);

      gl.uniform2f(blurProgram.uniform("texelSize"), 0.0, target.texelSizeY);
      gl.uniform1i(blurProgram.uniform("uTexture"), temp.attach(0));
      blit(target);
    }
  }

  function render(): void {
    if (dye === null) return;

    if (config.BLOOM && bloom !== null) applyBloom(dye.read, bloom);
    if (config.SUNRAYS && sunrays !== null && sunraysTemp !== null) {
      applySunrays(dye.read, dye.write, sunrays);
      blur(sunrays, sunraysTemp, 1);
    }

    // Transparent canvas: clear to nothing, then draw the dye with premultiplied alpha. The display
    // shader writes alpha as the strongest colour channel, so empty water is fully see-through and
    // the page's white shows, while dense dye covers it.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);

    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    displayMaterial.bind();
    if (config.SHADING) gl.uniform2f(displayMaterial.uniform("texelSize"), 1.0 / width, 1.0 / height);
    gl.uniform1i(displayMaterial.uniform("uTexture"), dye.read.attach(0));
    if (config.BLOOM && bloom !== null) {
      gl.uniform1i(displayMaterial.uniform("uBloom"), bloom.attach(1));
      gl.uniform1i(displayMaterial.uniform("uDithering"), noiseTexture.attach(2));
      const scale = textureScale(noiseTexture.width, noiseTexture.height, width, height);
      gl.uniform2f(displayMaterial.uniform("ditherScale"), scale.x, scale.y);
    }
    if (config.SUNRAYS && sunrays !== null) gl.uniform1i(displayMaterial.uniform("uSunrays"), sunrays.attach(3));
    blit(null);
  }

  function splat(x: number, y: number, dx: number, dy: number, color: Rgb): void {
    if (dye === null || velocity === null) return;

    splatProgram.bind();
    gl.uniform1i(splatProgram.uniform("uTarget"), velocity.read.attach(0));
    gl.uniform1f(splatProgram.uniform("aspectRatio"), canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniform("point"), x, y);
    gl.uniform3f(splatProgram.uniform("color"), dx, dy, 0.0);
    gl.uniform1f(splatProgram.uniform("radius"), correctRadius(config.SPLAT_RADIUS / 100.0, canvas.width, canvas.height));
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(splatProgram.uniform("uTarget"), dye.read.attach(0));
    gl.uniform3f(splatProgram.uniform("color"), color.r, color.g, color.b);
    blit(dye.write);
    dye.swap();
  }

  function randomSplats(amount: number, makeColor: () => Rgb): void {
    for (let i = 0; i < amount; i++) {
      const color = makeColor();
      splat(random(), random(), 1000 * (random() - 0.5), 1000 * (random() - 0.5), {
        r: color.r * 10.0,
        g: color.g * 10.0,
        b: color.b * 10.0,
      });
    }
  }

  function dispose(): void {
    for (const fbo of fbosCreated) gl.deleteFramebuffer(fbo);
    for (const texture of texturesCreated) gl.deleteTexture(texture);
    for (const program of programsCreated) gl.deleteProgram(program);
    for (const shader of shadersCreated) gl.deleteShader(shader);
    for (const buffer of buffersCreated) gl.deleteBuffer(buffer);
    fbosCreated.clear();
    texturesCreated.clear();
    programsCreated.length = 0;
    shadersCreated.length = 0;
    buffersCreated.length = 0;
    dye = velocity = pressure = null;
    divergence = curl = bloom = sunrays = sunraysTemp = null;
    bloomFramebuffers.length = 0;
    // Browsers allow only a handful of live WebGL contexts, so give this one back right away.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  updateKeywords();

  return {
    initFramebuffers,
    step,
    render,
    splat,
    randomSplats,
    dispose,
  };
}
