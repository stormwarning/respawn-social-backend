import { Hono } from 'hono'
import { z } from 'zod'
import { getGame, searchGames } from '../igdb/data.js'
import { logger } from '../logger.js'

/**
 * Game routes.
 *
 * Backend concept: these are the public HTTP endpoints the front-end calls.
 * They are thin — all the heavy lifting (rate limiting, caching) lives in the
 * igdb data layer. A route's job is just: validate input -> call the service ->
 * shape the response.
 */
export const gamesRoutes = new Hono()

// GET /games/search?q=zelda
// (defined before /:id so "search" isn't captured as an id)
const searchQuerySchema = z.object({
	q: z.string().min(1, "query 'q' is required").max(100),
})

gamesRoutes.get('/search', async (c) => {
	// Validate the query string. Invalid -> 400 with a helpful message.
	const parsed = searchQuerySchema.safeParse({ q: c.req.query('q') })
	if (!parsed.success) {
		return c.json({ error: z.prettifyError(parsed.error) }, 400)
	}

	try {
		const results = await searchGames(parsed.data.q)
		return c.json({ results })
	} catch (err) {
		logger.error(err, 'search failed')
		return c.json({ error: 'Failed to search games' }, 502)
	}
})

// GET /games/:id
gamesRoutes.get('/:id', async (c) => {
	const id = Number(c.req.param('id'))
	if (!Number.isInteger(id) || id <= 0) {
		return c.json({ error: 'id must be a positive integer' }, 400)
	}

	try {
		const game = await getGame(id)
		if (!game) return c.json({ error: 'Game not found' }, 404)
		return c.json({ game })
	} catch (err) {
		logger.error(err, `getGame(${id}) failed`)
		// 502 Bad Gateway: an upstream dependency (IGDB) failed, not the client.
		return c.json({ error: 'Failed to fetch game' }, 502)
	}
})
