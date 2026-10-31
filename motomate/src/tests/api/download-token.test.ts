import { vi, describe, it, expect } from 'vitest';

vi.mock(
	'$app/env/private',
	() => new Proxy({ AUTH_SECRET: 'test-secret-32-chars-minimum-ok!' }, { has: () => true })
);

import {
	createDownloadToken,
	verifyDownloadToken,
	tokenExpiresAt
} from '#lib/server/download-token.js';

const USER_ID = 'u_test';

describe('createDownloadToken()', () => {
	it('returns a dot-separated token', () => {
		const token = createDownloadToken(USER_ID, 'json');
		expect(token.split('.')).toHaveLength(2);
	});

	it('encodes userId, format, and expiry in payload', () => {
		const token = createDownloadToken(USER_ID, 'zip');
		const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
		expect(payload.uid).toBe(USER_ID);
		expect(payload.fmt).toBe('zip');
		expect(payload.exp).toBeGreaterThan(Date.now());
	});
});

describe('verifyDownloadToken()', () => {
	it('returns payload for a valid token', () => {
		const token = createDownloadToken(USER_ID, 'json');
		const payload = verifyDownloadToken(token);
		expect(payload).not.toBeNull();
		expect(payload!.uid).toBe(USER_ID);
		expect(payload!.fmt).toBe('json');
	});

	it('returns null for tampered signature', () => {
		const token = createDownloadToken(USER_ID, 'json');
		const [payload] = token.split('.');
		expect(verifyDownloadToken(`${payload}.deadbeef00000000000000000000000a`)).toBeNull();
	});

	it('returns null for tampered payload', () => {
		const token = createDownloadToken(USER_ID, 'json');
		const [, sig] = token.split('.');
		const fakePayload = Buffer.from(
			JSON.stringify({ uid: 'attacker', fmt: 'json', exp: Date.now() + 99999 })
		).toString('base64url');
		expect(verifyDownloadToken(`${fakePayload}.${sig}`)).toBeNull();
	});

	it('returns null for malformed token (no dot)', () => {
		expect(verifyDownloadToken('nodothere')).toBeNull();
	});

	it('returns null for empty string', () => {
		expect(verifyDownloadToken('')).toBeNull();
	});

	it('returns null for expired token', () => {
		vi.useFakeTimers();
		const token = createDownloadToken(USER_ID, 'json');
		vi.advanceTimersByTime(16 * 60 * 1000);
		expect(verifyDownloadToken(token)).toBeNull();
		vi.useRealTimers();
	});

	it('returns payload when token is not yet expired', () => {
		vi.useFakeTimers();
		const token = createDownloadToken(USER_ID, 'json');
		vi.advanceTimersByTime(14 * 60 * 1000);
		expect(verifyDownloadToken(token)).not.toBeNull();
		vi.useRealTimers();
	});
});

describe('tokenExpiresAt()', () => {
	it('returns an ISO datetime string', () => {
		const token = createDownloadToken(USER_ID, 'json');
		const exp = tokenExpiresAt(token);
		expect(exp).not.toBeNull();
		expect(() => new Date(exp!)).not.toThrow();
		expect(new Date(exp!).getTime()).toBeGreaterThan(Date.now());
	});

	it('returns null for malformed token', () => {
		expect(tokenExpiresAt('badtoken')).toBeNull();
	});

	it('expiry is ~15 minutes from now', () => {
		const before = Date.now();
		const token = createDownloadToken(USER_ID, 'json');
		const exp = new Date(tokenExpiresAt(token)!).getTime();
		expect(exp - before).toBeGreaterThanOrEqual(14 * 60 * 1000);
		expect(exp - before).toBeLessThanOrEqual(16 * 60 * 1000);
	});
});
