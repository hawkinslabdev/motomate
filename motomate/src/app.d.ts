import type { User, Session } from 'lucia';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
			session: Session | null;
		}
		interface Error {
			message: string;
			code?: string;
		}
	}
}

export {};
