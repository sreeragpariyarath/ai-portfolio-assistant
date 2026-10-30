import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CARD_INTROS, CONTACT, PROFILE, PROJECTS, SKILL_GROUPS } from "./portfolio-cards.ts";

const everything = JSON.stringify({ PROFILE, PROJECTS, SKILL_GROUPS, CONTACT, CARD_INTROS });

describe("stored card content", () => {
  it("never holds a phone number or a salary", () => {
    assert.doesNotMatch(everything, /\+?\d{1,3}[-. ]\d{3}[-. ]\d{3}[-. ]\d{4}|\b\d{10}\b/);
    assert.doesNotMatch(everything, /\b\d{2,3},\d{3}\b|salary/i);
    assert.doesNotMatch(everything, /tel:|whatsapp/i);
  });

  it("has unique project ids and every project has what the pop-up shows", () => {
    assert.equal(new Set(PROJECTS.map((project) => project.id)).size, PROJECTS.length);
    for (const project of PROJECTS) {
      assert.ok(project.title && project.tagline && project.description, project.id);
      assert.ok(project.highlights.length > 0 && project.tech.length > 0, project.id);
      assert.match(project.colors[0], /^#[0-9a-f]{6}$/i);
      assert.match(project.colors[1], /^#[0-9a-f]{6}$/i);
    }
  });

  it("uses only https links and one plain email address", () => {
    for (const { href } of [...CONTACT.links, ...PROJECTS.flatMap((project) => project.links)]) {
      assert.match(href, /^https:\/\//);
    }
    assert.match(CONTACT.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it("points project records at public ones only", () => {
    for (const project of PROJECTS) {
      if (project.recordId !== undefined) assert.match(project.recordId, /^project-demo-\d{3}$/);
    }
  });
});
