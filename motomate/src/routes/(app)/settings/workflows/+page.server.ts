import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getWorkflowRulesByUser,
	toggleWorkflowRule,
	deleteWorkflowRule,
	seedPresetRulesForUser,
	updateWorkflowRuleTrigger
} from '$lib/db/repositories/workflow.js';
import { RuleTriggerSchema } from '$lib/validators/schemas.js';

export const load: PageServerLoad = async ({ locals }) => {
	const rules = await getWorkflowRulesByUser(locals.user!.id);
	return { rules };
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
