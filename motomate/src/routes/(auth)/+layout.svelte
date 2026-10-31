<script lang="ts">
	import AuthShell from '#lib/components/auth/AuthShell.svelte';

	let { children, data } = $props<{
		children: any;
		data: { demoMode?: boolean };
	}>();

	let copied = $state<'email' | 'password' | null>(null);

	async function copyToClipboard(text: string, field: 'email' | 'password') {
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
			} else {
				const el = document.createElement('textarea');
				el.value = text;
				el.style.position = 'fixed';
				el.style.opacity = '0';
				document.body.appendChild(el);
				el.select();
				document.execCommand('copy');
				document.body.removeChild(el);
			}
			copied = field;
			setTimeout(() => (copied = null), 1800);
		} catch {
			// perhaps clipboard unavailable
		}
	}
</script>

<div class="demo-banner" class:active={data.demoMode}>
	{#if data.demoMode}
		<span class="demo-label">Demo instance</span>
		<div class="demo-creds">
			<button class="demo-cred" onclick={() => copyToClipboard('demo@motomate.local', 'email')}>
				demo@motomate.local
				<span class="demo-copy-hint">{copied === 'email' ? 'copied' : 'copy'}</span>
			</button>
			<span class="demo-sep">/</span>
			<button class="demo-cred" onclick={() => copyToClipboard('password123', 'password')}>
				password123
				<span class="demo-copy-hint">{copied === 'password' ? 'copied' : 'copy'}</span>
			</button>
		</div>
	{/if}
</div>
<AuthShell demoMode={data.demoMode}>
	{@render children()}
</AuthShell>

<style>
	.demo-banner:not(.active) {
		display: none;
	}

	.demo-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.625rem;
		padding: 0.5rem var(--space-6);
		background: color-mix(in srgb, var(--status-due) 6%, var(--bg));
		border-bottom: 1px solid color-mix(in srgb, var(--status-due) 20%, var(--border));
		font-size: var(--text-sm);
		color: var(--text-muted);
		user-select: none;
	}
	.demo-label {
		font-weight: 500;
		color: var(--text-muted);
	}
	.demo-creds {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.demo-cred {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		background: none;
		border: none;
		padding: 0;
		font-size: var(--text-xs);
		color: var(--text);
		cursor: pointer;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 2px;
		transition: color 0.12s;
	}
	.demo-cred:hover {
		color: var(--accent);
	}
	.demo-copy-hint {
		font-size: 0.625rem;
		color: var(--text-subtle);
		text-decoration: none;
	}
	.demo-sep {
		color: var(--text-subtle);
		font-size: var(--text-xs);
	}

	@media (max-width: 860px) {
		.demo-banner {
			padding: 0.5rem 1rem;
			flex-wrap: wrap;
		}
	}
</style>
