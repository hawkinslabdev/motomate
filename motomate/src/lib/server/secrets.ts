import crypto from 'crypto';
import { AUTH_SECRET } from '$app/env/private';
import type { Integrations, UserSettings } from '#lib/db/schema.js';

const PREFIX = 'enc:v1:';

function key(): Buffer {
	const secret = AUTH_SECRET;
	if (!secret) throw new Error('AUTH_SECRET is required to store integration credentials');
	return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(plain: string): string {
	if (!plain) return '';
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
	const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return PREFIX + [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64')).join(':');
}

export function decryptSecret(stored: string | undefined | null): string {
	if (!stored) return '';
	if (!stored.startsWith(PREFIX)) return stored;
	const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(':');
	if (!ivB64 || !tagB64 || !ctB64) return '';
	try {
		const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
		decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
		return Buffer.concat([
			decipher.update(Buffer.from(ctB64, 'base64')),
			decipher.final()
		]).toString('utf8');
	} catch {
		return '';
	}
}

export function isEncrypted(value: string | undefined | null): boolean {
	return !!value && value.startsWith(PREFIX);
}

// Integration credentials never leave the server: strip them before a user object is exposed.
export function redactCredentials<T extends { settings?: UserSettings }>(user: T): T {
	const integrations = user.settings?.integrations;
	if (!integrations) return user;
	const redacted: Integrations = {};
	if (integrations.s3) {
		const { access_key: _ak, secret_key: _sk, ...rest } = integrations.s3;
		redacted.s3 = rest;
	}
	if (integrations.paperless) {
		const { token: _token, ...rest } = integrations.paperless;
		redacted.paperless = rest;
	}
	return {
		...user,
		settings: { ...(user.settings as UserSettings), integrations: redacted }
	} as T;
}
