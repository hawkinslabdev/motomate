import type { RequestHandler } from '@sveltejs/kit';
import { getNoteById, updateNote, deleteNote } from '#lib/db/repositories/notes.js';
import { apiError, ok } from '#lib/api/response.js';
import { requireAuth, requireWrite, guardVehicle, parseBody } from '#lib/api/guards.js';
import { z } from 'zod';

const UpdateNoteSchema = z.object({
	title: z.string().max(200).optional().nullable(),
	content: z.string().max(50000).optional(),
	doc_refs: z.array(z.string()).optional()
});

export const GET: RequestHandler = async ({ locals, params }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	const note = await getNoteById(params.noteId!, params.id!, locals.user!.id);
	if (!note) return apiError('Note not found', 'NOT_FOUND', 404);

	return ok(note);
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const writeErr = requireWrite(locals);
	if (writeErr) return writeErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	const note = await getNoteById(params.noteId!, params.id!, locals.user!.id);
	if (!note) return apiError('Note not found', 'NOT_FOUND', 404);

	const body = await parseBody<unknown>(request);
	if (body instanceof Response) return body;

	const parsed = UpdateNoteSchema.safeParse(body);
	if (!parsed.success) {
		return apiError(parsed.error.issues[0]?.message ?? 'Invalid input', 'VALIDATION_ERROR', 400);
	}

	await updateNote(params.noteId!, params.id!, locals.user!.id, parsed.data);

	return ok({ updated: true });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const writeErr = requireWrite(locals);
	if (writeErr) return writeErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	const note = await getNoteById(params.noteId!, params.id!, locals.user!.id);
	if (!note) return apiError('Note not found', 'NOT_FOUND', 404);

	await deleteNote(params.noteId!, params.id!, locals.user!.id);

	return ok({ deleted: true });
};
