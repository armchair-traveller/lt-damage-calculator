<svelte:options runes={true} />

<script lang="ts">
	import { browser } from '$app/environment';
	import favicon from '$lib/assets/favicon.ico';
	import { tick } from 'svelte';
	import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';
	import BadgePercentIcon from '@lucide/svelte/icons/badge-percent';
	import BarChart3Icon from '@lucide/svelte/icons/bar-chart-3';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import ClipboardCopyIcon from '@lucide/svelte/icons/clipboard-copy';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import EraserIcon from '@lucide/svelte/icons/eraser';
	import GaugeIcon from '@lucide/svelte/icons/gauge';
	import ImageUpIcon from '@lucide/svelte/icons/image-up';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import LockIcon from '@lucide/svelte/icons/lock';
	import PanelRightOpenIcon from '@lucide/svelte/icons/panel-right-open';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import ScaleIcon from '@lucide/svelte/icons/scale';
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import TargetIcon from '@lucide/svelte/icons/target';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import XIcon from '@lucide/svelte/icons/x';
	import { isDisplayedTie } from '$lib/calculator/comparison.js';
	import {
		buildComparisonDeltas,
		buildComparisonMatrixRows,
		COMPARISON_METRICS,
		formatDisplayIncrease,
		formatMetricIncreases,
		rankComparisonPanels,
		summarizeChangeComparison,
		type ChangeSummary,
		type ComparisonPanelInput,
		type ComparisonSide
	} from '$lib/calculator/comparison-view.js';
	import {
		buildWorkbenchCellImpacts,
		buildWorkbenchImpactRows,
		cellImpactId,
		cleanNumericText,
		comparisonDeltaScale,
		INPUT_EPSILON,
		panelHasEnteredValues,
		panelHasMeaningfulChanges,
		type WorkbenchCellImpact,
		type WorkbenchImpactRow,
		type WorkbenchPanelId
	} from '$lib/calculator/workbench-impact.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import {
		NativeSelect,
		NativeSelectOption
	} from '$lib/components/ui/native-select/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import ScreenshotImportSheet from '$lib/components/screenshot-import-sheet.svelte';
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
		matchClassPreset,
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
	const statInputFormatter = new Intl.NumberFormat('en-US', {
		maximumFractionDigits: 5
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

	type WorkbenchInputState = {
		cleaned: string;
		displayValue: string;
		draftValue: string;
		filled: boolean;
		focused: boolean;
		hasContent: boolean;
		invalid: boolean;
		numericValue: number;
		showDisplayOverlay: boolean;
		showPercentSuffix: boolean;
	};

	let calculator: CalculatorState = $state(createDefaultState());
	let hydrated = $state(false);
	let classPresetOpen = $state(false);
	let classPresetTrigger: HTMLButtonElement | null = $state(null);
	let buffsOpen = $state(false);
	let equivalenceOpen = $state(false);
	let auditOpen = $state(false);
	let transferOpen = $state(false);
	let screenshotImportOpen = $state(false);
	let transferText = $state('');
	let transferStatus = $state('');
	let screenshotImportApplyNotice = $state('');
	let screenshotImportApplyNoticeTimeout: number | null = null;
	let buffQuery = $state('');
	let equivalenceTab = $state('damage');
	let mobileStatsTab = $state('base');
	let focusedStatInput = $state('');
	let draftStatInputs: Record<string, string> = $state({});
	let equivalenceValues = $state({ perc: 1, critical: 10 });
	let showStickyVerdict = $state(false);
	const visiblePrimaryVerdicts = new Set<Element>();

	const report = $derived(calculateDashboard(calculator));
	const activeClassPreset = $derived(matchClassPreset(calculator.settings));
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
			buffedDamage: report.formatted.buffedA,
			buffedIncrease: formatMetricIncreases(report.raw.buffedIncreaseA),
			rawBuffedIncrease: report.raw.buffedIncreaseA,
			rawIncrease: report.raw.buffedIncreaseA.avg,
			rawDamage: report.raw.buffedA.avg
		},
		{
			id: 'b',
			label: 'Changes B',
			shortLabel: 'B',
			buffedDamage: report.formatted.buffedB,
			buffedIncrease: formatMetricIncreases(report.raw.buffedIncreaseB),
			rawBuffedIncrease: report.raw.buffedIncreaseB,
			rawIncrease: report.raw.buffedIncreaseB.avg,
			rawDamage: report.raw.buffedB.avg
		}
	] satisfies ComparisonPanelInput[]));
	const hasMeaningfulComparison = $derived(
		panelHasMeaningfulChanges(calculator.statsA) || panelHasMeaningfulChanges(calculator.statsB)
	);
	const changeSummary = $derived(
		hasMeaningfulComparison ? summarizeChangeComparison(comparisonPanels) : undefined
	);
	const comparisonMatrixRows = $derived(
		hasMeaningfulComparison ? buildComparisonMatrixRows(comparisonPanels) : []
	);
	const comparisonDeltas = $derived(
		hasMeaningfulComparison ? buildComparisonDeltas(comparisonPanels) : []
	);
	const comparisonDeltaScaleMax = $derived(comparisonDeltaScale(comparisonDeltas));
	const workbenchImpactRows = $derived(buildWorkbenchImpactRows(calculator));
	const workbenchImpactByKey = $derived(
		Object.fromEntries(workbenchImpactRows.map((row) => [row.key, row])) as Record<StatKey, WorkbenchImpactRow>
	);
	const workbenchImpactScaleMax = $derived(comparisonDeltaScale(workbenchImpactRows));
	const workbenchCellImpacts = $derived(buildWorkbenchCellImpacts(calculator));
	const workbenchCellImpactById = $derived(
		Object.fromEntries(workbenchCellImpacts.map((impact) => [impact.id, impact])) as Record<
			string,
			WorkbenchCellImpact | undefined
		>
	);
	const workbenchCellImpactScaleMax = $derived(comparisonDeltaScale(workbenchCellImpacts));
	const hasAChanges = $derived(panelHasEnteredValues(calculator.statsA));
	const hasBChanges = $derived(panelHasEnteredValues(calculator.statsB));

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

	$effect(() => {
		if (!browser) return;
		return () => {
			if (screenshotImportApplyNoticeTimeout !== null) {
				window.clearTimeout(screenshotImportApplyNoticeTimeout);
			}
		};
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

	function setStat(stats: UiStats, key: StatKey, index: 0 | 1, inputId: string, draftValue: string) {
		const cleaned = cleanNumericText(draftValue);
		const invalid = cleaned !== '' && !Number.isFinite(Number(cleaned));
		stats[key][index] = invalid ? draftValue : cleaned;
		setDraftStatInput(inputId, draftValue);
	}

	function cloneUiStats(stats: UiStats): UiStats {
		return Object.fromEntries(STAT_KEYS.map((key) => [key, [stats[key][0], stats[key][1]]])) as UiStats;
	}

	function copyPanelToPanel(sourcePanelId: ComparisonSide, targetPanelId: ComparisonSide) {
		const source = sourcePanelId === 'a' ? calculator.statsA : calculator.statsB;
		if (targetPanelId === 'a') calculator.statsA = cloneUiStats(source);
		if (targetPanelId === 'b') calculator.statsB = cloneUiStats(source);
		clearDraftsForPanel(targetPanelId);
	}

	function swapPanels() {
		const nextA = cloneUiStats(calculator.statsB);
		const nextB = cloneUiStats(calculator.statsA);
		calculator.statsA = nextA;
		calculator.statsB = nextB;
		clearDraftsForPanel('a');
		clearDraftsForPanel('b');
	}

	function clearPanel(panelId: 'a' | 'b') {
		const stats = panelId === 'a' ? calculator.statsA : calculator.statsB;
		const blankStats = clearUiStats();
		for (const key of STAT_KEYS) {
			stats[key][0] = blankStats[key][0];
			stats[key][1] = blankStats[key][1];
		}
		clearDraftsForPanel(panelId);
	}

	function resetAll() {
		calculator = createDefaultState();
		transferStatus = 'Reset.';
		clearScreenshotImportApplyNotice();
		clearAllStatDrafts();
	}

	async function selectClassPreset(presetName: string) {
		calculator.settings = applyClassPreset(calculator.settings, presetName);
		classPresetOpen = false;
		await tick();
		classPresetTrigger?.focus();
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
			clearAllStatDrafts();
		} catch {
			transferStatus = 'Import failed.';
		}
	}

	async function copyTransfer() {
		if (!browser || !transferText) return;
		await navigator.clipboard.writeText(transferText);
		transferStatus = 'Copied.';
	}

	function applyScreenshotImportResult(nextStats: UiStats, notice: string) {
		calculator.stats = nextStats;
		clearDraftsForPanel('base');
		showScreenshotImportApplyNotice(notice);
	}

	function showScreenshotImportApplyNotice(message: string) {
		screenshotImportApplyNotice = message;
		if (!browser) return;
		if (screenshotImportApplyNoticeTimeout !== null) {
			window.clearTimeout(screenshotImportApplyNoticeTimeout);
		}
		screenshotImportApplyNoticeTimeout = window.setTimeout(() => {
			screenshotImportApplyNotice = '';
			screenshotImportApplyNoticeTimeout = null;
		}, 7000);
	}

	function clearScreenshotImportApplyNotice() {
		screenshotImportApplyNotice = '';
		if (!browser || screenshotImportApplyNoticeTimeout === null) return;
		window.clearTimeout(screenshotImportApplyNoticeTimeout);
		screenshotImportApplyNoticeTimeout = null;
	}

	function setBuffs(next: SelectedBuffs) {
		calculator.selectedBuffs = next;
	}

	function toneClass(value: string | undefined) {
		const tone = signedTone(value ?? '');
		const numericValue = tone === 'neutral' ? Number.NaN : Number((value ?? '').replace(/[^0-9.-]/g, ''));
		if (Number.isFinite(numericValue) && numericValue === 0) return 'text-muted-foreground';
		return tone === 'positive'
			? 'text-emerald-700 dark:text-emerald-300'
			: tone === 'negative'
				? 'text-rose-700 dark:text-rose-300'
				: 'text-muted-foreground';
	}

	function inputValue(event: Event) {
		return (event.currentTarget as HTMLInputElement).value;
	}

	function statInputId(panelId: string, key: StatKey, index: 0 | 1) {
		return `${panelId}-${key}-${index === 0 ? 'flat' : 'percent'}`;
	}

	function panelLabel(panelId: WorkbenchPanelId) {
		return panelId === 'base' ? 'Base' : `Change ${panelId.toUpperCase()}`;
	}

	function inputDraftValue(inputId: string, storedValue: string | undefined) {
		return Object.hasOwn(draftStatInputs, inputId) ? draftStatInputs[inputId] : (storedValue ?? '');
	}

	function setDraftStatInput(inputId: string, value: string) {
		draftStatInputs = { ...draftStatInputs, [inputId]: value };
	}

	function clearDraftsByPrefixes(prefixes: string[]) {
		const next = Object.fromEntries(
			Object.entries(draftStatInputs).filter(([key]) => !prefixes.some((prefix) => key.startsWith(prefix)))
		);
		draftStatInputs = next;
	}

	function clearDraftsForPanel(panelId: WorkbenchPanelId) {
		clearDraftsByPrefixes([`${panelId}-`, `mobile-${panelId}-`]);
	}

	function clearDraftsForStat(panelId: WorkbenchPanelId, key: StatKey, index: 0 | 1) {
		const suffix = `${key}-${index === 0 ? 'flat' : 'percent'}`;
		const blocked = new Set([`${panelId}-${suffix}`, `mobile-${panelId}-${suffix}`]);
		draftStatInputs = Object.fromEntries(
			Object.entries(draftStatInputs).filter(([draftKey]) => !blocked.has(draftKey))
		);
	}

	function clearAllStatDrafts() {
		draftStatInputs = {};
	}

	function displayOverlayValue(value: string | undefined, panelId: WorkbenchPanelId) {
		const cleaned = cleanNumericText(value ?? '');
		if (!cleaned) return cleaned;
		const parsed = Number(cleaned);
		if (!Number.isFinite(parsed)) return cleaned;
		const formatted = statInputFormatter.format(parsed);
		return panelId !== 'base' && parsed > 0 ? `+${formatted}` : formatted;
	}

	function inputState(
		panelId: WorkbenchPanelId,
		value: string | undefined,
		inputId: string,
		index: 0 | 1
	): WorkbenchInputState {
		const draftValue = inputDraftValue(inputId, value);
		const cleaned = cleanNumericText(value ?? '');
		const numericValue = Number(cleaned);
		const focused = focusedStatInput === inputId;
		const invalid = cleaned !== '' && !Number.isFinite(numericValue);

		return {
			cleaned,
			displayValue: displayOverlayValue(value, panelId),
			draftValue,
			filled: Number.isFinite(numericValue) && Math.abs(numericValue) > INPUT_EPSILON,
			focused,
			hasContent: draftValue !== '' || cleaned !== '',
			invalid,
			numericValue: Number.isFinite(numericValue) ? numericValue : 0,
			showDisplayOverlay: !focused && cleaned !== '' && !invalid,
			showPercentSuffix: index === 1 && !focused
		};
	}

	function focusStatInput(inputId: string, event: FocusEvent) {
		focusedStatInput = inputId;
		(event.currentTarget as HTMLInputElement).select();
	}

	function blurStatInput() {
		focusedStatInput = '';
	}

	function clearStatValue(stats: UiStats, panelId: WorkbenchPanelId, key: StatKey, index: 0 | 1) {
		stats[key][index] = '';
		clearDraftsForStat(panelId, key, index);
	}

	function handleStatPaste(
		event: ClipboardEvent,
		stats: UiStats,
		key: StatKey,
		index: 0 | 1,
		inputId: string
	) {
		const text = event.clipboardData?.getData('text');
		if (text === undefined) return;
		const cleaned = cleanNumericText(text);
		event.preventDefault();

		const input = event.currentTarget as HTMLInputElement;
		if (document.execCommand?.('insertText', false, cleaned)) return;

		const start = input.selectionStart ?? input.value.length;
		const end = input.selectionEnd ?? input.value.length;
		const nextValue = `${input.value.slice(0, start)}${cleaned}${input.value.slice(end)}`;
		input.value = nextValue;
		const nextCursor = start + cleaned.length;
		input.setSelectionRange(nextCursor, nextCursor);
		setStat(stats, key, index, inputId, nextValue);
	}

	function moveStatFocus(panelId: string, key: StatKey, index: 0 | 1, direction: 1 | -1) {
		if (!browser) return;
		const currentIndex = STAT_KEYS.indexOf(key);
		for (let offset = currentIndex + direction; offset >= 0 && offset < STAT_KEYS.length; offset += direction) {
			const nextKey = STAT_KEYS[offset];
			if (index === 1 && PERCENTLESS_STATS.has(nextKey)) continue;
			const nextInput = document.getElementById(statInputId(panelId, nextKey, index)) as HTMLInputElement | null;
			if (nextInput) {
				nextInput.focus();
				nextInput.select();
				return;
			}
		}
	}

	function handleStatKeydown(
		event: KeyboardEvent,
		panelId: string,
		key: StatKey,
		index: 0 | 1
	) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		moveStatFocus(panelId, key, index, event.shiftKey ? -1 : 1);
	}

	function panelCellClass(panelId: WorkbenchPanelId, state: WorkbenchInputState) {
		const rowHighlight = 'group-hover/row:bg-muted/25 group-focus-within/row:bg-muted/30';
		if (state.invalid) {
			return `border-destructive/50 border-l-destructive/70 bg-destructive/10 ${rowHighlight}`;
		}
		if (state.focused) {
			return `border-ring/50 bg-background shadow-[inset_0_0_0_1px_var(--ring)] ${rowHighlight}`;
		}
		if (panelId === 'a') {
			return state.filled
				? `border-l-chart-2 bg-chart-2/10 ${rowHighlight}`
				: `border-l-chart-2/50 bg-background/35 ${rowHighlight}`;
		}
		if (panelId === 'b') {
			return state.filled
				? `border-l-chart-4 bg-chart-4/10 ${rowHighlight}`
				: `border-l-chart-4/50 bg-background/35 ${rowHighlight}`;
		}
		return state.filled ? `bg-background/75 ${rowHighlight}` : `bg-background/35 ${rowHighlight}`;
	}

	function lockedCellClass(panelId: WorkbenchPanelId) {
		const rail =
			panelId === 'a'
				? 'border-l-chart-2/25'
				: panelId === 'b'
					? 'border-l-chart-4/25'
					: 'border-l-border/70';
		return `${rail} bg-muted/10 group-hover/row:bg-muted/20 group-focus-within/row:bg-muted/25`;
	}

	function inputToneClass(panelId: WorkbenchPanelId, state: WorkbenchInputState) {
		if (state.invalid) return 'text-destructive';
		if (!state.filled) return 'text-muted-foreground/75';
		if (panelId === 'a') return 'text-chart-2';
		if (panelId === 'b') return 'text-chart-4';
		return 'text-foreground';
	}

	function cellImpactRailClass(panelId: WorkbenchPanelId, value: number) {
		if (!Number.isFinite(value) || isDisplayedTie(value)) return 'bg-muted-foreground/45';
		if (value < 0) return 'bg-destructive';
		return panelId === 'b' ? 'bg-chart-4' : 'bg-chart-2';
	}

	function cellImpactRailStyle(value: number) {
		if (!Number.isFinite(value) || isDisplayedTie(value)) return 'width: 0%;';
		const width = Math.max(6, Math.min(100, (Math.abs(value) / workbenchCellImpactScaleMax) * 100)).toFixed(2);
		return `width: ${width}%;`;
	}

	function cellImpactFor(panelId: WorkbenchPanelId, key: StatKey, index: 0 | 1) {
		if (panelId === 'base') return undefined;
		return workbenchCellImpactById[cellImpactId(panelId, key, index)];
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

	function metricCellClass(side: ComparisonSide, isWinner: boolean) {
		if (!isWinner) return 'border-border/70 bg-background/55';
		return side === 'a'
			? 'border-chart-2/60 bg-chart-2/10'
			: 'border-chart-4/60 bg-chart-4/10';
	}

	function verdictBandClass(outcome: ChangeSummary['outcome']) {
		if (outcome === 'a') return 'border-chart-2/50 bg-chart-2/10';
		if (outcome === 'b') return 'border-chart-4/50 bg-chart-4/10';
		return 'border-border/80 bg-muted/35';
	}

	function verdictBadgeClass(outcome: ChangeSummary['outcome']) {
		if (outcome === 'a') return 'border-chart-2/60 bg-chart-2/10';
		if (outcome === 'b') return 'border-chart-4/60 bg-chart-4/10';
		return 'border-border/80 bg-muted/60';
	}

	function verdictLabelClass(outcome: ChangeSummary['outcome']) {
		if (outcome === 'a') return 'text-chart-2';
		if (outcome === 'b') return 'text-chart-4';
		return 'text-foreground';
	}

	function deltaToneClass(value: number) {
		if (!Number.isFinite(value) || isDisplayedTie(value)) return 'text-muted-foreground';
		return value > 0 ? 'text-chart-2' : 'text-chart-4';
	}

	function deltaBarClass(value: number) {
		if (!Number.isFinite(value) || isDisplayedTie(value)) return 'bg-muted-foreground/50';
		return value > 0 ? 'bg-chart-2' : 'bg-chart-4';
	}

	function deltaBarStyle(value: number, max: number) {
		if (!Number.isFinite(value) || isDisplayedTie(value) || max <= 0) return 'left: 50%; width: 0%;';
		const width = Math.min(50, (Math.abs(value) / max) * 50).toFixed(2);
		return value > 0 ? `left: 50%; width: ${width}%;` : `right: 50%; width: ${width}%;`;
	}

	function syncStickyVerdict() {
		showStickyVerdict = Boolean(changeSummary) && visiblePrimaryVerdicts.size === 0;
	}

	function observePrimaryVerdict(node: HTMLElement) {
		if (!browser) return {};
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) visiblePrimaryVerdicts.add(node);
				else visiblePrimaryVerdicts.delete(node);
				syncStickyVerdict();
			},
			{ threshold: 0.01 }
		);

		observer.observe(node);
		return {
			destroy() {
				visiblePrimaryVerdicts.delete(node);
				observer.disconnect();
				syncStickyVerdict();
			}
		};
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
					<img src={favicon} alt="" class="size-10 shrink-0 rounded-md object-contain shadow-sm" />
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
							{formatDisplayIncrease(report.raw.buffIncrease.avg)}
						</Badge>
						{#if showStickyVerdict && changeSummary}
							<Badge variant="outline" class={verdictBadgeClass(changeSummary.outcome)}>
								{changeSummary.stickyLabel}
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

	<section class="mx-auto grid max-w-[1760px] min-w-0 gap-4 px-4 py-4 lg:px-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
		<section class="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
			<div class="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
				<div class="flex min-w-0 flex-wrap items-center gap-2">
					<BarChart3Icon class="size-4 text-primary" />
					<h2 class="text-sm font-semibold">Stat Workbench</h2>
					{#if screenshotImportApplyNotice}
						<Badge variant="secondary" class="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">
							<CheckIcon data-icon="inline-start" />
							{screenshotImportApplyNotice}
						</Badge>
					{/if}
				</div>
				<Tooltip.Provider delayDuration={120}>
					<div class="flex flex-wrap items-center gap-2">
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="outline"
										size="icon-sm"
										aria-label="Import screenshot"
										onclick={() => (screenshotImportOpen = true)}
									>
										<ImageUpIcon />
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom" sideOffset={6}>Import screenshot</Tooltip.Content>
						</Tooltip.Root>
						<div class="h-6 w-px bg-border/80"></div>
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="outline"
										size="icon-sm"
										aria-label="Copy A to B"
										class="relative"
										disabled={!hasAChanges}
										onclick={() => copyPanelToPanel('a', 'b')}
									>
										<CopyIcon />
										<span class="absolute -right-1 -top-1 grid size-4 place-items-center rounded-sm border border-chart-4/50 bg-card text-[9px] font-semibold text-chart-4">
											B
										</span>
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom" sideOffset={6}>Copy A to B</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="outline"
										size="icon-sm"
										aria-label="Swap A and B"
										disabled={!hasAChanges && !hasBChanges}
										onclick={swapPanels}
									>
										<ArrowLeftRightIcon />
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom" sideOffset={6}>Swap A / B</Tooltip.Content>
						</Tooltip.Root>
						<div class="h-6 w-px bg-border/80"></div>
						<Button
							variant="outline"
							size="sm"
							aria-label="Clear A"
							class="relative max-sm:w-8 max-sm:px-0"
							disabled={!hasAChanges}
							onclick={() => clearPanel('a')}
						>
							<EraserIcon data-icon="inline-start" />
							<span class="max-sm:sr-only">Clear A</span>
							<span class="absolute -right-1 -top-1 hidden size-4 place-items-center rounded-sm border border-chart-2/50 bg-card text-[9px] font-semibold text-chart-2 max-sm:grid">
								A
							</span>
						</Button>
						<Button
							variant="outline"
							size="sm"
							aria-label="Clear B"
							class="relative max-sm:w-8 max-sm:px-0"
							disabled={!hasBChanges}
							onclick={() => clearPanel('b')}
						>
							<EraserIcon data-icon="inline-start" />
							<span class="max-sm:sr-only">Clear B</span>
							<span class="absolute -right-1 -top-1 hidden size-4 place-items-center rounded-sm border border-chart-4/50 bg-card text-[9px] font-semibold text-chart-4 max-sm:grid">
								B
							</span>
						</Button>
					</div>
				</Tooltip.Provider>
			</div>

			{#if changeSummary}
				<div
					use:observePrimaryVerdict
					class={`grid grid-cols-2 gap-x-4 gap-y-2 border-b px-4 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem] sm:items-center xl:hidden ${verdictBandClass(changeSummary.outcome)}`}
				>
					<div class="col-span-2 min-w-0 sm:col-span-1">
						<div class="text-xs font-semibold">{changeSummary.label}</div>
						<div class={`mt-0.5 truncate text-[11px] tabular-nums ${verdictLabelClass(changeSummary.outcome)}`}>
							{changeSummary.detail}
						</div>
					</div>
					<div class="min-w-0 border-l border-chart-2/50 pl-3">
						<div class="text-[10px] font-semibold text-chart-2">A weighted gain</div>
						<div class={`${activeTone(formatDisplayIncrease(report.raw.buffedIncreaseA.avg))} mt-0.5 truncate text-xs`}>
							{formatDisplayIncrease(report.raw.buffedIncreaseA.avg)}
						</div>
					</div>
					<div class="min-w-0 border-l border-chart-4/50 pl-3">
						<div class="text-[10px] font-semibold text-chart-4">B weighted gain</div>
						<div class={`${activeTone(formatDisplayIncrease(report.raw.buffedIncreaseB.avg))} mt-0.5 truncate text-xs`}>
							{formatDisplayIncrease(report.raw.buffedIncreaseB.avg)}
						</div>
					</div>
				</div>
			{/if}

			<div class="md:hidden">
				<Tabs.Tabs bind:value={mobileStatsTab}>
					<Tabs.List class="m-3 grid w-[calc(100%-1.5rem)] grid-cols-3">
						<Tabs.Trigger value="base">Base</Tabs.Trigger>
						<Tabs.Trigger value="a">A</Tabs.Trigger>
						<Tabs.Trigger value="b">B</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Content value="base">
						{@render mobileStatsPanel('mobile-base', 'base', calculator.stats)}
					</Tabs.Content>
					<Tabs.Content value="a">
						{@render mobileStatsPanel('mobile-a', 'a', calculator.statsA)}
					</Tabs.Content>
					<Tabs.Content value="b">
						{@render mobileStatsPanel('mobile-b', 'b', calculator.statsB)}
					</Tabs.Content>
				</Tabs.Tabs>
			</div>

			<div class="hidden overflow-x-auto md:block">
				<div class="min-w-[940px]">
					<div
						class="grid grid-cols-[11rem_repeat(4,minmax(5.25rem,1fr))_minmax(8.75rem,0.85fr)_repeat(2,minmax(5.25rem,1fr))] border-b border-border bg-muted/60 text-xs font-medium text-muted-foreground"
					>
						<div class="sticky left-0 z-20 row-span-2 flex items-center border-r border-border/70 bg-muted px-3 py-2">
							Stat
						</div>
						<div class="col-span-2 border-r border-border/70 px-2 py-1.5 text-center">Base</div>
						<div class="col-span-2 border-r border-chart-2/40 bg-chart-2/10 px-2 py-1.5 text-center text-chart-2">
							Change A
						</div>
						<div class="row-span-2 flex items-center justify-center border-r border-border/70 px-2 py-2 text-center">
							Impact
						</div>
						<div class="col-span-2 bg-chart-4/10 px-2 py-1.5 text-center text-chart-4">Change B</div>
						<div class="border-r border-border/70 px-2 py-1.5 text-right">Flat</div>
						<div class="border-r border-border/70 px-2 py-1.5 text-right">%</div>
						<div class="border-r border-chart-2/40 px-2 py-1.5 text-right">Flat</div>
						<div class="border-r border-chart-2/40 px-2 py-1.5 text-right">%</div>
						<div class="border-r border-chart-4/40 px-2 py-1.5 text-right">Flat</div>
						<div class="px-2 py-1.5 text-right">%</div>
					</div>

					{#each STAT_GROUPS as group}
						<div class="grid grid-cols-[11rem_repeat(4,minmax(5.25rem,1fr))_minmax(8.75rem,0.85fr)_repeat(2,minmax(5.25rem,1fr))]">
							<div class="col-span-8 border-b border-border/80 bg-muted/35 px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
								{group.label}
							</div>
							{#each group.keys as key}
								<div class="contents group/row">
									<div class="sticky left-0 z-10 flex min-h-10 items-center border-b border-r border-border/70 bg-card/95 px-3 transition-colors group-hover/row:bg-muted/25 group-focus-within/row:bg-muted/30">
										<Label
											for={statInputId('base', key, 0)}
											class="block min-w-0 truncate text-xs font-medium text-foreground/90"
										>
											{STAT_LABELS[key]}
										</Label>
									</div>
									{@render statInput('base', 'base', calculator.stats, key, 0)}
									{#if PERCENTLESS_STATS.has(key)}
										{@render lockedPercentCell('base')}
									{:else}
										{@render statInput('base', 'base', calculator.stats, key, 1)}
									{/if}
									{@render statInput('a', 'a', calculator.statsA, key, 0)}
									{#if PERCENTLESS_STATS.has(key)}
										{@render lockedPercentCell('a')}
									{:else}
										{@render statInput('a', 'a', calculator.statsA, key, 1)}
									{/if}
									{@render workbenchImpactCell(workbenchImpactByKey[key])}
									{@render statInput('b', 'b', calculator.statsB, key, 0)}
									{#if PERCENTLESS_STATS.has(key)}
										{@render lockedPercentCell('b')}
									{:else}
										{@render statInput('b', 'b', calculator.statsB, key, 1)}
									{/if}
								</div>
							{/each}
						</div>
					{/each}
				</div>
			</div>
		</section>

		<aside class="grid min-w-0 gap-4">
			<section class="min-w-0 rounded-lg border border-border bg-card shadow-sm">
				<div class="flex items-center justify-between gap-2 border-b border-border/80 px-4 py-3">
					<div class="flex items-center gap-2">
						<GaugeIcon class="size-4 text-primary" />
						<h2 class="text-sm font-semibold">Outcome</h2>
					</div>
					<Badge variant="outline">{report.formatted.base.avg}</Badge>
				</div>
				{#if changeSummary}
					<div
						use:observePrimaryVerdict
						class={`hidden border-b px-4 py-3 xl:block ${verdictBandClass(changeSummary.outcome)}`}
					>
						<div class="flex items-start justify-between gap-3">
							<div class="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
								<ScaleIcon class={`size-3.5 shrink-0 ${verdictLabelClass(changeSummary.outcome)}`} />
								<span class="truncate">{changeSummary.label}</span>
							</div>
							<span class={`${activeTone(changeSummary.value)} shrink-0 text-sm`}>
								{changeSummary.value}
							</span>
						</div>
						<div class={`mt-1 truncate text-[11px] tabular-nums ${verdictLabelClass(changeSummary.outcome)}`}>
							{changeSummary.detail}
						</div>
					</div>
				{/if}
				<Tooltip.Provider delayDuration={120}>
					<div class="space-y-4 p-4">
						<div class="grid grid-cols-2 gap-x-4 gap-y-3">
							{@render valueBlock('Normal', report.formatted.base.normal)}
							{@render valueBlock('Boss', report.formatted.base.boss)}
							{@render valueBlock('Buffed Normal', report.formatted.buffed.normal)}
							{@render valueBlock('Buffed Boss', report.formatted.buffed.boss)}
						</div>

						{#if changeSummary}
							<div class="space-y-2 border-t border-border/80 pt-4">
								<div class="flex items-center justify-between gap-3">
									<div class="text-xs font-semibold">A/B comparison</div>
									<div class="text-[11px] text-muted-foreground">Buffed gain</div>
								</div>
								<div class="grid grid-cols-[1.75rem_repeat(3,minmax(0,1fr))] gap-1 sm:grid-cols-[2.25rem_repeat(3,minmax(0,1fr))] sm:gap-1.5">
									<div></div>
									{#each COMPARISON_METRICS as metric}
										<div class="px-0.5 text-center text-[11px] font-medium text-muted-foreground">
											{metric.label}
										</div>
									{/each}
									{#each comparisonMatrixRows as row}
										<div class="grid place-items-center">
											<Badge
												variant="outline"
												class={row.id === 'a'
													? 'border-chart-2/50 bg-chart-2/10 px-1.5 text-foreground'
													: 'border-chart-4/50 bg-chart-4/10 px-1.5 text-foreground'}
											>
												{row.label}
											</Badge>
										</div>
										{#each row.metrics as cell}
											<div
												class={`min-w-0 rounded-md border px-1 py-1.5 text-center sm:px-2 ${metricCellClass(row.id, cell.isWinner)}`}
											>
												<div class={`${activeTone(cell.gain)} truncate text-[10px] leading-3 sm:text-xs sm:leading-4`}>
													{cell.gain}
												</div>
												<div class="truncate text-[9px] leading-3 text-muted-foreground tabular-nums sm:text-[10px]">
													{cell.damage}
												</div>
											</div>
										{/each}
									{/each}
								</div>
							</div>

							<div class="space-y-2 border-t border-border/80 pt-4">
								<div class="flex items-center justify-between gap-3">
									<div class="text-xs font-semibold">A vs B delta</div>
									<div class="flex items-center gap-1 text-[11px] text-muted-foreground">
										<span>A - B</span>
										<Tooltip.Root>
											<Tooltip.Trigger>
												{#snippet child({ props })}
													<button
														{...props}
														type="button"
														class="cursor-help border-b border-dotted border-current leading-none"
													>
														pp
													</button>
												{/snippet}
											</Tooltip.Trigger>
											<Tooltip.Content side="top" sideOffset={6}>Percentage points</Tooltip.Content>
										</Tooltip.Root>
									</div>
								</div>
								{#each comparisonDeltas as delta}
									<div class="grid grid-cols-[3.25rem_minmax(0,1fr)_5.75rem] items-center gap-2 text-xs">
										<span class="truncate text-muted-foreground">{delta.label}</span>
										<div class="relative h-4 overflow-hidden rounded-sm bg-muted/70">
											<div class="absolute left-1/2 top-0 h-full w-px bg-border"></div>
											<div
												class={`absolute top-1/2 h-2 -translate-y-1/2 rounded-sm ${deltaBarClass(delta.value)}`}
												style={deltaBarStyle(delta.value, comparisonDeltaScaleMax)}
											></div>
										</div>
										<span class={`${deltaToneClass(delta.value)} text-right font-medium tabular-nums`}>
											{delta.valueLabel}
										</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</Tooltip.Provider>
			</section>

			<section id="parameters" class="min-w-0 rounded-lg border border-border bg-card shadow-sm">
				<div class="flex items-center gap-2 border-b border-border/80 px-4 py-3">
					<SlidersHorizontalIcon class="size-4 text-primary" />
					<h2 class="text-sm font-semibold">Parameters</h2>
				</div>
				<div class="space-y-4 p-4">
					<div class="space-y-2">
						<Label for="class-preset">Class preset</Label>
						<Popover.Root bind:open={classPresetOpen}>
							<Popover.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										bind:ref={classPresetTrigger}
										id="class-preset"
										variant="outline"
										role="combobox"
										aria-expanded={classPresetOpen}
										class="w-full justify-between px-3 font-normal"
									>
										<span class="truncate">{activeClassPreset ?? 'Custom'}</span>
										<ChevronsUpDownIcon class="ml-2 size-4 shrink-0 text-muted-foreground" />
									</Button>
								{/snippet}
							</Popover.Trigger>
							<Popover.Content
								align="start"
								sideOffset={6}
								class="w-[var(--bits-popover-anchor-width)] max-w-[calc(100vw-2rem)] rounded-md p-0"
							>
								<Command.Root label="Class presets" class="rounded-md">
									<Command.Input placeholder="Search class presets..." />
									<Command.List class="max-h-64">
										<Command.Empty>No class found.</Command.Empty>
										<Command.Group>
											{#each Object.keys(CLASS_PRESETS) as preset}
												<Command.Item
													value={preset}
													class="[&_.cn-command-item-indicator]:hidden"
													onSelect={() => selectClassPreset(preset)}
												>
													<span class="min-w-0 flex-1 truncate">{preset}</span>
													<CheckIcon
														class={`ml-auto size-4 shrink-0 ${activeClassPreset === preset ? 'opacity-100' : 'opacity-0'}`}
													/>
												</Command.Item>
											{/each}
										</Command.Group>
									</Command.List>
								</Command.Root>
							</Popover.Content>
						</Popover.Root>
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
						{@render binaryWeightControl('Minimum', calculator.settings.minWeight, 'minWeight', [0, 0.5])}
						{@render sliderControl('Boss', calculator.settings.bossWeight, 'bossWeight', 0, 1, 0.025)}
					</div>
				</div>
			</section>
		</aside>
	</section>

	<section class="mx-auto grid max-w-[1760px] min-w-0 gap-4 px-4 pb-6 lg:px-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
		<section id="equivalence" class="min-w-0 rounded-lg border border-border bg-card shadow-sm">
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
			<div class="min-w-0 p-4">
				{@render equivalencePanel('main')}
			</div>
		</section>

		<div class="grid min-w-0 gap-4">
			<section class="min-w-0 rounded-lg border border-border bg-card shadow-sm">
				<div class="flex items-center justify-between gap-2 border-b border-border/80 px-4 py-3">
					<div class="flex items-center gap-2">
						<ListChecksIcon class="size-4 text-primary" />
						<h2 class="text-sm font-semibold">Buff Ledger</h2>
					</div>
					<div class="flex items-center gap-2">
						<Badge variant="secondary">{activeBuffCount} active</Badge>
						<Tooltip.Provider delayDuration={120}>
							<Tooltip.Root>
								<Tooltip.Trigger>
									{#snippet child({ props })}
										<Button
											{...props}
											variant="outline"
											size="icon-sm"
											aria-label="Audit details"
											onclick={() => (auditOpen = true)}
										>
											<PanelRightOpenIcon />
										</Button>
									{/snippet}
								</Tooltip.Trigger>
								<Tooltip.Content side="bottom" sideOffset={6}>Audit Details</Tooltip.Content>
							</Tooltip.Root>
						</Tooltip.Provider>
					</div>
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

<Sheet.Root bind:open={auditOpen}>
	<Sheet.Content side="right" class="data-[side=right]:w-[min(100vw,34rem)] data-[side=right]:sm:max-w-none overflow-y-auto p-0">
		<Sheet.Header class="border-b border-border/80 px-5 py-4">
			<Sheet.Title>Audit Details</Sheet.Title>
		</Sheet.Header>

		<div class="space-y-4 p-5">
			<section class="rounded-lg border border-border bg-card">
				<div class="flex items-center gap-2 border-b border-border/80 px-4 py-3">
					<BadgePercentIcon class="size-4 text-primary" />
					<h2 class="text-sm font-semibold">Buffed Stats</h2>
				</div>
				<div class="max-h-[24rem] overflow-y-auto p-4">
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

			<section class="rounded-lg border border-border bg-card">
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
	</Sheet.Content>
</Sheet.Root>

<ScreenshotImportSheet
	bind:open={screenshotImportOpen}
	baseStats={calculator.stats}
	onApply={applyScreenshotImportResult}
/>

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

{#snippet statInput(panelId: string, toneId: WorkbenchPanelId, stats: UiStats, key: StatKey, index: 0 | 1)}
	{@const inputId = statInputId(panelId, key, index)}
	{@const state = inputState(toneId, stats[key][index], inputId, index)}
	{@const cellImpact = cellImpactFor(toneId, key, index)}
	<div
		class={`group/cell relative border-b border-l border-border/70 p-1 transition-colors ${panelCellClass(toneId, state)}`}
	>
		<Input
			id={inputId}
			type="text"
			inputmode="decimal"
			autocomplete="off"
			value={state.draftValue}
			aria-label={`${panelLabel(toneId)} ${STAT_LABELS[key]} ${index === 0 ? 'flat' : 'percent'}`}
			aria-invalid={state.invalid}
			class={`h-8 rounded-sm border border-border/30 bg-background/35 px-2 text-right text-xs tabular-nums shadow-none transition-[background-color,border-color,color,box-shadow] hover:border-border/70 hover:bg-background/60 focus-visible:border-ring focus-visible:bg-background focus-visible:ring-2 ${state.showPercentSuffix ? 'pr-5' : ''} ${state.showDisplayOverlay ? 'text-transparent caret-foreground' : inputToneClass(toneId, state)}`}
			onfocus={(event) => focusStatInput(inputId, event)}
			onblur={blurStatInput}
			onkeydown={(event) => handleStatKeydown(event, panelId, key, index)}
			onpaste={(event) => handleStatPaste(event, stats, key, index, inputId)}
			oninput={(event) => setStat(stats, key, index, inputId, inputValue(event))}
		/>
		{#if state.showDisplayOverlay}
			<span
				class={`pointer-events-none absolute inset-y-1 left-1 right-1 flex items-center justify-end rounded-sm px-2 text-xs tabular-nums ${state.showPercentSuffix ? 'pr-5' : ''} ${inputToneClass(toneId, state)}`}
			>
				{state.displayValue}
			</span>
		{/if}
		{#if state.showPercentSuffix}
			<span
				class={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tabular-nums ${state.invalid ? 'text-destructive/70' : 'text-muted-foreground/70'}`}
			>
				%
			</span>
		{/if}
		{#if state.hasContent}
			<button
				type="button"
				tabindex="-1"
				aria-label={`Clear ${panelLabel(toneId)} ${STAT_LABELS[key]} ${index === 0 ? 'flat' : 'percent'}`}
				class="absolute left-1.5 top-1/2 z-10 grid size-5 -translate-y-1/2 place-items-center rounded-sm border border-border/50 bg-background/95 text-muted-foreground opacity-0 shadow-sm transition hover:text-foreground group-hover/cell:opacity-100 group-focus-within/cell:opacity-100"
				onclick={() => clearStatValue(stats, toneId, key, index)}
			>
				<XIcon class="size-3" />
			</button>
		{/if}
		{#if cellImpact && state.filled && !state.invalid}
			<div class="pointer-events-none absolute inset-x-1 bottom-0 h-0.5 overflow-hidden rounded-full bg-muted/50">
				<div
					class={`h-full rounded-full ${cellImpactRailClass(toneId, cellImpact.value)}`}
					style={cellImpactRailStyle(cellImpact.value)}
				></div>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet mobileStatsPanel(panelId: string, toneId: WorkbenchPanelId, stats: UiStats)}
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
					<div class="contents group/row">
						<div class="flex min-h-10 items-center border-b border-border/70 px-3 transition-colors group-hover/row:bg-muted/25 group-focus-within/row:bg-muted/30">
							<Label
								for={statInputId(panelId, key, 0)}
								class="block min-w-0 truncate text-xs font-medium text-foreground/90"
							>
								{STAT_LABELS[key]}
							</Label>
						</div>
						{@render statInput(panelId, toneId, stats, key, 0)}
						{#if PERCENTLESS_STATS.has(key)}
							{@render lockedPercentCell(toneId)}
						{:else}
							{@render statInput(panelId, toneId, stats, key, 1)}
						{/if}
					</div>
				{/each}
			</div>
		{/each}
	</div>
{/snippet}

{#snippet lockedPercentCell(toneId: WorkbenchPanelId)}
	<div
		class={`grid min-h-10 place-items-center border-b border-l border-border/70 text-muted-foreground/70 transition-colors ${lockedCellClass(toneId)}`}
		aria-label={`${panelLabel(toneId)} percent unavailable`}
	>
		<LockIcon class="size-3 opacity-0 transition-opacity group-hover/row:opacity-60 group-focus-within/row:opacity-60" />
	</div>
{/snippet}

{#snippet workbenchImpactCell(row: WorkbenchImpactRow)}
	<div class="grid min-h-10 grid-cols-[minmax(0,1fr)_4.75rem] items-center gap-2 border-b border-l border-r border-border/70 bg-background/45 px-2 py-1">
		{#if row.hasInput}
			<div class="relative h-4 overflow-hidden rounded-sm bg-muted/70">
				<div class="absolute left-1/2 top-0 h-full w-px bg-border"></div>
				<div
					class={`absolute top-1/2 h-2 -translate-y-1/2 rounded-sm ${deltaBarClass(row.delta)}`}
					style={deltaBarStyle(row.delta, workbenchImpactScaleMax)}
				></div>
			</div>
			<div class={`${deltaToneClass(row.delta)} truncate text-right text-[10px] font-medium tabular-nums`}>
				{row.summary}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet valueBlock(label: string, value: string)}
	<div class="min-w-0">
		<div class="text-xs text-muted-foreground">{label}</div>
		<div class="mt-1 truncate text-base font-semibold tabular-nums">{value}</div>
	</div>
{/snippet}

{#snippet binaryWeightControl(
	label: string,
	value: number,
	key: 'minWeight',
	options: number[]
)}
	<fieldset class="space-y-2">
		<legend class="text-sm font-medium">{label}</legend>
		<div class="grid grid-cols-2 rounded-md bg-muted p-1">
			{#each options as option}
				<label
					class={`relative flex h-8 cursor-pointer items-center justify-center rounded-sm text-xs font-medium tabular-nums transition-all has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/30 ${
						value === option
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'
					}`}
				>
					<input
						type="radio"
						name={`parameter-${key}`}
						value={option}
						checked={value === option}
						onchange={() => updateSlider(key, option)}
						class="sr-only"
					/>
					{formatPercent(option)}
				</label>
			{/each}
		</div>
	</fieldset>
{/snippet}

{#snippet sliderControl(
	label: string,
	value: number,
	key: 'summonWeight' | 'backWeight' | 'bossWeight',
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
