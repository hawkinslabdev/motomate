import PDFDocumentClass from 'pdfkit';
import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { marked } from 'marked';
import type {
	Vehicle,
	ServiceLog,
	Document as DocRecord,
	FinanceTransaction,
	VehicleNote
} from '$lib/db/schema.js';

import { locales, supportedLocales } from '$lib/i18n/locales.js';

type PDFDoc = InstanceType<typeof PDFDocumentClass>;

interface ReportTranslations {
	generatedOn: string;
	currentOdometer: string;
	serviceHistory: string;
	period: string;
	addendum: string;
	cost: string;
	parts: string;
	notes: string;
	remark: string;
	noLogs: string;
	attachmentPage: string;
	notEmbeddable: string;
	trackers: string;
	attached: string;
	documentInApp: string;
	financeSummary: string;
	financeTotal: string;
	financeNoData: string;
	catMaintenance: string;
	catParts: string;
	catAccessories: string;
	catAdministrative: string;
	catFuel: string;
	catOther: string;
	vehicleNotes: string;
}

export interface MaintenanceReportOptions {
	vehicle: Vehicle;
	serviceLogs: ServiceLog[];
	trackerNames: Map<string, string>;
	docs: DocRecord[];
	docBuffers: Map<string, Buffer>;
	locale: string;
	excludedTrackerIds?: string[];
	dateFrom?: string;
	dateTo?: string;
	includeFinanceSummary?: boolean;
	financeTransactions?: FinanceTransaction[];
	includeAttachments?: boolean;
	notes?: VehicleNote[];
}

// Font name constants
const FB = 'Inter';
const FM = 'Inter-Medium';
const FS = 'Inter-SemiBold';
const FN = 'JetBrainsMono';

// Colours
const INK = '#111827';
const MUTED = '#6b7280';
const SUBTLE = '#9ca3af';
const ACCENT = '#2563eb';
const RULE = '#e5e7eb';

// Page geometry (A4 portrait, points)
const W = 595.28;
const H = 841.89;
const ML = 56;
const CW = W - ML * 2;
const FOOTER_H = 40;

const FALLBACK_TRANSLATIONS: ReportTranslations = {
	generatedOn: 'Generated on',
	currentOdometer: 'Current odometer',
	serviceHistory: 'Service History',
	period: 'Period',
	addendum: 'Addendum: Attachments',
	cost: 'Cost',
	parts: 'Parts used',
	notes: 'Notes',
	remark: 'Remark',
	noLogs: 'No service records found.',
	attachmentPage: 'page',
	notEmbeddable: 'not embeddable',
	trackers: 'Serviced',
	attached: 'Attached',
	documentInApp: 'This document is available in your MotoMate document library.',
	financeSummary: 'Expense Summary',
	financeTotal: 'Total',
	financeNoData: 'No expense records in this period.',
	catMaintenance: 'Maintenance',
	catParts: 'Parts',
	catAccessories: 'Accessories',
	catAdministrative: 'Administrative',
	catFuel: 'Fuel',
	catOther: 'Other',
	vehicleNotes: 'Notes'
};

function loadTranslations(locale: string): ReportTranslations {
	const lang = (supportedLocales as string[]).includes(locale) ? locale : 'en';
	const json = locales[lang as keyof typeof locales] as Record<string, unknown> | undefined;
	const loaded = (json as any)?.vehicle?.edit?.settings?.report?.pdf as
		Partial<ReportTranslations> | undefined;
	return loaded ? { ...FALLBACK_TRANSLATIONS, ...loaded } : FALLBACK_TRANSLATIONS;
}

function registerFonts(doc: PDFDoc): void {
	try {
		const base = resolve('node_modules/@fontsource');
		const r = (p: string) => readFileSync(join(base, p));
		doc.registerFont(FB, r('inter/files/inter-latin-400-normal.woff'));
		doc.registerFont(FM, r('inter/files/inter-latin-500-normal.woff'));
		doc.registerFont(FS, r('inter/files/inter-latin-600-normal.woff'));
		doc.registerFont(FN, r('jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff'));
	} catch {
		// Font files missing: fall back to built-in Helvetica
	}
}

function fmtNum(value: number, locale: string): string {
	return new Intl.NumberFormat(locale).format(value);
}

function fmtDate(iso: string, locale: string): string {
	try {
		return new Intl.DateTimeFormat(locale, {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		}).format(new Date(iso));
	} catch {
		return iso.slice(0, 10);
	}
}

function fmtDateShort(iso: string, locale: string): string {
	try {
		return new Intl.DateTimeFormat(locale, {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		}).format(new Date(iso));
	} catch {
		return iso.slice(0, 10);
	}
}

function fmtCurrency(cents: number, currency: string, locale: string): string {
	try {
		return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
	} catch {
		return `${(cents / 100).toFixed(2)} ${currency}`;
	}
}

function hRule(doc: PDFDoc, y: number, color = RULE, weight = 0.5): void {
	doc
		.save()
		.moveTo(ML, y)
		.lineTo(W - ML, y)
		.strokeColor(color)
		.lineWidth(weight)
		.stroke()
		.restore();
}

function contentBottom(): number {
	return H - FOOTER_H - 8;
}

function needsNewPage(doc: PDFDoc, height: number): boolean {
	return doc.y + height > contentBottom();
}

function ensureSpace(doc: PDFDoc, height: number): void {
	if (needsNewPage(doc, height)) doc.addPage();
}

function isImage(mime: string): boolean {
	return ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(mime);
}

function isPdf(mime: string): boolean {
	return mime === 'application/pdf';
}

function flushDoc(doc: PDFDoc): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		doc.on('data', (c: Buffer) => chunks.push(c));
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);
		doc.end();
	});
}

function stampFooters(doc: PDFDoc, pageCount: number): void {
	const range = doc.bufferedPageRange();
	const n = Math.min(pageCount, range.count);
	for (let i = 0; i < n; i++) {
		doc.switchToPage(range.start + i);
		const y = H - 26;
		hRule(doc, y - 8, RULE, 0.5);
		doc.fontSize(8).font(FB).fillColor(SUBTLE).text('MotoMate', ML, y, { lineBreak: false });
	}
}

function drawCover(
	doc: PDFDoc,
	vehicle: Vehicle,
	t: ReportTranslations,
	locale: string,
	dateRange: { from: string | null; to: string | null }
): void {
	const unit = vehicle.odometer_unit ?? 'km';

	doc
		.fontSize(8)
		.font(FS)
		.fillColor(SUBTLE)
		.text('MOTOMATE', ML, ML, { characterSpacing: 2.5, lineBreak: false });

	doc
		.save()
		.moveTo(ML, ML + 13)
		.lineTo(ML + 44, ML + 13)
		.strokeColor(ACCENT)
		.lineWidth(1.5)
		.stroke()
		.restore();

	const heroY = 140;

	doc.fontSize(28).font(FS).fillColor(INK).text(vehicle.name, ML, heroY, { width: CW });

	doc
		.fontSize(13)
		.font(FB)
		.fillColor(MUTED)
		.text(`${vehicle.make} ${vehicle.model} ${vehicle.year}`, ML, doc.y + 2, { width: CW });

	const odoY = heroY + 80;
	const odoValue =
		vehicle.current_odometer != null ? `${fmtNum(vehicle.current_odometer, locale)} ${unit}` : '-';
	doc.fontSize(36).font(FN).fillColor(INK).text(odoValue, ML, odoY, { lineBreak: false });

	let afterOdo = odoY + 48;

	if (vehicle.license_plate) {
		doc
			.fontSize(11)
			.font(FM)
			.fillColor(INK)
			.text(vehicle.license_plate, ML, afterOdo, { lineBreak: false });
		afterOdo += 20;
	}

	if (dateRange.from && dateRange.to) {
		doc
			.fontSize(10)
			.font(FB)
			.fillColor(MUTED)
			.text(
				`${t.period}: ${fmtDateShort(dateRange.from, locale)} - ${fmtDateShort(dateRange.to, locale)}`,
				ML,
				afterOdo,
				{ lineBreak: false }
			);
		afterOdo += 20;
	}

	const divY = afterOdo + 8;
	hRule(doc, divY, RULE, 0.5);

	let metaY = divY + 18;

	if (vehicle.vin) {
		doc
			.fontSize(9)
			.font(FN)
			.fillColor(SUBTLE)
			.text(`VIN: ${vehicle.vin}`, ML, metaY, { lineBreak: false });
		metaY += 16;
	}

	doc
		.fontSize(8)
		.font(FB)
		.fillColor(SUBTLE)
		.text(`${t.generatedOn}: ${fmtDate(new Date().toISOString(), locale)}`, ML, metaY, {
			lineBreak: false
		});
}

function drawServiceLogs(
	doc: PDFDoc,
	vehicle: Vehicle,
	logs: ServiceLog[],
	trackerNames: Map<string, string>,
	attachmentIndex: Map<string, number>,
	t: ReportTranslations,
	locale: string
): void {
	doc.addPage();

	doc
		.fontSize(15)
		.font(FS)
		.fillColor(INK)
		.text(t.serviceHistory, ML, ML + 4);
	hRule(doc, doc.y + 6, ACCENT, 1.5);
	doc.y += 20;

	if (logs.length === 0) {
		doc.fontSize(11).font(FB).fillColor(MUTED).text(t.noLogs, ML);
		return;
	}

	const sorted = [...logs].sort(
		(a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime()
	);

	let currentYear: number | null = null;

	for (const log of sorted) {
		const logYear = new Date(log.performed_at).getFullYear();

		if (logYear !== currentYear) {
			ensureSpace(doc, 44);
			const divY = doc.y + (currentYear === null ? 0 : 8);
			doc
				.fontSize(8)
				.font(FS)
				.fillColor(SUBTLE)
				.text(String(logYear), ML, divY, { characterSpacing: 1.5, lineBreak: false });
			doc.y = divY + 14;
			hRule(doc, doc.y, RULE, 0.5);
			doc.y += 12;
			currentYear = logYear;
		}

		const attachIds = (log.attachments as string[] | null) ?? [];
		const parts = (log.parts_used as Array<{ name: string; part_number?: string }> | null) ?? [];

		const names: string[] = [];
		if (log.tracker_id) {
			const n = trackerNames.get(log.tracker_id);
			if (n) names.push(n);
		}
		for (const tid of (log.serviced_tracker_ids as string[] | null) ?? []) {
			if (tid !== log.tracker_id) {
				const n = trackerNames.get(tid);
				if (n && !names.includes(n)) names.push(n);
			}
		}

		const trackerTitle = names.join(', ');
		const notesFirstLine = log.notes?.split('\n')[0]?.trim() ?? '';
		const entryTitle = trackerTitle || notesFirstLine;
		const notesBody = trackerTitle
			? (log.notes ?? '')
			: log.notes?.includes('\n')
				? log.notes.split('\n').slice(1).join('\n').trim()
				: '';

		const lineCount =
			(entryTitle ? 1 : 0) +
			1 +
			(notesBody ? 1 : 0) +
			(log.remark ? 1 : 0) +
			(parts.length > 0 ? 1 : 0);
		ensureSpace(doc, lineCount * 14 + 20);

		const entryTop = doc.y;

		if (entryTitle) {
			doc.fontSize(10).font(FS).fillColor(INK).text(entryTitle, ML, entryTop, { width: CW });
		}

		let cy = entryTitle ? doc.y + 2 : entryTop;

		const odoStr =
			log.odometer_at_service != null
				? `${fmtNum(log.odometer_at_service, locale)} ${vehicle.odometer_unit ?? 'km'}`
				: '';
		const costStr = log.cost_cents != null ? fmtCurrency(log.cost_cents, log.currency, locale) : '';
		const metaLine = [fmtDateShort(log.performed_at, locale), odoStr, costStr]
			.filter(Boolean)
			.join('  .  ');

		doc.fontSize(9).font(FN).fillColor(MUTED).text(metaLine, ML, cy, { lineBreak: false });

		const refs = attachIds
			.filter((id) => attachmentIndex.has(id))
			.map((id) => `[A${attachmentIndex.get(id)}]`)
			.join('  ');
		if (refs) {
			doc
				.fontSize(9)
				.font(FN)
				.fillColor(ACCENT)
				.text(refs, ML, cy, { width: CW, align: 'right', lineBreak: false });
		}

		cy += 14; // 9pt line + gap; lineBreak:false doesn't advance doc.y

		if (notesBody) {
			doc.fontSize(9).font(FB).fillColor(MUTED).text(notesBody, ML, cy, { width: CW });
			cy = doc.y + 2;
		}

		if (log.remark) {
			doc
				.fontSize(9)
				.font(FB)
				.fillColor(MUTED)
				.text(`${t.remark}: ${log.remark}`, ML, cy, { width: CW });
			cy = doc.y + 2;
		}

		if (parts.length > 0) {
			const partLine = parts
				.map((p) => (p.part_number ? `${p.name} (${p.part_number})` : p.name))
				.join(', ');
			doc
				.fontSize(9)
				.font(FB)
				.fillColor(MUTED)
				.text(`${t.parts}: ${partLine}`, ML, cy, { width: CW });
			cy = doc.y + 2;
		}

		doc.y = cy + 8;
		hRule(doc, doc.y, RULE, 0.3);
		doc.y += 8;
	}
}

function drawFinanceSummary(
	doc: PDFDoc,
	transactions: FinanceTransaction[],
	t: ReportTranslations,
	locale: string
): void {
	doc.addPage();

	doc
		.fontSize(15)
		.font(FS)
		.fillColor(INK)
		.text(t.financeSummary, ML, ML + 4);
	hRule(doc, doc.y + 6, ACCENT, 1.5);
	doc.y += 20;

	if (transactions.length === 0) {
		doc.fontSize(11).font(FB).fillColor(MUTED).text(t.financeNoData, ML);
		return;
	}

	const CAT_ORDER = [
		'maintenance',
		'parts',
		'accessories',
		'fuel',
		'administrative',
		'other'
	] as const;
	const catLabel: Record<string, string> = {
		maintenance: t.catMaintenance,
		parts: t.catParts,
		accessories: t.catAccessories,
		administrative: t.catAdministrative,
		fuel: t.catFuel,
		other: t.catOther
	};

	// Aggregate per category, then per currency
	type CatEntry = { count: number; byCurrency: Map<string, number> };
	const byCategory = new Map<string, CatEntry>();
	const grandByCurrency = new Map<string, number>();

	for (const txn of transactions) {
		const cat = txn.category;
		if (!byCategory.has(cat)) byCategory.set(cat, { count: 0, byCurrency: new Map() });
		const entry = byCategory.get(cat)!;
		entry.count++;
		entry.byCurrency.set(
			txn.currency,
			(entry.byCurrency.get(txn.currency) ?? 0) + txn.amount_cents
		);
		grandByCurrency.set(txn.currency, (grandByCurrency.get(txn.currency) ?? 0) + txn.amount_cents);
	}

	const COL_LABEL = ML;

	for (const cat of CAT_ORDER) {
		const entry = byCategory.get(cat);
		if (!entry) continue;

		ensureSpace(doc, 22);
		const rowY = doc.y;

		doc
			.fontSize(10)
			.font(FB)
			.fillColor(INK)
			.text(catLabel[cat] ?? cat, COL_LABEL, rowY, { width: CW * 0.65, lineBreak: false });

		const totals = [...entry.byCurrency.entries()]
			.map(([cur, cents]) => fmtCurrency(cents, cur, locale))
			.join('  ');
		doc
			.fontSize(10)
			.font(FN)
			.fillColor(MUTED)
			.text(totals, COL_LABEL + CW * 0.65, rowY, {
				width: CW * 0.35,
				align: 'right',
				lineBreak: false
			});

		doc.y = rowY + 16;
		hRule(doc, doc.y, RULE, 0.3);
		doc.y += 4;
	}

	// Grand total
	ensureSpace(doc, 32);
	doc.y += 8;
	const totalY = doc.y;
	hRule(doc, totalY - 4, RULE, 0.5);

	doc
		.fontSize(11)
		.font(FS)
		.fillColor(INK)
		.text(t.financeTotal, COL_LABEL, totalY, { width: CW * 0.65, lineBreak: false });

	const grandTotals = [...grandByCurrency.entries()]
		.map(([cur, cents]) => fmtCurrency(cents, cur, locale))
		.join('  ');
	doc
		.fontSize(11)
		.font(FN)
		.fillColor(INK)
		.text(grandTotals, COL_LABEL + CW * 0.65, totalY, {
			width: CW * 0.35,
			align: 'right',
			lineBreak: false
		});
}

interface AddendumEntry {
	tag: string;
	doc: DocRecord;
	embeddable: boolean;
}

function drawAddendumIndex(doc: PDFDoc, entries: AddendumEntry[], t: ReportTranslations): void {
	if (entries.length === 0) return;

	doc.addPage();

	doc
		.fontSize(15)
		.font(FS)
		.fillColor(INK)
		.text(t.addendum, ML, ML + 4);
	hRule(doc, doc.y + 6, ACCENT, 1.5);
	doc.y += 20;

	for (const entry of entries) {
		ensureSpace(doc, 22);
		const rowY = doc.y;

		doc
			.fontSize(10)
			.font(FS)
			.fillColor(ACCENT)
			.text(`${entry.tag}  `, ML, rowY, { continued: true, lineBreak: false });

		doc
			.font(FB)
			.fillColor(INK)
			.text(entry.doc.title || entry.doc.name, {
				continued: true,
				width: CW - 100,
				lineBreak: false
			});

		doc
			.font(FB)
			.fillColor(entry.embeddable ? MUTED : SUBTLE)
			.text(`  ${entry.embeddable ? t.attached : t.notEmbeddable}`, {
				align: 'right',
				lineBreak: false
			});

		doc.y = rowY + 18;
		hRule(doc, doc.y, RULE, 0.3);
		doc.y += 4;
	}
}

function stripInline(text: string): string {
	return text
		.replace(/\\$/gm, '')
		.replace(/\\\n/g, ' ')
		.replace(/\\([\[\]()\\*_`#!])/g, '$1')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/\*([^*]+)\*/g, '$1')
		.replace(/___([^_]+)___/g, '$1')
		.replace(/__([^_]+)__/g, '$1')
		.replace(/_([^_]+)_/g, '$1')
		.replace(/~~([^~]+)~~/g, '$1')
		.replace(/`[^`]+`/g, '')
		.replace(/<[^>]+>/g, '')
		.trim();
}

function renderMdBlocks(
	doc: PDFDoc,
	tokens: ReturnType<typeof marked.lexer>,
	x: number,
	width: number,
	baseSize: number
): void {
	for (const token of tokens) {
		const t = token as Record<string, unknown>;
		switch (token.type) {
			case 'heading': {
				const depth = Math.min((t['depth'] as number) ?? 1, 3);
				const size = baseSize + (4 - depth) * 0.5;
				const text = stripInline((t['text'] as string) ?? '');
				if (!text) break;
				ensureSpace(doc, size * 2 + 8);
				doc.y += depth <= 2 ? 6 : 3;
				doc.fontSize(size).font(FS).fillColor(INK).text(text, x, doc.y, { width });
				doc.y += 3;
				break;
			}
			case 'paragraph': {
				const text = stripInline((t['text'] as string) ?? '');
				if (!text) break;
				ensureSpace(doc, baseSize * 2);
				doc.fontSize(baseSize).font(FB).fillColor(INK).text(text, x, doc.y, { width });
				break;
			}
			case 'list': {
				const ordered = Boolean(t['ordered']);
				const items = (t['items'] as Array<Record<string, unknown>>) ?? [];
				for (let i = 0; i < items.length; i++) {
					const itemText = stripInline((items[i]['text'] as string) ?? '');
					if (!itemText) continue;
					ensureSpace(doc, baseSize * 2);
					const bullet = ordered ? `${i + 1}.` : '•';
					doc
						.fontSize(baseSize)
						.font(FB)
						.fillColor(INK)
						.text(`${bullet}  ${itemText}`, x + 4, doc.y, { width: width - 4 });
				}
				break;
			}
			case 'blockquote': {
				const text = stripInline((t['text'] as string) ?? '');
				if (!text) break;
				ensureSpace(doc, baseSize * 2 + 4);
				doc.y += 2;
				doc
					.save()
					.moveTo(x, doc.y)
					.lineTo(x, doc.y + baseSize * 1.4)
					.strokeColor(RULE)
					.lineWidth(2)
					.stroke()
					.restore();
				doc
					.fontSize(baseSize)
					.font(FB)
					.fillColor(MUTED)
					.text(text, x + 8, doc.y, {
						width: width - 8
					});
				doc.y += 2;
				break;
			}
			case 'code': {
				const text = ((t['text'] as string) ?? '').trim();
				if (!text) break;
				ensureSpace(doc, baseSize * 1.5 + 8);
				doc.y += 3;
				doc
					.fontSize(baseSize - 1)
					.font(FN)
					.fillColor(MUTED)
					.text(text, x + 4, doc.y, { width: width - 8 });
				doc.y += 3;
				break;
			}
			case 'hr': {
				ensureSpace(doc, 14);
				doc.y += 4;
				hRule(doc, doc.y, RULE, 0.3);
				doc.y += 10;
				break;
			}
			case 'space': {
				doc.y += 4;
				break;
			}
		}
	}
}

function drawNotes(doc: PDFDoc, notes: VehicleNote[], t: ReportTranslations, locale: string): void {
	doc.addPage();

	doc
		.fontSize(15)
		.font(FS)
		.fillColor(INK)
		.text(t.vehicleNotes, ML, ML + 4);
	hRule(doc, doc.y + 6, ACCENT, 1.5);
	doc.y += 20;

	const sorted = [...notes].sort(
		(a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
	);

	for (const note of sorted) {
		if (!note.content?.trim() && !note.title) continue;

		ensureSpace(doc, 44);

		if (note.title) {
			doc.fontSize(10).font(FS).fillColor(INK).text(note.title, ML, doc.y, { width: CW });
		}

		const dateStr = fmtDateShort(note.updated_at, locale);
		doc
			.fontSize(9)
			.font(FN)
			.fillColor(MUTED)
			.text(dateStr, ML, doc.y + 2, { lineBreak: false });
		doc.y += 14;

		if (note.content?.trim()) {
			const tokens = marked.lexer(note.content);
			renderMdBlocks(doc, tokens, ML, CW, 9);
		}

		doc.y += 8;
		hRule(doc, doc.y, RULE, 0.3);
		doc.y += 8;
	}
}

export async function buildMaintenanceReport(opts: MaintenanceReportOptions): Promise<Buffer> {
	const { vehicle, trackerNames, docs, docBuffers, locale } = opts;
	const t = loadTranslations(locale);

	const excludedSet = new Set(opts.excludedTrackerIds ?? []);

	// Apply date range + tracker exclusion to service logs
	const serviceLogs = opts.serviceLogs.filter((log) => {
		if (opts.dateFrom && log.performed_at < opts.dateFrom) return false;
		if (opts.dateTo && log.performed_at > opts.dateTo) return false;
		if (excludedSet.size === 0) return true;
		const ids: string[] = [];
		if (log.tracker_id) ids.push(log.tracker_id);
		for (const id of (log.serviced_tracker_ids as string[]) ?? []) {
			if (!ids.includes(id)) ids.push(id);
		}
		return ids.length === 0 || !ids.every((id) => excludedSet.has(id));
	});

	// Apply date range to finance transactions
	const financeTransactions = opts.includeFinanceSummary
		? (opts.financeTransactions ?? []).filter((txn) => {
				if (opts.dateFrom && txn.performed_at < opts.dateFrom) return false;
				if (opts.dateTo && txn.performed_at > opts.dateTo) return false;
				return true;
			})
		: [];

	// Build attachment index from referenced docs in service logs
	const docMap = new Map(docs.map((d) => [d.id, d]));
	const attachmentIndex = new Map<string, number>();
	let aidx = 1;
	for (const log of serviceLogs) {
		for (const id of (log.attachments as string[] | null) ?? []) {
			if (!attachmentIndex.has(id) && docMap.has(id)) {
				attachmentIndex.set(id, aidx++);
			}
		}
	}

	const sorted = [...serviceLogs].sort(
		(a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime()
	);
	const dateRange = {
		from: opts.dateFrom ?? sorted[0]?.performed_at ?? null,
		to: opts.dateTo ?? sorted[sorted.length - 1]?.performed_at ?? null
	};

	const pdfDoc = new PDFDocumentClass({
		size: 'A4',
		margin: ML,
		bufferPages: true,
		info: {
			Title: `${vehicle.make} ${vehicle.model} ${vehicle.year} - Maintenance Report`,
			Author: 'MotoMate',
			Subject: vehicle.name,
			CreationDate: new Date()
		},
		autoFirstPage: true
	});

	registerFonts(pdfDoc);

	drawCover(pdfDoc, vehicle, t, locale, dateRange);
	drawServiceLogs(pdfDoc, vehicle, serviceLogs, trackerNames, attachmentIndex, t, locale);

	if (opts.includeFinanceSummary && financeTransactions.length > 0) {
		drawFinanceSummary(pdfDoc, financeTransactions, t, locale);
	}

	const includeAttachments = opts.includeAttachments !== false;

	const orderedAttachments = includeAttachments
		? [...attachmentIndex.entries()]
				.sort((a, b) => a[1] - b[1])
				.map(([id, idx]) => ({ id, idx, doc: docMap.get(id)! }))
		: [];

	const notes = opts.notes ?? [];
	if (notes.length > 0) {
		drawNotes(pdfDoc, notes, t, locale);
	}

	if (includeAttachments) {
		const addendumEntries: AddendumEntry[] = orderedAttachments.map(({ id, doc: d }) => ({
			tag: `[A${attachmentIndex.get(id)}]`,
			doc: d,
			embeddable: (isImage(d.mime_type) || isPdf(d.mime_type)) && docBuffers.has(id)
		}));
		drawAddendumIndex(pdfDoc, addendumEntries, t);
	}

	const contentPageCount = pdfDoc.bufferedPageRange().count;
	stampFooters(pdfDoc, contentPageCount);

	if (!includeAttachments) {
		return flushDoc(pdfDoc);
	}

	// Attachment pages (images inline, PDFs via pdf-lib merge after flush)
	const pdfCoverPageIndices = new Map<string, number>();

	for (const { id, doc: d } of orderedAttachments) {
		const tag = `[A${attachmentIndex.get(id)}]`;
		const title = d.title || d.name;

		pdfDoc.addPage();
		const pageIdx = pdfDoc.bufferedPageRange().count - 1;

		// Header bar at top of page
		pdfDoc.save().rect(0, 0, W, 28).fillColor(ACCENT).fill().restore();
		pdfDoc
			.fontSize(9)
			.font(FS)
			.fillColor('#ffffff')
			.text(`${tag}  ${title}`, ML, 8, { lineBreak: false });

		if (isImage(d.mime_type) && docBuffers.has(id)) {
			try {
				const buf = docBuffers.get(id)!;
				const availH = H - 28 - 36;
				pdfDoc.image(buf, ML, 36, { fit: [CW, availH], align: 'center', valign: 'center' });
			} catch {
				pdfDoc
					.fontSize(10)
					.font(FB)
					.fillColor(MUTED)
					.text(`[Could not render: ${d.name}]`, ML, H / 2);
			}
		} else if (isPdf(d.mime_type) && docBuffers.has(id)) {
			// Stub page (actual PDF pages inserted right after this via pdf-lib)
			pdfCoverPageIndices.set(id, pageIdx);
		} else {
			pdfDoc
				.fontSize(10)
				.font(FB)
				.fillColor(MUTED)
				.text(t.documentInApp, ML, H / 2, { width: CW });
		}
	}

	const mainBuffer = await flushDoc(pdfDoc);

	if (pdfCoverPageIndices.size === 0) return mainBuffer;

	// Merge PDF attachment pages in reverse order to preserve indices during insertion
	const mainDoc = await PDFDocument.load(mainBuffer);
	const pdfEntries = [...pdfCoverPageIndices.entries()].reverse();

	for (const [id, coverIdx] of pdfEntries) {
		const buf = docBuffers.get(id)!;
		try {
			const attachDoc = await PDFDocument.load(buf);
			const pages = await mainDoc.copyPages(attachDoc, attachDoc.getPageIndices());
			let insertAt = coverIdx + 1;
			for (const page of pages) {
				mainDoc.insertPage(insertAt++, page);
			}
		} catch {
			// Corrupted or encrypted PDF: stub page remains with header only
		}
	}

	return Buffer.from(await mainDoc.save());
}
