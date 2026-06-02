import { describe, expect, it } from 'vitest';
import {
	calculateDashboard,
	calculateEquivalenceTables,
	createDefaultState,
	parseStoredState,
	serializeState
} from './model.js';

describe('LaTale damage model regression', () => {
	it('preserves the legacy default damage results', () => {
		expect.assertions(8);
		const report = calculateDashboard(createDefaultState());

		expect(report.raw.base.normal).toBeCloseTo(28100085344.7563, 4);
		expect(report.raw.base.boss).toBeCloseTo(3791832205.937286, 4);
		expect(report.raw.base.avg).toBeCloseTo(15945958775.346794, 4);
		expect(report.raw.buffed.normal).toBeCloseTo(37245558420.85565, 4);
		expect(report.raw.buffed.boss).toBeCloseTo(5045155975.856831, 4);
		expect(report.formatted.base.normal).toBe('28b100m');
		expect(report.formatted.base.boss).toBe('3b792m');
		expect(report.formatted.buffIncrease.avg).toBe('+32.79966%');
	});

	it('preserves legacy equivalence output for the default buffed state', () => {
		expect.assertions(4);
		const equivalence = calculateEquivalenceTables(createDefaultState(), {
			perc: 1,
			critical: 10
		});

		expect(equivalence.percent.critical).toEqual(['66.18', '1.55%']);
		expect(equivalence.percent.strength).toEqual(['19498.13', '11.06%']);
		expect(equivalence.percent.normalAmp).toEqual(['3.31', 'N/A']);
		expect(equivalence.criticalIncrease).toBeCloseTo(0.15111321557298857, 12);
	});

	it('round-trips the normalized calculator state', () => {
		expect.assertions(1);
		const state = createDefaultState();
		expect(parseStoredState(serializeState(state))).toEqual(state);
	});
});
