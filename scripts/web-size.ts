import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { REPO_ROOT } from "./lib/eval-data.ts";
import { kb, labelsFor, referencedScripts, referencedStyles, totals } from "./lib/web-size.ts";
import type { FileSize } from "./lib/web-size.ts";

// `pnpm web:size` reports what a visitor downloads, from the production export (build it first).
// `--max-gzip-kb=N` makes it fail when the home page's JavaScript is larger than N KB gzipped.

const OUT = resolve(REPO_ROOT, "apps/web/out");

function measure(path: string, label: string): FileSize {
  const bytes = readFileSync(path);
  const text = path.endsWith(".js") ? bytes.toString("utf8") : "";
  return { name: label, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, labels: labelsFor(text) };
}

function main(): number {
  if (!existsSync(join(OUT, "index.html"))) {
    console.error("apps/web/out/index.html not found. Run: pnpm --filter web build");
    return 1;
  }

  const html = readFileSync(join(OUT, "index.html"), "utf8");
  const scripts = referencedScripts(html).map((path) => measure(join(OUT, path), basename(path)));
  const styles = referencedStyles(html).map((path) => measure(join(OUT, path), basename(path)));

  const all = readdirSync(join(OUT, "_next/static/chunks"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => measure(join(OUT, "_next/static/chunks", name), name));

  const print = (title: string, files: FileSize[]) => {
    console.log(`\n${title}`);
    console.log(`  ${"gzip KB".padStart(8)} ${"raw KB".padStart(8)}  file`);
    for (const file of [...files].sort((a, b) => b.gzip - a.gzip)) {
      console.log(`  ${kb(file.gzip).padStart(8)} ${kb(file.raw).padStart(8)}  ${file.name}${file.labels.length > 0 ? `  [${file.labels.join(", ")}]` : ""}`);
    }
    const sum = totals(files);
    console.log(`  ${kb(sum.gzip).padStart(8)} ${kb(sum.raw).padStart(8)}  total, ${files.length} files`);
  };

  print("JavaScript the home page loads", scripts);
  print("CSS the home page loads", styles);
  print("All JavaScript in the export (home page, chat, record pages)", all);

  const pageImages = ["logo.svg", "avatar-placeholder.svg"].filter((name) => existsSync(join(OUT, name))).map((name) => measure(join(OUT, name), name));
  print("Images on the home page", pageImages);

  const limitArg = process.argv.find((argument) => argument.startsWith("--max-gzip-kb="));
  if (limitArg !== undefined) {
    const limit = Number(limitArg.slice("--max-gzip-kb=".length));
    const actual = totals(scripts).gzip / 1024;
    if (!Number.isFinite(limit)) {
      console.error("--max-gzip-kb must be a number.");
      return 1;
    }
    if (actual > limit) {
      console.error(`\nHome page JavaScript is ${actual.toFixed(1)} KB gzip, over the ${limit} KB limit.`);
      return 1;
    }
    console.log(`\nHome page JavaScript is ${actual.toFixed(1)} KB gzip, within the ${limit} KB limit.`);
  }
  return 0;
}

process.exitCode = main();
