<svelte:options runes={true} />

<script lang="ts">
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import type { ClassArt } from '$lib/calculator/class-art.js';
	import { Button } from '$lib/components/ui/button/index.js';

	type Props = {
		announcement?: string;
		art: ClassArt;
		customized?: boolean;
		onChoose: () => void;
		selectedPreset?: string | null;
	};

	let {
		announcement = '',
		art,
		customized = false,
		onChoose,
		selectedPreset = null
	}: Props = $props();

	const pickerLabel = $derived(selectedPreset ?? 'Choose class');
</script>

<aside class="class-art-rail" aria-labelledby="selected-class-title">
	<div class="class-art-copy">
		<p class="class-art-kicker">Class preset · character art</p>
		<h2 id="selected-class-title">
			Pick a class
			<span>for the build.</span>
		</h2>
		<div class="class-art-picker-row">
			<Button
				variant="outline"
				size="sm"
				class="class-art-picker min-w-0 justify-between"
				aria-label={`Change class. Current selection: ${pickerLabel}`}
				onclick={onChoose}
			>
				<SparklesIcon data-icon="inline-start" />
				<span class="truncate">{pickerLabel}</span>
				<ChevronsUpDownIcon data-icon="inline-end" />
			</Button>
			{#if customized}
				<span class="class-art-modified">Preset tuned</span>
			{/if}
		</div>
	</div>

	<div class="class-art-orbit" aria-hidden="true"><span>✦</span></div>

	<div class="class-art-stage" data-composition={art.composition} aria-hidden="true">
		{#key art.src}
			<img src={art.src} alt="" decoding="async" />
		{/key}
	</div>

	<div class="class-art-footer">
		<p><span></span>Character art rotates with the class preset</p>
		<a href={art.sourcePage} target="_blank" rel="external noreferrer">
			Official kit
			<ExternalLinkIcon aria-hidden="true" />
		</a>
	</div>

	<p class="sr-only" aria-live="polite">{announcement}</p>
</aside>
