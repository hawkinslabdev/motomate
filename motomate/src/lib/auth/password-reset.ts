export const RESET_WINDOW_MS = 15 * 60_000;

export function resetWindowExpiry(now = Date.now()): string {
	return new Date(now + RESET_WINDOW_MS).toISOString();
}

// A magic link proves control of the inbox, so the current password is not asked for again.
export function isResetWindowOpen(until?: string | null): boolean {
	return !!until && until > new Date().toISOString();
}
