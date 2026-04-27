import { describe, expect, it, vi, afterEach } from 'vitest';
import { nextCalendarOccurrence } from '../lib/workflow/preview-core.js';

afterEach(() => {
	vi.useRealTimers();
});

describe('workflow settings preview', () => {
	it('keeps calendar occurrences on the current day instead of skipping to next year', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-21T12:00:00Z'));

		const result = nextCalendarOccurrence(4, 21);
		expect(result.getFullYear()).toBe(2026);
		expect(result.getMonth() + 1).toBe(4);
		expect(result.getDate()).toBe(21);
	});

	it('advances calendar occurrences to next year only when the day is already past', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-22T12:00:00Z'));

		const result = nextCalendarOccurrence(4, 21);
		expect(result.getFullYear()).toBe(2027);
		expect(result.getMonth() + 1).toBe(4);
		expect(result.getDate()).toBe(21);
	});
});
