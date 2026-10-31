import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('#lib/db/repositories/vehicles.js', () => ({
	getVehicleById: vi.fn()
}));
vi.mock('#lib/db/repositories/notes.js', () => ({
	getNotesByVehicle: vi.fn(),
	createNote: vi.fn(),
	getNoteById: vi.fn(),
	updateNote: vi.fn(),
	deleteNote: vi.fn()
}));

import {
	GET as listNotes,
	POST as createNoteHandler
} from '../../routes/api/v1/vehicles/[id]/notes/+server.js';
import {
	GET as getNote,
	PATCH as updateNoteHandler,
	DELETE as deleteNoteHandler
} from '../../routes/api/v1/vehicles/[id]/notes/[noteId]/+server.js';
import { getVehicleById } from '#lib/db/repositories/vehicles.js';
import {
	getNotesByVehicle,
	createNote,
	getNoteById,
	updateNote,
	deleteNote
} from '#lib/db/repositories/notes.js';

const mockUser = { id: 'u_1', settings: { currency: 'EUR' } } as any;
const mockVehicle = { id: 'v_1', user_id: 'u_1' } as any;
const mockNote = {
	id: 'n_1',
	vehicle_id: 'v_1',
	user_id: 'u_1',
	title: 'Brake check',
	content: 'Pads look ok',
	doc_refs: [],
	created_at: '2026-06-01T00:00:00.000Z',
	updated_at: '2026-06-01T00:00:00.000Z'
} as any;

function event(
	user = mockUser,
	params: Record<string, string> = {},
	body?: unknown,
	scope: 'read' | 'read_write' = 'read_write'
) {
	const request = body
		? new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify(body),
				headers: { 'Content-Type': 'application/json' }
			})
		: new Request('http://localhost');
	return {
		locals: { user, session: null, isApiKeyAuth: scope === 'read', apiKeyScope: scope },
		params,
		url: new URL('http://localhost'),
		request
	} as any;
}

beforeEach(() => {
	vi.mocked(getVehicleById).mockResolvedValue(mockVehicle);
	vi.mocked(getNotesByVehicle).mockResolvedValue([mockNote]);
	vi.mocked(createNote).mockResolvedValue(mockNote);
	vi.mocked(getNoteById).mockResolvedValue(mockNote);
	vi.mocked(updateNote).mockResolvedValue(undefined);
	vi.mocked(deleteNote).mockResolvedValue(undefined);
});

describe('GET /vehicles/:id/notes', () => {
	it('returns note list', async () => {
		const res = await listNotes(event(mockUser, { id: 'v_1' }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toHaveLength(1);
		expect(body.data[0].id).toBe('n_1');
	});

	it('returns 404 when vehicle not found', async () => {
		vi.mocked(getVehicleById).mockResolvedValue(undefined);
		expect((await listNotes(event(mockUser, { id: 'bad' }))).status).toBe(404);
	});

	it('returns 401 without user', async () => {
		expect((await listNotes(event(null, { id: 'v_1' }))).status).toBe(401);
	});
});

describe('POST /vehicles/:id/notes', () => {
	const validBody = { content: 'Brake pads worn', title: 'Brake check' };

	it('creates note and returns 201', async () => {
		const res = await createNoteHandler(event(mockUser, { id: 'v_1' }, validBody));
		expect(res.status).toBe(201);
		expect(vi.mocked(createNote)).toHaveBeenCalled();
	});

	it('accepts note without title', async () => {
		const res = await createNoteHandler(event(mockUser, { id: 'v_1' }, { content: 'Quick note' }));
		expect(res.status).toBe(201);
	});

	it('rejects content exceeding 50000 chars', async () => {
		const res = await createNoteHandler(
			event(mockUser, { id: 'v_1' }, { content: 'x'.repeat(50001) })
		);
		expect(res.status).toBe(400);
	});

	it('rejects title exceeding 200 chars', async () => {
		const res = await createNoteHandler(
			event(mockUser, { id: 'v_1' }, { content: 'ok', title: 'a'.repeat(201) })
		);
		expect(res.status).toBe(400);
	});

	it('returns 404 when vehicle not found', async () => {
		vi.mocked(getVehicleById).mockResolvedValue(undefined);
		expect((await createNoteHandler(event(mockUser, { id: 'bad' }, validBody))).status).toBe(404);
	});

	it('returns 403 for read-only key', async () => {
		expect(
			(await createNoteHandler(event(mockUser, { id: 'v_1' }, validBody, 'read'))).status
		).toBe(403);
	});

	it('returns 401 without user', async () => {
		expect((await createNoteHandler(event(null, { id: 'v_1' }, validBody))).status).toBe(401);
	});

	it('returns 400 for invalid JSON', async () => {
		const req = new Request('http://localhost', {
			method: 'POST',
			body: 'bad',
			headers: { 'Content-Type': 'application/json' }
		});
		const res = await createNoteHandler({ ...event(mockUser, { id: 'v_1' }), request: req } as any);
		expect(res.status).toBe(400);
	});
});

describe('GET /vehicles/:id/notes/:noteId', () => {
	it('returns single note', async () => {
		const res = await getNote(event(mockUser, { id: 'v_1', noteId: 'n_1' }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.id).toBe('n_1');
	});

	it('returns 404 when note not found', async () => {
		vi.mocked(getNoteById).mockResolvedValue(undefined);
		expect((await getNote(event(mockUser, { id: 'v_1', noteId: 'bad' }))).status).toBe(404);
	});

	it('returns 404 when vehicle not found', async () => {
		vi.mocked(getVehicleById).mockResolvedValue(undefined);
		expect((await getNote(event(mockUser, { id: 'bad', noteId: 'n_1' }))).status).toBe(404);
	});

	it('returns 401 without user', async () => {
		expect((await getNote(event(null, { id: 'v_1', noteId: 'n_1' }))).status).toBe(401);
	});
});

describe('PATCH /vehicles/:id/notes/:noteId', () => {
	const validBody = { content: 'Updated content' };

	it('updates note and returns { updated: true }', async () => {
		const res = await updateNoteHandler(event(mockUser, { id: 'v_1', noteId: 'n_1' }, validBody));
		expect(res.status).toBe(200);
		expect((await res.json()).data.updated).toBe(true);
		expect(vi.mocked(updateNote)).toHaveBeenCalled();
	});

	it('returns 404 when note not found', async () => {
		vi.mocked(getNoteById).mockResolvedValue(undefined);
		expect(
			(await updateNoteHandler(event(mockUser, { id: 'v_1', noteId: 'bad' }, validBody))).status
		).toBe(404);
	});

	it('rejects content exceeding 50000 chars', async () => {
		const res = await updateNoteHandler(
			event(mockUser, { id: 'v_1', noteId: 'n_1' }, { content: 'x'.repeat(50001) })
		);
		expect(res.status).toBe(400);
	});

	it('returns 403 for read-only key', async () => {
		expect(
			(await updateNoteHandler(event(mockUser, { id: 'v_1', noteId: 'n_1' }, validBody, 'read')))
				.status
		).toBe(403);
	});

	it('returns 401 without user', async () => {
		expect(
			(await updateNoteHandler(event(null, { id: 'v_1', noteId: 'n_1' }, validBody))).status
		).toBe(401);
	});
});

describe('DELETE /vehicles/:id/notes/:noteId', () => {
	it('deletes note and returns { deleted: true }', async () => {
		const res = await deleteNoteHandler(event(mockUser, { id: 'v_1', noteId: 'n_1' }));
		expect(res.status).toBe(200);
		expect((await res.json()).data.deleted).toBe(true);
		expect(vi.mocked(deleteNote)).toHaveBeenCalled();
	});

	it('returns 404 when note not found', async () => {
		vi.mocked(getNoteById).mockResolvedValue(undefined);
		expect((await deleteNoteHandler(event(mockUser, { id: 'v_1', noteId: 'bad' }))).status).toBe(
			404
		);
	});

	it('returns 404 when vehicle not found', async () => {
		vi.mocked(getVehicleById).mockResolvedValue(undefined);
		expect((await deleteNoteHandler(event(mockUser, { id: 'bad', noteId: 'n_1' }))).status).toBe(
			404
		);
	});

	it('returns 403 for read-only key', async () => {
		expect(
			(await deleteNoteHandler(event(mockUser, { id: 'v_1', noteId: 'n_1' }, undefined, 'read')))
				.status
		).toBe(403);
	});

	it('returns 401 without user', async () => {
		expect((await deleteNoteHandler(event(null, { id: 'v_1', noteId: 'n_1' }))).status).toBe(401);
	});
});
