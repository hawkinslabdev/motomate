import { json } from '@sveltejs/kit';
import { getAltchaKey } from '#lib/auth/altcha.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const { createChallenge } = await import('altcha-lib/v1');
	const challenge = await createChallenge({ hmacKey: getAltchaKey() });
	return json(challenge, { headers: { 'Cache-Control': 'no-store' } });
};
