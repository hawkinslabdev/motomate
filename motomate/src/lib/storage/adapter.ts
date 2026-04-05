export interface StorageAdapter {
	/**
	 * Upload a file and store it under the given key.
	 */
	put(key: string, body: Buffer | Uint8Array, mime: string): Promise<void>;

	/**
	 * Return a readable stream for the stored file.
	 */
	getStream(key: string): Promise<NodeJS.ReadableStream>;

	/**
	 * Return the raw buffer for the stored file (for small files).
	 */
	getBuffer(key: string): Promise<Buffer>;

	/**
	 * Delete a stored file.
	 */
	delete(key: string): Promise<void>;

	/**
	 * Generate a pre-signed URL that allows temporary public access.
	 * For local adapter, this returns a signed app-internal URL.
	 */
	presignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export function storageKey(prefix: string, id: string, filename: string): string {
	// Sanitize filename: remove path traversal, keep extension
	const ext =
		filename
			.split('.')
			.pop()
			?.replace(/[^a-zA-Z0-9]/g, '') ?? 'bin';
	return `${prefix}/${id}.${ext}`;
}
