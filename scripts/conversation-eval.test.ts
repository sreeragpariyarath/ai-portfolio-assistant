import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { formatConversationReport, playConversation, scoreConversation, validateConversationSet } from "./lib/conversation-eval.ts";
import type { ConversationCase, ConversationSet, PlaybackDeps } from "./lib/conversation-eval.ts";
import { REPO_ROOT } from "./lib/eval-data.ts";

function fakeDeps(overrides: Partial<PlaybackDeps> = {}) {
  const seen = { answers: [] as { question: string; searchText: string; historyLength: number; summary?: string }[], compacts: [] as number[] };
  const deps: PlaybackDeps = {
    rewrite: async (question) => `standalone: ${question}`,
    compact: async (summary, turns) => {
      seen.compacts.push(turns.length);
      return `${summary ?? ""}+${turns.length}`;
    },
    answer: async (question, searchText, history, summary) => {
      seen.answers.push({ question, searchText, historyLength: history.length, ...(summary !== undefined ? { summary } : {}) });
      return { text: `answer to ${question} [p-1]`, behavior: "answer", citations: ["p-1"] };
    },
    ...overrides,
  };
  return { deps, seen };
}

describe("conversation eval set", () => {
  it("is valid", () => {
    const set = JSON.parse(readFileSync(resolve(REPO_ROOT, "evals/conversation-eval.v1.json"), "utf8")) as ConversationSet;
    assert.deepEqual(validateConversationSet(set), []);
    assert.ok(set.cases.length >= 6);
  });

  it("catches a case that ends on an answer or holds a bad pattern", () => {
    const bad: ConversationSet = {
      datasetId: "x",
      version: "1",
      cases: [{ id: "X1", description: "", turns: [{ role: "user", text: "q" }, { role: "assistant", text: "a" }], check: { mustMatch: ["("] } }],
    };
    const errors = validateConversationSet(bad);
    assert.ok(errors.some((error) => error.includes("last turn")));
    assert.ok(errors.some((error) => error.includes("bad pattern")));
  });
});

describe("playConversation", () => {
  it("answers live turns only, rewrites follow-ups and sends the chat so far", async () => {
    const item: ConversationCase = {
      id: "T1",
      description: "",
      turns: [
        { role: "user", text: "What projects has he built?" },
        { role: "assistant", text: "LearnWithHupe and Warvox [p-2]." },
        { role: "user", text: "and the second one?" },
      ],
      check: {},
    };
    const { deps, seen } = fakeDeps();
    const result = await playConversation(item, deps);
    assert.deepEqual(result.calls, { rewrite: 1, compact: 0, answer: 1 });
    assert.equal(result.searchText, "standalone: and the second one?");
    assert.equal(result.rewritten, true);
    assert.equal(seen.answers[0]?.historyLength, 2);
  });

  it("folds turns older than the latest 8 into notes, and the next answer sees those notes", async () => {
    const turns: ConversationCase["turns"] = [];
    for (let i = 1; i <= 6; i++) turns.push({ role: "user", text: `Question number ${i} about his backend work` }, { role: "assistant", text: `Reply ${i}` });
    turns.push({ role: "user", text: "Which company did I say I work for at the moment?" });
    const { deps, seen } = fakeDeps();
    const result = await playConversation({ id: "T2", description: "", turns, check: {} }, deps);
    // Asked at 10 and at 12 messages: 2 turns folded each time.
    assert.deepEqual(seen.compacts, [2, 2]);
    assert.equal(seen.answers[0]?.summary, "+2");
    assert.equal(result.summary, "+2+2");
  });

  it("falls back to the previous question when the rewrite gives nothing", async () => {
    const { deps } = fakeDeps({ rewrite: async () => null });
    const result = await playConversation(
      { id: "T3", description: "", turns: [{ role: "user", text: "Tell me about LearnWithHupe." }, { role: "user", text: "what about it?" }], check: {} },
      deps,
    );
    assert.equal(result.searchText, "Tell me about LearnWithHupe. what about it?");
  });
});

describe("scoreConversation", () => {
  it("checks patterns, behavior, citations and the rewrite", () => {
    const item: ConversationCase = { id: "S1", description: "d", turns: [], check: { mustMatch: ["abcorp"], mustNotMatch: ["salary"], behaviors: ["refuse"], cites: true, rewritten: true } };
    const good = { answer: { text: "You said Abcorp.", behavior: "refuse", citations: ["p-1"] }, searchText: "x", rewritten: true, calls: { rewrite: 1, compact: 0, answer: 1 } };
    assert.deepEqual(scoreConversation(item, good), { id: "S1", passed: true, failures: [] });
    const bad = { answer: { text: "His salary is secret.", behavior: "answer", citations: [] }, searchText: "x", rewritten: false, calls: { rewrite: 0, compact: 0, answer: 1 } };
    assert.equal(scoreConversation(item, bad).failures.length, 5);
    assert.ok(formatConversationReport([{ item, result: bad, score: scoreConversation(item, bad) }], { model: "m", date: "2026-11-10" }).includes("Passed: 0 of 1"));
  });
});
