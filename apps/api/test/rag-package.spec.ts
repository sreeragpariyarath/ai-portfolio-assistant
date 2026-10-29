import { describe, expect, it } from "vitest";
import {
  buildIndex,
  contentHash,
  createGeminiClient,
  createQdrantClient,
  pointId,
  search,
} from "@portfolio/rag";

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

  it("runs the Gemini client in Workers against a mocked fetch", async () => {
    const calls: { url: string; text: string }[] = [];
    const gemini = createGeminiClient({
      apiKey: "test-key",
      model: "gemini-embedding-2",
      dims: 3,
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), text: JSON.parse(String(init?.body)).content.parts[0].text });
        return Response.json({ embedding: { values: [0.1, 0.2, 0.3] } });
      }) as typeof fetch,
    });

    expect(await gemini.embedQuery("hello")).toEqual([0.1, 0.2, 0.3]);
    expect(calls[0]?.url).toContain("gemini-embedding-2:embedContent");
    expect(calls[0]?.text).toBe("task: search result | query: hello");
  });

  it("runs the Qdrant client in Workers against a mocked fetch", async () => {
    const calls: { path: string; apiKey: string | undefined }[] = [];
    const qdrant = createQdrantClient({
      url: "https://example.cloud.qdrant.io:6333",
      apiKey: "test-key",
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          path: new URL(String(url)).pathname,
          apiKey: (init?.headers as Record<string, string>)["api-key"],
        });
        return Response.json({ status: "ok", result: { count: 39 } });
      }) as typeof fetch,
    });

    expect(await qdrant.count("portfolio_knowledge")).toBe(39);
    expect(calls[0]).toEqual({ path: "/collections/portfolio_knowledge/points/count", apiKey: "test-key" });
  });
});
