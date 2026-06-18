import { describe, expect, it } from 'vitest';
import {
	buildWorkbenchCellImpacts,
	buildWorkbenchImpactRows,
	cellImpactId,
	cleanNumericText,
	isInvalidNumericText,
	isNonZeroValue,
	panelHasEnteredValues,
	panelHasMeaningfulChanges
} from './workbench-impact.js';
import { createDefaultState } from './model.js';

describe('workbench impact model', () => {
	it('classifies numeric text and panel entry state', () => {
		const state = createDefaultState();

		expect(cleanNumericText('+1,234 %')).toBe('1234');
		expect(isInvalidNumericText('12x')).toBe(true);
		expect(isInvalidNumericText('12')).toBe(false);
		expect(panelHasEnteredValues(state.statsA)).toBe(false);
		expect(panelHasMeaningfulChanges(state.statsA)).toBe(false);

		state.statsA.attack[0] = '0';
		expect(panelHasEnteredValues(state.statsA)).toBe(true);
		expect(panelHasMeaningfulChanges(state.statsA)).toBe(false);

		state.statsA.attack[0] = '1000';
		expect(isNonZeroValue(state.statsA.attack[0])).toBe(true);
		expect(panelHasMeaningfulChanges(state.statsA)).toBe(true);
	});

	it('builds empty row summaries when no comparison changes are entered', () => {
		const rows = buildWorkbenchImpactRows(createDefaultState());

		expect(rows).toHaveLength(14);
		expect(rows.every((row) => row.hasInput === false)).toBe(true);
		expect(rows.every((row) => row.winner === 'empty')).toBe(true);
		expect(rows.every((row) => row.summary === 'No change')).toBe(true);
	});

	it('builds row summaries for entered A and B changes', () => {
		const state = createDefaultState();
		state.statsA.attack[0] = '1000';
		state.statsB.attack[0] = '500';

		const attackRow = buildWorkbenchImpactRows(state).find((row) => row.key === 'attack');

		expect(attackRow).toMatchObject({
			key: 'attack',
			hasInput: true,
			winner: 'a'
		});
		expect(attackRow?.summary).toMatch(/^A \+\d+\.\d{3} pp$/);
		expect(attackRow?.aImpact).toBeGreaterThan(attackRow?.bImpact ?? Infinity);
	});

	it('builds individual cell impacts only for meaningful editable cells', () => {
		const state = createDefaultState();
		state.statsA.attack[0] = '1000';
		state.statsA.attack[1] = '0';
		state.statsB.ratio[0] = '2';
		state.statsB.ratio[1] = '99';

		const impacts = buildWorkbenchCellImpacts(state);

		expect(impacts.map((impact) => impact.id)).toEqual([
			cellImpactId('a', 'attack', 0),
			cellImpactId('b', 'ratio', 0)
		]);
		expect(impacts[0]).toMatchObject({ panelId: 'a', key: 'attack', index: 0 });
		expect(impacts[1]).toMatchObject({ panelId: 'b', key: 'ratio', index: 0 });
		expect(impacts.every((impact) => Number.isFinite(impact.value))).toBe(true);
	});
});
