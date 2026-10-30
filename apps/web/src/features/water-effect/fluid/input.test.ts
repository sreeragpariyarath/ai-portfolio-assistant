import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeEnv, pointerEvent } from "./fluid-test-kit.ts";
import { attachInput, isInteractiveTarget } from "./input.ts";
import type { InputSink, PointerKind } from "./input.ts";

// A stand-in for a DOM element: `closest` answers true for the selectors it is told it matches.
function element(matches: (selector: string) => boolean) {
  return { closest: (selector: string) => (matches(selector) ? {} : null) };
}

describe("isInteractiveTarget", () => {
  it("is true for fields, buttons, links and anything marked data-fluid-ignore, or inside them", () => {
    for (const tag of ["input", "textarea", "select", "button", "a[href]", "[role='button']", "[data-fluid-ignore]"]) {
      assert.equal(isInteractiveTarget(element((selector) => selector.split(", ").includes(tag))), true, tag);
    }
  });

  it("is false for plain content, and for things that are not elements", () => {
    assert.equal(isInteractiveTarget(element(() => false)), false);
    assert.equal(isInteractiveTarget(null), false);
    assert.equal(isInteractiveTarget(undefined), false);
    assert.equal(isInteractiveTarget({}), false);
    assert.equal(isInteractiveTarget("text"), false);
  });
});

function recordingSink() {
  const events: string[] = [];
  const sink: InputSink = {
    down: (id: number, kind: PointerKind, x: number, y: number) => events.push(`down ${id} ${kind} ${x},${y}`),
    move: (id: number, kind: PointerKind, x: number, y: number) => events.push(`move ${id} ${kind} ${x},${y}`),
    up: (id: number, kind: PointerKind) => events.push(`up ${id} ${kind}`),
    leave: () => events.push("leave"),
  };
  return { events, sink };
}

const canvas = {
  width: 1600,
  height: 1200,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
};

describe("attachInput", () => {
  it("passes positions to the sink in canvas pixels", () => {
    const kit = createFakeEnv();
    const { events, sink } = recordingSink();
    attachInput(kit.env, canvas, sink);
    kit.fireWindow("pointerdown", pointerEvent({ pointerId: 4, pointerType: "touch", clientX: 100, clientY: 50 }));
    kit.fireWindow("pointermove", pointerEvent({ pointerId: 4, pointerType: "touch", clientX: 200, clientY: 100 }));
    kit.fireWindow("pointerup", pointerEvent({ pointerId: 4, pointerType: "touch", clientX: 200, clientY: 100 }));
    assert.deepEqual(events, ["down 4 touch 200,100", "move 4 touch 400,200", "up 4 touch"]);
  });

  it("ignores a touch or pen that starts on a control, so taps and selections still work", () => {
    const kit = createFakeEnv();
    const { events, sink } = recordingSink();
    attachInput(kit.env, canvas, sink);
    const button = element(() => true);
    kit.fireWindow("pointerdown", pointerEvent({ pointerType: "touch", clientX: 1, clientY: 1, target: button }));
    kit.fireWindow("pointerdown", pointerEvent({ pointerType: "pen", clientX: 1, clientY: 1, target: button }));
    assert.deepEqual(events, []);
  });

  it("still reports a mouse press on a control, since the mouse stirs by moving anyway", () => {
    const kit = createFakeEnv();
    const { events, sink } = recordingSink();
    attachInput(kit.env, canvas, sink);
    kit.fireWindow("pointerdown", pointerEvent({ pointerType: "mouse", clientX: 1, clientY: 1, target: element(() => true) }));
    assert.equal(events.length, 1);
  });

  it("treats a pointer cancel (the browser took a gesture for scrolling) as the pointer going up", () => {
    const kit = createFakeEnv();
    const { events, sink } = recordingSink();
    attachInput(kit.env, canvas, sink);
    kit.fireWindow("pointercancel", pointerEvent({ pointerId: 9, pointerType: "touch", clientX: 0, clientY: 0 }));
    assert.deepEqual(events, ["up 9 touch"]);
  });

  it("forgets everything when the mouse leaves the page or the window loses focus, but not on moving between elements", () => {
    const kit = createFakeEnv();
    const { events, sink } = recordingSink();
    attachInput(kit.env, canvas, sink);
    kit.fireWindow("pointerout", pointerEvent({ pointerType: "mouse", clientX: 0, clientY: 0, relatedTarget: {} }));
    assert.deepEqual(events, []);
    kit.fireWindow("pointerout", pointerEvent({ pointerType: "mouse", clientX: 0, clientY: 0, relatedTarget: null }));
    kit.fireWindow("pointerout", pointerEvent({ pointerType: "touch", clientX: 0, clientY: 0, relatedTarget: null }));
    kit.fireWindow("blur");
    assert.deepEqual(events, ["leave", "leave"]);
  });

  it("reads an unknown pointer type as touch, which needs contact", () => {
    const kit = createFakeEnv();
    const { events, sink } = recordingSink();
    attachInput(kit.env, canvas, sink);
    kit.fireWindow("pointermove", pointerEvent({ pointerType: "", clientX: 0, clientY: 0 }));
    assert.ok(events[0]?.includes(" touch "));
  });

  it("removes every listener it added when detached", () => {
    const kit = createFakeEnv();
    const detach = attachInput(kit.env, canvas, recordingSink().sink);
    assert.ok(kit.listenerCounts().live > 0);
    detach();
    assert.equal(kit.listenerCounts().live, 0);
  });
});
