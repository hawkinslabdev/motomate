import { Marked, type Tokens } from 'marked';

const SAFE_HREF = /^(?:https?:\/\/|mailto:|tel:|\/|#)/i;

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

const safeMarked = new Marked({
	renderer: {
		html({ text }: Tokens.HTML | Tokens.Tag) {
			return escapeHtml(text);
		},
		link(this: { parser: { parseInline(tokens: Tokens.Generic[]): string } }, token: Tokens.Link) {
			const body = this.parser.parseInline(token.tokens);
			if (!SAFE_HREF.test(token.href.trim())) return body;
			const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
			return `<a href="${escapeHtml(token.href.trim())}"${title} target="_blank" rel="noopener noreferrer">${body}</a>`;
		},
		image(token: Tokens.Image) {
			if (!SAFE_HREF.test(token.href.trim())) return escapeHtml(token.text);
			const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
			return `<img src="${escapeHtml(token.href.trim())}" alt="${escapeHtml(token.text)}"${title} />`;
		}
	}
});

export function renderMarkdown(source: string): string {
	return safeMarked.parse(source, { async: false }) as string;
}
