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
	physicalStaticDamagePercent: '97%',
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
		expect.assertions(11);
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
		expect(result.warnings).toContain('Missing attack');
		expect(result.stats.normalAdded).toEqual(['867057', '14']);
	});

	it('maps magical screenshots to intelligence and magical columns', () => {
		expect.assertions(6);
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
	});

	it('corrects the focus when model output disagrees with power indicators', () => {
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
		expect(result.stats.back).toEqual(['1033', '']);
		expect(result.warnings).toContain('Corrected focus to physical because the power columns indicate that build.');
	});

	it('reports missing required values and merges without touching change panels', () => {
		expect.assertions(4);
		const result = mapScreenshotExtraction({
			variant: 'physical',
			fields: { ...baseFields, str: null, physicalCriticalDamagePercent: null },
			confidence: 0.5,
			warnings: []
		});
		const state = createDefaultState();
		const merged = mergeImportedStats(state.stats, result.stats);

		expect(findMissingImportedStats(result.stats)).toEqual(['strength', 'critical']);
		expect(result.warnings).toContain('Missing strength, critical');
		expect(merged.attack).toEqual(['55657', '370']);
		expect(merged.strength).toEqual(state.stats.strength);
	});
});
