import { eq } from 'drizzle-orm'
import type {
	NodeSavedSession,
	NodeSavedSessionStore,
	NodeSavedState,
	NodeSavedStateStore,
} from '@atproto/oauth-client-node'
import { db } from '../db/client.js'
import { atprotoAuthState, atprotoSession } from '../db/schema.js'

/**
 * Postgres-backed stores for the AT Proto OAuth client.
 *
 * Backend concept: the OAuth library doesn't know or care about our database.
 * It just needs two key/value stores that implement get/set/del. We adapt our
 * Drizzle tables to that interface here.
 *
 *  - stateStore:   short-lived per-login data (the redirect "dance" state).
 *  - sessionStore: durable per-user sessions, keyed by the user's DID.
 *
 * The values are JSON-serializable objects the library defines; we store them
 * verbatim in a jsonb column.
 */

export const stateStore: NodeSavedStateStore = {
	async get(key) {
		const row = await db.query.atprotoAuthState.findFirst({
			where: eq(atprotoAuthState.key, key),
		})
		return (row?.state as NodeSavedState | undefined) ?? undefined
	},
	async set(key, value) {
		await db
			.insert(atprotoAuthState)
			.values({ key, state: value })
			.onConflictDoUpdate({
				target: atprotoAuthState.key,
				set: { state: value },
			})
	},
	async del(key) {
		await db.delete(atprotoAuthState).where(eq(atprotoAuthState.key, key))
	},
}

export const sessionStore: NodeSavedSessionStore = {
	async get(did) {
		const row = await db.query.atprotoSession.findFirst({
			where: eq(atprotoSession.did, did),
		})
		return (row?.session as NodeSavedSession | undefined) ?? undefined
	},
	async set(did, value) {
		await db
			.insert(atprotoSession)
			.values({ did, session: value, updatedAt: new Date() })
			.onConflictDoUpdate({
				target: atprotoSession.did,
				set: { session: value, updatedAt: new Date() },
			})
	},
	async del(did) {
		await db.delete(atprotoSession).where(eq(atprotoSession.did, did))
	},
}
