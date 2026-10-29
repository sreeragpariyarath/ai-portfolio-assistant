import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Query embeddings for the eval questions, keyed by model, size and question text.
// Git-ignored: it is a local cost saver, not data.
export class EmbeddingCache {
  private readonly file: string;
  private readonly model: string;
  private readonly dims: number;
  private readonly entries: Record<string, number[]>;
  hits = 0;
  misses = 0;

  constructor(file: string, model: string, dims: number) {
    this.file = file;
    this.model = model;
    this.dims = dims;
    this.entries = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, number[]>) : {};
  }

  private key(question: string): string {
    return `${this.model}|${this.dims}|${question}`;
  }

  async get(question: string, embed: (question: string) => Promise<number[]>): Promise<number[]> {
    const cached = this.entries[this.key(question)];
    if (cached !== undefined && cached.length === this.dims) {
      this.hits++;
      return cached;
    }
    this.misses++;
    const vector = await embed(question);
    this.entries[this.key(question)] = vector;
    // Saved after every new embedding, so a failure halfway keeps what was already paid for.
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.entries));
    return vector;
  }
}
