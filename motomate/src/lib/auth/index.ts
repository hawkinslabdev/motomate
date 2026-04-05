import { Lucia } from 'lucia';
import { DrizzleSQLiteAdapter } from '@lucia-auth/adapter-drizzle';
import { db } from '../db/index.js';
import { sessions, users } from '../db/schema.js';

// Secure in production by default; opt out with AUTH_COOKIE_SECURE=false,
// opt in for local HTTPS with AUTH_COOKIE_SECURE=true.
export const isSecureCookie =
	process.env.AUTH_COOKIE_SECURE === 'true' ||
	(process.env.NODE_ENV === 'production' && process.env.AUTH_COOKIE_SECURE !== 'false');

const adapter = new DrizzleSQLiteAdapter(db, sessions, users);

export const lucia = new Lucia(adapter, {
	sessionCookie: {
		attributes: {
			secure: isSecureCookie,
			sameSite: 'lax'
		}
	},
	getUserAttributes: (attrs) => ({
		email: attrs.email,
		onboarding_done: attrs.onboarding_done,
		timezone: attrs.timezone,
		settings: attrs.settings
	})
});

declare module 'lucia' {
	interface Register {
		Lucia: typeof lucia;
		DatabaseUserAttributes: {
			email: string;
			onboarding_done: boolean;
			timezone: string;
			settings: import('../db/schema.js').UserSettings;
		};
	}
}
