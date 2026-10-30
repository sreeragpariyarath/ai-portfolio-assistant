import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeCanvas, createFakeEnv, createStubGl, pointerEvent } from "./fluid-test-kit.ts";
import type { FakeEnvOptions, StubGlOptions } from "./fluid-test-kit.ts";
import { createFluid } from "./index.ts";
import type { FluidFailure, FluidOptions } from "./index.ts";

function setup(gl: StubGlOptions = {}, env: FakeEnvOptions = {}, options: FluidOptions = {}, size: { clientWidth?: number; clientHeight?: number } = {}) {
  const stub = createStubGl(gl);
  const surface = createFakeCanvas({ stub, ...size });
  const kit = createFakeEnv(env);
  const result = createFluid(surface.canvas, { env: kit.env, ...options });
  return { stub, surface, kit, result };
}

function started(...args: Parameters<typeof setup>) {
  const context = setup(...args);
  assert.ok(context.result.ok, "the effect should be created");
  context.result.fluid.start();
  return { ...context, fluid: context.result.fluid };
}

// How many draw calls one frame makes with nothing to stir: the cost of the simulation step and display.
function frameCost(context: ReturnType<typeof started>): number {
  const before = context.stub.calls("drawElements");
  context.kit.runFrame();
  return context.stub.calls("drawElements") - before;
}

describe("createFluid: when it cannot start", () => {
  it("reports no WebGL when the canvas gives no context", () => {
    const context = setup();
    context.surface.raw.getContext = () => null;
    const result = createFluid(context.surface.canvas, { env: context.kit.env });
    assert.deepEqual(result, { ok: false, reason: "no-webgl" });
  });

  it("recognises a canvas whose context was already released, instead of blaming the GPU", () => {
    const { result, stub } = setup({ contextLost: true });
    assert.ok(!result.ok);
    assert.equal(result.reason, "context-lost");
    assert.match(result.detail ?? "", /new canvas element/);
    assert.equal(stub.calls("loseContext"), 0, "there is nothing left to release");
  });

  it("reports missing float textures, and gives the context back", () => {
    const { result, stub } = setup({ framebufferComplete: false });
    assert.deepEqual(result, { ok: false, reason: "no-float-textures" });
    assert.equal(stub.calls("loseContext"), 1);
  });

  it("reports a shader that fails to compile, with the GPU's own message, and gives the context back", () => {
    const { result, stub } = setup({ shadersCompile: false });
    assert.deepEqual(result, { ok: false, reason: "shader-error", detail: "stub info log" });
    assert.equal(stub.calls("loseContext"), 1);
  });

  it("does not even ask for a context when the visitor prefers reduced motion", () => {
    const stub = createStubGl();
    const surface = createFakeCanvas({ stub });
    let asked = 0;
    surface.raw.getContext = () => {
      asked++;
      return stub.gl;
    };
    const kit = createFakeEnv({ reducedMotion: true });
    assert.deepEqual(createFluid(surface.canvas, { env: kit.env }), { ok: false, reason: "reduced-motion" });
    assert.equal(asked, 0);
  });

  it("can be told to ignore reduced motion", () => {
    const { result } = setup({}, { reducedMotion: true }, { respectReducedMotion: false });
    assert.equal(result.ok, true);
  });

  it("falls back to WebGL 1 with half-float textures", () => {
    const { result } = setup({ webgl2: false, extensions: ["OES_texture_half_float", "OES_texture_half_float_linear"] });
    assert.equal(result.ok, true);
  });

  it("reports missing float textures on WebGL 1 without the half-float extension", () => {
    const { result, stub } = setup({ webgl2: false, extensions: [] });
    assert.deepEqual(result, { ok: false, reason: "no-float-textures" });
    assert.equal(stub.calls("loseContext"), 1, "the unusable context is given back");
  });

  it("treats every failure as one of the known reasons", () => {
    const known: FluidFailure[] = ["no-webgl", "no-float-textures", "shader-error", "reduced-motion", "context-lost"];
    for (const gl of [{ framebufferComplete: false }, { shadersCompile: false }]) {
      const { result } = setup(gl);
      assert.ok(!result.ok && known.includes(result.reason));
    }
  });
});

describe("createFluid: start and stop", () => {
  it("does nothing until started, then draws one frame at a time", () => {
    const { result, kit, stub } = setup();
    assert.ok(result.ok);
    assert.equal(result.fluid.running, false);
    assert.equal(kit.pendingFrames(), 0);

    result.fluid.start();
    assert.equal(result.fluid.running, true);
    assert.equal(kit.pendingFrames(), 1);

    kit.runFrame();
    assert.ok(stub.calls("drawElements") > 0);
    assert.equal(kit.pendingFrames(), 1, "the next frame is scheduled");
  });

  it("stop() cancels the pending frame, stops drawing and removes every listener", () => {
    const context = started();
    context.kit.runFrame();
    const draws = context.stub.calls("drawElements");

    context.fluid.stop();

    assert.equal(context.fluid.running, false);
    assert.equal(context.kit.pendingFrames(), 0);
    assert.equal(context.kit.runFrame(), false);
    assert.equal(context.stub.calls("drawElements"), draws);
    assert.equal(context.kit.listenerCounts().live, 0);
  });

  it("start() and stop() are safe to repeat, and start again after a stop", () => {
    const context = started();
    context.fluid.start();
    assert.equal(context.kit.pendingFrames(), 1, "a second start does not schedule a second frame");
    context.fluid.stop();
    context.fluid.stop();
    context.fluid.start();
    assert.equal(context.kit.pendingFrames(), 1);
    assert.equal(context.fluid.running, true);
  });
});

describe("createFluid: pausing", () => {
  it("does not draw while the tab is hidden, and resumes when it is visible again", () => {
    const context = setup({}, { hidden: true });
    assert.ok(context.result.ok);
    context.result.fluid.start();
    assert.equal(context.kit.pendingFrames(), 0, "hidden at start: no frame");

    context.kit.document.visibilityState = "visible";
    context.kit.fireDocument("visibilitychange");
    assert.equal(context.kit.pendingFrames(), 1);
    context.kit.runFrame();
    assert.ok(context.stub.calls("drawElements") > 0);

    context.kit.document.visibilityState = "hidden";
    context.kit.fireDocument("visibilitychange");
    assert.equal(context.kit.pendingFrames(), 0, "hiding cancels the pending frame");
  });

  it("a frame that runs just after the tab was hidden draws nothing", () => {
    const context = started();
    context.kit.runFrame();
    const draws = context.stub.calls("drawElements");
    context.kit.document.visibilityState = "hidden";
    context.kit.runFrame();
    assert.equal(context.stub.calls("drawElements"), draws);
    assert.equal(context.kit.pendingFrames(), 0);
  });

  it("waits for a canvas that has no size yet, then draws once it has one", () => {
    const context = started({}, {}, {}, { clientWidth: 0, clientHeight: 0 });
    context.kit.runFrame();
    assert.equal(context.stub.calls("drawElements"), 0);
    assert.equal(context.kit.pendingFrames(), 1, "still waiting");

    context.surface.raw.clientWidth = 800;
    context.surface.raw.clientHeight = 600;
    context.kit.runFrame();
    assert.ok(context.stub.calls("drawElements") > 0);
  });
});

describe("createFluid: canvas size", () => {
  it("sizes the canvas to its box, and follows a resize", () => {
    const context = started();
    context.kit.runFrame();
    assert.deepEqual([context.surface.raw.width, context.surface.raw.height], [800, 600]);

    const created = context.stub.calls("createFramebuffer");
    context.surface.raw.clientWidth = 400;
    context.kit.runFrame();
    assert.equal(context.surface.raw.width, 400);
    assert.ok(context.stub.calls("createFramebuffer") > created, "the framebuffers are rebuilt for the new size");
  });

  it("caps the pixel ratio so a 3x screen does not pay for 9x the pixels", () => {
    const context = started({}, { devicePixelRatio: 3 });
    context.kit.runFrame();
    assert.deepEqual([context.surface.raw.width, context.surface.raw.height], [1200, 900]);
  });
});

describe("createFluid: stirring", () => {
  function drawsFor(context: ReturnType<typeof started>, act: () => void): number {
    act();
    return frameCost(context);
  }

  it("a mouse stirs the water just by moving; the first movement only plants it", () => {
    const context = started();
    const idle = frameCost(context); // first frame also builds the framebuffers, so measure the next
    const normal = frameCost(context);
    assert.ok(idle >= normal);

    const planted = drawsFor(context, () => context.kit.fireWindow("pointermove", pointerEvent({ clientX: 100, clientY: 100 })));
    assert.equal(planted, normal, "planting draws nothing extra");
    const stirred = drawsFor(context, () => context.kit.fireWindow("pointermove", pointerEvent({ clientX: 220, clientY: 160 })));
    assert.equal(stirred, normal + 2, "one push into the velocity and one dye splat");
    const still = drawsFor(context, () => undefined);
    assert.equal(still, normal, "no movement, no splat");
  });

  it("touch only stirs while a finger is down, and not from a control", () => {
    const context = started();
    frameCost(context);
    const normal = frameCost(context);
    const touch = (type: string, x: number, y: number, target: unknown = null) =>
      context.kit.fireWindow(type, pointerEvent({ pointerId: 5, pointerType: "touch", clientX: x, clientY: y, target }));

    assert.equal(drawsFor(context, () => touch("pointermove", 50, 50)), normal, "moving without contact does nothing");

    touch("pointerdown", 10, 10, { closest: () => ({}) });
    assert.equal(drawsFor(context, () => touch("pointermove", 90, 90)), normal, "a drag that starts on a control is not a stir");

    touch("pointerdown", 10, 10);
    assert.equal(drawsFor(context, () => touch("pointermove", 120, 120)), normal + 2, "a finger drag stirs");

    touch("pointerup", 120, 120);
    assert.equal(drawsFor(context, () => touch("pointermove", 200, 200)), normal, "lifting the finger stops it");
  });

  it("forgets the mouse when it leaves the page, so coming back does not smear a line across the screen", () => {
    const context = started();
    frameCost(context);
    const normal = frameCost(context);
    context.kit.fireWindow("pointermove", pointerEvent({ clientX: 10, clientY: 10 }));
    context.kit.fireWindow("pointerout", pointerEvent({ clientX: 10, clientY: 10, relatedTarget: null }));
    assert.equal(drawsFor(context, () => context.kit.fireWindow("pointermove", pointerEvent({ clientX: 700, clientY: 500 }))), normal);
  });

  it("splat() paints on request, but only once the first frame has been drawn", () => {
    const context = started();
    const before = context.stub.calls("drawElements");
    context.fluid.splat(0.5, 0.5, 100, 100);
    assert.equal(context.stub.calls("drawElements"), before, "nothing to paint on yet");

    context.kit.runFrame();
    // Unlike a pointer, which is applied in the next frame, splat() paints at the moment it is called.
    const beforeSplat = context.stub.calls("drawElements");
    context.fluid.splat(0.5, 0.5, 100, 100);
    assert.equal(context.stub.calls("drawElements") - beforeSplat, 2, "one push into the velocity and one dye splat");
  });

  it("can start with random splats, and by default starts pure white", () => {
    const plain = started();
    const withSplats = started({}, {}, { config: { INITIAL_SPLATS: 3 } });
    const plainFirst = frameCost(plain);
    const splatFirst = frameCost(withSplats);
    assert.equal(splatFirst, plainFirst + 6);
  });
});

describe("createFluid: tearing down", () => {
  it("destroy() releases everything: frames, listeners, GPU objects and the context", () => {
    const context = started();
    context.kit.runFrame();
    assert.equal(context.surface.listenerCount("webglcontextlost"), 1);

    context.fluid.destroy();

    assert.equal(context.fluid.destroyed, true);
    assert.equal(context.fluid.running, false);
    assert.equal(context.kit.pendingFrames(), 0);
    assert.equal(context.kit.listenerCounts().live, 0);
    assert.equal(context.surface.listenerCount("webglcontextlost"), 0);
    for (const method of ["deleteTexture", "deleteFramebuffer", "deleteProgram", "deleteShader", "deleteBuffer"]) {
      assert.ok(context.stub.calls(method) > 0, method);
    }
    assert.equal(context.stub.calls("loseContext"), 1);
  });

  it("is safe to call twice, and cannot be restarted afterwards", () => {
    const context = started();
    context.fluid.destroy();
    context.fluid.destroy();
    context.fluid.start();
    assert.equal(context.stub.calls("loseContext"), 1);
    assert.equal(context.fluid.running, false);
    assert.equal(context.kit.pendingFrames(), 0);
  });

  it("gives up when the GPU context is lost, and says so", () => {
    const reasons: FluidFailure[] = [];
    const context = started({}, {}, { onFailure: (reason) => reasons.push(reason) });
    context.kit.runFrame();
    let prevented = false;
    context.surface.dispatch("webglcontextlost", { preventDefault: () => (prevented = true) });

    assert.equal(prevented, true);
    assert.equal(context.fluid.destroyed, true);
    assert.deepEqual(reasons, ["context-lost"]);
    assert.equal(context.kit.pendingFrames(), 0);
  });

  it("does not report a failure for its own destroy()", () => {
    const reasons: FluidFailure[] = [];
    const context = started({}, {}, { onFailure: (reason) => reasons.push(reason) });
    context.fluid.destroy();
    context.surface.dispatch("webglcontextlost", { preventDefault: () => undefined });
    assert.deepEqual(reasons, []);
  });
});
