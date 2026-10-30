// Stand-ins for the browser and the GPU, so the water effect's lifecycle can be tested in Node.
// Used only by *.test.ts files; the app never imports this.

import type { FluidEnv } from "./env.ts";
import type { FluidSurface } from "./index.ts";

type Listener = (event: Event) => void;

export interface StubGlOptions {
  webgl2?: boolean;
  extensions?: string[];
  framebufferComplete?: boolean;
  shadersCompile?: boolean;
  contextLost?: boolean;
}

// A WebGL context whose methods do nothing but count calls. Constants (RGBA16F and so on) read as
// stable distinct numbers; the few methods whose answer matters return what a working GPU would.
export function createStubGl(options: StubGlOptions = {}) {
  const { extensions = ["EXT_color_buffer_float", "OES_texture_float_linear"], framebufferComplete = true, shadersCompile = true, contextLost = false } = options;
  const calls = new Map<string, number>();
  const constants = new Map<string, number>();
  const constant = (name: string) => {
    let value = constants.get(name);
    if (value === undefined) {
      value = 1000 + constants.size;
      constants.set(name, value);
    }
    return value;
  };
  const count = (name: string) => calls.set(name, (calls.get(name) ?? 0) + 1);
  const objects = new Map<string, number>();
  const makeObject = (kind: string) => ({ kind, id: objects.set(kind, (objects.get(kind) ?? 0) + 1).get(kind) });

  const gl = new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property !== "string") return undefined;
        if (property === "drawingBufferWidth") return 800;
        if (property === "drawingBufferHeight") return 600;
        if (/^[A-Z][A-Z0-9_]*$/.test(property)) return constant(property);
        return (...args: unknown[]) => {
          count(property);
          switch (property) {
            case "getExtension":
              if (args[0] === "WEBGL_lose_context") return { loseContext: () => count("loseContext") };
              if (args[0] === "OES_texture_half_float") return extensions.includes("OES_texture_half_float") ? { HALF_FLOAT_OES: 0x8d61 } : null;
              return extensions.includes(String(args[0])) ? {} : null;
            case "createTexture":
            case "createFramebuffer":
            case "createProgram":
            case "createShader":
            case "createBuffer":
              return makeObject(property);
            case "isContextLost":
              return contextLost;
            case "getShaderParameter":
              return shadersCompile;
            case "getProgramParameter":
              return args[1] === constant("ACTIVE_UNIFORMS") ? 0 : true;
            case "getShaderInfoLog":
            case "getProgramInfoLog":
              return "stub info log";
            case "checkFramebufferStatus":
              return framebufferComplete ? constant("FRAMEBUFFER_COMPLETE") : constant("FRAMEBUFFER_INCOMPLETE_ATTACHMENT");
            case "getUniformLocation":
              return {};
            default:
              return undefined;
          }
        };
      },
    },
  );

  return { gl, calls: (name: string) => calls.get(name) ?? 0, webgl2: options.webgl2 ?? true };
}

export interface FakeCanvasOptions {
  stub: ReturnType<typeof createStubGl>;
  clientWidth?: number;
  clientHeight?: number;
}

export function createFakeCanvas({ stub, clientWidth = 800, clientHeight = 600 }: FakeCanvasOptions) {
  const listeners = new Map<string, Set<Listener>>();
  const canvas = {
    width: 0,
    height: 0,
    clientWidth,
    clientHeight,
    getContext(id: string) {
      if (id === "webgl2") return stub.webgl2 ? stub.gl : null;
      if (id === "webgl" || id === "experimental-webgl") return stub.webgl2 ? null : stub.gl;
      return null;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: canvas.clientWidth, height: canvas.clientHeight }),
    addEventListener(type: string, listener: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
    },
  };
  return {
    canvas: canvas as unknown as FluidSurface & { width: number; height: number; clientWidth: number; clientHeight: number },
    raw: canvas,
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
    dispatch: (type: string, event: object = {}) => listeners.get(type)?.forEach((listener) => listener(event as Event)),
  };
}

export interface FakeEnvOptions {
  reducedMotion?: boolean;
  devicePixelRatio?: number;
  userAgent?: string;
  hidden?: boolean;
}

export function createFakeEnv(options: FakeEnvOptions = {}) {
  let now = 1000;
  const windowListeners = new Map<string, Set<Listener>>();
  const documentListeners = new Map<string, Set<Listener>>();
  let nextFrameId = 1;
  const frames = new Map<number, () => void>();
  let added = 0;
  let removed = 0;

  const track = (map: Map<string, Set<Listener>>) => ({
    addEventListener(type: string, listener: Listener) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type)!.add(listener);
      added++;
    },
    removeEventListener(type: string, listener: Listener) {
      if (map.get(type)?.delete(listener)) removed++;
    },
  });

  const document = { visibilityState: options.hidden ? "hidden" : "visible", ...track(documentListeners) };
  const env = {
    window: {
      devicePixelRatio: options.devicePixelRatio ?? 1,
      matchMedia: (query: string) => ({ matches: options.reducedMotion === true && query.includes("prefers-reduced-motion") }),
      requestAnimationFrame(callback: (time: number) => void) {
        const id = nextFrameId++;
        frames.set(id, () => callback(now));
        return id;
      },
      cancelAnimationFrame(id: number) {
        frames.delete(id);
      },
      ...track(windowListeners),
    },
    document,
    userAgent: options.userAgent ?? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0",
    now: () => now,
    random: (() => {
      let seed = 12345;
      return () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };
    })(),
  };

  return {
    env: env as unknown as FluidEnv,
    document,
    // Runs the one pending animation frame, 16 ms after the last one. Returns false if none was pending.
    runFrame(elapsedMs = 16) {
      const first = frames.entries().next();
      if (first.done) return false;
      const [id, run] = first.value;
      frames.delete(id);
      now += elapsedMs;
      run();
      return true;
    },
    pendingFrames: () => frames.size,
    fireWindow: (type: string, event: object = {}) => windowListeners.get(type)?.forEach((listener) => listener(event as Event)),
    fireDocument: (type: string) => documentListeners.get(type)?.forEach((listener) => listener({} as Event)),
    listenerCounts: () => ({ added, removed, live: added - removed }),
  };
}

// A pointer event as the effect reads it.
export function pointerEvent(init: { pointerId?: number; pointerType?: string; clientX: number; clientY: number; target?: unknown; relatedTarget?: unknown }) {
  return { pointerId: 1, pointerType: "mouse", target: null, relatedTarget: {}, ...init };
}
