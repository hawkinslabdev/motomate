import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('#lib/db/repositories/documents.js', () => ({
	createDocument: vi.fn(),
	getDocumentsByVehicle: vi.fn()
}));
vi.mock('#lib/server/integrations.js', () => ({
	onDocumentCreated: vi.fn(),
	mirrorPut: vi.fn(),
	mirrorDelete: vi.fn()
}));
vi.mock('#lib/storage/index.js', () => ({
	getStorage: vi.fn()
}));
vi.mock('#lib/db/repositories/finance-transactions.js', () => ({
	getFinanceTransactionsByVehicle: vi.fn(),
	createFinanceTransaction: vi.fn(),
	updateFinanceTransaction: vi.fn(),
	updateFinanceTransactionAttachments: vi.fn(),
	deleteFinanceTransaction: vi.fn()
}));
vi.mock('#lib/db/repositories/service-logs.js', () => ({
	getServiceLogsByVehicle: vi.fn()
}));
vi.mock('#lib/db/repositories/users.js', () => ({
	updateUserSettings: vi.fn()
}));

import { createDocument } from '#lib/db/repositories/documents.js';
import { getStorage } from '#lib/storage/index.js';
import {
	updateFinanceTransaction,
	updateFinanceTransactionAttachments
} from '#lib/db/repositories/finance-transactions.js';
import { collectAttachmentIds } from '#lib/server/finance-attachments.js';
import { actions } from '../routes/(app)/vehicles/[id]/finance/+page.server.js';

const put = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(getStorage).mockReturnValue({ put } as never);
	vi.mocked(createDocument).mockResolvedValue({ id: 'doc_new' } as never);
});

function form(entries: [string, string | File][]) {
	const fd = new FormData();
	for (const [k, v] of entries) fd.append(k, v);
	return fd;
}

describe('collectAttachmentIds', () => {
	it('passes through linked document IDs when no file is uploaded', async () => {
		const result = await collectAttachmentIds(
			form([
				['linked_doc_id', 'doc_a'],
				['linked_doc_id', 'doc_b']
			]),
			'u_1',
			'v_1'
		);

		expect(result).toEqual({ ids: ['doc_a', 'doc_b'] });
		expect(put).not.toHaveBeenCalled();
	});

	it('stores an uploaded file and puts its document first', async () => {
		const result = await collectAttachmentIds(
			form([
				['attachment_file', new File(['receipt'], 'receipt.pdf', { type: 'application/pdf' })],
				['attachment_type', 'quotation'],
				['linked_doc_id', 'doc_a']
			]),
			'u_1',
			'v_1'
		);

		expect(result).toEqual({ ids: ['doc_new', 'doc_a'] });
		expect(put).toHaveBeenCalledOnce();
		expect(vi.mocked(createDocument).mock.calls[0][1]).toMatchObject({
			vehicle_id: 'v_1',
			name: 'receipt.pdf',
			doc_type: 'quotation'
		});
	});

	it('rejects a file over the size cap without storing anything', async () => {
		const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf');
		const result = await collectAttachmentIds(form([['attachment_file', big]]), 'u_1', 'v_1');

		expect(result).toEqual({ error: 'Attachment too large (max 10 MB)', status: 400 });
		expect(put).not.toHaveBeenCalled();
		expect(createDocument).not.toHaveBeenCalled();
	});

	it('reports a storage failure instead of creating a dangling document', async () => {
		put.mockRejectedValueOnce(new Error('disk full'));
		const result = await collectAttachmentIds(
			form([['attachment_file', new File(['x'], 'x.pdf')]]),
			'u_1',
			'v_1'
		);

		expect(result).toEqual({ error: 'Attachment upload failed', status: 500 });
		expect(createDocument).not.toHaveBeenCalled();
	});
});

describe('editTransaction action', () => {
	function event(fd: FormData) {
		return {
			request: { formData: async () => fd },
			locals: { user: { id: 'u_1', settings: { currency: 'EUR' } } },
			params: { id: 'v_1' }
		} as never;
	}

	const baseFields: [string, string | File][] = [
		['id', 'ft_1'],
		['category', 'parts'],
		['amount', '25.50'],
		['date', '2026-08-01']
	];

	it('keeps the attachments the form submits', async () => {
		await actions.editTransaction(
			event(form([...baseFields, ['linked_doc_id', 'doc_a'], ['linked_doc_id', 'doc_b']]))
		);

		expect(vi.mocked(updateFinanceTransaction).mock.calls[0][3]).toMatchObject({
			category: 'parts',
			amount_cents: 2550,
			performed_at: '2026-08-01'
		});
		expect(updateFinanceTransactionAttachments).toHaveBeenCalledWith('ft_1', 'v_1', 'u_1', [
			'doc_a',
			'doc_b'
		]);
	});

	it('drops attachments the user removed in the form', async () => {
		await actions.editTransaction(event(form(baseFields)));

		expect(updateFinanceTransactionAttachments).toHaveBeenCalledWith('ft_1', 'v_1', 'u_1', []);
	});

	it('rejects an invalid amount before touching the transaction', async () => {
		const result = await actions.editTransaction(
			event(
				form([
					['id', 'ft_1'],
					['category', 'parts'],
					['amount', '0'],
					['date', '2026-08-01']
				])
			)
		);

		expect((result as { status: number }).status).toBe(400);
		expect(updateFinanceTransaction).not.toHaveBeenCalled();
		expect(updateFinanceTransactionAttachments).not.toHaveBeenCalled();
	});
});
