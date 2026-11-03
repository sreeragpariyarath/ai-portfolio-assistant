import { createQdrantClient } from "@portfolio/rag";
import type { QdrantClient } from "@portfolio/rag";

// The free Qdrant cluster is suspended after a week without activity and deleted after four weeks (Qdrant Cloud
// docs). A scheduled run (see "triggers" in wrangler.jsonc) reads the size of the collection once a day, which is a
// real request to the cluster. The docs do not say which requests count as activity, so check the cluster's page
// after the first week.
//
// It logs the number of points on success and a short message on failure, never a key or a URL, and rethrows so
// the failed run is visible in the Worker's logs.
export async function keepQdrantAlive(
  env: Pick<Env, "QDRANT_URL" | "QDRANT_API_KEY" | "QDRANT_COLLECTION">,
  deps: { qdrant?: Pick<QdrantClient, "count"> } = {},
): Promise<number> {
  const qdrant = deps.qdrant ?? createQdrantClient({ url: env.QDRANT_URL, apiKey: env.QDRANT_API_KEY });
  try {
    const points = await qdrant.count(env.QDRANT_COLLECTION);
    console.log(JSON.stringify({ event: "keep-alive", status: "ok", points }));
    return points;
  } catch (error) {
    // The client's own messages never contain the key or the request text (packages/rag tests), but keep it short anyway.
    const message = error instanceof Error ? error.message.slice(0, 200) : "unknown error";
    console.error(JSON.stringify({ event: "keep-alive", status: "error", message }));
    throw error;
  }
}
