import PDFDocumentClass from 'pdfkit';
import { PDFDocument as LibPDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Vehicle, ServiceLog, Document as DocRecord } from '$lib/db/schema.js';

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
	seeFollowingPage: string;
	seeFollowingPages: string;
	fileNotEmbeddable: string;
}

export interface MaintenanceReportOptions {
	vehicle: Vehicle;
	serviceLogs: ServiceLog[];
	trackerNames: Map<string, string>;
	docs: DocRecord[];
	docBuffers: Map<string, Buffer>;
	locale: string;
	excludedTrackerIds?: string[];
}

const W = 595.28;
const H = 841.89;
const ML = 56;
const CW = W - ML * 2; // content width

// Prevent bleeds into footer
const FOOTER_H = 40;

const INK = '#111827';
const MUTED = '#6b7280';
const SUBTLE = '#9ca3af';
const ACCENT = '#2563eb';
const RULE = '#e5e7eb';

function loadTranslations(locale: string): ReportTranslations {
	const supported = ['en', 'nl', 'de', 'es', 'fr', 'it', 'pt'];
	const lang = supported.includes(locale) ? locale : 'en';
	const fallbacks: ReportTranslations = {
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
		seeFollowingPage: 'See following page',
		seeFollowingPages: 'See following {count} pages',
		fileNotEmbeddable: 'File not embeddable in PDF'
	};
	try {
		const raw = readFileSync(resolve('src/lib/i18n/locales', `${lang}.json`), 'utf-8');
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const json = JSON.parse(raw) as any;
		const loaded = json?.vehicle?.edit?.settings?.report?.pdf as Partial<ReportTranslations>;
		if (loaded) {
			return { ...fallbacks, ...loaded };
		}
	} catch {
		// fall through to fallbacks
	}
	return fallbacks;
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

const IMAGE_MIME_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/avif'
] as const;

function isImage(mime: string): boolean {
	return IMAGE_MIME_TYPES.includes(mime as any);
}

function isPdf(mime: string): boolean {
	return mime === 'application/pdf';
}

function stampFooters(doc: PDFDoc, contentPageCount: number): void {
	const range = doc.bufferedPageRange();
	const pagesToStamp = Math.min(contentPageCount, range.count);
	for (let i = 0; i < pagesToStamp; i++) {
		doc.switchToPage(range.start + i);

		const y = H - 26;
		doc
			.save()
			.moveTo(ML, y - 8)
			.lineTo(W - ML, y - 8)
			.strokeColor(RULE)
			.lineWidth(0.5)
			.stroke()
			.restore();

		doc
			.fontSize(8)
			.font('Helvetica')
			.fillColor(SUBTLE)
			.text('MotoMate', ML, y, { lineBreak: false });
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
	const heroY = 140;

	doc
		.fontSize(8)
		.font('Helvetica-Bold')
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

	doc
		.fontSize(28)
		.font('Helvetica-Bold')
		.fillColor(INK)
		.text(vehicle.name, ML, heroY, { width: CW });

	const subtitle = `${vehicle.make} ${vehicle.model} ${vehicle.year}`;
	doc
		.fontSize(13)
		.font('Helvetica')
		.fillColor(MUTED)
		.text(subtitle, ML, doc.y + 2, { width: CW });

	const odoY = heroY + 80;
	const odoValue =
		vehicle.current_odometer != null
			? `${vehicle.current_odometer.toLocaleString(locale)} ${unit}`
			: '—';
	doc
		.fontSize(36)
		.font('Courier-Bold')
		.fillColor(INK)
		.text(odoValue, ML, odoY, { lineBreak: false });

	if (vehicle.license_plate) {
		doc
			.fontSize(11)
			.font('Helvetica-Bold')
			.fillColor(INK)
			.text(vehicle.license_plate, ML, odoY + 48, { lineBreak: false });
	}

	if (dateRange.from && dateRange.to) {
		doc
			.fontSize(10)
			.font('Helvetica')
			.fillColor(MUTED)
			.text(
				`${t.period}: ${fmtDateShort(dateRange.from, locale)} – ${fmtDateShort(dateRange.to, locale)}`,
				ML,
				vehicle.license_plate ? odoY + 68 : odoY + 48,
				{ lineBreak: false }
			);
	}

	const divY = vehicle.license_plate ? odoY + 88 : odoY + 72;
	hRule(doc, divY, RULE, 0.5);

	let metaY = divY + 20;
	const metaParts: string[] = [];

	if (vehicle.vin) metaParts.push(`VIN: ${vehicle.vin.slice(0, 8)}…`);

	if (metaParts.length > 0) {
		doc.fontSize(9).font('Helvetica').fillColor(SUBTLE).text(metaParts.join('  ·  '), ML, metaY, {
			lineBreak: false
		});
		metaY += 18;
	}

	doc
		.fontSize(8)
		.font('Helvetica')
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
		.font('Helvetica-Bold')
		.fillColor(INK)
		.text(t.serviceHistory, ML, ML + 4);
	hRule(doc, doc.y + 6, ACCENT, 1.5);
	doc.y += 20;

	if (logs.length === 0) {
		doc.fontSize(11).font('Helvetica').fillColor(MUTED).text(t.noLogs, ML);
		return;
	}

	const sorted = [...logs].sort(
		(a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime()
	);

	let currentYear: number | null = null;

	for (const log of sorted) {
		const logDate = new Date(log.performed_at);
		const logYear = logDate.getFullYear();

		if (logYear !== currentYear) {
			ensureSpace(doc, 44);
			const dividerY = doc.y + (currentYear === null ? 0 : 8);
			doc
				.fontSize(8)
				.font('Helvetica-Bold')
				.fillColor(SUBTLE)
				.text(String(logYear), ML, dividerY, { characterSpacing: 1.5, lineBreak: false });
			doc.y = dividerY + 14;
			hRule(doc, doc.y, RULE, 0.5);
			doc.y += 12;
			currentYear = logYear;
		}

		const attachIds = (log.attachments as string[] | null) ?? [];
		const parts = (log.parts_used as Array<{ name: string; part_number?: string }> | null) ?? [];
		const lines = 1 + (log.notes ? 1 : 0) + (log.remark ? 1 : 0) + (parts.length > 0 ? 1 : 0);
		ensureSpace(doc, lines * 14 + 16);

		const entryTop = doc.y;

		const dateStr = fmtDateShort(log.performed_at, locale);
		const odoStr =
			log.odometer_at_service != null
				? `${log.odometer_at_service.toLocaleString(locale)} ${vehicle.odometer_unit ?? 'km'}`
				: '';
		const metaLine = odoStr ? `${dateStr}  ·  ${odoStr}` : dateStr;
		doc
			.fontSize(9)
			.font('Courier')
			.fillColor(MUTED)
			.text(metaLine, ML, entryTop, { lineBreak: false });

		const refs = attachIds
			.filter((id) => attachmentIndex.has(id))
			.map((id) => `[A${attachmentIndex.get(id)}]`)
			.join('  ');
		if (refs) {
			doc.fontSize(9).font('Courier').fillColor(ACCENT).text(refs, ML, entryTop, {
				width: CW,
				align: 'right',
				lineBreak: false
			});
		}

		let cy = entryTop + 14;

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
		if (names.length > 0) {
			doc
				.fontSize(10)
				.font('Helvetica')
				.fillColor(INK)
				.text(names.join(', '), ML, cy, { width: CW });
			cy = doc.y + 2;
		}

		if (log.notes) {
			doc
				.fontSize(9)
				.font('Helvetica')
				.fillColor(MUTED)
				.text(`${t.notes}: ${log.notes}`, ML, cy, { width: CW });
			cy = doc.y + 2;
		}

		if (log.remark) {
			doc
				.fontSize(9)
				.font('Helvetica')
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
				.font('Helvetica')
				.fillColor(MUTED)
				.text(`${t.parts}: ${partLine}`, ML, cy, { width: CW });
			cy = doc.y + 2;
		}

		doc.y = cy + 8;
		hRule(doc, doc.y, '#e5e7eb', 0.3);
		doc.y += 8;
	}
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
		.font('Helvetica-Bold')
		.fillColor(INK)
		.text(t.addendum, ML, ML + 4);
	hRule(doc, doc.y + 6, ACCENT, 1.5);
	doc.y += 20;

	for (const entry of entries) {
		ensureSpace(doc, 22);
		const rowY = doc.y;

		doc
			.fontSize(10)
			.font('Helvetica-Bold')
			.fillColor(ACCENT)
			.text(entry.tag, ML, rowY, { continued: true, lineBreak: false });

		doc
			.font('Helvetica')
			.fillColor(INK)
			.text(`  ${entry.doc.title || entry.doc.name}`, {
				continued: true,
				width: CW - 100,
				lineBreak: false
			});

		doc
			.font('Helvetica')
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

export async function buildMaintenanceReport(opts: MaintenanceReportOptions): Promise<Uint8Array> {
	const { vehicle, serviceLogs, trackerNames, docs, docBuffers, locale } = opts;
	const t = loadTranslations(locale);

	const excludedSet = new Set(opts.excludedTrackerIds ?? []);
	const filteredLogs =
		excludedSet.size === 0
			? serviceLogs
			: serviceLogs.filter((log) => {
					const ids: string[] = [];
					if (log.tracker_id) ids.push(log.tracker_id);
					for (const id of (log.serviced_tracker_ids as string[]) ?? []) {
						if (!ids.includes(id)) ids.push(id);
					}
					if (ids.length === 0) return true;
					return !ids.every((id) => excludedSet.has(id));
				});

	const docMap = new Map(docs.map((d) => [d.id, d]));
	const attachmentIndex = new Map<string, number>();

	let aidx = 1;

	for (const log of filteredLogs) {
		for (const id of (log.attachments as string[] | null) ?? []) {
			if (!attachmentIndex.has(id) && docMap.has(id)) {
				attachmentIndex.set(id, aidx++);
			}
		}
	}

	const orderedAttachments = [...attachmentIndex.entries()]
		.sort((a, b) => a[1] - b[1])
		.map(([id, idx]) => ({ id, idx, doc: docMap.get(id)! }));

	const logsSorted = [...filteredLogs].sort(
		(a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime()
	);

	const dateRange = {
		from: logsSorted[0]?.performed_at ?? null,
		to: logsSorted[logsSorted.length - 1]?.performed_at ?? null
	};

	const pdfDoc = new PDFDocumentClass({
		size: 'A4',
		margin: ML,
		bufferPages: true,
		info: {
			Title: `${vehicle.make} ${vehicle.model} ${vehicle.year} — Maintenance Report`,
			Author: 'MotoMate',
			Subject: vehicle.name,
			CreationDate: new Date()
		},
		autoFirstPage: true
	});

	// Please note pdf-lib will handle attachment pages . e.g. separator/content per attachment.
	drawCover(pdfDoc, vehicle, t, locale, dateRange);
	drawServiceLogs(pdfDoc, vehicle, filteredLogs, trackerNames, attachmentIndex, t, locale);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	type LoadedAttach = {
		id: string;
		idx: number;
		doc: DocRecord;
		kind: 'image' | 'pdf' | 'other';
		src?: any;
	};
	const loadedAttachments: LoadedAttach[] = [];
	let attachmentExtraPages = 0; // pages that pdf-lib will add

	for (const { id, idx, doc: d } of orderedAttachments) {
		if (isImage(d.mime_type) && docBuffers.has(id)) {
			loadedAttachments.push({ id, idx, doc: d, kind: 'image' });
			attachmentExtraPages += 1;
		} else if (isPdf(d.mime_type) && docBuffers.has(id)) {
			try {
				const src = await LibPDFDocument.load(docBuffers.get(id)!);
				loadedAttachments.push({ id, idx, doc: d, kind: 'pdf', src });
				attachmentExtraPages += 1 + src.getPageCount();
			} catch {
				loadedAttachments.push({ id, idx, doc: d, kind: 'other' });
				attachmentExtraPages += 1;
			}
		} else {
			loadedAttachments.push({ id, idx, doc: d, kind: 'other' });
			attachmentExtraPages += 1;
		}
	}

	// Content page count = cover + service log pages (before addendum is added)!
	const contentPageCount = pdfDoc.bufferedPageRange().count;
	const addendumEntries: AddendumEntry[] = orderedAttachments.map(({ id, idx, doc: d }) => ({
		tag: `[A${idx}]`,
		doc: d,
		embeddable: (isImage(d.mime_type) || isPdf(d.mime_type)) && docBuffers.has(id)
	}));
	drawAddendumIndex(pdfDoc, addendumEntries, t);

	stampFooters(pdfDoc, contentPageCount);
	pdfDoc.flushPages();

	const mainBuf = await flushDoc(pdfDoc);

	if (loadedAttachments.length === 0) return new Uint8Array(mainBuf);

	const merged = await LibPDFDocument.load(mainBuf);
	const helvetica = await merged.embedFont(StandardFonts.Helvetica);
	const helveticaBold = await merged.embedFont(StandardFonts.HelveticaBold);

	// pdf-lib colour values
	const accentColor = rgb(0.145, 0.388, 0.922); // #2563eb
	const whiteColor = rgb(1, 1, 1);
	const mutedColor = rgb(0.42, 0.447, 0.502); // #6b7280

	const addHeaderBar = (page: ReturnType<typeof merged.addPage>, tag: string, title: string) => {
		const BAR = 28;
		page.drawRectangle({ x: 0, y: H - BAR, width: W, height: BAR, color: accentColor });
		page.drawText(`${tag}  ${title}`, {
			x: ML,
			y: H - 20,
			size: 9,
			font: helveticaBold,
			color: whiteColor,
			maxWidth: CW
		});
	};

	for (const attach of loadedAttachments) {
		const title = attach.doc.title || attach.doc.name;
		const tag = `[A${attach.idx}]`;

		if (attach.kind === 'image') {
			// Single page: blue header + image filling the content area
			const page = merged.addPage([W, H]);
			addHeaderBar(page, tag, title);

			const buf = docBuffers.get(attach.id)!;
			try {
				let embedded;
				const mime = attach.doc.mime_type;
				if (mime === 'image/png') {
					embedded = await merged.embedPng(buf);
				} else {
					embedded = await merged.embedJpg(buf);
				}
				const { width: imgW, height: imgH } = embedded;
				const availH = H - 28 - 24; // below header, witha small gap
				const availW = CW;
				const scale = Math.min(availW / imgW, availH / imgH);
				const drawW = imgW * scale;
				const drawH = imgH * scale;
				const drawX = ML + (availW - drawW) / 2;
				const drawY = 16 + (availH - drawH) / 2;
				page.drawImage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });
			} catch {
				page.drawText(`[Could not render: ${attach.doc.name}]`, {
					x: ML,
					y: H / 2,
					size: 10,
					font: helvetica,
					color: mutedColor
				});
			}
		} else if (attach.kind === 'pdf' && attach.src) {
			// Add a Separator page
			const sep = merged.addPage([W, H]);
			addHeaderBar(sep, tag, title);
			const pageCount = (attach.src as { getPageCount(): number }).getPageCount();
			const note =
				pageCount === 1
					? t.seeFollowingPage
					: t.seeFollowingPages.replace('{count}', String(pageCount));
			sep.drawText(note, {
				x: ML,
				y: H / 2,
				size: 11,
				font: helvetica,
				color: mutedColor
			});

			// Source PDF pages follow immediately
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const copied = await merged.copyPages(
				attach.src as any,
				(attach.src as any).getPageIndices()
			);
			for (const srcPage of copied) {
				merged.addPage(srcPage);
			}
		} else {
			// Not embeddable? Then add separator page only
			const page = merged.addPage([W, H]);
			addHeaderBar(page, tag, title);
			page.drawText(t.fileNotEmbeddable, {
				x: ML,
				y: H / 2,
				size: 11,
				font: helvetica,
				color: mutedColor
			});
		}
	}

	return merged.save();
}
