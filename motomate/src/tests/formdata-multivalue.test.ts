import { describe, it, expect } from 'vitest';

describe('FormData multi-checkbox reading', () => {
	it('Object.fromEntries drops duplicate keys — the original bug', () => {
		const fd = new FormData();
		fd.append('reset_trackers', 'tracker-a');
		fd.append('reset_trackers', 'tracker-b');
		fd.append('reset_trackers', 'tracker-c');
		const raw = Object.fromEntries(fd);
		expect(raw.reset_trackers).toBe('tracker-c');
	});

	it('getAll() captures all values — the fix', () => {
		const fd = new FormData();
		fd.append('reset_trackers', 'tracker-a');
		fd.append('reset_trackers', 'tracker-b');
		fd.append('reset_trackers', 'tracker-c');
		const ids = fd.getAll('reset_trackers').map(String).filter(Boolean);
		expect(ids).toEqual(['tracker-a', 'tracker-b', 'tracker-c']);
	});

	it('single checked tracker still works', () => {
		const fd = new FormData();
		fd.append('reset_trackers', 'tracker-only');
		const ids = fd.getAll('reset_trackers').map(String).filter(Boolean);
		expect(ids).toHaveLength(1);
		expect(ids[0]).toBe('tracker-only');
	});

	it('no checked trackers returns empty array', () => {
		const ids = new FormData().getAll('reset_trackers').map(String).filter(Boolean);
		expect(ids).toEqual([]);
	});
});
