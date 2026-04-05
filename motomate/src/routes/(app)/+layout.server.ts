import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getVehiclesByUser } from '$lib/db/repositories/vehicles.js';
import { getUnreadCount } from '$lib/workflow/channels/inapp.js';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');

	// Redirect to onboarding if not done (except for onboarding itself and settings)
	if (
		!locals.user.onboarding_done &&
		!url.pathname.startsWith('/onboarding') &&
		!url.pathname.startsWith('/settings')
	) {
		redirect(302, '/onboarding');
	}

	const allVehicles = await getVehiclesByUser(locals.user.id, false);
	const vehicles = allVehicles.map((v) => ({
		id: v.id,
		name: v.name,
		type: v.type,
		meta: v.meta as { avatar_emoji?: string } | null
	}));

	const unreadCount = await getUnreadCount(locals.user.id);

	return { user: locals.user, vehicles, unreadCount };
};
