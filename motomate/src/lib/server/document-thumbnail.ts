import type { Document } from '$lib/db/schema.js';
import { getPaperlessClient } from '$lib/db/repositories/paperless-integrations.js';
import { getStorage } from '$lib/storage/index.js';
import {
	generateLocalThumbnail,
	normalizedThumbnailMimeType,
	SAFE_THUMBNAIL_IMAGE_TYPES,
	thumbnailCacheKey
} from '$lib/documents/thumbnail.js';

const inFlightThumbnails = new Map<string, Promise<Buffer>>();

async function getCachedLocalThumbnail(document: Document, userId: string): Promise<Buffer> {
	if (!document.storage_key) throw new Error('Local document content is unavailable');
	const storage = getStorage();
	const cacheKey = thumbnailCacheKey(userId, document.id);
	try {
		return await storage.getBuffer(cacheKey);
	} catch {
		// Cache misses are expected the first time a document is shown.
	}

	const existing = inFlightThumbnails.get(cacheKey);
	if (existing) return existing;

	const generation = (async () => {
		const original = await storage.getBuffer(document.storage_key!);
		const thumbnail = await generateLocalThumbnail(original, document.mime_type);
		await storage.put(cacheKey, thumbnail, 'image/webp');
		return thumbnail;
	})();
	inFlightThumbnails.set(cacheKey, generation);
	try {
		return await generation;
	} finally {
		inFlightThumbnails.delete(cacheKey);
	}
}

export async function getDocumentThumbnail(
	document: Document,
	userId: string
): Promise<{ data: Buffer; contentType: string }> {
	if (document.paperless_integration_id && document.paperless_document_id != null) {
		try {
			const client = await getPaperlessClient(document.paperless_integration_id, userId);
			const thumbnail = await client.getDocumentThumbnail(document.paperless_document_id);
			const contentType = normalizedThumbnailMimeType(thumbnail.contentType);
			if (!SAFE_THUMBNAIL_IMAGE_TYPES.has(contentType)) {
				throw new Error(
					`Paperless returned an unsupported thumbnail type: ${contentType || 'none'}`
				);
			}
			return { data: thumbnail.data, contentType };
		} catch (cause) {
			if (!document.storage_key) throw cause;
			console.warn('Paperless thumbnail unavailable; using the MotoMate copy instead:', cause);
		}
	}

	return {
		data: await getCachedLocalThumbnail(document, userId),
		contentType: 'image/webp'
	};
}
