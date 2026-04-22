import type { ActiveTracker, RuleTrigger, TaskTemplate, Vehicle } from '$lib/db/schema.js';
import {
	DEFAULT_ODOMETER_UNIT,
	areMeasurementsComparable,
	compareMeasurements,
	getMeasurementBasis,
	isDistanceUnit,
	resolveMeasurementValue,
	type DistanceUnit,
	type MeasurementBasis,
	type MeasurementUnit,
	type MeasurementValue
} from '$lib/utils/measurement.js';

export type WorkflowMaintenanceTrigger = {
	kind: 'maintenance';
	phase: 'upcoming' | 'overdue';
	basis: 'distance';
	threshold: number;
	legacyType: 'odometer_upcoming' | 'odometer_overdue';
};

export type NormalizedWorkflowTrigger =
	| WorkflowMaintenanceTrigger
	| {
			kind: 'date';
			phase: 'upcoming' | 'overdue';
			threshold: number;
			legacyType: 'date_upcoming' | 'date_overdue';
	  }
	| {
			kind: 'calendar_date';
			month: number;
			day: number;
			legacyType: 'calendar_date';
	  }
	| {
			kind: 'no_odometer_update';
			days: number;
			legacyType: 'no_odometer_update';
	  }
	| {
			kind: 'document_expiring';
			daysBefore: number;
			legacyType: 'document_expiring';
	  };

type VehicleMeasurementSource = Pick<
	Vehicle,
	'current_measurement' | 'current_measurement_unit' | 'current_odometer' | 'odometer_unit'
>;

type TrackerMeasurementSource = Pick<
	ActiveTracker,
	'next_due_measurement' | 'next_due_odometer' | 'measurement_unit'
>;

type TrackerTemplateSource = Pick<TaskTemplate, 'name' | 'interval_km'>;

export type ComparableTrackerMeasurement = {
	basis: MeasurementBasis;
	unit: MeasurementUnit;
	currentMeasurement: MeasurementValue;
	dueMeasurement: MeasurementValue;
	delta: number;
	absoluteDelta: number;
	usedLegacyFallback: boolean;
};

export type MaintenanceTriggerEvaluation = {
	trigger: WorkflowMaintenanceTrigger;
	measurement: ComparableTrackerMeasurement;
	trackerName: string;
	matches: boolean;
	readyAtCurrentMeasurement: boolean;
	measurementUntilFire: number;
	measurementValue: number;
	legacyDistanceValue: number;
	legacyAliasKey: 'km_remaining' | 'km_over';
	legacyAliasValue: number;
	measurementRelation: 'remaining' | 'overdue';
};

export type DateTrigger = Extract<NormalizedWorkflowTrigger, { kind: 'date' }>;

export type DateTriggerEvaluation = {
	trigger: DateTrigger;
	matches: boolean;
	fireAt: string;
	daysValue: number;
	daysUntilFire: number;
	daysUntilDue: number;
	daysOverdue: number;
	relation: 'remaining' | 'overdue';
};

type MeasurementPairCandidate = {
	measurement: MeasurementValue;
	usedLegacyFallback: boolean;
};

function resolveLegacyDistanceMeasurement(
	value: number | null | undefined,
	unit: MeasurementUnit | null | undefined
): MeasurementValue | null {
	if (value == null) return null;
	const distanceUnit: DistanceUnit = isDistanceUnit(unit) ? unit : DEFAULT_ODOMETER_UNIT;
	return resolveMeasurementValue(value, distanceUnit);
}

function getVehicleMeasurementCandidates(
	vehicle: VehicleMeasurementSource
): MeasurementPairCandidate[] {
	const candidates: MeasurementPairCandidate[] = [];
	const canonical = resolveMeasurementValue(
		vehicle.current_measurement,
		vehicle.current_measurement_unit
	);
	if (canonical) {
		candidates.push({ measurement: canonical, usedLegacyFallback: false });
	}

	const legacy = resolveLegacyDistanceMeasurement(vehicle.current_odometer, vehicle.odometer_unit);
	if (
		legacy &&
		!candidates.some(({ measurement }) => compareMeasurements(measurement, legacy) === 0)
	) {
		candidates.push({ measurement: legacy, usedLegacyFallback: true });
	}

	return candidates;
}

function getTrackerMeasurementCandidates(
	tracker: TrackerMeasurementSource
): MeasurementPairCandidate[] {
	const candidates: MeasurementPairCandidate[] = [];
	const canonical = resolveMeasurementValue(tracker.next_due_measurement, tracker.measurement_unit);
	if (canonical) {
		candidates.push({ measurement: canonical, usedLegacyFallback: false });
	}

	const legacy = resolveLegacyDistanceMeasurement(
		tracker.next_due_odometer,
		tracker.measurement_unit
	);
	if (
		legacy &&
		!candidates.some(({ measurement }) => compareMeasurements(measurement, legacy) === 0)
	) {
		candidates.push({ measurement: legacy, usedLegacyFallback: true });
	}

	return candidates;
}

export function normalizeWorkflowTrigger(trigger: RuleTrigger): NormalizedWorkflowTrigger {
	switch (trigger.type) {
		case 'odometer_upcoming':
			return {
				kind: 'maintenance',
				phase: 'upcoming',
				basis: 'distance',
				threshold: trigger.km_before,
				legacyType: trigger.type
			};
		case 'odometer_overdue':
			return {
				kind: 'maintenance',
				phase: 'overdue',
				basis: 'distance',
				threshold: trigger.km_past,
				legacyType: trigger.type
			};
		case 'date_upcoming':
			return {
				kind: 'date',
				phase: 'upcoming',
				threshold: trigger.days_before,
				legacyType: trigger.type
			};
		case 'date_overdue':
			return {
				kind: 'date',
				phase: 'overdue',
				threshold: trigger.days_past,
				legacyType: trigger.type
			};
		case 'calendar_date':
			return {
				kind: 'calendar_date',
				month: trigger.month,
				day: trigger.day,
				legacyType: trigger.type
			};
		case 'no_odometer_update':
			return {
				kind: 'no_odometer_update',
				days: trigger.days,
				legacyType: trigger.type
			};
		case 'document_expiring':
			return {
				kind: 'document_expiring',
				daysBefore: trigger.days_before,
				legacyType: trigger.type
			};
	}
}

export function getComparableTrackerMeasurement(
	vehicle: VehicleMeasurementSource,
	tracker: TrackerMeasurementSource,
	requiredBasis?: MeasurementBasis
): ComparableTrackerMeasurement | null {
	const vehicleCandidates = getVehicleMeasurementCandidates(vehicle);
	const trackerCandidates = getTrackerMeasurementCandidates(tracker);

	for (const vehicleCandidate of vehicleCandidates) {
		for (const trackerCandidate of trackerCandidates) {
			if (!areMeasurementsComparable(vehicleCandidate.measurement, trackerCandidate.measurement)) {
				continue;
			}

			if (requiredBasis && vehicleCandidate.measurement.basis !== requiredBasis) {
				continue;
			}

			const delta =
				compareMeasurements(vehicleCandidate.measurement, trackerCandidate.measurement) ?? 0;

			return {
				basis: vehicleCandidate.measurement.basis,
				unit: vehicleCandidate.measurement.unit,
				currentMeasurement: vehicleCandidate.measurement,
				dueMeasurement: trackerCandidate.measurement,
				delta,
				absoluteDelta: Math.abs(delta),
				usedLegacyFallback:
					vehicleCandidate.usedLegacyFallback || trackerCandidate.usedLegacyFallback
			};
		}
	}

	return null;
}

export function getTrackerMeasurementUnitLabel(unit: MeasurementUnit): string {
	return unit;
}

export function getLegacyDistanceAliasValue(
	measurement: ComparableTrackerMeasurement
): number | null {
	return measurement.basis === 'distance' ? measurement.absoluteDelta : null;
}

export function getDistanceTriggerPreviewWindowKm(
	trigger: WorkflowMaintenanceTrigger,
	trackerTemplate?: TrackerTemplateSource | null
): number {
	if (trigger.phase === 'upcoming') {
		return trigger.threshold;
	}

	return trigger.threshold === 0
		? 0
		: Math.max(trigger.threshold, trackerTemplate?.interval_km ?? trigger.threshold);
}

function startOfUtcDay(input: Date | string): Date {
	const date = typeof input === 'string' ? new Date(`${input}T00:00:00Z`) : input;
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * 86400000);
}

export function evaluateDateTrigger(
	normalizedTrigger: DateTrigger,
	dueAt: string,
	now: Date = new Date()
): DateTriggerEvaluation {
	const today = startOfUtcDay(now);
	const dueDate = startOfUtcDay(dueAt);
	const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
	const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86400000));

	if (normalizedTrigger.phase === 'upcoming') {
		const fireAt = addDays(dueDate, -normalizedTrigger.threshold).toISOString();
		const matches = today.getTime() >= startOfUtcDay(fireAt).getTime() && daysUntilDue >= 0;
		return {
			trigger: normalizedTrigger,
			matches,
			fireAt,
			daysValue: Math.max(0, daysUntilDue),
			daysUntilFire: Math.max(
				0,
				Math.ceil((startOfUtcDay(fireAt).getTime() - today.getTime()) / 86400000)
			),
			daysUntilDue: Math.max(0, daysUntilDue),
			daysOverdue,
			relation: 'remaining'
		};
	}

	const overdueThreshold = normalizedTrigger.threshold === 0 ? 1 : normalizedTrigger.threshold;
	const fireAt = addDays(dueDate, overdueThreshold).toISOString();
	const matches = today.getTime() >= startOfUtcDay(fireAt).getTime();
	return {
		trigger: normalizedTrigger,
		matches,
		fireAt,
		daysValue: daysOverdue,
		daysUntilFire: Math.max(
			0,
			Math.ceil((startOfUtcDay(fireAt).getTime() - today.getTime()) / 86400000)
		),
		daysUntilDue: Math.max(0, daysUntilDue),
		daysOverdue,
		relation: 'overdue'
	};
}

export function evaluateMaintenanceTrigger(
	normalizedTrigger: WorkflowMaintenanceTrigger,
	vehicle: VehicleMeasurementSource,
	tracker: TrackerMeasurementSource,
	trackerTemplate?: TrackerTemplateSource | null
): MaintenanceTriggerEvaluation | null {
	const measurement = getComparableTrackerMeasurement(vehicle, tracker, normalizedTrigger.basis);
	if (!measurement) {
		return null;
	}

	const trackerName = trackerTemplate?.name ?? '';
	const threshold = normalizedTrigger.threshold;
	const legacyDistanceValue = getLegacyDistanceAliasValue(measurement) ?? 0;

	if (normalizedTrigger.phase === 'upcoming') {
		const matches = measurement.delta >= -threshold && measurement.delta <= 0;
		const measurementUntilFire = Math.max(0, -threshold - measurement.delta);
		const measurementValue = Math.max(0, -measurement.delta);
		return {
			trigger: normalizedTrigger,
			measurement,
			trackerName,
			matches,
			readyAtCurrentMeasurement: matches,
			measurementUntilFire,
			measurementValue,
			legacyDistanceValue,
			legacyAliasKey: 'km_remaining',
			legacyAliasValue: legacyDistanceValue,
			measurementRelation: 'remaining'
		};
	}

	const overdueThreshold = threshold === 0 ? 1 : threshold;
	const matches = measurement.delta >= overdueThreshold;
	const measurementUntilFire = Math.max(0, overdueThreshold - measurement.delta);
	const measurementValue = Math.max(0, measurement.delta);

	return {
		trigger: normalizedTrigger,
		measurement,
		trackerName,
		matches,
		readyAtCurrentMeasurement: matches,
		measurementUntilFire,
		measurementValue,
		legacyDistanceValue,
		legacyAliasKey: 'km_over',
		legacyAliasValue: legacyDistanceValue,
		measurementRelation: 'overdue'
	};
}

export function buildMaintenanceNotificationVars(
	vehicleName: string,
	evaluation: MaintenanceTriggerEvaluation,
	trackerId?: string
): Record<string, string | number> {
	const vars: Record<string, string | number> = {
		vehicle_name: vehicleName,
		tracker_name: evaluation.trackerName,
		measurement_value: evaluation.measurementValue,
		measurement_unit: getTrackerMeasurementUnitLabel(evaluation.measurement.unit),
		measurement_basis: evaluation.measurement.basis,
		measurement_delta: evaluation.measurement.absoluteDelta,
		measurement_relation: evaluation.measurementRelation,
		current_measurement: evaluation.measurement.currentMeasurement.value,
		due_measurement: evaluation.measurement.dueMeasurement.value
	};

	if (trackerId) {
		vars.tracker_id = trackerId;
	}

	if (evaluation.measurement.basis === 'distance') {
		vars[evaluation.legacyAliasKey] = evaluation.legacyAliasValue;
	}

	return vars;
}

export function getMeasurementBasisFromUnit(unit: MeasurementUnit): MeasurementBasis {
	return getMeasurementBasis(unit);
}
