export function ok<T>(data: T, status = 200) {
	return Response.json({ data }, { status });
}

export function list<T>(items: T[], total?: number) {
	return Response.json({ data: items, ...(total !== undefined ? { total } : {}) });
}

export function apiError(message: string, code: string, status: number) {
	return Response.json({ error: message, code }, { status });
}

export function requireUser(user: unknown): user is NonNullable<typeof user> {
	return user !== null && user !== undefined;
}
