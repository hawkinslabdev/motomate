import { generateId as luciaGenerateId } from 'lucia';

export function generateId(length = 21): string {
	return luciaGenerateId(length);
}
