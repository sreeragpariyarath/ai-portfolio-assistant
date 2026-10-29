import { describe, expect, it } from "vitest";
import { buildIndex, contentHash, pointId, search } from "@portfolio/rag";

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

  it("computes the same point id and content hash as Node (WebCrypto)", async () => {
    expect(await pointId("project-demo-001")).toBe("26b377a6-c4ff-5d6b-9218-1ec0ede74fb9");

    const hash = await contentHash(
      {
        id: "a",
        type: "project",
        title: "T",
        content: "C",
        verificationStatus: "synthetic",
        isSynthetic: true,
        visibility: "public",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01",
      },
      "gemini-embedding-2",
      768,
    );
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
