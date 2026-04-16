export const MEASUREMENT_UNITS = ['km', 'mi', 'h'] as const;

export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

export const DISTANCE_UNITS = ['km', 'mi'] as const;

export type DistanceUnit = (typeof DISTANCE_UNITS)[number];
export type OdometerUnit = DistanceUnit;

export const DURATION_UNITS = ['h'] as const;

export type DurationUnit = (typeof DURATION_UNITS)[number];

export const DEFAULT_DISTANCE_UNIT: DistanceUnit = 'km';
export const DEFAULT_ODOMETER_UNIT: OdometerUnit = DEFAULT_DISTANCE_UNIT;

export type MeasurementBasis = 'distance' | 'duration';

export function isMeasurementUnit(value: unknown): value is MeasurementUnit {
	return typeof value === 'string' && MEASUREMENT_UNITS.includes(value as MeasurementUnit);
}

export function isDistanceUnit(value: unknown): value is DistanceUnit {
	return typeof value === 'string' && DISTANCE_UNITS.includes(value as DistanceUnit);
}

export function isDurationUnit(value: unknown): value is DurationUnit {
	return typeof value === 'string' && DURATION_UNITS.includes(value as DurationUnit);
}

export function getMeasurementBasis(unit: MeasurementUnit): MeasurementBasis {
	return isDistanceUnit(unit) ? 'distance' : 'duration';
}

export function isDistanceMeasurementBasis(unit: MeasurementUnit): unit is DistanceUnit {
	return getMeasurementBasis(unit) === 'distance';
}

export function isDurationMeasurementBasis(unit: MeasurementUnit): unit is DurationUnit {
	return getMeasurementBasis(unit) === 'duration';
}
