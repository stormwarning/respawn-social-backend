import { defineConfig } from 'oxlint'

/**
 * Oxlint configuration.
 *
 * Default starter config — extend `rules`, `plugins`, `categories`, etc. as
 * needed. Run with `deno task lint` (auto-discovers this file).
 * Rules reference: https://oxc.rs/docs/guide/usage/linter/rules.html
 */
export default defineConfig({
	categories: {
		correctness: 'error',
	},
	rules: {},
})
