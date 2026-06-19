import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { config } from '../config.js'
import { logger } from '../logger.js'

/**
 * Migration runner.
 *
 * Backend concept: "migrations" are versioned SQL files that evolve the database
 * schema over time. Run this on deploy (and locally after `db:generate`) to
 * bring the database up to date. We use a dedicated single connection (`max: 1`)
 * because migrations must run sequentially, not concurrently.
 */
async function main() {
	const sql = postgres(config.DATABASE_URL, { max: 1 })
	const db = drizzle(sql)

	logger.info('Running migrations...')
	await migrate(db, { migrationsFolder: './drizzle' })
	logger.info('Migrations complete.')

	await sql.end()
}

main().catch((err) => {
	logger.error(err, 'Migration failed')
	process.exit(1)
})
