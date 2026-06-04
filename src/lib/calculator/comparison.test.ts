import { describe, expect, it } from 'vitest';
import {
	classifyDisplayedComparison,
	DISPLAYED_COMPARISON_EPSILON,
	isDisplayedTie
} from './comparison.js';

describe('displayed comparison classification', () => {
	it('does not compare inactive values', () => {
		expect(classifyDisplayedComparison(0.1, 0.05, false)).toBe('none');
	});

	it('identifies A and B leaders', () => {
		expect(classifyDisplayedComparison(0.1, 0.05)).toBe('a');
		expect(classifyDisplayedComparison(-0.1, -0.05)).toBe('b');
	});

	it('identifies exact and display-precision ties', () => {
		expect(classifyDisplayedComparison(0.1, 0.1)).toBe('tie');
		expect(classifyDisplayedComparison(0.1, 0.1 - DISPLAYED_COMPARISON_EPSILON / 2)).toBe('tie');
	});

	it('chooses a leader at the display-precision boundary', () => {
		expect(isDisplayedTie(DISPLAYED_COMPARISON_EPSILON)).toBe(false);
		expect(classifyDisplayedComparison(0.1, 0.1 - DISPLAYED_COMPARISON_EPSILON)).toBe('a');
	});
});
