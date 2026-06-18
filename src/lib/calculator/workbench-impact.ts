import { classifyDisplayedComparison } from './comparison.js';
import { formatPointDelta, type ComparisonSide } from './comparison-view.js';
import {
	calculateDashboard,
	clearUiStats,
	PERCENTLESS_STATS,
	STAT_KEYS,
	type CalculatorState,
	type StatKey,
	type UiStats
} from './model.js';

export const INPUT_EPSILON = 0.0000000001;
const MIN_DELTA_SCALE = 0.0001;

export type WorkbenchPanelId = 'base' | ComparisonSide;
export type WorkbenchImpactRow = {
	key: StatKey;
	aImpact: number;
	bImpact: number;
	delta: number;
	hasInput: boolean;
	winner: ComparisonSide | 'tie' | 'empty';
	summary: string;
};
export type WorkbenchCellImpact = {
	id: string;
	panelId: ComparisonSide;
	key: StatKey;
	index: 0 | 1;
	value: number;
};

export function sanitizeNumericText(value: string) {
	return value.replace(/[,%\s]/g, '').replace(/^\+/, '');
}

export function cleanNumericText(value: string) {
	return sanitizeNumericText(value);
}

export function hasInputValue(value: string | undefined) {
	return cleanNumericText(value ?? '') !== '';
}

export function isInvalidNumericText(value: string | undefined) {
	const cleaned = cleanNumericText(value ?? '');
	return cleaned !== '' && !Number.isFinite(Number(cleaned));
}

export function isNonZeroValue(value: string | undefined) {
	const cleaned = cleanNumericText(value ?? '');
	const parsed = Number(cleaned);
	return Number.isFinite(parsed) && Math.abs(parsed) > INPUT_EPSILON;
}

export function panelHasEnteredValues(stats: UiStats) {
	return STAT_KEYS.some((key) => hasInputValue(stats[key][0]) || hasInputValue(stats[key][1]));
}

export function panelHasMeaningfulChanges(stats: UiStats) {
	return STAT_KEYS.some((key) => isNonZeroValue(stats[key][0]) || isNonZeroValue(stats[key][1]));
}

export function cellImpactId(panelId: ComparisonSide, key: StatKey, index: 0 | 1) {
	return `${panelId}-${key}-${index}`;
}

export function comparisonDeltaScale(values: Array<{ value?: number; delta?: number }>) {
	return Math.max(
		MIN_DELTA_SCALE,
		...values.map((item) => Math.abs(item.delta ?? item.value ?? 0))
	);
}

function singleStatChanges(stats: UiStats, key: StatKey): UiStats {
	const changes = clearUiStats();
	changes[key] = [stats[key][0], stats[key][1]];
	return changes;
}

export function buildWorkbenchImpactRows(state: CalculatorState): WorkbenchImpactRow[] {
	return STAT_KEYS.map((key) => {
		const scopedReport = calculateDashboard({
			...state,
			statsA: singleStatChanges(state.statsA, key),
			statsB: singleStatChanges(state.statsB, key)
		});
		const aImpact = scopedReport.raw.buffedIncreaseA.avg;
		const bImpact = scopedReport.raw.buffedIncreaseB.avg;
		const delta = aImpact - bImpact;
		const hasInput =
			isNonZeroValue(state.statsA[key][0]) ||
			isNonZeroValue(state.statsA[key][1]) ||
			isNonZeroValue(state.statsB[key][0]) ||
			isNonZeroValue(state.statsB[key][1]);
		const comparison = classifyDisplayedComparison(aImpact, bImpact, hasInput);
		const winner = comparison === 'none' ? 'empty' : comparison;
		const winningImpact = winner === 'a' ? aImpact : winner === 'b' ? bImpact : Number.NaN;

		return {
			key,
			aImpact,
			bImpact,
			delta,
			hasInput,
			winner,
			summary:
				winner === 'empty'
					? 'No change'
					: winner === 'tie'
						? 'Even'
						: `${winner.toUpperCase()} ${formatPointDelta(winningImpact)}`
		};
	});
}

function singleCellChanges(stats: UiStats, key: StatKey, index: 0 | 1): UiStats {
	const changes = clearUiStats();
	changes[key][index] = stats[key][index];
	return changes;
}

export function buildWorkbenchCellImpacts(state: CalculatorState): WorkbenchCellImpact[] {
	const panels = [
		{ panelId: 'a', stats: state.statsA },
		{ panelId: 'b', stats: state.statsB }
	] satisfies Array<{ panelId: ComparisonSide; stats: UiStats }>;
	const impacts: WorkbenchCellImpact[] = [];

	for (const { panelId, stats } of panels) {
		for (const key of STAT_KEYS) {
			for (const index of [0, 1] as const) {
				if (index === 1 && PERCENTLESS_STATS.has(key)) continue;
				if (!isNonZeroValue(stats[key][index])) continue;

				const scopedReport = calculateDashboard({
					...state,
					statsA: panelId === 'a' ? singleCellChanges(stats, key, index) : clearUiStats(),
					statsB: panelId === 'b' ? singleCellChanges(stats, key, index) : clearUiStats()
				});

				impacts.push({
					id: cellImpactId(panelId, key, index),
					panelId,
					key,
					index,
					value:
						panelId === 'a'
							? scopedReport.raw.buffedIncreaseA.avg
							: scopedReport.raw.buffedIncreaseB.avg
				});
			}
		}
	}

	return impacts;
}
