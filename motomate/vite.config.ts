import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'child_process';
import fs from 'fs';

function resolveVersion(): string {
	if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION.replace(/^v/, '');
	try {
		return execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim().replace(/^v/, '');
	} catch {
		const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
		return pkg.version;
	}
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	define: {
		__APP_VERSION__: JSON.stringify(resolveVersion())
	}
});
