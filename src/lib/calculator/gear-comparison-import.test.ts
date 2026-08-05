import { describe, expect, it } from 'vitest';
import {
	candidateChangesToUiStats,
	findFirstEmptyChangeTarget,
	MAX_LT_GEAR_FRAGMENT_LENGTH,
	MAX_LT_GEAR_OMITTED_STATS,
	MAX_LT_GEAR_TEXT_LENGTH,
	mergeGearComparisonCandidate,
	normalizeGearComparisonPayload,
	parseGearComparisonFragment,
	type GearComparisonCandidate
} from './gear-comparison-import.js';
import { createDefaultState, STAT_KEYS } from './model.js';

function candidate(overrides: Partial<GearComparisonCandidate> = {}): GearComparisonCandidate {
	return {
		id: 'current',
		label: 'Current item',
		item: { gearType: 'weapon', pieceType: 'two-handed', enchantLevel: 7 },
		changes: {
			attack: [245, 21],
			minimum: [117, 0],
			maximum: [117, 0]
		},
		omitted: [{ stat: 'Accuracy', value: 211 }],
		...overrides
	};
}

function payload(candidates: unknown[] = [candidate()]) {
	return {
		kind: 'lt-gear-comparison',
		version: 1,
		source: 'lt-gear-score-calculator',
		candidates
	};
}

function fragment(value: unknown, prefix = '#') {
	return `${prefix}${new URLSearchParams({ ltgear: JSON.stringify(value) }).toString()}`;
}

describe('gear comparison fragment import', () => {
	it('parses the URLSearchParams-encoded fragment and normalizes sparse candidates', () => {
		const parsed = parseGearComparisonFragment(fragment(payload()));

		expect(parsed).toEqual(payload());
		expect(parsed?.candidates[0]).not.toBe(candidate());
		expect(parsed?.candidates[0].changes).toEqual({
			attack: [245, 21],
			minimum: [117, 0],
			maximum: [117, 0]
		});
		expect(parsed?.candidates[0].omitted).toEqual([{ stat: 'Accuracy', value: 211 }]);
	});

	it('accepts one or two candidates and a full URL containing the fragment', () => {
		const second = candidate({
			id: 'upgrade',
			label: 'Upgrade item',
			item: { gearType: 'armor', pieceType: 'gloves' },
			changes: { critical: [147, 9] },
			omitted: []
		});
		const fullUrl = fragment(payload([candidate(), second]), 'https://damage.example/calculator#');

		expect(parseGearComparisonFragment(fullUrl)?.candidates).toEqual([candidate(), second]);
	});

	it('returns null for absent, duplicated, malformed, or mismatched protocol payloads', () => {
		expect(parseGearComparisonFragment('#other=value')).toBeNull();
		expect(parseGearComparisonFragment('#ltgear=%7Bbad-json')).toBeNull();
		expect(parseGearComparisonFragment('#ltgear=%7B%7D&ltgear=%7B%7D')).toBeNull();
		expect(normalizeGearComparisonPayload({ ...payload(), kind: 'other' })).toBeNull();
		expect(normalizeGearComparisonPayload({ ...payload(), version: 2 })).toBeNull();
		expect(normalizeGearComparisonPayload({ ...payload(), source: 'other' })).toBeNull();
		expect(normalizeGearComparisonPayload(payload([]))).toBeNull();
		expect(normalizeGearComparisonPayload(payload([candidate(), candidate(), candidate()]))).toBeNull();
		expect(
			parseGearComparisonFragment(`#ltgear=${'x'.repeat(MAX_LT_GEAR_FRAGMENT_LENGTH)}`)
		).toBeNull();
	});

	it('rejects unknown stats and invalid or non-meaningful numeric pairs', () => {
		expect(
			normalizeGearComparisonPayload(
				payload([{ ...candidate(), changes: { accuracy: [100, 0] } }])
			)
		).toBeNull();
		expect(
			normalizeGearComparisonPayload(
				payload([{ ...candidate(), changes: { attack: [Number.NaN, 10] } }])
			)
		).toBeNull();
		expect(
			normalizeGearComparisonPayload(
				payload([{ ...candidate(), changes: { attack: [100, Number.POSITIVE_INFINITY] } }])
			)
		).toBeNull();
		expect(
			normalizeGearComparisonPayload(payload([{ ...candidate(), changes: { attack: [100] } }]))
		).toBeNull();
		expect(
			normalizeGearComparisonPayload(payload([{ ...candidate(), changes: { attack: ['100', 10] } }]))
		).toBeNull();
		expect(
			normalizeGearComparisonPayload(payload([{ ...candidate(), changes: { attack: [-1, 10] } }]))
		).toBeNull();
		expect(
			normalizeGearComparisonPayload(payload([{ ...candidate(), changes: { attack: [0, 0] } }]))
		).toBeNull();
		expect(normalizeGearComparisonPayload(payload([{ ...candidate(), changes: {} }]))).toBeNull();
		expect(
			normalizeGearComparisonPayload(payload([{ ...candidate(), changes: { ratio: [12, 1] } }]))
		).toBeNull();
		expect(
			normalizeGearComparisonPayload(payload([{ ...candidate(), changes: { ratio: [12, 0] } }]))
		).not.toBeNull();
	});

	it('validates candidate metadata and omitted lines without trusting extra fields', () => {
		const withExtras = {
			...candidate(),
			unexpected: 'discard me',
			item: { ...candidate().item, unexpected: 'discard me' },
			omitted: [{ stat: 'Accuracy', value: 211, unexpected: 'discard me' }]
		};
		const normalized = normalizeGearComparisonPayload(payload([withExtras]));

		expect(normalized?.candidates[0]).toEqual(candidate());
		expect(
			normalizeGearComparisonPayload(payload([{ ...candidate(), item: { gearType: '', pieceType: 'hat' } }]))
		).toBeNull();
		expect(
			normalizeGearComparisonPayload(
				payload([{ ...candidate(), item: { gearType: 'armor', pieceType: 'hat', enchantLevel: '7' } }])
			)
		).toBeNull();
		expect(
			normalizeGearComparisonPayload(
				payload([{ ...candidate(), omitted: [{ stat: 'Accuracy', value: Number.NaN }] }])
			)
		).toBeNull();
		expect(
			normalizeGearComparisonPayload(
				payload([{ ...candidate(), omitted: [{ stat: 'Accuracy', value: '211' }] }])
			)
		).toBeNull();
		expect(
			normalizeGearComparisonPayload(
				payload([{ ...candidate(), omitted: [{ stat: 'Accuracy', value: 0 }] }])
			)
		).toBeNull();
		expect(
			normalizeGearComparisonPayload(
				payload([{ ...candidate(), omitted: [{ stat: 'Accuracy', value: -1 }] }])
			)
		).toBeNull();
		expect(
			normalizeGearComparisonPayload(
				payload([{ ...candidate(), omitted: Array.from({ length: MAX_LT_GEAR_OMITTED_STATS + 1 }, (_, index) => ({ stat: `Stat ${index}`, value: 1 })) }])
			)
		).toBeNull();
		expect(
			normalizeGearComparisonPayload(
				payload([{ ...candidate(), label: 'x'.repeat(MAX_LT_GEAR_TEXT_LENGTH + 1) }])
			)
		).toBeNull();
		expect(
			normalizeGearComparisonPayload(
				payload([{ ...candidate(), item: { gearType: 'armor', pieceType: 'hat', enchantLevel: 7.5 } }])
			)
		).toBeNull();
		expect(
			normalizeGearComparisonPayload(
				payload([{ ...candidate(), item: { gearType: 'armor', pieceType: 'hat', enchantLevel: 100 } }])
			)
		).toBeNull();
	});
});

describe('gear comparison candidate application', () => {
	it('converts numeric changes to a complete UiStats record with unspecified keys blank', () => {
		const stats = candidateChangesToUiStats(candidate());

		expect(Object.keys(stats)).toEqual([...STAT_KEYS]);
		expect(stats.attack).toEqual(['245', '21']);
		expect(stats.minimum).toEqual(['117', '']);
		expect(stats.maximum).toEqual(['117', '']);
		expect(stats.strength).toEqual(['', '']);
		expect(stats.abnormal).toEqual(['', '']);
	});

	it('replaces only the chosen Change panel and preserves all other CalculatorState fields', () => {
		const state = createDefaultState();
		state.statsA.strength = ['999', '99'];
		state.statsB.critical = ['888', '88'];
		const originalA = structuredClone(state.statsA);
		const originalB = structuredClone(state.statsB);

		const mergedA = mergeGearComparisonCandidate(state, candidate(), 'a');
		const mergedB = mergeGearComparisonCandidate(state, candidate(), 'b');

		expect(mergedA).toEqual({ ...state, statsA: candidateChangesToUiStats(candidate()) });
		expect(mergedA.stats).toBe(state.stats);
		expect(mergedA.statsB).toBe(state.statsB);
		expect(mergedA.settings).toBe(state.settings);
		expect(mergedA.selectedBuffs).toBe(state.selectedBuffs);
		expect(mergedB).toEqual({ ...state, statsB: candidateChangesToUiStats(candidate()) });
		expect(mergedB.statsA).toBe(state.statsA);
		expect(state.statsA).toEqual(originalA);
		expect(state.statsB).toEqual(originalB);
	});

	it('chooses A, then B, and treats entered zero or invalid text as a used panel', () => {
		const state = createDefaultState();
		expect(findFirstEmptyChangeTarget(state)).toBe('a');

		state.statsA.attack[0] = '0';
		expect(findFirstEmptyChangeTarget(state)).toBe('b');

		state.statsB.attack[0] = 'not-a-number';
		expect(findFirstEmptyChangeTarget(state)).toBeNull();

		state.statsA.attack[0] = '';
		state.statsB.attack[0] = '100';
		expect(findFirstEmptyChangeTarget(state)).toBe('a');
	});
});
