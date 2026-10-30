// Server-sent events, parsed by hand: EventSource cannot send a POST body, so the chat uses fetch and
// reads response.body. Pure logic with no imports, so the root test suite can run it.
//
// Follows the SSE line rules: lines end with LF, CRLF or CR (including a CRLF split across two
// chunks); a blank line ends a frame; `:` lines are comments; several `data:` lines join with "\n";
// one space after the colon is dropped; `id` and `retry` are ignored; a leading BOM is dropped; and a
// frame with no `data` lines is not emitted.

export interface SseFrame {
  event: string;
  data: string;
}

export interface SseParser {
  // Feed bytes (or text) as they arrive; returns the frames completed by this chunk.
  push(chunk: Uint8Array | string): SseFrame[];
  // Call once when the stream ends. `incomplete` is true when bytes were left over that never formed
  // a whole frame (a cut-off stream); those bytes are discarded, as browsers do.
  finish(): { frames: SseFrame[]; incomplete: boolean };
}

export function createSseParser(): SseParser {
  // `stream: true` keeps a multi-byte character that is split across chunks intact.
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let eventName = "";
  let dataLines: string[] = [];

  function handleLine(line: string, frames: SseFrame[]): void {
    if (line === "") {
      if (dataLines.length > 0) frames.push({ event: eventName === "" ? "message" : eventName, data: dataLines.join("\n") });
      eventName = "";
      dataLines = [];
      return;
    }
    if (line.startsWith(":")) return;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") eventName = value;
    else if (field === "data") dataLines.push(value);
  }

  // Consumes every complete line in the buffer. A trailing CR waits for the next chunk, because it
  // may be the first half of a CRLF; at the end of the stream (`final`) it is a line break by itself.
  function drain(frames: SseFrame[], final: boolean): void {
    let start = 0;
    let index = 0;
    while (index < buffer.length) {
      const char = buffer[index];
      if (char === "\n") {
        handleLine(buffer.slice(start, index), frames);
        index += 1;
        start = index;
      } else if (char === "\r") {
        if (index + 1 >= buffer.length && !final) break;
        handleLine(buffer.slice(start, index), frames);
        index += buffer[index + 1] === "\n" ? 2 : 1;
        start = index;
      } else {
        index += 1;
      }
    }
    buffer = buffer.slice(start);
  }

  return {
    push(chunk) {
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      const frames: SseFrame[] = [];
      drain(frames, false);
      return frames;
    },
    finish() {
      buffer += decoder.decode();
      const frames: SseFrame[] = [];
      drain(frames, true);
      const incomplete = buffer !== "" || dataLines.length > 0 || eventName !== "";
      buffer = "";
      eventName = "";
      dataLines = [];
      return { frames, incomplete };
    },
  };
}
