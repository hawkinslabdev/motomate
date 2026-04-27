import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	deleteWorkflowRule,
	getWorkflowRulesByUser,
	seedPresetRulesForUser,
	toggleWorkflowRule,
	updateWorkflowRuleTrigger
} from '$lib/db/repositories/workflow.js';
import { getVehiclesByUser } from '$lib/db/repositories/vehicles.js';
import { recomputeTrackerStatuses } from '$lib/db/repositories/maintenance.js';
import { RuleTriggerSchema } from '$lib/validators/schemas.js';
import { computeNextFireInfo } from '$lib/workflow/preview.js';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;

	const [rules, userVehicles] = await Promise.all([
		getWorkflowRulesByUser(userId),
		getVehiclesByUser(userId)
	]);

	const trackersByVehicle = new Map<string, Awaited<ReturnType<typeof recomputeTrackerStatuses>>>();
	for (const vehicle of userVehicles) {
		trackersByVehicle.set(
			vehicle.id,
			await recomputeTrackerStatuses(vehicle.id, vehicle.current_odometer)
		);
	}

	const rulesWithNextFire = await Promise.all(
		rules.map(async (rule) => ({
			...rule,
			nextFire: await computeNextFireInfo(rule, userVehicles, trackersByVehicle)
		}))
	);

	return { rules: rulesWithNextFire };
};

export const actions: Actions = {
	toggle: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id'));
		const enabled = data.get('enabled') === 'true';
		await toggleWorkflowRule(id, locals.user!.id, enabled);
		return { toggled: true };
	},
	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id'));
		await deleteWorkflowRule(id, locals.user!.id);
		return { deleted: true };
	},
	seedPresets: async ({ locals }) => {
		await seedPresetRulesForUser(locals.user!.id);
		return { seeded: true };
	},
	editTrigger: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const rawTrigger = String(data.get('trigger') ?? '');
		if (!id || !rawTrigger) return fail(400, { error: 'Missing fields' });

		let parsed;
		try {
			parsed = RuleTriggerSchema.parse(JSON.parse(rawTrigger));
		} catch {
			return fail(400, { error: 'Invalid trigger data' });
		}

		await updateWorkflowRuleTrigger(id, locals.user!.id, parsed);
		return { edited: true };
	}
};
