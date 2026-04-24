export const MEASUREMENT_UNITS = ['km', 'mi', 'h'] as const;

export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

export const DISTANCE_UNITS = ['km', 'mi'] as const;

export type DistanceUnit = (typeof DISTANCE_UNITS)[number];
export type OdometerUnit = DistanceUnit;

export const DURATION_UNITS = ['h'] as const;

export type DurationUnit = (typeof DURATION_UNITS)[number];

export const DEFAULT_ODOMETER_UNIT: OdometerUnit = 'km';

export type MeasurementBasis = 'distance' | 'duration';

export type MeasurementValue = {
	value: number;
	unit: MeasurementUnit;
	basis: MeasurementBasis;
};

export function isMeasurementUnit(value: unknown): value is MeasurementUnit {
	return typeof value === 'string' && MEASUREMENT_UNITS.includes(value as MeasurementUnit);
}

export function isDistanceUnit(value: unknown): value is DistanceUnit {
	return typeof value === 'string' && DISTANCE_UNITS.includes(value as DistanceUnit);
}

export function getMeasurementBasis(unit: MeasurementUnit): MeasurementBasis {
	return isDistanceUnit(unit) ? 'distance' : 'duration';
}

export function resolveMeasurementValue(
	value: number | null | undefined,
	unit: MeasurementUnit | null | undefined
): MeasurementValue | null {
	if (value == null || unit == null || !isMeasurementUnit(unit)) {
		return null;
	}

	return {
		value,
		unit,
		basis: getMeasurementBasis(unit)
	};
}

export function isDistanceMeasurementValue(
	measurement: MeasurementValue | null | undefined
): measurement is MeasurementValue & { unit: DistanceUnit; basis: 'distance' } {
	return measurement?.basis === 'distance' && isDistanceUnit(measurement.unit);
}

export function areMeasurementsComparable(
	a: MeasurementValue | null | undefined,
	b: MeasurementValue | null | undefined
): boolean {
	return a != null && b != null && a.basis === b.basis && a.unit === b.unit;
}

export function compareMeasurements(
	a: MeasurementValue | null | undefined,
	b: MeasurementValue | null | undefined
): number | null {
	if (a == null || b == null || !areMeasurementsComparable(a, b)) {
		return null;
	}

	return a.value - b.value;
}

export function maxComparableMeasurement(
	measurements: Array<MeasurementValue | null | undefined>,
	anchor?: MeasurementValue | null
): MeasurementValue | null {
	const comparable = measurements.filter((measurement): measurement is MeasurementValue => {
		if (measurement == null) return false;
		return anchor ? areMeasurementsComparable(measurement, anchor) : true;
	});

	if (comparable.length === 0) {
		return null;
	}

	let max = comparable[0];
	for (const measurement of comparable.slice(1)) {
		if ((compareMeasurements(measurement, max) ?? 0) > 0) {
			max = measurement;
		}
	}

	return max;
}

export function getDistanceUnitTranslationKey(unit: DistanceUnit): 'units.km' | 'units.mi' {
	return unit === 'km' ? 'units.km' : 'units.mi';
}
