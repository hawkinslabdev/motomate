import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../index.js';
import { api_keys, users } from '../schema.js';
import type { ApiKey, ApiKeyScope, User } from '../schema.js';
import { generateId } from '../../utils/id.js';

const MAX_KEYS_PER_USER = 20; // not sure youll ever need more than this
const PREFIX_LENGTH = 11; // lets add prefix "mm_" + 8 hex chars

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
	return 'mm_' + randomBytes(32).toString('hex');
}

function expiresAtFromDays(days: number): string {
	const d = new Date();
	d.setDate(d.getDate() + days);
	return d.toISOString().slice(0, 10);
}

async function assertBelowKeyLimit(userId: string): Promise<void> {
	const active = await db
		.select({ id: api_keys.id })
		.from(api_keys)
		.where(and(eq(api_keys.user_id, userId), isNull(api_keys.revoked_at)));
	if (active.length >= MAX_KEYS_PER_USER) {
		throw new Error(`Maximum of ${MAX_KEYS_PER_USER} API keys allowed`);
	}
}

function newKeyRow(userId: string, name: string, scope: ApiKeyScope, expiresDays?: number) {
	const plaintext = generateToken();
	const row = {
		id: generateId(),
		user_id: userId,
		name,
		key_hash: hashToken(plaintext),
		key_prefix: plaintext.slice(0, PREFIX_LENGTH),
		scope,
		expires_at: expiresDays ? expiresAtFromDays(expiresDays) : undefined,
		expires_duration_days: expiresDays ?? undefined
	};
	return { plaintext, row };
}

export async function createApiKey(
	userId: string,
	name: string,
	scope: ApiKeyScope,
	expiresDays?: number
): Promise<{ plaintext: string; record: ApiKey }> {
	await assertBelowKeyLimit(userId);
	const { plaintext, row } = newKeyRow(userId, name, scope, expiresDays);
	await db.insert(api_keys).values(row);
	const record = await db.query.api_keys.findFirst({ where: eq(api_keys.id, row.id) });
	return { plaintext, record: record! };
}

export async function listApiKeys(userId: string): Promise<Omit<ApiKey, 'key_hash'>[]> {
	const rows = await db.query.api_keys.findMany({
		where: eq(api_keys.user_id, userId),
		columns: {
			key_hash: false
		}
	});
	return rows;
}

export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
	const result = await db
		.update(api_keys)
		.set({ revoked_at: new Date().toISOString().replace('T', ' ').slice(0, 19) })
		.where(and(eq(api_keys.id, keyId), eq(api_keys.user_id, userId), isNull(api_keys.revoked_at)));
	return result.changes > 0;
}

export async function rotateApiKey(
	userId: string,
	keyId: string
): Promise<{ plaintext: string; record: ApiKey } | null> {
	const existing = await db.query.api_keys.findFirst({
		where: and(eq(api_keys.id, keyId), eq(api_keys.user_id, userId), isNull(api_keys.revoked_at))
	});
	if (!existing) return null;

	const { plaintext, row } = newKeyRow(
		userId,
		existing.name,
		existing.scope,
		existing.expires_duration_days ?? undefined
	);
	db.transaction((tx) => {
		tx.delete(api_keys).where(eq(api_keys.id, keyId)).run();
		tx.insert(api_keys).values(row).run();
	});
	const record = await db.query.api_keys.findFirst({ where: eq(api_keys.id, row.id) });
	return { plaintext, record: record! };
}

export async function findUserByApiKey(
	token: string
): Promise<{ user: User; keyId: string; scope: ApiKeyScope } | null> {
	const hash = hashToken(token);

	const row = await db
		.select({
			keyId: api_keys.id,
			scope: api_keys.scope,
			userId: api_keys.user_id
		})
		.from(api_keys)
		.where(
			and(
				eq(api_keys.key_hash, hash),
				isNull(api_keys.revoked_at),
				or(isNull(api_keys.expires_at), sql`${api_keys.expires_at} > date('now')`)
			)
		)
		.limit(1);

	if (!row[0]) return null;

	const user = await db.query.users.findFirst({ where: eq(users.id, row[0].userId) });
	if (!user) return null;

	return { user, keyId: row[0].keyId, scope: row[0].scope };
}

export async function restoreApiKey(userId: string, keyId: string): Promise<boolean> {
	await assertBelowKeyLimit(userId);
	const result = await db
		.update(api_keys)
		.set({ revoked_at: null })
		.where(and(eq(api_keys.id, keyId), eq(api_keys.user_id, userId)));
	return result.changes > 0;
}

export async function deleteApiKey(userId: string, keyId: string): Promise<boolean> {
	const result = await db
		.delete(api_keys)
		.where(and(eq(api_keys.id, keyId), eq(api_keys.user_id, userId)));
	return result.changes > 0;
}

export async function updateKeyLastUsed(keyId: string): Promise<void> {
	await db
		.update(api_keys)
		.set({ last_used_at: new Date().toISOString().replace('T', ' ').slice(0, 19) })
		.where(eq(api_keys.id, keyId));
}
