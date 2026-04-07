import { lucia } from '$lib/auth/index.js';
import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/**
 * Runtime CSRF origin validation.
 * Reads PUBLIC_APP_ORIGINS at runtime so self-hosted users can configure their own origins.
 */
function isOriginTrusted(origin: string | null, referer: string | null, url: string, appUrl: string): boolean {
	const configuredOrigins = process.env.PUBLIC_APP_ORIGINS
		? process.env.PUBLIC_APP_ORIGINS.split(',')
		: [];

	// Derive allowed origins from PUBLIC_APP_URL if configured
	const appOrigins: string[] = [];
	if (appUrl) {
		try {
			appOrigins.push(new URL(appUrl).origin);
		} catch (e) {
			// ignore invalid URL
		}
	}

	// Normalize: convert string 'null'/'undefined' to actual null
	const normalizedOrigin =
		origin === null || origin === 'null' || origin === 'undefined' ? null : origin;

	// Extract request origin from headers or from request URL
	let requestOrigin: string | null = normalizedOrigin;

	// Try referer header
	if (!requestOrigin && referer) {
		try {
			requestOrigin = new URL(referer).origin;
		} catch (e) {
			// ignore
		}
	}

	// Try request URL
	if (!requestOrigin && url) {
		try {
			requestOrigin = new URL(url).origin;
		} catch (e) {
			// ignore
		}
	}

	// Include app-derived origins in the check
	const allOrigins = [...configuredOrigins, ...appOrigins];

	// If we have a request origin, check against all allowed origins
	if (requestOrigin) {
		for (const trusted of allOrigins) {
			try {
				const trustedOrigin = trusted.includes('://')
					? new URL(trusted).origin
					: `http://${trusted}`;
				const originUrl = new URL(requestOrigin);
				const trustedUrl = new URL(trustedOrigin);

				// Match hostname, allow flexible protocol/port
				if (originUrl.hostname === trustedUrl.hostname) {
					return true;
				}
			} catch (e) {
				// skip
			}
		}

		// If origins are configured but none matched, allow if request URL matches a configured host
		if (allOrigins.length > 0) {
			// Try host-based matching: allow if request origin's host matches any trusted origin's host
			try {
				const originHost = new URL(requestOrigin!).hostname;
				for (const trusted of allOrigins) {
					const trustedHost = new URL(trusted).hostname;
					if (originHost === trustedHost) return true;
				}
			} catch (e) {
				// skip
			}
			return false;
		}
	}

	// No request origin and no configured origins = allow (dev mode)
	// No request origin but origins configured = allow if request URL matches one of them
	return true;
}

export const handle: Handle = async ({ event, resolve }) => {
	// Handle CORS preflight
	if (event.request.method === 'OPTIONS') {
		const origin = event.request.headers.get('origin');
		if (origin) {
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': origin,
					'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
					'Access-Control-Allow-Credentials': 'true',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization'
				}
			});
		}
		return new Response(null, { status: 204 });
	}

	// CSRF check for non-safe methods
	if (
		event.request.method !== 'GET' &&
		event.request.method !== 'HEAD' &&
		event.request.method !== 'OPTIONS'
	) {
		const origin = event.request.headers.get('origin');
		const referer = event.request.headers.get('referer');

		const appUrl = env.PUBLIC_APP_URL ?? '';
		if (!isOriginTrusted(origin, referer, event.request.url, appUrl)) {
				return new Response('Forbidden, origin not trusted', { status: 403 });
			}
	}

	const sessionId = event.cookies.get(lucia.sessionCookieName);

	if (!sessionId) {
		event.locals.user = null;
		event.locals.session = null;
		const response = await resolve(event);
		const origin = event.request.headers.get('origin');
		if (origin) {
			response.headers.set('Access-Control-Allow-Origin', origin);
			response.headers.set('Access-Control-Allow-Credentials', 'true');
		}
		return response;
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

	event.locals.user = user;
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

	// Add CORS headers to all responses
	const origin = event.request.headers.get('origin');
	if (origin) {
		response.headers.set('Access-Control-Allow-Origin', origin);
		response.headers.set('Access-Control-Allow-Credentials', 'true');
	}

	return response;
};
