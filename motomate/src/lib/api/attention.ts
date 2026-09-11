export const UPCOMING_DAYS = 14;
export const UPCOMING_DISTANCE = 500;
export const UPCOMING_HOURS = 10;

function upcomingThreshold(odometerUnit: string): number {
	return odometerUnit === 'h' ? UPCOMING_HOURS : UPCOMING_DISTANCE;
}

export function daysDiff(dateStr: string): number {
	const target = new Date(dateStr + 'T00:00:00');
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

type TrackerLike = {
	id: string;
	reminder_only: boolean | null;
	status: 'ok' | 'due' | 'overdue' | null;
	next_due_at: string | null;
	next_due_odometer: number | null;
};

export function categorizeTrackers<T extends TrackerLike>(
	trackers: T[],
	trueOdo: number,
	odometerUnit: string,
	buildBase: (t: T) => Record<string, unknown>
): { overdue: unknown[]; due: unknown[]; upcoming: unknown[] } {
	const overdue: unknown[] = [];
	const due: unknown[] = [];
	const upcoming: unknown[] = [];
	const upcomingMeasurement = upcomingThreshold(odometerUnit);

	for (const t of trackers) {
		if (t.reminder_only) continue;

		const base = buildBase(t);

		if (t.status === 'overdue') {
			const item: Record<string, unknown> = { ...base };
			if (t.next_due_odometer != null) {
				item.overdue_by = Math.max(0, trueOdo - t.next_due_odometer);
			}
			if (t.next_due_at) {
				const diff = daysDiff(t.next_due_at);
				if (diff < 0) item.overdue_by_days = Math.abs(diff);
			}
			overdue.push(item);
		} else if (t.status === 'due') {
			const item: Record<string, unknown> = { ...base };
			if (t.next_due_odometer != null) {
				const delta = t.next_due_odometer - trueOdo;
				if (delta >= 0) item.due_in = delta;
				else item.overdue_by = Math.abs(delta);
			}
			if (t.next_due_at) {
				const diff = daysDiff(t.next_due_at);
				if (diff >= 0) item.due_in_days = diff;
				else item.overdue_by_days = Math.abs(diff);
			}
			due.push(item);
		} else {
			const approachingDate = t.next_due_at !== null && daysDiff(t.next_due_at) <= UPCOMING_DAYS;
			const approachingMeasurement =
				t.next_due_odometer != null && t.next_due_odometer - trueOdo <= upcomingMeasurement;

			if (approachingDate || approachingMeasurement) {
				const item: Record<string, unknown> = { ...base };
				if (t.next_due_odometer != null) {
					item.due_in = Math.max(0, t.next_due_odometer - trueOdo);
				}
				if (t.next_due_at) {
					item.due_in_days = Math.max(0, daysDiff(t.next_due_at));
				}
				upcoming.push(item);
			}
		}
	}

	return { overdue, due, upcoming };
}
