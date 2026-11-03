import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { CARD_INTROS, CONTACT, FUN, PROFILE, PROJECTS, SKILL_GROUPS } from "./portfolio-cards.ts";

const everything = JSON.stringify({ PROFILE, PROJECTS, SKILL_GROUPS, CONTACT, FUN, CARD_INTROS });
// The public records the site ships (paths are from the repo root, where `pnpm test:scripts` runs).
const publicRecords = (JSON.parse(readFileSync("apps/web/src/generated/public-corpus.json", "utf8")) as { records: { id: string; type: string }[] }).records;

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
      assert.ok(project.highlights.length > 0 && project.stack.length > 0, project.id);
      for (const { group, items } of project.stack) assert.ok(group.trim() !== "" && items.length > 0 && items.every((item) => item.trim() !== ""), `${project.id}: ${group}`);
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

  it("points every project at a public project record that the site really ships", () => {
    for (const project of PROJECTS) {
      assert.ok(project.recordId !== undefined, project.id);
      const record = publicRecords.find((r) => r.id === project.recordId);
      assert.ok(record !== undefined, `${project.id}: ${project.recordId} is not a public record`);
      assert.equal(record.type, "project", project.id);
    }
  });

  it("has a real picture file for every project that names one, small enough for a phone", () => {
    for (const project of PROJECTS) {
      if (project.image === undefined) continue;
      assert.match(project.image, /^\/projects\/[a-z0-9-]+\.webp$/, project.id);
      const file = `apps/web/public${project.image}`;
      assert.ok(existsSync(file), `${project.id}: ${file} is missing`);
      assert.ok(statSync(file).size <= 150 * 1024, `${project.id}: ${file} is over 150 KB`);
      if (project.imagePosition !== undefined) assert.match(project.imagePosition, /^(center|left|right) \d{1,3}%$/, project.id);
    }
  });

  it("has an intro for every card, no placeholder or example content, and the fun card's groups", () => {
    for (const kind of ["profile", "projects", "skills", "contact", "fun"] as const) assert.ok(CARD_INTROS[kind].length > 10, kind);
    assert.doesNotMatch(everything, /example\.com|\/in\/example|github\.com\/example/i);
    assert.ok(FUN.groups.length >= 4 && FUN.groups.every((group) => group.items.length > 0));
    assert.equal(PROFILE.photo.placeholder, false);
  });

  it("keeps the owner's pages the same: one public email, no other address", () => {
    const emails = new Set(everything.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? []);
    assert.deepEqual([...emails], [CONTACT.email]);
  });
});
