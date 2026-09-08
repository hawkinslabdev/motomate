import { describe, it, expect } from 'vitest';
import { isResetWindowOpen } from '$lib/auth/password-reset.js';

describe('isResetWindowOpen', () => {
	it('is closed when no magic link was consumed', () => {
		expect(isResetWindowOpen(undefined)).toBe(false);
		expect(isResetWindowOpen(null)).toBe(false);
	});

	it('is open inside the window', () => {
		expect(isResetWindowOpen(new Date(Date.now() + 60_000).toISOString())).toBe(true);
	});

	it('is closed once the window has passed', () => {
		expect(isResetWindowOpen(new Date(Date.now() - 60_000).toISOString())).toBe(false);
	});
});
