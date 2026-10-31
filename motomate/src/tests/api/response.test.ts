import { describe, it, expect } from 'vitest';
import { ok, list, apiError, requireUser } from '#lib/api/response.js';

describe('ok()', () => {
	it('wraps data in { data } with 200', async () => {
		const res = ok({ name: 'Honda' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ data: { name: 'Honda' } });
	});

	it('accepts custom status', async () => {
		const res = ok({ id: '1' }, 201);
		expect(res.status).toBe(201);
	});

	it('sets Content-Type: application/json', () => {
		const res = ok({});
		expect(res.headers.get('content-type')).toContain('application/json');
	});
});

describe('list()', () => {
	it('wraps array in { data }', async () => {
		const res = list([1, 2, 3]);
		expect((await res.json()).data).toEqual([1, 2, 3]);
	});

	it('includes total when provided', async () => {
		const res = list([1], 100);
		const body = await res.json();
		expect(body.total).toBe(100);
	});

	it('omits total when not provided', async () => {
		const res = list([1]);
		const body = await res.json();
		expect(body).not.toHaveProperty('total');
	});
});

describe('apiError()', () => {
	it('returns { error, code } with given status', async () => {
		const res = apiError('Not found', 'NOT_FOUND', 404);
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: 'Not found', code: 'NOT_FOUND' });
	});

	it('401 for unauthorized', async () => {
		const res = apiError('Unauthorized', 'UNAUTHORIZED', 401);
		expect(res.status).toBe(401);
	});

	it('403 for forbidden', async () => {
		const res = apiError('Forbidden', 'FORBIDDEN', 403);
		expect(res.status).toBe(403);
	});
});

describe('requireUser()', () => {
	it('returns true for non-null value', () => {
		expect(requireUser({ id: 'u_1' })).toBe(true);
	});

	it('returns false for null', () => {
		expect(requireUser(null)).toBe(false);
	});

	it('returns false for undefined', () => {
		expect(requireUser(undefined)).toBe(false);
	});
});
