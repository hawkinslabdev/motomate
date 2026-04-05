import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getNotifications,
	getNotificationsTotal,
	markAllRead,
	markRead,
	deleteNotification,
	deleteReadNotifications
} from '$lib/workflow/channels/inapp.js';

const PER_PAGE = 20;

export const load: PageServerLoad = async ({ locals, url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const filter = url.searchParams.get('filter') === 'unread' ? 'unread' : 'all';
	const offset = (page - 1) * PER_PAGE;

	const [items, total] = await Promise.all([
		getNotifications(locals.user!.id, PER_PAGE, offset, filter),
		getNotificationsTotal(locals.user!.id, filter)
	]);

	return {
		notifications: items,
		total,
		page,
		perPage: PER_PAGE,
		filter
	};
};

export const actions: Actions = {
	markAllRead: async ({ locals }) => {
		await markAllRead(locals.user!.id);
		return { markedAll: true };
	},

	markRead: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing id' });
		await markRead(id, locals.user!.id);
		return { marked: true };
	},

	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing id' });
		await deleteNotification(id, locals.user!.id);
		return { deleted: true };
	},

	deleteRead: async ({ locals }) => {
		await deleteReadNotifications(locals.user!.id);
		return { deletedRead: true };
	}
};
