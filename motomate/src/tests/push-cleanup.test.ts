import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('#lib/db/index.js', async () => {
	const { default: Database } = await import('better-sqlite3');
	const { drizzle } = await import('drizzle-orm/better-sqlite3');
	const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
	const schema = await import('#lib/db/schema.js');
	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	return { db, sqlite };
});
vi.mock('#lib/server/vapid.js', () => ({
	getVapidConfig: () => ({ publicKey: 'pub', privateKey: 'priv', subject: 'mailto:x@example.com' })
}));
const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

import { db } from '#lib/db/index.js';
import { push_subscriptions, users } from '#lib/db/schema.js';
import { dispatchPush } from '#lib/workflow/channels/push.js';

const keys = { p256dh: 'p', auth: 'a' };

describe('dispatchPush', () => {
	beforeEach(async () => {
		sendNotification.mockReset();
		await db.delete(push_subscriptions);
		await db.delete(users);
		await db.insert(users).values({ id: 'u1', email: 'u1@example.com', password_hash: 'x' });
		await db.insert(push_subscriptions).values([
			{ id: 's-gone', user_id: 'u1', endpoint: 'https://push.test/gone', keys },
			{ id: 's-live', user_id: 'u1', endpoint: 'https://push.test/live', keys }
		]);
	});

	it('removes subscriptions the push service reports as gone', async () => {
		sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
			if (sub.endpoint.endsWith('gone')) throw { statusCode: 410 };
		});
		await dispatchPush('u1', 'T', 'B');
		const left = (await db.query.push_subscriptions.findMany()).map((s) => s.id);
		expect(left).toEqual(['s-live']);
	});

	it('reports other push errors and keeps the subscription', async () => {
		sendNotification.mockRejectedValue({ statusCode: 500 });
		await expect(dispatchPush('u1', 'T', 'B')).rejects.toEqual({ statusCode: 500 });
		expect(await db.query.push_subscriptions.findMany()).toHaveLength(2);
	});
});
