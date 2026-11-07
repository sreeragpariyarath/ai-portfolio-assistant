// Splits an answer into text and citations. The API keeps valid citations inline as [record-id] and
// removes invalid ones before they reach the browser (it also holds back a citation split across
// chunks), so a plain scan of the text received so far is safe. Pure, so the root tests can run it.

export type Segment = { type: "text"; text: string } | { type: "cite"; id: string; n: number };

// Record ids look like project-demo-001: letters, digits, dashes and underscores.
// One bracket may hold several ids, as [id-1, id-2]; each becomes its own citation.
const CITATION = /\[([A-Za-z0-9][A-Za-z0-9_-]*(?:\s*[,;]\s*[A-Za-z0-9][A-Za-z0-9_-]*)*)\]/g;

// `n` numbers each distinct record by first appearance (1, 2, 3…), so repeated citations share a
// number. When `allowed` is given, anything else in brackets stays as plain text.
export function splitCitations(text: string, allowed?: ReadonlySet<string>): Segment[] {
  const segments: Segment[] = [];
  const numbers = new Map<string, number>();
  let last = 0;
  for (const match of text.matchAll(CITATION)) {
    const ids = (match[1] ?? "").split(/\s*[,;]\s*/);
    if (allowed !== undefined && !ids.every((id) => allowed.has(id))) continue;
    const start = match.index ?? 0;
    if (start > last) segments.push({ type: "text", text: text.slice(last, start) });
    for (const id of ids) {
      let n = numbers.get(id);
      if (n === undefined) {
        n = numbers.size + 1;
        numbers.set(id, n);
      }
      segments.push({ type: "cite", id, n });
    }
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ type: "text", text: text.slice(last) });
  return segments;
}

// The distinct cited ids in order of first appearance.
export function citedIds(segments: readonly Segment[]): string[] {
  const ids: string[] = [];
  for (const segment of segments) if (segment.type === "cite" && !ids.includes(segment.id)) ids.push(segment.id);
  return ids;
}
