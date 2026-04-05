import type { RuleTrigger, RuleNotification } from '$lib/db/schema.js';

export interface PresetRule {
	name: string;
	description: string;
	trigger: RuleTrigger;
	actions: RuleNotification;
}

export const PRESET_RULES: PresetRule[] = [
	{
		name: 'settings.workflows.presets.maintenanceDueSoonKm',
		description: 'Notify 500 km before any tracker reaches its odometer threshold',
		trigger: { type: 'odometer_upcoming', km_before: 500 },
		actions: {
			title: 'notifications.maintenanceDueSoonKm.title',
			body: 'notifications.maintenanceDueSoonKm.body'
		}
	},
	{
		name: 'settings.workflows.presets.maintenanceOverdueKm',
		description: 'Notify when any tracker is past its odometer threshold',
		trigger: { type: 'odometer_overdue', km_past: 0 },
		actions: {
			title: 'notifications.maintenanceOverdueKm.title',
			body: 'notifications.maintenanceOverdueKm.body'
		}
	},
	{
		name: 'settings.workflows.presets.maintenanceDueSoonDate',
		description: 'Notify 14 days before any tracker reaches its date threshold',
		trigger: { type: 'date_upcoming', days_before: 14 },
		actions: {
			title: 'notifications.maintenanceDueSoonDate.title',
			body: 'notifications.maintenanceDueSoonDate.body'
		}
	},
	{
		name: 'settings.workflows.presets.maintenanceOverdueDate',
		description: 'Notify when any tracker is past its date threshold',
		trigger: { type: 'date_overdue', days_past: 0 },
		actions: {
			title: 'notifications.maintenanceOverdueDate.title',
			body: 'notifications.maintenanceOverdueDate.body'
		}
	},
	{
		name: 'settings.workflows.presets.odometerNudge',
		description: 'Remind to update odometer if not updated in 30 days',
		trigger: { type: 'no_odometer_update', days: 30 },
		actions: {
			title: 'notifications.odometerNudge.title',
			body: 'notifications.odometerNudge.body'
		}
	}
];

/** Interpolate simple {{variable}} templates */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? `{{${key}}}`));
}
