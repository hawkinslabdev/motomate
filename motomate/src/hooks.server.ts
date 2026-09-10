import { lucia } from '$lib/auth/index.js';
import { json } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as pubEnv } from '$env/dynamic/public';
import { initScheduler } from '$lib/server/scheduler.js';
import { findUserByApiKey, updateKeyLastUsed } from '$lib/db/repositories/api-keys.js';
import { redactCredentials } from '$lib/server/secrets.js';

if (!env.AUTH_SECRET) {
	throw new Error(
		'[MotoMate] AUTH_SECRET is not set. Set a random secret (min 32 chars) in your .env file before starting the server.'
	);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Signs file URLs and export tokens, keys ALTCHA, and derives the integration-credential key.
const PLACEHOLDER_SECRETS = new Set([
	'change-me-in-production-min-32-chars',
	'change-me-in-production',
	'changeme',
	'secret'
]);

const SECRET_IS_PLACEHOLDER = PLACEHOLDER_SECRETS.has(env.AUTH_SECRET);
const SECRET_IS_SHORT = env.AUTH_SECRET.length < 32;

const WEAK_SECRET_MESSAGE =
	'AUTH_SECRET uses an insecure default or is under 32 characters, risking forged downloads and token exports. Update it via `openssl rand -hex 32` (note: this clears stored S3 and paperless credentials; re-add them in Settings).';

if (SECRET_IS_PLACEHOLDER) {
	console.error(`${new Date().toLocaleString('sv')} [MotoMate] ${WEAK_SECRET_MESSAGE}`);
	process.exit(1);
}

initScheduler();

let _secretChecked = false;

// Fatal on a fresh install, warning on an existing one: an upgrade must never stop a live deployment booting.
async function checkSecret(): Promise<void> {
	_secretChecked = true;
	if (!SECRET_IS_SHORT) return;
	const { hasAnyUser } = await import('$lib/db/repositories/users.js');
	if (await hasAnyUser()) {
		console.warn(`${new Date().toLocaleString('sv')} [MotoMate] WARNING: ${WEAK_SECRET_MESSAGE}`);
		return;
	}
	console.error(`${new Date().toLocaleString('sv')} [MotoMate] ${WEAK_SECRET_MESSAGE}`);
	process.exit(1);
}

let _demoSeeded = false;

function hostnameOf(value: string): string | null {
	try {
		return new URL(value.includes('://') ? value : `http://${value}`).hostname;
	} catch {
		return null;
	}
}

// Validates mutations against hostnames this deployment serves (ignoring protocol for TLS proxies); rejects requests missing origin
export function isOriginTrusted(
	origin: string | null,
	referer: string | null,
	url: string
): boolean {
	const claimed =
		origin && origin !== 'null' && origin !== 'undefined' ? origin : (referer ?? null);
	if (!claimed) return false;

	const claimedHost = hostnameOf(claimed);
	if (!claimedHost) return false;

	return [url, ...(process.env.PUBLIC_APP_ORIGINS ?? '').split(',')]
		.filter((candidate) => candidate.trim())
		.some((candidate) => hostnameOf(candidate) === claimedHost);
}

function buildCorsHeaders(requestOrigin: string | null): Record<string, string> {
	const configuredOrigins = process.env.PUBLIC_APP_ORIGINS
		? process.env.PUBLIC_APP_ORIGINS.split(',')
		: [];
	const appUrl = pubEnv.PUBLIC_APP_URL ?? '';
	const appOrigins: string[] = [];
	if (appUrl) {
		try {
			appOrigins.push(new URL(appUrl).origin);
		} catch {
			// ignore
		}
	}
	const allOrigins = [...configuredOrigins, ...appOrigins];

	let allowedOrigin: string | null = null;
	if (requestOrigin) {
		for (const trusted of allOrigins) {
			try {
				const trustedUrl = new URL(trusted.includes('://') ? trusted : `http://${trusted}`);
				if (new URL(requestOrigin).hostname === trustedUrl.hostname) {
					allowedOrigin = requestOrigin;
					break;
				}
			} catch {
				// skip
			}
		}
	}
	if (!allowedOrigin) {
		allowedOrigin = allOrigins.length === 0 ? '*' : null;
	}

	const headers: Record<string, string> = {
		'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		'Access-Control-Max-Age': '86400'
	};
	if (allowedOrigin) {
		headers['Access-Control-Allow-Origin'] = allowedOrigin;
		headers['Access-Control-Allow-Credentials'] = 'true';
	}
	return headers;
}

export const handle: Handle = async ({ event, resolve }) => {
	if (!_secretChecked) await checkSecret();

	if (!_demoSeeded && pubEnv.PUBLIC_DEMO_ENABLED === 'true') {
		_demoSeeded = true;
		const { seedDemo } = await import('$lib/db/demo-seed.js');
		await seedDemo();
	}

	if (event.request.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: buildCorsHeaders(event.request.headers.get('origin'))
		});
	}

	// keys skip csrf
	const authHeader = event.request.headers.get('authorization');
	if (authHeader?.startsWith('Bearer ') && event.url.pathname.startsWith('/api/')) {
		const token = authHeader.slice(7).trim();
		if (token.startsWith('mm_')) {
			const result = await findUserByApiKey(token);
			if (result) {
				// read keys never mutate
				if (result.scope === 'read' && !SAFE_METHODS.has(event.request.method)) {
					return json(
						{ error: 'Forbidden: read-only key', code: 'FORBIDDEN' },
						{ status: 403, headers: { 'Access-Control-Allow-Origin': '*' } }
					);
				}
				event.locals.user = redactCredentials(result.user);
				event.locals.isApiKeyAuth = true;
				event.locals.apiKeyId = result.keyId;
				event.locals.apiKeyScope = result.scope;
				await updateKeyLastUsed(result.keyId).catch(() => {});
			}
			// skiip Lucia session validation entirely when Bearer header is present
			event.locals.session = null;

			const response = await resolve(event, {
				transformPageChunk({ html }) {
					const theme = (event.locals.user as any)?.settings?.theme;
					if (theme === 'light' || theme === 'dark') {
						return html.replace('<html ', `<html data-theme="${theme}" `);
					}
					return html;
				}
			});

			// Handles preflight OPTIONS requests and sets required CORS headers for Bearer token auth
			if (event.url.pathname.startsWith('/api/v1/')) {
				response.headers.set('Access-Control-Allow-Origin', '*');
				response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
				response.headers.set(
					'Access-Control-Allow-Methods',
					'GET, POST, PUT, PATCH, DELETE, OPTIONS'
				);
				response.headers.delete('Access-Control-Allow-Credentials');

				if (event.request.method === 'OPTIONS') {
					return new Response(null, { status: 204, headers: response.headers });
				}
			}
			return response;
		}
	}

	if (
		pubEnv.PUBLIC_DEMO_ENABLED === 'true' &&
		event.request.method !== 'GET' &&
		event.request.method !== 'HEAD' &&
		!event.url.pathname.startsWith('/login') &&
		!event.url.pathname.startsWith('/register') &&
		!event.url.pathname.startsWith('/magic-link') &&
		!event.url.pathname.startsWith('/api/v1/') &&
		event.url.pathname !== '/auth/logout'
	) {
		if (event.request.headers.get('x-sveltekit-action') === 'true') {
			return new Response(JSON.stringify({ type: 'success', status: 200 }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		}
		return new Response(null, { status: 303, headers: { Location: event.url.pathname } });
	}

	if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
		const origin = event.request.headers.get('origin');
		const referer = event.request.headers.get('referer');

		if (!isOriginTrusted(origin, referer, event.request.url)) {
			return new Response('Forbidden, origin not trusted', { status: 403 });
		}
	}

	const sessionId = event.cookies.get(lucia.sessionCookieName);

	if (!sessionId) {
		event.locals.user = null;
		event.locals.session = null;
		return resolve(event);
	}

	const { session, user } = await lucia.validateSession(sessionId);

	if (session?.fresh) {
		const sessionCookie = lucia.createSessionCookie(session.id);
		event.cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '/',
			...sessionCookie.attributes
		});
	}

	if (!session) {
		const blankCookie = lucia.createBlankSessionCookie();
		event.cookies.set(blankCookie.name, blankCookie.value, {
			path: '/',
			...blankCookie.attributes
		});
	}

	event.locals.user = user ? redactCredentials(user) : user;
	event.locals.session = session;

	const response = await resolve(event, {
		transformPageChunk({ html }) {
			const theme = (event.locals.user as any)?.settings?.theme;
			if (theme === 'light' || theme === 'dark') {
				return html.replace('<html ', `<html data-theme="${theme}" `);
			}
			return html;
		}
	});

	const corsHeaders = buildCorsHeaders(event.request.headers.get('origin'));
	if (corsHeaders['Access-Control-Allow-Origin']) {
		response.headers.set('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
	}
	if (corsHeaders['Access-Control-Allow-Credentials']) {
		response.headers.set(
			'Access-Control-Allow-Credentials',
			corsHeaders['Access-Control-Allow-Credentials']
		);
	}

	return response;
};
