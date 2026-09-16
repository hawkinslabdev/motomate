export function defaultVehicleEmoji(type: string | undefined): string {
	switch (type) {
		case 'scooter':
			return '🛵';
		case 'bike':
			return '🚲';
		case 'other':
			return '🚗';
		default:
			return '🏍';
	}
}
