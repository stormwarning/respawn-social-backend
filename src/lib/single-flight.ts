/**
 * Single-flight (a.k.a. request coalescing / deduplication).
 *
 * Backend concept: if 10 users ask for the same uncached thing at the same
 * instant, naively we'd fire 10 identical IGDB requests. Instead, the FIRST
 * call starts the work and the other 9 await that same in-flight Promise. Once
 * it resolves, all 10 get the result and the slot is cleared.
 *
 * This is critical for staying under IGDB's rate limit during cache-miss spikes.
 */
export class SingleFlight<T> {
	private inFlight = new Map<string, Promise<T>>()

	/**
	 * Run `fn` for `key`, but if a call for `key` is already running, return its
	 * Promise instead of starting a new one.
	 */
	async run(key: string, fn: () => Promise<T>): Promise<T> {
		const existing = this.inFlight.get(key)
		if (existing) return existing

		const promise = (async () => {
			try {
				return await fn()
			} finally {
				// Clear the slot whether it succeeded or failed, so a failure doesn't
				// poison future calls for this key.
				this.inFlight.delete(key)
			}
		})()

		this.inFlight.set(key, promise)
		return promise
	}
}
