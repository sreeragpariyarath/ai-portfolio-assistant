import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kb, labelsFor, referencedScripts, referencedStyles, totals } from "./lib/web-size.ts";

describe("referencedScripts", () => {
  it("finds script files in tags and in the inline payload, once each, sorted", () => {
    const html = `
      <link rel="stylesheet" href="/_next/static/chunks/aaa.css"/>
      <script src="/_next/static/chunks/zzz.js" async=""></script>
      <script src="/_next/static/chunks/abc-123_x.js"></script>
      <script>self.__next_f.push([1,"[\\"/_next/static/chunks/zzz.js\\",\\"/_next/static/chunks/mid.js\\"]"])</script>`;
    assert.deepEqual(referencedScripts(html), [
      "/_next/static/chunks/abc-123_x.js",
      "/_next/static/chunks/mid.js",
      "/_next/static/chunks/zzz.js",
    ]);
    assert.deepEqual(referencedStyles(html), ["/_next/static/chunks/aaa.css"]);
  });

  it("returns nothing for a page with no Next assets", () => {
    assert.deepEqual(referencedScripts("<html></html>"), []);
  });
});

describe("labelsFor", () => {
  it("recognises code by strings only it contains", () => {
    assert.deepEqual(labelsFor("const c={SIM_RESOLUTION:128}"), ["water effect"]);
    assert.deepEqual(labelsFor("<feDisplacementMap/> and /api/chat"), ["liquid glass", "chat client"]);
    assert.deepEqual(labelsFor("nothing special"), []);
  });
});

describe("sizes", () => {
  it("formats kilobytes and sums files", () => {
    assert.equal(kb(2048), "2.0");
    assert.deepEqual(totals([{ name: "a", raw: 10, gzip: 4, labels: [] }, { name: "b", raw: 5, gzip: 2, labels: [] }]), { raw: 15, gzip: 6 });
  });
});
