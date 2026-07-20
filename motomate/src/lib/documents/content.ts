const PREVIEWABLE_MIME_TYPES = new Set([
	'application/pdf',
	'image/avif',
	'image/gif',
	'image/jpeg',
	'image/png',
	'image/webp',
	'text/plain'
]);

function normalizedMimeType(value: string): string {
	return value.split(';', 1)[0].trim().toLowerCase();
}

export function isBrowserPreviewable(mimeType: string): boolean {
	return PREVIEWABLE_MIME_TYPES.has(normalizedMimeType(mimeType));
}

export function preferredContentType(
	remoteContentType: string | null,
	storedContentType: string
): string {
	if (!remoteContentType || normalizedMimeType(remoteContentType) === 'application/octet-stream') {
		return storedContentType;
	}
	return remoteContentType;
}

export function documentContentDisposition(filename: string, download: boolean): string {
	const fallback = filename.replace(/[^\x20-\x7e]|["\\\r\n]/g, '_') || 'document';
	const encoded = encodeURIComponent(filename).replace(
		/[!'()*]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
	);
	return `${download ? 'attachment' : 'inline'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
