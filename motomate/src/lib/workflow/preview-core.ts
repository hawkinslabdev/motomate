export type NextFireInfo =
	| { kind: 'ready' }
	| { kind: 'cooldown'; until: string }
	| { kind: 'waiting' }
	| { kind: 'measurement'; remaining: number; unit: string; trackerName: string }
	| { kind: 'date'; fireAt: string; trackerName?: string }
	| { kind: 'none' };

export function nextCalendarOccurrence(month: number, day: number): Date {
	const now = new Date();
	const year = now.getFullYear();
	const candidate = new Date(year, month - 1, day);
	const startOfToday = new Date(year, now.getMonth(), now.getDate());
	if (candidate < startOfToday) candidate.setFullYear(year + 1);
	return candidate;
}
