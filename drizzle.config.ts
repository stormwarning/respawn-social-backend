import { defineConfig } from 'drizzle-kit'

/**
 * Drizzle config.
 *
 * `drizzle-kit generate` reads our schema (src/db/schema.ts) and produces SQL
 * migration files in ./drizzle. Those SQL files get committed and applied to the
 * database (via `db:migrate`) on deploy.
 */
export default defineConfig({
	schema: './src/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
})
