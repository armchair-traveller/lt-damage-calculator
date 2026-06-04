export type DisplayedComparison = 'a' | 'b' | 'tie' | 'none';

// Gains are stored as ratios. This is half of 0.001 percentage point, the UI's displayed precision.
export const DISPLAYED_COMPARISON_EPSILON = 0.000005;

export function isDisplayedTie(delta: number) {
	return Number.isFinite(delta) && Math.abs(delta) < DISPLAYED_COMPARISON_EPSILON;
}

export function classifyDisplayedComparison(
	a: number,
	b: number,
	active = true
): DisplayedComparison {
	if (!active || Number.isNaN(a) || Number.isNaN(b)) return 'none';
	if (a === b || isDisplayedTie(a - b)) return 'tie';
	return a > b ? 'a' : 'b';
}
