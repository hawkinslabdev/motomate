import type { Actions, PageServerLoad } from './$types';
import { updateUserSettings } from '$lib/db/repositories/users.js';

export const load: PageServerLoad = async ({ locals }) => {
	return { user: locals.user! };
};

export const actions: Actions = {
	savePrefs: async ({ request, locals }) => {
		const data = Object.fromEntries(await request.formData());
		await updateUserSettings(locals.user!.id, {
			theme: data.theme as 'system' | 'light' | 'dark',
			currency: String(data.currency ?? 'EUR'),
			odometer_unit: data.odometer_unit as 'km' | 'mi',
			locale: String(data.locale ?? 'en')
		});
		return { savedPrefs: true };
	}
};
