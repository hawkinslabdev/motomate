import { describe, expect, it } from 'vitest';
import {
	AVATAR_STYLES,
	dicebearUri,
	isValidAvatarSeed,
	parseAvatarSeed,
	randomAvatarSeed
} from '#lib/utils/dicebear.js';

describe('avatar seeds', () => {
	it('reads a bare seed from before styles as fun-emoji', () => {
		expect(parseAvatarSeed('abc123')).toEqual({ style: 'fun-emoji', seed: 'abc123' });
	});

	it('splits a styled seed', () => {
		expect(parseAvatarSeed('clay:abc123')).toEqual({ style: 'clay', seed: 'abc123' });
	});

	it('rejects unknown or prototype style prefixes', () => {
		expect(isValidAvatarSeed('abc123')).toBe(true);
		expect(isValidAvatarSeed('sprouts:abc')).toBe(true);
		expect(isValidAvatarSeed('nope:abc')).toBe(false);
		expect(isValidAvatarSeed('constructor:abc')).toBe(false);
		expect(isValidAvatarSeed('__proto__:abc')).toBe(false);
	});

	it('renders every style', async () => {
		for (const style of AVATAR_STYLES) {
			expect(await dicebearUri(`${style}:x`)).toMatch(/^data:image\/svg\+xml/);
		}
		expect(isValidAvatarSeed(randomAvatarSeed())).toBe(true);
	});
});
