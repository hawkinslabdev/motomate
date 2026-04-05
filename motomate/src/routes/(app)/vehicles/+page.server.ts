import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getVehiclesByUser } from '$lib/db/repositories/vehicles.js';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const includeArchived = url.searchParams.get('archived') === '1';
	const vehicles = await getVehiclesByUser(locals.user.id, includeArchived);
	return { user: locals.user, vehicles, includeArchived };
};

export const actions: Actions = {
	archive: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing vehicle id' });
		const { archiveVehicle } = await import('$lib/db/repositories/vehicles.js');
		await archiveVehicle(id, locals.user!.id);
		return { success: true };
	},
	unarchive: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing vehicle id' });
		const { unarchiveVehicle } = await import('$lib/db/repositories/vehicles.js');
		await unarchiveVehicle(id, locals.user!.id);
		return { success: true };
	}
};
