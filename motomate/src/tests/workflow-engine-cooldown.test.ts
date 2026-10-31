import { describe, expect, it } from 'vitest';
import {
	getCooldownHours,
	parseFiredAtMap,
	cooldownKey,
	lastFiredAt,
	isQuietHour
} from '#lib/workflow/engine-utils.js';

function hoursAgo(h: number): string {
	return new Date(Date.now() - h * 3_600_000).toISOString();
}

function daysAgo(d: number): string {
	return new Date(Date.now() - d * 86_400_000).toISOString();
}

function isOnCooldown(lastFiredAt: string | undefined, cooldownHours: number): boolean {
	if (!lastFiredAt) return false;
	return (Date.now() - new Date(lastFiredAt).getTime()) / 3_600_000 < cooldownHours;
}

describe('no daily spam', () => {
	it('odometer nudge with a 7-day interval waits the full 7 days before firing again', () => {
		const cooldown = getCooldownHours({ type: 'no_odometer_update', days: 7 });
		expect(cooldown).toBe(168);

		const firedYesterday = hoursAgo(23);
		expect(isOnCooldown(firedYesterday, cooldown)).toBe(true);

		const firedEightDaysAgo = daysAgo(8);
		expect(isOnCooldown(firedEightDaysAgo, cooldown)).toBe(false);
	});

	it('odometer nudge with a 30-day interval waits 30 days', () => {
		const cooldown = getCooldownHours({ type: 'no_odometer_update', days: 30 });
		expect(cooldown).toBe(720);
	});

	it('document expiry caps repeat notifications at once per 7 days regardless of window length', () => {
		const shortWindow = getCooldownHours({ type: 'document_expiring', days_before: 5 });
		const longWindow = getCooldownHours({ type: 'document_expiring', days_before: 30 });
		expect(shortWindow).toBe(120);
		expect(longWindow).toBe(168);
	});

	it('calendar date and other triggers use a 23-hour cooldown to prevent double-fire on same day', () => {
		const calendar = getCooldownHours({ type: 'calendar_date', month: 6, day: 11 });
		const upcoming = getCooldownHours({ type: 'odometer_upcoming', km_before: 500 });
		const overdue = getCooldownHours({ type: 'date_overdue', days_past: 0 });
		expect(calendar).toBe(23);
		expect(upcoming).toBe(23);
		expect(overdue).toBe(23);
	});
});

describe('per-vehicle isolation', () => {
	it('a vehicle that already fired does not block a different vehicle from firing', () => {
		const vehicleA = 'vehicle-a';
		const vehicleB = 'vehicle-b';
		const cooldown = getCooldownHours({ type: 'no_odometer_update', days: 7 });

		const map = parseFiredAtMap(JSON.stringify({ [vehicleA]: hoursAgo(1) }));

		const keyA = cooldownKey(vehicleA);
		const keyB = cooldownKey(vehicleB);

		expect(isOnCooldown(map[keyA], cooldown)).toBe(true);
		expect(isOnCooldown(map[keyB], cooldown)).toBe(false);
	});

	it('each vehicle tracks its own last-fired time independently', () => {
		const vehicleA = 'vehicle-a';
		const vehicleB = 'vehicle-b';
		const cooldown = getCooldownHours({ type: 'no_odometer_update', days: 7 });

		const map = parseFiredAtMap(
			JSON.stringify({
				[vehicleA]: hoursAgo(2),
				[vehicleB]: daysAgo(8)
			})
		);

		expect(isOnCooldown(map[cooldownKey(vehicleA)], cooldown)).toBe(true);
		expect(isOnCooldown(map[cooldownKey(vehicleB)], cooldown)).toBe(false);
	});
});

describe('per-document isolation', () => {
	it('two expiring documents on the same vehicle each get their own notification', () => {
		const vehicleId = 'vehicle-a';
		const doc1 = 'doc-insurance';
		const doc2 = 'doc-registration';

		const key1 = cooldownKey(vehicleId, doc1);
		const key2 = cooldownKey(vehicleId, doc2);

		expect(key1).not.toBe(key2);

		const cooldown = getCooldownHours({ type: 'document_expiring', days_before: 30 });
		const map = parseFiredAtMap(JSON.stringify({ [key1]: hoursAgo(1) }));

		expect(isOnCooldown(map[key1], cooldown)).toBe(true);
		expect(isOnCooldown(map[key2], cooldown)).toBe(false);
	});

	it('the same document is correctly blocked within its cooldown window', () => {
		const key = cooldownKey('vehicle-a', 'doc-insurance');
		const cooldown = getCooldownHours({ type: 'document_expiring', days_before: 30 });
		const map = parseFiredAtMap(JSON.stringify({ [key]: hoursAgo(12) }));
		expect(isOnCooldown(map[key], cooldown)).toBe(true);
	});
});

describe('legacy format migration', () => {
	it('treats a plain ISO timestamp as no prior state so existing rules fire once to re-establish', () => {
		const legacy = '2026-05-16T12:58:52.332Z';
		const map = parseFiredAtMap(legacy);
		expect(map).toEqual({});
	});

	it('returns an empty map when last_triggered_at has never been set', () => {
		expect(parseFiredAtMap(null)).toEqual({});
	});

	it('handles corrupt stored values without throwing', () => {
		expect(() => parseFiredAtMap('not json at all')).not.toThrow();
		expect(parseFiredAtMap('not json at all')).toEqual({});
	});
});

describe('staleness decision', () => {
	it('considers a vehicle stale when the last odometer log exceeds the configured days', () => {
		const days = 7;
		const cutoff = new Date(Date.now() - days * 86_400_000);
		const lastLogged = daysAgo(8);
		expect(new Date(lastLogged) < cutoff).toBe(true);
	});

	it('does not consider a vehicle stale when the last log is within the window', () => {
		const days = 7;
		const cutoff = new Date(Date.now() - days * 86_400_000);
		const lastLogged = daysAgo(5);
		expect(new Date(lastLogged) < cutoff).toBe(false);
	});

	it('correctly handles a date-only recorded_at string from odometer_logs', () => {
		const days = 7;
		const cutoff = new Date(Date.now() - days * 86_400_000);
		const recordedAt = '2026-05-31';
		expect(new Date(recordedAt) < cutoff).toBe(true);
	});
});

describe('lastFiredAt', () => {
	it('reports the most recent entry in the cooldown map', () => {
		const raw = JSON.stringify({
			v1: '2026-07-24T06:43:52.243Z',
			v2: '2026-07-24T06:43:52.247Z',
			v3: '2026-01-02T10:00:00.000Z'
		});
		expect(lastFiredAt(raw)).toBe('2026-07-24T06:43:52.247Z');
	});

	it('returns null when the rule never fired', () => {
		expect(lastFiredAt(null)).toBeNull();
		expect(lastFiredAt('{}')).toBeNull();
	});

	it('returns null instead of an unparseable date', () => {
		expect(lastFiredAt('not json')).toBeNull();
		expect(lastFiredAt(JSON.stringify({ v1: 'whenever' }))).toBeNull();
	});
});

describe('quiet hours', () => {
	const at = (iso: string) => new Date(iso);

	it('holds reminders overnight in the user timezone', () => {
		expect(isQuietHour('Europe/Amsterdam', at('2026-10-13T21:30:00Z'))).toBe(true);
		expect(isQuietHour('Europe/Amsterdam', at('2026-10-13T05:59:00Z'))).toBe(true);
		expect(isQuietHour('Europe/Amsterdam', at('2026-10-13T06:00:00Z'))).toBe(false);
		expect(isQuietHour('America/New_York', at('2026-10-13T21:30:00Z'))).toBe(false);
	});

	it('supports same-day windows and disabling', () => {
		expect(isQuietHour('UTC', at('2026-10-13T13:00:00Z'), '12-14')).toBe(true);
		expect(isQuietHour('UTC', at('2026-10-13T14:00:00Z'), '12-14')).toBe(false);
		expect(isQuietHour('UTC', at('2026-10-13T23:00:00Z'), 'off')).toBe(false);
		expect(isQuietHour('UTC', at('2026-10-13T23:00:00Z'), '0-24')).toBe(false);
		expect(isQuietHour('UTC', at('2026-10-13T03:00:00Z'), '25-8')).toBe(false);
	});

	it('accepts common separators and hh:mm', () => {
		const night = at('2026-10-13T23:00:00Z');
		for (const w of ['22-8', '22 - 8', '22–8', '22 to 8', '22/8', '22:00-08:00', '22:30 - 7:45']) {
			expect(isQuietHour('UTC', night, w), w).toBe(true);
		}
		expect(isQuietHour('UTC', night, '22')).toBe(false);
	});

	it('falls back to UTC for an unknown timezone', () => {
		expect(isQuietHour('Not/AZone', at('2026-10-13T23:00:00Z'))).toBe(true);
	});
});
