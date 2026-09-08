import { runWorkflowChecks } from '$lib/workflow/engine.js';
import { runIntegrationSync } from './integrations.js';
import { sqlite } from '$lib/db/index.js';
import { ts } from './log.js';

const DEFAULT_INTERVAL_HOURS = 1;
const INIT_KEY = Symbol.for('motomate.scheduler.initialized');
const RUNNING_KEY = Symbol.for('motomate.scheduler.running');

export function initScheduler(): void {
	const g = globalThis as Record<symbol, boolean>;
	if (g[INIT_KEY]) return;
	g[INIT_KEY] = true;

	const hours = Number(process.env.CRON_INTERVAL_HOURS ?? DEFAULT_INTERVAL_HOURS);
	const interval = Math.max(hours, 0.1) * 60 * 60 * 1000;

	const run = async () => {
		if (g[RUNNING_KEY]) return;
		g[RUNNING_KEY] = true;
		try {
			await runWorkflowChecks();
		} catch (err) {
			console.error(`${ts()} [MotoMate] Scheduler workflow check failed:`, err);
		}
		try {
			await runIntegrationSync();
		} catch (err) {
			console.error(`${ts()} [MotoMate] Scheduler integration sync failed:`, err);
		}
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
	run();
	console.info(`${ts()} [MotoMate] Scheduler started, interval=${hours}h`);
}
