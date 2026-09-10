import { verify } from '@node-rs/argon2';

export const ARGON2_OPTS = {
	memoryCost: 19456,
	timeCost: 2,
	outputLen: 32,
	parallelism: 1
} as const;

export const REAUTH_WINDOW_MS = 2 * 60_000;

export type ReauthRecord = {
	password_hash?: string | null;
	settings?: { reauth_until?: string | null } | null;
};

// proof lasts this long
export function reauthExpiry(now = Date.now()): string {
	return new Date(now + REAUTH_WINDOW_MS).toISOString();
}

export function isReauthActive(until?: string | null): boolean {
	return !!until && until > new Date().toISOString();
}

// stepup means provider re-login
export async function verifyReauth(
	record: ReauthRecord | undefined,
	currentPassword: string
): Promise<'ok' | 'password' | 'stepup'> {
	if (!record) return 'stepup';
	if (isReauthActive(record.settings?.reauth_until)) return 'ok';
	if (!record.password_hash) return 'stepup';
	if (!currentPassword) return 'password';
	return (await verify(record.password_hash, currentPassword, ARGON2_OPTS)) ? 'ok' : 'password';
}
