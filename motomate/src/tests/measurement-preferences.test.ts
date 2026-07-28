import { describe, expect, it } from 'vitest';
import { convertDistanceValue, resolveDistanceUnitPreference } from '$lib/utils/measurement.js';

describe('resolveDistanceUnitPreference', () => {
	it('preserves a valid user distance preference', () => {
		expect(resolveDistanceUnitPreference('mi')).toBe('mi');
		expect(resolveDistanceUnitPreference('km')).toBe('km');
	});

	it('falls back to kilometres for unsupported or missing values', () => {
		expect(resolveDistanceUnitPreference('h')).toBe('km');
		expect(resolveDistanceUnitPreference(undefined)).toBe('km');
	});
});

describe('convertDistanceValue', () => {
	it('converts whole-kilometre readings to whole miles', () => {
		expect(convertDistanceValue(1609, 'km', 'mi')).toBe(1000);
	});

	it('converts whole-mile readings to whole kilometres', () => {
		expect(convertDistanceValue(1000, 'mi', 'km')).toBe(1609);
	});
});
