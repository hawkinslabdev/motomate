import { describe, it, expect } from 'vitest';
import { favoriteFirst } from '#lib/utils/favorite.js';

describe('favoriteFirst', () => {
	const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

	it('moves the favourite to the front and keeps the rest in order', () => {
		expect(favoriteFirst(list, 'c').map((v) => v.id)).toEqual(['c', 'a', 'b']);
	});

	it('returns the list unchanged without a favourite', () => {
		expect(favoriteFirst(list, null)).toBe(list);
	});
});
