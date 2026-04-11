import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import crypto from 'crypto';
import { env } from '$env/dynamic/private';
import { getStorage } from '$lib/storage/index.js';
import { getDocumentByStorageKey } from '$lib/db/repositories/documents.js';
import { getVehicleByCoverImageKey } from '$lib/db/repositories/vehicles.js';

function isSafePath(key: string): boolean {
	// Only allow keys starting with files/{userId}/ or avatars/{userId}/ and containing no path traversal
	const normalized = key.replace(/\\/g, '/');
	const isFiles = normalized.startsWith('files/');
	const isAvatars = normalized.startsWith('avatars/');
	if (!isFiles && !isAvatars) return false;
	if (isFiles && !normalized.match(/^files\/[a-zA-Z0-9]+\/[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/))
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
	if (normalized.includes('..')) return false;
	return true;
}

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { status: 204 });
};

export const GET: RequestHandler = async ({ url, locals }) => {
	const key = url.searchParams.get('key');
	const expires = url.searchParams.get('expires');
	const sig = url.searchParams.get('sig');

	if (!key) error(400, 'Missing parameters');

	// Validate path to prevent traversal attacks
	if (!isSafePath(key)) error(400, 'Invalid file key');

	// Check if this is an avatar (cover image) or a document
	const isAvatar = key.startsWith('avatars/');
	const isDoc = key.startsWith('files/');

	if (expires && sig) {
		// Signed URL: verify signature and expiry. No session required.
		const now = Math.floor(Date.now() / 1000);
		if (parseInt(expires) < now) error(410, 'Link expired');

		const secret = env.AUTH_SECRET ?? 'dev-secret';
		const expected = crypto.createHmac('sha256', secret).update(`${key}:${expires}`).digest('hex');

		if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
			error(403, 'Invalid signature');
		}
	} else {
		// Unsigned access: require an active session and verify ownership.
		const user = locals.user;
		if (!user) error(401, 'Unauthorized');

		if (isDoc) {
			const doc = await getDocumentByStorageKey(key);
			if (!doc || doc.user_id !== user.id) error(403, 'Access denied');
		} else if (isAvatar) {
			// User profile avatar: avatars/users/{userId}.{ext}
			const isUserAvatar = key.startsWith('avatars/users/');
			if (isUserAvatar) {
				const parts = key.split('/'); // ['avatars', 'users', '{userId}.{ext}']
				const pathUserId = parts[2]?.split('.')[0];
				if (!pathUserId || pathUserId !== user.id) error(403, 'Access denied');
			} else {
				// Vehicle avatar: avatars/{userId}/{vehicleId}.{ext}
				const vehicle = await getVehicleByCoverImageKey(key);
				if (!vehicle || vehicle.user_id !== user.id) error(403, 'Access denied');
			}
		}
	}

	const adapter = getStorage();

	// Only local adapter serves files via this endpoint
	if (env.STORAGE_ADAPTER === 's3') error(400, 'Use pre-signed S3 URL directly');

	try {
		const stream = await adapter.getStream(key);
		// Infer content type from key extension
		const ext = key.split('.').pop()?.toLowerCase() ?? '';
		const mimeMap: Record<string, string> = {
			pdf: 'application/pdf',
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			png: 'image/png',
			webp: 'image/webp',
			gif: 'image/gif',
			gpx: 'application/gpx+xml'
		};
		const contentType = mimeMap[ext] ?? 'application/octet-stream';

		const headers: Record<string, string> = {
			'Content-Type': contentType,
			'Cache-Control': 'private, max-age=3600'
		};

		// Documents get Content-Disposition: attachment for download; avatars are served inline
		if (isDoc) {
			const doc = await getDocumentByStorageKey(key);
			const filename = doc?.name ?? key.split('/').pop() ?? null;
			if (filename) {
				headers['Content-Disposition'] =
					`attachment; filename="${filename.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
			}
		}

		return new Response(stream as unknown as ReadableStream, { headers });
	} catch {
		error(404, 'File not found');
	}
};
