import crypto from 'crypto';
import { ALTCHA_HMAC_KEY, AUTH_SECRET } from '$app/env/private';

export function getAltchaKey(): string {
	if (ALTCHA_HMAC_KEY) return ALTCHA_HMAC_KEY;

	return crypto
		.createHmac('sha256', AUTH_SECRET ?? '')
		.update('altcha')
		.digest('hex');
}

export async function verifyAltcha(payload: FormDataEntryValue | null): Promise<boolean> {
	if (!payload || typeof payload !== 'string') return false;
	const { verifySolution } = await import('altcha-lib/v1');
	return verifySolution(payload, getAltchaKey());
}
