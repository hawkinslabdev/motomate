import { eq, sql, and, inArray, ne } from 'drizzle-orm';
import { db } from '../index.js';
import { users, finance_transactions, service_logs, travels, vehicles } from '../schema.js';
import { CreateUserSchema, UserSettingsSchema } from '../../validators/schemas.js';
import type { InsertUser, User, UserSettings } from '../schema.js';
import { generateId } from '../../utils/id.js';
import { DEFAULT_ODOMETER_UNIT } from '../../utils/measurement.js';

export async function createUser(input: {
	email: string;
	password_hash?: string;
	initialSettings?: Partial<UserSettings>;
}): Promise<User> {
	const parsed = CreateUserSchema.parse(input);
	const id = generateId();
	const defaultSettings: UserSettings = {
		theme: 'system',
		currency: 'EUR',
		odometer_unit: DEFAULT_ODOMETER_UNIT,
		locale: 'en',
		avatar_seed: generateId()
	};
	const row: InsertUser = {
		id,
		email: parsed.email,
		password_hash: input.password_hash ?? null,
		settings: { ...defaultSettings, ...input.initialSettings }
	};
	await db.insert(users).values(row);
	return db.query.users.findFirst({ where: eq(users.id, id) }) as Promise<User>;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
	return db.query.users.findFirst({ where: eq(users.email, email.toLowerCase().trim()) });
}

export async function getUserById(id: string): Promise<User | undefined> {
	return db.query.users.findFirst({ where: eq(users.id, id) });
}

// Scheduler fan-out: only users who actually switched an integration on.
export async function getUserIdsWithIntegrations(): Promise<string[]> {
	const rows = await db
		.select({ id: users.id })
		.from(users)
		.where(
			sql`json_extract(settings, '$.integrations.s3.enabled') = 1
				OR json_extract(settings, '$.integrations.paperless.enabled') = 1`
		);
	return rows.map((r) => r.id);
}

export async function updateUserSettings(
	userId: string,
	settings: Partial<UserSettings>
): Promise<void> {
	const user = await getUserById(userId);
	if (!user) throw new Error('User not found');
	const merged = UserSettingsSchema.parse({ ...user.settings, ...settings });
	await db
		.update(users)
		.set({ settings: merged, updated_at: new Date().toISOString() })
		.where(eq(users.id, userId));
}

export async function updateUserEmail(userId: string, email: string): Promise<void> {
	await db
		.update(users)
		.set({ email: email.toLowerCase().trim(), updated_at: new Date().toISOString() })
		.where(eq(users.id, userId));
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
	await db
		.update(users)
		.set({ password_hash: passwordHash, updated_at: new Date().toISOString() })
		.where(eq(users.id, userId));
}

export async function markOnboardingDone(userId: string): Promise<void> {
	await db
		.update(users)
		.set({ onboarding_done: true, updated_at: new Date().toISOString() })
		.where(eq(users.id, userId));
}

export async function hasAnyUser(): Promise<boolean> {
	const row = await db.query.users.findFirst();
	return row !== undefined;
}

export async function deleteUser(userId: string): Promise<void> {
	await db.delete(users).where(eq(users.id, userId));
}

export async function migrateUserCurrency(userId: string, toCurrency: string): Promise<void> {
	await db
		.update(finance_transactions)
		.set({ currency: toCurrency })
		.where(and(eq(finance_transactions.user_id, userId), ne(finance_transactions.currency, toCurrency)));

	await db
		.update(travels)
		.set({ currency: toCurrency })
		.where(and(eq(travels.user_id, userId), ne(travels.currency, toCurrency)));

	const userVehicles = await db
		.select({ id: vehicles.id })
		.from(vehicles)
		.where(eq(vehicles.user_id, userId));

	if (userVehicles.length > 0) {
		await db
			.update(service_logs)
			.set({ currency: toCurrency })
			.where(
				and(
					inArray(
						service_logs.vehicle_id,
						userVehicles.map((v) => v.id)
					),
					ne(service_logs.currency, toCurrency)
				)
			);
	}
}
