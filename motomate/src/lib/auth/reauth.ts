import { verify } from '@node-rs/argon2';
import { rateLimit } from './rate-limit.js';

export const ARGON2_OPTS = {
	memoryCost: 19456,
	timeCost: 2,
	outputLen: 32,
	parallelism: 1
} as const;

export const REAUTH_WINDOW_MS = 2 * 60_000;

export type ReauthRecord = {
	id?: string;
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
): Promise<'ok' | 'password' | 'stepup' | 'limited'> {
	if (!record) return 'stepup';
	if (isReauthActive(record.settings?.reauth_until)) return 'ok';
	if (!record.password_hash) return 'stepup';
	if (!currentPassword) return 'password';
	if (record.id && !rateLimit(`reauth:${record.id}`, 10, 15 * 60_000)) return 'limited';
	return (await verify(record.password_hash, currentPassword, ARGON2_OPTS)) ? 'ok' : 'password';
}
