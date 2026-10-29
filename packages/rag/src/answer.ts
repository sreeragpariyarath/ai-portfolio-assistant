// Parses a model reply (Phase 3 task 3.5): the `BEHAVIOR:` first line, then the body with `[record-id]`
// citations checked against the ids that were put in the prompt. Works on a stream: feed chunks to
// `push`, and a citation split across chunks is held back until it is complete. Pure and runtime-neutral.
import { BEHAVIORS, type Behavior } from "./prompt.ts";

export interface AnswerHeader {
  behavior: Behavior;
  // False when the first line was missing or malformed; the behavior then defaults to "qualify".
  valid: boolean;
}

export interface AnswerResult {
  behavior: Behavior;
  behaviorValid: boolean;
  // The body with the BEHAVIOR line removed and every citation that is not an allowed id removed.
  text: string;
  // Allowed ids that were cited, once each, in order of first use.
  citations: string[];
  invalidCitationsDropped: number;
}

export interface AnswerChunk {
  // Set once, on the first chunk that settles the behavior.
  header?: AnswerHeader;
  // Safe text to show now.
  text: string;
}

export interface AnswerParser {
  push(chunk: string): AnswerChunk;
  end(): AnswerChunk & { result: AnswerResult };
}

const HEADER_KEY = "BEHAVIOR:";
const MAX_HEADER_CHARS = 64;
const MAX_CITATION_CHARS = 120;
// Record ids look like `project-demo-001`: letters and digits with at least one separator, so `[1]` or `[note]` are left alone.
const ID_LIKE = /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i;

function parseHeaderLine(line: string): AnswerHeader {
  const match = /^BEHAVIOR:\s*([a-z]+)\s*$/i.exec(line.trim());
  const word = match?.[1]?.toLowerCase();
  const behavior = BEHAVIORS.find((candidate) => candidate === word);
  return behavior ? { behavior, valid: true } : { behavior: "qualify", valid: false };
}

export function createAnswerParser(allowedIds: Iterable<string>): AnswerParser {
  const allowed = new Set(allowedIds);
  const cited: string[] = [];
  let dropped = 0;
  let header: AnswerHeader | undefined;
  let headerBuffer = "";
  let inBody = false;
  let started = false; // body text has begun (leading whitespace is skipped)
  let buffer = "";
  let emitted = "";

  // Moves text from `buffer` to the output as far as it is safe to do so.
  function drain(final: boolean): string {
    let out = "";
    for (;;) {
      const open = buffer.indexOf("[");
      if (open === -1) {
        // Hold one trailing space: a citation removed next must take its leading space with it.
        const keep = !final && buffer.endsWith(" ") ? 1 : 0;
        out += buffer.slice(0, buffer.length - keep);
        buffer = keep ? " " : "";
        break;
      }
      const close = buffer.indexOf("]", open);
      if (close === -1) {
        const rest = buffer.slice(open);
        if (final || rest.length > MAX_CITATION_CHARS || rest.includes("\n")) {
          // Not a citation: show it as plain text.
          out += buffer.slice(0, open + 1);
          buffer = buffer.slice(open + 1);
          continue;
        }
        const cut = open > 0 && buffer[open - 1] === " " ? open - 1 : open;
        out += buffer.slice(0, cut);
        buffer = buffer.slice(cut);
        break;
      }
      const inner = buffer.lastIndexOf("[", close);
      if (inner > open) {
        out += buffer.slice(0, inner);
        buffer = buffer.slice(inner);
        continue;
      }
      const tokens = buffer.slice(open + 1, close).split(/[,;\s]+/).filter(Boolean);
      if (tokens.length === 0 || !tokens.every((token) => ID_LIKE.test(token))) {
        out += buffer.slice(0, close + 1);
        buffer = buffer.slice(close + 1);
        continue;
      }
      const valid = tokens.filter((token) => allowed.has(token));
      dropped += tokens.length - valid.length;
      for (const id of valid) if (!cited.includes(id)) cited.push(id);
      const before = buffer.slice(0, open);
      if (valid.length === tokens.length) {
        out += before + buffer.slice(open, close + 1);
      } else if (valid.length > 0) {
        out += `${before}[${valid.join(", ")}]`;
      } else {
        out += before.endsWith(" ") ? before.slice(0, -1) : before;
      }
      buffer = buffer.slice(close + 1);
    }
    return out;
  }

  function body(text: string, final: boolean): string {
    buffer += text;
    if (!started) {
      buffer = buffer.trimStart();
      if (buffer === "") return "";
      started = true;
    }
    let out = drain(final);
    if (final) out = out.trimEnd();
    emitted += out;
    return out;
  }

  // Decides the header from what has arrived. Returns the text that belongs to the body, once known.
  function settleHeader(final: boolean): { header?: AnswerHeader; rest: string } | undefined {
    const text = headerBuffer.trimStart();
    if (text === "") return final ? { header: { behavior: "qualify", valid: false }, rest: "" } : undefined;
    const upper = text.toUpperCase();

    if (text.length < HEADER_KEY.length) {
      if (!final && HEADER_KEY.startsWith(upper)) return undefined;
      return { header: { behavior: "qualify", valid: false }, rest: text };
    }
    if (!upper.startsWith(HEADER_KEY)) return { header: { behavior: "qualify", valid: false }, rest: text };

    const newline = text.indexOf("\n");
    if (newline !== -1) return { header: parseHeaderLine(text.slice(0, newline)), rest: text.slice(newline + 1) };
    if (final) return { header: parseHeaderLine(text), rest: "" };
    if (text.length > MAX_HEADER_CHARS) return { header: { behavior: "qualify", valid: false }, rest: text.slice(HEADER_KEY.length) };
    return undefined;
  }

  function advance(chunk: string, final: boolean): AnswerChunk {
    if (inBody) return { text: body(chunk, final) };
    headerBuffer += chunk;
    const settled = settleHeader(final);
    if (!settled) return { text: "" };
    inBody = true;
    header = settled.header;
    headerBuffer = "";
    return { ...(settled.header ? { header: settled.header } : {}), text: body(settled.rest, final) };
  }

  return {
    push: (chunk) => advance(chunk, false),
    end() {
      const last = advance("", true);
      const final = header ?? { behavior: "qualify" as const, valid: false };
      return {
        ...last,
        result: {
          behavior: final.behavior,
          behaviorValid: final.valid,
          text: emitted.trimEnd(),
          citations: cited,
          invalidCitationsDropped: dropped,
        },
      };
    },
  };
}

// Parses a complete reply in one go (same logic as the streaming parser).
export function parseAnswer(text: string, allowedIds: Iterable<string>): AnswerResult {
  const parser = createAnswerParser(allowedIds);
  parser.push(text);
  return parser.end().result;
}
