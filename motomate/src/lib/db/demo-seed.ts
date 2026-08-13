import { mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { hash } from '@node-rs/argon2';
import { eq, count, and } from 'drizzle-orm';
import { db } from './index.js';
import { getUserByEmail } from './repositories/users.js';
import {
	users,
	vehicles,
	task_templates,
	active_trackers,
	service_logs,
	finance_transactions,
	workflow_rules,
	documents,
	travels,
	odometer_logs,
	vehicle_notes
} from './schema.js';
import { generateId } from '../utils/id.js';

const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 };

// `static/` is always copied verbatim to this path relative to the app's cwd: by SvelteKit's
// build for `npm run preview`/Docker, and it's just the source directory during `npm run dev`.
// (A path built from this module's own import.meta.url is NOT reliable: bundlers are free to
// nest SSR chunks arbitrarily deep, so a sibling "demo-assets" folder next to the compiled chunk
// isn't guaranteed to exist where Docker copies it.)
const ASSETS_DIR = join(process.cwd(), 'static', 'demo-assets');

function copyAssetToStorage(assetName: string, storageKey: string): boolean {
	const storagePath = process.env.STORAGE_LOCAL_PATH ?? './uploads';
	const destPath = join(storagePath, storageKey);
	if (existsSync(destPath)) return true;
	try {
		const destDir = dirname(destPath);
		if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
		copyFileSync(join(ASSETS_DIR, assetName), destPath);
		return true;
	} catch {
		return false;
	}
}

async function patchDemoContent(userId: string, vehicleId: string): Promise<void> {
	// Finance: dealer 1000 km service
	const [{ value: ftCount }] = await db
		.select({ value: count() })
		.from(finance_transactions)
		.where(eq(finance_transactions.vehicle_id, vehicleId));
	if (ftCount < 3) {
		await db.insert(finance_transactions).values({
			id: generateId(),
			vehicle_id: vehicleId,
			user_id: userId,
			category: 'maintenance',
			amount_cents: 28500,
			currency: 'EUR',
			notes: '1000 km dealer service. Oil, filters, chain & brake inspection',
			performed_at: '2022-05-20',
			odometer_at_transaction: 1000,
			measurement_at_transaction: 1000,
			measurement_unit: 'km'
		});
	}

	// Odometer logs
	const [{ value: odoCount }] = await db
		.select({ value: count() })
		.from(odometer_logs)
		.where(eq(odometer_logs.vehicle_id, vehicleId));
	if (odoCount < 3) {
		await db.insert(odometer_logs).values([
			{
				id: generateId(),
				vehicle_id: vehicleId,
				user_id: userId,
				odometer: 14200,
				measurement: 14200,
				measurement_unit: 'km',
				kind: 'odometer',
				recorded_at: '2025-01-15'
			},
			{
				id: generateId(),
				vehicle_id: vehicleId,
				user_id: userId,
				odometer: 16800,
				measurement: 16800,
				measurement_unit: 'km',
				kind: 'odometer',
				recorded_at: '2025-07-10'
			},
			{
				id: generateId(),
				vehicle_id: vehicleId,
				user_id: userId,
				odometer: 17900,
				measurement: 17900,
				measurement_unit: 'km',
				remark: 'Spring prep',
				kind: 'odometer',
				recorded_at: '2026-03-01'
			}
		]);
	}

	// Always ensure asset files are present in uploads (idempotent & skips if file exists)
	const pdfKey = 'demo/dealer-service-1000km.pdf';
	const gpxKey = 'demo/eifel-route.gpx';
	copyAssetToStorage('dealer-service-1000km.pdf', pdfKey);
	copyAssetToStorage('eifel-route.gpx', gpxKey);

	// PDF document DB record
	const [{ value: docCount }] = await db
		.select({ value: count() })
		.from(documents)
		.where(eq(documents.vehicle_id, vehicleId));
	if (docCount === 0) {
		await db.insert(documents).values({
			id: generateId(),
			vehicle_id: vehicleId,
			user_id: userId,
			name: 'dealer-service-invoice-1000km.pdf',
			title: 'Dealer service invoice; 1000 km',
			doc_type: 'service',
			storage_key: pdfKey,
			mime_type: 'application/pdf',
			size_bytes: 66156
		});
	}

	// GPX travel DB records
	const [{ value: travelCount }] = await db
		.select({ value: count() })
		.from(travels)
		.where(eq(travels.vehicle_id, vehicleId));
	if (travelCount === 0) {
		const gpxDocId = generateId();
		await db.insert(documents).values({
			id: gpxDocId,
			vehicle_id: vehicleId,
			user_id: userId,
			name: 'eifel-route.gpx',
			title: 'Eifel Route, Germany',
			doc_type: 'route',
			storage_key: gpxKey,
			mime_type: 'application/gpx+xml',
			size_bytes: 384624
		});
		await db.insert(travels).values({
			id: generateId(),
			vehicle_id: vehicleId,
			user_id: userId,
			title: 'Germany, Eifel',
			start_date: '2025-06-14',
			duration_days: 2,
			remark: 'Weekend tour through the Eifel region',
			total_expenses_cents: 18000,
			currency: 'EUR',
			gpx_document_ids: [gpxDocId, null]
		});
	}
}

async function patchDemoNotes(userId: string, vehicleId: string): Promise<void> {
	const [{ value: noteCount }] = await db
		.select({ value: count() })
		.from(vehicle_notes)
		.where(eq(vehicle_notes.vehicle_id, vehicleId));
	if (noteCount > 0) return;

	const pdfDoc = await db.query.documents.findFirst({
		where: and(eq(documents.vehicle_id, vehicleId), eq(documents.doc_type, 'service'))
	});
	const gpxDoc = await db.query.documents.findFirst({
		where: and(eq(documents.vehicle_id, vehicleId), eq(documents.doc_type, 'route'))
	});

	await db.insert(vehicle_notes).values([
		{
			id: generateId(),
			vehicle_id: vehicleId,
			user_id: userId,
			title: 'Suspension setup',
			content: `Front preload at position 3 of 5. Rear one click softer than stock for solo riding, add one click for two-up.\n\nDealer noted initial settings at the 1000 km service. See [Dealer service invoice; 1000 km](/api/files?key=demo/dealer-service-1000km.pdf) for the original values.\n\nFork oil last changed at 8000 km. Next change around 20000 km or if dive under braking gets worse?!`,
			doc_refs: pdfDoc ? [pdfDoc.id] : []
		},
		{
			id: generateId(),
			vehicle_id: vehicleId,
			user_id: userId,
			title: 'Eifel weekend',
			content: `## Route notes\n\nTwo days, ~450 km. Best in June before it gets too busy. Start early on day two to beat tourist traffic near the Nürburgring.\n\nFuel stop in Adenau. Pistenklause has good food and parking for bikes out front.\n\nFull GPX: [Eifel Route, Germany](/api/files?key=demo/eifel-route.gpx)\n\n## Packing list\n\n- Rain gear (suit or just a rain jacket)\n- Tool kit and tire plugs\n- Cash for toll roads`,
			doc_refs: gpxDoc ? [gpxDoc.id] : []
		}
	]);
}

async function patchWorkflowRules(userId: string, vehicleId: string): Promise<void> {
	const existing = await db.query.workflow_rules.findFirst({
		where: eq(workflow_rules.user_id, userId)
	});
	if (existing) return;

	await db.insert(workflow_rules).values([
		{
			id: generateId(),
			user_id: userId,
			vehicle_id: vehicleId,
			name: 'Oil change overdue',
			description: 'Notify when oil change is past due by 500 km',
			trigger: { type: 'odometer_overdue', km_past: 500 },
			actions: {
				title: 'Oil change overdue',
				body: 'Your Honda CB500F is due for an oil change.'
			},
			enabled: true
		},
		{
			id: generateId(),
			user_id: userId,
			vehicle_id: vehicleId,
			name: 'Upcoming service reminder',
			description: 'Notify 7 days before a tracker is due by date',
			trigger: { type: 'date_upcoming', days_before: 7 },
			actions: { title: 'Service reminder', body: 'A scheduled service is coming up in 7 days.' },
			enabled: true
		},
		{
			id: generateId(),
			user_id: userId,
			vehicle_id: null,
			name: 'No odometer update',
			description: 'Notify if no odometer reading logged in 30 days',
			trigger: { type: 'no_odometer_update', days: 30 },
			actions: {
				title: 'No recent activity',
				body: 'No odometer update logged in the last 30 days.'
			},
			enabled: false
		}
	]);
}

export async function seedDemo(): Promise<void> {
	const existing = await getUserByEmail('demo@motomate.local');
	if (existing) {
		const vehicle = await db.query.vehicles.findFirst({
			where: eq(vehicles.user_id, existing.id)
		});
		if (vehicle) {
			await patchWorkflowRules(existing.id, vehicle.id);
			await patchDemoContent(existing.id, vehicle.id);
			await patchDemoNotes(existing.id, vehicle.id);
		}
		return;
	}

	const passwordHash = await hash('password123', ARGON2_OPTS);
	const userId = generateId();
	const vehicleId = generateId();
	const oilTmplId = generateId();
	const chainTmplId = generateId();
	const tireTmplId = generateId();
	const oilTrackerId = generateId();
	const chainTrackerId = generateId();
	const tireTrackerId = generateId();

	await db.insert(users).values({
		id: userId,
		email: 'demo@motomate.local',
		password_hash: passwordHash,
		onboarding_done: true,
		settings: {
			theme: 'system',
			currency: 'EUR',
			odometer_unit: 'km',
			locale: 'en',
			avatar_seed: generateId()
		}
	});

	await db.insert(vehicles).values({
		id: vehicleId,
		user_id: userId,
		type: 'motorcycle',
		name: 'Honda CB500F',
		make: 'Honda',
		model: 'CB500F',
		year: 2021,
		current_odometer: 18400,
		current_measurement: 18400,
		current_measurement_unit: 'km',
		odometer_unit: 'km',
		meta: { avatar_emoji: '🏍️' }
	});

	await db.insert(task_templates).values([
		{
			id: oilTmplId,
			user_id: userId,
			vehicle_id: vehicleId,
			name: 'Oil & Filter Change',
			category: 'oil',
			description: 'Engine oil and oil filter replacement',
			interval_km: 10000,
			interval_measurement: 10000,
			interval_unit: 'km',
			interval_months: 12,
			is_preset: true
		},
		{
			id: chainTmplId,
			user_id: userId,
			vehicle_id: vehicleId,
			name: 'Chain Clean & Lube',
			category: 'chain',
			description: 'Clean and lubricate the chain',
			interval_km: 500,
			interval_measurement: 500,
			interval_unit: 'km',
			is_preset: true
		},
		{
			id: tireTmplId,
			user_id: userId,
			vehicle_id: vehicleId,
			name: 'Tire Pressure & Wear Check',
			category: 'tire',
			description: 'Check tyre pressure and inspect tread depth',
			interval_months: 1,
			is_preset: true
		}
	]);

	await db.insert(active_trackers).values([
		{
			id: oilTrackerId,
			vehicle_id: vehicleId,
			template_id: oilTmplId,
			last_done_at: '2025-04-10',
			last_done_odometer: 8000,
			last_done_measurement: 8000,
			next_due_odometer: 18000,
			next_due_measurement: 18000,
			next_due_at: '2026-04-10',
			measurement_unit: 'km',
			status: 'overdue'
		},
		{
			id: chainTrackerId,
			vehicle_id: vehicleId,
			template_id: chainTmplId,
			last_done_at: '2026-04-15',
			last_done_odometer: 17950,
			last_done_measurement: 17950,
			next_due_odometer: 18450,
			next_due_measurement: 18450,
			measurement_unit: 'km',
			status: 'due'
		},
		{
			id: tireTrackerId,
			vehicle_id: vehicleId,
			template_id: tireTmplId,
			last_done_at: '2026-05-05',
			next_due_at: '2026-06-05',
			status: 'ok'
		}
	]);

	await db.insert(service_logs).values([
		{
			id: generateId(),
			vehicle_id: vehicleId,
			performed_at: '2024-10-15',
			odometer_at_service: 3000,
			measurement_at_service: 3000,
			measurement_unit: 'km',
			cost_cents: 4200,
			currency: 'EUR',
			notes: 'Oil & Filter Change'
		},
		{
			id: generateId(),
			vehicle_id: vehicleId,
			tracker_id: oilTrackerId,
			performed_at: '2025-04-10',
			odometer_at_service: 8000,
			measurement_at_service: 8000,
			measurement_unit: 'km',
			cost_cents: 4500,
			currency: 'EUR',
			notes: 'Oil & Filter Change'
		},
		{
			id: generateId(),
			vehicle_id: vehicleId,
			tracker_id: chainTrackerId,
			performed_at: '2025-06-20',
			odometer_at_service: 10500,
			measurement_at_service: 10500,
			measurement_unit: 'km',
			cost_cents: 800,
			currency: 'EUR',
			notes: 'Chain Clean & Lube'
		},
		{
			id: generateId(),
			vehicle_id: vehicleId,
			tracker_id: chainTrackerId,
			performed_at: '2025-09-15',
			odometer_at_service: 13200,
			measurement_at_service: 13200,
			measurement_unit: 'km',
			cost_cents: 800,
			currency: 'EUR',
			notes: 'Chain Clean & Lube'
		},
		{
			id: generateId(),
			vehicle_id: vehicleId,
			tracker_id: chainTrackerId,
			performed_at: '2026-04-15',
			odometer_at_service: 17950,
			measurement_at_service: 17950,
			measurement_unit: 'km',
			cost_cents: 800,
			currency: 'EUR',
			notes: 'Chain Clean & Lube'
		}
	]);

	await db.insert(finance_transactions).values([
		{
			id: generateId(),
			vehicle_id: vehicleId,
			user_id: userId,
			category: 'fuel',
			amount_cents: 6000,
			currency: 'EUR',
			notes: 'Fuel fill-up',
			performed_at: '2026-02-10'
		},
		{
			id: generateId(),
			vehicle_id: vehicleId,
			user_id: userId,
			category: 'accessories',
			amount_cents: 15000,
			currency: 'EUR',
			notes: 'Handlebar grips & bar end weights',
			performed_at: '2025-11-05'
		}
	]);

	await patchWorkflowRules(userId, vehicleId);
	await patchDemoContent(userId, vehicleId);
	await patchDemoNotes(userId, vehicleId);
	console.log('[motomate] Demo data seeded (demo@motomate.local / password123)');
}
