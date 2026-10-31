import { describe, it, expect } from 'vitest';
import { assertSafeUrl } from '#lib/server/url-guard.js';

// IP literals only, so nothing here touches the network.
describe('assertSafeUrl', () => {
	it.each(['file:///etc/passwd', 'gopher://127.0.0.1:70/', 'ftp://example.test/x'])(
		'rejects %s',
		async (url) => {
			await expect(assertSafeUrl(url)).rejects.toThrow('http or https');
		}
	);

	it('rejects the cloud metadata address', async () => {
		await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
			'link-local'
		);
	});

	it('rejects IPv6 link-local', async () => {
		await expect(assertSafeUrl('http://[fe80::1]/')).rejects.toThrow('link-local');
	});

	// The homelab case: blocking these would break existing webhook and paperless configs.
	it.each([
		'http://192.168.1.50:8123/api/webhook/abc',
		'http://10.0.0.5/',
		'http://172.16.4.4:8000/',
		'http://127.0.0.1:8000/',
		'https://8.8.8.8/'
	])('allows %s', async (url) => {
		await expect(assertSafeUrl(url)).resolves.toBeInstanceOf(URL);
	});
});
