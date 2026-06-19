import { z } from 'zod'

/**
 * Config loader.
 *
 * Backend concept: "fail-fast configuration". Instead of reading
 * `process.env.WHATEVER` scattered across the codebase (and crashing at 2am
 * when one is missing/misspelled), we validate ALL environment variables here,
 * once, at startup. If something is wrong the server refuses to boot with a
 * clear error rather than failing mysteriously later.
 */

const EnvSchema = z.object({
	PORT: z.coerce.number().default(3000),

	// CORS: which front-end origins may call this API. Comma-separated -> array.
	ALLOWED_ORIGINS: z
		.string()
		.default('http://localhost:5173')
		.transform((s) =>
			s
				.split(',')
				.map((o) => o.trim())
				.filter(Boolean),
		),

	DATABASE_URL: z.string().url(),

	// IGDB auth (via Twitch).
	TWITCH_CLIENT_ID: z.string().min(1),
	TWITCH_CLIENT_SECRET: z.string().min(1),

	// AT Proto OAuth needs to know our own public URL + where to bounce users.
	PUBLIC_URL: z.string().url(),
	ATPROTO_LOGIN_REDIRECT: z.string().url(),

	// Secret used to sign the session cookie (so users can't forge their DID).
	// Generate with: openssl rand -hex 32
	COOKIE_SECRET: z.string().min(16),

	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
	// Pretty-print exactly which vars are bad, then hard-exit.
	console.error('Invalid environment configuration:')
	console.error(z.prettifyError(parsed.error))
	process.exit(1)
}

export const config = parsed.data
export type Config = typeof config
