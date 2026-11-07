import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHALLENGE_DECISIONS, createCorpus, isChallengeQuestion, retrieve, searchText, type PublicRecord } from "../src/index.ts";

const record = (id: string, type: string, title: string, content: string): PublicRecord => ({
  id,
  type,
  title,
  content,
  verificationStatus: "owner-stated",
});

const corpus = createCorpus([
  record("project-a-001", "project", "Alpha app", "A mobile app for learning."),
  record("decision-a-001", "decision", "Alpha: choosing a queue", "We chose a queue over polling."),
  record("decision-a-002", "decision", "Alpha: fixing a race", "A duplicate event arrived twice."),
  record("decision-b-001", "decision", "Beta: a naming choice", "The field is called detail."),
  record("decision-b-002", "decision", "Beta: a cache rule", "Cached for one day."),
  record("profile-001", "profile", "About", "A full stack engineer."),
]);

const noDense = async () => [];

describe("challenge-style questions", () => {
  it("recognises the ways a visitor asks for the hardest work", () => {
    for (const question of [
      "What was your hardest problem?",
      "Okay who what was your most difficult work",
      "what is the toughest problem sreerag solved in his project",
      "What are you most proud of?",
      "What was the biggest challenge?",
    ]) {
      assert.ok(isChallengeQuestion(question), question);
    }
    for (const question of ["What is Alpha?", "Tell me about the hard drive", "I am hr"]) {
      assert.ok(!isChallengeQuestion(question), question);
    }
  });

  it("adds search terms only for a challenge question, and keeps the visitor's own words first", () => {
    assert.equal(searchText("What is Alpha?"), "What is Alpha?");
    assert.ok(searchText("your hardest problem").startsWith("your hardest problem "));
    assert.ok(searchText("your hardest problem").length > "your hardest problem".length);
  });

  it("always puts some decision records in the context, even when no word matches", async () => {
    const result = await retrieve("What was your most difficult work?", noDense, { corpus });
    const decisions = result.records.filter((item) => item.type === "decision");
    assert.ok(decisions.length >= CHALLENGE_DECISIONS, decisions.map((item) => item.id).join(","));
    assert.equal(new Set(result.records.map((item) => item.id)).size, result.records.length);
  });

  it("leaves an ordinary question alone", async () => {
    const result = await retrieve("What is Alpha?", noDense, { corpus });
    assert.ok(result.records.every((item) => item.type !== "decision" || /alpha/i.test(item.title)));
  });
});
