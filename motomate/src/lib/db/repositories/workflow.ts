import { eq, and } from 'drizzle-orm';
import { db } from '../index.js';
import { workflow_rules } from '../schema.js';
import { CreateWorkflowRuleSchema, UpdateWorkflowTriggerSchema } from '../../validators/schemas.js';
import type { InsertWorkflowRule, WorkflowRule, RuleTrigger } from '../schema.js';
import { generateId } from '../../utils/id.js';
import { PRESET_RULES } from '../../workflow/rules.js';

export async function createWorkflowRule(userId: string, input: unknown): Promise<WorkflowRule> {
	const parsed = CreateWorkflowRuleSchema.parse(input);
	const id = generateId();
	const row: InsertWorkflowRule = { ...parsed, id, user_id: userId };
	await db.insert(workflow_rules).values(row);
	return db.query.workflow_rules.findFirst({
		where: eq(workflow_rules.id, id)
	}) as Promise<WorkflowRule>;
}

export async function getWorkflowRulesByUser(userId: string): Promise<WorkflowRule[]> {
	return db.query.workflow_rules.findMany({
		where: eq(workflow_rules.user_id, userId),
		orderBy: (r, { asc }) => [asc(r.created_at)]
	});
}

export async function toggleWorkflowRule(
	id: string,
	userId: string,
	enabled: boolean
): Promise<void> {
	await db
		.update(workflow_rules)
		.set({ enabled, updated_at: new Date().toISOString() })
		.where(and(eq(workflow_rules.id, id), eq(workflow_rules.user_id, userId)));
}

export async function deleteWorkflowRule(id: string, userId: string): Promise<void> {
	await db
		.delete(workflow_rules)
		.where(and(eq(workflow_rules.id, id), eq(workflow_rules.user_id, userId)));
}

export async function updateWorkflowRuleTrigger(
	id: string,
	userId: string,
	trigger: RuleTrigger
): Promise<void> {
	const { trigger: validatedTrigger } = UpdateWorkflowTriggerSchema.parse({ id, trigger });
	await db
		.update(workflow_rules)
		.set({ trigger: validatedTrigger, updated_at: new Date().toISOString() })
		.where(and(eq(workflow_rules.id, id), eq(workflow_rules.user_id, userId)));
}

export async function seedPresetRulesForUser(userId: string): Promise<void> {
	const existing = await getWorkflowRulesByUser(userId);
	const existingByName = new Map(existing.map((r) => [r.name, r]));
	for (const preset of PRESET_RULES) {
		const existingRule = existingByName.get(preset.name);
		if (existingRule) {
			// Refresh action template so existing users get updated notification bodies
			await db
				.update(workflow_rules)
				.set({ actions: preset.actions, updated_at: new Date().toISOString() })
				.where(eq(workflow_rules.id, existingRule.id));
		} else {
			await createWorkflowRule(userId, {
				name: preset.name,
				description: preset.description,
				trigger: preset.trigger,
				actions: preset.actions,
				enabled: true
			});
		}
	}
}
