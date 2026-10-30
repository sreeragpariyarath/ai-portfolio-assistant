// The browser features the water effect uses, gathered in one object so tests can replace them.

export interface EventTargetLike {
  addEventListener(type: string, listener: (event: Event) => void, options?: AddEventListenerOptions): void;
  removeEventListener(type: string, listener: (event: Event) => void, options?: AddEventListenerOptions): void;
}

export interface FluidEnv {
  window: EventTargetLike & {
    devicePixelRatio: number;
    matchMedia?: (query: string) => { matches: boolean };
    requestAnimationFrame(callback: (time: number) => void): number;
    cancelAnimationFrame(id: number): void;
  };
  document: EventTargetLike & { visibilityState: string };
  userAgent: string;
  now(): number;
  random(): number;
}

export function browserEnv(): FluidEnv {
  return {
    window,
    document,
    userAgent: navigator.userAgent,
    now: () => performance.now(),
    random: () => Math.random(),
  };
}

export function prefersReducedMotion(env: FluidEnv): boolean {
  return env.window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
