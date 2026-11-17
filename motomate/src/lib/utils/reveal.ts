export function reveal(el: HTMLElement) {
	const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
}
