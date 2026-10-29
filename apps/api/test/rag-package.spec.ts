import { describe, expect, it } from "vitest";
import { buildIndex, search } from "@portfolio/rag";

// Proves the shared package resolves and runs inside the Workers runtime,
// so the API can use the same retrieval code the eval scripts measure.
describe("@portfolio/rag in the Workers runtime", () => {
  it("builds a BM25 index and ranks the matching record first", () => {
    const index = buildIndex([
      { id: "a", text: "Qdrant vector search with hybrid retrieval" },
      { id: "b", text: "Next.js frontend with Tailwind styling" },
    ]);

    const hits = search(index, "vector search", 5);

    expect(hits.map((hit) => hit.id)).toEqual(["a"]);
    expect(hits[0]?.score).toBeGreaterThan(0);
  });
});
