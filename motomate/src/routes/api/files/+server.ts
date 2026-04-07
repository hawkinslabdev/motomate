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

function corsError(status: number, message: string, origin: string): Response {
	return new Response(message, {
		status,
		headers: {
			'Access-Control-Allow-Origin': origin,
			'Access-Control-Allow-Credentials': 'true'
		}
	});
}

export const GET: RequestHandler = async ({ url, locals, request }) => {
	const origin = request.headers.get('origin') ?? '*';

	// Must be authenticated
	const user = locals.user;
	if (!user) {
		return new Response('Unauthorized', {
			status: 401,
			headers: {
				'Access-Control-Allow-Origin': origin,
				'Access-Control-Allow-Credentials': 'true'
			}
		});
	}

	const key = url.searchParams.get('key');
	const expires = url.searchParams.get('expires');
	const sig = url.searchParams.get('sig');

	if (!key) return corsError(400, 'Missing parameters', origin);

	// Validate path to prevent traversal attacks
	if (!isSafePath(key)) return corsError(400, 'Invalid file key', origin);

	// Check if this is an avatar (cover image) or a document
	const isAvatar = key.startsWith('avatars/');
	const isDoc = key.startsWith('files/');

	if (isDoc) {
		// Verify document belongs to current user
		const doc = await getDocumentByStorageKey(key);
		if (!doc || doc.user_id !== user.id) return corsError(403, 'Access denied', origin);
	} else if (isAvatar) {
		// Verify avatar belongs to a vehicle owned by the current user
		const vehicle = await getVehicleByCoverImageKey(key);
		if (!vehicle || vehicle.user_id !== user.id) return corsError(403, 'Access denied', origin);
	}

	// For signed URLs, verify the signature
	if (expires && sig) {
		const now = Math.floor(Date.now() / 1000);
		if (parseInt(expires) < now) return corsError(410, 'Link expired', origin);

		const secret = env.AUTH_SECRET ?? 'dev-secret';
		const expected = crypto.createHmac('sha256', secret).update(`${key}:${expires}`).digest('hex');

		if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
			return corsError(403, 'Invalid signature', origin);
		}
	}

	const adapter = getStorage();

	// Only local adapter serves files via this endpoint
	if (env.STORAGE_ADAPTER === 's3') return corsError(400, 'Use pre-signed S3 URL directly', origin);

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

		const origin = request.headers.get('origin');
		const corsOrigin = origin ?? '*';

		return new Response(stream as unknown as ReadableStream, {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'private, max-age=3600',
				'Access-Control-Allow-Origin': corsOrigin,
				'Access-Control-Allow-Credentials': 'true'
			}
		});
	} catch {
		return corsError(404, 'File not found', origin);
	}
};

export const OPTIONS: RequestHandler = async ({ request }) => {
	const origin = request.headers.get('origin') ?? '*';
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': origin,
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Credentials': 'true'
		}
	});
};
