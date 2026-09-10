import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { AUTH_SECRET: 'x'.repeat(32) } }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/storage/index.js', () => ({ getStorage: vi.fn() }));
vi.mock('$lib/db/repositories/documents.js', () => ({ getDocumentByStorageKey: vi.fn() }));
vi.mock('$lib/db/repositories/vehicles.js', () => ({ getVehicleByCoverImageKey: vi.fn() }));

import { GET } from '../routes/api/files/+server.js';
import { getStorage } from '$lib/storage/index.js';
import { getDocumentByStorageKey } from '$lib/db/repositories/documents.js';

const USER = 'u1';

function event(key: string, extra = '') {
	const url = new URL(`http://localhost/api/files?key=${encodeURIComponent(key)}${extra}`);
	return {
		url,
		locals: { user: { id: USER } },
		request: new Request(url)
	} as never;
}

async function serve(key: string, extra = '') {
	return (await GET(event(key, extra))) as Response;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(getStorage).mockReturnValue({
		getBuffer: async () => Buffer.from('bytes')
	} as never);
	vi.mocked(getDocumentByStorageKey).mockImplementation(
		async (key: string) => ({ user_id: USER, name: key.split('/').pop(), title: null }) as never
	);
});

describe('inline preview', () => {
	it.each([
		['pdf', 'application/pdf'],
		['jpg', 'image/jpeg'],
		['png', 'image/png'],
		['webp', 'image/webp'],
		['gif', 'image/gif'],
		['avif', 'image/avif'],
		['heic', 'image/heic'],
		['tiff', 'image/tiff'],
		['txt', 'text/plain; charset=utf-8']
	])('serves .%s inline as %s', async (ext, type) => {
		const res = await serve(`files/${USER}/v1/doc.${ext}`);
		expect(res.headers.get('Content-Type')).toBe(type);
		expect(res.headers.get('Content-Disposition')).toMatch(/^inline;/);
		expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});

	it.each([
		['svg', 'image/svg+xml'],
		['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
		['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
		['gpx', 'application/gpx+xml'],
		['bin', 'application/octet-stream']
	])('keeps .%s a download', async (ext, type) => {
		const res = await serve(`files/${USER}/v1/doc.${ext}`);
		expect(res.headers.get('Content-Type')).toBe(type);
		expect(res.headers.get('Content-Disposition')).toMatch(/^attachment/);
	});

	it('forces a download when asked', async () => {
		const res = await serve(`files/${USER}/v1/doc.pdf`, '&download=1');
		expect(res.headers.get('Content-Disposition')).toMatch(/^attachment;/);
	});

	it('gives an unnamed svg avatar an attachment disposition', async () => {
		const res = await serve(`avatars/users/${USER}.svg`);
		expect(res.headers.get('Content-Disposition')).toBe('attachment');
	});

	it('rejects an unauthenticated request, signed or not', async () => {
		const url = new URL(
			`http://localhost/api/files?key=files/${USER}/v1/doc.pdf&expires=99999999999&sig=deadbeef`
		);
		const anon = { url, locals: { user: null }, request: new Request(url) } as never;
		await expect(GET(anon)).rejects.toMatchObject({ status: 401 });
	});

	it('varies the etag by disposition so a cached download is not reused inline', async () => {
		const inline = await serve(`files/${USER}/v1/doc.pdf`);
		const download = await serve(`files/${USER}/v1/doc.pdf`, '&download=1');
		expect(inline.headers.get('ETag')).not.toBe(download.headers.get('ETag'));
	});
});
