import { describe, expect, it, vi } from 'vitest';
import { PaperlessClient } from '$lib/server/paperless/client.js';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json', ...init.headers },
		...init
	});
}

describe('PaperlessClient', () => {
	it('normalizes the base URL and authenticates with a token', async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
			jsonResponse({ count: 0, next: null, previous: null, results: [] })
		);
		const client = new PaperlessClient({
			baseUrl: 'https://paperless.example.test/',
			token: 'secret-token',
			fetch: fetchMock
		});

		await client.searchDocuments({ query: 'invoice', page: 2, pageSize: 20 });

		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toContain('/api/documents/?');
		expect(String(url)).toContain('query=invoice');
		expect(String(url)).toContain('page=2');
		expect(new Headers(init?.headers).get('authorization')).toBe('Token secret-token');
	});

	it('returns server compatibility headers when testing a connection', async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
			jsonResponse(
				{ count: 0, next: null, previous: null, results: [] },
				{ headers: { 'x-api-version': '9', 'x-version': '2.18.0' } }
			)
		);
		const client = new PaperlessClient({
			baseUrl: 'https://paperless.example.test',
			token: 'token',
			fetch: fetchMock
		});

		await expect(client.testConnection()).resolves.toEqual({
			apiVersion: '9',
			serverVersion: '2.18.0'
		});
	});

	it('uploads multipart content and returns the asynchronous task ID', async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
			jsonResponse('task-uuid')
		);
		const client = new PaperlessClient({
			baseUrl: 'https://paperless.example.test',
			token: 'token',
			fetch: fetchMock
		});

		const taskId = await client.uploadDocument({
			data: new Blob(['document'], { type: 'text/plain' }),
			filename: 'receipt.txt',
			title: 'Receipt'
		});

		expect(taskId).toBe('task-uuid');
		const [, init] = fetchMock.mock.calls[0];
		expect(init?.method).toBe('POST');
		expect(init?.body).toBeInstanceOf(FormData);
	});

	it('downloads documents with an Accept header Paperless supports', async () => {
		const fetchMock = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response('document', {
					status: 200,
					headers: { 'content-type': 'application/pdf', 'content-length': '8' }
				})
		);
		const client = new PaperlessClient({
			baseUrl: 'https://paperless.example.test',
			token: 'token',
			fetch: fetchMock
		});

		await expect(client.downloadDocument(42)).resolves.toMatchObject({
			contentType: 'application/pdf'
		});
		const [, init] = fetchMock.mock.calls[0];
		expect(new Headers(init?.headers).get('accept')).toBe('*/*');
	});

	it('reads document size from the download HEAD response', async () => {
		const fetchMock = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response(null, {
					status: 200,
					headers: { 'content-type': 'application/pdf', 'content-length': '455972' }
				})
		);
		const client = new PaperlessClient({
			baseUrl: 'https://paperless.example.test',
			token: 'token',
			fetch: fetchMock
		});

		await expect(client.getDocumentDownloadMetadata(42)).resolves.toEqual({
			contentType: 'application/pdf',
			sizeBytes: 455972
		});
		const [, init] = fetchMock.mock.calls[0];
		expect(init?.method).toBe('HEAD');
		expect(new Headers(init?.headers).get('accept')).toBe('*/*');
	});

	it('downloads Paperless-generated thumbnails as binary content', async () => {
		const fetchMock = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response(new Uint8Array([82, 73, 70, 70]), {
					status: 200,
					headers: { 'content-type': 'image/webp' }
				})
		);
		const client = new PaperlessClient({
			baseUrl: 'https://paperless.example.test',
			token: 'token',
			fetch: fetchMock
		});

		await expect(client.getDocumentThumbnail(42)).resolves.toMatchObject({
			contentType: 'image/webp'
		});
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toContain('/api/documents/42/thumb/');
		expect(new Headers(init?.headers).get('accept')).toBe('*/*');
	});

	it('surfaces bounded Paperless error details', async () => {
		const fetchMock = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response('Invalid token', { status: 403 })
		);
		const client = new PaperlessClient({
			baseUrl: 'https://paperless.example.test',
			token: 'token',
			fetch: fetchMock
		});

		await expect(client.testConnection()).rejects.toThrow(
			'Paperless request failed (403): Invalid token'
		);
	});

	it('rejects URLs containing embedded credentials', () => {
		expect(
			() =>
				new PaperlessClient({
					baseUrl: 'https://user:pass@paperless.example.test',
					token: 'token'
				})
		).toThrow('cannot contain credentials');
	});
});
