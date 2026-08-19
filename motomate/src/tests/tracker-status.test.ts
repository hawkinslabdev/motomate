import { describe, expect, it } from 'vitest';
import { compareTrackerStatus } from '$lib/utils/tracker-status.js';

describe('compareTrackerStatus', () => {
	it('sorts overdue before due before ok', () => {
		const trackers = [{ status: 'ok' }, { status: 'overdue' }, { status: 'due' }];
		expect([...trackers].sort(compareTrackerStatus)).toEqual([
			{ status: 'overdue' },
			{ status: 'due' },
			{ status: 'ok' }
		]);
	});

	it('keeps unknown statuses last without throwing', () => {
		const trackers = [{ status: 'weird' }, { status: 'overdue' }];
		expect([...trackers].sort(compareTrackerStatus)).toEqual([
			{ status: 'overdue' },
			{ status: 'weird' }
		]);
	});

	it('preserves relative order for equal-status trackers', () => {
		const trackers = [
			{ status: 'due', id: 'a' },
			{ status: 'due', id: 'b' }
		];
		expect([...trackers].sort(compareTrackerStatus)).toEqual([
			{ status: 'due', id: 'a' },
			{ status: 'due', id: 'b' }
		]);
	});
});
