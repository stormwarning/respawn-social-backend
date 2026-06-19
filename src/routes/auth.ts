import { Hono } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { Agent } from '@atproto/api'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { clientMetadata, oauthClient } from '../atproto/client.js'

/**
 * AT Protocol auth routes.
 *
 * Backend concept: the OAuth "redirect dance":
 *   1. GET /auth/login?handle=alice.bsky.social
 *        -> we build an authorization URL and redirect the user to their PDS.
 *   2. The user approves on their PDS, which redirects back to:
 *      GET /auth/callback?code=...&state=...
 *        -> we exchange the code for a session, then set a signed cookie holding
 *           the user's DID and bounce them to the front-end.
 *   3. Later requests send that cookie; GET /auth/me restores the session and
 *      tells the front-end who is logged in.
 */
/**
 * Lightweight AT Proto handle validation (e.g. "alice.bsky.social").
 * A handle is a domain name: dot-separated labels of letters/digits/hyphens.
 * Good enough to reject obvious garbage before we hit the network; the OAuth
 * client does the authoritative resolution.
 */
function isValidHandle(handle: string): boolean {
	if (handle.length > 253) return false
	return /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(handle)
}

export const authRoutes = new Hono()

// Name of our session cookie. httpOnly so JS can't read it; signed so it can't
// be forged. Holds just the user's DID — the real tokens live server-side.
const SESSION_COOKIE = 'sid'

const cookieOptions = {
	httpOnly: true,
	secure: config.NODE_ENV === 'production',
	sameSite: 'Lax',
	path: '/',
	maxAge: 60 * 60 * 24 * 30, // 30 days
} as const

/**
 * The client metadata document, served at a stable URL. The user's PDS fetches
 * this during login (production only; dev uses the loopback client).
 */
authRoutes.get('/client-metadata.json', (c) => c.json(clientMetadata))

/** Step 1: begin login. */
authRoutes.get('/login', async (c) => {
	const handle = c.req.query('handle')
	if (!handle || !isValidHandle(handle)) {
		return c.json({ error: 'A valid `handle` query param is required' }, 400)
	}

	try {
		// `authorize` stores PKCE/DPoP state (via our stateStore) and returns the
		// URL we must send the user to.
		const url = await oauthClient.authorize(handle, {
			scope: 'atproto transition:generic',
		})
		return c.redirect(url.toString())
	} catch (err) {
		logger.error(err, 'authorize failed')
		return c.json({ error: 'Failed to start login' }, 500)
	}
})

/** Step 2: handle the redirect back from the PDS. */
authRoutes.get('/callback', async (c) => {
	const params = new URLSearchParams(c.req.url.split('?')[1] ?? '')

	try {
		// Exchanges the code for a session and persists it via our sessionStore.
		const { session } = await oauthClient.callback(params)

		// Store ONLY the DID in the signed cookie. The session itself (tokens) stays
		// in our database, retrievable via oauthClient.restore(did).
		await setSignedCookie(c, SESSION_COOKIE, session.did, config.COOKIE_SECRET, cookieOptions)

		logger.info({ did: session.did }, 'User logged in')
		// Send the user back to the front-end app.
		return c.redirect(config.ATPROTO_LOGIN_REDIRECT)
	} catch (err) {
		logger.error(err, 'callback failed')
		return c.redirect(`${config.ATPROTO_LOGIN_REDIRECT}?error=login_failed`)
	}
})

/** Who am I? Returns the logged-in user's DID + handle, or 401. */
authRoutes.get('/me', async (c) => {
	const did = await getSignedCookie(c, config.COOKIE_SECRET, SESSION_COOKIE)
	if (!did) return c.json({ authenticated: false }, 401)

	try {
		// Restore the OAuth session (auto-refreshes tokens if near expiry).
		const oauthSession = await oauthClient.restore(did)
		// The Agent is the AT Proto API client bound to this user's session.
		const agent = new Agent(oauthSession)
		const profile = await agent.getProfile({ actor: did })

		return c.json({
			authenticated: true,
			did,
			handle: profile.data.handle,
			displayName: profile.data.displayName,
			avatar: profile.data.avatar,
		})
	} catch (err) {
		// Session is gone/invalid — clear the cookie so the client logs out cleanly.
		logger.warn({ err, did }, 'restore failed; clearing session')
		deleteCookie(c, SESSION_COOKIE, cookieOptions)
		return c.json({ authenticated: false }, 401)
	}
})

/** Log out: revoke the AT Proto session and clear the cookie. */
authRoutes.post('/logout', async (c) => {
	const did = await getSignedCookie(c, config.COOKIE_SECRET, SESSION_COOKIE)
	if (did) {
		try {
			await oauthClient.revoke(did)
		} catch (err) {
			logger.warn({ err, did }, 'revoke failed (clearing cookie anyway)')
		}
	}
	deleteCookie(c, SESSION_COOKIE, cookieOptions)
	return c.json({ ok: true })
})
