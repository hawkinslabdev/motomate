import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import crypto from 'crypto';
import { env as pubEnv } from '$env/dynamic/public';
import { getStorage } from '$lib/storage/index.js';
import { getDocumentByStorageKey } from '$lib/db/repositories/documents.js';
import { getVehicleByCoverImageKey } from '$lib/db/repositories/vehicles.js';
import { downloadFilename } from '$lib/utils/storage.js';

// renders in browser, cannot run scripts
const INLINE_TYPES: Record<string, string> = {
	pdf: 'application/pdf',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
	bmp: 'image/bmp',
	heic: 'image/heic',
	heif: 'image/heif',
	tif: 'image/tiff',
	tiff: 'image/tiff',
	txt: 'text/plain; charset=utf-8'
};

// typed, but never inline. SVG can carry script
const DOWNLOAD_TYPES: Record<string, string> = {
	svg: 'image/svg+xml',
	gpx: 'application/gpx+xml',
	csv: 'text/csv',
	doc: 'application/msword',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	xls: 'application/vnd.ms-excel',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	zip: 'application/zip'
};

function isSafePath(key: string): boolean {
	// Only allow keys starting with files/{userId}/ or avatars/{userId}/ and containing no path traversal
	const normalized = key.replace(/\\/g, '/');
	if (normalized.includes('..')) return false;
	const isFiles = normalized.startsWith('files/');
	const isAvatars = normalized.startsWith('avatars/');
	const isDemo = normalized.startsWith('demo/');
	if (!isFiles && !isAvatars && !isDemo) return false;
	// files/{userId}/{id}.{ext} (pre-vehicle-namespacing) or files/{userId}/{vehicleId}/{id}.{ext}
	if (
		isFiles &&
		!normalized.match(/^files\/[a-zA-Z0-9]+\/(?:[a-zA-Z0-9]+\/)?[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/)
	)
		return false;
	if (isAvatars) {
		// User profile avatar: avatars/users/{userId}.{ext}
		const isUserAvatar = normalized.match(/^avatars\/users\/[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/);
		// Vehicle avatar: avatars/{userId}/{vehicleId}.{ext}
		const isVehicleAvatar = normalized.match(
			/^avatars\/[a-zA-Z0-9]+\/[a-zA-Z0-9\-]+\.[a-zA-Z0-9]+$/
		);
		if (!isUserAvatar && !isVehicleAvatar) return false;
	}
	if (isDemo && !normalized.match(/^demo\/[a-zA-Z0-9._-]+$/)) return false;
	return true;
}

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { status: 204 });
};

export const GET: RequestHandler = async ({ url, locals, request }) => {
	const key = url.searchParams.get('key');

	if (!key) error(400, 'Missing parameters');

	// Validate path to prevent traversal attacks
	if (!isSafePath(key)) error(400, 'Invalid file key');

	// Check if this is an avatar (cover image), a document, or a demo asset
	const isAvatar = key.startsWith('avatars/');
	const isDoc = key.startsWith('files/');
	const isDemo = key.startsWith('demo/');

	// Demo assets are only accessible when demo mode is explicitly enabled
	if (isDemo && pubEnv.PUBLIC_DEMO_ENABLED !== 'true') error(404, 'File not found');

	// Resolve document record once
	let docRecord: Awaited<ReturnType<typeof getDocumentByStorageKey>> = undefined;
	if (isDoc || isDemo) {
		docRecord = await getDocumentByStorageKey(key);
	}

	// Every file requires an active session and an ownership check
	const user = locals.user;
	if (!user) error(401, 'Unauthorized');

	if (isDemo) {
		// Demo assets are accessible to any authenticated user
	} else if (isDoc) {
		if (!docRecord || docRecord.user_id !== user.id) error(403, 'Access denied');
	} else if (isAvatar) {
		// User profile avatar: avatars/users/{userId}.{ext}
		const isUserAvatar = key.startsWith('avatars/users/');
		if (isUserAvatar) {
			const parts = key.split('/'); // ['avatars', 'users', '{userId}.{ext}']
			const pathUserId = parts[2]?.split('.')[0];
			if (!pathUserId || pathUserId !== user.id) error(403, 'Access denied');
		} else {
			// Vehicle avatar: avatars/{userId}/{vehicleId}.{ext}
			const vehicle = await getVehicleByCoverImageKey(key, user.id);
			if (!vehicle) error(403, 'Access denied');
		}
	}

	const adapter = getStorage();

	let fileBuffer: Buffer;
	try {
		fileBuffer = await adapter.getBuffer(key);
	} catch {
		error(404, 'File not found');
	}

	const ext = key.split('.').pop()?.toLowerCase() ?? '';
	const contentType = INLINE_TYPES[ext] ?? DOWNLOAD_TYPES[ext] ?? 'application/octet-stream';
	const inline = ext in INLINE_TYPES && url.searchParams.get('download') !== '1';

	const filename =
		isDoc || isDemo
			? docRecord
				? downloadFilename(docRecord.name, docRecord.title)
				: (key.split('/').pop() ?? null)
			: null;

	// files/ keys are unique per upload, avatars/ and demo/ keys are reused so they must revalidate
	const cacheControl = isDoc ? 'private, max-age=31536000, immutable' : 'private, no-cache';

	// Hash bytes, filename, and disposition so changes break the cache taggbg
	const etag = `"${crypto
		.createHash('sha256')
		.update(fileBuffer)
		.update(filename ?? '')
		.update(inline ? 'inline' : 'attachment')
		.digest('base64url')}"`;

	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, {
			status: 304,
			headers: { ETag: etag, 'Cache-Control': cacheControl }
		});
	}

	const headers: Record<string, string> = {
		'Content-Type': contentType,
		'Content-Length': String(fileBuffer.length),
		'Cache-Control': cacheControl,
		// Block sniffing an inline file into script
		'X-Content-Type-Options': 'nosniff',
		ETag: etag
	};

	const disposition = inline ? 'inline' : 'attachment';
	if (filename) {
		headers['Content-Disposition'] =
			`${disposition}; filename="${filename.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
	} else if (!inline) {
		headers['Content-Disposition'] = 'attachment';
	}

	return new Response(fileBuffer.buffer as ArrayBuffer, { headers });
};
