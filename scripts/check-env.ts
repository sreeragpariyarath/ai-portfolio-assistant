import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { checkEnv } from "./lib/env.ts";

const ENV_FILE = resolve(import.meta.dirname, "..", ".env");

// Variables already set in the shell win over the file, matching loadEnvFile semantics.
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
else console.log("No .env file found; checking the current shell environment only.");

const results = checkEnv(process.env);

for (const result of results) {
  const detail = result.problem ? ` (${result.problem})` : "";
  console.log(`${result.status === "ok" ? "ok     " : result.status.padEnd(7)} ${result.name}${detail}`);
}

const failed = results.filter((result) => result.status !== "ok");
if (failed.length > 0) {
  console.error(`\n${failed.length} variable(s) need attention. See docs/SETUP.md.`);
  process.exitCode = 1;
} else {
  console.log("\nEnvironment looks ready.");
}
