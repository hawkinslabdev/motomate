const STATUS_URGENCY: Record<string, number> = { overdue: 0, due: 1, ok: 2 };

export function compareTrackerStatus(a: { status: string }, b: { status: string }): number {
	return (STATUS_URGENCY[a.status] ?? 3) - (STATUS_URGENCY[b.status] ?? 3);
}
