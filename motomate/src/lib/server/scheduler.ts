import { runWorkflowChecks } from '$lib/workflow/engine.js';
import { sqlite } from '$lib/db/index.js';
import {
	pollProcessingDocumentSyncJobs,
	processNextDocumentSyncJob
} from '$lib/db/repositories/document-sync-jobs.js';

const DEFAULT_INTERVAL_HOURS = 1;
const INIT_KEY = Symbol.for('motomate.scheduler.initialized');
const RUNNING_KEY = Symbol.for('motomate.scheduler.running');
const SYNC_RUNNING_KEY = Symbol.for('motomate.paperless-sync.running');

const ts = () => new Date().toLocaleString('sv');

export function initScheduler(): void {
	const g = globalThis as Record<symbol, boolean>;
	if (g[INIT_KEY]) return;
	g[INIT_KEY] = true;

	const hours = Number(process.env.CRON_INTERVAL_HOURS ?? DEFAULT_INTERVAL_HOURS);
	const interval = Math.max(hours, 0.1) * 60 * 60 * 1000;
	const syncSeconds = Math.max(Number(process.env.PAPERLESS_SYNC_INTERVAL_SECONDS ?? 30), 10);

	const runPaperless = async () => {
		if (g[SYNC_RUNNING_KEY]) return;
		g[SYNC_RUNNING_KEY] = true;
		try {
			const completed = await pollProcessingDocumentSyncJobs();
			let started = 0;
			while (started < 5 && (await processNextDocumentSyncJob())) started += 1;
			if (started > 0 || completed > 0) {
				console.info(
					`${ts()} [MotoMate] Paperless sync jobs started=${started}, completed=${completed}`
				);
			}
		} catch (err) {
			console.error(`${ts()} [MotoMate] Paperless sync processing failed:`, err);
		} finally {
			g[SYNC_RUNNING_KEY] = false;
		}
	};

	const run = async () => {
		if (g[RUNNING_KEY]) return;
		g[RUNNING_KEY] = true;
		try {
			await runWorkflowChecks();
		} catch (err) {
			console.error(`${ts()} [MotoMate] Scheduler workflow check failed:`, err);
		}
		await runPaperless();
		try {
			sqlite.pragma('optimize');
			console.info(`${ts()} [MotoMate] Database OPTIMIZE successful`);
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			console.error(`${ts()} [MotoMate] Database OPTIMIZE failed (${reason})`);
		} finally {
			g[RUNNING_KEY] = false;
		}
	};

	setInterval(run, interval).unref();
	setInterval(runPaperless, syncSeconds * 1000).unref();
	run();
	console.info(
		`${ts()} [MotoMate] Scheduler started, workflow interval=${hours}h, Paperless interval=${syncSeconds}s`
	);
}
