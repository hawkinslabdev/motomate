import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createVehicle } from '$lib/db/repositories/vehicles.js';
import { CreateVehicleSchema } from '$lib/validators/schemas.js';
import { resolveDistanceUnitPreference } from '$lib/utils/measurement.js';

export const load: PageServerLoad = async ({ locals }) => ({
	defaultOdometerUnit: resolveDistanceUnitPreference(locals.user?.settings?.odometer_unit)
});

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const raw = Object.fromEntries(await request.formData());
		const input = {
			...raw,
			year: Number(raw.year),
			current_odometer: Number(raw.current_odometer ?? 0)
		};
		const parsed = CreateVehicleSchema.safeParse(input);
		if (!parsed.success) {
			return fail(400, { errors: parsed.error.flatten().fieldErrors, values: raw });
		}
		const vehicle = await createVehicle(locals.user!.id, parsed.data);
		redirect(302, `/vehicles/${vehicle.id}`);
	}
};
