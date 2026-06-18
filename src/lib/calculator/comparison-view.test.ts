import { describe, expect, it } from 'vitest';
import {
	buildComparisonDeltas,
	buildComparisonMatrixRows,
	formatMetricIncreases,
	rankComparisonPanels,
	summarizeChangeComparison,
	type ComparisonPanelInput
} from './comparison-view.js';

function panel(
	id: 'a' | 'b',
	rawIncrease: number,
	rawDamage: number,
	rawBuffedIncrease = { avg: rawIncrease, normal: rawIncrease, boss: rawIncrease }
): ComparisonPanelInput {
	const shortLabel = id.toUpperCase();
	return {
		id,
		label: `Changes ${shortLabel}`,
		shortLabel,
		buffedDamage: { avg: `${shortLabel} avg`, normal: `${shortLabel} normal`, boss: `${shortLabel} boss` },
		buffedIncrease: formatMetricIncreases(rawBuffedIncrease),
		rawBuffedIncrease,
		rawIncrease,
		rawDamage
	};
}

describe('comparison view model', () => {
	it('ranks A as the overall winner', () => {
		const ranked = rankComparisonPanels([panel('a', 0.12, 200), panel('b', 0.08, 300)]);
		const summary = summarizeChangeComparison(ranked);

		expect(ranked[0]).toMatchObject({ id: 'a', rank: 1, isBest: true, isTiedBest: false });
		expect(ranked[1]).toMatchObject({ id: 'b', rank: 2, isBest: false, isTiedBest: false });
		expect(summary).toMatchObject({
			outcome: 'a',
			label: 'A leads overall',
			detail: '+4.000 pp over B',
			stickyLabel: 'A leads +4.000 pp'
		});
	});

	it('ranks B as the overall winner', () => {
		const ranked = rankComparisonPanels([panel('a', 0.04, 300), panel('b', 0.09, 100)]);
		const summary = summarizeChangeComparison(ranked);

		expect(ranked[0]).toMatchObject({ id: 'a', rank: 2, isBest: false });
		expect(ranked[1]).toMatchObject({ id: 'b', rank: 1, isBest: true });
		expect(summary).toMatchObject({ outcome: 'b', label: 'B leads overall' });
	});

	it('marks display-precision ties without choosing a best panel', () => {
		const ranked = rankComparisonPanels([panel('a', 0.1, 200), panel('b', 0.100001, 300)]);
		const summary = summarizeChangeComparison(ranked);

		expect(ranked.map((item) => item.isBest)).toEqual([false, false]);
		expect(ranked.map((item) => item.isTiedBest)).toEqual([true, true]);
		expect(summary).toMatchObject({
			outcome: 'tie',
			label: 'A and B are even overall',
			detail: 'Same weighted average gain',
			stickyLabel: 'A = B'
		});
	});

	it('does not choose metric winners for NaN values', () => {
		const ranked = rankComparisonPanels([
			panel('a', 0.1, 100, { avg: Number.NaN, normal: Number.NaN, boss: Number.NaN }),
			panel('b', 0.2, 200, { avg: Number.NaN, normal: Number.NaN, boss: Number.NaN })
		]);

		expect(buildComparisonMatrixRows(ranked)[0].metrics.map((metric) => metric.isWinner)).toEqual([
			false,
			false,
			false
		]);
	});

	it('formats A minus B delta labels in percentage points', () => {
		const ranked = rankComparisonPanels([
			panel('a', 0.1, 100, { avg: 0.1, normal: 0.125, boss: 0.05 }),
			panel('b', 0.2, 200, { avg: 0.08, normal: 0.15, boss: 0.05 })
		]);

		const deltas = buildComparisonDeltas(ranked);

		expect(deltas.map((delta) => [delta.id, delta.label, delta.valueLabel])).toEqual([
			['avg', 'Avg', '+2.000 pp'],
			['normal', 'Normal', '-2.500 pp'],
			['boss', 'Boss', '0.000 pp']
		]);
		expect(deltas[0].value).toBeCloseTo(0.02, 12);
		expect(deltas[1].value).toBeCloseTo(-0.025, 12);
		expect(deltas[2].value).toBe(0);
	});
});
