export interface Doc {
  id: string;
  text: string;
}

export interface Hit {
  id: string;
  score: number;
}

export interface Bm25Index {
  k1: number;
  b: number;
  docIds: string[];
  docLengths: number[];
  avgLength: number;
  termFreqs: Map<string, number>[];
  docFreq: Map<string, number>;
}

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "did", "do", "does", "for", "from",
  "has", "have", "how", "in", "is", "it", "of", "on", "or", "that", "the", "to", "was",
  "were", "what", "which", "who", "why", "with",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token !== "" && !STOPWORDS.has(token));
}

export function buildIndex(docs: Doc[], k1 = 1.2, b = 0.75): Bm25Index {
  const termFreqs: Map<string, number>[] = [];
  const docFreq = new Map<string, number>();
  const docLengths: number[] = [];

  for (const doc of docs) {
    const tokens = tokenize(doc.text);
    const freqs = new Map<string, number>();
    for (const token of tokens) freqs.set(token, (freqs.get(token) ?? 0) + 1);
    for (const token of freqs.keys()) docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
    termFreqs.push(freqs);
    docLengths.push(tokens.length);
  }

  const totalLength = docLengths.reduce((sum, length) => sum + length, 0);
  return {
    k1,
    b,
    docIds: docs.map((doc) => doc.id),
    docLengths,
    avgLength: docs.length > 0 ? totalLength / docs.length : 0,
    termFreqs,
    docFreq,
  };
}

// Highest score first. Ties break on id so results are deterministic.
// Documents that share no term with the query are not returned.
export function search(index: Bm25Index, query: string, limit: number): Hit[] {
  const terms = [...new Set(tokenize(query))];
  const docCount = index.docIds.length;
  const hits: Hit[] = [];

  for (let i = 0; i < docCount; i++) {
    const freqs = index.termFreqs[i];
    const length = index.docLengths[i];
    const id = index.docIds[i];
    if (freqs === undefined || length === undefined || id === undefined) continue;

    let score = 0;
    for (const term of terms) {
      const tf = freqs.get(term);
      if (tf === undefined) continue;
      const df = index.docFreq.get(term) ?? 0;
      const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
      const norm = tf + index.k1 * (1 - index.b + (index.b * length) / index.avgLength);
      score += (idf * tf * (index.k1 + 1)) / norm;
    }
    if (score > 0) hits.push({ id, score });
  }

  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return hits.slice(0, limit);
}
