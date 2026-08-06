<svelte:options runes={true} />

<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import favicon from '$lib/assets/favicon.ico';
	import { onMount, tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { SvelteSet } from 'svelte/reactivity';
	import { getDb } from 'jazz-tools/svelte';
	import { RecoveryPhrase } from 'jazz-tools/passphrase';
	import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';
	import AlertTriangleIcon from '@lucide/svelte/icons/triangle-alert';
	import BadgePercentIcon from '@lucide/svelte/icons/badge-percent';
	import BarChart3Icon from '@lucide/svelte/icons/bar-chart-3';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import EraserIcon from '@lucide/svelte/icons/eraser';
	import GaugeIcon from '@lucide/svelte/icons/gauge';
	import GitForkIcon from '@lucide/svelte/icons/git-fork';
	import ImageUpIcon from '@lucide/svelte/icons/image-up';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import LockIcon from '@lucide/svelte/icons/lock';
	import PanelRightOpenIcon from '@lucide/svelte/icons/panel-right-open';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import ScaleIcon from '@lucide/svelte/icons/scale';
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import TargetIcon from '@lucide/svelte/icons/target';
	import XIcon from '@lucide/svelte/icons/x';
	import { getClassArt } from '$lib/calculator/class-art.js';
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
	import {
		findFirstEmptyChangeTarget,
		LT_GEAR_FRAGMENT_PARAM,
		mergeGearComparisonCandidate,
		parseGearComparisonFragment,
		type ChangeTarget,
		type GearComparisonCandidate
	} from '$lib/calculator/gear-comparison-import.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
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
	import BuildsSharingSheet from '$lib/components/builds-sharing-sheet.svelte';
	import LiveBuildSubscription from '$lib/components/live-build-subscription.svelte';
	import type {
		BuildsSharingMode,
		BuildsSharingStatus,
		BuildSummary,
		LiveShareSummary
	} from '$lib/components/builds-sharing.js';
	import ClassArtRail from '$lib/components/class-art-rail.svelte';
	import ScreenshotImportSheet from '$lib/components/screenshot-import-sheet.svelte';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import { getJazzAuthContext } from '$lib/jazz-auth-context.js';
	import {
		addLocalBuild,
		createLocalBuildLibrary,
		deleteLocalBuild,
		duplicateLocalBuild,
		getActiveLocalBuild,
		loadLocalBuildLibrary,
		mergeLocalBuildBackup,
		LOCAL_BUILD_LIBRARY_KEY,
		parseLegacyCalculatorStateBackup,
		parseLocalBuildLibrary,
		renameLocalBuild,
		resetLocalBuild,
		saveLocalBuildLibrary,
		serializeLocalBuildBackup,
		setActiveLocalBuild,
		updateLocalBuildLiveShare,
		updateLocalBuildState,
		type LocalBuild,
		type LocalBuildLibrary
	} from '$lib/calculator/local-build-library.js';
	import {
		createSnapshotEnvelope,
		decodeSnapshotHash,
		encodeSnapshotHash,
		isSnapshotHash,
		readSnapshotFrozenSummary,
		type SnapshotCompatibility,
		type SnapshotEnvelopeV1
	} from '$lib/calculator/snapshot-codec.js';
	import {
		buildLiveBuildChanges,
		createLiveBuild,
		fetchLiveBuild,
		LiveBuildApiError,
		patchLiveBuild,
		redeemLiveBuildEdit,
		rotateLiveBuildEditLink,
		setLiveBuildPinned,
		stopLiveBuild
	} from '$lib/live-builds/client.js';
	import type { LiveBuildResource } from '$lib/live-builds/contracts.js';
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
		PERCENTLESS_STATS,
		QUICK_FACTOR_PRESETS,
		serializeState,
		signedTone,
		STAT_KEYS,
		STAT_LABELS,
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
	const RECOVERY_ACK_KEY = 'ltdc:jazz-recovery-ack:v1';
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
	let classPresetTrigger: HTMLButtonElement | null = null;
	let classPresetStatus = $state('');
	let buffsOpen = $state(false);
	let equivalenceOpen = $state(false);
	let auditOpen = $state(false);
	let buildsSharingOpen = $state(false);
	let recoveryDialogOpen = $state(false);
	let editLinkConfirmOpen = $state(false);
	let screenshotImportOpen = $state(false);
	let gearImportOpen = $state(false);
	let localLibrary = $state.raw<LocalBuildLibrary>(createLocalBuildLibrary());
	let workspaceMode = $state<BuildsSharingMode>('device');
	let liveBuild = $state.raw<LiveBuildResource | null>(null);
	let liveEditBaseEnvelope = $state.raw<SnapshotEnvelopeV1 | null>(null);
	let liveSlug = $state('');
	let liveLocalBuildId = $state<string | null>(null);
	let pendingEditSecret = '';
	let currentEditSecret = $state<string | null>(null);
	let snapshotEnvelope = $state.raw<SnapshotEnvelopeV1 | null>(null);
	let snapshotCompatibility = $state.raw<SnapshotCompatibility | null>(null);
	let snapshotInputsLoaded = $state(false);
	let snapshotUrl = $state<string | null>(null);
	let recoveryPhrase = $state<string | null>(null);
	let storageError = $state<string | null>(null);
	let storageErrorDismissed = $state(false);
	let sharingError = $state<string | null>(null);
	let liveSyncState = $state<'idle' | 'loading' | 'syncing' | 'synced' | 'offline' | 'error'>('idle');
	let liveConflict = $state(false);
	let conflictRemoteBuild = $state.raw<LiveBuildResource | null>(null);
	let backupInput: HTMLInputElement | null = null;
	let lastLocalStateJson = '';
	let lastLocalAutosaveAttemptJson = '';
	let liveSaveTimer: number | null = null;
	let liveSaveInFlight: Promise<void> | null = null;
	let liveSaveRequested = false;
	let liveLinkRotationInProgress = false;
	let liveConnectionGeneration = 0;
	let locationGeneration = 0;
	let workbenchApplyNotice = $state('');
	let workbenchApplyNoticeTimeout: number | null = null;
	let pendingGearImports = $state<GearComparisonCandidate[]>([]);
	let buffQuery = $state('');
	let equivalenceTab = $state('damage');
	let mobileStatsTab = $state('base');
	let focusedStatInput = $state('');
	let draftStatInputs = $state.raw<Record<string, string>>({});
	let equivalenceValues = $state({ perc: 1, critical: 10 });
	const visiblePrimaryVerdicts = new SvelteSet<Element>();
	const db = getDb();
	const jazzAuth = getJazzAuthContext();

	const activeLocalBuild = $derived(getActiveLocalBuild(localLibrary));
	const readOnlyWorkspace = $derived(
		workspaceMode === 'live-view' || workspaceMode === 'snapshot-view'
	);
	const sharedWorkspaceReady = $derived(
		workspaceMode === 'live-edit' ||
		(workspaceMode === 'live-view' && Boolean(liveBuild)) ||
		(workspaceMode === 'snapshot-view' && Boolean(snapshotEnvelope))
	);
	const canForkSharedWorkspace = $derived(
		workspaceMode === 'live-edit' ||
		(workspaceMode === 'live-view' && Boolean(liveBuild)) ||
		(workspaceMode === 'snapshot-view' && snapshotInputsLoaded)
	);
	const snapshotFrozenSummary = $derived(
		snapshotEnvelope ? readSnapshotFrozenSummary(snapshotEnvelope) : undefined
	);
	const snapshotNeedsFrozenResults = $derived(
		workspaceMode === 'snapshot-view' &&
		Boolean(snapshotFrozenSummary) &&
		(snapshotCompatibility?.formula !== 'current' || !snapshotInputsLoaded)
	);
	const snapshotFrozenOnly = $derived(
		workspaceMode === 'snapshot-view' && Boolean(snapshotEnvelope) && !snapshotInputsLoaded
	);
	const displayedBuildTitle = $derived(
		snapshotEnvelope?.title ?? liveBuild?.title ?? activeLocalBuild.name
	);
	const buildSummaries = $derived.by(() => {
		const currentLiveBuild = liveBuild;
		return localLibrary.builds.map((build) => ({
			id: build.id,
			name: build.name,
			updatedAt: build.updatedAt,
			hasLiveShare: Boolean(build.liveShare),
			liveSharePinned:
				Boolean(build.liveShare) && currentLiveBuild && currentLiveBuild.publicSlug === build.liveShare?.publicSlug
					? currentLiveBuild.pinned
					: undefined,
			liveShareExpiresAt:
				currentLiveBuild && currentLiveBuild.publicSlug === build.liveShare?.publicSlug
					? currentLiveBuild.expiresAt
					: undefined
		})) satisfies BuildSummary[];
	});
	const liveShareSummary = $derived.by((): LiveShareSummary | null => {
		const slug = liveSlug || activeLocalBuild.liveShare?.publicSlug;
		if (!slug) return null;
		const localShare = liveLocalBuildId
			? localLibrary.builds.find((build) => build.id === liveLocalBuildId)?.liveShare
			: undefined;
		const secret = localShare?.publicSlug === slug
			? currentEditSecret ?? localShare.editSecret ?? null
			: null;
		const access = liveBuild?.role === 'creator'
			? 'owner'
			: liveBuild?.role === 'editor' || workspaceMode === 'live-edit'
				? 'editor'
				: 'viewer';
		return {
			access,
			state: liveBuild && liveBuild.expiresAt && new Date(liveBuild.expiresAt).getTime() <= Date.now()
				? 'expired'
				: 'active',
			viewUrl: liveBuildUrl(slug),
			editUrl: secret ? liveBuildUrl(slug, secret) : null,
			pinned: liveBuild?.pinned ?? false,
			expiresAt: liveBuild?.expiresAt,
			lastEditedAt: liveBuild?.lastEditedAt,
			revision: liveBuild?.revision ?? activeLocalBuild.liveShare?.revision
		};
	});
	const sharingStatus = $derived.by((): BuildsSharingStatus => {
		if (workspaceMode === 'snapshot-view') {
			return { kind: 'read-only', label: 'Read-only · Snapshot' };
		}
		if (workspaceMode === 'live-view') {
			return {
				kind: liveSyncState === 'error' ? 'error' : 'read-only',
				label: liveSyncState === 'loading' ? 'Loading shared build' : 'Read-only · Live'
			};
		}
		if (liveSyncState === 'loading') return { kind: 'syncing', label: 'Connecting live share' };
		if (liveSyncState === 'syncing') return { kind: 'syncing', label: 'Syncing' };
		if (liveSyncState === 'offline') {
			return { kind: 'offline', label: 'Offline · saved on this device' };
		}
		if (liveSyncState === 'error') return { kind: 'error', label: "Couldn't sync" };
		if (workspaceMode === 'live-edit') return { kind: 'synced', label: 'Shared · Up to date' };
		if (storageError) return { kind: 'error', label: 'Not saved on this device' };
		return { kind: 'saved', label: 'Saved on this device' };
	});

	const report = $derived(calculateDashboard(calculator));
	const activeClassPreset = $derived(matchClassPreset(calculator.settings));
	const selectedClassPreset = $derived(calculator.selectedClassPreset ?? activeClassPreset ?? null);
	const selectedClassArt = $derived(getClassArt(selectedClassPreset));
	const classPresetCustomized = $derived(
		Boolean(calculator.selectedClassPreset) && activeClassPreset !== calculator.selectedClassPreset
	);
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
	const showStickyVerdict = $derived(Boolean(changeSummary) && visiblePrimaryVerdicts.size === 0);
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
	const pendingGearImport = $derived(pendingGearImports[0]);

	onMount(() => {
		void initializeWorkspaceFromLocation();
		const handleHashChange = () => void initializeWorkspaceFromLocation();
		const handleStorage = (event: StorageEvent) => {
			if (event.key !== LOCAL_BUILD_LIBRARY_KEY || !event.newValue || storageError) return;
			try {
				let incoming = parseLocalBuildLibrary(event.newValue);
				if (workspaceMode === 'live-edit' && liveLocalBuildId) {
					const localLiveBuild = localLibrary.builds.find((build) => build.id === liveLocalBuildId);
					if (localLiveBuild) {
						const remoteIndex = incoming.builds.findIndex((build) => build.id === liveLocalBuildId);
						const builds = [...incoming.builds];
						if (remoteIndex === -1) builds.push(localLiveBuild);
						else if (new Date(localLiveBuild.updatedAt) > new Date(builds[remoteIndex].updatedAt)) {
							builds[remoteIndex] = localLiveBuild;
						}
						incoming = { ...incoming, activeBuildId: liveLocalBuildId, builds };
					}
				}
				localLibrary = incoming;
				if (workspaceMode === 'device') {
					setCalculatorState(getActiveLocalBuild(incoming).state);
					if (getActiveLocalBuild(incoming).liveShare) void connectActiveLiveShare();
				}
			} catch {
				// Ignore partially written or future-version values from another tab.
			}
		};
		window.addEventListener('hashchange', handleHashChange);
		window.addEventListener('storage', handleStorage);
		return () => {
			window.removeEventListener('hashchange', handleHashChange);
			window.removeEventListener('storage', handleStorage);
		};
	});

	$effect(() => {
		const serialized = serializeState(calculator);
		if (
			!hydrated ||
			readOnlyWorkspace ||
			serialized === lastLocalStateJson ||
			serialized === lastLocalAutosaveAttemptJson
		) return;
		const buildId = workspaceMode === 'live-edit' ? liveLocalBuildId : localLibrary.activeBuildId;
		if (!buildId) return;
		lastLocalAutosaveAttemptJson = serialized;
		if (persistLocalLibrary(updateLocalBuildState(localLibrary, buildId, calculator))) {
			lastLocalStateJson = serialized;
		}
	});

	$effect(() => {
		serializeState(calculator);
		if (!hydrated || workspaceMode !== 'live-edit' || !liveBuild || !liveEditBaseEnvelope) {
			return;
		}
		const nextEnvelope = createLiveEnvelope();
		if (buildLiveBuildChanges(liveEditBaseEnvelope, nextEnvelope).length === 0) return;

		if (liveSaveTimer !== null) window.clearTimeout(liveSaveTimer);
		liveSaveTimer = window.setTimeout(() => {
			liveSaveTimer = null;
			void saveLiveBuildNow();
		}, 1500);

		return () => {
			if (liveSaveTimer !== null) {
				window.clearTimeout(liveSaveTimer);
				liveSaveTimer = null;
			}
		};
	});

	$effect(() => {
		return () => {
			if (workbenchApplyNoticeTimeout !== null) {
				window.clearTimeout(workbenchApplyNoticeTimeout);
			}
			if (liveSaveTimer !== null) window.clearTimeout(liveSaveTimer);
		};
	});

	const classPresetTriggerAttachment: Attachment<HTMLButtonElement> = (node) => {
		classPresetTrigger = node;
		return () => {
			if (classPresetTrigger === node) classPresetTrigger = null;
		};
	};

	async function initializeWorkspaceFromLocation() {
		const generation = ++locationGeneration;
		invalidateLiveConnection();
		if (!hydrated) {
			const loaded = loadLocalBuildLibrary(window.localStorage);
			localLibrary = loaded.library;
			if (!loaded.ok) storageError = loaded.error.message;
			const active = getActiveLocalBuild(localLibrary);
			setCalculatorState(active.state);
			hydrated = true;
			if (loaded.ok && loaded.migrated) persistLocalLibrary(localLibrary);
		}

		const hash = window.location.hash;
		if (isSnapshotHash(hash)) {
			workspaceMode = 'snapshot-view';
			liveSlug = '';
			liveBuild = null;
			liveEditBaseEnvelope = null;
			liveLocalBuildId = null;
			currentEditSecret = null;
			pendingEditSecret = '';
			editLinkConfirmOpen = false;
			clearLiveConflict();
			snapshotEnvelope = null;
			snapshotCompatibility = null;
			snapshotInputsLoaded = false;
			snapshotUrl = null;
			await openSnapshotLink(hash, generation);
			return;
		}

		const params = new URLSearchParams(hash.replace(/^#/, ''));
		const sharedSlug = params.get('share')?.trim();
		if (sharedSlug) {
			workspaceMode = 'live-view';
			liveSlug = sharedSlug;
			liveBuild = null;
			liveEditBaseEnvelope = null;
			liveLocalBuildId = null;
			currentEditSecret = null;
			clearLiveConflict();
			snapshotEnvelope = null;
			snapshotCompatibility = null;
			snapshotInputsLoaded = false;
			snapshotUrl = null;
			pendingEditSecret = params.get('edit')?.trim() ?? '';
			if (pendingEditSecret) removeEditSecretFromLocation();
			await openLiveBuildLink(sharedSlug, generation);
			return;
		}

		if (workspaceMode === 'live-view' || workspaceMode === 'snapshot-view') {
			openLocalBuild(localLibrary.activeBuildId, false);
		}
		consumeGearComparisonFragment();
		if (activeLocalBuild.liveShare) void connectActiveLiveShare();
	}

	function setCalculatorState(state: CalculatorState) {
		calculator = normalizeState(state);
		lastLocalStateJson = serializeState(calculator);
		lastLocalAutosaveAttemptJson = lastLocalStateJson;
		clearAllStatDrafts();
	}

	function persistLocalLibrary(nextLibrary: LocalBuildLibrary): boolean {
		localLibrary = nextLibrary;
		const result = saveLocalBuildLibrary(window.localStorage, nextLibrary);
		if (result.ok) {
			storageError = null;
			storageErrorDismissed = false;
			return true;
		}
		storageError = result.error.message;
		storageErrorDismissed = false;
		return false;
	}

	function retryLocalSave() {
		if (readOnlyWorkspace) return;
		lastLocalAutosaveAttemptJson = serializeState(calculator);
		if (persistLocalLibrary(localLibrary)) {
			lastLocalStateJson = lastLocalAutosaveAttemptJson;
		}
	}

	function clearLiveConflict() {
		liveConflict = false;
		conflictRemoteBuild = null;
	}

	function invalidateLiveConnection() {
		liveConnectionGeneration += 1;
		liveSaveRequested = false;
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
		if (readOnlyWorkspace) return;
		calculator = createDefaultState();
		clearWorkbenchApplyNotice();
		showWorkbenchApplyNotice('Current build reset.');
		clearAllStatDrafts();
	}

	async function selectClassPreset(presetName: string) {
		calculator.settings = applyClassPreset(calculator.settings, presetName);
		calculator.selectedClassPreset = presetName;
		classPresetStatus = `${presetName} preset applied. Character artwork updated.`;
		classPresetOpen = false;
		await tick();
		classPresetTrigger?.focus();
	}

	async function openClassPresetPicker() {
		document.getElementById('class-preset')?.scrollIntoView({ block: 'center' });
		await tick();
		classPresetOpen = true;
	}

	function updateSlider(key: 'summonWeight' | 'backWeight' | 'minWeight' | 'bossWeight', value: number) {
		calculator.settings[key] = value;
	}

	function liveBuildUrl(slug: string, editSecret?: string) {
		const url = new URL(window.location.href);
		url.hash = new URLSearchParams({
			share: slug,
			...(editSecret ? { edit: editSecret } : {})
		}).toString();
		return url.toString();
	}

	function replaceCurrentHash(params?: URLSearchParams) {
		const url = new URL(window.location.href);
		url.hash = params?.toString() ?? '';
		replaceState(resolve(`/${url.search}${url.hash}` as '/'), window.history.state ?? {});
	}

	function createLiveEnvelope(state: CalculatorState = calculator) {
		return createSnapshotEnvelope({
			title: workspaceMode === 'live-edit' && liveLocalBuildId
				? localLibrary.builds.find((build) => build.id === liveLocalBuildId)?.name ?? displayedBuildTitle
				: displayedBuildTitle,
			state,
			createdAt: liveEditBaseEnvelope?.createdAt ?? liveBuild?.snapshot.createdAt
		});
	}

	function hasUnsavedLiveChanges() {
		if (!liveEditBaseEnvelope || workspaceMode !== 'live-edit') return false;
		return buildLiveBuildChanges(liveEditBaseEnvelope, createLiveEnvelope()).length > 0;
	}

	async function openSnapshotLink(hash: string, generation: number) {
		sharingError = null;
		try {
			const decoded = await decodeSnapshotHash(hash);
			if (generation !== locationGeneration) return;
			if (!decoded.compatibility.canLoadState && !readSnapshotFrozenSummary(decoded.envelope)) {
				throw new Error(
					'This newer snapshot does not contain frozen results that this calculator can display.'
				);
			}
			snapshotEnvelope = decoded.envelope;
			snapshotCompatibility = decoded.compatibility;
			snapshotInputsLoaded = decoded.compatibility.canLoadState;
			snapshotUrl = window.location.href;
			if (decoded.compatibility.canLoadState) setCalculatorState(decoded.envelope.state);
			sharingError = decoded.compatibility.warnings.join(' ') || null;
			liveSyncState = 'idle';
		} catch (error) {
			if (generation !== locationGeneration) return;
			snapshotEnvelope = null;
			snapshotCompatibility = null;
			snapshotInputsLoaded = false;
			sharingError = error instanceof Error
				? error.message
				: 'This snapshot link is damaged or was created by a newer app version.';
			liveSyncState = 'error';
		}
	}

	async function openLiveBuildLink(slug: string, generation: number) {
		sharingError = null;
		liveSyncState = 'loading';
		try {
			const { build } = await fetchLiveBuild(slug, db);
			if (generation !== locationGeneration || slug !== liveSlug) return;
			liveBuild = build;
			liveEditBaseEnvelope = build.snapshot;
			snapshotEnvelope = null;
			snapshotCompatibility = null;
			setCalculatorState(build.snapshot.state);
			liveSyncState = 'synced';
			if (pendingEditSecret) editLinkConfirmOpen = true;
		} catch (error) {
			if (generation !== locationGeneration) return;
			handleLiveError(error, 'Shared build unavailable. The link is invalid or sharing was stopped.');
		}
	}

	async function connectActiveLiveShare() {
		const build = getActiveLocalBuild(localLibrary);
		const share = build.liveShare;
		if (!share) return;
		const generation = ++liveConnectionGeneration;
		const buildId = build.id;
		const slug = share.publicSlug;
		const editSecret = share.editSecret ?? null;
		liveSlug = slug;
		liveLocalBuildId = buildId;
		currentEditSecret = editSecret;
		liveSyncState = navigator.onLine ? 'loading' : 'offline';
		sharingError = null;
		try {
			const { build: remote } = await fetchLiveBuild(slug, db);
			const active = getActiveLocalBuild(localLibrary);
			if (
				generation !== liveConnectionGeneration ||
				active.id !== buildId ||
				active.liveShare?.publicSlug !== slug
			) return;
			liveBuild = remote;
			if (remote.role === 'viewer') {
				detachRevokedLiveShare(
					'This device no longer has edit access. Your local draft was kept unchanged.'
				);
				return;
			}

			workspaceMode = 'live-edit';
			const lastSyncedState = share.lastSyncedState;
			liveEditBaseEnvelope = lastSyncedState
				? createSnapshotEnvelope({
						title: remote.title,
						state: lastSyncedState,
						createdAt: remote.snapshot.createdAt
					})
				: remote.snapshot;

			if (
				(lastSyncedState && serializeState(lastSyncedState) === serializeState(build.state)) ||
				(!lastSyncedState && share.revision < remote.revision)
			) {
				setCalculatorState(remote.snapshot.state);
				recordLiveSync(
					remote,
					remote.snapshot.state,
					remote.snapshot.state,
					buildId,
					editSecret
				);
			}
			liveSyncState = hasUnsavedLiveChanges() ? 'syncing' : 'synced';
		} catch (error) {
			if (generation !== liveConnectionGeneration) return;
			workspaceMode = 'live-edit';
			handleLiveError(error, 'Could not reconnect this live share. Your draft is still saved on this device.');
		}
	}

	function removeEditSecretFromLocation() {
		const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
		params.delete('edit');
		replaceCurrentHash(params);
	}

	function stripEditSecret() {
		removeEditSecretFromLocation();
		pendingEditSecret = '';
	}

	function declineEditLink() {
		stripEditSecret();
		editLinkConfirmOpen = false;
	}

	function handleEditLinkDialogChange(open: boolean) {
		editLinkConfirmOpen = open;
		if (!open && pendingEditSecret) stripEditSecret();
	}

	async function acceptEditLink() {
		if (!liveSlug || !pendingEditSecret || !liveBuild) return;
		const generation = locationGeneration;
		const slug = liveSlug;
		const requestedSecret = pendingEditSecret;
		liveSyncState = 'syncing';
		sharingError = null;
		try {
			const response = await redeemLiveBuildEdit(db, slug, requestedSecret);
			if (generation !== locationGeneration || slug !== liveSlug) return;
			const secret = requestedSecret;
			stripEditSecret();
			editLinkConfirmOpen = false;
			liveBuild = response.build;
			liveEditBaseEnvelope = response.build.snapshot;
			currentEditSecret = secret;

			let nextLibrary = localLibrary;
			let localBuild = nextLibrary.builds.find(
				(build) => build.liveShare?.publicSlug === response.build.publicSlug
			);
			if (!localBuild) {
				nextLibrary = addLocalBuild(nextLibrary, {
					name: response.build.title,
					state: response.build.snapshot.state
				});
				localBuild = getActiveLocalBuild(nextLibrary);
			} else {
				nextLibrary = setActiveLocalBuild(nextLibrary, localBuild.id);
				nextLibrary = updateLocalBuildState(nextLibrary, localBuild.id, response.build.snapshot.state);
			}
			nextLibrary = updateLocalBuildLiveShare(nextLibrary, localBuild.id, {
				publicSlug: response.build.publicSlug,
				editSecret: secret,
				revision: response.build.revision,
				lastSyncedState: response.build.snapshot.state
			});
			persistLocalLibrary(nextLibrary);
			liveLocalBuildId = localBuild.id;
			liveConnectionGeneration += 1;
			workspaceMode = 'live-edit';
			setCalculatorState(response.build.snapshot.state);
			liveSyncState = 'synced';
		} catch (error) {
			if (generation !== locationGeneration || slug !== liveSlug) return;
			stripEditSecret();
			editLinkConfirmOpen = false;
			workspaceMode = 'live-view';
			handleLiveError(error, 'Edit access unavailable. You can keep viewing or fork this build.');
		}
	}

	async function createSnapshotLink() {
		const envelope = createSnapshotEnvelope({ title: displayedBuildTitle, state: calculator });
		const hash = await encodeSnapshotHash(envelope);
		const url = new URL(window.location.href);
		url.hash = hash.slice(1);
		snapshotUrl = url.toString();
		return snapshotUrl;
	}

	async function createCurrentLiveShare() {
		if (!jazzAuth.configured) {
			throw new Error('Live sharing is not configured for this deployment. Snapshot links still work.');
		}
		if (readOnlyWorkspace) throw new Error('Fork this build to your device before sharing it.');
		const localBuild = getActiveLocalBuild(localLibrary);
		if (localBuild.liveShare) {
			await connectActiveLiveShare();
			return;
		}

		const generation = ++liveConnectionGeneration;
		const localBuildId = localBuild.id;
		const sharedState = normalizeState(calculator);
		liveSyncState = 'syncing';
		sharingError = null;
		try {
			const response = await createLiveBuild(db, {
				title: localBuild.name,
				snapshot: createSnapshotEnvelope({ title: localBuild.name, state: sharedState })
			});
			if (!localLibrary.builds.some((build) => build.id === localBuildId)) {
				await stopLiveBuild(db, response.build.publicSlug);
				return;
			}
			persistLocalLibrary(updateLocalBuildLiveShare(localLibrary, localBuildId, {
				publicSlug: response.build.publicSlug,
				editSecret: response.editSecret,
				revision: response.build.revision,
				lastSyncedState: response.build.snapshot.state
			}));
			if (
				generation !== liveConnectionGeneration ||
				getActiveLocalBuild(localLibrary).id !== localBuildId
			) return;
			liveBuild = response.build;
			liveEditBaseEnvelope = response.build.snapshot;
			liveSlug = response.build.publicSlug;
			liveLocalBuildId = localBuildId;
			currentEditSecret = response.editSecret;
			workspaceMode = 'live-edit';
			liveSyncState = 'synced';

			if (!window.localStorage.getItem(RECOVERY_ACK_KEY) && jazzAuth.auth.secret) {
				recoveryPhrase = RecoveryPhrase.fromSecret(jazzAuth.auth.secret);
				recoveryDialogOpen = true;
			}
		} catch (error) {
			if (generation !== liveConnectionGeneration) return;
			handleLiveError(error, 'Could not create the live share. This draft is still saved on your device.');
			throw error;
		}
	}

	async function saveLiveBuildNow(): Promise<void> {
		liveSaveRequested = true;
		if (liveLinkRotationInProgress) return;
		if (liveSaveInFlight) return liveSaveInFlight;

		const operation = (async () => {
			while (liveSaveRequested) {
				liveSaveRequested = false;
				const saved = await saveLiveBuildPass();
				if (!saved) break;
				if (workspaceMode === 'live-edit' && hasUnsavedLiveChanges()) {
					liveSaveRequested = true;
				}
			}
		})();
		liveSaveInFlight = operation;
		try {
			await operation;
		} finally {
			if (liveSaveInFlight === operation) liveSaveInFlight = null;
		}
	}

	async function saveLiveBuildPass(): Promise<boolean> {
		if (workspaceMode !== 'live-edit' || !liveBuild || !liveEditBaseEnvelope || !liveSlug) {
			return false;
		}
		const generation = liveConnectionGeneration;
		const slug = liveSlug;
		const localBuildId = liveLocalBuildId;
		const editSecret = currentEditSecret;
		const baseRevision = liveBuild.revision;
		const nextEnvelope = createLiveEnvelope();
		const changes = buildLiveBuildChanges(liveEditBaseEnvelope, nextEnvelope);
		if (changes.length === 0) {
			liveSyncState = 'synced';
			return false;
		}

		liveSyncState = navigator.onLine ? 'syncing' : 'offline';
		if (!navigator.onLine) return false;
		sharingError = null;
		try {
			const { build } = await patchLiveBuild(db, slug, {
				baseRevision,
				changes
			});
			if (
				generation !== liveConnectionGeneration ||
				workspaceMode !== 'live-edit' ||
				liveSlug !== slug ||
				liveLocalBuildId !== localBuildId
			) return false;
			liveBuild = build;
			liveEditBaseEnvelope = build.snapshot;
			clearLiveConflict();
			recordLiveSync(
				build,
				build.snapshot.state,
				calculator,
				localBuildId,
				editSecret
			);
			liveSyncState = hasUnsavedLiveChanges() ? 'syncing' : 'synced';
			return true;
		} catch (error) {
			if (generation !== liveConnectionGeneration || liveSlug !== slug) return false;
			if (error instanceof LiveBuildApiError && error.code === 'conflict' && error.build) {
				liveConflict = true;
				conflictRemoteBuild = error.build;
				liveSyncState = 'error';
				sharingError = 'The same field changed elsewhere. Load the shared version or fork your local edits.';
				return false;
			}
			if (
				error instanceof LiveBuildApiError &&
				(error.code === 'forbidden' || error.code === 'not_found' || error.code === 'expired')
			) {
				detachRevokedLiveShare(
					'This live share is no longer writable. Your unsynced changes remain in this device draft.'
				);
				return false;
			}
			handleLiveError(error, 'Could not sync. Your changes remain saved on this device.');
			return false;
		}
	}

	function recordLiveSync(
		build: LiveBuildResource,
		syncedState: CalculatorState,
		localState: CalculatorState = syncedState,
		localBuildId: string | null = liveLocalBuildId,
		editSecret: string | null = currentEditSecret
	) {
		if (!localBuildId) return;
		const localBuild = localLibrary.builds.find((candidate) => candidate.id === localBuildId);
		if (!localBuild || localBuild.liveShare?.publicSlug !== build.publicSlug) return;
		const stillCurrentSecret =
			liveSlug === build.publicSlug && currentEditSecret
				? currentEditSecret
				: editSecret === localBuild.liveShare.editSecret
					? editSecret
					: localBuild.liveShare.editSecret;
		let nextLibrary = updateLocalBuildState(localLibrary, localBuildId, localState);
		nextLibrary = updateLocalBuildLiveShare(nextLibrary, localBuildId, {
			publicSlug: build.publicSlug,
			...(stillCurrentSecret ? { editSecret: stillCurrentSecret } : {}),
			revision: build.revision,
			lastSyncedState: syncedState
		});
		persistLocalLibrary(nextLibrary);
	}

	async function refreshLiveBuild() {
		if (!liveSlug) return;
		const generation = liveConnectionGeneration;
		const slug = liveSlug;
		const localBuildId = liveLocalBuildId;
		try {
			const { build } = await fetchLiveBuild(slug, db);
			if (generation !== liveConnectionGeneration || slug !== liveSlug) return;
			if (workspaceMode === 'live-edit' && build.role === 'viewer') {
				detachRevokedLiveShare(
					'Edit access was revoked. Your local draft was kept unchanged.'
				);
				return;
			}
			if (workspaceMode === 'live-edit' && hasUnsavedLiveChanges()) {
				void saveLiveBuildNow();
				return;
			}
			liveBuild = build;
			liveEditBaseEnvelope = build.snapshot;
			setCalculatorState(build.snapshot.state);
			if (workspaceMode === 'live-edit') {
				recordLiveSync(
					build,
					build.snapshot.state,
					build.snapshot.state,
					localBuildId
				);
			}
			liveSyncState = 'synced';
		} catch (error) {
			if (generation !== liveConnectionGeneration || slug !== liveSlug) return;
			if (
				workspaceMode === 'live-edit' &&
				error instanceof LiveBuildApiError &&
				(error.code === 'forbidden' || error.code === 'not_found' || error.code === 'expired')
			) {
				detachRevokedLiveShare(
					'This live share is no longer writable. Your local draft was kept unchanged.'
				);
				return;
			}
			handleLiveError(error, 'Could not refresh the shared build.');
		}
	}

	function handleLiveRevision(revision: number, editGenerationChanged = false) {
		if (!liveBuild || (!editGenerationChanged && revision === liveBuild.revision)) return;
		void refreshLiveBuild();
	}

	function handleLiveUnavailable() {
		if (workspaceMode === 'live-edit') {
			void refreshLiveBuild();
			return;
		}
		liveBuild = null;
		liveEditBaseEnvelope = null;
		setCalculatorState(createDefaultState());
		liveSyncState = 'error';
		sharingError = 'Shared build unavailable. It may have expired or sharing was stopped.';
	}

	function detachRevokedLiveShare(message: string) {
		const localBuildId = liveLocalBuildId;
		invalidateLiveConnection();
		if (localBuildId && localLibrary.builds.some((build) => build.id === localBuildId)) {
			persistLocalLibrary(updateLocalBuildLiveShare(localLibrary, localBuildId, undefined));
		}
		workspaceMode = 'device';
		liveBuild = null;
		liveEditBaseEnvelope = null;
		liveSlug = '';
		liveLocalBuildId = null;
		currentEditSecret = null;
		clearLiveConflict();
		sharingError = null;
		liveSyncState = 'idle';
		replaceCurrentHash();
		showWorkbenchApplyNotice(message);
	}

	function handleLiveError(error: unknown, fallback: string) {
		sharingError = error instanceof Error ? error.message : fallback;
		liveSyncState = navigator.onLine ? 'error' : 'offline';
	}

	async function pinCurrentLiveShare(pinned: boolean) {
		if (!liveSlug) return;
		const generation = liveConnectionGeneration;
		const slug = liveSlug;
		const { build } = await setLiveBuildPinned(db, slug, pinned);
		if (generation !== liveConnectionGeneration || slug !== liveSlug) return;
		liveBuild = build;
	}

	async function rotateCurrentEditLink() {
		if (!liveSlug || liveLinkRotationInProgress) return;
		await saveLiveBuildNow();
		if (!liveSlug || workspaceMode !== 'live-edit') return;
		liveLinkRotationInProgress = true;
		const generation = ++liveConnectionGeneration;
		const slug = liveSlug;
		const localBuildId = liveLocalBuildId;
		try {
			const response = await rotateLiveBuildEditLink(db, slug);
			if (generation !== liveConnectionGeneration || slug !== liveSlug) return;
			// Invalidate any refresh or save that started while the rotation request was in flight.
			liveConnectionGeneration += 1;
			liveBuild = response.build;
			liveEditBaseEnvelope = response.build.snapshot;
			currentEditSecret = response.editSecret;
			if (localBuildId) {
				persistLocalLibrary(updateLocalBuildLiveShare(localLibrary, localBuildId, {
					publicSlug: slug,
					editSecret: response.editSecret,
					revision: response.build.revision,
					lastSyncedState: response.build.snapshot.state
				}));
			}
		} finally {
			liveLinkRotationInProgress = false;
			if (workspaceMode === 'live-edit' && (liveSaveRequested || hasUnsavedLiveChanges())) {
				void saveLiveBuildNow();
			}
		}
	}

	async function stopCurrentLiveShare() {
		if (!liveSlug) return;
		const generation = liveConnectionGeneration;
		const slug = liveSlug;
		const localBuildId = liveLocalBuildId;
		await stopLiveBuild(db, slug);
		if (generation !== liveConnectionGeneration || slug !== liveSlug) return;
		if (localBuildId) {
			persistLocalLibrary(updateLocalBuildLiveShare(localLibrary, localBuildId, undefined));
		}
		liveBuild = null;
		liveEditBaseEnvelope = null;
		invalidateLiveConnection();
		liveSlug = '';
		currentEditSecret = null;
		liveLocalBuildId = null;
		workspaceMode = 'device';
		clearLiveConflict();
		liveSyncState = 'idle';
		showWorkbenchApplyNotice('Sharing stopped. Draft kept on this device.');
		replaceCurrentHash();
	}

	function openLocalBuild(buildId: string, clearLocation = true) {
		invalidateLiveConnection();
		const nextLibrary = setActiveLocalBuild(localLibrary, buildId);
		persistLocalLibrary(nextLibrary);
		const build = getActiveLocalBuild(nextLibrary);
		workspaceMode = 'device';
		liveBuild = null;
		liveEditBaseEnvelope = null;
		liveSlug = '';
		liveLocalBuildId = null;
		currentEditSecret = null;
		snapshotEnvelope = null;
		snapshotCompatibility = null;
		snapshotInputsLoaded = false;
		snapshotUrl = null;
		sharingError = null;
		clearLiveConflict();
		liveSyncState = 'idle';
		setCalculatorState(build.state);
		if (clearLocation) replaceCurrentHash();
		if (build.liveShare) void connectActiveLiveShare();
	}

	function createDeviceBuild(name: string) {
		const nextLibrary = addLocalBuild(localLibrary, { name });
		persistLocalLibrary(nextLibrary);
		openLocalBuild(nextLibrary.activeBuildId);
	}

	function renameDeviceBuild(buildId: string, name: string) {
		persistLocalLibrary(renameLocalBuild(localLibrary, buildId, name));
	}

	function duplicateDeviceBuild(buildId: string) {
		const nextLibrary = duplicateLocalBuild(localLibrary, buildId);
		persistLocalLibrary(nextLibrary);
		openLocalBuild(nextLibrary.activeBuildId);
	}

	function deleteDeviceBuild(buildId: string) {
		const wasCurrent = buildId === localLibrary.activeBuildId;
		const nextLibrary = deleteLocalBuild(localLibrary, buildId);
		persistLocalLibrary(nextLibrary);
		if (wasCurrent) openLocalBuild(nextLibrary.activeBuildId);
	}

	function resetDeviceBuild(buildId: string) {
		const nextLibrary = resetLocalBuild(localLibrary, buildId);
		persistLocalLibrary(nextLibrary);
		if (buildId === nextLibrary.activeBuildId) setCalculatorState(getActiveLocalBuild(nextLibrary).state);
	}

	function forkCurrentToDrafts() {
		const nextLibrary = addLocalBuild(localLibrary, {
			name: `${displayedBuildTitle} copy`,
			state: calculator
		});
		persistLocalLibrary(nextLibrary);
		openLocalBuild(nextLibrary.activeBuildId);
		buildsSharingOpen = true;
		showWorkbenchApplyNotice('Forked to this device.');
	}

	function openMyDrafts() {
		openLocalBuild(localLibrary.activeBuildId);
		buildsSharingOpen = true;
	}

	function loadSharedConflictVersion() {
		if (!conflictRemoteBuild) return;
		liveBuild = conflictRemoteBuild;
		liveEditBaseEnvelope = conflictRemoteBuild.snapshot;
		setCalculatorState(conflictRemoteBuild.snapshot.state);
		recordLiveSync(conflictRemoteBuild, conflictRemoteBuild.snapshot.state);
		clearLiveConflict();
		sharingError = null;
		liveSyncState = 'synced';
	}

	function acknowledgeRecoveryPhrase() {
		window.localStorage.setItem(RECOVERY_ACK_KEY, 'acknowledged');
		recoveryPhrase = null;
		recoveryDialogOpen = false;
	}

	async function restoreLiveShareIdentity(phrase: string) {
		await jazzAuth.auth.login(RecoveryPhrase.toSecret(phrase));
		recoveryPhrase = null;
		sharingError = null;
		if (activeLocalBuild.liveShare) await connectActiveLiveShare();
	}

	async function retrySharing() {
		if (liveConflict) return;
		if (workspaceMode === 'live-edit' && liveBuild) {
			await saveLiveBuildNow();
			return;
		}
		if (liveSlug && workspaceMode === 'live-view') {
			await openLiveBuildLink(liveSlug, locationGeneration);
			return;
		}
		if (activeLocalBuild.liveShare) await connectActiveLiveShare();
	}

	async function retryPersistence() {
		if (storageError) {
			retryLocalSave();
			return;
		}
		await retrySharing();
	}

	function handleOnline() {
		if (workspaceMode === 'live-edit' || workspaceMode === 'live-view') void retrySharing();
	}

	function handleOffline() {
		if (workspaceMode === 'live-edit') liveSyncState = 'offline';
	}

	function handleVisibilityChange() {
		if (document.visibilityState === 'hidden' && workspaceMode === 'live-edit') {
			void saveLiveBuildNow();
		}
	}

	function safeFilename(name: string) {
		return name.trim().replace(/[^a-z0-9._-]+/giu, '-').replace(/^-+|-+$/gu, '') || 'latale-build';
	}

	function downloadJson(filename: string, value: string) {
		const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		window.setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	function exportCurrentBuild() {
		downloadJson(`${safeFilename(displayedBuildTitle)}.json`, serializeState(calculator));
	}

	function exportBuildLibrary() {
		downloadJson('latale-build-library.json', serializeLocalBuildBackup(localLibrary));
	}

	function requestBackupImport() {
		backupInput?.click();
	}

	async function importBackupFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const text = await file.text();
		try {
			const merged = mergeLocalBuildBackup(localLibrary, text);
			persistLocalLibrary(merged.library);
			showWorkbenchApplyNotice(`${merged.importedCount} ${merged.importedCount === 1 ? 'draft' : 'drafts'} imported.`);
			return;
		} catch {
			try {
				const state = parseLegacyCalculatorStateBackup(text);
				const nextLibrary = addLocalBuild(localLibrary, {
					name: file.name.replace(/\.json$/iu, ''),
					state
				});
				persistLocalLibrary(nextLibrary);
				openLocalBuild(nextLibrary.activeBuildId);
				showWorkbenchApplyNotice('Build backup imported.');
				return;
			} catch {
				storageError = 'This file is not a valid build or build-library backup.';
			}
		}
	}

	function applyScreenshotImportResult(nextStats: UiStats, notice: string) {
		calculator.stats = nextStats;
		clearDraftsForPanel('base');
		showWorkbenchApplyNotice(notice);
	}

	function showWorkbenchApplyNotice(message: string) {
		workbenchApplyNotice = message;
		if (workbenchApplyNoticeTimeout !== null) {
			window.clearTimeout(workbenchApplyNoticeTimeout);
		}
		workbenchApplyNoticeTimeout = window.setTimeout(() => {
			workbenchApplyNotice = '';
			workbenchApplyNoticeTimeout = null;
		}, 7000);
	}

	function clearWorkbenchApplyNotice() {
		workbenchApplyNotice = '';
		if (workbenchApplyNoticeTimeout === null) return;
		window.clearTimeout(workbenchApplyNoticeTimeout);
		workbenchApplyNoticeTimeout = null;
	}

	function consumeGearComparisonFragment() {
		const fragmentParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
		if (!fragmentParams.has(LT_GEAR_FRAGMENT_PARAM)) return;

		const payload = parseGearComparisonFragment(window.location.hash);
		fragmentParams.delete(LT_GEAR_FRAGMENT_PARAM);
		const cleanUrl = new URL(window.location.href);
		cleanUrl.hash = fragmentParams.toString();
		replaceState(
			resolve(`/${cleanUrl.search}${cleanUrl.hash}` as '/'),
			window.history.state ?? {}
		);

		if (!payload) {
			showWorkbenchApplyNotice('Gear comparison link could not be imported.');
			return;
		}

		pendingGearImports = payload.candidates;
		processPendingGearImports();
	}

	function processPendingGearImports() {
		while (pendingGearImports.length > 0) {
			const target = findFirstEmptyChangeTarget(calculator);
			if (!target) {
				gearImportOpen = true;
				return;
			}

			applyGearComparisonCandidate(pendingGearImports[0], target);
			pendingGearImports = pendingGearImports.slice(1);
		}

		gearImportOpen = false;
	}

	function applyGearComparisonCandidate(candidate: GearComparisonCandidate, target: ChangeTarget) {
		calculator = mergeGearComparisonCandidate(calculator, candidate, target);
		clearDraftsForPanel(target);
		const skipped = candidate.omitted.length;
		const skippedText = skipped === 0
			? ''
			: ` ${skipped} unsupported ${skipped === 1 ? 'stat was' : 'stats were'} skipped.`;
		showWorkbenchApplyNotice(
			`${candidate.item.pieceType} imported into Change ${target.toUpperCase()}.${skippedText}`
		);
	}

	function replaceChangeWithPendingGearImport(target: ChangeTarget) {
		if (!pendingGearImport) return;

		applyGearComparisonCandidate(pendingGearImport, target);
		pendingGearImports = pendingGearImports.slice(1);
		gearImportOpen = false;
		processPendingGearImports();
	}

	function cancelPendingGearImports() {
		pendingGearImports = [];
		gearImportOpen = false;
		showWorkbenchApplyNotice('Gear comparison import cancelled.');
	}

	function setBuffs(next: SelectedBuffs) {
		calculator.selectedBuffs = next;
	}

	function toneClass(value: string | undefined) {
		const tone = signedTone(value ?? '');
		const numericValue = tone === 'neutral' ? Number.NaN : Number((value ?? '').replace(/[^0-9.-]/g, ''));
		if (Number.isFinite(numericValue) && numericValue === 0) return 'text-muted-foreground';
		return tone === 'positive'
			? 'text-positive'
			: tone === 'negative'
				? 'text-negative'
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
		if (workspaceMode === 'live-edit') void saveLiveBuildNow();
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
		if (panelId === 'a') return 'text-comparison-a-foreground';
		if (panelId === 'b') return 'text-comparison-b-foreground';
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
		if (!isWinner) return 'border-border/70 bg-muted/35';
		return side === 'a'
			? 'border-chart-2/60 bg-chart-2/10'
			: 'border-chart-4/60 bg-chart-4/10';
	}

	function verdictBandClass(outcome: ChangeSummary['outcome']) {
		if (outcome === 'a') return 'verdict-band border-chart-2/50 bg-chart-2/10';
		if (outcome === 'b') return 'verdict-band border-chart-4/50 bg-chart-4/10';
		return 'verdict-band border-border/80 bg-muted/35';
	}

	function verdictBadgeClass(outcome: ChangeSummary['outcome']) {
		if (outcome === 'a') return 'border-chart-2/60 bg-chart-2/10';
		if (outcome === 'b') return 'border-chart-4/60 bg-chart-4/10';
		return 'border-border/80 bg-muted/60';
	}

	function verdictLabelClass(outcome: ChangeSummary['outcome']) {
		if (outcome === 'a') return 'text-comparison-a-foreground';
		if (outcome === 'b') return 'text-comparison-b-foreground';
		return 'text-foreground';
	}

	function deltaToneClass(value: number) {
		if (!Number.isFinite(value) || isDisplayedTie(value)) return 'text-muted-foreground';
		return value > 0 ? 'text-comparison-a-foreground' : 'text-comparison-b-foreground';
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

	const observePrimaryVerdict: Attachment<HTMLElement> = (node) => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) visiblePrimaryVerdicts.add(node);
				else visiblePrimaryVerdicts.delete(node);
			},
			{ threshold: 0.01 }
		);

		observer.observe(node);
		return () => {
			visiblePrimaryVerdicts.delete(node);
			observer.disconnect();
		};
	};

	function scrollToSection(id: string) {
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

<svelte:window ononline={handleOnline} onoffline={handleOffline} />
<svelte:document onvisibilitychange={handleVisibilityChange} />

<svelte:head>
	<title>LaTale Damage Calculator</title>
	<meta
		name="description"
		content="Personal LaTale damage calculator for stat, buff, and equivalence comparisons."
	/>
	{#if workspaceMode !== 'device'}
		<meta name="robots" content="noindex,nofollow" />
	{/if}
</svelte:head>

{#if liveSlug && jazzAuth.configured}
	{#key liveSlug}
		<LiveBuildSubscription
			slug={liveSlug}
			onRevision={handleLiveRevision}
			onUnavailable={handleLiveUnavailable}
			onError={(error) => handleLiveError(error, 'The live connection was interrupted.')}
		/>
	{/key}
{/if}

<input
	bind:this={backupInput}
	type="file"
	accept="application/json,.json"
	hidden
	aria-label="Import build backup"
	onchange={importBackupFile}
/>

{#if storageError && !storageErrorDismissed && !readOnlyWorkspace}
	<div class="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl">
		<Alert.Root variant="destructive" class="shadow-lg">
			<AlertTriangleIcon />
			<Alert.Title>Changes are not being saved on this device</Alert.Title>
			<Alert.Description>{storageError}</Alert.Description>
			<div class="col-span-full mt-3 flex flex-wrap gap-2">
				<Button size="sm" variant="outline" onclick={retryLocalSave}>Retry save</Button>
				<Button size="sm" variant="outline" onclick={exportBuildLibrary}>Export backup</Button>
				<Button size="sm" variant="ghost" onclick={() => (storageErrorDismissed = true)}>Dismiss</Button>
			</div>
		</Alert.Root>
	</div>
{/if}

{#if sharingError && readOnlyWorkspace && !snapshotNeedsFrozenResults}
	<div class="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl">
		<Alert.Root variant={sharedWorkspaceReady ? 'default' : 'destructive'} class="shadow-lg">
			<AlertTriangleIcon />
			<Alert.Title>{sharedWorkspaceReady ? 'Shared build notice' : 'Shared build unavailable'}</Alert.Title>
			<Alert.Description>{sharingError}</Alert.Description>
			<div class="col-span-full mt-3 flex flex-wrap gap-2">
				{#if liveSlug && !liveBuild}
					<Button size="sm" variant="outline" onclick={retrySharing}>Retry</Button>
				{/if}
				<Button size="sm" onclick={openMyDrafts}>Open my drafts</Button>
			</div>
		</Alert.Root>
	</div>
{/if}

{#if snapshotNeedsFrozenResults && snapshotFrozenSummary && snapshotEnvelope}
	<section
		class={`relative z-40 mx-auto w-full max-w-4xl px-4 ${snapshotFrozenOnly ? 'flex min-h-dvh items-center py-12' : 'pt-6'}`}
		aria-labelledby="frozen-snapshot-title"
	>
		<Card.Root class="w-full shadow-xl">
			<Card.Header>
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
						Author's frozen snapshot
					</p>
					<Card.Title id="frozen-snapshot-title" class="mt-1 text-xl">
						{snapshotEnvelope.title}
					</Card.Title>
					<Card.Description class="mt-1">
						{snapshotFrozenSummary.target.label} · saved {new Date(snapshotEnvelope.createdAt).toLocaleString()}
					</Card.Description>
				</div>
				<Card.Action><Badge variant="secondary">Frozen results</Badge></Card.Action>
			</Card.Header>
			<Card.Content class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{#each [
					['Base', snapshotFrozenSummary.results.base.avg],
					['With buffs', snapshotFrozenSummary.results.buffed.avg],
					['Change A + buffs', snapshotFrozenSummary.results.buffedA.avg],
					['Change B + buffs', snapshotFrozenSummary.results.buffedB.avg]
				] as result (result[0])}
					<div class="rounded-xl border bg-muted/30 p-3">
						<p class="text-xs text-muted-foreground">{result[0]}</p>
						<p class="mt-1 text-lg font-semibold tabular-nums">{result[1]}</p>
					</div>
				{/each}
			</Card.Content>
			{#if snapshotCompatibility?.warnings.length}
				<p class="px-6 text-sm text-muted-foreground">
					{snapshotCompatibility.warnings.join(' ')}
				</p>
			{/if}
			<Card.Footer class="flex-wrap gap-2">
				{#if snapshotInputsLoaded}
					<Button variant="outline" onclick={() => scrollToSection('calculator-workspace')}>
						View inputs recalculated today
					</Button>
				{/if}
				<Button onclick={openMyDrafts}>Open my drafts</Button>
			</Card.Footer>
		</Card.Root>
	</section>
{/if}

{#if workspaceMode !== 'device' && sharedWorkspaceReady}
	<div class="fixed inset-x-3 bottom-3 z-50 mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-center gap-2 rounded-xl border bg-popover/95 p-2.5 text-popover-foreground shadow-xl backdrop-blur">
		<Badge variant={workspaceMode === 'live-edit' ? 'secondary' : 'outline'}>
			{sharingStatus.label}
		</Badge>
		<span class="max-w-64 truncate text-sm font-medium">{displayedBuildTitle}</span>
		{#if canForkSharedWorkspace}
			<Button size="sm" onclick={forkCurrentToDrafts}>
				<GitForkIcon data-icon="inline-start" />
				Fork to my drafts
			</Button>
		{/if}
		<Button size="sm" variant="outline" onclick={openMyDrafts}>Open my drafts</Button>
		{#if workspaceMode === 'live-edit'}
			<Button size="sm" variant="ghost" onclick={() => (buildsSharingOpen = true)}>Share controls</Button>
		{/if}
	</div>
{/if}

{#if liveConflict}
	<div class="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl">
		<Alert.Root variant="destructive" class="shadow-lg">
			<AlertTriangleIcon />
			<Alert.Title>These edits conflict with another editor</Alert.Title>
			<Alert.Description>{sharingError}</Alert.Description>
			<div class="col-span-full mt-3 flex flex-wrap gap-2">
				<Button size="sm" variant="outline" onclick={loadSharedConflictVersion}>Load shared version</Button>
				<Button size="sm" onclick={forkCurrentToDrafts}>Fork my edits</Button>
			</div>
		</Alert.Root>
	</div>
{/if}

{#if !snapshotFrozenOnly}
<main id="calculator-workspace" class="adventure-shell min-h-dvh text-foreground" inert={readOnlyWorkspace}>
	<ClassArtRail
		art={selectedClassArt}
		selectedPreset={selectedClassPreset}
		customized={classPresetCustomized}
		announcement={classPresetStatus}
		onChoose={openClassPresetPicker}
	/>

	<div class="calculator-stage min-w-0">
	<header class="fantasy-header sticky top-0 z-30 border-b">
		<div class="mx-auto flex max-w-[1760px] flex-col gap-3 px-4 py-3 lg:px-6 lg:py-3.5">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex min-w-0 items-center gap-3">
					<img src={favicon} alt="" class="brand-emblem size-11 shrink-0 rounded-xl object-contain" />
					<div class="min-w-0">
						<div class="brand-kicker">Adventurer's field guide</div>
						<h1 class="brand-title mt-1 truncate text-lg sm:text-xl">LaTale Damage Calculator</h1>
						<div class="brand-meta mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
							<span class="max-w-48 truncate font-medium text-foreground">{displayedBuildTitle}</span>
							<span>{sharingStatus.label}</span>
							<span>{TARGETS[report.settings.target].label}</span>
							<span>Boss {formatPercent(report.settings.bossWeight)}</span>
							<span>Buffs {activeBuffCount}</span>
						</div>
					</div>
				</div>

				<Tooltip.Provider delayDuration={120}>
					<div class="header-actions flex flex-wrap items-center justify-end gap-2">
						<Badge variant="secondary" class="status-chip status-chip-base">
							<TargetIcon data-icon="inline-start" />
							{report.formatted.base.avg}
						</Badge>
						<Badge class="status-chip status-chip-gain">
							<SparklesIcon data-icon="inline-start" />
							{formatDisplayIncrease(report.raw.buffIncrease.avg)}
						</Badge>
						{#if showStickyVerdict && changeSummary}
							<Badge variant="outline" class={`status-chip ${verdictBadgeClass(changeSummary.outcome)}`}>
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
										aria-label="Builds and sharing"
										onclick={() => (buildsSharingOpen = true)}
									>
										<DatabaseIcon />
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom" sideOffset={6}>Builds &amp; sharing</Tooltip.Content>
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

	<section class="workspace-grid mx-auto grid max-w-[1760px] min-w-0 gap-4 px-4 py-5 lg:px-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
		<section class="game-panel workbench-panel min-w-0 overflow-hidden border">
			<div class="game-panel-header flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
				<div class="flex min-w-0 flex-wrap items-center gap-2">
					<BarChart3Icon class="size-4 text-primary" />
					<h2 class="text-sm font-semibold">Stat Workbench</h2>
					{#if workbenchApplyNotice}
						<Badge variant="secondary" class="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">
							<CheckIcon data-icon="inline-start" />
							{workbenchApplyNotice}
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
										<span class="absolute -right-1 -top-1 grid size-4 place-items-center rounded-sm border border-chart-4/50 bg-card text-[9px] font-semibold text-comparison-b-foreground">
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
							<span class="absolute -right-1 -top-1 hidden size-4 place-items-center rounded-sm border border-chart-2/50 bg-card text-[9px] font-semibold text-comparison-a-foreground max-sm:grid">
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
							<span class="absolute -right-1 -top-1 hidden size-4 place-items-center rounded-sm border border-chart-4/50 bg-card text-[9px] font-semibold text-comparison-b-foreground max-sm:grid">
								B
							</span>
						</Button>
					</div>
				</Tooltip.Provider>
			</div>

			{#if changeSummary}
				<div
					{@attach observePrimaryVerdict}
					class={`grid grid-cols-2 gap-x-4 gap-y-2 border-b px-4 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem] sm:items-center xl:hidden ${verdictBandClass(changeSummary.outcome)}`}
				>
					<div class="col-span-2 min-w-0 sm:col-span-1">
						<div class="text-xs font-semibold">{changeSummary.label}</div>
						<div class={`mt-0.5 truncate text-[11px] tabular-nums ${verdictLabelClass(changeSummary.outcome)}`}>
							{changeSummary.detail}
						</div>
					</div>
					<div class="min-w-0 border-l border-chart-2/50 pl-3">
						<div class="text-[10px] font-semibold text-comparison-a-foreground">A weighted gain</div>
						<div class={`${activeTone(formatDisplayIncrease(report.raw.buffedIncreaseA.avg))} mt-0.5 truncate text-xs`}>
							{formatDisplayIncrease(report.raw.buffedIncreaseA.avg)}
						</div>
					</div>
					<div class="min-w-0 border-l border-chart-4/50 pl-3">
						<div class="text-[10px] font-semibold text-comparison-b-foreground">B weighted gain</div>
						<div class={`${activeTone(formatDisplayIncrease(report.raw.buffedIncreaseB.avg))} mt-0.5 truncate text-xs`}>
							{formatDisplayIncrease(report.raw.buffedIncreaseB.avg)}
						</div>
					</div>
				</div>
			{/if}

			<div class="workbench-table workbench-mobile md:hidden">
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

			<div class="workbench-table workbench-desktop hidden overflow-x-auto md:block">
				<div class="min-w-[720px]">
					<div
						class="grid grid-cols-[8.5rem_repeat(4,minmax(4.5rem,1fr))_minmax(7rem,0.85fr)_repeat(2,minmax(4.5rem,1fr))] border-b border-border bg-muted/60 text-xs font-medium text-muted-foreground"
					>
						<div class="sticky left-0 z-20 row-span-2 flex items-center border-r border-border/70 bg-muted px-3 py-2">
							Stat
						</div>
						<div class="col-span-2 border-r border-border/70 px-2 py-1.5 text-center">Base</div>
						<div class="col-span-2 border-r border-chart-2/40 bg-chart-2/10 px-2 py-1.5 text-center text-comparison-a-foreground">
							Change A
						</div>
						<div class="row-span-2 flex items-center justify-center border-r border-border/70 px-2 py-2 text-center">
							Impact
						</div>
						<div class="col-span-2 bg-chart-4/10 px-2 py-1.5 text-center text-comparison-b-foreground">Change B</div>
						<div class="border-r border-border/70 px-2 py-1.5 text-right">Flat</div>
						<div class="border-r border-border/70 px-2 py-1.5 text-right">%</div>
						<div class="border-r border-chart-2/40 px-2 py-1.5 text-right">Flat</div>
						<div class="border-r border-chart-2/40 px-2 py-1.5 text-right">%</div>
						<div class="border-r border-chart-4/40 px-2 py-1.5 text-right">Flat</div>
						<div class="px-2 py-1.5 text-right">%</div>
					</div>

					{#each STAT_GROUPS as group (group.label)}
						<div class="grid grid-cols-[8.5rem_repeat(4,minmax(4.5rem,1fr))_minmax(7rem,0.85fr)_repeat(2,minmax(4.5rem,1fr))]">
							<div class="col-span-8 border-b border-border/80 bg-muted/35 px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
								{group.label}
							</div>
							{#each group.keys as key (key)}
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

		<aside class="grid min-w-0 gap-4 xl:self-start">
			<section class="game-panel result-panel min-w-0 border">
				<div class="game-panel-header flex items-center justify-between gap-2 border-b px-4 py-2.5">
					<div class="flex items-center gap-2">
						<GaugeIcon class="size-4 text-primary" />
						<h2 class="text-sm font-semibold">Outcome</h2>
					</div>
					<Badge variant="outline">{report.formatted.base.avg}</Badge>
				</div>
				{#if changeSummary}
					<div
						{@attach observePrimaryVerdict}
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
					<div class="result-body flex flex-col gap-4 p-4">
						<div class="result-grid grid grid-cols-2">
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
									{#each COMPARISON_METRICS as metric (metric.id)}
										<div class="px-0.5 text-center text-[11px] font-medium text-muted-foreground">
											{metric.label}
										</div>
									{/each}
									{#each comparisonMatrixRows as row (row.id)}
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
										{#each row.metrics as cell (cell.id)}
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
								{#each comparisonDeltas as delta (delta.id)}
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

			<section id="parameters" class="game-panel settings-panel min-w-0 border">
				<div class="game-panel-header flex items-center gap-2 border-b px-4 py-2.5">
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
										{@attach classPresetTriggerAttachment}
										id="class-preset"
										variant="outline"
										role="combobox"
										aria-expanded={classPresetOpen}
										class="w-full justify-between px-3 font-normal"
									>
										<span class="truncate">{selectedClassPreset ?? 'Custom'}</span>
										{#if classPresetCustomized}
											<Badge variant="secondary" class="class-preset-tuned">Tuned</Badge>
										{/if}
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
										<Command.Group heading="Available classes">
											{#each Object.keys(CLASS_PRESETS) as preset (preset)}
												<Command.Item
													value={preset}
													class="[&_.cn-command-item-indicator]:hidden"
													data-selected-class={selectedClassPreset === preset ? '' : undefined}
													onSelect={() => selectClassPreset(preset)}
												>
													<span class="min-w-0 flex-1 truncate">{preset}</span>
													<CheckIcon
														class={`ml-auto size-4 shrink-0 ${selectedClassPreset === preset ? 'opacity-100' : 'opacity-0'}`}
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
								{#each Object.entries(TARGETS) as [key, target] (key)}
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
						{#each QUICK_FACTOR_PRESETS as preset (preset.label)}
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

	<section class="workspace-grid mx-auto grid max-w-[1760px] min-w-0 gap-4 px-4 pb-8 lg:px-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
		<section id="equivalence" class="game-panel equivalence-panel min-w-0 border">
			<div class="game-panel-header flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
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
			<section class="game-panel ledger-panel min-w-0 border">
				<div class="game-panel-header flex items-center justify-between gap-2 border-b px-4 py-2.5">
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
							{#each buffDeltaRows as row (row.key)}
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
	</div>
</main>
{/if}

<Sheet.Root bind:open={buffsOpen}>
	<Sheet.Content side="right" class="data-[side=right]:w-[min(100vw,54rem)] data-[side=right]:sm:max-w-none overflow-y-auto p-0">
		<Sheet.Header class="fantasy-sheet-header border-b border-border/80 px-5 py-4">
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
				{#each Object.keys(buffs) as tier (tier)}
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
				{#each Object.entries(buffs) as [tierName, tier] (tierName)}
					<section>
						<div class="mb-3 flex items-center gap-3">
							<h3 class="text-sm font-semibold">{tierName}</h3>
							<div class="h-px flex-1 bg-border"></div>
						</div>
						<div class="grid gap-3 sm:grid-cols-2">
							{#each Object.entries(tier) as [groupName, group] (groupName)}
								{#if groupName === 'single'}
									{#each Object.entries(group) as [buffName, buffStats] (buffName)}
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
											{#each Object.keys(group) as buffName (buffName)}
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
		<Sheet.Header class="fantasy-sheet-header border-b border-border/80 px-5 py-4">
			<Sheet.Title>Equivalence</Sheet.Title>
		</Sheet.Header>
		<div class="p-5">
			{@render equivalencePanel('sheet')}
		</div>
	</Sheet.Content>
</Sheet.Root>

<Sheet.Root bind:open={auditOpen}>
	<Sheet.Content side="right" class="data-[side=right]:w-[min(100vw,34rem)] data-[side=right]:sm:max-w-none overflow-y-auto p-0">
		<Sheet.Header class="fantasy-sheet-header border-b border-border/80 px-5 py-4">
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
						{#each STAT_KEYS as key (key)}
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
					{#each ENEMY_TYPES as enemy (enemy)}
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

<Sheet.Root bind:open={gearImportOpen}>
	<Sheet.Content side="right" class="data-[side=right]:w-[min(100vw,30rem)] data-[side=right]:sm:max-w-none overflow-y-auto p-0">
		<Sheet.Header class="fantasy-sheet-header border-b border-border/80 px-5 py-4">
			<Sheet.Title>Import gear comparison</Sheet.Title>
			<Sheet.Description>
				Both comparison columns already contain values. Choose which one to replace.
			</Sheet.Description>
		</Sheet.Header>

		{#if pendingGearImport}
			<div class="flex flex-col gap-5 p-5">
				<div class="flex flex-col gap-2">
					<div class="flex flex-wrap items-center gap-2">
						<Badge variant="secondary">{pendingGearImport.item.pieceType}</Badge>
						{#if pendingGearImport.item.enchantLevel !== undefined}
							<Badge variant="outline">Lv. {pendingGearImport.item.enchantLevel}</Badge>
						{/if}
					</div>
					<p class="text-sm font-medium">{pendingGearImport.label}</p>
					<p class="text-sm text-muted-foreground">
						Your base stats, buffs, class preset, settings, and the other comparison column will stay unchanged.
					</p>
				</div>

				{#if pendingGearImport.omitted.length > 0}
					<div class="flex flex-col gap-2 rounded-md border border-border/80 bg-muted/30 p-3">
						<p class="text-sm font-medium">Not modeled by this calculator</p>
						<p class="text-sm text-muted-foreground">
							{pendingGearImport.omitted.map((line) => line.stat).join(', ')}
						</p>
					</div>
				{/if}

				<div class="flex flex-wrap gap-2">
					<Button onclick={() => replaceChangeWithPendingGearImport('a')}>
						Replace Change A
					</Button>
					<Button variant="secondary" onclick={() => replaceChangeWithPendingGearImport('b')}>
						Replace Change B
					</Button>
					<Button variant="outline" onclick={cancelPendingGearImports}>
						Cancel
					</Button>
				</div>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>

<BuildsSharingSheet
	bind:open={buildsSharingOpen}
	bind:recoveryDialogOpen
	builds={buildSummaries}
	activeBuildId={localLibrary.activeBuildId}
	mode={workspaceMode}
	liveShare={liveShareSummary}
	{snapshotUrl}
	{recoveryPhrase}
	status={sharingStatus}
	error={sharingError ?? storageError}
	onSelectBuild={openLocalBuild}
	onCreateBuild={createDeviceBuild}
	onRenameBuild={renameDeviceBuild}
	onDuplicateBuild={duplicateDeviceBuild}
	onDeleteBuild={deleteDeviceBuild}
	onResetBuild={resetDeviceBuild}
	onCreateSnapshot={createSnapshotLink}
	onCreateLiveShare={readOnlyWorkspace ? undefined : createCurrentLiveShare}
	onPinLiveShare={pinCurrentLiveShare}
	onRotateEditLink={rotateCurrentEditLink}
	onStopLiveShare={stopCurrentLiveShare}
	onExportCurrent={exportCurrentBuild}
	onExportLibrary={exportBuildLibrary}
	onImportBackup={requestBackupImport}
	onRestoreIdentity={restoreLiveShareIdentity}
	onAcknowledgeRecoveryPhrase={acknowledgeRecoveryPhrase}
	onForkToDrafts={forkCurrentToDrafts}
	onOpenDrafts={openMyDrafts}
	onRetry={retryPersistence}
/>

<AlertDialog.Root bind:open={editLinkConfirmOpen} onOpenChange={handleEditLinkDialogChange}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Edit shared build?</AlertDialog.Title>
			<AlertDialog.Description>
				Changes will sync to everyone using this live build. You can fork an independent device
				copy at any time.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={declineEditLink}>View only</AlertDialog.Cancel>
			<Button disabled={liveSyncState === 'syncing'} onclick={acceptEditLink}>
				{liveSyncState === 'syncing' ? 'Opening…' : 'Open for editing'}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

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
		{#each STAT_GROUPS as group (group.label)}
			<div class="grid grid-cols-[minmax(0,1fr)_6rem_4.75rem]">
				<div class="col-span-3 border-y border-border/70 bg-background/70 px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
					{group.label}
				</div>
				{#each group.keys as key (key)}
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
	<div class="stat-gem min-w-0">
		<div class="stat-gem-label text-muted-foreground">{label}</div>
		<div class="stat-gem-value mt-1.5 truncate text-base tabular-nums">{value}</div>
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
			{#each options as option (option)}
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
	<div class="rune-table overflow-hidden border">
		<Table.Table>
			<Table.TableHeader>
				<Table.TableRow>
					<Table.TableHead>Stat</Table.TableHead>
					<Table.TableHead class="text-right">{valueHeading}</Table.TableHead>
					<Table.TableHead class="text-right">{percentHeading}</Table.TableHead>
				</Table.TableRow>
			</Table.TableHeader>
			<Table.TableBody>
				{#each STAT_KEYS as key (key)}
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
