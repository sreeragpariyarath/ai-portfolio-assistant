import type { Hit } from "./bm25.ts";

export interface RrfOptions {
  // Damping constant: larger k flattens the gap between top and lower ranks. 60 is the usual default.
  k?: number;
  // One weight per list, in the same order as the lists. A list with weight 0.5 counts half as much. Default 1.
  weights?: number[];
}

export interface HybridOptions extends RrfOptions {
  // How much the keyword (BM25) list counts compared with the dense list. Default 1 (equal).
  bm25Weight?: number;
  // How many candidates to take from each retriever before fusing.
  depth?: number;
  // How many fused results to return.
  limit?: number;
}

// Reciprocal Rank Fusion: score(id) = sum over lists of 1 / (k + rank), rank starting at 1.
// Only ranks matter, so BM25 and cosine scores never need to be on the same scale.
// Ties break on the best rank the id reached in any list, then on id, so output is deterministic.
export function rrf(lists: string[][], { k = 60, weights }: RrfOptions = {}): Hit[] {
  if (!Number.isFinite(k) || k < 0) throw new Error("RRF k must be a finite number >= 0.");
  if (weights !== undefined && weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error("RRF weights must be finite numbers >= 0.");
  }

  const scores = new Map<string, number>();
  const bestRank = new Map<string, number>();
  for (const [position, list] of lists.entries()) {
    const weight = weights?.[position] ?? 1;
    const seen = new Set<string>();
    let rank = 0;
    for (const id of list) {
      // A repeated id in one list counts once, at its first (best) position.
      if (seen.has(id)) continue;
      seen.add(id);
      rank++;
      scores.set(id, (scores.get(id) ?? 0) + weight / (k + rank));
      bestRank.set(id, Math.min(bestRank.get(id) ?? Infinity, rank));
    }
  }

  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || bestRank.get(a.id)! - bestRank.get(b.id)! || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Fuses lexical (BM25) and dense hits. Each input is assumed sorted best first.
export function hybridSearch(
  bm25Hits: Hit[],
  denseHits: Hit[],
  { k = 60, depth = 20, limit = 10, bm25Weight = 1 }: HybridOptions = {},
): Hit[] {
  for (const [name, value] of [["depth", depth], ["limit", limit]] as const) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`Hybrid ${name} must be a positive integer.`);
  }
  const top = (hits: Hit[]) => hits.slice(0, depth).map((hit) => hit.id);
  return rrf([top(bm25Hits), top(denseHits)], { k, weights: [bm25Weight, 1] }).slice(0, limit);
}
