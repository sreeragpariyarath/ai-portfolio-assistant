// The small part of Markdown the assistant may use in an answer (D-043): paragraphs, bullet and numbered lists,
// and **bold**. Pure parsing into plain data, never HTML, so nothing in an answer can become markup. Anything
// else (headings, stray asterisks) is shown as plain text without the symbols.

export type Block = { type: "paragraph"; text: string } | { type: "list"; ordered: boolean; items: string[] };

export type Inline = { type: "text"; text: string } | { type: "bold"; text: string };

const LIST_ITEM = /^\s*(?:([-*•])|(\d{1,2})[.)])\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  const flushList = () => {
    if (list !== null && list.items.length > 0) blocks.push({ type: "list", ...list });
    list = null;
  };

  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = item[2] !== undefined;
      flushParagraph();
      if (list !== null && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(item[3] ?? "");
      continue;
    }
    // An indented line right after an item continues that item.
    if (list !== null && /^\s{2,}\S/.test(raw) && list.items.length > 0) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();
    const heading = HEADING.exec(line);
    paragraph.push(heading ? `**${(heading[1] ?? "").replace(/\*\*/g, "")}**` : line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

// Splits text into plain and bold runs. A single *word* loses its asterisks; an unclosed ** stays as typed, which
// is what a visitor sees for a moment while the closing pair is still streaming.
export function splitBold(text: string): Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(/\*\*([^*\n]+?)\*\*/g)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ type: "text", text: unstar(text.slice(last, start)) });
    parts.push({ type: "bold", text: match[1] ?? "" });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", text: unstar(text.slice(last)) });
  return parts.filter((part) => part.text !== "");
}

function unstar(text: string): string {
  return text.replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s.,;:!?)]|$)/g, "$1$2");
}

// The text without Markdown symbols, for a screen reader announcement or the chat memory.
export function plainText(text: string): string {
  return parseBlocks(text)
    .map((block) =>
      block.type === "paragraph"
        ? splitBold(block.text).map((part) => part.text).join("")
        : block.items.map((item) => splitBold(item).map((part) => part.text).join("")).join(". "),
    )
    .join(" ")
    .replace(/\.\.\s/g, ". ");
}
