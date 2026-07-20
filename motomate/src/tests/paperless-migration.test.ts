import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

function applyMigration(sqlite: InstanceType<typeof Database>, name: string): void {
	const sql = readFileSync(resolve(process.cwd(), 'drizzle', name), 'utf8').replaceAll(
		'--> statement-breakpoint',
		''
	);
	sqlite.exec(sql);
}

describe('Paperless schema migration', () => {
	it('preserves local documents and backfills legacy event attachment links', () => {
		const sqlite = new Database(':memory:');
		try {
			for (let index = 0; index <= 8; index += 1) {
				const name =
					[
						'0000_messy_pixie.sql',
						'0001_goofy_doctor_doom.sql',
						'0002_left_electro.sql',
						'0003_nice_wonder_man.sql',
						'0004_pretty_galactus.sql',
						'0005_furry_lester.sql',
						'0006_adorable_satana.sql',
						'0007_nostalgic_mauler.sql',
						'0008_blue_reaper.sql'
					][index] ?? '';
				applyMigration(sqlite, name);
			}

			sqlite.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run('u1', 'user@example.test');
			sqlite
				.prepare(
					'INSERT INTO vehicles (id, user_id, name, make, model, year) VALUES (?, ?, ?, ?, ?, ?)'
				)
				.run('v1', 'u1', 'Bike', 'Example', 'One', 2020);
			sqlite
				.prepare(
					'INSERT INTO documents (id, vehicle_id, user_id, name, storage_key, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)'
				)
				.run('d1', 'v1', 'u1', 'receipt.pdf', 'files/u1/d1.pdf', 'application/pdf', 123);
			sqlite
				.prepare(
					'INSERT INTO service_logs (id, vehicle_id, performed_at, odometer_at_service, attachments) VALUES (?, ?, ?, ?, ?)'
				)
				.run('s1', 'v1', '2026-01-01', 100, JSON.stringify(['d1']));
			sqlite
				.prepare(
					'INSERT INTO finance_transactions (id, vehicle_id, user_id, amount_cents, performed_at, attachments) VALUES (?, ?, ?, ?, ?, ?)'
				)
				.run('f1', 'v1', 'u1', 5000, '2026-01-01', JSON.stringify(['d1']));

			applyMigration(sqlite, '0009_cheerful_catseye.sql');

			expect(
				sqlite
					.prepare('SELECT source, storage_key, sync_status FROM documents WHERE id = ?')
					.get('d1')
			).toEqual({ source: 'motomate', storage_key: 'files/u1/d1.pdf', sync_status: 'none' });
			expect(
				sqlite
					.prepare(
						'SELECT target_type, target_id, document_id FROM document_links ORDER BY target_type'
					)
					.all()
			).toEqual([
				{ target_type: 'finance_transaction', target_id: 'f1', document_id: 'd1' },
				{ target_type: 'service_log', target_id: 's1', document_id: 'd1' }
			]);
			expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
		} finally {
			sqlite.close();
		}
	});
});
