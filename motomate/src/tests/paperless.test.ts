import { vi, describe, it, expect, afterEach } from 'vitest';
import {
	paperlessResolveTag,
	paperlessResolveCorrespondent,
	paperlessPost
} from '#lib/server/paperless.js';

// IP literal so assertSafeUrl's dns.lookup resolves without touching the network (see url-guard.test.ts).
const cfg = { url: 'http://127.0.0.1:8123', token: 'tok' };

function jsonResponse(body: unknown, status = 200): Response {
	return { ok: status < 400, status, json: async () => body, text: async () => '' } as Response;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('paperlessResolveTag', () => {
	it('reuses an existing tag instead of creating a duplicate', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				jsonResponse({ results: [{ id: 7, name: 'reuse-test-vehicle-Ducati Monster' }] })
			);
		vi.stubGlobal('fetch', fetchMock);

		const id = await paperlessResolveTag(cfg, 'reuse-test-vehicle-Ducati Monster');

		expect(id).toBe(7);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toContain('/api/tags/?name__iexact=');
	});

	it('creates a tag when no match exists', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ results: [] }))
			.mockResolvedValueOnce(jsonResponse({ id: 42, name: 'Vespa Primavera' }));
		vi.stubGlobal('fetch', fetchMock);

		const id = await paperlessResolveTag(cfg, 'create-test-vehicle-Vespa Primavera');

		expect(id).toBe(42);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const [createUrl, createInit] = fetchMock.mock.calls[1];
		expect(createUrl).toContain('/api/tags/');
		expect(createInit.method).toBe('POST');
		expect(JSON.parse(createInit.body)).toEqual({ name: 'create-test-vehicle-Vespa Primavera' });
	});

	it('caches the resolved id so a second lookup for the same vehicle skips the network', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse({ results: [{ id: 3, name: 'cache-test-vehicle' }] }));
		vi.stubGlobal('fetch', fetchMock);

		const first = await paperlessResolveTag(cfg, 'cache-test-vehicle');
		const second = await paperlessResolveTag(cfg, 'cache-test-vehicle');

		expect(first).toBe(3);
		expect(second).toBe(3);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe('paperlessResolveCorrespondent', () => {
	it('reuses an existing correspondent instead of creating a duplicate', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse({ results: [{ id: 11, name: 'reuse-test-MotoMate' }] }));
		vi.stubGlobal('fetch', fetchMock);

		const id = await paperlessResolveCorrespondent(cfg, 'reuse-test-MotoMate');

		expect(id).toBe(11);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toContain('/api/correspondents/?name__iexact=');
	});

	it('creates a correspondent when no match exists', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ results: [] }))
			.mockResolvedValueOnce(jsonResponse({ id: 99, name: 'create-test-MotoMate' }));
		vi.stubGlobal('fetch', fetchMock);

		const id = await paperlessResolveCorrespondent(cfg, 'create-test-MotoMate');

		expect(id).toBe(99);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const [createUrl, createInit] = fetchMock.mock.calls[1];
		expect(createUrl).toContain('/api/correspondents/');
		expect(createInit.method).toBe('POST');
		expect(JSON.parse(createInit.body)).toEqual({ name: 'create-test-MotoMate' });
	});

	// A tag and a correspondent can share the exact same name ("MotoMate") without colliding,
	// since the cache and the lookup URL are keyed by resource type as well as name.
	it('does not collide with a tag of the same name', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ results: [{ id: 1, name: 'shared-name-test' }] }))
			.mockResolvedValueOnce(jsonResponse({ results: [{ id: 2, name: 'shared-name-test' }] }));
		vi.stubGlobal('fetch', fetchMock);

		const tagId = await paperlessResolveTag(cfg, 'shared-name-test');
		const correspondentId = await paperlessResolveCorrespondent(cfg, 'shared-name-test');

		expect(tagId).toBe(1);
		expect(correspondentId).toBe(2);
	});
});

describe('paperlessPost', () => {
	it('sends one tags form field per tag id alongside the document', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => '"task-id"'
		} as Response);
		vi.stubGlobal('fetch', fetchMock);

		await paperlessPost(cfg, {
			buffer: Buffer.from('x'),
			filename: 'a.pdf',
			mime: 'application/pdf',
			tags: [1, 2]
		});

		const form = fetchMock.mock.calls[0][1].body as FormData;
		expect(form.getAll('tags')).toEqual(['1', '2']);
	});

	it('sends a single correspondent form field when present', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => '"task-id"'
		} as Response);
		vi.stubGlobal('fetch', fetchMock);

		await paperlessPost(cfg, {
			buffer: Buffer.from('x'),
			filename: 'a.pdf',
			mime: 'application/pdf',
			correspondent: 5
		});

		const form = fetchMock.mock.calls[0][1].body as FormData;
		expect(form.get('correspondent')).toBe('5');
	});
});
