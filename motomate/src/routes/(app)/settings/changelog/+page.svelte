<script lang="ts">
	import type { PageData } from './$types';
	import { _ } from '$lib/i18n';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

	let { data } = $props<{ data: PageData }>();

	type Entry = { category: string | null; text: string };
	type Block = { version: string; entries: Entry[] };
	type Segment =
		| { type: 'text'; value: string }
		| { type: 'issue'; number: number }
		| { type: 'link'; text: string; href: string };

	function semverGte(a: string, b: string): boolean {
		const pa = a.split('.').map(Number);
		const pb = b.split('.').map(Number);
		for (let i = 0; i < 3; i++) {
			const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
			if (diff !== 0) return diff > 0;
		}
		return true;
	}

	function parseChangelog(raw: string): Block[] {
		const blocks: Block[] = [];
		const sections = raw.split(/\n(?=## )/);
		for (const section of sections) {
			const lines = section.trim().split('\n');
			const heading = lines[0];
			if (!heading.startsWith('## ')) continue;
			const version = heading.replace(/^## v?/, '').trim();
			const entries: Entry[] = [];
			for (const line of lines.slice(1)) {
				const trimmed = line.trim();
				if (!trimmed.startsWith('- ')) continue;
				const text = trimmed.slice(2).trim();
				const seperatorId = text.indexOf(': ');
				if (seperatorId !== -1) {
					entries.push({ category: text.slice(0, seperatorId), text: text.slice(seperatorId + 2) });
				} else {
					entries.push({ category: null, text });
				}
			}
			blocks.push({ version, entries });
		}
		return blocks;
	}

	function parseSegments(text: string): Segment[] {
		const segments: Segment[] = [];
		const pattern = /\[([^\]]+)\]\(([^)]+)\)|\(#(\d+)\)/g;
		let lastIndex = 0;
		let match;
		while ((match = pattern.exec(text)) !== null) {
			if (match.index > lastIndex)
				segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
			if (match[3] !== undefined) {
				segments.push({ type: 'issue', number: parseInt(match[3]) });
			} else {
				segments.push({ type: 'link', text: match[1], href: match[2] });
			}
			lastIndex = pattern.lastIndex;
		}
		if (lastIndex < text.length) segments.push({ type: 'text', value: text.slice(lastIndex) });
		return segments;
	}

	const allBlocks = $derived(data.raw ? parseChangelog(data.raw) : []);
	const releasedBlocks = $derived(
		allBlocks.filter((b) => semverGte(data.currentVersion, b.version))
	);
	const latestVersion = $derived(releasedBlocks[0]?.version ?? null);
	const blocks = $derived.by(() => {
		if (!latestVersion) return releasedBlocks;
		const [major, minor] = latestVersion.split('.').map(Number);
		const minorFloor = `${major}.${minor}.0`;
		return releasedBlocks.filter((b) => semverGte(b.version, minorFloor));
	});
</script>

<div class="intro">
	<div class="intro-text">
		<h2 class="section-title">{$_('settings.changelog.title')}</h2>
		<p class="section-desc">{$_('settings.changelog.subtitle')}</p>
	</div>
	<Button href="?refresh=1" variant="ghost" size="md">{$_('settings.changelog.refresh')}</Button>
</div>

{#if blocks.length === 0}
	<EmptyState icon="📋" title={$_('settings.changelog.noContent')} />
{:else}
	<div class="changelog">
		{#each blocks as block (block.version)}
			<section class="version-block">
				<div class="version-header">
					<h2 class="version-heading">v{block.version}</h2>
					<div class="version-badges">
						{#if block.version === latestVersion}
							<span class="badge badge--latest">{$_('settings.changelog.latest')}</span>
						{/if}
						{#if block.version === data.currentVersion}
							<span class="badge badge--current">{$_('settings.changelog.installed')}</span>
						{/if}
					</div>
				</div>
				<ul class="entry-list">
					{#each block.entries as entry, i (i)}
						<li class="entry">
							{#if entry.category}
								<span class="category-tag">{entry.category}</span>
							{:else}
								<span class="entry-dot" aria-hidden="true">·</span>
							{/if}
							<span class="entry-text">
								{#each parseSegments(entry.text) as seg}
									{#if seg.type === 'issue'}
										<a
											href="https://github.com/hawkinslabdev/motomate/issues/{seg.number}"
											target="_blank"
											rel="noopener noreferrer"
											class="issue-link">(#{seg.number})</a
										>
									{:else if seg.type === 'link'}
										<a href={seg.href} target="_blank" rel="noopener noreferrer" class="inline-link"
											>{seg.text}</a
										>
									{:else}
										{seg.value}
									{/if}
								{/each}
							</span>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
{/if}

<footer class="changelog-footer">
	<a
		href="https://github.com/hawkinslabdev/motomate/blob/main/CHANGELOG.md"
		target="_blank"
		rel="noopener noreferrer"
		class="footer-link">{$_('settings.changelog.viewFull')}</a
	>
	<span class="footer-sep">·</span>
	<a
		href="https://github.com/hawkinslabdev/motomate/issues"
		target="_blank"
		rel="noopener noreferrer"
		class="footer-link">{$_('settings.changelog.openIssue')}</a
	>
</footer>

<style>
	.changelog {
		display: flex;
		flex-direction: column;
	}

	.version-block {
		border-top: 1px solid var(--border);
		padding: var(--space-5) 0;
	}

	.version-header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
		flex-wrap: wrap;
	}

	.version-heading {
		font-size: var(--text-xl);
		font-weight: 600;
		color: var(--text);
		letter-spacing: -0.02em;
		line-height: var(--leading-tight);
		margin: 0;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.version-badges {
		display: flex;
		gap: var(--space-2);
		align-items: center;
	}

	.badge {
		display: inline-block;
		font-size: var(--text-xs);
		font-weight: 500;
		border-radius: 4px;
		padding: 0.15rem 0.5rem;
		white-space: nowrap;
	}

	.badge--latest {
		background: color-mix(in srgb, var(--accent) 10%, var(--bg));
		color: var(--accent);
		border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
	}

	.badge--current {
		background: var(--bg-muted);
		color: var(--text-muted);
		border: 1px solid var(--border);
	}

	.entry-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.entry {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: 0.375rem 0;
		font-size: var(--text-base);
	}

	.entry-dot {
		color: var(--text-subtle);
		flex-shrink: 0;
		line-height: var(--leading-snug);
	}

	.category-tag {
		display: inline-block;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		background: var(--bg-muted);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.1rem 0.4rem;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.entry-text {
		flex: 1;
		color: var(--text);
		font-weight: 400;
		line-height: var(--leading-snug);
	}

	.issue-link {
		color: var(--text-muted);
		text-decoration: none;
		font-family: var(--font-mono);
		font-size: 0.85em;
	}

	.issue-link:hover {
		color: var(--accent);
	}

	.inline-link {
		color: var(--accent);
		text-decoration: none;
	}

	.inline-link:hover {
		text-decoration: underline;
	}

	.changelog-footer {
		border-top: 1px solid var(--border);
		padding: var(--space-4) 0 var(--space-2);
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.footer-link {
		font-size: var(--text-sm);
		color: var(--text-muted);
		text-decoration: none;
	}

	.footer-link:hover {
		color: var(--accent);
	}

	.footer-sep {
		color: var(--text-subtle);
		font-size: var(--text-sm);
	}

	.intro {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		margin-bottom: var(--space-5);
	}

	.intro-text {
		min-width: 0;
	}

	.section-title {
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--text);
		margin: 0 0 var(--space-2);
		letter-spacing: -0.02em;
	}

	.section-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		line-height: var(--leading-base);
		margin: 0;
	}
</style>
