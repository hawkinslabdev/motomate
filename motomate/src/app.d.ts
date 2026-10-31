import type { User, Session } from 'lucia';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
			session: Session | null;
			isApiKeyAuth?: boolean;
			apiKeyId?: string;
			apiKeyScope?: import('#lib/db/schema.js').ApiKeyScope;
		}
		interface Error {
			message: string;
			code?: string;
		}
	}
}

declare global {
	const __APP_VERSION__: string;
}

export {};
