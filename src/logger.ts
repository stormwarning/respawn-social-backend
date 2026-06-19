import { pino } from 'pino'
import { config } from './config.js'

/**
 * Structured logger.
 *
 * Backend concept: in production you want logs as JSON (machine-parseable, so
 * hosting platforms can search/alert on them). In local dev that's unreadable,
 * so we pretty-print with colors instead. Same logger, two output styles.
 */
export const logger = pino(
	config.NODE_ENV === 'development'
		? {
				level: 'debug',
				transport: {
					target: 'pino-pretty',
					options: { colorize: true, translateTime: 'HH:MM:ss' },
				},
			}
		: { level: 'info' },
)
