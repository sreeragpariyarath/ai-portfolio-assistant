// In-memory cache for question embeddings (Phase 3 task 3.8, D-015). A repeated question skips the Gemini
// embedding call, which matters because gemini-embedding-2 allows 1,000 requests a day on the free tier (D-016).
// The cache is per isolate (lost when the Worker restarts) and holds only vectors under a hash key:
// the question text itself is never stored. Runtime-neutral: uses `crypto.subtle`, no node: imports.
import type { GeminiClient } from "./gemini.ts";

export interface EmbeddingCacheStats {
  hits: number;
  misses: number;
  size: number;
}

// Least recently used, by Map insertion order. Stores promises so concurrent identical questions share one call.
export class EmbeddingCache {
  readonly maxEntries: number;
  private readonly entries = new Map<string, Promise<number[]>>();
  private hits = 0;
  private misses = 0;

  constructor(maxEntries = 200) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error("maxEntries must be a positive integer.");
    this.maxEntries = maxEntries;
  }

  get(key: string): Promise<number[]> | undefined {
    const value = this.entries.get(key);
    if (value === undefined) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    // Mark as most recently used.
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: Promise<number[]>): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  stats(): EmbeddingCacheStats {
    return { hits: this.hits, misses: this.misses, size: this.entries.size };
  }
}

// Case, repeated spaces and surrounding whitespace do not change what a question means to a recruiter.
export function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ").toLowerCase();
}

// SHA-256 of model, size and the normalized question, so a model or dimension change never reuses a vector.
export async function embeddingKey(model: string, dims: number, question: string): Promise<string> {
  const data = new TextEncoder().encode(`${model}\u0000${dims}\u0000${normalizeQuestion(question)}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface CachedEmbedOptions {
  model: string;
  dims: number;
  cache: EmbeddingCache;
}

// Wraps `embedQuery`. A failed call is not cached, so the next request tries again.
export function cachedEmbedQuery(
  inner: Pick<GeminiClient, "embedQuery">,
  { model, dims, cache }: CachedEmbedOptions,
): (question: string) => Promise<number[]> {
  return async (question) => {
    const key = await embeddingKey(model, dims, question);
    const existing = cache.get(key);
    if (existing !== undefined) return existing;

    const pending = inner.embedQuery(question);
    cache.set(key, pending);
    pending.catch(() => cache.delete(key));
    return pending;
  };
}
