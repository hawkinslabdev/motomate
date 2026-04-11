import { eq } from 'drizzle-orm';
import { db } from '../index.js';
import { users } from '../schema.js';
import { CreateUserSchema, UserSettingsSchema } from '../../validators/schemas.js';
import type { InsertUser, User, UserSettings } from '../schema.js';
import { generateId } from '../../utils/id.js';

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
		odometer_unit: 'km',
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

export async function deleteUser(userId: string): Promise<void> {
	await db.delete(users).where(eq(users.id, userId));
}
