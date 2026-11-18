import { verify } from '@node-rs/argon2';
import { rateLimit } from './rate-limit.js';

export const ARGON2_OPTS = {
	memoryCost: 19456,
	timeCost: 2,
	outputLen: 32,
	parallelism: 1
} as const;

export const REAUTH_WINDOW_MS = 2 * 60_000;

export type ReauthSettings = {
	reauth_until?: string | null;
	reauth_session?: string | null;
} | null;

export type ReauthRecord = {
	id?: string;
	password_hash?: string | null;
	settings?: ReauthSettings;
};

export const REAUTH_CLEARED = { reauth_until: null, reauth_session: null };

export function reauthWindow(sessionId: string, now = Date.now()) {
	return {
		reauth_until: new Date(now + REAUTH_WINDOW_MS).toISOString(),
		reauth_session: sessionId
	};
}

export function isReauthActive(
	settings: ReauthSettings | undefined,
	sessionId?: string | null
): boolean {
	const until = settings?.reauth_until;
	return (
		!!sessionId &&
		settings?.reauth_session === sessionId &&
		!!until &&
		until > new Date().toISOString()
	);
}

// stepup means provider re-login
export async function verifyReauth(
	record: ReauthRecord | undefined,
	currentPassword: string,
	sessionId?: string | null
): Promise<'ok' | 'password' | 'stepup' | 'limited'> {
	if (!record) return 'stepup';
	if (isReauthActive(record.settings, sessionId)) return 'ok';
	if (!record.password_hash) return 'stepup';
	if (!currentPassword) return 'password';
	if (record.id && !rateLimit(`reauth:${record.id}`, 10, 15 * 60_000)) return 'limited';
	return (await verify(record.password_hash, currentPassword, ARGON2_OPTS)) ? 'ok' : 'password';
}
