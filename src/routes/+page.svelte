<svelte:options runes={true} />

<script lang="ts">
	import { browser } from '$app/environment';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import ClipboardCopyIcon from '@lucide/svelte/icons/clipboard-copy';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import EraserIcon from '@lucide/svelte/icons/eraser';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import ScaleIcon from '@lucide/svelte/icons/scale';
	import Settings2Icon from '@lucide/svelte/icons/settings-2';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import {
		NativeSelect,
		NativeSelectOption
	} from '$lib/components/ui/native-select/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import {
		applyClassPreset,
		applyQuickPreset,
		buffs,
		calculateDashboard,
		calculateEquivalenceTables,
		CLASS_PRESETS,
		clearUiStats,
		createDefaultState,
		formatBuffStats,
		normalizeState,
		numericStatsToUi,
		parseStoredState,
		PERCENTLESS_STATS,
		QUICK_FACTOR_PRESETS,
		serializeState,
		signedTone,
		STAT_KEYS,
		STAT_LABELS,
		STORAGE_KEY,
		TARGETS,
		toggleBuffTier,
		setChoiceBuff,
		setSingleBuff,
		type CalculatorState,
		type EnemyType,
		type SelectedBuffs,
		type StatKey,
		type UiStats
	} from '$lib/calculator/model.js';

	const ENEMY_TYPES: EnemyType[] = ['normal', 'boss'];

	let calculator: CalculatorState = $state(createDefaultState());
	let hydrated = $state(false);
	let selectedPreset = $state('Hero (Greatsword)');
	let settingsOpen = $state(false);
	let buffsOpen = $state(false);
	let equivalenceOpen = $state(false);
	let transferOpen = $state(false);
	let transferText = $state('');
	let transferStatus = $state('');
	let equivalenceTab = $state('damage');
	let equivalenceValues = $state({ perc: 1, critical: 10 });

	const report = $derived(calculateDashboard(calculator));
	const buffedUiStats = $derived(numericStatsToUi(report.buffedStats));
	const equivalence = $derived(calculateEquivalenceTables(calculator, equivalenceValues));
	const panels = $derived([
		{
			id: 'base',
			title: 'Stats',
			stats: calculator.stats,
			clearable: false,
			primary: report.formatted.base,
			secondary: report.formatted.buffed,
			secondaryIncrease: report.formatted.buffIncrease
		},
		{
			id: 'a',
			title: 'Changes A',
			stats: calculator.statsA,
			clearable: true,
			primary: report.formatted.a,
			primaryIncrease: report.formatted.increaseA,
			secondary: report.formatted.buffedA,
			secondaryIncrease: report.formatted.buffedIncreaseA
		},
		{
			id: 'b',
			title: 'Changes B',
			stats: calculator.statsB,
			clearable: true,
			primary: report.formatted.b,
			primaryIncrease: report.formatted.increaseB,
			secondary: report.formatted.buffedB,
			secondaryIncrease: report.formatted.buffedIncreaseB
		}
	]);

	$effect(() => {
		if (!browser || hydrated) return;
		const stored = window.localStorage.getItem(STORAGE_KEY);
		if (stored) {
			calculator = parseStoredState(stored);
		} else {
			const legacy = readLegacyState();
			if (legacy) calculator = normalizeState(legacy);
		}
		hydrated = true;
	});

	$effect(() => {
		if (!browser || !hydrated) return;
		window.localStorage.setItem(STORAGE_KEY, serializeState(calculator));
	});

	function readLegacyState() {
		if (!browser) return null;
		const legacyKeys = ['ltdcStats', 'ltdcStatsA', 'ltdcStatsB', 'ltdcSettings', 'ltdcSelectedBuffs'];
		if (!legacyKeys.some((key) => window.localStorage.getItem(key) !== null)) return null;
		return {
			stats: parseLegacyItem('ltdcStats'),
			statsA: parseLegacyItem('ltdcStatsA'),
			statsB: parseLegacyItem('ltdcStatsB'),
			settings: parseLegacyItem('ltdcSettings'),
			selectedBuffs: parseLegacyItem('ltdcSelectedBuffs')
		};
	}

	function parseLegacyItem(key: string) {
		const item = window.localStorage.getItem(key);
		if (!item) return undefined;
		try {
			return JSON.parse(item);
		} catch {
			return undefined;
		}
	}

	function setStat(stats: UiStats, key: StatKey, index: 0 | 1, value: string) {
		stats[key][index] = value;
	}

	function clearPanel(panelId: string) {
		if (panelId === 'a') calculator.statsA = clearUiStats();
		if (panelId === 'b') calculator.statsB = clearUiStats();
	}

	function resetAll() {
		calculator = createDefaultState();
		selectedPreset = 'Hero (Greatsword)';
		transferStatus = 'Reset.';
	}

	function applySelectedPreset() {
		calculator.settings = applyClassPreset(calculator.settings, selectedPreset);
	}

	function updateSlider(key: 'summonWeight' | 'backWeight' | 'minWeight' | 'bossWeight', value: number) {
		calculator.settings[key] = value;
	}

	function exportData() {
		transferText = serializeState(calculator);
		transferStatus = 'Exported.';
	}

	function importData() {
		try {
			calculator = parseStoredState(transferText);
			transferStatus = 'Imported.';
		} catch {
			transferStatus = 'Import failed.';
		}
	}

	async function copyTransfer() {
		if (!browser || !transferText) return;
		await navigator.clipboard.writeText(transferText);
		transferStatus = 'Copied.';
	}

	function setBuffs(next: SelectedBuffs) {
		calculator.selectedBuffs = next;
	}

	function toneClass(value: string | undefined) {
		const tone = signedTone(value ?? '');
		return tone === 'positive'
			? 'text-emerald-700 dark:text-emerald-300'
			: tone === 'negative'
				? 'text-rose-700 dark:text-rose-300'
				: 'text-muted-foreground';
	}

	function inputValue(event: Event) {
		return (event.currentTarget as HTMLInputElement).value;
	}
</script>

<svelte:head>
	<title>LaTale Damage Calculator</title>
	<meta
		name="description"
		content="Personal LaTale damage calculator for stat, buff, and equivalence comparisons."
	/>
</svelte:head>

<main class="min-h-dvh bg-background">
	<header class="border-border/80 bg-background/95 sticky top-0 z-30 border-b backdrop-blur">
		<div class="mx-auto flex max-w-[1800px] flex-col gap-3 px-4 py-3 lg:px-6">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex min-w-0 items-center gap-3">
					<div class="border-border bg-card grid size-10 shrink-0 place-items-center rounded-full border shadow-sm">
						<ActivityIcon class="size-5" />
					</div>
					<div class="min-w-0">
						<h1 class="truncate text-lg font-semibold">LaTale Damage Calculator</h1>
						<div class="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
							<span>{TARGETS[report.settings.target].label}</span>
							<span>Boss {Math.round(report.settings.bossWeight * 100)}%</span>
							<span>Minimum {Math.round(report.settings.minWeight * 100)}%</span>
						</div>
					</div>
				</div>

				<div class="flex flex-wrap items-center justify-end gap-2">
					<Badge variant="secondary" class="rounded-full">
						Normal {report.formatted.base.normal}
					</Badge>
					<Badge variant="secondary" class="rounded-full">
						Boss {report.formatted.base.boss}
					</Badge>
					<Badge class="rounded-full">
						Buffed {report.formatted.buffIncrease.avg}
					</Badge>

					<ThemeToggle />
					<Button
						variant="outline"
						size="icon"
						aria-label="Settings"
						title="Settings"
						onclick={() => (settingsOpen = true)}
					>
						<Settings2Icon />
					</Button>
					<Button
						variant="outline"
						size="icon"
						aria-label="Buffs"
						title="Buffs"
						onclick={() => (buffsOpen = true)}
					>
						<SparklesIcon />
					</Button>
					<Button
						variant="outline"
						size="icon"
						aria-label="Equivalence"
						title="Equivalence"
						onclick={() => (equivalenceOpen = true)}
					>
						<ScaleIcon />
					</Button>
					<Button
						variant="outline"
						size="icon"
						aria-label="Import and export"
						title="Import and export"
						onclick={() => (transferOpen = true)}
					>
						<DatabaseIcon />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Reset all"
						title="Reset all"
						onclick={resetAll}
					>
						<RotateCcwIcon />
					</Button>
				</div>
			</div>
		</div>
	</header>

	<section class="mx-auto max-w-[1800px] px-4 py-5 lg:px-6">
		<div class="grid gap-4 xl:grid-cols-3">
			{#each panels as panel (panel.id)}
				<article class="border-border bg-card rounded-lg border shadow-sm">
					<div class="border-border/80 flex items-center justify-between gap-2 border-b px-4 py-3">
						<div>
							<h2 class="text-base font-semibold">{panel.title}</h2>
							<p class="text-muted-foreground text-xs">
								{panel.id === 'base' ? 'Current character stats' : 'Flat and percent deltas'}
							</p>
						</div>
						{#if panel.clearable}
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Clear ${panel.title}`}
								title={`Clear ${panel.title}`}
								onclick={() => clearPanel(panel.id)}
							>
								<EraserIcon />
							</Button>
						{/if}
					</div>

					<div class="px-4 py-4">
						<div class="grid grid-cols-[minmax(7.25rem,1fr)_minmax(5.25rem,6rem)_minmax(3.75rem,4.5rem)] gap-2 text-xs">
							<div class="text-muted-foreground flex h-8 items-center font-medium">Stat</div>
							<div class="text-muted-foreground flex h-8 items-center justify-center font-medium">Value</div>
							<div class="text-muted-foreground flex h-8 items-center justify-center font-medium">%</div>

							{#each STAT_KEYS as key (key)}
								<Label
									for={`${panel.id}-${key}-flat`}
									class="text-foreground/90 min-h-9 justify-end text-right text-xs leading-tight"
								>
									{STAT_LABELS[key]}
								</Label>
								<Input
									id={`${panel.id}-${key}-flat`}
									type="text"
									inputmode="decimal"
									value={panel.stats[key][0]}
									class="h-9 px-2 text-right text-xs tabular-nums"
									oninput={(event) => setStat(panel.stats, key, 0, inputValue(event))}
								/>
								{#if PERCENTLESS_STATS.has(key)}
									<div class="bg-muted/50 text-muted-foreground grid h-9 place-items-center rounded-full text-xs">
										-
									</div>
								{:else}
									<Input
										id={`${panel.id}-${key}-percent`}
										type="text"
										inputmode="decimal"
										value={panel.stats[key][1]}
										class="h-9 px-2 text-right text-xs tabular-nums"
										oninput={(event) => setStat(panel.stats, key, 1, inputValue(event))}
									/>
								{/if}
							{/each}
						</div>
					</div>

					<div class="border-border/80 grid gap-3 border-t p-4 sm:grid-cols-2">
						<div class="rounded-lg bg-muted/45 p-3">
							<div class="mb-2 flex items-center justify-between gap-2">
								<span class="text-xs font-medium text-muted-foreground">
									{panel.id === 'base' ? 'Damage' : 'Damage Increase'}
								</span>
								{#if panel.primaryIncrease}
									<span class={`text-xs font-semibold tabular-nums ${toneClass(panel.primaryIncrease.avg)}`}>
										{panel.primaryIncrease.avg}
									</span>
								{/if}
							</div>
							<div class="grid grid-cols-2 gap-2">
								<div>
									<div class="text-sm font-semibold tabular-nums">
										{panel.id === 'base' ? panel.primary.normal : panel.primaryIncrease?.normal}
									</div>
									<div class="text-muted-foreground text-[11px]">Normal {panel.primary.normal}</div>
								</div>
								<div>
									<div class="text-sm font-semibold tabular-nums">
										{panel.id === 'base' ? panel.primary.boss : panel.primaryIncrease?.boss}
									</div>
									<div class="text-muted-foreground text-[11px]">Boss {panel.primary.boss}</div>
								</div>
							</div>
						</div>

						<div class="rounded-lg bg-muted/45 p-3">
							<div class="mb-2 flex items-center justify-between gap-2">
								<span class="text-xs font-medium text-muted-foreground">
									{panel.id === 'base' ? 'Buffed Damage' : 'Buffed Increase'}
								</span>
								<span class={`text-xs font-semibold tabular-nums ${toneClass(panel.secondaryIncrease.avg)}`}>
									{panel.secondaryIncrease.avg}
								</span>
							</div>
							<div class="grid grid-cols-2 gap-2">
								<div>
									<div class={`text-sm font-semibold tabular-nums ${panel.id === 'base' ? '' : toneClass(panel.secondaryIncrease.normal)}`}>
										{panel.id === 'base' ? panel.secondary.normal : panel.secondaryIncrease.normal}
									</div>
									<div class="text-muted-foreground text-[11px]">Normal {panel.secondary.normal}</div>
								</div>
								<div>
									<div class={`text-sm font-semibold tabular-nums ${panel.id === 'base' ? '' : toneClass(panel.secondaryIncrease.boss)}`}>
										{panel.id === 'base' ? panel.secondary.boss : panel.secondaryIncrease.boss}
									</div>
									<div class="text-muted-foreground text-[11px]">Boss {panel.secondary.boss}</div>
								</div>
							</div>
						</div>
					</div>
				</article>
			{/each}
		</div>

		<section class="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
			<div class="border-border bg-card rounded-lg border p-4 shadow-sm">
				<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
					<h2 class="text-sm font-semibold">Buffed Stat Snapshot</h2>
					<Badge variant="secondary" class="rounded-full">Active buff result</Badge>
				</div>
				<div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
					{#each STAT_KEYS as key (key)}
						<div class="bg-muted/45 rounded-lg px-3 py-2">
							<div class="text-muted-foreground truncate text-[11px]">{STAT_LABELS[key]}</div>
							<div class="mt-1 flex items-baseline justify-between gap-2">
								<span class="text-sm font-semibold tabular-nums">{buffedUiStats[key][0]}</span>
								<span class="text-muted-foreground text-xs tabular-nums">{buffedUiStats[key][1]}</span>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div class="border-border bg-card rounded-lg border p-4 shadow-sm">
				<div class="mb-3 flex items-center justify-between gap-2">
					<h2 class="text-sm font-semibold">Defense Profile</h2>
					<Badge variant="outline" class="rounded-full">{TARGETS[report.settings.target].label}</Badge>
				</div>
				<div class="grid gap-2 sm:grid-cols-2">
					{#each ENEMY_TYPES as enemy}
						<div class="bg-muted/45 rounded-lg p-3">
							<div class="mb-2 text-xs font-semibold uppercase text-muted-foreground">{enemy}</div>
							<div class="grid grid-cols-2 gap-2 text-xs">
								<span>Scaling</span>
								<span class="text-right tabular-nums">{report.defenses[enemy].multiplier}</span>
								<span>Flat</span>
								<span class="text-right tabular-nums">{report.defenses[enemy].flat.toLocaleString()}</span>
								<span>Mitigation</span>
								<span class="text-right tabular-nums">{Math.round(report.defenses[enemy].mitigation * 100)}%</span>
								<span>Phasing</span>
								<span class="text-right tabular-nums">{Math.round(report.defenses[enemy].phasing * 100)}%</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</section>
	</section>
</main>

<Sheet.Root bind:open={settingsOpen}>
	<Sheet.Content side="right" class="data-[side=right]:w-[min(100vw,36rem)] data-[side=right]:sm:max-w-none overflow-y-auto p-5">
		<Sheet.Header class="mb-5">
			<Sheet.Title>Additional Parameters</Sheet.Title>
			<Sheet.Description>Skill factors, averages, and target selection.</Sheet.Description>
		</Sheet.Header>

		<div class="space-y-5">
			<div class="space-y-2">
				<Label for="class-preset">Class preset</Label>
				<div class="flex gap-2">
					<NativeSelect id="class-preset" bind:value={selectedPreset} class="w-full">
						{#each Object.keys(CLASS_PRESETS) as preset}
							<NativeSelectOption value={preset}>{preset}</NativeSelectOption>
						{/each}
					</NativeSelect>
					<Button variant="outline" onclick={applySelectedPreset}>Apply</Button>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-2">
				{#each QUICK_FACTOR_PRESETS as preset}
					<Button variant="secondary" class="justify-start" onclick={() => (calculator.settings = applyQuickPreset(calculator.settings, preset))}>
						{preset.label}
					</Button>
				{/each}
			</div>

			<div class="grid gap-3 sm:grid-cols-3">
				<div class="space-y-2">
					<Label for="sf">Total Stats %</Label>
					<Input id="sf" type="number" bind:value={calculator.settings.sF} class="tabular-nums" />
				</div>
				<div class="space-y-2">
					<Label for="af">Skill Multiplier</Label>
					<Input id="af" type="number" bind:value={calculator.settings.aF} class="tabular-nums" />
				</div>
				<div class="space-y-2">
					<Label for="ff">Final Factor %</Label>
					<Input id="ff" type="number" bind:value={calculator.settings.fF} class="tabular-nums" />
				</div>
			</div>

			<div class="space-y-4">
				<div class="space-y-2">
					<div class="flex justify-between gap-2 text-sm">
						<Label>Summon Weight</Label>
						<span class="text-muted-foreground tabular-nums">{(calculator.settings.summonWeight * 100).toFixed(1)}%</span>
					</div>
					<Slider type="single" min={0} max={1} step={0.025} value={calculator.settings.summonWeight} onValueChange={(value) => updateSlider('summonWeight', Number(value))} />
				</div>
				<div class="space-y-2">
					<div class="flex justify-between gap-2 text-sm">
						<Label>Back/Melee Weight</Label>
						<span class="text-muted-foreground tabular-nums">{(calculator.settings.backWeight * 100).toFixed(1)}%</span>
					</div>
					<Slider type="single" min={0} max={1} step={0.025} value={calculator.settings.backWeight} onValueChange={(value) => updateSlider('backWeight', Number(value))} />
				</div>
				<div class="space-y-2">
					<div class="flex justify-between gap-2 text-sm">
						<Label>Minimum Weight</Label>
						<span class="text-muted-foreground tabular-nums">{(calculator.settings.minWeight * 100).toFixed(1)}%</span>
					</div>
					<Slider type="single" min={0} max={0.5} step={0.5} value={calculator.settings.minWeight} onValueChange={(value) => updateSlider('minWeight', Number(value))} />
				</div>
				<div class="space-y-2">
					<div class="flex justify-between gap-2 text-sm">
						<Label>Boss Weight</Label>
						<span class="text-muted-foreground tabular-nums">{(calculator.settings.bossWeight * 100).toFixed(1)}%</span>
					</div>
					<Slider type="single" min={0} max={1} step={0.025} value={calculator.settings.bossWeight} onValueChange={(value) => updateSlider('bossWeight', Number(value))} />
				</div>
			</div>

			<div class="space-y-2">
				<Label for="target">Target</Label>
				<NativeSelect id="target" bind:value={calculator.settings.target} class="w-full">
					{#each Object.entries(TARGETS) as [key, target]}
						<NativeSelectOption value={key}>{target.label}</NativeSelectOption>
					{/each}
				</NativeSelect>
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>

<Sheet.Root bind:open={buffsOpen}>
	<Sheet.Content side="right" class="data-[side=right]:w-[min(100vw,48rem)] data-[side=right]:sm:max-w-none overflow-y-auto p-5">
		<Sheet.Header class="mb-5">
			<Sheet.Title>Buffs</Sheet.Title>
			<Sheet.Description>Selections apply to the buffed damage and equivalence reports.</Sheet.Description>
		</Sheet.Header>

		<div class="mb-4 flex flex-wrap gap-2">
			{#each [...Object.keys(buffs), 'Clear'] as tier}
				<Button variant={tier === 'Clear' ? 'outline' : 'secondary'} size="sm" onclick={() => setBuffs(toggleBuffTier(calculator.selectedBuffs, tier))}>
					{tier === 'Clear' ? 'Deselect All' : tier}
				</Button>
			{/each}
		</div>

		<div class="space-y-6">
			{#each Object.entries(buffs) as [tierName, tier]}
				<section>
					<div class="mb-3 flex items-center gap-3">
						<h3 class="text-sm font-semibold">{tierName}</h3>
						<div class="bg-border h-px flex-1"></div>
					</div>
					<div class="grid gap-3 sm:grid-cols-2">
						{#each Object.entries(tier) as [groupName, group]}
							{#if groupName === 'single'}
								{#each Object.entries(group) as [buffName, buffStats]}
									<label class="hover:bg-muted/60 flex items-start gap-3 rounded-lg border border-transparent p-2 transition">
										<Checkbox
											checked={Boolean((calculator.selectedBuffs[tierName]?.single as Record<string, boolean> | undefined)?.[buffName])}
											onCheckedChange={(checked) =>
												setBuffs(setSingleBuff(calculator.selectedBuffs, tierName, buffName, Boolean(checked)))}
										/>
										<span class="min-w-0">
											<span class="block text-sm leading-tight">{buffName}</span>
											<span class="text-muted-foreground block truncate text-xs">{formatBuffStats(buffStats as Partial<Record<StatKey, [number, number]>>)}</span>
										</span>
									</label>
								{/each}
							{:else}
								<div class="space-y-2 rounded-lg bg-muted/45 p-3">
									<Label for={`${tierName}-${groupName}`}>{groupName}</Label>
									<NativeSelect
										id={`${tierName}-${groupName}`}
										value={calculator.selectedBuffs[tierName]?.[groupName] as string}
										class="w-full"
										onchange={(event) =>
											setBuffs(setChoiceBuff(calculator.selectedBuffs, tierName, groupName, inputValue(event)))}
									>
										<NativeSelectOption value="None">None</NativeSelectOption>
										{#each Object.keys(group) as buffName}
											<NativeSelectOption value={buffName}>{buffName}</NativeSelectOption>
										{/each}
									</NativeSelect>
								</div>
							{/if}
						{/each}
					</div>
				</section>
			{/each}
		</div>
	</Sheet.Content>
</Sheet.Root>

<Sheet.Root bind:open={equivalenceOpen}>
	<Sheet.Content side="right" class="data-[side=right]:w-[min(100vw,42rem)] data-[side=right]:sm:max-w-none overflow-y-auto p-5">
		<Sheet.Header class="mb-5">
			<Sheet.Title>Equivalence</Sheet.Title>
			<Sheet.Description>Computed from buffed stats and the active parameter set.</Sheet.Description>
		</Sheet.Header>

		<Tabs.Tabs bind:value={equivalenceTab}>
			<Tabs.List class="mb-4">
				<Tabs.Trigger value="damage">Damage %</Tabs.Trigger>
				<Tabs.Trigger value="critical">Critical</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="damage" class="space-y-4">
				<div class="max-w-52 space-y-2">
					<Label for="eq-percent">Damage Increase</Label>
					<div class="flex items-center gap-2">
						<Input id="eq-percent" type="number" bind:value={equivalenceValues.perc} class="tabular-nums" />
						<span class="text-muted-foreground text-sm">%</span>
					</div>
				</div>
				{@render equivalenceTable(equivalence.percent, 'Flat needed', '% needed')}
			</Tabs.Content>
			<Tabs.Content value="critical" class="space-y-4">
				<div class="max-w-52 space-y-2">
					<Label for="eq-critical">Critical Damage</Label>
					<Input id="eq-critical" type="number" bind:value={equivalenceValues.critical} class="tabular-nums" />
				</div>
				{@render equivalenceTable(equivalence.critical, 'Equivalent to', '%')}
			</Tabs.Content>
		</Tabs.Tabs>
	</Sheet.Content>
</Sheet.Root>

<Sheet.Root bind:open={transferOpen}>
	<Sheet.Content side="right" class="data-[side=right]:w-[min(100vw,36rem)] data-[side=right]:sm:max-w-none overflow-y-auto p-5">
		<Sheet.Header class="mb-5">
			<Sheet.Title>Import / Export</Sheet.Title>
			<Sheet.Description>Portable JSON for this calculator calculator.</Sheet.Description>
		</Sheet.Header>

		<div class="space-y-3">
			<Textarea bind:value={transferText} class="min-h-72 font-mono text-xs" />
			<div class="flex flex-wrap gap-2">
				<Button onclick={exportData}>
					<DownloadIcon data-icon="inline-start" />
					Export
				</Button>
				<Button variant="outline" onclick={importData}>
					<UploadIcon data-icon="inline-start" />
					Import
				</Button>
				<Button variant="secondary" onclick={copyTransfer}>
					<ClipboardCopyIcon data-icon="inline-start" />
					Copy
				</Button>
			</div>
			{#if transferStatus}
				<p class="text-muted-foreground text-sm">{transferStatus}</p>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>

{#snippet equivalenceTable(
	values: Record<StatKey, [string, string]>,
	valueHeading: string,
	percentHeading: string
)}
	<div class="overflow-hidden rounded-lg border">
		<Table.Table>
			<Table.TableHeader>
				<Table.TableRow>
					<Table.TableHead>Stat</Table.TableHead>
					<Table.TableHead class="text-right">{valueHeading}</Table.TableHead>
					<Table.TableHead class="text-right">{percentHeading}</Table.TableHead>
				</Table.TableRow>
			</Table.TableHeader>
			<Table.TableBody>
				{#each STAT_KEYS as key}
					<Table.TableRow>
						<Table.TableCell>{STAT_LABELS[key]}</Table.TableCell>
						<Table.TableCell class="text-right font-mono text-xs">{values[key][0]}</Table.TableCell>
						<Table.TableCell class="text-right font-mono text-xs">{values[key][1]}</Table.TableCell>
					</Table.TableRow>
				{/each}
			</Table.TableBody>
		</Table.Table>
	</div>
{/snippet}
