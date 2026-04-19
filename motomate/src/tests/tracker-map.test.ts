import { describe, it, expect } from 'vitest';

type LogStub = { id: string; tracker_id: string | null; serviced_tracker_ids: string[] };

function buildTrackerMap(logs: LogStub[]) {
	const map = new Map<string, LogStub[]>();
	for (const log of logs) {
		const ids = new Set<string>();
		if (log.tracker_id) ids.add(log.tracker_id);
		for (const id of log.serviced_tracker_ids ?? []) ids.add(id);
		for (const id of ids) {
			if (!map.has(id)) map.set(id, []);
			map.get(id)!.push(log);
		}
	}
	return map;
}

describe('trackerServiceLogs map', () => {
	it('single-tracker entry appears under its tracker only', () => {
		const map = buildTrackerMap([{ id: 'log1', tracker_id: 'tr-a', serviced_tracker_ids: [] }]);
		expect(map.get('tr-a')).toHaveLength(1);
		expect(map.has('tr-b')).toBe(false);
	});

	it('multi-tracker entry appears under ALL selected trackers', () => {
		const map = buildTrackerMap([
			{ id: 'log1', tracker_id: 'tr-a', serviced_tracker_ids: ['tr-b', 'tr-c'] }
		]);
		expect(map.get('tr-a')).toHaveLength(1);
		expect(map.get('tr-b')).toHaveLength(1);
		expect(map.get('tr-c')).toHaveLength(1);
	});

	it('de-duplicates if primary appears in serviced_tracker_ids', () => {
		const map = buildTrackerMap([
			{ id: 'log1', tracker_id: 'tr-a', serviced_tracker_ids: ['tr-a', 'tr-b'] }
		]);
		expect(map.get('tr-a')).toHaveLength(1);
	});

	it('legacy entry with empty serviced_tracker_ids maps correctly', () => {
		const map = buildTrackerMap([{ id: 'log1', tracker_id: 'tr-a', serviced_tracker_ids: [] }]);
		expect(map.get('tr-a')).toHaveLength(1);
	});

	it('edit form pre-check: log shows as linked to all its trackers', () => {
		const log = { id: 'log1', tracker_id: 'tr-a', serviced_tracker_ids: ['tr-b'] };
		buildTrackerMap([log]);
		const isLinked = (trackerId: string) =>
			log.tracker_id === trackerId || log.serviced_tracker_ids.includes(trackerId);
		expect(isLinked('tr-a')).toBe(true);
		expect(isLinked('tr-b')).toBe(true);
		expect(isLinked('tr-c')).toBe(false);
	});
});
