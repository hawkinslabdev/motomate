import crypto from 'crypto';
import { env } from '$env/dynamic/private';

type OidcConfig = {
	issuer: string;
	clientId: string;
	clientSecret: string;
	scopes: string;
	name: string;
};

type OidcDiscovery = {
	authorization_endpoint: string;
	token_endpoint: string;
	userinfo_endpoint: string;
};

let _discoveryCache: OidcDiscovery | null = null;

export function getOidcConfig(): OidcConfig | null {
	if (!env.OIDC_ISSUER || !env.OIDC_CLIENT_ID || !env.OIDC_CLIENT_SECRET) return null;
	return {
		issuer: env.OIDC_ISSUER.replace(/\/$/, ''),
		clientId: env.OIDC_CLIENT_ID,
		clientSecret: env.OIDC_CLIENT_SECRET,
		scopes: env.OIDC_SCOPES ?? 'openid email profile',
		name: env.OIDC_NAME ?? 'SSO'
	};
}

export async function discoverOidc(issuer: string): Promise<OidcDiscovery> {
	if (_discoveryCache) return _discoveryCache;
	const res = await fetch(`${issuer}/.well-known/openid-configuration`);
	if (!res.ok) throw new Error('OIDC discovery failed');
	_discoveryCache = await res.json();
	return _discoveryCache as OidcDiscovery;
}

export function randomToken(): string {
	return crypto.randomBytes(32).toString('base64url');
}

export function pkceChallenge(verifier: string): string {
	return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export async function exchangeCode(
	discovery: OidcDiscovery,
	config: OidcConfig,
	code: string,
	verifier: string,
	redirectUri: string
): Promise<{ access_token: string }> {
	const res = await fetch(discovery.token_endpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: redirectUri,
			client_id: config.clientId,
			client_secret: config.clientSecret,
			code_verifier: verifier
		})
	});
	if (!res.ok) throw new Error('OIDC token exchange failed');
	return res.json();
}

export async function fetchUserinfo(
	discovery: OidcDiscovery,
	accessToken: string
): Promise<{ email?: string; email_verified?: boolean; name?: string }> {
	const res = await fetch(discovery.userinfo_endpoint, {
		headers: { authorization: `Bearer ${accessToken}` }
	});
	if (!res.ok) throw new Error('OIDC userinfo failed');
	return res.json();
}
