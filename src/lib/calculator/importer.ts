import { PERCENTLESS_STATS, STAT_KEYS, type StatKey, type UiStats } from './model.js';

export type ScreenshotVariant = 'physical' | 'magical';
export type ImportedStatValues = Partial<Record<StatKey, [string, string]>>;
export type ScreenshotImportVariants = Record<ScreenshotVariant, ImportedStatValues>;

export const SCREENSHOT_VARIANTS = ['physical', 'magical'] as const satisfies ScreenshotVariant[];

export type ScreenshotImportResult = {
	variant: ScreenshotVariant;
	stats: ImportedStatValues;
	variants: ScreenshotImportVariants;
	confidence: number;
	warnings: string[];
};

export type ScreenshotExtractionFields = {
	str: string | null;
	int: string | null;
	attack: string | null;
	elementalIntensity: string | null;
	attackBonusRow: string | null;
	elementalIntensityBonusRow: string | null;
	physicalPowerDirectAttack: string | null;
	magicalPowerDirectAttack: string | null;
	physicalPowerSummonAttack: string | null;
	magicalPowerSummonAttack: string | null;
	physicalCriticalDamage: string | null;
	magicalCriticalDamage: string | null;
	physicalMinimumDamage: string | null;
	magicalMinimumDamage: string | null;
	physicalMaximumDamage: string | null;
	magicalMaximumDamage: string | null;
	physicalCriticalDamageBonusRow: string | null;
	magicalCriticalDamageBonusRow: string | null;
	physicalMinimumDamageBonusRow: string | null;
	magicalMinimumDamageBonusRow: string | null;
	physicalMaximumDamageBonusRow: string | null;
	magicalMaximumDamageBonusRow: string | null;
	physicalStaticDamage: string | null;
	magicalStaticDamage: string | null;
	physicalStaticDamageBonusRow: string | null;
	magicalStaticDamageBonusRow: string | null;
	physicalBackAttackDamage: string | null;
	magicalBackAttackDamage: string | null;
	detailedNormalAddedFlat: string | null;
	detailedBossAddedFlat: string | null;
	detailedNormalAmpFlat: string | null;
	detailedBossAmpFlat: string | null;
	normalAddedFlat: string | null;
	bossAddedFlat: string | null;
	normalAmpFlat: string | null;
	bossAmpFlat: string | null;
	strengthPercent: string | null;
	intelligencePercent: string | null;
	attackPercent: string | null;
	elementalIntensityPercent: string | null;
	physicalCriticalDamagePercent: string | null;
	magicalCriticalDamagePercent: string | null;
	physicalMinimumDamagePercent: string | null;
	magicalMinimumDamagePercent: string | null;
	physicalMaximumDamagePercent: string | null;
	magicalMaximumDamagePercent: string | null;
	physicalStaticDamagePercent: string | null;
	magicalStaticDamagePercent: string | null;
	normalAddedPercent: string | null;
	bossAddedPercent: string | null;
	statRatioPercent: string | null;
	meleeDamage: string | null;
	statusDamage: string | null;
};

export type ScreenshotExtraction = {
	variant?: ScreenshotVariant | null;
	fields: ScreenshotExtractionFields;
	confidence: number;
	warnings: string[];
};

const EMPTY_PAIR: [string, string] = ['', ''];

export const SCREENSHOT_EXTRACTION_FIELD_KEYS = [
	'str',
	'int',
	'attack',
	'elementalIntensity',
	'attackBonusRow',
	'elementalIntensityBonusRow',
	'physicalPowerDirectAttack',
	'magicalPowerDirectAttack',
	'physicalPowerSummonAttack',
	'magicalPowerSummonAttack',
	'physicalCriticalDamage',
	'magicalCriticalDamage',
	'physicalMinimumDamage',
	'magicalMinimumDamage',
	'physicalMaximumDamage',
	'magicalMaximumDamage',
	'physicalCriticalDamageBonusRow',
	'magicalCriticalDamageBonusRow',
	'physicalMinimumDamageBonusRow',
	'magicalMinimumDamageBonusRow',
	'physicalMaximumDamageBonusRow',
	'magicalMaximumDamageBonusRow',
	'physicalStaticDamage',
	'magicalStaticDamage',
	'physicalStaticDamageBonusRow',
	'magicalStaticDamageBonusRow',
	'physicalBackAttackDamage',
	'magicalBackAttackDamage',
	'detailedNormalAddedFlat',
	'detailedBossAddedFlat',
	'detailedNormalAmpFlat',
	'detailedBossAmpFlat',
	'normalAddedFlat',
	'bossAddedFlat',
	'normalAmpFlat',
	'bossAmpFlat',
	'strengthPercent',
	'intelligencePercent',
	'attackPercent',
	'elementalIntensityPercent',
	'physicalCriticalDamagePercent',
	'magicalCriticalDamagePercent',
	'physicalMinimumDamagePercent',
	'magicalMinimumDamagePercent',
	'physicalMaximumDamagePercent',
	'magicalMaximumDamagePercent',
	'physicalStaticDamagePercent',
	'magicalStaticDamagePercent',
	'normalAddedPercent',
	'bossAddedPercent',
	'statRatioPercent',
	'meleeDamage',
	'statusDamage'
] as const satisfies Array<keyof ScreenshotExtractionFields>;

export const IMPORT_REQUIRED_STATS = STAT_KEYS;

type VariantEvidence = {
	variant: ScreenshotVariant;
	source: 'power' | 'primary';
};

export function normalizeImportedNumber(value: unknown, range: 'first' | 'last' = 'last') {
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
	if (typeof value !== 'string') return '';

	const matches = value.match(/[+-]?\s*\d[\d,\s]*(?:\.\d+)?%?/g);
	const candidate = matches?.[range === 'first' ? 0 : matches.length - 1] ?? '';
	const normalized = candidate.replace(/[,%\s]/g, '').replace(/^\+/, '');
	return Number.isFinite(Number(normalized)) ? normalized : '';
}

export function mapScreenshotExtraction(extraction: ScreenshotExtraction): ScreenshotImportResult {
	const fields = extraction.fields;
	const variants = mapScreenshotVariants(fields);
	const variant = selectScreenshotVariant(fields, variants, extraction.variant);
	const stats = variants[variant];
	const warnings = [
		...(Array.isArray(extraction.warnings) ? extraction.warnings : []),
		...damagePercentWarnings(fields)
	];

	return {
		variant,
		stats,
		variants,
		confidence: clampConfidence(extraction.confidence),
		warnings
	};
}

export function mapScreenshotVariants(fields: ScreenshotExtractionFields): ScreenshotImportVariants {
	return {
		physical: mapScreenshotVariant(fields, 'physical'),
		magical: mapScreenshotVariant(fields, 'magical')
	};
}

function mapScreenshotVariant(
	fields: ScreenshotExtractionFields,
	variant: ScreenshotVariant
): ImportedStatValues {
	const focus = <T>(physical: T, magical: T) => (variant === 'magical' ? magical : physical);
	const stats: ImportedStatValues = {};

	setStat(stats, 'strength', focus(fields.str, fields.int), focus(fields.strengthPercent, fields.intelligencePercent));
	setStat(
		stats,
		'attack',
		focus(fields.attack, fields.elementalIntensity),
		focus(
			attackPercent(fields.attackBonusRow, fields.attackPercent),
			attackPercent(fields.elementalIntensityBonusRow, fields.elementalIntensityPercent)
		)
	);
	setStat(
		stats,
		'critical',
		focus(fields.physicalCriticalDamage, fields.magicalCriticalDamage),
		focus(
			damagePercent(fields.physicalCriticalDamageBonusRow, fields.physicalCriticalDamagePercent),
			damagePercent(fields.magicalCriticalDamageBonusRow, fields.magicalCriticalDamagePercent)
		)
	);
	setStat(
		stats,
		'minimum',
		focus(fields.physicalMinimumDamage, fields.magicalMinimumDamage),
		focus(
			damagePercent(fields.physicalMinimumDamageBonusRow, fields.physicalMinimumDamagePercent),
			damagePercent(fields.magicalMinimumDamageBonusRow, fields.magicalMinimumDamagePercent)
		)
	);
	setStat(
		stats,
		'maximum',
		focus(fields.physicalMaximumDamage, fields.magicalMaximumDamage),
		focus(
			damagePercent(fields.physicalMaximumDamageBonusRow, fields.physicalMaximumDamagePercent),
			damagePercent(fields.magicalMaximumDamageBonusRow, fields.magicalMaximumDamagePercent)
		)
	);
	setStat(
		stats,
		'static',
		focus(fields.physicalStaticDamage, fields.magicalStaticDamage),
		focus(
			staticDamagePercent(fields.physicalStaticDamageBonusRow, fields.physicalStaticDamagePercent),
			staticDamagePercent(fields.magicalStaticDamageBonusRow, fields.magicalStaticDamagePercent)
		)
	);
	setStat(stats, 'normalAdded', firstImportedNumber(fields.detailedNormalAddedFlat, fields.normalAddedFlat), fields.normalAddedPercent);
	setStat(stats, 'bossAdded', firstImportedNumber(fields.detailedBossAddedFlat, fields.bossAddedFlat), fields.bossAddedPercent);
	setStat(stats, 'normalAmp', firstImportedNumber(fields.detailedNormalAmpFlat, fields.normalAmpFlat));
	setStat(stats, 'bossAmp', firstImportedNumber(fields.detailedBossAmpFlat, fields.bossAmpFlat));
	setStat(stats, 'ratio', fields.statRatioPercent);
	setStat(stats, 'back', focus(fields.physicalBackAttackDamage, fields.magicalBackAttackDamage));
	setStat(stats, 'melee', fields.meleeDamage);
	setStat(stats, 'abnormal', fields.statusDamage);

	return stats;
}

export function inferVariantFromFields(fields: ScreenshotExtractionFields): VariantEvidence | null {
	const powerVotes = [
		compareVariantPair(fields.physicalPowerDirectAttack, fields.magicalPowerDirectAttack),
		compareVariantPair(fields.physicalPowerSummonAttack, fields.magicalPowerSummonAttack)
	].filter(Boolean) as ScreenshotVariant[];

	const powerVariant = majorityVariant(powerVotes);
	if (powerVariant) return { variant: powerVariant, source: 'power' };

	const primaryVotes = [
		compareVariantPair(fields.str, fields.int),
		compareVariantPair(fields.attack, fields.elementalIntensity)
	].filter(Boolean) as ScreenshotVariant[];

	const primaryVariant = majorityVariant(primaryVotes);
	return primaryVariant ? { variant: primaryVariant, source: 'primary' } : null;
}

function selectScreenshotVariant(
	fields: ScreenshotExtractionFields,
	variants: ScreenshotImportVariants,
	extractedVariant: unknown
) {
	const evidenceVariant = inferVariantFromFields(fields)?.variant;
	if (evidenceVariant) return evidenceVariant;

	const completeVariant = variantWithFewestMissingStats(variants);
	if (completeVariant) return completeVariant;

	const legacyVariant = normalizeScreenshotVariant(extractedVariant);
	return legacyVariant ?? 'physical';
}

function variantWithFewestMissingStats(variants: ScreenshotImportVariants): ScreenshotVariant | null {
	const physicalMissing = findMissingImportedStats(variants.physical).length;
	const magicalMissing = findMissingImportedStats(variants.magical).length;
	if (physicalMissing === magicalMissing) return null;
	return physicalMissing < magicalMissing ? 'physical' : 'magical';
}

function normalizeScreenshotVariant(value: unknown): ScreenshotVariant | null {
	return value === 'physical' || value === 'magical' ? value : null;
}

export function mergeImportedStats(current: UiStats, imported: ImportedStatValues): UiStats {
	return Object.fromEntries(
		STAT_KEYS.map((key) => {
			const currentPair = current[key] ?? EMPTY_PAIR;
			const importedPair = imported[key];
			const canMerge = Boolean(
				importedPair?.[0] && (PERCENTLESS_STATS.has(key) || importedPair[1])
			);
			return [
				key,
				canMerge && importedPair
					? [importedPair[0], PERCENTLESS_STATS.has(key) ? currentPair[1] : importedPair[1]]
					: [currentPair[0], currentPair[1]]
			];
		})
	) as UiStats;
}

export function findMissingImportedStats(stats: ImportedStatValues) {
	return IMPORT_REQUIRED_STATS.filter((key) => {
		const pair = stats[key];
		if (!pair || !pair[0]) return true;
		return !PERCENTLESS_STATS.has(key) && !pair[1];
	});
}

function compareVariantPair(physical: unknown, magical: unknown): ScreenshotVariant | null {
	const physicalText = normalizeImportedNumber(physical);
	const magicalText = normalizeImportedNumber(magical);
	if (!physicalText || !magicalText) return null;

	const physicalValue = Number(physicalText);
	const magicalValue = Number(magicalText);
	if (!Number.isFinite(physicalValue) || !Number.isFinite(magicalValue)) return null;
	if (physicalValue === magicalValue) return null;
	return physicalValue > magicalValue ? 'physical' : 'magical';
}

function majorityVariant(votes: ScreenshotVariant[]) {
	const physicalVotes = votes.filter((vote) => vote === 'physical').length;
	const magicalVotes = votes.filter((vote) => vote === 'magical').length;
	if (physicalVotes === magicalVotes) return null;
	return physicalVotes > magicalVotes ? 'physical' : 'magical';
}

function staticDamagePercent(rowText: unknown, percent: unknown) {
	return damagePercent(rowText, percent);
}

function damagePercent(rowText: unknown, percent: unknown) {
	return normalizeExplicitPercent(rowText) || normalizeReasonablePercent(percent);
}

function damagePercentWarnings(fields: ScreenshotExtractionFields) {
	return [
		rowPercentWarning(
			'Physical Critical Damage',
			fields.physicalCriticalDamageBonusRow,
			fields.physicalCriticalDamagePercent
		),
		rowPercentWarning(
			'Magical Critical Damage',
			fields.magicalCriticalDamageBonusRow,
			fields.magicalCriticalDamagePercent
		),
		rowPercentWarning(
			'Physical Minimum Damage',
			fields.physicalMinimumDamageBonusRow,
			fields.physicalMinimumDamagePercent
		),
		rowPercentWarning(
			'Magical Minimum Damage',
			fields.magicalMinimumDamageBonusRow,
			fields.magicalMinimumDamagePercent
		),
		rowPercentWarning(
			'Physical Maximum Damage',
			fields.physicalMaximumDamageBonusRow,
			fields.physicalMaximumDamagePercent
		),
		rowPercentWarning(
			'Magical Maximum Damage',
			fields.magicalMaximumDamageBonusRow,
			fields.magicalMaximumDamagePercent
		),
		rowPercentWarning(
			'Physical Static Damage',
			fields.physicalStaticDamageBonusRow,
			fields.physicalStaticDamagePercent
		),
		rowPercentWarning(
			'Magical Static Damage',
			fields.magicalStaticDamageBonusRow,
			fields.magicalStaticDamagePercent
		)
	].filter((warning): warning is string => Boolean(warning));
}

function rowPercentWarning(label: string, rowText: unknown, percent: unknown) {
	const rowPercentValue = normalizeExplicitPercent(rowText);
	const separatePercentValue = normalizeReasonablePercent(percent);
	if (!rowPercentValue || !separatePercentValue || rowPercentValue === separatePercentValue) return '';
	return `${label} percent used ${rowPercentValue}% from the bonus row instead of ${separatePercentValue}% from the separate field.`;
}

function attackPercent(rowText: unknown, percent: unknown) {
	return rowPercent(rowText, percent);
}

function rowPercent(rowText: unknown, percent: unknown) {
	return normalizeReasonablePercent(rowText) || normalizeReasonablePercent(percent);
}

function normalizeReasonablePercent(value: unknown) {
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
	if (typeof value !== 'string') return '';

	const explicitPercent = normalizeExplicitPercent(value);
	if (isReasonablePercent(explicitPercent)) return explicitPercent;

	const matches = value.match(/[+-]?\s*\d[\d,]*(?:\.\d+)?/g);
	const candidate = normalizePercentToken(matches?.[matches.length - 1]);
	return isReasonablePercent(candidate) ? candidate : '';
}

function normalizeExplicitPercent(value: unknown) {
	if (typeof value !== 'string') return '';
	const percentMatches = value.match(/[+-]?\s*\d[\d,]*(?:\.\d+)?\s*%/g);
	const explicitPercent = normalizePercentToken(percentMatches?.[percentMatches.length - 1]);
	return isReasonablePercent(explicitPercent) ? explicitPercent : '';
}

function normalizePercentToken(value: unknown) {
	if (typeof value !== 'string') return '';
	const normalized = value.replace(/[,%\s]/g, '').replace(/^\+/, '');
	return Number.isFinite(Number(normalized)) ? normalized : '';
}

function isReasonablePercent(value: string) {
	if (!value) return false;
	const numericValue = Number(value);
	return numericValue >= 0 && numericValue <= 2_000;
}

function firstImportedNumber(...values: unknown[]) {
	for (const value of values) {
		const normalized = normalizeImportedNumber(value);
		if (normalized) return normalized;
	}
	return '';
}

function setStat(
	stats: ImportedStatValues,
	key: StatKey,
	flat: unknown,
	percent: unknown = ''
) {
	const flatValue = normalizeImportedNumber(flat);
	const percentValue = normalizeImportedNumber(percent);
	if (!flatValue && !percentValue) return;
	stats[key] = [flatValue, PERCENTLESS_STATS.has(key) ? '' : percentValue];
}

function clampConfidence(confidence: unknown) {
	const parsed = typeof confidence === 'number' ? confidence : Number(confidence);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(0, Math.min(1, parsed));
}
