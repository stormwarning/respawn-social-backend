import { NodeOAuthClient } from '@atproto/oauth-client-node'
import { requestLocalLock } from '@atproto/oauth-client-node'
import type { OAuthClientMetadataInput } from '@atproto/oauth-client-node'
import { config } from '../config.js'
import { sessionStore, stateStore } from './store.js'

/**
 * AT Protocol OAuth client.
 *
 * Backend concept: "OAuth client metadata". Unlike traditional OAuth where you
 * pre-register an app and get a client_id/secret, AT Proto uses a URL as the
 * client_id. Your server publishes a small JSON document describing the app at
 * that URL, and the user's PDS fetches it during login.
 *
 * In LOCAL DEV we can't publish a public URL, so AT Proto supports a special
 * "loopback" client: client_id = "http://localhost" with params in the query
 * string. We switch between the two automatically based on PUBLIC_URL.
 */

const isLoopback =
	config.PUBLIC_URL.includes('127.0.0.1') || config.PUBLIC_URL.includes('localhost')

// Where the user is sent back to after authorizing on their PDS.
const redirectUri = `${config.PUBLIC_URL}/auth/callback`
// Scopes: what we're allowed to do. atproto = identity; transition:generic =
// general read/write to the user's repo (needed to post game reviews later).
const scope = 'atproto transition:generic'

export const clientMetadata: OAuthClientMetadataInput = isLoopback
	? // Loopback dev client: client_id encodes redirect + scope as query params.
		{
			client_id: `http://localhost?redirect_uri=${encodeURIComponent(
				redirectUri,
			)}&scope=${encodeURIComponent(scope)}`,
			client_name: 'Respawn (dev)',
			redirect_uris: [redirectUri],
			scope,
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			token_endpoint_auth_method: 'none',
			application_type: 'web',
			dpop_bound_access_tokens: true,
		}
	: // Production client: client_id is the public URL of our metadata document.
		{
			client_id: `${config.PUBLIC_URL}/auth/client-metadata.json`,
			client_name: 'Respawn',
			client_uri: config.PUBLIC_URL,
			redirect_uris: [redirectUri],
			scope,
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			token_endpoint_auth_method: 'none',
			application_type: 'web',
			dpop_bound_access_tokens: true,
		}

export const oauthClient = new NodeOAuthClient({
	clientMetadata,
	stateStore,
	sessionStore,
	// Backend concept: a "lock" prevents two concurrent token refreshes for the
	// same user from racing. requestLocalLock is an in-process lock — correct for
	// a single instance. If you scale to multiple instances, swap in a shared
	// (e.g. Redis-backed) lock here.
	requestLock: requestLocalLock,
})
