import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.jsonc" },
		}),
	],
	resolve: {
		alias: [
			// The tests run against a fixed, fictional public corpus (the "Alex Morgan" fixtures), never the
			// owner's real data that src/generated/public-corpus.json now holds (D-029).
			{
				find: /^.*generated\/public-corpus\.json$/,
				replacement: fileURLToPath(new URL("./test/fixtures/public-corpus.json", import.meta.url)),
			},
		],
	},
});
