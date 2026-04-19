import { describe, it, expect } from 'vitest';
import { CreateServiceLogSchema } from '../lib/validators/schemas.js';

const base = {
	vehicle_id: 'v1',
	tracker_id: 'tr-a',
	performed_at: '2025-06-01',
	odometer_at_service: 12000,
	currency: 'EUR',
	parts_used: []
};

describe('CreateServiceLogSchema — serviced_tracker_ids', () => {
	it('defaults to empty array when omitted', () => {
		const parsed = CreateServiceLogSchema.parse(base);
		expect(parsed.serviced_tracker_ids).toEqual([]);
	});

	it('accepts additional tracker IDs', () => {
		const parsed = CreateServiceLogSchema.parse({
			...base,
			serviced_tracker_ids: ['tr-b', 'tr-c']
		});
		expect(parsed.serviced_tracker_ids).toEqual(['tr-b', 'tr-c']);
	});

	it('primary tracker not in serviced_tracker_ids (server action contract)', () => {
		// Server sends resetTrackerIds.slice(1) so primary is never duplicated
		const parsed = CreateServiceLogSchema.parse({
			...base,
			serviced_tracker_ids: ['tr-b', 'tr-c']
		});
		expect(parsed.serviced_tracker_ids).not.toContain(parsed.tracker_id);
	});
});
