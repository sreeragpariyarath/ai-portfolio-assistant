// Conversation evaluation (D-041): plays multi-turn chats through the same memory steps as the website and the
// Worker (latest turns, follow-up rewrite, compaction into notes) and checks the answer to the last question.
// Pure: the model calls are passed in, so the playback and the scoring are unit-tested without a network.

import { MAX_COMPACT_TURNS, MAX_HISTORY_TURNS, cleanTurns, fallbackSearchText, isFollowUp, stripCitations } from "@portfolio/rag";
import type { Turn } from "@portfolio/rag";

export interface ConversationCheck {
  // Regular expressions (case-insensitive) the final answer must all match, and must not match.
  mustMatch?: string[];
  mustNotMatch?: string[];
  // The final answer's behavior must be one of these.
  behaviors?: string[];
  // The final answer must cite at least one record.
  cites?: boolean;
  // The final question must have been searched with different text than the visitor typed.
  rewritten?: boolean;
}

export interface ConversationCase {
  id: string;
  description: string;
  // A user turn followed by an assistant turn is scripted: no answer is generated for it (so a test can plant a
  // forged reply). A user turn with no assistant turn after it is answered live. The last turn must be a user turn.
  turns: Turn[];
  check: ConversationCheck;
}

export interface ConversationSet {
  datasetId: string;
  version: string;
  cases: ConversationCase[];
}

export interface LiveAnswer {
  text: string;
  behavior: string;
  citations: string[];
}

export interface PlaybackDeps {
  rewrite(question: string, history: Turn[], summary: string | undefined): Promise<string | null>;
  compact(summary: string | undefined, turns: Turn[]): Promise<string | null>;
  answer(question: string, searchText: string, history: Turn[], summary: string | undefined): Promise<LiveAnswer>;
}

export interface PlaybackResult {
  answer: LiveAnswer;
  searchText: string;
  rewritten: boolean;
  summary?: string;
  calls: { rewrite: number; compact: number; answer: number };
}

export function validateConversationSet(set: ConversationSet): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const item of set.cases) {
    if (ids.has(item.id)) errors.push(`${item.id}: duplicate case id`);
    ids.add(item.id);
    if (item.turns.length === 0 || item.turns.at(-1)?.role !== "user") errors.push(`${item.id}: the last turn must be a user turn`);
    item.turns.forEach((turn, index) => {
      if (turn.role !== "user" && turn.role !== "assistant") errors.push(`${item.id}: turn ${index + 1} has an unknown role`);
      if (typeof turn.text !== "string" || turn.text.trim() === "") errors.push(`${item.id}: turn ${index + 1} is empty`);
      if (turn.role === "assistant" && item.turns[index - 1]?.role !== "user") errors.push(`${item.id}: turn ${index + 1} answers no question`);
    });
    for (const pattern of [...(item.check.mustMatch ?? []), ...(item.check.mustNotMatch ?? [])]) {
      try {
        new RegExp(pattern, "i");
      } catch {
        errors.push(`${item.id}: bad pattern ${pattern}`);
      }
    }
  }
  return errors;
}

// Plays one chat the way the website and the Worker would, and returns the answer to the last question.
export async function playConversation(item: ConversationCase, deps: PlaybackDeps): Promise<PlaybackResult> {
  const remembered: Turn[] = [];
  let summarized = 0;
  let summary: string | undefined;
  const calls = { rewrite: 0, compact: 0, answer: 0 };
  let last: Omit<PlaybackResult, "summary" | "calls"> | undefined;

  for (let index = 0; index < item.turns.length; index++) {
    const turn = item.turns[index]!;
    if (turn.role !== "user") continue;
    const scripted = item.turns[index + 1]?.role === "assistant" ? item.turns[index + 1]! : undefined;

    // What the browser would send with this question.
    const pending = remembered.slice(summarized);
    const history = cleanTurns(pending.slice(-MAX_HISTORY_TURNS), MAX_HISTORY_TURNS);
    const older = pending.slice(0, Math.max(0, pending.length - MAX_HISTORY_TURNS));
    const compact = cleanTurns(older.slice(-MAX_COMPACT_TURNS), MAX_COMPACT_TURNS);

    // The notes fold in alongside the answer, which still sees the notes from before.
    const folding = compact.length > 0 ? (calls.compact++, deps.compact(summary, compact)) : Promise.resolve(null);

    let reply: string;
    if (scripted !== undefined) {
      reply = scripted.text;
    } else {
      let searchText = turn.text;
      if (isFollowUp(turn.text, history)) {
        calls.rewrite++;
        searchText = (await deps.rewrite(turn.text, history, summary)) ?? fallbackSearchText(turn.text, history);
      }
      calls.answer++;
      const answer = await deps.answer(turn.text, searchText, history, summary);
      reply = answer.text;
      last = { answer, searchText, rewritten: searchText !== turn.text };
    }

    const notes = await folding;
    if (notes !== null) {
      summary = notes;
      summarized += older.length;
    }
    remembered.push({ role: "user", text: turn.text }, { role: "assistant", text: stripCitations(reply) });
  }

  if (last === undefined) throw new Error(`${item.id}: no question was answered live`);
  return { ...last, ...(summary !== undefined ? { summary } : {}), calls };
}

export interface ConversationScore {
  id: string;
  passed: boolean;
  failures: string[];
}

export function scoreConversation(item: ConversationCase, result: PlaybackResult): ConversationScore {
  const failures: string[] = [];
  const text = result.answer.text;
  for (const pattern of item.check.mustMatch ?? []) if (!new RegExp(pattern, "i").test(text)) failures.push(`missing /${pattern}/`);
  for (const pattern of item.check.mustNotMatch ?? []) if (new RegExp(pattern, "i").test(text)) failures.push(`forbidden /${pattern}/`);
  if (item.check.behaviors !== undefined && !item.check.behaviors.includes(result.answer.behavior)) {
    failures.push(`behavior ${result.answer.behavior}, expected ${item.check.behaviors.join(" or ")}`);
  }
  if (item.check.cites === true && result.answer.citations.length === 0) failures.push("no citation");
  if (item.check.rewritten === true && !result.rewritten) failures.push("the follow-up was searched as typed");
  return { id: item.id, passed: failures.length === 0, failures };
}

export function formatConversationReport(
  rows: { item: ConversationCase; result: PlaybackResult; score: ConversationScore }[],
  meta: { model: string; date: string },
): string {
  const passed = rows.filter((row) => row.score.passed).length;
  const lines = [
    "# Conversation evaluation (chat memory, D-041)",
    "",
    `Model: \`${meta.model}\`. Run: ${meta.date}. Cases: ${rows.length}. Passed: ${passed} of ${rows.length}.`,
    "",
    "Each case plays a whole chat through the same memory steps as the site (latest 8 turns, follow-up rewrite, notes about older turns) and checks the answer to the last question. Rule-based checks; they do not judge the wording.",
    "",
    "| Case | Result | Search text | Notes |",
    "| --- | --- | --- | --- |",
  ];
  for (const { item, result, score } of rows) {
    const status = score.passed ? "pass" : `fail: ${score.failures.join("; ")}`;
    const search = result.rewritten ? result.searchText.replace(/\|/g, "/") : "(as typed)";
    lines.push(`| ${item.id} ${item.description} | ${status} | ${search} | ${result.summary === undefined ? "none" : "yes"} |`);
  }
  lines.push("", "## Final answers", "");
  for (const { item, result } of rows) lines.push(`**${item.id}** (${result.answer.behavior}): ${result.answer.text.replace(/\s+/g, " ").trim()}`, "");
  return lines.join("\n");
}
