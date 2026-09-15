export function resolveTheme(t: 'light' | 'dark' | 'system'): 'light' | 'dark' {
	if (t === 'system') {
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}
	return t;
}

export function readStoredTheme(): 'light' | 'dark' | 'system' {
	const stored = localStorage.getItem('theme');
	if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
	const attr = document.documentElement.dataset.theme;
	if (attr === 'light' || attr === 'dark') return attr;
	return 'system';
}

export function persistTheme(t: 'light' | 'dark' | 'system') {
	localStorage.setItem('theme', t);
	document.cookie = `theme=${t}; path=/; max-age=31536000; SameSite=Lax`;
}
