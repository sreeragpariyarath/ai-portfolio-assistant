import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createGenerationClient } from "../src/generation.ts";

// The raw text of one real Gemini streamGenerateContent?alt=sse reply, saved by `pnpm eval:answers --live --sse-sample`.
// It checks that our tolerant parser reads what Google really sends (D-015). Skipped until the sample exists.
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "gemini-sse-sample.txt");

describe("real Gemini stream sample", { skip: !existsSync(FIXTURE) && "no sample saved yet (run pnpm eval:answers --live --sse-sample)" }, () => {
  it("parses into text events and a done event with a normal finish reason", async () => {
    const raw = readFileSync(FIXTURE, "utf8");
    const fetchImpl = (async () => new Response(raw, { headers: { "content-type": "text/event-stream" } })) as typeof fetch;
    const client = createGenerationClient({ apiKey: "test-key", model: "any-model", fetch: fetchImpl });

    const stream = await client.streamGenerate({ systemInstruction: "s", userText: "u" });
    const events = [];
    for await (const event of stream.events) events.push(event);

    const text = events.flatMap((event) => (event.type === "text" ? [event.text] : [])).join("");
    assert.ok(text.length > 0);
    assert.match(text, /^\s*BEHAVIOR:\s*(answer|qualify|abstain|refuse)/i);
    const done = events.at(-1);
    assert.equal(done?.type, "done");
    assert.ok(done?.type === "done" && ["STOP", "MAX_TOKENS"].includes(done.finishReason));
  });
});
