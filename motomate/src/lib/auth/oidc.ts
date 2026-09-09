import crypto from 'crypto';
import { env } from '$env/dynamic/private';
import { env as pubEnv } from '$env/dynamic/public';
import { ts } from '../server/log.js';

type OidcConfig = {
	issuer: string;
	clientId: string;
	clientSecret: string;
	scopes: string;
	name: string;
};

type OidcDiscovery = {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	userinfo_endpoint: string;
	end_session_endpoint?: string;
};

const DISCOVERY_TTL = 60 * 60_000;
let _discoveryCache: { issuer: string; at: number; doc: OidcDiscovery } | null = null;

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

export function appOrigin(url: URL): string {
	return (pubEnv.PUBLIC_APP_URL || url.origin).replace(/\/$/, '');
}

// attempt for prefix to set these cookies host-only, which prevents apps on shared parent domains from cojoining? them
export function oidcCookie(name: 'state' | 'verifier' | 'id_token', secure: boolean): string {
	return secure ? `__Host-oidc_${name}` : `oidc_${name}`;
}

export function redirectUri(url: URL): string {
	return `${appOrigin(url)}/oidc/callback`;
}

export function assertHttpsIssuer(issuer: string): void {
	const { protocol, hostname } = new URL(issuer);
	if (protocol === 'https:') return;
	if (hostname === 'localhost' || hostname === '127.0.0.1') return;
	throw new Error('OIDC issuer must use https');
}

export async function discoverOidc(issuer: string): Promise<OidcDiscovery> {
	assertHttpsIssuer(issuer);
	if (_discoveryCache?.issuer === issuer && Date.now() - _discoveryCache.at < DISCOVERY_TTL) {
		return _discoveryCache.doc;
	}
	const res = await fetch(`${issuer}/.well-known/openid-configuration`);
	if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status} ${res.statusText}`);
	const doc = (await res.json()) as OidcDiscovery;
	if (doc.issuer?.replace(/\/$/, '') !== issuer) throw new Error('OIDC issuer mismatch');
	for (const endpoint of [doc.authorization_endpoint, doc.token_endpoint, doc.userinfo_endpoint]) {
		if (!endpoint) throw new Error('OIDC discovery document is incomplete');
		assertHttpsIssuer(endpoint);
	}
	_discoveryCache = { issuer, at: Date.now(), doc };
	return doc;
}

export function isEmailVerified(value: boolean | string | undefined): boolean {
	return value === true || value === 'true';
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
): Promise<{ access_token: string; id_token?: string }> {
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
): Promise<{ sub?: string; email?: string; email_verified?: boolean | string; name?: string }> {
	const res = await fetch(discovery.userinfo_endpoint, {
		headers: { authorization: `Bearer ${accessToken}` }
	});
	if (!res.ok) throw new Error('OIDC userinfo failed');
	return res.json();
}

export async function endSessionUrl(url: URL, idToken?: string): Promise<string | null> {
	const config = getOidcConfig();
	if (!config) return null;
	try {
		const discovery = await discoverOidc(config.issuer);
		if (!discovery.end_session_endpoint) return null;
		const target = new URL(discovery.end_session_endpoint);
		target.searchParams.set('post_logout_redirect_uri', `${appOrigin(url)}/login`);
		if (idToken) target.searchParams.set('id_token_hint', idToken);
		else target.searchParams.set('client_id', config.clientId);
		return target.toString();
	} catch (e) {
		console.error(`${ts()} [MotoMate] OIDC end_session lookup failed`, e);
		return null;
	}
}
