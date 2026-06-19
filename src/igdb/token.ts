import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { oauthToken } from '../db/schema.js'
import { config } from '../config.js'
import { logger } from '../logger.js'

/**
 * IGDB / Twitch token manager.
 *
 * Backend concept: IGDB authenticates via a Twitch "app access token" that lasts
 * ~weeks. We must NOT fetch a new token on every IGDB call — that would be slow
 * and abusive. Instead we:
 *   1. Keep the token in memory for the life of the process (fastest).
 *   2. Persist it to Postgres so a restart reuses the same valid token.
 *   3. Refresh it slightly BEFORE it expires.
 *
 * Everything here is private to the igdb module; callers just use the data layer.
 */

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
// Refresh this many ms before the real expiry, so we never use an about-to-die token.
const EXPIRY_SAFETY_MARGIN_MS = 60_000
const TOKEN_ROW_ID = 'igdb'

interface CachedToken {
	accessToken: string
	expiresAt: Date
}

// In-memory copy (layer 1).
let memoryToken: CachedToken | null = null
// Ensures concurrent callers during a refresh all await the SAME fetch,
// instead of stampeding Twitch with N token requests (single-flight).
let inFlightRefresh: Promise<CachedToken> | null = null

function isValid(token: CachedToken | null): token is CachedToken {
	return token !== null && token.expiresAt.getTime() - EXPIRY_SAFETY_MARGIN_MS > Date.now()
}

/** Ask Twitch for a brand-new app access token. */
async function fetchNewToken(): Promise<CachedToken> {
	const url = new URL(TWITCH_TOKEN_URL)
	url.searchParams.set('client_id', config.TWITCH_CLIENT_ID)
	url.searchParams.set('client_secret', config.TWITCH_CLIENT_SECRET)
	url.searchParams.set('grant_type', 'client_credentials')

	const res = await fetch(url, { method: 'POST' })
	if (!res.ok) {
		throw new Error(`Twitch token request failed: ${res.status} ${await res.text()}`)
	}

	const body = (await res.json()) as { access_token: string; expires_in: number }
	const token: CachedToken = {
		accessToken: body.access_token,
		expiresAt: new Date(Date.now() + body.expires_in * 1000),
	}

	// Persist (layer 2): upsert the single token row.
	await db
		.insert(oauthToken)
		.values({
			id: TOKEN_ROW_ID,
			accessToken: token.accessToken,
			expiresAt: token.expiresAt,
		})
		.onConflictDoUpdate({
			target: oauthToken.id,
			set: { accessToken: token.accessToken, expiresAt: token.expiresAt },
		})

	logger.info('Fetched new IGDB access token')
	return token
}

/** Try to load a still-valid token from Postgres (used on cold start). */
async function loadTokenFromDb(): Promise<CachedToken | null> {
	const row = await db.query.oauthToken.findFirst({
		where: eq(oauthToken.id, TOKEN_ROW_ID),
	})
	if (!row) return null
	return { accessToken: row.accessToken, expiresAt: row.expiresAt }
}

/**
 * Get a valid token, fetching/refreshing only when necessary.
 * Order of preference: in-memory -> database -> fetch new.
 */
export async function getAccessToken(): Promise<string> {
	if (isValid(memoryToken)) return memoryToken.accessToken

	// If another request is already refreshing, await its result.
	if (inFlightRefresh) return (await inFlightRefresh).accessToken

	inFlightRefresh = (async () => {
		// Double-check the DB before hitting Twitch (another instance may have refreshed).
		const fromDb = await loadTokenFromDb()
		if (isValid(fromDb)) {
			memoryToken = fromDb
			return fromDb
		}
		const fresh = await fetchNewToken()
		memoryToken = fresh
		return fresh
	})()

	try {
		return (await inFlightRefresh).accessToken
	} finally {
		inFlightRefresh = null
	}
}

/** Force-invalidate the cached token (e.g. if IGDB returns 401). */
export function invalidateToken(): void {
	memoryToken = null
}
