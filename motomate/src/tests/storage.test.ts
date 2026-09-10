import { describe, it, expect } from 'vitest';
import { attachmentStorageKey, downloadFilename } from '$lib/utils/storage.js';

describe('attachmentStorageKey', () => {
	it('namespaces the key by user and vehicle', () => {
		const key = attachmentStorageKey('u1', 'v1', 'invoice.pdf');
		expect(key).toMatch(/^files\/u1\/v1\/[a-zA-Z0-9]+\.pdf$/);
	});

	it('keeps two different vehicles from sharing a key prefix', () => {
		const a = attachmentStorageKey('u1', 'v1', 'invoice.pdf');
		const b = attachmentStorageKey('u1', 'v2', 'invoice.pdf');
		expect(a.split('/')[2]).toBe('v1');
		expect(b.split('/')[2]).toBe('v2');
	});

	it('uses the whole filename as the extension when there is no dot', () => {
		const key = attachmentStorageKey('u1', 'v1', 'README');
		expect(key).toMatch(/^files\/u1\/v1\/[a-zA-Z0-9]+\.README$/);
	});

	it('strips path separators and dots out of the extension instead of passing them through', () => {
		const key = attachmentStorageKey('u1', 'v1', 'invoice.pdf/../../etc/passwd');
		expect(key).toMatch(/^files\/u1\/v1\/[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/);
		expect(key).not.toContain('..');
		expect(key.split('/')).toHaveLength(4);
	});

	it('generates a fresh random id per call, so re-uploading the same filename never collides', () => {
		const a = attachmentStorageKey('u1', 'v1', 'invoice.pdf');
		const b = attachmentStorageKey('u1', 'v1', 'invoice.pdf');
		expect(a).not.toBe(b);
	});
});

describe('downloadFilename', () => {
	it('serves the renamed title instead of the original upload name', () => {
		expect(downloadFilename('image.png', 'invoice.png')).toBe('invoice.png');
	});

	it('keeps the original extension when the rider drops it', () => {
		expect(downloadFilename('image.png', 'invoice')).toBe('invoice.png');
	});

	it('falls back to the original name when there is no title', () => {
		expect(downloadFilename('image.png', null)).toBe('image.png');
		expect(downloadFilename('image.png', '   ')).toBe('image.png');
	});

	it('strips path separators and control characters out of the header value', () => {
		const out = downloadFilename('image.png', 'a/b\\c\r\nX');
		expect(out).not.toMatch(/[\\/\r\n]/);
	});

	it('leaves an extensionless upload extensionless', () => {
		expect(downloadFilename('README', 'notes')).toBe('notes');
	});
});
