import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock(
	'$app/env/private',
	() => new Proxy({ AUTH_SECRET: 'test-secret-32-chars-minimum-ok!' }, { has: () => true })
);
vi.mock('$app/env/public', () => new Proxy({ PUBLIC_DEMO_ENABLED: 'false' }, { has: () => true }));
vi.mock('#lib/storage/index.js', () => ({ getStorage: vi.fn() }));
vi.mock('#lib/db/repositories/documents.js', () => ({ getDocumentByStorageKey: vi.fn() }));
vi.mock('#lib/db/repositories/vehicles.js', () => ({ getVehicleByCoverImageKey: vi.fn() }));

import { GET } from '../../routes/api/files/+server.js';
import { getStorage } from '#lib/storage/index.js';
import { getDocumentByStorageKey } from '#lib/db/repositories/documents.js';
import { getVehicleByCoverImageKey } from '#lib/db/repositories/vehicles.js';

const DOC_KEY = 'files/u1/doc1.pdf';
const VEHICLE_NAMESPACED_DOC_KEY = 'files/u1/v1/doc1.pdf';
const AVATAR_KEY = 'avatars/u1/v1.png';
const mockUser = { id: 'u1' } as any;

function serveBytes(bytes: string) {
	vi.mocked(getStorage).mockReturnValue({ getBuffer: async () => Buffer.from(bytes) } as any);
}

function event(key: string, headers: Record<string, string> = {}) {
	return {
		locals: { user: mockUser },
		url: new URL(`http://localhost/api/files?key=${encodeURIComponent(key)}`),
		request: new Request('http://localhost', { headers })
	} as any;
}

beforeEach(() => {
	serveBytes('hello');
	vi.mocked(getDocumentByStorageKey).mockResolvedValue({
		user_id: 'u1',
		name: 'invoice.pdf'
	} as any);
	vi.mocked(getVehicleByCoverImageKey).mockResolvedValue({ id: 'v1' } as any);
});

describe('key format', () => {
	it('accepts a document key from before vehicle-namespacing (files/{user}/{id}.{ext})', async () => {
		const res = await GET(event(DOC_KEY));
		expect(res.status).toBe(200);
	});

	it('accepts a vehicle-namespaced document key (files/{user}/{vehicle}/{id}.{ext})', async () => {
		const res = await GET(event(VEHICLE_NAMESPACED_DOC_KEY));
		expect(res.status).toBe(200);
	});

	it('rejects a key with more segments than either shape allows', async () => {
		await expect(GET(event('files/u1/v1/extra/doc1.pdf'))).rejects.toMatchObject({
			status: 400
		});
	});

	it('rejects path traversal even inside an otherwise valid-looking key', async () => {
		await expect(GET(event('files/u1/../../etc/passwd'))).rejects.toMatchObject({ status: 400 });
	});
});

describe('cache policy', () => {
	it('caches documents forever: their storage key is unique per upload', async () => {
		const res = await GET(event(DOC_KEY));
		expect(res.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
	});

	it('forces revalidation of avatars: their storage key is reused on re-upload', async () => {
		const res = await GET(event(AVATAR_KEY));
		expect(res.headers.get('Cache-Control')).toBe('private, no-cache');
	});
});

describe('ETag', () => {
	it('returns 304 with no body when the client tag still matches', async () => {
		const etag = (await GET(event(AVATAR_KEY))).headers.get('ETag')!;
		expect(etag).toBeTruthy();

		const res = await GET(event(AVATAR_KEY, { 'if-none-match': etag }));
		expect(res.status).toBe(304);
		expect(await res.text()).toBe('');
	});

	it('changes when the bytes change, so a re-uploaded avatar is never served stale', async () => {
		const before = (await GET(event(AVATAR_KEY))).headers.get('ETag');

		serveBytes('different image bytes');
		const after = await GET(event(AVATAR_KEY, { 'if-none-match': before! }));

		expect(after.status).toBe(200);
		expect(after.headers.get('ETag')).not.toBe(before);
	});

	it('changes when only the download filename changes', async () => {
		const before = (await GET(event(DOC_KEY))).headers.get('ETag');

		vi.mocked(getDocumentByStorageKey).mockResolvedValue({
			user_id: 'u1',
			name: 'renamed.pdf'
		} as any);
		const after = await GET(event(DOC_KEY, { 'if-none-match': before! }));

		expect(after.status).toBe(200);
		expect(after.headers.get('Content-Disposition')).toContain('renamed.pdf');
	});
});
