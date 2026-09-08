import { env } from '$env/dynamic/private';
import { hasAnyUser } from '$lib/db/repositories/users.js';

// Closed unlesss explicitly opened. The empty-database exception is unconditional so a fresh deployment can always onboard its first user
export async function isRegistrationOpen(): Promise<boolean> {
	if (env.AUTH_ALLOW_REGISTRATION === 'true') return true;
	return !(await hasAnyUser());
}

export async function isOidcSignupOpen(): Promise<boolean> {
	if (env.OIDC_ALLOW_SIGNUP === 'true') return true;
	if (env.OIDC_ALLOW_SIGNUP === 'false') return false;
	return isRegistrationOpen();
}
