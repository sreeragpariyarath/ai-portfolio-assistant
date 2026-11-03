import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// wrangler.jsonc has comments; strip them (not inside strings) to read it as JSON.
function readWranglerConfig(): Record<string, any> {
  const text = readFileSync("apps/api/wrangler.jsonc", "utf8");
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const next = text[i + 1];
    if (inString) {
      out += char;
      if (char === "\\") out += text[++i] ?? "";
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
      out += char;
    } else if (char === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (char === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else {
      out += char;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

const config = readWranglerConfig();

describe("the deploy configuration (apps/api/wrangler.jsonc)", () => {
  it("serves the built web app and runs the Worker only for /api/*", () => {
    assert.equal(config.assets.directory, "../web/out");
    assert.deepEqual(config.assets.run_worker_first, ["/api/*"]);
    assert.equal(config.assets.not_found_handling, "404-page");
  });

  it("has a short, public-address-friendly Worker name", () => {
    assert.match(config.name, /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/);
    assert.notEqual(config.name, "api");
  });

  it("no longer has the D1 prototype", () => {
    assert.equal(config.d1_databases, undefined);
  });

  it("keeps the free Qdrant cluster alive with one daily cron, at a minute that is not on the hour", () => {
    assert.equal(config.triggers.crons.length, 1);
    const [minute, hour, dayOfMonth, month, dayOfWeek] = config.triggers.crons[0].split(" ");
    assert.match(minute, /^\d+$/);
    assert.notEqual(minute, "0");
    assert.match(hour, /^\d+$/);
    assert.deepEqual([dayOfMonth, month, dayOfWeek], ["*", "*", "*"]);
  });

  it("declares the three secrets without giving any a value, and keeps keys out of the plain variables", () => {
    assert.deepEqual([...config.secrets.required].sort(), ["GEMINI_API_KEY", "QDRANT_API_KEY", "QDRANT_URL"]);
    for (const [name, value] of Object.entries(config.vars as Record<string, string>)) {
      assert.doesNotMatch(name, /KEY|SECRET|TOKEN|PASSWORD/i, name);
      assert.doesNotMatch(String(value), /AIza[0-9A-Za-z_-]{20,}|api[-_ ]?key/i, name);
    }
    assert.ok(!("QDRANT_URL" in config.vars) && !("GEMINI_API_KEY" in config.vars));
  });

  it("has the per-client rate limit binding, with a period the platform allows", () => {
    const limiter = config.ratelimits.find((entry: { name: string }) => entry.name === "CHAT_RATE_LIMITER");
    assert.ok(limiter !== undefined);
    assert.ok([10, 60].includes(limiter.simple.period));
    assert.ok(limiter.simple.limit >= 1);
  });

  it("allows only an https or localhost origin", () => {
    assert.match(config.vars.ALLOWED_ORIGIN, /^(https:\/\/[^/\s]+|http:\/\/localhost:\d+)$/);
  });
});
