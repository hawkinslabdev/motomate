import { lucia } from '$lib/auth/index.js';
import type { Handle } from '@sveltejs/kit';

/**
 * Runtime CSRF origin validation.
 * Reads PUBLIC_APP_ORIGINS at runtime so self-hosted users can configure their own origins.
 */
function isOriginTrusted(origin: string | null, referer: string | null, url: string): boolean {
	const configuredOrigins = process.env.PUBLIC_APP_ORIGINS
		? process.env.PUBLIC_APP_ORIGINS.split(',')
		: [];

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

	// If we have a request origin, check against configured origins
	if (requestOrigin) {
		for (const trusted of configuredOrigins) {
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

		// If origins are configured but none matched, reject
		if (configuredOrigins.length > 0) {
			return false;
		}
	}

	// No request origin and no configured origins = allow (dev mode)
	// No request origin but origins configured = allow if request URL matches one of them
	return true;
}

export const handle: Handle = async ({ event, resolve }) => {
	// CSRF check for non-safe methods
	if (
		event.request.method !== 'GET' &&
		event.request.method !== 'HEAD' &&
		event.request.method !== 'OPTIONS'
	) {
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

	event.locals.user = user;
	event.locals.session = session;

	return resolve(event, {
		transformPageChunk({ html }) {
			const theme = (event.locals.user as any)?.settings?.theme;
			if (theme === 'light' || theme === 'dark') {
				return html.replace('<html ', `<html data-theme="${theme}" `);
			}
			return html;
		}
	});
};
