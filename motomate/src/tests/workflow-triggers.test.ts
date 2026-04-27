import { describe, expect, it } from 'vitest';
import {
	buildMaintenanceNotificationVars,
	evaluateDateTrigger,
	evaluateMaintenanceTrigger,
	normalizeWorkflowTrigger
} from '../lib/workflow/triggers.js';

describe('workflow trigger normalization', () => {
	it('normalizes legacy odometer triggers into maintenance triggers', () => {
		const normalized = normalizeWorkflowTrigger({ type: 'odometer_upcoming', km_before: 500 });
		expect(normalized).toEqual({
			kind: 'maintenance',
			phase: 'upcoming',
			basis: 'distance',
			threshold: 500,
			legacyType: 'odometer_upcoming'
		});
	});

	it('normalizes document expiry triggers without changing persisted shape assumptions', () => {
		const normalized = normalizeWorkflowTrigger({ type: 'document_expiring', days_before: 14 });
		expect(normalized).toEqual({
			kind: 'document_expiring',
			daysBefore: 14,
			legacyType: 'document_expiring'
		});
	});
});

describe('workflow trigger evaluation', () => {
	it('evaluates maintenance upcoming triggers with canonical measurement fields', () => {
		const trigger = normalizeWorkflowTrigger({ type: 'odometer_upcoming', km_before: 500 });
		if (trigger.kind !== 'maintenance') throw new Error('expected maintenance trigger');

		const evaluation = evaluateMaintenanceTrigger(
			trigger,
			{
				current_measurement: 1500,
				current_measurement_unit: 'km',
				current_odometer: 1500,
				odometer_unit: 'km'
			},
			{
				next_due_measurement: 1800,
				next_due_odometer: 1800,
				measurement_unit: 'km'
			},
			{ name: 'Oil change', interval_km: 1000 }
		);

		expect(evaluation).not.toBeNull();
		expect(evaluation?.matches).toBe(true);
		expect(evaluation?.measurementUntilFire).toBe(0);
		expect(evaluation?.measurementValue).toBe(300);
		expect(evaluation?.legacyAliasKey).toBe('km_remaining');
		expect(evaluation?.legacyAliasValue).toBe(300);
	});

	it('returns null for non-comparable maintenance measurements', () => {
		const trigger = normalizeWorkflowTrigger({ type: 'odometer_overdue', km_past: 0 });
		if (trigger.kind !== 'maintenance') throw new Error('expected maintenance trigger');

		const evaluation = evaluateMaintenanceTrigger(
			trigger,
			{
				current_measurement: 20,
				current_measurement_unit: 'mi',
				current_odometer: 20,
				odometer_unit: 'mi'
			},
			{
				next_due_measurement: 100,
				next_due_odometer: 100,
				measurement_unit: 'km'
			},
			{ name: 'Chain service', interval_km: 100 }
		);

		expect(evaluation).toBeNull();
	});

	it('evaluates date overdue triggers and preserves overdue relation metadata', () => {
		const trigger = normalizeWorkflowTrigger({ type: 'date_overdue', days_past: 0 });
		if (trigger.kind !== 'date') throw new Error('expected date trigger');

		const evaluation = evaluateDateTrigger(trigger, '2026-04-19', new Date('2026-04-21T12:00:00Z'));
		expect(evaluation.relation).toBe('overdue');
		expect(evaluation.daysOverdue).toBe(2);
		expect(typeof evaluation.matches).toBe('boolean');
	});

	it('builds maintenance notification vars with neutral and legacy distance aliases', () => {
		const trigger = normalizeWorkflowTrigger({ type: 'odometer_overdue', km_past: 0 });
		if (trigger.kind !== 'maintenance') throw new Error('expected maintenance trigger');

		const evaluation = evaluateMaintenanceTrigger(
			trigger,
			{
				current_measurement: 2000,
				current_measurement_unit: 'km',
				current_odometer: 2000,
				odometer_unit: 'km'
			},
			{
				next_due_measurement: 1800,
				next_due_odometer: 1800,
				measurement_unit: 'km'
			},
			{ name: 'Brake check', interval_km: 1000 }
		);

		if (!evaluation) throw new Error('expected evaluation');

		const vars = buildMaintenanceNotificationVars('Honda', evaluation, 'tracker-1');
		expect(vars.measurement_value).toBe(200);
		expect(vars.measurement_unit).toBe('km');
		expect(vars.measurement_basis).toBe('distance');
		expect(vars.current_measurement).toBe(2000);
		expect(vars.due_measurement).toBe(1800);
		expect(vars.km_over).toBe(200);
		expect(vars.tracker_id).toBe('tracker-1');
	});
});
