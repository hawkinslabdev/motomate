import { normalizeWorkflowTrigger } from './triggers.js';
import type { RuleTrigger } from '#lib/db/schema.js';

export function getCooldownHours(trigger: RuleTrigger): number {
	const t = normalizeWorkflowTrigger(trigger);
	if (t.kind === 'no_odometer_update') return t.days * 24;
	if (t.kind === 'document_expiring') return Math.min(t.daysBefore, 7) * 24;
	return 23;
}

export function parseFiredAtMap(raw: string | null): Record<string, string> {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
			return parsed as Record<string, string>;
		}
	} catch {
		/* ignore malformed JSON */
	}
	return {};
}

// last_triggered_at maps the per-target cooldownss, so the latest entry is when the rule last fired
export function lastFiredAt(raw: string | null): string | null {
	const times = Object.values(parseFiredAtMap(raw)).filter(
		(t) => typeof t === 'string' && !Number.isNaN(Date.parse(t))
	);
	if (times.length === 0) return null;
	return times.reduce((latest, t) => (t > latest ? t : latest));
}

// "22-8" means 22:00 to 08:00 local; "off" or "" disables
export function isQuietHour(timezone: string, now = new Date(), window = '22-8'): boolean {
	const m = /^(\d{1,2})(?::\d{2})?\D+?(\d{1,2})(?::\d{2})?$/.exec(window.trim());
	if (!m) return false;
	const [start, end] = [Number(m[1]), Number(m[2])];
	if (start > 23 || end > 23) return false;
	let hour: number;
	try {
		hour = Number(
			new Intl.DateTimeFormat('en-GB', {
				hour: 'numeric',
				hourCycle: 'h23',
				timeZone: timezone
			}).format(now)
		);
	} catch {
		hour = now.getUTCHours();
	}
	return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function cooldownKey(vehicleId: string, documentId?: string): string {
	return documentId ? `${vehicleId}/${documentId}` : vehicleId;
}
