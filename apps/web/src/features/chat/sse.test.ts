import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSseParser } from "./sse.ts";
import type { SseFrame } from "./sse.ts";

const encoder = new TextEncoder();

// The exact framing of apps/api/src/chat.ts (`event: <name>\ndata: <json>\n\n`).
function serverFrame(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parseAll(chunks: (Uint8Array | string)[]): { frames: SseFrame[]; incomplete: boolean } {
  const parser = createSseParser();
  const frames: SseFrame[] = [];
  for (const chunk of chunks) frames.push(...parser.push(chunk));
  const end = parser.finish();
  return { frames: [...frames, ...end.frames], incomplete: end.incomplete };
}

const STREAM =
  serverFrame("meta", { behavior: "answer", behaviorValid: true, retrieved: ["project-demo-001"], degraded: false }) +
  serverFrame("token", { text: "Alex built it — café résumé 🚀 done" }) +
  serverFrame("token", { text: "日本語 and a [project-demo-001] citation" }) +
  serverFrame("done", { citations: ["project-demo-001"], invalidCitationsDropped: 0, truncated: false, model: "m" });

const EXPECTED: SseFrame[] = [
  { event: "meta", data: JSON.stringify({ behavior: "answer", behaviorValid: true, retrieved: ["project-demo-001"], degraded: false }) },
  { event: "token", data: JSON.stringify({ text: "Alex built it — café résumé 🚀 done" }) },
  { event: "token", data: JSON.stringify({ text: "日本語 and a [project-demo-001] citation" }) },
  { event: "done", data: JSON.stringify({ citations: ["project-demo-001"], invalidCitationsDropped: 0, truncated: false, model: "m" }) },
];

describe("createSseParser: the server's framing", () => {
  it("reads every frame from one chunk", () => {
    const { frames, incomplete } = parseAll([encoder.encode(STREAM)]);
    assert.deepEqual(frames, EXPECTED);
    assert.equal(incomplete, false);
  });

  it("gives the same frames when the bytes are cut at every position, including inside a character", () => {
    const bytes = encoder.encode(STREAM);
    assert.ok(bytes.length > STREAM.length, "the stream must contain multi-byte characters");
    for (let cut = 0; cut <= bytes.length; cut++) {
      const { frames, incomplete } = parseAll([bytes.slice(0, cut), bytes.slice(cut)]);
      assert.deepEqual(frames, EXPECTED, `cut at byte ${cut}`);
      assert.equal(incomplete, false, `cut at byte ${cut}`);
    }
  });

  it("gives the same frames one byte at a time", () => {
    const bytes = encoder.encode(STREAM);
    const { frames } = parseAll(Array.from(bytes, (byte) => new Uint8Array([byte])));
    assert.deepEqual(frames, EXPECTED);
  });

  it("emits a frame only once its blank line has arrived", () => {
    const parser = createSseParser();
    assert.deepEqual(parser.push("event: token\ndata: {\"text\":\"a\"}\n"), []);
    assert.deepEqual(parser.push("\n"), [{ event: "token", data: "{\"text\":\"a\"}" }]);
  });
});

describe("createSseParser: SSE line rules", () => {
  it("accepts LF, CRLF and CR line endings", () => {
    for (const eol of ["\n", "\r\n", "\r"]) {
      const text = `event: token${eol}data: one${eol}${eol}event: done${eol}data: two${eol}${eol}`;
      assert.deepEqual(parseAll([text]).frames, [
        { event: "token", data: "one" },
        { event: "done", data: "two" },
      ]);
    }
  });

  it("does not turn a CRLF split across two chunks into two line breaks", () => {
    const { frames } = parseAll(["event: token\r\ndata: a\r", "\n\r", "\nevent: done\r\ndata: b\r\n\r\n"]);
    assert.deepEqual(frames, [
      { event: "token", data: "a" },
      { event: "done", data: "b" },
    ]);
  });

  it("joins several data lines with a newline", () => {
    assert.deepEqual(parseAll(["data: line one\ndata: line two\n\n"]).frames, [{ event: "message", data: "line one\nline two" }]);
  });

  it("names a frame without an event line 'message'", () => {
    assert.deepEqual(parseAll(["data: x\n\n"]).frames, [{ event: "message", data: "x" }]);
  });

  it("drops one space after the colon, and only one", () => {
    assert.deepEqual(parseAll(["data:no-space\n\ndata:  two-spaces\n\n"]).frames, [
      { event: "message", data: "no-space" },
      { event: "message", data: " two-spaces" },
    ]);
  });

  it("ignores comments, id and retry, and unknown fields", () => {
    const text = ": keep-alive\nid: 7\nretry: 1000\nweird: field\nevent: token\ndata: kept\n\n";
    assert.deepEqual(parseAll([text]).frames, [{ event: "token", data: "kept" }]);
  });

  it("does not emit a frame with no data line, and resets the event name", () => {
    const text = "event: token\n\ndata: next\n\n";
    assert.deepEqual(parseAll([text]).frames, [{ event: "message", data: "next" }]);
  });

  it("keeps an empty data line as an empty string", () => {
    assert.deepEqual(parseAll(["data\n\n", "data:\n\n"]).frames, [
      { event: "message", data: "" },
      { event: "message", data: "" },
    ]);
  });

  it("drops a leading byte order mark", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...encoder.encode("event: token\ndata: ok\n\n")]);
    assert.deepEqual(parseAll([bytes]).frames, [{ event: "token", data: "ok" }]);
  });
});

describe("createSseParser: a cut-off stream", () => {
  it("reports leftover bytes as incomplete and does not emit a half frame", () => {
    const cutOff = STREAM.slice(0, STREAM.lastIndexOf("event: done") + "event: done\ndata: {\"cit".length);
    const { frames, incomplete } = parseAll([encoder.encode(cutOff)]);
    assert.deepEqual(frames, EXPECTED.slice(0, 3));
    assert.equal(incomplete, true);
  });

  it("reports a frame missing only its blank line as incomplete", () => {
    const { frames, incomplete } = parseAll(["event: done\ndata: {}\n"]);
    assert.deepEqual(frames, []);
    assert.equal(incomplete, true);
  });

  it("is not incomplete after a clean end, or for an empty stream", () => {
    assert.equal(parseAll([]).incomplete, false);
    assert.equal(parseAll([serverFrame("token", { text: "a" })]).incomplete, false);
  });

  it("treats a trailing CR at the end of the stream as a line break", () => {
    const { frames, incomplete } = parseAll(["data: a\r\r"]);
    assert.deepEqual(frames, [{ event: "message", data: "a" }]);
    assert.equal(incomplete, false);
  });
});
