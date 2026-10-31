import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { PageServerLoad, Actions } from './$types';
import {
	getNotesByVehicle,
	createNote,
	updateNote,
	deleteNote
} from '#lib/db/repositories/notes.js';

const noteSchema = z.object({
	title: z.string().max(200).optional(),
	content: z.string().max(50000),
	doc_refs: z.array(z.string()).optional()
});

export const load: PageServerLoad = async ({ params, locals }) => {
	const notes = await getNotesByVehicle(params.id, locals.user!.id);
	return {
		notes,
		page_prefs: locals.user!.settings?.page_prefs?.notes ?? null
	};
};

export const actions: Actions = {
	create: async ({ request, params, locals }) => {
		const fd = await request.formData();
		const raw = {
			title: (fd.get('title') as string | null)?.trim() || undefined,
			content: (fd.get('content') as string) ?? '',
			doc_refs: fd.getAll('doc_refs').map(String)
		};
		const parsed = noteSchema.safeParse(raw);
		if (!parsed.success) return fail(400, { error: 'Invalid input' });
		await createNote(locals.user!.id, {
			vehicle_id: params.id,
			title: parsed.data.title ?? null,
			content: parsed.data.content,
			doc_refs: parsed.data.doc_refs ?? []
		});
		return { success: true };
	},

	update: async ({ request, params, locals }) => {
		const fd = await request.formData();
		const id = fd.get('id') as string;
		if (!id) return fail(400, { error: 'Missing id' });
		const raw = {
			title: (fd.get('title') as string | null)?.trim() || undefined,
			content: (fd.get('content') as string) ?? '',
			doc_refs: fd.getAll('doc_refs').map(String)
		};
		const parsed = noteSchema.safeParse(raw);
		if (!parsed.success) return fail(400, { error: 'Invalid input' });
		await updateNote(id, params.id, locals.user!.id, {
			title: parsed.data.title ?? null,
			content: parsed.data.content,
			doc_refs: parsed.data.doc_refs ?? []
		});
		return { success: true };
	},

	delete: async ({ request, params, locals }) => {
		const fd = await request.formData();
		const id = fd.get('id') as string;
		if (!id) return fail(400, { error: 'Missing id' });
		await deleteNote(id, params.id, locals.user!.id);
		return { success: true };
	}
};
