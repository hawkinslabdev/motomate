import type { RequestHandler } from '@sveltejs/kit';
import { getNotesByVehicle, createNote } from '#lib/db/repositories/notes.js';
import { apiError, ok, list } from '#lib/api/response.js';
import { requireAuth, requireWrite, guardVehicle, parseBody, parsePage } from '#lib/api/guards.js';
import { z } from 'zod';

const CreateNoteSchema = z.object({
	title: z.string().max(200).optional().nullable(),
	content: z.string().max(50000).default(''),
	doc_refs: z.array(z.string()).optional()
});

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	const { limit, offset } = parsePage(url);
	const notes = await getNotesByVehicle(params.id!, locals.user!.id);

	return list(notes.slice(offset, offset + limit), notes.length);
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const writeErr = requireWrite(locals);
	if (writeErr) return writeErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	const body = await parseBody<unknown>(request);
	if (body instanceof Response) return body;

	const parsed = CreateNoteSchema.safeParse(body);
	if (!parsed.success) {
		return apiError(parsed.error.issues[0]?.message ?? 'Invalid input', 'VALIDATION_ERROR', 400);
	}

	const note = await createNote(locals.user!.id, {
		vehicle_id: params.id!,
		title: parsed.data.title ?? null,
		content: parsed.data.content,
		doc_refs: parsed.data.doc_refs ?? []
	});

	return ok(note, 201);
};
