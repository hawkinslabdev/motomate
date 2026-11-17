<script lang="ts">
	let {
		checked = $bindable(false),
		label,
		type = 'button'
	}: { checked?: boolean; label: string; type?: 'button' | 'submit' } = $props();
</script>

<button
	{type}
	role="switch"
	class="toggle-btn"
	class:toggle-btn--on={checked}
	aria-checked={checked}
	aria-label={label}
	onclick={() => {
		if (type === 'button') checked = !checked;
	}}
>
	<span class="toggle-thumb"></span>
</button>
