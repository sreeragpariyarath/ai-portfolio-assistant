import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

// The Worker bundles this package, so Node-only modules must never creep in.
describe("packages/rag/src is runtime-neutral", () => {
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".ts"));

  it("has source files to check", () => {
    assert.ok(files.length > 0);
  });

  for (const file of files) {
    it(`${file} has no node: imports`, () => {
      const source = readFileSync(join(SRC, file), "utf8");
      const offending = source.match(/(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["']node:[^"']+["']/g);
      assert.equal(offending, null, `Node-only import in ${file}: ${offending?.join(", ")}`);
    });
  }
});
