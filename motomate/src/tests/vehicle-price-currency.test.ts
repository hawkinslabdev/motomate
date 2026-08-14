import { vi, describe, it, expect, beforeEach } from 'vitest';

// Real SQLite built from the shipped migrations; only object storage is faked
vi.mock('$lib/db/index.js', async () => {
	const { default: Database } = await import('better-sqlite3');
	const { drizzle } = await import('drizzle-orm/better-sqlite3');
	const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
	const schema = await import('$lib/db/schema.js');
	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	return { db, sqlite };
});
vi.mock('$lib/storage/index.js', () => ({ getStorage: vi.fn() }));
vi.mock('$lib/server/integrations.js', () => ({ mirrorPut: vi.fn(), mirrorDelete: vi.fn() }));

import { eq } from 'drizzle-orm';
import { db } from '$lib/db/index.js';
import { users, vehicles } from '$lib/db/schema.js';
import { actions } from '../routes/(app)/vehicles/[id]/edit/+page.server.js';

const OWNER = 'u_1';
const VEHICLE = 'v_1';

function event(fd: FormData, currency = 'EUR') {
	return {
		request: { formData: async () => fd },
		locals: { user: { id: OWNER, settings: { currency } } },
		params: { id: VEHICLE }
	} as never;
}

function vehicleForm(fields: Record<string, string>) {
	const fd = new FormData();
	fd.append('name', 'Vespa');
	fd.append('make', 'Piaggio');
	fd.append('model', 'GTS');
	fd.append('year', '2020');
	for (const [k, v] of Object.entries(fields)) fd.append(k, v);
	return fd;
}

function storedVehicle() {
	return db.query.vehicles.findFirst({ where: eq(vehicles.id, VEHICLE) });
}

beforeEach(async () => {
	await db.delete(vehicles);
	await db.delete(users);
	await db.insert(users).values({ id: OWNER, email: 'owner@example.com' });
	await db.insert(vehicles).values({
		id: VEHICLE,
		user_id: OWNER,
		name: 'Vespa',
		make: 'Piaggio',
		model: 'GTS',
		year: 2020
	});
});

describe('purchase/sold price currency stamping', () => {
	it('stamps the account currency when a price is first set', async () => {
		await actions.update(event(vehicleForm({ purchase_price: '4500' }), 'EUR'));
		const vehicle = await storedVehicle();
		expect(vehicle?.purchase_price_cents).toBe(450000);
		expect(vehicle?.purchase_price_currency).toBe('EUR');
	});

	it('does not re-stamp the currency when an unrelated field is saved and the price is unchanged', async () => {
		await actions.update(event(vehicleForm({ purchase_price: '4500' }), 'EUR'));

		// user later switches their account currency, then edits an unrelated field (name)
		// without touching the purchase price
		await actions.update(event(vehicleForm({ name: 'Vespa GTS', purchase_price: '4500' }), 'USD'));

		const vehicle = await storedVehicle();
		expect(vehicle?.purchase_price_cents).toBe(450000);
		expect(vehicle?.purchase_price_currency).toBe('EUR');
	});

	it('re-stamps the currency when the price is actually changed', async () => {
		await actions.update(event(vehicleForm({ purchase_price: '4500' }), 'EUR'));
		await actions.update(event(vehicleForm({ purchase_price: '5000' }), 'USD'));

		const vehicle = await storedVehicle();
		expect(vehicle?.purchase_price_cents).toBe(500000);
		expect(vehicle?.purchase_price_currency).toBe('USD');
	});

	it('clears the currency when the price is cleared', async () => {
		await actions.update(event(vehicleForm({ purchase_price: '4500' }), 'EUR'));
		await actions.update(event(vehicleForm({ purchase_price: '' }), 'EUR'));

		const vehicle = await storedVehicle();
		expect(vehicle?.purchase_price_cents).toBeNull();
		expect(vehicle?.purchase_price_currency).toBeNull();
	});
});
