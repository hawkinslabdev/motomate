export function favoriteFirst<T extends { id: string }>(
	list: T[],
	favoriteId?: string | null
): T[] {
	return favoriteId
		? [...list].sort((a, b) => +(b.id === favoriteId) - +(a.id === favoriteId))
		: list;
}
