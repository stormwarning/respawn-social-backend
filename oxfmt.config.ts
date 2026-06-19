import { defineConfig } from 'oxfmt'

/**
 * Oxfmt configuration.
 *
 * Default starter config (these values are oxfmt's defaults, made explicit so
 * they're easy to tweak). Run with `deno task format` (auto-discovers this file).
 * Config reference: https://oxc.rs/docs/guide/usage/formatter/config.html
 */
export default defineConfig({
	printWidth: 100,
	useTabs: true,
	semi: false,
	singleQuote: true,
	trailingComma: 'all',
})
