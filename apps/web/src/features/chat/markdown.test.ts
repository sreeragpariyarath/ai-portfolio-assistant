import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBlocks, plainText, splitBold } from "./markdown.ts";

describe("parseBlocks", () => {
  it("splits paragraphs on blank lines and keeps single line breaks inside one", () => {
    assert.deepEqual(parseBlocks("One.\nStill one.\n\nTwo."), [
      { type: "paragraph", text: "One.\nStill one." },
      { type: "paragraph", text: "Two." },
    ]);
  });

  it("turns -, * and • lines into a bullet list, and 1. or 1) lines into a numbered list", () => {
    assert.deepEqual(parseBlocks("I used:\n- **Backend:** Express [p-1]\n* React\n• Redis\n\n1. Plan\n2) Ship"), [
      { type: "paragraph", text: "I used:" },
      { type: "list", ordered: false, items: ["**Backend:** Express [p-1]", "React", "Redis"] },
      { type: "list", ordered: true, items: ["Plan", "Ship"] },
    ]);
  });

  it("joins an indented line to the item above, and shows a heading as a bold line", () => {
    assert.deepEqual(parseBlocks("- First item\n  goes on here\n## Skills\nText"), [
      { type: "list", ordered: false, items: ["First item goes on here"] },
      { type: "paragraph", text: "**Skills**\nText" },
    ]);
  });

  it("returns nothing for empty text", () => {
    assert.deepEqual(parseBlocks(""), []);
    assert.deepEqual(parseBlocks("\n\n"), []);
  });
});

describe("splitBold", () => {
  it("finds bold runs and leaves the rest as text", () => {
    assert.deepEqual(splitBold("Built **LearnWithHupe** and **Warvox**."), [
      { type: "text", text: "Built " },
      { type: "bold", text: "LearnWithHupe" },
      { type: "text", text: " and " },
      { type: "bold", text: "Warvox" },
      { type: "text", text: "." },
    ]);
  });

  it("drops the asterisks of single emphasis and keeps an unclosed pair as typed", () => {
    assert.deepEqual(splitBold("A *quick* note"), [{ type: "text", text: "A quick note" }]);
    assert.deepEqual(splitBold("Still **stream"), [{ type: "text", text: "Still **stream" }]);
    assert.deepEqual(splitBold("2 * 3 = 6"), [{ type: "text", text: "2 * 3 = 6" }]);
  });
});

describe("plainText", () => {
  it("reads lists and bold without the symbols", () => {
    assert.equal(plainText("I used:\n- **Express** for the API\n- React"), "I used: Express for the API. React");
  });
});
