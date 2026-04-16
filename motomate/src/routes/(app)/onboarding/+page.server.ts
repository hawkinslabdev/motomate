import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createVehicle, insertOdometerLog } from '$lib/db/repositories/vehicles.js';
import {
	seedPresetsForVehicle,
	updateTrackerAfterService
} from '$lib/db/repositories/maintenance.js';
import { createServiceLog } from '$lib/db/repositories/service-logs.js';
import { markOnboardingDone } from '$lib/db/repositories/users.js';
import { seedPresetRulesForUser } from '$lib/db/repositories/workflow.js';
import en from '$lib/i18n/locales/en.json';
import de from '$lib/i18n/locales/de.json';
import fr from '$lib/i18n/locales/fr.json';
import es from '$lib/i18n/locales/es.json';
import it from '$lib/i18n/locales/it.json';
import nl from '$lib/i18n/locales/nl.json';
import pt from '$lib/i18n/locales/pt.json';
import { DEFAULT_ODOMETER_UNIT, type OdometerUnit } from '$lib/utils/measurement.js';

type LocaleMessages = {
	onboarding: {
		lastService: { setupNote: string };
		presets: {
			tasks: Record<string, string>;
			descriptions: Record<string, string>;
		};
	};
};

const localeMessages: Record<string, LocaleMessages> = { en, de, fr, es, it, nl, pt };

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user?.onboarding_done) redirect(302, '/dashboard');
	return {};
};

export const actions: Actions = {
	complete: async ({ request, locals }) => {
		const data = Object.fromEntries(await request.formData());
		const userId = locals.user!.id;
		const userLocale = (locals.user as any)?.settings?.locale ?? 'en';
		const messages = localeMessages[userLocale] ?? localeMessages['en'];
		const setupNote = messages.onboarding.lastService.setupNote;
		const tasks = messages.onboarding.presets.tasks;
		const descs = messages.onboarding.presets.descriptions;

		const vehicleType = String(data.vehicle_type ?? 'motorcycle');
		const vehicleInput = {
			type: vehicleType,
			name: String(data.name),
			make: String(data.make),
			model: String(data.model),
			year: Number(data.year),
			vin: String(data.vin ?? '').trim() || undefined,
			license_plate: String(data.license_plate ?? '').trim() || undefined,
			current_odometer: Number(data.odometer ?? 0),
			odometer_unit: (data.odometer_unit ?? DEFAULT_ODOMETER_UNIT) as OdometerUnit
		};

		let vehicle;
		try {
			vehicle = await createVehicle(userId, vehicleInput);
		} catch (e) {
			return fail(400, { error: String(e) });
		}

		const categories = String(data.categories ?? 'oil,tire,chain_lube,chain_tension,brake')
			.split(',')
			.filter(Boolean);

		const nameMap: Record<string, { name: string; description?: string }> = {};
		for (const key of categories) {
			nameMap[key] = { name: tasks[key] ?? key, description: descs[key] };
		}

		const seeded = await seedPresetsForVehicle(
			userId,
			vehicle.id,
			categories,
			0,
			nameMap,
			vehicleType
		);

		const lastServiceDate = String(data.last_service_date ?? '').trim();
		// Clamp to current odometer — a service cannot have happened beyond what the vehicle shows
		const lastServiceOdo = Math.min(
			Number(data.last_service_odometer),
			vehicleInput.current_odometer
		);
		const hasLastService =
			lastServiceDate && /^\d{4}-\d{2}-\d{2}$/.test(lastServiceDate) && lastServiceOdo > 0;

		if (hasLastService) {
			await createServiceLog(userId, {
				vehicle_id: vehicle.id,
				performed_at: lastServiceDate,
				odometer_at_service: lastServiceOdo,
				notes: setupNote
			});

			// Apply last service to all seeded trackers so next_due_odometer = lastServiceOdo + interval_km
			for (const { tracker } of seeded) {
				await updateTrackerAfterService(tracker.id, lastServiceDate, lastServiceOdo);
			}

			// If the current odometer is ahead of the last service reading, record it as a baseline entry
			if (vehicleInput.current_odometer > lastServiceOdo) {
				await insertOdometerLog(vehicle.id, userId, vehicleInput.current_odometer);
			}
		} else if (vehicleInput.current_odometer > 0) {
			// No service info entered — record the starting odometer as a baseline
			await insertOdometerLog(vehicle.id, userId, vehicleInput.current_odometer);
		}

		await markOnboardingDone(userId);
		await seedPresetRulesForUser(userId);
		redirect(302, `/vehicles/${vehicle.id}`);
	}
};
