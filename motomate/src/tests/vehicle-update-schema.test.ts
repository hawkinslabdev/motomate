import { describe, it, expect } from 'vitest';
import { UpdateVehicleSchema } from '../lib/validators/schemas.js';

describe('UpdateVehicleSchema', () => {
	it('leaves omitted fields out instead of applying create defaults', () => {
		expect(UpdateVehicleSchema.parse({ meta: { hidden_tabs: ['travels'] } })).toEqual({
			meta: { hidden_tabs: ['travels'] }
		});
	});

	it('keeps fields that are sent', () => {
		expect(UpdateVehicleSchema.parse({ type: 'bike', odometer_unit: 'mi' })).toEqual({
			type: 'bike',
			odometer_unit: 'mi'
		});
	});
});
