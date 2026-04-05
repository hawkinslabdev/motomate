import { db } from '$lib/db/index.js';
import { notifications } from '$lib/db/schema.js';
import { eq, count, and, isNull, isNotNull } from 'drizzle-orm';
import { generateId } from '$lib/utils/id.js';

export async function dispatchInApp(
	userId: string,
	vehicleId: string | null,
	title: string,
	body: string
): Promise<void> {
	await db.insert(notifications).values({
		id: generateId(),
		user_id: userId,
		vehicle_id: vehicleId,
		type: 'workflow',
		title,
		body,
		data: {}
	});
}

export async function getUnreadCount(userId: string): Promise<number> {
	const result = await db
		.select({ total: count() })
		.from(notifications)
		.where(and(eq(notifications.user_id, userId), isNull(notifications.read_at)));
	return result[0]?.total ?? 0;
}

export async function getNotificationsTotal(
	userId: string,
	filter: 'all' | 'unread' = 'all'
): Promise<number> {
	const where =
		filter === 'unread'
			? and(eq(notifications.user_id, userId), isNull(notifications.read_at))
			: eq(notifications.user_id, userId);
	const result = await db.select({ total: count() }).from(notifications).where(where);
	return result[0]?.total ?? 0;
}

export async function getNotifications(
	userId: string,
	limit = 20,
	offset = 0,
	filter: 'all' | 'unread' = 'all'
) {
	const where =
		filter === 'unread'
			? and(eq(notifications.user_id, userId), isNull(notifications.read_at))
			: eq(notifications.user_id, userId);
	return db.query.notifications.findMany({
		where,
		orderBy: (n, { desc }) => [desc(n.created_at)],
		limit,
		offset
	});
}

export async function markRead(notificationId: string, userId: string): Promise<void> {
	await db
		.update(notifications)
		.set({ read_at: new Date().toISOString() })
		.where(and(eq(notifications.id, notificationId), eq(notifications.user_id, userId)));
}

export async function markAllRead(userId: string): Promise<void> {
	await db
		.update(notifications)
		.set({ read_at: new Date().toISOString() })
		.where(and(eq(notifications.user_id, userId), isNull(notifications.read_at)));
}

export async function deleteNotification(notificationId: string, userId: string): Promise<void> {
	await db
		.delete(notifications)
		.where(and(eq(notifications.id, notificationId), eq(notifications.user_id, userId)));
}

export async function deleteReadNotifications(userId: string): Promise<void> {
	await db
		.delete(notifications)
		.where(and(eq(notifications.user_id, userId), isNotNull(notifications.read_at)));
}
