<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { sheet } from '$lib/stores/sheet.svelte.js';
	import { _, waitLocale } from '$lib/i18n';

	let {
		vehicleId: _vehicleId,
		file = undefined
	}: {
		vehicleId: string;
		file?: File;
	} = $props();

	$effect(() => {
		waitLocale();
	});

	let selectedFile = $state<File | null>(untrack(() => file ?? null));
	let uploading = $state(false);
</script>

<form
	method="POST"
	action="?/upload"
	enctype="multipart/form-data"
	class="upload-form"
	use:enhance={({ formData, cancel }) => {
		if (!selectedFile) {
			cancel();
			return;
		}
		formData.set('file', selectedFile);
		uploading = true;
		return async ({ result, update }) => {
			await update();
			uploading = false;
			if (result.type === 'success') {
				sheet.closeSheet();
			}
		};
	}}
>
	{#if selectedFile}
		<div class="file-chip">
			<span class="file-chip-name">{selectedFile.name}</span>
			<button
				type="button"
				class="file-chip-remove"
				onclick={() => (selectedFile = null)}
				aria-label={$_('common.removeFile')}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg
				>
			</button>
		</div>
	{:else}
		<label class="file-pick-zone">
			<svg
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
				<path d="M14 2v6h6" />
			</svg>
			<span class="file-pick-label">{$_('documents.dropHintMobile')}</span>
			<span class="file-pick-hint">{$_('documents.uploadHint')}</span>
			<input
				type="file"
				accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
				class="file-pick-input"
				onchange={(e) => {
					selectedFile = (e.target as HTMLInputElement).files?.[0] ?? null;
				}}
			/>
		</label>
	{/if}

	<div class="form-group">
		<label for="doc-name" class="field-label">{$_('documents.summary')}</label>
		<input
			type="text"
			id="doc-name"
			name="name"
			placeholder={$_('documents.summaryPlaceholder')}
			maxlength="200"
			class="input"
			required
		/>
	</div>

	<div class="field">
		<label for="doc-type" class="field-label">{$_('documents.category')}</label>
		<select id="doc-type" name="doc_type" class="input">
			<option value="service" selected>{$_('documents.types.service')}</option>
			<option value="quotation">{$_('documents.types.quotation')}</option>
			<option value="papers">{$_('documents.types.papers')}</option>
			<option value="photo">{$_('documents.types.photo')}</option>
			<option value="notes">{$_('documents.types.notes')}</option>
			<option value="other">{$_('documents.types.other')}</option>
		</select>
	</div>

	<div class="field">
		<label for="expires-at" class="field-label">
			{$_('documents.expiry')} <span class="label-hint">{$_('documents.expiryOptional')}</span>
		</label>
		<input type="date" id="expires-at" name="expires_at" class="input" />
	</div>

	<div class="form-actions">
		<button type="submit" class="btn-primary" disabled={uploading || !selectedFile}>
			{uploading ? $_('documents.saving') : $_('documents.saveDocument')}
		</button>
		<button
			type="button"
			class="btn-cancel"
			disabled={uploading}
			onclick={() => sheet.closeSheet()}
		>
			{$_('documents.cancel')}
		</button>
	</div>
</form>

<style>
	.upload-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.file-chip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: var(--bg-muted);
		padding: 0.75rem 1rem;
		border-radius: 8px;
		border: 1px solid var(--border);
	}

	.file-chip-name {
		flex: 1;
		font-size: var(--text-sm);
		color: var(--text);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-chip-remove {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-subtle);
		padding: 0.25rem;
		line-height: 1;
		border-radius: 4px;
		display: flex;
		align-items: center;
	}

	.file-chip-remove:hover {
		background: var(--border);
		color: var(--text);
	}

	.file-pick-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-6) var(--space-4);
		border: 2px dashed var(--border);
		border-radius: 10px;
		background: var(--bg-subtle);
		cursor: pointer;
		text-align: center;
		transition:
			border-color 0.15s,
			background 0.15s;
	}

	.file-pick-zone:hover {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 6%, var(--bg-subtle));
	}

	.file-pick-label {
		font-size: var(--text-base);
		color: var(--text-muted);
	}

	.file-pick-hint {
		font-size: var(--text-xs);
		color: var(--text-subtle);
	}

	.file-pick-input {
		display: none;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.field-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
	}

	.label-hint {
		font-weight: 400;
		color: var(--text-subtle);
		font-size: var(--text-xs);
	}

	.input {
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
		font-size: var(--text-md);
		width: 100%;
		min-height: 48px;
		box-sizing: border-box;
	}

	.input:hover {
		border-color: var(--border-strong);
	}

	.input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: var(--accent);
	}

	.form-actions {
		display: flex;
		gap: var(--space-3);
	}

	.btn-primary {
		padding: 0.75rem 1.25rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		min-height: 48px;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-cancel {
		padding: 0.75rem 1.25rem;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		color: var(--text-muted);
		min-height: 48px;
	}

	.btn-cancel:hover:not(:disabled) {
		background: var(--bg-muted);
		color: var(--text);
	}

	.btn-cancel:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
