import { vi, describe, it, expect } from 'vitest';

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

import { db } from '#lib/db/index.js';
import { users } from '#lib/db/schema.js';
import {
	createVehicle,
	getVehicleById,
	recomputeCurrentOdometer
} from '#lib/db/repositories/vehicles.js';
import { seedPresetsForVehicle } from '#lib/db/repositories/maintenance.js';

const OWNER = 'u_odo';

describe('vehicle odometer baseline', () => {
	it('keeps the starting odometer after a recompute', async () => {
		await db.insert(users).values({ id: OWNER, email: 'odo@example.com', password_hash: 'x' });
		const vehicle = await createVehicle(OWNER, {
			name: 'Daily',
			make: 'Yamaha',
			model: 'MT-07',
			year: 2020,
			type: 'motorcycle',
			current_odometer: 20000,
			odometer_unit: 'km'
		});

		expect(await recomputeCurrentOdometer(vehicle.id, OWNER)).toBe(20000);
		expect((await getVehicleById(vehicle.id, OWNER))?.current_odometer).toBe(20000);
	});

	it('starts distance trackers from the current odometer', async () => {
		const vehicle = await createVehicle(OWNER, {
			name: 'Second',
			make: 'Honda',
			model: 'CB500F',
			year: 2021,
			type: 'motorcycle',
			current_odometer: 12345,
			odometer_unit: 'km'
		});
		const [{ template, tracker }] = await seedPresetsForVehicle(OWNER, vehicle.id, ['oil'], 12345);
		expect(tracker.next_due_odometer).toBe(12345 + (template.interval_km ?? 0));
	});
});
