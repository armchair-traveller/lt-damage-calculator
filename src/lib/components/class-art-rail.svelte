<svelte:options runes={true} />

<script lang="ts">
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import type { ClassArt } from '$lib/calculator/class-art.js';

	type Props = {
		announcement?: string;
		art: ClassArt;
		selectedPreset?: string | null;
	};

	let { announcement = '', art, selectedPreset = null }: Props = $props();
</script>

<aside class="class-art-rail" aria-labelledby="selected-class-title">
	<div class="class-art-copy">
		<p class="class-art-kicker">Official fan-site kit · class host</p>
		<h2 id="selected-class-title">
			Pick a class
			<span>for the build.</span>
		</h2>
	</div>

	<div class="class-art-orbit" aria-hidden="true"><span>✦</span></div>

	<div class="class-art-badge">
		<span>{selectedPreset ? 'A/B' : 'Kit'}</span>
		<strong>{selectedPreset ? art.label : `${art.label} guest art`}</strong>
	</div>

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
