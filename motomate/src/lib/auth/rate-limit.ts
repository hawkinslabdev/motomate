// In-memory rate limiter — suitable for a single-process self-hosted server.
// State resets on server restart, which is acceptable.

interface Bucket {
	count: number;
	resetAt: number;
}

const store = new Map<string, Bucket>();

// Purge expired buckets every 5 minutes to prevent unbounded memory growth.
setInterval(() => {
	const now = Date.now();
	for (const [key, bucket] of store) {
		if (now > bucket.resetAt) store.delete(key);
	}
}, 5 * 60_000);

/**
 * Returns true if the request is allowed, false if rate limited.
 * @param key      Unique string, e.g. "login:{ip}"
 * @param max      Maximum requests allowed within the window
 * @param windowMs Window length in milliseconds
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
	const now = Date.now();
	const bucket = store.get(key);

	if (!bucket || now > bucket.resetAt) {
		store.set(key, { count: 1, resetAt: now + windowMs });
		return true;
	}

	if (bucket.count >= max) return false;

	bucket.count++;
	return true;
}
