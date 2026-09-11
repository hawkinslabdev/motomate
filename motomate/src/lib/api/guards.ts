import { apiError } from './response.js';
import { getVehicleById } from '$lib/db/repositories/vehicles.js';
import type { Vehicle } from '$lib/db/schema.js';
import type { User } from 'lucia';

export function requireAuth(locals: App.Locals): Response | null {
	if (!locals.user) return apiError('Unauthorized', 'UNAUTHORIZED', 401);
	return null;
}

export function requireWrite(locals: App.Locals): Response | null {
	if (locals.isApiKeyAuth && locals.apiKeyScope === 'read') {
		return apiError('Forbidden: read-only key', 'FORBIDDEN', 403);
	}
	return null;
}

export async function guardVehicle(id: string, userId: string): Promise<Vehicle | Response> {
	const vehicle = await getVehicleById(id, userId);
	if (!vehicle) return apiError('Vehicle not found', 'NOT_FOUND', 404);
	return vehicle;
}

export async function parseBody<T>(request: Request): Promise<T | Response> {
	try {
		return (await request.json()) as T;
	} catch {
		return apiError('Invalid JSON body', 'BAD_REQUEST', 400);
	}
}

export function parsePage(url: URL): { limit: number; offset: number } {
	const limit = parseInt(url.searchParams.get('limit') ?? '50');
	const offset = parseInt(url.searchParams.get('offset') ?? '0');
	return {
		limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50,
		offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0
	};
}

export function userCurrency(user: User): string {
	return user.settings?.currency ?? 'EUR';
}
