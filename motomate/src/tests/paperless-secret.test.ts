import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: { INTEGRATION_ENCRYPTION_KEY: '11'.repeat(32) }
}));

import { decryptPaperlessToken, encryptPaperlessToken } from '$lib/server/paperless/secret.js';

describe('Paperless integration token encryption', () => {
	it('round trips without storing the plaintext', () => {
		const encrypted = encryptPaperlessToken('paperless-token');
		expect(encrypted).not.toContain('paperless-token');
		expect(encrypted.startsWith('v1.')).toBe(true);
		expect(decryptPaperlessToken(encrypted)).toBe('paperless-token');
	});

	it('uses a fresh nonce for each encryption', () => {
		expect(encryptPaperlessToken('same-token')).not.toBe(encryptPaperlessToken('same-token'));
	});

	it('rejects tampered ciphertext', () => {
		const encrypted = encryptPaperlessToken('paperless-token');
		expect(() => decryptPaperlessToken(`${encrypted.slice(0, -1)}A`)).toThrow(
			'Unable to decrypt integration token'
		);
	});
});
