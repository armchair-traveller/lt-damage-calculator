import { classifyDisplayedComparison } from './comparison.js';

export const COMPARISON_METRICS = [
	{ id: 'avg', label: 'Avg' },
	{ id: 'normal', label: 'Normal' },
	{ id: 'boss', label: 'Boss' }
] as const;

export type ComparisonMetricId = (typeof COMPARISON_METRICS)[number]['id'];
export type ComparisonSide = 'a' | 'b';
export type MetricValues<T> = Record<ComparisonMetricId, T>;
export type ComparisonRank = {
	rank: number;
	isBest: boolean;
	isTiedBest: boolean;
	margin: number;
	marginValueLabel: string;
};
export type ComparisonPanelInput = {
	id: ComparisonSide;
	label: string;
	shortLabel: string;
	buffedDamage: MetricValues<string>;
	buffedIncrease: MetricValues<string>;
	rawBuffedIncrease: MetricValues<number>;
	rawIncrease: number;
	rawDamage: number;
};
export type RankedComparisonPanel = ComparisonPanelInput & ComparisonRank;
export type SummaryComparisonPanel = {
	id: ComparisonSide;
	shortLabel: string;
	buffedIncrease: MetricValues<string>;
	isBest: boolean;
	isTiedBest: boolean;
	marginValueLabel: string;
	margin: number;
};
export type ChangeSummary = {
	outcome: ComparisonSide | 'tie';
	label: string;
	value: string;
	detail: string;
	stickyLabel: string;
};

export function formatDisplayIncrease(value: number) {
	if (!Number.isFinite(value)) return '---';
	const sign = value >= 0 ? '+' : '';
	return `${sign}${(value * 100).toFixed(3)}%`;
}

export function formatMetricIncreases(values: MetricValues<number>): MetricValues<string> {
	return {
		avg: formatDisplayIncrease(values.avg),
		normal: formatDisplayIncrease(values.normal),
		boss: formatDisplayIncrease(values.boss)
	};
}

export function formatPointDelta(value: number) {
	if (!Number.isFinite(value)) return '---';
	return `${formatPointDeltaValue(value)} pp`;
}

export function formatPointDeltaValue(value: number) {
	if (!Number.isFinite(value)) return '---';
	if (classifyDisplayedComparison(value, 0) === 'tie') return '0.000';
	const sign = value > 0 ? '+' : '';
	return `${sign}${(value * 100).toFixed(3)}`;
}

function sortableScore(value: number) {
	if (value === Infinity) return Number.MAX_SAFE_INTEGER;
	if (value === -Infinity) return Number.MIN_SAFE_INTEGER;
	return Number.isFinite(value) ? value : Number.MIN_SAFE_INTEGER;
}

export function rankComparisonPanels<T extends { rawIncrease: number; rawDamage: number }>(
	panels: T[]
): Array<T & ComparisonRank> {
	const sorted = [...panels].sort(
		(a, b) =>
			sortableScore(b.rawIncrease) - sortableScore(a.rawIncrease) ||
			sortableScore(b.rawDamage) - sortableScore(a.rawDamage)
	);
	const leader = sorted[0];
	const runnerUp = sorted[1];
	const isTie =
		leader && runnerUp
			? classifyDisplayedComparison(leader.rawIncrease, runnerUp.rawIncrease) === 'tie'
			: false;

	return panels.map((panel) => {
		const rank = sorted.findIndex((candidate) => candidate === panel) + 1;
		const isLeader = panel === leader;
		const isBest = isLeader && !isTie;
		const isTiedBest =
			Boolean(leader) &&
			isTie &&
			classifyDisplayedComparison(panel.rawIncrease, leader.rawIncrease) === 'tie';
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
			marginValueLabel: formatPointDeltaValue(margin)
		};
	});
}

export function summarizeChangeComparison(
	panels: SummaryComparisonPanel[]
): ChangeSummary | undefined {
	const leaders = panels.filter((panel) => panel.isBest || panel.isTiedBest);
	const leader = leaders[0];
	if (!leader) return undefined;
	if (leaders.length > 1) {
		return {
			outcome: 'tie',
			label: 'A and B are even overall',
			value: leader.buffedIncrease.avg,
			detail: 'Same weighted average gain',
			stickyLabel: 'A = B'
		};
	}

	const other = panels.find((panel) => panel.id !== leader.id);
	return {
		outcome: leader.id,
		label: `${leader.shortLabel} leads overall`,
		value: leader.buffedIncrease.avg,
		detail: other ? `${leader.marginValueLabel} pp over ${other.shortLabel}` : 'Weighted average leader',
		stickyLabel: other
			? `${leader.shortLabel} leads ${leader.marginValueLabel} pp`
			: `${leader.shortLabel} leads`
	};
}

export function metricWinner(
	panels: RankedComparisonPanel[],
	metric: ComparisonMetricId
): ComparisonSide | 'tie' | undefined {
	const a = panels.find((panel) => panel.id === 'a');
	const b = panels.find((panel) => panel.id === 'b');
	if (!a || !b) return undefined;
	const comparison = classifyDisplayedComparison(a.rawBuffedIncrease[metric], b.rawBuffedIncrease[metric]);
	return comparison === 'none' ? undefined : comparison;
}

export function buildComparisonMatrixRows(panels: RankedComparisonPanel[]) {
	return panels.map((panel) => ({
		id: panel.id,
		label: panel.shortLabel,
		metrics: COMPARISON_METRICS.map((metric) => {
			const winner = metricWinner(panels, metric.id);
			return {
				id: metric.id,
				label: metric.label,
				gain: panel.buffedIncrease[metric.id],
				damage: panel.buffedDamage[metric.id],
				isWinner: winner === panel.id
			};
		})
	}));
}

export function buildComparisonDeltas(panels: RankedComparisonPanel[]) {
	const a = panels.find((panel) => panel.id === 'a');
	const b = panels.find((panel) => panel.id === 'b');
	if (!a || !b) return [];

	return COMPARISON_METRICS.map((metric) => {
		const value = a.rawBuffedIncrease[metric.id] - b.rawBuffedIncrease[metric.id];
		return {
			id: metric.id,
			label: metric.label,
			value,
			valueLabel: formatPointDelta(value)
		};
	});
}
