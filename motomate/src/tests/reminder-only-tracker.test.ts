import { describe, it, expect } from 'vitest';
import { isReminderTracker } from '#lib/utils/reminder-only.js';

describe('isReminderTracker', () => {
	it('returns true for reminder_only tracker', () => {
		expect(isReminderTracker({ reminder_only: true })).toBe(true);
	});

	it('returns false for normal tracker', () => {
		expect(isReminderTracker({ reminder_only: false })).toBe(false);
	});

	it('returns false when reminder_only is undefined', () => {
		expect(isReminderTracker({})).toBe(false);
	});

	it('returns false when reminder_only is null', () => {
		expect(isReminderTracker({ reminder_only: null })).toBe(false);
	});
});
