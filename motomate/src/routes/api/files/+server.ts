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
	if (isAvatars && !normalized.match(/^avatars\/[a-zA-Z0-9]+\/[a-zA-Z0-9\-]+\.[a-zA-Z0-9]+$/))
		return false;
	if (normalized.includes('..')) return false;
	return true;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	// Must be authenticated
	const user = locals.user;
	if (!user) error(401, 'Unauthorized');

	const key = url.searchParams.get('key');
	const expires = url.searchParams.get('expires');
	const sig = url.searchParams.get('sig');

	if (!key) error(400, 'Missing parameters');

	// Validate path to prevent traversal attacks
	if (!isSafePath(key)) error(400, 'Invalid file key');

	// Check if this is an avatar (cover image) or a document
	const isAvatar = key.startsWith('avatars/');
	const isDoc = key.startsWith('files/');

	if (isDoc) {
		// Verify document belongs to current user
		const doc = await getDocumentByStorageKey(key);
		if (!doc || doc.user_id !== user.id) error(403, 'Access denied');
	} else if (isAvatar) {
		// Verify avatar belongs to a vehicle owned by the current user
		const vehicle = await getVehicleByCoverImageKey(key);
		if (!vehicle || vehicle.user_id !== user.id) error(403, 'Access denied');
	}

	// For signed URLs, verify the signature
	if (expires && sig) {
		const now = Math.floor(Date.now() / 1000);
		if (parseInt(expires) < now) error(410, 'Link expired');

		const secret = env.AUTH_SECRET ?? 'dev-secret';
		const expected = crypto.createHmac('sha256', secret).update(`${key}:${expires}`).digest('hex');

		if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
			error(403, 'Invalid signature');
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
			gif: 'image/gif'
		};
		const contentType = mimeMap[ext] ?? 'application/octet-stream';

		return new Response(stream as unknown as ReadableStream, {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'private, max-age=3600'
			}
		});
	} catch {
		error(404, 'File not found');
	}
};
