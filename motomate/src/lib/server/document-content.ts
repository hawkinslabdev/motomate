import type { Document } from '$lib/db/schema.js';
import { getStorage } from '$lib/storage/index.js';
import { getPaperlessClient } from '$lib/db/repositories/paperless-integrations.js';
import { preferredContentType } from '$lib/documents/content.js';

export async function getDocumentContent(
	document: Document,
	userId: string
): Promise<{ data: Buffer; contentType: string }> {
	if (document.storage_key) {
		return {
			data: await getStorage().getBuffer(document.storage_key),
			contentType: document.mime_type
		};
	}

	if (document.paperless_integration_id && document.paperless_document_id != null) {
		const client = await getPaperlessClient(document.paperless_integration_id, userId);
		const downloaded = await client.downloadDocument(document.paperless_document_id);
		return {
			data: downloaded.data,
			contentType: preferredContentType(downloaded.contentType, document.mime_type)
		};
	}

	throw new Error('Document content is unavailable');
}
