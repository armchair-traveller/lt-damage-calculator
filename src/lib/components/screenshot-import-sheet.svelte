<svelte:options runes={true} />

<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import ClipboardPasteIcon from '@lucide/svelte/icons/clipboard-paste';
	import CloudUploadIcon from '@lucide/svelte/icons/cloud-upload';
	import EraserIcon from '@lucide/svelte/icons/eraser';
	import FileImageIcon from '@lucide/svelte/icons/file-image';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import {
		SCREENSHOT_VARIANTS,
		findMissingImportedStats,
		mergeImportedStats,
		type ScreenshotImportResult,
		type ScreenshotVariant
	} from '$lib/calculator/importer.js';
	import { PERCENTLESS_STATS, STAT_KEYS, STAT_LABELS, type StatKey, type UiStats } from '$lib/calculator/model.js';
	import { cleanNumericText } from '$lib/calculator/workbench-impact.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import * as Table from '$lib/components/ui/table/index.js';

	type ScreenshotImportStatus = 'idle' | 'ready' | 'loading' | 'success' | 'error';
	type Props = {
		open: boolean;
		baseStats: UiStats;
		onApply: (nextStats: UiStats, notice: string) => void;
	};

	const SCREENSHOT_ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
	const SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;
	const statInputFormatter = new Intl.NumberFormat('en-US', {
		maximumFractionDigits: 5
	});

	let { open = $bindable(false), baseStats, onApply }: Props = $props();
	let file: File | null = $state<File | null>(null);
	let fileInput: HTMLInputElement | null = null;
	let previewUrl = $state('');
	let status: ScreenshotImportStatus = $state<ScreenshotImportStatus>('idle');
	let message = $state('');
	let result = $state.raw<ScreenshotImportResult | null>(null);
	let variant: ScreenshotVariant = $state('physical');
	let dragActive = $state(false);

	const selectedStats = $derived(result ? (result.variants?.[variant] ?? result.stats) : null);
	const missingStats = $derived(selectedStats ? findMissingImportedStats(selectedStats) : []);
	const rows = $derived.by(() => {
		const stats = selectedStats;
		if (!stats) return [];
		return STAT_KEYS.map((key) => ({
			key,
			label: statLabel(key, variant),
			values: stats[key] ?? ['', ''],
			missing: missingStats.includes(key)
		}));
	});
	const warningRows = $derived(
		result ? result.warnings.map((warning, index) => ({ id: `${index}:${warning}`, warning })) : []
	);
	const canApply = $derived(Boolean(result && missingStats.length === 0 && status !== 'loading'));
	const hasReviewWarning = $derived(
		Boolean(result && (result.confidence < 0.65 || result.warnings.length > 0 || missingStats.length > 0))
	);

	const fileInputAttachment: Attachment<HTMLInputElement> = (node) => {
		fileInput = node;
		return () => {
			if (fileInput === node) fileInput = null;
		};
	};

	$effect(() => {
		const objectUrl = previewUrl;
		return () => {
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	});

	function resetImport() {
		file = null;
		previewUrl = '';
		status = 'idle';
		message = '';
		result = null;
		variant = 'physical';
		dragActive = false;
		if (fileInput) fileInput.value = '';
	}

	function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		selectFile(input.files?.[0] ?? null);
	}

	function openFilePicker() {
		if (status === 'loading') return;
		fileInput?.click();
	}

	function handleImportZoneKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		openFilePicker();
	}

	function handleDragEnter(event: DragEvent) {
		if (status === 'loading' || !hasDraggedFiles(event.dataTransfer)) return;
		event.preventDefault();
		dragActive = true;
	}

	function handleDragOver(event: DragEvent) {
		if (status === 'loading' || !hasDraggedFiles(event.dataTransfer)) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
		dragActive = true;
	}

	function handleDragLeave(event: DragEvent) {
		const nextTarget = event.relatedTarget;
		if (nextTarget instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
			return;
		}
		dragActive = false;
	}

	function handleDrop(event: DragEvent) {
		if (status === 'loading') return;
		event.preventDefault();
		dragActive = false;
		selectFile(firstUsableScreenshotFile(event.dataTransfer?.files));
	}

	function handlePaste(event: ClipboardEvent) {
		if (!open || status === 'loading') return;
		const pastedFile = screenshotFileFromClipboard(event.clipboardData);
		if (!pastedFile) return;
		event.preventDefault();
		selectFile(pastedFile);
	}

	function hasDraggedFiles(dataTransfer: DataTransfer | null) {
		return Boolean(dataTransfer?.types.includes('Files'));
	}

	function screenshotFileFromClipboard(dataTransfer: DataTransfer | null) {
		const pastedFile = firstUsableScreenshotFile(dataTransfer?.files);
		if (pastedFile) return pastedFile;
		const itemFiles = Array.from(dataTransfer?.items ?? [])
			.filter((item) => item.kind === 'file')
			.map((item) => item.getAsFile())
			.filter((item): item is File => Boolean(item));
		return firstUsableScreenshotFile(itemFiles);
	}

	function firstUsableScreenshotFile(files: FileList | File[] | null | undefined) {
		const fileList = Array.from(files ?? []);
		return (
			fileList.find((item) => isAcceptedScreenshotFile(item) && item.size <= SCREENSHOT_MAX_BYTES) ??
			fileList[0] ??
			null
		);
	}

	function selectFile(nextFile: File | null) {
		result = null;
		variant = 'physical';
		message = '';
		dragActive = false;

		if (!nextFile) {
			resetImport();
			return;
		}

		if (!isAcceptedScreenshotFile(nextFile)) {
			file = null;
			previewUrl = '';
			status = 'error';
			message = 'Use a PNG, JPEG, WEBP, or non-animated GIF.';
			if (fileInput) fileInput.value = '';
			return;
		}

		if (nextFile.size > SCREENSHOT_MAX_BYTES) {
			file = null;
			previewUrl = '';
			status = 'error';
			message = 'Use an image smaller than 8 MB.';
			if (fileInput) fileInput.value = '';
			return;
		}

		file = nextFile;
		previewUrl = URL.createObjectURL(nextFile);
		status = 'ready';
		message = `${nextFile.name} (${formatFileSize(nextFile.size)})`;
		if (fileInput) fileInput.value = '';
	}

	async function runImport() {
		if (!file) {
			status = 'error';
			message = 'Choose a screenshot first.';
			return;
		}

		status = 'loading';
		message = 'Reading screenshot...';
		result = null;

		try {
			const formData = new FormData();
			formData.set('screenshot', file);
			const response = await fetch('/api/import-stats', {
				method: 'POST',
				body: formData
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(typeof body.message === 'string' ? body.message : 'Screenshot import failed.');
			}

			const importResult = body as ScreenshotImportResult;
			variant = normalizeImportVariant(importResult.variant);
			result = importResult;
			refreshReviewStatus();
		} catch (error) {
			status = 'error';
			message = error instanceof Error ? error.message : 'Screenshot import failed.';
		}
	}

	function applyImport() {
		if (!result || !selectedStats) return;
		if (findMissingImportedStats(selectedStats).length > 0) {
			status = 'error';
			message = 'Incomplete extraction.';
			return;
		}

		const appliedVariant = variant;
		const nextStats = mergeImportedStats(baseStats, selectedStats);
		resetImport();
		open = false;
		onApply(nextStats, `${variantLabel(appliedVariant)} imported.`);
	}

	function isAcceptedScreenshotFile(file: File) {
		if (SCREENSHOT_ACCEPTED_TYPES.has(file.type)) return true;
		const extension = file.name.split('.').pop()?.toLowerCase();
		return (
			extension === 'png' ||
			extension === 'jpg' ||
			extension === 'jpeg' ||
			extension === 'webp' ||
			extension === 'gif'
		);
	}

	function formatFileSize(size: number) {
		if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
		return `${(size / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatImportConfidence(confidence: number) {
		return `${Math.round(confidence * 100)}%`;
	}

	function statusText() {
		if (message) return message;
		return 'PNG, JPEG, WEBP, GIF up to 8 MB.';
	}

	function statusClass() {
		if (status === 'error') {
			return 'border-destructive/40 bg-destructive/10 text-destructive';
		}
		if (hasReviewWarning) {
			return 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200';
		}
		if (status === 'success') {
			return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
		}
		if (status === 'loading') {
			return 'border-primary/35 bg-primary/10 text-primary';
		}
		return 'border-border bg-muted/25 text-muted-foreground';
	}

	function zoneClass() {
		if (status === 'loading') {
			return 'cursor-wait border-primary/35 bg-primary/10 text-muted-foreground';
		}
		if (dragActive) {
			return 'cursor-copy border-primary/60 bg-primary/10 text-primary shadow-[inset_0_0_0_1px_var(--primary)]';
		}
		if (status === 'error') {
			return 'cursor-pointer border-destructive/35 bg-destructive/5 text-muted-foreground hover:bg-destructive/10';
		}
		return 'cursor-pointer border-border bg-muted/20 text-muted-foreground hover:border-primary/40 hover:bg-muted/35';
	}

	function importedStatsForVariant(result: ScreenshotImportResult, nextVariant: ScreenshotVariant) {
		return result.variants?.[nextVariant] ?? result.stats;
	}

	function normalizeImportVariant(value: unknown): ScreenshotVariant {
		return value === 'magical' ? 'magical' : 'physical';
	}

	function selectVariant(nextVariant: ScreenshotVariant) {
		variant = nextVariant;
		refreshReviewStatus();
	}

	function refreshReviewStatus() {
		if (!result) return;
		const missing = findMissingImportedStats(importedStatsForVariant(result, variant));
		if (missing.length > 0) {
			status = 'error';
			message = 'Incomplete extraction.';
			return;
		}
		status = 'success';
		message = result.confidence < 0.65 ? 'Low confidence. Review values.' : 'Review values.';
	}

	function variantLabel(nextVariant: ScreenshotVariant) {
		return nextVariant === 'magical' ? 'Magical focus' : 'Physical focus';
	}

	function variantName(nextVariant: ScreenshotVariant) {
		return nextVariant === 'magical' ? 'Magical' : 'Physical';
	}

	function statLabel(key: StatKey, nextVariant: ScreenshotVariant) {
		if (key === 'strength') return nextVariant === 'magical' ? 'Intelligence' : 'Strength';
		if (key === 'attack') return nextVariant === 'magical' ? 'Ele. Intensity' : 'Attack';
		return STAT_LABELS[key];
	}

	function variantButtonClass(nextVariant: ScreenshotVariant) {
		return variant === nextVariant
			? 'bg-background text-foreground shadow-sm'
			: 'text-muted-foreground hover:text-foreground';
	}

	function previewValue(key: StatKey, value: string, index: 0 | 1) {
		if (!value) return '---';
		const displayed = displayValue(value);
		return index === 1 && !PERCENTLESS_STATS.has(key) ? `${displayed}%` : displayed;
	}

	function displayValue(value: string | undefined) {
		const cleaned = cleanNumericText(value ?? '');
		if (!cleaned) return cleaned;
		const parsed = Number(cleaned);
		if (!Number.isFinite(parsed)) return cleaned;
		return statInputFormatter.format(parsed);
	}
</script>

<svelte:window onpaste={handlePaste} />

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="data-[side=right]:w-[min(100vw,40rem)] data-[side=right]:sm:max-w-none overflow-y-auto p-0">
		<Sheet.Header class="fantasy-sheet-header border-b border-border/80 px-5 py-4">
			<Sheet.Title>Import Screenshot</Sheet.Title>
		</Sheet.Header>

		<div class="space-y-4 p-5">
			<input
				{@attach fileInputAttachment}
				id="screenshot-import-file"
				class="hidden"
				type="file"
				accept="image/png,image/jpeg,image/webp,image/gif"
				disabled={status === 'loading'}
				hidden
				tabindex="-1"
				aria-hidden="true"
				onchange={handleFileChange}
			/>

			<div
				role="button"
				tabindex={status === 'loading' ? -1 : 0}
				aria-controls="screenshot-import-file"
				aria-disabled={status === 'loading'}
				class={`relative grid min-h-52 overflow-hidden rounded-xl border border-dashed transition ${zoneClass()}`}
				onclick={openFilePicker}
				onkeydown={handleImportZoneKeydown}
				ondragenter={handleDragEnter}
				ondragover={handleDragOver}
				ondragleave={handleDragLeave}
				ondrop={handleDrop}
			>
				{#if previewUrl}
					<img
						src={previewUrl}
						alt={file?.name ?? 'Selected screenshot'}
						class="h-full max-h-80 min-h-52 w-full object-contain"
					/>
					<div class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-border/70 bg-background/92 px-3 py-2 text-xs backdrop-blur">
						<span class="min-w-0 truncate font-medium text-foreground">
							{file?.name}
						</span>
						<span class="shrink-0 text-muted-foreground">Change</span>
					</div>
				{:else}
					<div class="grid place-items-center px-5 py-8 text-center">
						<div class="grid size-12 place-items-center rounded-md border border-border bg-background text-muted-foreground shadow-sm">
							{#if status === 'loading'}
								<LoaderCircleIcon class="size-6 animate-spin text-primary" />
							{:else if dragActive}
								<CloudUploadIcon class="size-6 text-primary" />
							{:else}
								<FileImageIcon class="size-6" />
							{/if}
						</div>
						<div class="mt-3 text-sm font-semibold text-foreground">
							{#if dragActive}
								Drop screenshot
							{:else}
								Choose screenshot
							{/if}
						</div>
						<div class="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
							<span>PNG, JPEG, WEBP, GIF</span>
							<span class="text-border">/</span>
							<span>8 MB max</span>
							<span class="text-border">/</span>
							<span class="inline-flex items-center gap-1">
								<ClipboardPasteIcon class="size-3.5" />
								Paste enabled
							</span>
						</div>
					</div>
				{/if}
			</div>

			<div class={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${statusClass()}`}>
				{#if status === 'loading'}
					<LoaderCircleIcon class="mt-0.5 size-4 shrink-0 animate-spin" />
				{:else if status === 'error'}
					<CircleAlertIcon class="mt-0.5 size-4 shrink-0" />
				{:else if hasReviewWarning}
					<CircleAlertIcon class="mt-0.5 size-4 shrink-0" />
				{:else if status === 'success'}
					<CheckIcon class="mt-0.5 size-4 shrink-0" />
				{:else}
					<FileImageIcon class="mt-0.5 size-4 shrink-0" />
				{/if}
				<span class="min-w-0">{statusText()}</span>
			</div>

			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex flex-wrap gap-2">
					<Button onclick={runImport} disabled={!file || status === 'loading'}>
						{#if status === 'loading'}
							<LoaderCircleIcon data-icon="inline-start" class="animate-spin" />
						{:else}
							<CloudUploadIcon data-icon="inline-start" />
						{/if}
						Import
					</Button>
					<Button variant="outline" onclick={openFilePicker} disabled={status === 'loading'}>
						<FileImageIcon data-icon="inline-start" />
						Choose
					</Button>
				</div>
				<Button variant="ghost" onclick={resetImport} disabled={status === 'loading'}>
					<EraserIcon data-icon="inline-start" />
					Clear
				</Button>
			</div>

			{#if result}
				<div class="space-y-3 rounded-md border border-border bg-muted/15 p-3">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div class="flex flex-wrap items-center gap-2">
							<Badge variant="secondary">Suggested {variantName(result.variant)}</Badge>
							<Badge
								variant="outline"
								class={result.confidence < 0.65
									? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200'
									: ''}
							>
								Confidence {formatImportConfidence(result.confidence)}
							</Badge>
							{#if missingStats.length > 0}
								<Badge variant="destructive">{missingStats.length} missing</Badge>
							{/if}
						</div>

						<div class="inline-grid h-9 grid-cols-2 rounded-md bg-muted p-1">
							{#each SCREENSHOT_VARIANTS as screenshotVariant (screenshotVariant)}
								<button
									type="button"
									aria-pressed={variant === screenshotVariant}
									class={`rounded-sm px-3 text-sm font-medium transition ${variantButtonClass(screenshotVariant)}`}
									onclick={() => selectVariant(screenshotVariant)}
								>
									{variantName(screenshotVariant)}
								</button>
							{/each}
						</div>
					</div>

					{#if warningRows.length > 0}
						<div class="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
							<div class="text-xs font-semibold text-amber-900 dark:text-amber-100">Review notes</div>
							<div class="space-y-1.5">
								{#each warningRows as row (row.id)}
									<div class="flex items-start gap-2 text-xs text-amber-900/85 dark:text-amber-100/85">
										<CircleAlertIcon class="mt-0.5 size-3.5 shrink-0" />
										<span class="min-w-0">{row.warning}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<div class="overflow-hidden rounded-md border border-border bg-background">
						<Table.Root class="table-fixed text-xs">
							<Table.Header>
								<Table.Row>
									<Table.Head class="h-9 w-[44%] px-3">Stat</Table.Head>
									<Table.Head class="h-9 w-[28%] px-3 text-right">Flat</Table.Head>
									<Table.Head class="h-9 w-[28%] px-3 text-right">%</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each rows as row (row.key)}
									<Table.Row class={row.missing ? 'border-l-2 border-l-destructive bg-destructive/5' : 'border-l-2 border-l-transparent'}>
										<Table.Cell class="px-3 py-2 font-medium">
											<span class="block truncate">{row.label}</span>
										</Table.Cell>
										<Table.Cell class={`px-3 py-2 text-right tabular-nums ${row.values[0] ? '' : 'text-destructive'}`}>
											{previewValue(row.key, row.values[0], 0)}
										</Table.Cell>
										<Table.Cell
											class={`px-3 py-2 text-right tabular-nums ${
												PERCENTLESS_STATS.has(row.key) || row.values[1] ? 'text-muted-foreground' : 'text-destructive'
											}`}
										>
											{#if PERCENTLESS_STATS.has(row.key)}
												---
											{:else}
												{previewValue(row.key, row.values[1], 1)}
											{/if}
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</div>

					<div class="flex flex-wrap justify-end gap-2">
						<Button onclick={applyImport} disabled={!canApply}>
							<CheckIcon data-icon="inline-start" />
							Apply to Base
						</Button>
					</div>
				</div>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>
