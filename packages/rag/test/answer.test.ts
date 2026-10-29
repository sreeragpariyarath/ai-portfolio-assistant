import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAnswerParser, parseAnswer } from "@portfolio/rag";

const ALLOWED = ["project-demo-001", "decision-demo-002", "contribution-demo-003"];

// Feeds `text` to the streaming parser in the given pieces and returns what a client would see.
function stream(pieces: string[], allowed = ALLOWED) {
  const parser = createAnswerParser(allowed);
  const shown: string[] = [];
  let header;
  for (const piece of pieces) {
    const chunk = parser.push(piece);
    if (chunk.header) header = chunk.header;
    shown.push(chunk.text);
  }
  const last = parser.end();
  if (last.header) header = last.header;
  shown.push(last.text);
  return { header, shown: shown.join(""), result: last.result };
}

describe("parseAnswer: behavior line", () => {
  it("reads each behavior and removes the line from the text", () => {
    for (const behavior of ["answer", "qualify", "abstain", "refuse"]) {
      const result = parseAnswer(`BEHAVIOR: ${behavior}\nSome text.`, ALLOWED);
      assert.equal(result.behavior, behavior);
      assert.equal(result.behaviorValid, true);
      assert.equal(result.text, "Some text.");
    }
  });

  it("accepts any case, extra spaces and CRLF", () => {
    const result = parseAnswer("  behavior:   Abstain  \r\nNo data.", ALLOWED);
    assert.equal(result.behavior, "abstain");
    assert.equal(result.behaviorValid, true);
    assert.equal(result.text, "No data.");
  });

  it("falls back to qualify when the line is missing, and keeps the text", () => {
    const result = parseAnswer("Alex built a support assistant [project-demo-001].", ALLOWED);
    assert.equal(result.behavior, "qualify");
    assert.equal(result.behaviorValid, false);
    assert.equal(result.text, "Alex built a support assistant [project-demo-001].");
    assert.deepEqual(result.citations, ["project-demo-001"]);
  });

  it("falls back to qualify for an unknown behavior word, and still drops that line", () => {
    const result = parseAnswer("BEHAVIOR: confident\nText here.", ALLOWED);
    assert.equal(result.behavior, "qualify");
    assert.equal(result.behaviorValid, false);
    assert.equal(result.text, "Text here.");
  });

  it("treats an empty reply as an invalid qualify with no text", () => {
    const result = parseAnswer("", ALLOWED);
    assert.deepEqual(result, { behavior: "qualify", behaviorValid: false, text: "", citations: [], invalidCitationsDropped: 0 });
  });

  it("accepts a reply that is only the behavior line", () => {
    const result = parseAnswer("BEHAVIOR: refuse", ALLOWED);
    assert.equal(result.behavior, "refuse");
    assert.equal(result.behaviorValid, true);
    assert.equal(result.text, "");
  });

  it("does not treat a later BEHAVIOR line as the header", () => {
    const result = parseAnswer("Hello there.\nBEHAVIOR: answer", ALLOWED);
    assert.equal(result.behaviorValid, false);
    assert.ok(result.text.includes("BEHAVIOR: answer"));
  });
});

describe("parseAnswer: citations", () => {
  it("keeps allowed ids once each, in order of first use", () => {
    const result = parseAnswer(
      "BEHAVIOR: answer\nA [decision-demo-002]. B [project-demo-001]. C [decision-demo-002].",
      ALLOWED,
    );
    assert.deepEqual(result.citations, ["decision-demo-002", "project-demo-001"]);
    assert.equal(result.invalidCitationsDropped, 0);
    assert.equal(result.text, "A [decision-demo-002]. B [project-demo-001]. C [decision-demo-002].");
  });

  it("removes a citation that is not an allowed id, with its leading space", () => {
    const result = parseAnswer("BEHAVIOR: answer\nAlex led a team [project-demo-777]. Done.", ALLOWED);
    assert.equal(result.text, "Alex led a team. Done.");
    assert.deepEqual(result.citations, []);
    assert.equal(result.invalidCitationsDropped, 1);
  });

  it("treats a private record id as invalid, because it was never allowed", () => {
    const result = parseAnswer("BEHAVIOR: answer\nSee [private-demo-001].", ALLOWED);
    assert.ok(!result.text.includes("private-demo-001"));
    assert.equal(result.invalidCitationsDropped, 1);
  });

  it("splits a group and keeps only the valid ids", () => {
    const result = parseAnswer("BEHAVIOR: answer\nBoth [project-demo-001, project-demo-404].", ALLOWED);
    assert.equal(result.text, "Both [project-demo-001].");
    assert.deepEqual(result.citations, ["project-demo-001"]);
    assert.equal(result.invalidCitationsDropped, 1);
  });

  it("is case sensitive: a changed id is not allowed", () => {
    const result = parseAnswer("BEHAVIOR: answer\nX [Project-Demo-001].", ALLOWED);
    assert.deepEqual(result.citations, []);
    assert.equal(result.invalidCitationsDropped, 1);
  });

  it("leaves brackets that are not citations alone", () => {
    const text = "Use arr[0] and see [1] or [note] or [a b].";
    const result = parseAnswer(`BEHAVIOR: answer\n${text}`, ALLOWED);
    assert.equal(result.text, text);
    assert.equal(result.invalidCitationsDropped, 0);
  });

  it("does not let an outer bracket hide a citation", () => {
    const result = parseAnswer("BEHAVIOR: answer\nSee [see [project-demo-001]].", ALLOWED);
    assert.deepEqual(result.citations, ["project-demo-001"]);
  });

  it("shows an unclosed bracket as plain text at the end", () => {
    const result = parseAnswer("BEHAVIOR: answer\nUnfinished [project-demo", ALLOWED);
    assert.equal(result.text, "Unfinished [project-demo");
    assert.deepEqual(result.citations, []);
  });
});

describe("streaming parser", () => {
  const reply =
    "BEHAVIOR: qualify\n\nThe metric is unverified [project-demo-001]. A newer note says otherwise [decision-demo-002, project-demo-999]. Unknown [made-up-1].\nEnd.";

  it("gives the same result for every way of cutting the reply into two chunks", () => {
    const whole = parseAnswer(reply, ALLOWED);
    for (let cut = 0; cut <= reply.length; cut++) {
      const { shown, result } = stream([reply.slice(0, cut), reply.slice(cut)]);
      assert.deepEqual(result, whole, `cut at ${cut}`);
      assert.equal(shown, whole.text, `shown text, cut at ${cut}`);
    }
  });

  it("gives the same result when fed one character at a time", () => {
    const whole = parseAnswer(reply, ALLOWED);
    const { shown, result } = stream([...reply]);
    assert.deepEqual(result, whole);
    assert.equal(shown, whole.text);
  });

  it("holds back a citation that is split across chunks and never shows an invalid id", () => {
    const parser = createAnswerParser(ALLOWED);
    const seen: string[] = [];
    for (const piece of ["BEHAVIOR: answer\nFact [proj", "ect-demo-777", "] and more."]) {
      seen.push(parser.push(piece).text);
      assert.ok(!seen.join("").includes("project-demo-777"));
      assert.ok(!seen.join("").includes("[proj"));
    }
    seen.push(parser.end().text);
    assert.equal(seen.join(""), "Fact and more.");
  });

  it("reports the header as soon as the first line is complete", () => {
    const parser = createAnswerParser(ALLOWED);
    assert.equal(parser.push("BEHA").header, undefined);
    assert.equal(parser.push("VIOR: abst").header, undefined);
    const chunk = parser.push("ain\nI do not have that.");
    assert.deepEqual(chunk.header, { behavior: "abstain", valid: true });
    assert.equal(chunk.text, "I do not have that.");
  });

  it("settles a missing header on the first text that cannot be one", () => {
    const parser = createAnswerParser(ALLOWED);
    const chunk = parser.push("Alex built it.");
    assert.deepEqual(chunk.header, { behavior: "qualify", valid: false });
    assert.equal(chunk.text, "Alex built it.");
  });

  it("settles a header that arrives with no newline once the reply ends", () => {
    const { header, shown } = stream(["BEHAVIOR: ", "refuse"]);
    assert.deepEqual(header, { behavior: "refuse", valid: true });
    assert.equal(shown, "");
  });

  it("emits the header only once", () => {
    const parser = createAnswerParser(ALLOWED);
    assert.ok(parser.push("BEHAVIOR: answer\nOne.").header);
    assert.equal(parser.push(" Two.").header, undefined);
    assert.equal(parser.end().header, undefined);
  });
});
