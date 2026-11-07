// Finds emails and web addresses in plain answer text so the page can show them as links. Pure, so the root
// tests can run it. Only mailto: and http(s): links are produced.

export type LinkPart = { type: "text"; text: string } | { type: "link"; text: string; href: string };

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/.source;
const URL_WITH_SCHEME = /https?:\/\/[^\s<>[\]()]+/.source;
// A bare address needs a path or a well-known host, so "e.g." or "Node.js" are not turned into links.
const BARE_URL = /(?:www\.|(?:[A-Za-z0-9-]+\.)+(?:com|org|net|io|dev|in|app)\/)[^\s<>[\]()]*/.source;
const PATTERN = new RegExp(`${EMAIL}|${URL_WITH_SCHEME}|${BARE_URL}`, "g");

export function linkify(text: string): LinkPart[] {
  const parts: LinkPart[] = [];
  let last = 0;
  for (const match of text.matchAll(PATTERN)) {
    // Trailing sentence punctuation belongs to the sentence, not the address.
    const found = match[0].replace(/[.,;:!?'"]+$/, "");
    if (found === "") continue;
    const start = match.index ?? 0;
    if (start > last) parts.push({ type: "text", text: text.slice(last, start) });
    const href = found.includes("@") && !/^https?:/i.test(found) ? `mailto:${found}` : /^https?:/i.test(found) ? found : `https://${found}`;
    parts.push({ type: "link", text: found, href });
    last = start + found.length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}
