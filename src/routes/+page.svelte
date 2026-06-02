<svelte:options runes={true} />

<script lang="ts">
	import { browser } from '$app/environment';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import BadgePercentIcon from '@lucide/svelte/icons/badge-percent';
	import BarChart3Icon from '@lucide/svelte/icons/bar-chart-3';
	import ClipboardCopyIcon from '@lucide/svelte/icons/clipboard-copy';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import EraserIcon from '@lucide/svelte/icons/eraser';
	import GaugeIcon from '@lucide/svelte/icons/gauge';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import PanelRightOpenIcon from '@lucide/svelte/icons/panel-right-open';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import ScaleIcon from '@lucide/svelte/icons/scale';
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import TargetIcon from '@lucide/svelte/icons/target';
	import TrophyIcon from '@lucide/svelte/icons/trophy';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import WandSparklesIcon from '@lucide/svelte/icons/wand-sparkles';
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
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
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
	const numberFormatter = new Intl.NumberFormat('en-US', {
		maximumFractionDigits: 2
	});

	const STAT_GROUPS = [
		{
			label: 'Core',
			keys: ['strength', 'attack', 'critical', 'minimum', 'maximum', 'static']
		},
		{
			label: 'Enemy',
			keys: ['normalAdded', 'bossAdded', 'normalAmp', 'bossAmp']
		},
		{
			label: 'Route',
			keys: ['ratio', 'back', 'melee', 'abnormal']
		}
	] satisfies Array<{ label: string; keys: StatKey[] }>;

	type SummaryComparisonPanel = {
		id: string;
		shortLabel: string;
		buffedIncrease: { avg: string };
		isBest: boolean;
		isTiedBest: boolean;
		marginLabel: string;
	};

	let calculator: CalculatorState = $state(createDefaultState());
	let hydrated = $state(false);
	let selectedPreset = $state('Hero (Greatsword)');
	let buffsOpen = $state(false);
	let equivalenceOpen = $state(false);
	let transferOpen = $state(false);
	let transferText = $state('');
	let transferStatus = $state('');
	let buffQuery = $state('');
	let equivalenceTab = $state('damage');
	let mobileStatsTab = $state('base');
	let equivalenceValues = $state({ perc: 1, critical: 10 });

	const report = $derived(calculateDashboard(calculator));
	const buffedUiStats = $derived(numericStatsToUi(report.buffedStats));
	const equivalence = $derived(calculateEquivalenceTables(calculator, equivalenceValues));
	const activeBuffCount = $derived(countActiveBuffs(calculator.selectedBuffs));
	const buffDeltaRows = $derived(
		STAT_KEYS.map((key) => ({
			key,
			label: STAT_LABELS[key],
			flat: report.buffStats[key][0],
			percent: report.buffStats[key][1]
		})).filter((row) => row.flat !== 0 || row.percent !== 0)
	);
	const comparisonPanels = $derived(rankComparisonPanels([
		{
			id: 'a',
			label: 'Changes A',
			shortLabel: 'A',
			damage: report.formatted.a,
			increase: report.formatted.increaseA,
			buffedDamage: report.formatted.buffedA,
			buffedIncrease: report.formatted.buffedIncreaseA,
			rawIncrease: report.raw.buffedIncreaseA.avg,
			rawDamage: report.raw.buffedA.avg
		},
		{
			id: 'b',
			label: 'Changes B',
			shortLabel: 'B',
			damage: report.formatted.b,
			increase: report.formatted.increaseB,
			buffedDamage: report.formatted.buffedB,
			buffedIncrease: report.formatted.buffedIncreaseB,
			rawIncrease: report.raw.buffedIncreaseB.avg,
			rawDamage: report.raw.buffedB.avg
		}
	]));
	const bestChangeIds = $derived(new Set(comparisonPanels.filter((panel) => panel.isBest).map((panel) => panel.id)));
	const changeSummary = $derived(summarizeChangeComparison(comparisonPanels));
	const damageScaleMax = $derived(
		Math.max(
			report.raw.base.avg,
			report.raw.buffed.avg,
			report.raw.buffedA.avg,
			report.raw.buffedB.avg,
			1
		)
	);
	const damageBars = $derived([
		{
			id: 'base',
			label: 'Base',
			value: report.raw.base.avg,
			formatted: report.formatted.base.avg,
			isBestChange: false
		},
		{
			id: 'buffed',
			label: 'Buffed',
			value: report.raw.buffed.avg,
			formatted: report.formatted.buffed.avg,
			isBestChange: false
		},
		{
			id: 'a',
			label: 'A Buffed',
			value: report.raw.buffedA.avg,
			formatted: report.formatted.buffedA.avg,
			isBestChange: bestChangeIds.has('a')
		},
		{
			id: 'b',
			label: 'B Buffed',
			value: report.raw.buffedB.avg,
			formatted: report.formatted.buffedB.avg,
			isBestChange: bestChangeIds.has('b')
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

	function clearPanel(panelId: 'a' | 'b') {
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

	function activeTone(value: string | undefined) {
		return `font-semibold tabular-nums ${toneClass(value)}`;
	}

	function formatPercent(value: number) {
		return `${(value * 100).toFixed(1)}%`;
	}

	function formatNumber(value: number) {
		const sign = value > 0 ? '+' : '';
		return `${sign}${numberFormatter.format(value)}`;
	}

	function formatBuffPair(flat: number, percent: number) {
		const parts = [];
		if (flat !== 0) parts.push(formatNumber(flat));
		if (percent !== 0) parts.push(`${formatNumber(percent)}%`);
		return parts.join(' / ');
	}

	function formatPointDelta(value: number) {
		if (!Number.isFinite(value)) return '---';
		const sign = value > 0 ? '+' : '';
		return `${sign}${(value * 100).toFixed(5)} pp`;
	}

	function sortableScore(value: number) {
		if (value === Infinity) return Number.MAX_SAFE_INTEGER;
		if (value === -Infinity) return Number.MIN_SAFE_INTEGER;
		return Number.isFinite(value) ? value : Number.MIN_SAFE_INTEGER;
	}

	function rankComparisonPanels<T extends { rawIncrease: number; rawDamage: number }>(panels: T[]) {
		const sorted = [...panels].sort(
			(a, b) =>
				sortableScore(b.rawIncrease) - sortableScore(a.rawIncrease) ||
				sortableScore(b.rawDamage) - sortableScore(a.rawDamage)
		);
		const leader = sorted[0];
		const runnerUp = sorted[1];
		const bestScore = sortableScore(leader?.rawIncrease ?? Number.NaN);
		const runnerUpScore = sortableScore(runnerUp?.rawIncrease ?? Number.NaN);
		const isTie = runnerUp ? Math.abs(bestScore - runnerUpScore) < 0.0000000001 : false;

		return panels.map((panel) => {
			const rank = sorted.findIndex((candidate) => candidate === panel) + 1;
			const panelScore = sortableScore(panel.rawIncrease);
			const isLeader = panel === leader;
			const isBest = isLeader && !isTie;
			const isTiedBest = isTie && Math.abs(panelScore - bestScore) < 0.0000000001;
			const comparisonTarget = isLeader ? runnerUp : leader;
			const margin =
				comparisonTarget && Number.isFinite(panel.rawIncrease) && Number.isFinite(comparisonTarget.rawIncrease)
					? Math.abs(panel.rawIncrease - comparisonTarget.rawIncrease)
					: Number.NaN;

			return {
				...panel,
				rank,
				isBest,
				isTiedBest,
				margin,
				marginLabel: formatPointDelta(margin)
			};
		});
	}

	function summarizeChangeComparison(panels: SummaryComparisonPanel[]) {
		const leaders = panels.filter((panel) => panel.isBest || panel.isTiedBest);
		const leader = leaders[0];
		if (!leader) return undefined;
		if (leaders.length > 1) {
			return {
				label: 'A/B tied',
				value: leader.buffedIncrease.avg,
				detail: 'Same average buffed gain'
			};
		}

		const other = panels.find((panel) => panel.id !== leader.id);
		return {
			label: `${leader.shortLabel} best`,
			value: leader.buffedIncrease.avg,
			detail: other ? `${leader.shortLabel} leads ${other.shortLabel} by ${leader.marginLabel}` : ''
		};
	}

	function barWidth(value: number, max: number) {
		if (!Number.isFinite(value) || max <= 0) return '0%';
		return `${Math.max(4, Math.min(100, (value / max) * 100)).toFixed(2)}%`;
	}

	function scrollToSection(id: string) {
		if (!browser) return;
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function countActiveBuffs(selectedBuffs: SelectedBuffs) {
		let count = 0;
		for (const tier of Object.values(selectedBuffs)) {
			for (const [groupName, value] of Object.entries(tier)) {
				if (groupName === 'single') {
					count += Object.values(value as Record<string, boolean>).filter(Boolean).length;
				} else if (typeof value === 'string' && value !== 'None') {
					count += 1;
				}
			}
		}
		return count;
	}

	function queryMatches(...parts: string[]) {
		const query = buffQuery.trim().toLowerCase();
		if (!query) return true;
		return parts.some((part) => part.toLowerCase().includes(query));
	}

	function buffMatches(tierName: string, buffName: string, stats: Partial<Record<StatKey, [number, number]>>) {
		return queryMatches(tierName, buffName, formatBuffStats(stats));
	}

	function groupMatches(
		tierName: string,
		groupName: string,
		group: Record<string, Partial<Record<StatKey, [number, number]>>>
	) {
		return queryMatches(tierName, groupName, ...Object.keys(group), ...Object.values(group).map(formatBuffStats));
	}
</script>

<svelte:head>
	<title>LaTale Damage Calculator</title>
	<meta
		name="description"
		content="Personal LaTale damage calculator for stat, buff, and equivalence comparisons."
	/>
</svelte:head>

<main class="min-h-dvh bg-background text-foreground">
	<header class="sticky top-0 z-30 border-b border-border/80 bg-background/92 backdrop-blur">
		<div class="mx-auto flex max-w-[1760px] flex-col gap-3 px-4 py-3 lg:px-6">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex min-w-0 items-center gap-3">
					<div class="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm">
						<ActivityIcon class="size-5" />
					</div>
					<div class="min-w-0">
						<h1 class="truncate text-lg font-semibold">LaTale Damage Calculator</h1>
						<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
							<span>{TARGETS[report.settings.target].label}</span>
							<span>Boss {formatPercent(report.settings.bossWeight)}</span>
							<span>Buffs {activeBuffCount}</span>
						</div>
					</div>
				</div>

				<Tooltip.Provider delayDuration={120}>
					<div class="flex flex-wrap items-center justify-end gap-2">
						<Badge variant="secondary">
							<TargetIcon data-icon="inline-start" />
							{report.formatted.base.avg}
						</Badge>
						<Badge>
							<SparklesIcon data-icon="inline-start" />
							{report.formatted.buffIncrease.avg}
						</Badge>
						{#if changeSummary}
							<Badge variant="outline" class="border-chart-2/60 bg-chart-2/10">
								<TrophyIcon data-icon="inline-start" />
								{changeSummary.label} {changeSummary.value}
							</Badge>
						{/if}

						<ThemeToggle />
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="outline"
										size="icon"
										aria-label="Buffs"
										onclick={() => (buffsOpen = true)}
									>
										<SparklesIcon />
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom" sideOffset={6}>Buffs</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="outline"
										size="icon"
										aria-label="Equivalence"
										onclick={() => scrollToSection('equivalence')}
									>
										<ScaleIcon />
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom" sideOffset={6}>Equivalence</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="outline"
										size="icon"
										aria-label="Import and export"
										onclick={() => (transferOpen = true)}
									>
										<DatabaseIcon />
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom" sideOffset={6}>Import / Export</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button {...props} variant="ghost" size="icon" aria-label="Reset all" onclick={resetAll}>
										<RotateCcwIcon />
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom" sideOffset={6}>Reset</Tooltip.Content>
						</Tooltip.Root>
					</div>
				</Tooltip.Provider>
			</div>
		</div>
	</header>

	<section class="mx-auto grid max-w-[1760px] gap-4 px-4 py-4 lg:px-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
		<section class="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
			<div class="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
				<div class="flex min-w-0 items-center gap-2">
					<BarChart3Icon class="size-4 text-primary" />
					<h2 class="text-sm font-semibold">Stat Workbench</h2>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<Button variant="outline" size="sm" onclick={() => clearPanel('a')}>
						<EraserIcon data-icon="inline-start" />
						Clear A
					</Button>
					<Button variant="outline" size="sm" onclick={() => clearPanel('b')}>
						<EraserIcon data-icon="inline-start" />
						Clear B
					</Button>
				</div>
			</div>

			<div class="md:hidden">
				<Tabs.Tabs bind:value={mobileStatsTab}>
					<Tabs.List class="m-3 grid w-[calc(100%-1.5rem)] grid-cols-3">
						<Tabs.Trigger value="base">Base</Tabs.Trigger>
						<Tabs.Trigger value="a">
							A
							{#if bestChangeIds.has('a')}
								<TrophyIcon class="size-3 text-chart-2" />
								<span class="sr-only">best</span>
							{/if}
						</Tabs.Trigger>
						<Tabs.Trigger value="b">
							B
							{#if bestChangeIds.has('b')}
								<TrophyIcon class="size-3 text-chart-2" />
								<span class="sr-only">best</span>
							{/if}
						</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Content value="base">
						{@render mobileStatsPanel('mobile-base', calculator.stats)}
					</Tabs.Content>
					<Tabs.Content value="a">
						{@render mobileStatsPanel('mobile-a', calculator.statsA)}
					</Tabs.Content>
					<Tabs.Content value="b">
						{@render mobileStatsPanel('mobile-b', calculator.statsB)}
					</Tabs.Content>
				</Tabs.Tabs>
			</div>

			<div class="hidden overflow-x-auto md:block">
				<div class="min-w-[780px]">
					<div
						class="grid grid-cols-[10.5rem_repeat(6,minmax(4.5rem,1fr))] border-b border-border bg-muted/60 text-xs font-medium text-muted-foreground"
					>
						<div class="px-3 py-2">Stat</div>
						<div class="px-2 py-2 text-right">Base</div>
						<div class="px-2 py-2 text-right">Base %</div>
						<div class="flex items-center justify-end gap-1 px-2 py-2">
							{#if bestChangeIds.has('a')}
								<TrophyIcon class="size-3 text-chart-2" />
								<span class="sr-only">best</span>
							{/if}
							<span>A Flat</span>
						</div>
						<div class="flex items-center justify-end gap-1 px-2 py-2">
							{#if bestChangeIds.has('a')}
								<TrophyIcon class="size-3 text-chart-2" />
								<span class="sr-only">best</span>
							{/if}
							<span>A %</span>
						</div>
						<div class="flex items-center justify-end gap-1 px-2 py-2">
							{#if bestChangeIds.has('b')}
								<TrophyIcon class="size-3 text-chart-2" />
								<span class="sr-only">best</span>
							{/if}
							<span>B Flat</span>
						</div>
						<div class="flex items-center justify-end gap-1 px-2 py-2">
							{#if bestChangeIds.has('b')}
								<TrophyIcon class="size-3 text-chart-2" />
								<span class="sr-only">best</span>
							{/if}
							<span>B %</span>
						</div>
					</div>

					{#each STAT_GROUPS as group}
						<div class="grid grid-cols-[10.5rem_repeat(6,minmax(4.5rem,1fr))]">
							<div class="col-span-7 border-b border-border/70 bg-background/70 px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
								{group.label}
							</div>
							{#each group.keys as key}
								<div class="flex min-h-10 items-center border-b border-border/70 px-3">
									<Label
										for={`base-${key}-flat`}
										class="block min-w-0 truncate text-xs font-medium text-foreground/90"
									>
										{STAT_LABELS[key]}
									</Label>
								</div>
								{@render statInput('base', calculator.stats, key, 0)}
								{#if PERCENTLESS_STATS.has(key)}
									{@render emptyPercentCell()}
								{:else}
									{@render statInput('base', calculator.stats, key, 1)}
								{/if}
								{@render statInput('a', calculator.statsA, key, 0)}
								{#if PERCENTLESS_STATS.has(key)}
									{@render emptyPercentCell()}
								{:else}
									{@render statInput('a', calculator.statsA, key, 1)}
								{/if}
								{@render statInput('b', calculator.statsB, key, 0)}
								{#if PERCENTLESS_STATS.has(key)}
									{@render emptyPercentCell()}
								{:else}
									{@render statInput('b', calculator.statsB, key, 1)}
								{/if}
							{/each}
						</div>
					{/each}
				</div>
			</div>
		</section>

		<aside class="grid gap-4">
			<section class="rounded-lg border border-border bg-card shadow-sm">
				<div class="flex items-center justify-between gap-2 border-b border-border/80 px-4 py-3">
					<div class="flex items-center gap-2">
						<GaugeIcon class="size-4 text-primary" />
						<h2 class="text-sm font-semibold">Outcome</h2>
					</div>
					<Badge variant="outline">{report.formatted.base.avg}</Badge>
				</div>
				<div class="space-y-4 p-4">
					<div class="grid grid-cols-2 gap-x-4 gap-y-3">
						{@render valueBlock('Normal', report.formatted.base.normal)}
						{@render valueBlock('Boss', report.formatted.base.boss)}
						{@render valueBlock('Buffed Normal', report.formatted.buffed.normal)}
						{@render valueBlock('Buffed Boss', report.formatted.buffed.boss)}
					</div>

					<div class="space-y-2 border-t border-border/80 pt-4">
						{#if changeSummary}
							<div class="space-y-1 pb-2">
								<div class="flex items-center justify-between gap-3 text-xs">
									<span class="flex min-w-0 items-center gap-1.5 font-semibold">
										<TrophyIcon class="size-3.5 text-chart-2" />
										<span>{changeSummary.label}</span>
									</span>
									<span class={activeTone(changeSummary.value)}>{changeSummary.value}</span>
								</div>
								<div class="truncate text-[11px] text-muted-foreground">{changeSummary.detail}</div>
							</div>
						{/if}
						<div class="flex items-center justify-between text-xs text-muted-foreground">
							<span>Buff Gain</span>
							<span class={activeTone(report.formatted.buffIncrease.avg)}>
								{report.formatted.buffIncrease.avg}
							</span>
						</div>
						{#each damageBars as bar}
							<div class="grid grid-cols-[5.25rem_minmax(0,1fr)_4.75rem] items-center gap-2 text-xs">
								<span class="flex min-w-0 items-center gap-1 text-muted-foreground">
									{#if bar.isBestChange}
										<TrophyIcon class="size-3 shrink-0 text-chart-2" />
									{/if}
									<span class="truncate">{bar.label}</span>
								</span>
								<div class="h-2 overflow-hidden rounded-sm bg-muted">
									<div
										class="h-full rounded-sm"
										class:bg-chart-3={bar.id === 'base'}
										class:bg-chart-1={bar.id === 'buffed'}
										class:bg-chart-2={bar.id === 'a'}
										class:bg-chart-4={bar.id === 'b'}
										style={`width: ${barWidth(bar.value, damageScaleMax)}`}
									></div>
								</div>
								<span class="text-right font-medium tabular-nums">{bar.formatted}</span>
							</div>
						{/each}
					</div>

					<div class="space-y-3 border-t border-border/80 pt-4">
						{#each comparisonPanels as panel}
							<div
								class={`space-y-2 border-l-2 pl-3 ${panel.isBest || panel.isTiedBest ? 'border-chart-2' : 'border-border/70'}`}
							>
								<div class="flex items-center justify-between gap-2">
									<span class="text-xs font-semibold">{panel.label}</span>
									<div class="flex items-center gap-2">
										{#if panel.isBest}
											<Badge variant="secondary" class="bg-chart-2/15 text-foreground">
												<TrophyIcon data-icon="inline-start" />
												Best
											</Badge>
										{:else if panel.isTiedBest}
											<Badge variant="outline">Tie</Badge>
										{:else}
											<Badge variant="outline">#{panel.rank}</Badge>
										{/if}
										<span class={activeTone(panel.buffedIncrease.avg)}>{panel.buffedIncrease.avg}</span>
									</div>
								</div>
								<div class="truncate text-[11px] text-muted-foreground">
									{#if panel.isBest && panel.margin > 0}
										Leads by {panel.marginLabel}
									{:else if panel.isTiedBest}
										Same average buffed gain
									{:else}
										{panel.marginLabel} behind best
									{/if}
								</div>
								<div class="grid grid-cols-3 gap-2 text-xs">
									{@render miniMetric('Normal', panel.increase.normal, panel.damage.normal)}
									{@render miniMetric('Boss', panel.increase.boss, panel.damage.boss)}
									{@render miniMetric('Buffed', panel.buffedIncrease.avg, panel.buffedDamage.avg)}
								</div>
							</div>
						{/each}
					</div>
				</div>
			</section>

			<section id="parameters" class="rounded-lg border border-border bg-card shadow-sm">
				<div class="flex items-center gap-2 border-b border-border/80 px-4 py-3">
					<SlidersHorizontalIcon class="size-4 text-primary" />
					<h2 class="text-sm font-semibold">Parameters</h2>
				</div>
				<div class="space-y-4 p-4">
					<div class="space-y-2">
						<Label for="class-preset">Class</Label>
						<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
							<NativeSelect id="class-preset" bind:value={selectedPreset} class="w-full">
								{#each Object.keys(CLASS_PRESETS) as preset}
									<NativeSelectOption value={preset}>{preset}</NativeSelectOption>
								{/each}
							</NativeSelect>
							<Button variant="outline" aria-label="Apply class preset" onclick={applySelectedPreset}>
								<WandSparklesIcon />
							</Button>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-2">
						<div class="space-y-2">
							<Label for="target">Target</Label>
							<NativeSelect id="target" bind:value={calculator.settings.target} class="w-full">
								{#each Object.entries(TARGETS) as [key, target]}
									<NativeSelectOption value={key}>{target.label}</NativeSelectOption>
								{/each}
							</NativeSelect>
						</div>
						<div class="space-y-2">
							<Label for="ff">Final %</Label>
							<Input id="ff" type="number" bind:value={calculator.settings.fF} class="text-right tabular-nums" />
						</div>
						<div class="space-y-2">
							<Label for="sf">Stats %</Label>
							<Input id="sf" type="number" bind:value={calculator.settings.sF} class="text-right tabular-nums" />
						</div>
						<div class="space-y-2">
							<Label for="af">Skill</Label>
							<Input id="af" type="number" bind:value={calculator.settings.aF} class="text-right tabular-nums" />
						</div>
					</div>

					<div class="grid grid-cols-2 gap-2">
						{#each QUICK_FACTOR_PRESETS as preset}
							<Button
								variant="secondary"
								size="sm"
								class="justify-start"
								onclick={() => (calculator.settings = applyQuickPreset(calculator.settings, preset))}
							>
								{preset.label}
							</Button>
						{/each}
					</div>

					<div class="space-y-4 border-t border-border/80 pt-4">
						{@render sliderControl('Summon', calculator.settings.summonWeight, 'summonWeight', 0, 1, 0.025)}
						{@render sliderControl('Back/Melee', calculator.settings.backWeight, 'backWeight', 0, 1, 0.025)}
						{@render sliderControl('Minimum', calculator.settings.minWeight, 'minWeight', 0, 0.5, 0.5)}
						{@render sliderControl('Boss', calculator.settings.bossWeight, 'bossWeight', 0, 1, 0.025)}
					</div>
				</div>
			</section>
		</aside>
	</section>

	<section class="mx-auto grid max-w-[1760px] gap-4 px-4 pb-6 lg:px-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
		<section id="equivalence" class="rounded-lg border border-border bg-card shadow-sm">
			<div class="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
				<div class="flex items-center gap-2">
					<ScaleIcon class="size-4 text-primary" />
					<h2 class="text-sm font-semibold">Equivalence</h2>
				</div>
				<Button variant="outline" size="sm" onclick={() => (equivalenceOpen = true)}>
					<PanelRightOpenIcon data-icon="inline-start" />
					Open
				</Button>
			</div>
			<div class="p-4">
				{@render equivalencePanel('main')}
			</div>
		</section>

		<div class="grid gap-4">
			<section class="rounded-lg border border-border bg-card shadow-sm">
				<div class="flex items-center justify-between gap-2 border-b border-border/80 px-4 py-3">
					<div class="flex items-center gap-2">
						<ListChecksIcon class="size-4 text-primary" />
						<h2 class="text-sm font-semibold">Buff Ledger</h2>
					</div>
					<Badge variant="secondary">{activeBuffCount} active</Badge>
				</div>
				<div class="max-h-[22rem] overflow-y-auto p-4">
					{#if buffDeltaRows.length}
						<div class="space-y-2">
							{#each buffDeltaRows as row}
								<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 pb-2 text-xs last:border-b-0 last:pb-0">
									<span class="truncate text-muted-foreground">{row.label}</span>
									<span class="font-medium tabular-nums">{formatBuffPair(row.flat, row.percent)}</span>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">No active buff deltas.</p>
					{/if}
				</div>
			</section>

			<section class="rounded-lg border border-border bg-card shadow-sm">
				<div class="flex items-center gap-2 border-b border-border/80 px-4 py-3">
					<BadgePercentIcon class="size-4 text-primary" />
					<h2 class="text-sm font-semibold">Buffed Stats</h2>
				</div>
				<div class="max-h-[22rem] overflow-y-auto p-4">
					<div class="space-y-2">
						{#each STAT_KEYS as key}
							<div class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border/60 pb-2 text-xs last:border-b-0 last:pb-0">
								<span class="truncate text-muted-foreground">{STAT_LABELS[key]}</span>
								<span class="font-medium tabular-nums">{buffedUiStats[key][0]}</span>
								<span class="text-muted-foreground tabular-nums">{buffedUiStats[key][1]}</span>
							</div>
						{/each}
					</div>
				</div>
			</section>

			<section class="rounded-lg border border-border bg-card shadow-sm">
				<div class="flex items-center gap-2 border-b border-border/80 px-4 py-3">
					<TargetIcon class="size-4 text-primary" />
					<h2 class="text-sm font-semibold">Target Profile</h2>
				</div>
				<div class="grid gap-3 p-4">
					{#each ENEMY_TYPES as enemy}
						<div class="space-y-2 border-b border-border/70 pb-3 last:border-b-0 last:pb-0">
							<div class="text-xs font-semibold uppercase text-muted-foreground">{enemy}</div>
							<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
								<span class="text-muted-foreground">Scaling</span>
								<span class="text-right tabular-nums">{report.defenses[enemy].multiplier}</span>
								<span class="text-muted-foreground">Flat</span>
								<span class="text-right tabular-nums">{report.defenses[enemy].flat.toLocaleString()}</span>
								<span class="text-muted-foreground">Mitigation</span>
								<span class="text-right tabular-nums">{formatPercent(report.defenses[enemy].mitigation)}</span>
								<span class="text-muted-foreground">Phasing</span>
								<span class="text-right tabular-nums">{formatPercent(report.defenses[enemy].phasing)}</span>
							</div>
						</div>
					{/each}
				</div>
			</section>
		</div>
	</section>
</main>

<Sheet.Root bind:open={buffsOpen}>
	<Sheet.Content side="right" class="data-[side=right]:w-[min(100vw,54rem)] data-[side=right]:sm:max-w-none overflow-y-auto p-0">
		<Sheet.Header class="border-b border-border/80 px-5 py-4">
			<Sheet.Title>Buffs</Sheet.Title>
		</Sheet.Header>

		<div class="space-y-5 p-5">
			<div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
				<Input bind:value={buffQuery} placeholder="Filter buffs" />
				<Button variant="outline" onclick={() => setBuffs(toggleBuffTier(calculator.selectedBuffs, 'Clear'))}>
					<EraserIcon data-icon="inline-start" />
					Deselect All
				</Button>
			</div>

			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
				{#each Object.keys(buffs) as tier}
					<Button
						variant="secondary"
						size="sm"
						class="justify-start"
						onclick={() => setBuffs(toggleBuffTier(calculator.selectedBuffs, tier))}
					>
						{tier}
					</Button>
				{/each}
			</div>

			<div class="space-y-6">
				{#each Object.entries(buffs) as [tierName, tier]}
					<section>
						<div class="mb-3 flex items-center gap-3">
							<h3 class="text-sm font-semibold">{tierName}</h3>
							<div class="h-px flex-1 bg-border"></div>
						</div>
						<div class="grid gap-3 sm:grid-cols-2">
							{#each Object.entries(tier) as [groupName, group]}
								{#if groupName === 'single'}
									{#each Object.entries(group) as [buffName, buffStats]}
										{#if buffMatches(tierName, buffName, buffStats as Partial<Record<StatKey, [number, number]>>)}
											<label class="flex items-start gap-3 border-b border-border/60 py-2 transition hover:bg-muted/50">
												<Checkbox
													checked={Boolean((calculator.selectedBuffs[tierName]?.single as Record<string, boolean> | undefined)?.[buffName])}
													onCheckedChange={(checked) =>
														setBuffs(setSingleBuff(calculator.selectedBuffs, tierName, buffName, Boolean(checked)))}
												/>
												<span class="min-w-0">
													<span class="block text-sm leading-tight">{buffName}</span>
													<span class="block truncate text-xs text-muted-foreground">{formatBuffStats(buffStats as Partial<Record<StatKey, [number, number]>>)}</span>
												</span>
											</label>
										{/if}
									{/each}
								{:else if groupMatches(tierName, groupName, group as Record<string, Partial<Record<StatKey, [number, number]>>> )}
									<div class="space-y-2 border-b border-border/60 py-2">
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
		</div>
	</Sheet.Content>
</Sheet.Root>

<Sheet.Root bind:open={equivalenceOpen}>
	<Sheet.Content side="right" class="data-[side=right]:w-[min(100vw,44rem)] data-[side=right]:sm:max-w-none overflow-y-auto p-0">
		<Sheet.Header class="border-b border-border/80 px-5 py-4">
			<Sheet.Title>Equivalence</Sheet.Title>
		</Sheet.Header>
		<div class="p-5">
			{@render equivalencePanel('sheet')}
		</div>
	</Sheet.Content>
</Sheet.Root>

<Sheet.Root bind:open={transferOpen}>
	<Sheet.Content side="right" class="data-[side=right]:w-[min(100vw,36rem)] data-[side=right]:sm:max-w-none overflow-y-auto p-0">
		<Sheet.Header class="border-b border-border/80 px-5 py-4">
			<Sheet.Title>Import / Export</Sheet.Title>
		</Sheet.Header>

		<div class="space-y-3 p-5">
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
				<p class="text-sm text-muted-foreground">{transferStatus}</p>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>

{#snippet statInput(panelId: string, stats: UiStats, key: StatKey, index: 0 | 1)}
	<div class="border-b border-l border-border/70 p-1">
		<Input
			id={`${panelId}-${key}-${index === 0 ? 'flat' : 'percent'}`}
			type="number"
			inputmode="decimal"
			step="any"
			value={stats[key][index]}
			aria-label={`${panelId} ${STAT_LABELS[key]} ${index === 0 ? 'flat' : 'percent'}`}
			class="h-8 border-transparent bg-transparent px-2 text-right text-xs tabular-nums hover:bg-input/70 focus-visible:bg-background"
			oninput={(event) => setStat(stats, key, index, inputValue(event))}
		/>
	</div>
{/snippet}

{#snippet mobileStatsPanel(panelId: string, stats: UiStats)}
	<div class="border-t border-border/70">
		<div class="grid grid-cols-[minmax(0,1fr)_6rem_4.75rem] bg-muted/60 text-xs font-medium text-muted-foreground">
			<div class="px-3 py-2">Stat</div>
			<div class="px-2 py-2 text-right">Value</div>
			<div class="px-2 py-2 text-right">%</div>
		</div>
		{#each STAT_GROUPS as group}
			<div class="grid grid-cols-[minmax(0,1fr)_6rem_4.75rem]">
				<div class="col-span-3 border-y border-border/70 bg-background/70 px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
					{group.label}
				</div>
				{#each group.keys as key}
					<div class="flex min-h-10 items-center border-b border-border/70 px-3">
						<Label
							for={`${panelId}-${key}-flat`}
							class="block min-w-0 truncate text-xs font-medium text-foreground/90"
						>
							{STAT_LABELS[key]}
						</Label>
					</div>
					{@render statInput(panelId, stats, key, 0)}
					{#if PERCENTLESS_STATS.has(key)}
						{@render emptyPercentCell()}
					{:else}
						{@render statInput(panelId, stats, key, 1)}
					{/if}
				{/each}
			</div>
		{/each}
	</div>
{/snippet}

{#snippet emptyPercentCell()}
	<div class="grid min-h-10 place-items-center border-b border-l border-border/70 bg-muted/30 text-xs text-muted-foreground">
		-
	</div>
{/snippet}

{#snippet valueBlock(label: string, value: string)}
	<div class="min-w-0">
		<div class="text-xs text-muted-foreground">{label}</div>
		<div class="mt-1 truncate text-base font-semibold tabular-nums">{value}</div>
	</div>
{/snippet}

{#snippet miniMetric(label: string, increase: string, damage: string)}
	<div class="min-w-0">
		<div class="truncate text-[11px] text-muted-foreground">{label}</div>
		<div class={`${activeTone(increase)} truncate text-xs`}>{increase}</div>
		<div class="truncate text-[11px] text-muted-foreground tabular-nums">{damage}</div>
	</div>
{/snippet}

{#snippet sliderControl(
	label: string,
	value: number,
	key: 'summonWeight' | 'backWeight' | 'minWeight' | 'bossWeight',
	min: number,
	max: number,
	step: number
)}
	<div class="space-y-2">
		<div class="flex items-center justify-between gap-2 text-sm">
			<Label>{label}</Label>
			<span class="text-xs text-muted-foreground tabular-nums">{formatPercent(value)}</span>
		</div>
		<Slider
			type="single"
			{min}
			{max}
			{step}
			value={value}
			onValueChange={(next) => updateSlider(key, Number(next))}
		/>
	</div>
{/snippet}

{#snippet equivalencePanel(prefix: string)}
	<Tabs.Tabs bind:value={equivalenceTab}>
		<div class="flex flex-wrap items-center justify-between gap-3">
			<Tabs.List>
				<Tabs.Trigger value="damage">Damage %</Tabs.Trigger>
				<Tabs.Trigger value="critical">Critical</Tabs.Trigger>
			</Tabs.List>
			{#if equivalenceTab === 'critical'}
				<Badge variant="secondary">
					{equivalence.criticalIncrease.toFixed(5)}%
				</Badge>
			{/if}
		</div>
		<Tabs.Content value="damage" class="mt-4 space-y-4">
			<div class="max-w-56 space-y-2">
				<Label for={`${prefix}-eq-percent`}>Damage Increase</Label>
				<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
					<Input id={`${prefix}-eq-percent`} type="number" bind:value={equivalenceValues.perc} class="text-right tabular-nums" />
					<span class="text-sm text-muted-foreground">%</span>
				</div>
			</div>
			{@render equivalenceTable(equivalence.percent, 'Flat needed', '% needed')}
		</Tabs.Content>
		<Tabs.Content value="critical" class="mt-4 space-y-4">
			<div class="max-w-56 space-y-2">
				<Label for={`${prefix}-eq-critical`}>Critical Damage</Label>
				<Input id={`${prefix}-eq-critical`} type="number" bind:value={equivalenceValues.critical} class="text-right tabular-nums" />
			</div>
			{@render equivalenceTable(equivalence.critical, 'Equivalent to', '%')}
		</Tabs.Content>
	</Tabs.Tabs>
{/snippet}

{#snippet equivalenceTable(
	values: Record<StatKey, [string, string]>,
	valueHeading: string,
	percentHeading: string
)}
	<div class="overflow-hidden rounded-lg border border-border">
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
