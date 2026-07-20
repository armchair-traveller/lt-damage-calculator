import { describe, expect, it } from 'vitest';
import {
	findMissingImportedStats,
	inferVariantFromFields,
	mapScreenshotExtraction,
	mergeImportedStats,
	normalizeImportedNumber,
	type ScreenshotExtraction
} from './importer.js';
import { createDefaultState } from './model.js';

const baseFields = {
	str: '4,262,437',
	int: '4,194,643',
	attack: '54,544 ~ 55,657',
	elementalIntensity: '39,764',
	attackBonusRow: 'Attack 11,454 ~ 11,727 370 ~ 370',
	elementalIntensityBonusRow: 'Ele. Intensity +9,058 339%',
	physicalPowerDirectAttack: '441,757',
	magicalPowerDirectAttack: '286,053',
	physicalPowerSummonAttack: '384,708',
	magicalPowerSummonAttack: '290,227',
	physicalCriticalDamage: '7,900',
	magicalCriticalDamage: '7,307',
	physicalMinimumDamage: '6,596',
	magicalMinimumDamage: '6,465',
	physicalMaximumDamage: '7,060',
	magicalMaximumDamage: '6,498',
	physicalCriticalDamageBonusRow: 'Critical Damage +5,100 / 39%',
	magicalCriticalDamageBonusRow: 'Critical Damage +4,900 / 34%',
	physicalMinimumDamageBonusRow: 'Minimum Damage +4,200 / 38%',
	magicalMinimumDamageBonusRow: 'Minimum Damage +4,100 / 38%',
	physicalMaximumDamageBonusRow: 'Maximum Damage +4,400 / 33%',
	magicalMaximumDamageBonusRow: 'Maximum Damage +4,300 / 28%',
	physicalStaticDamage: '672,263',
	magicalStaticDamage: '551,320',
	physicalStaticDamageBonusRow: 'Static Damage +350,137 / 92%',
	magicalStaticDamageBonusRow: 'Static Damage +336,171 / 64%',
	physicalBackAttackDamage: '1,033',
	magicalBackAttackDamage: '1,032',
	detailedNormalAddedFlat: '867,057',
	detailedBossAddedFlat: '924,731',
	detailedNormalAmpFlat: '67.7',
	detailedBossAmpFlat: '61.5',
	normalAddedFlat: '760,577',
	bossAddedFlat: '804,114',
	normalAmpFlat: '14',
	bossAmpFlat: '15',
	strengthPercent: '409%',
	intelligencePercent: '409%',
	attackPercent: null,
	elementalIntensityPercent: null,
	physicalCriticalDamagePercent: '39%',
	magicalCriticalDamagePercent: '34%',
	physicalMinimumDamagePercent: '38%',
	magicalMinimumDamagePercent: '38%',
	physicalMaximumDamagePercent: '33%',
	magicalMaximumDamagePercent: '28%',
	physicalStaticDamagePercent: '92%',
	magicalStaticDamagePercent: '64%',
	normalAddedPercent: '14%',
	bossAddedPercent: '15%',
	statRatioPercent: '12%',
	meleeDamage: '336',
	statusDamage: '59'
} satisfies ScreenshotExtraction['fields'];

const magicalFields = {
	...baseFields,
	str: '4,100,000',
	int: '4,500,000',
	attack: '45,000',
	elementalIntensity: '60,000',
	physicalPowerDirectAttack: '260,000',
	magicalPowerDirectAttack: '470,000',
	physicalPowerSummonAttack: '250,000',
	magicalPowerSummonAttack: '460,000'
} satisfies ScreenshotExtraction['fields'];

describe('screenshot importer mapping', () => {
	it('normalizes punctuation and keeps the right side of ranges', () => {
		expect.assertions(4);

		expect(normalizeImportedNumber('+4,262,437')).toBe('4262437');
		expect(normalizeImportedNumber('54,544 ~ 55,657')).toBe('55657');
		expect(normalizeImportedNumber('370 ~ 370%')).toBe('370');
		expect(normalizeImportedNumber('67.7')).toBe('67.7');
	});

	it('ignores incomplete focus indicator pairs', () => {
		expect.assertions(1);

		expect(
			inferVariantFromFields({
				...baseFields,
				str: null,
				attack: null,
				magicalPowerDirectAttack: null,
				physicalPowerSummonAttack: null,
				magicalPowerSummonAttack: null
			})
		).toBeNull();
	});

	it('maps physical screenshots to strength and physical columns', () => {
		expect.assertions(14);
		const result = mapScreenshotExtraction({
			variant: 'physical',
			fields: baseFields,
			confidence: 0.92,
			warnings: []
		});

		expect(result.variant).toBe('physical');
		expect(result.confidence).toBe(0.92);
		expect(result.stats.strength).toEqual(['4262437', '409']);
		expect(result.stats.attack).toEqual(['55657', '370']);
		expect(result.stats.critical).toEqual(['7900', '39']);
		expect(result.stats.static).toEqual(['672263', '92']);
		expect(result.stats.normalAdded).toEqual(['867057', '14']);
		expect(result.stats.bossAdded).toEqual(['924731', '15']);
		expect(result.stats.normalAmp).toEqual(['67.7', '']);
		expect(result.stats.ratio).toEqual(['12', '']);
		expect(result.stats.back).toEqual(['1033', '']);
		expect(result.variants.physical.strength).toEqual(['4262437', '409']);
		expect(result.variants.magical.strength).toEqual(['4194643', '409']);
		expect(result.variants.magical.attack).toEqual(['39764', '339']);
	});

	it('does not use attack flat ranges as attack percentages', () => {
		expect.assertions(3);
		const result = mapScreenshotExtraction({
			variant: 'physical',
			fields: {
				...baseFields,
				attackBonusRow: 'Attack 11,454 ~ 11,727',
				attackPercent: '11,727%'
			},
			confidence: 0.94,
			warnings: []
		});

		expect(result.stats.attack).toEqual(['55657', '']);
		expect(findMissingImportedStats(result.stats)).toContain('attack');
		expect(result.stats.normalAdded).toEqual(['867057', '14']);
	});

	it('maps magical screenshots to intelligence and magical columns', () => {
		expect.assertions(7);
		const result = mapScreenshotExtraction({
			variant: 'magical',
			fields: magicalFields,
			confidence: 1.4,
			warnings: ['cropped edge']
		});

		expect(result.variant).toBe('magical');
		expect(result.confidence).toBe(1);
		expect(result.warnings).toEqual(['cropped edge']);
		expect(result.stats.strength).toEqual(['4500000', '409']);
		expect(result.stats.attack).toEqual(['60000', '339']);
		expect(result.stats.static).toEqual(['551320', '64']);
		expect(result.variants.physical.attack).toEqual(['45000', '370']);
	});

	it('keeps Minimum Damage percentages on their named row when adjacent Critical Damage is 40%', () => {
		expect.assertions(4);
		const result = mapScreenshotExtraction({
			variant: 'magical',
			fields: {
				...magicalFields,
				physicalCriticalDamage: '7,145',
				magicalCriticalDamage: '7,659',
				physicalMinimumDamage: '6,877',
				magicalMinimumDamage: '6,923',
				physicalCriticalDamageBonusRow: 'Critical Damage +5,293 / 35%',
				magicalCriticalDamageBonusRow: 'Critical Damage +5,471 / 40%',
				physicalMinimumDamageBonusRow: 'Minimum Damage +4,948 / 39%',
				magicalMinimumDamageBonusRow: 'Minimum Damage +4,981 / 39%',
				physicalCriticalDamagePercent: '35%',
				magicalCriticalDamagePercent: '40%',
				physicalMinimumDamagePercent: '39%',
				magicalMinimumDamagePercent: '40%'
			},
			confidence: 0.89,
			warnings: []
		});
		const merged = mergeImportedStats(createDefaultState().stats, result.variants.magical);

		expect(result.variants.physical.minimum).toEqual(['6877', '39']);
		expect(result.variants.magical.critical).toEqual(['7659', '40']);
		expect(merged.minimum).toEqual(['6923', '39']);
		expect(result.warnings).toEqual([
			'Magical Minimum Damage percent used 39% from the bonus row instead of 40% from the separate field.'
		]);
	});

	it('ignores incomplete damage bonus rows that do not contain an explicit percent', () => {
		expect.assertions(3);
		const result = mapScreenshotExtraction({
			variant: 'physical',
			fields: {
				...baseFields,
				physicalMinimumDamageBonusRow: 'Minimum Damage +948',
				physicalMinimumDamagePercent: '39%',
				physicalStaticDamageBonusRow: 'Static Damage +913',
				physicalStaticDamagePercent: '92%'
			},
			confidence: 0.9,
			warnings: []
		});

		expect(result.stats.minimum).toEqual(['6596', '39']);
		expect(result.stats.static).toEqual(['672263', '92']);
		expect(result.warnings).toEqual([]);
	});

	it('prefers full Static Damage row percentages for physical and magical columns', () => {
		expect.assertions(4);
		const result = mapScreenshotExtraction({
			variant: 'physical',
			fields: {
				...baseFields,
				physicalStaticDamage: '609,763',
				magicalStaticDamage: '710,129',
				physicalStaticDamageBonusRow: 'Static Damage +374,088 / 63%',
				magicalStaticDamageBonusRow: 'Static Damage +388,049 / 83%',
				physicalStaticDamagePercent: '83%',
				magicalStaticDamagePercent: '63%'
			},
			confidence: 0.93,
			warnings: []
		});

		expect(result.stats.static).toEqual(['609763', '63']);
		expect(result.variants.physical.static).toEqual(['609763', '63']);
		expect(result.variants.magical.static).toEqual(['710129', '83']);
		expect(result.warnings).toEqual([
			'Physical Static Damage percent used 63% from the bonus row instead of 83% from the separate field.',
			'Magical Static Damage percent used 83% from the bonus row instead of 63% from the separate field.'
		]);
	});

	it('selects suggested focus from power indicators while keeping both variants', () => {
		expect.assertions(5);
		const result = mapScreenshotExtraction({
			variant: 'magical',
			fields: baseFields,
			confidence: 0.98,
			warnings: []
		});

		expect(result.variant).toBe('physical');
		expect(result.stats.strength).toEqual(['4262437', '409']);
		expect(result.stats.attack).toEqual(['55657', '370']);
		expect(result.variants.magical.strength).toEqual(['4194643', '409']);
		expect(result.warnings).toEqual([]);
	});

	it('reports missing required values and merges without touching change panels', () => {
		expect.assertions(4);
		const result = mapScreenshotExtraction({
			variant: 'physical',
			fields: {
				...baseFields,
				str: null,
				physicalCriticalDamageBonusRow: null,
				physicalCriticalDamagePercent: null
			},
			confidence: 0.5,
			warnings: []
		});
		const state = createDefaultState();
		const merged = mergeImportedStats(state.stats, result.stats);

		expect(findMissingImportedStats(result.stats)).toEqual(['strength', 'critical']);
		expect(result.variants.magical.strength).toEqual(['4194643', '409']);
		expect(merged.attack).toEqual(['55657', '370']);
		expect(merged.strength).toEqual(state.stats.strength);
	});
});
