import {
	applyChanges,
	calculateDamage,
	calculateEquivalenceIncrease,
	compareDamage,
	getAverageDamage
} from './formula.js';
import buffs from './buffs.js';
import {
	defaultSelectedBuffs,
	defaultSettings,
	defaultStats,
	defaultStatsA,
	defaultStatsB
} from './defaults.js';
import { classPresets } from './presets.js';

export const STAT_KEYS = [
	'strength',
	'attack',
	'critical',
	'minimum',
	'maximum',
	'static',
	'normalAdded',
	'bossAdded',
	'normalAmp',
	'bossAmp',
	'ratio',
	'back',
	'melee',
	'abnormal'
] as const;

export type StatKey = (typeof STAT_KEYS)[number];
export type EnemyType = 'normal' | 'boss';
export type TargetKey = 'soft' | '7k';
export type NumericPair = [number, number];
export type NumericStats = Record<StatKey, NumericPair>;
export type UiPair = [string, string];
export type UiStats = Record<StatKey, UiPair>;

export type Settings = {
	aF: number;
	sF: number;
	fF: number;
	minWeight: number;
	bossWeight: number;
	summonWeight: number;
	backWeight: number;
	target: TargetKey;
};

export type DefenseProfile = Record<
	EnemyType,
	{
		multiplier: number;
		flat: number;
		mitigation: number;
		phasing: number;
	}
>;

export type SelectedBuffs = Record<string, Record<string, string | Record<string, boolean>>>;

export type CalculatorState = {
	stats: UiStats;
	statsA: UiStats;
	statsB: UiStats;
	settings: Settings;
	selectedBuffs: SelectedBuffs;
	selectedClassPreset: string | null;
};

export const STORAGE_KEY = 'ltdc:state:v2';

export const STAT_LABELS: Record<StatKey, string> = {
	strength: 'Strength/Magic',
	attack: 'Attack/Intensity',
	critical: 'Critical Damage',
	minimum: 'Minimum Damage',
	maximum: 'Maximum Damage',
	static: 'Static Damage',
	normalAdded: 'Normal Added',
	bossAdded: 'Boss Added',
	normalAmp: 'Normal Amp',
	bossAmp: 'Boss Amp',
	ratio: 'Stat Ratio',
	back: 'Back Attack',
	melee: 'Melee Damage',
	abnormal: 'Status Damage'
};

export const PERCENTLESS_STATS = new Set<StatKey>([
	'normalAmp',
	'bossAmp',
	'ratio',
	'back',
	'melee',
	'abnormal'
]);

export const TARGETS: Record<TargetKey, { label: string; defenses: DefenseProfile }> = {
	soft: {
		label: 'Soft Dummy',
		defenses: {
			normal: { multiplier: 1, flat: 0, mitigation: 0, phasing: 0 },
			boss: { multiplier: 1, flat: 0, mitigation: 0, phasing: 0 }
		}
	},
	'7k': {
		label: '7k Mobs',
		defenses: {
			normal: { multiplier: 0.402, flat: 500000, mitigation: 0.53, phasing: 0 },
			boss: { multiplier: 0.31, flat: 1000000, mitigation: 0.75, phasing: 0.65 }
		}
	}
};

export const QUICK_FACTOR_PRESETS = [
	{ label: 'Summon Avg', values: { aF: 6250, sF: 125, fF: 140, summonWeight: 0.5, backWeight: 0.275 } },
	{ label: 'Pure Summon', values: { aF: 2100, sF: 140, fF: 200, summonWeight: 1, backWeight: 0 } },
	{ label: 'Direct Avg', values: { aF: 10000, sF: 115, fF: 120, summonWeight: 0.275, backWeight: 0.55 } },
	{ label: 'Pure Direct', values: { aF: 15000, sF: 100, fF: 100, summonWeight: 0, backWeight: 1 } },
	{ label: 'Hybrid Avg', values: { aF: 8000, sF: 120, fF: 135, summonWeight: 0.425, backWeight: 0.35 } },
	{ label: 'Direct High', values: { aF: 30000, sF: 100, fF: 100, summonWeight: 0, backWeight: 1 } }
] as const;

export const CLASS_PRESETS = classPresets as Record<
	string,
	Pick<Settings, 'aF' | 'sF' | 'fF' | 'summonWeight' | 'backWeight'>
>;

const CLASS_PRESET_KEYS = ['aF', 'sF', 'fF', 'summonWeight', 'backWeight'] as const;
const CLASS_PRESET_TOLERANCE = 0.000000001;

const TIER_DEFAULTS: Record<string, Record<string, string>> = {
	Minimal: {
		Food: 'Chicken Soup',
		Relic: 'Nightmare +4',
		'Guild Relic': '+9',
		Summonable: 'Awakened Beatrice',
		"Lustral's Potion of Madness": 'None'
	},
	Midterm: {
		Syrup: 'Advanced Premium Syrup',
		Booster: 'Union Critical Booster',
		'Rep Food': 'Reputation Abalone Champon',
		'Alvis Helper Potion': 'Critical'
	}
};

function clone<T>(value: T): T {
	return structuredClone(value);
}

function emptyNumericStats(): NumericStats {
	return Object.fromEntries(STAT_KEYS.map((key) => [key, [0, 0]])) as NumericStats;
}

function toDisplayValue(value: unknown): string {
	if (value === undefined || value === null) return '';
	return String(value);
}

function toNumber(value: unknown): number {
	if (value === '' || value === undefined || value === null) return 0;
	const number = Number(value);
	return Number.isFinite(number) ? number : 0;
}

export function makeUiStats(source: unknown, blank = false): UiStats {
	const sourceRecord = (source ?? {}) as Record<string, unknown>;
	return Object.fromEntries(
		STAT_KEYS.map((key) => {
			const pair = Array.isArray(sourceRecord[key]) ? (sourceRecord[key] as unknown[]) : undefined;
			return [
				key,
				[
					pair ? toDisplayValue(pair[0]) : blank ? '' : '0',
					pair ? toDisplayValue(pair[1]) : blank ? '' : '0'
				]
			];
		})
	) as UiStats;
}

export function toNumericStats(stats: UiStats): NumericStats {
	return Object.fromEntries(
		STAT_KEYS.map((key) => [key, [toNumber(stats[key][0]), toNumber(stats[key][1])]])
	) as NumericStats;
}

export function numericStatsToUi(stats: NumericStats): UiStats {
	return Object.fromEntries(
		STAT_KEYS.map((key) => [key, [stats[key][0].toFixed(2), `${stats[key][1].toFixed(0)}%`]])
	) as UiStats;
}

function normalizeTarget(target: unknown): TargetKey {
	return target === 'soft' || target === '7k' ? target : '7k';
}

export function normalizeSettings(source: unknown): Settings {
	const fallback = defaultSettings as Settings;
	const input = (source ?? {}) as Partial<Settings>;
	return {
		aF: toNumber(input.aF ?? fallback.aF),
		sF: toNumber(input.sF ?? fallback.sF),
		fF: toNumber(input.fF ?? fallback.fF),
		minWeight: toNumber(input.minWeight ?? fallback.minWeight),
		bossWeight: toNumber(input.bossWeight ?? fallback.bossWeight),
		summonWeight: toNumber(input.summonWeight ?? fallback.summonWeight),
		backWeight: toNumber(input.backWeight ?? fallback.backWeight),
		target: normalizeTarget(input.target ?? fallback.target)
	};
}

export function normalizeSelectedBuffs(source: unknown = defaultSelectedBuffs): SelectedBuffs {
	const input = (source ?? {}) as SelectedBuffs;
	const normalized: SelectedBuffs = {};

	for (const [tierName, tier] of Object.entries(buffs as Record<string, Record<string, Record<string, unknown>>>)) {
		const sourceTier = input[tierName] ?? {};
		normalized[tierName] = {};

		for (const [groupName, group] of Object.entries(tier)) {
			if (groupName === 'single') {
				const sourceSingles = (sourceTier.single ?? {}) as Record<string, boolean>;
				normalized[tierName].single = Object.fromEntries(
					Object.keys(group).map((buffName) => [buffName, Boolean(sourceSingles[buffName])])
				);
				continue;
			}

			const selected = sourceTier[groupName];
			normalized[tierName][groupName] =
				typeof selected === 'string' && selected in group ? selected : 'None';
		}
	}

	return normalized;
}

export function createDefaultState(): CalculatorState {
	return {
		stats: makeUiStats(defaultStats),
		statsA: makeUiStats(defaultStatsA, true),
		statsB: makeUiStats(defaultStatsB, true),
		settings: normalizeSettings(defaultSettings),
		selectedBuffs: normalizeSelectedBuffs(defaultSelectedBuffs),
		selectedClassPreset: null
	};
}

export function normalizeState(source: unknown): CalculatorState {
	const fallback = createDefaultState();
	const input = (source ?? {}) as Partial<CalculatorState>;
	const settings = normalizeSettings(input.settings ?? fallback.settings);
	return {
		stats: makeUiStats(input.stats ?? fallback.stats),
		statsA: makeUiStats(input.statsA ?? fallback.statsA, true),
		statsB: makeUiStats(input.statsB ?? fallback.statsB, true),
		settings,
		selectedBuffs: normalizeSelectedBuffs(input.selectedBuffs ?? fallback.selectedBuffs),
		selectedClassPreset: normalizeClassPreset(input.selectedClassPreset, settings)
	};
}

function normalizeClassPreset(value: unknown, settings: Settings): string | null {
	if (typeof value === 'string' && value in CLASS_PRESETS) return value;
	return matchClassPreset(settings) ?? null;
}

export function parseStoredState(text: string): CalculatorState {
	const parsed = JSON.parse(text);
	return normalizeState(parsed?.state ?? parsed);
}

export function serializeState(state: CalculatorState): string {
	return JSON.stringify({ version: 2, state }, null, 2);
}

export function getDefenses(target: TargetKey): DefenseProfile {
	return clone(TARGETS[target].defenses);
}

export function setStatValue(stats: UiStats, key: StatKey, index: 0 | 1, value: string): UiStats {
	const next = clone(stats);
	next[key][index] = value;
	return next;
}

export function clearUiStats(): UiStats {
	return makeUiStats({}, true);
}

export function applyQuickPreset(settings: Settings, preset: (typeof QUICK_FACTOR_PRESETS)[number]): Settings {
	return { ...settings, ...preset.values };
}

export function applyClassPreset(settings: Settings, presetName: string): Settings {
	const preset = CLASS_PRESETS[presetName];
	return preset ? { ...settings, ...preset } : settings;
}

export function matchClassPreset(settings: Settings): string | undefined {
	return Object.entries(CLASS_PRESETS).find(([, preset]) =>
		CLASS_PRESET_KEYS.every(
			(key) => Math.abs(Number(settings[key]) - preset[key]) <= CLASS_PRESET_TOLERANCE
		)
	)?.[0];
}

export function toggleBuffTier(selectedBuffs: SelectedBuffs, tierName: string): SelectedBuffs {
	const next = normalizeSelectedBuffs(selectedBuffs);

	if (tierName === 'Clear') {
		for (const tier of Object.values(next)) {
			for (const [groupName, group] of Object.entries(tier)) {
				if (groupName === 'single') {
					for (const buffName of Object.keys(group as Record<string, boolean>)) {
						(group as Record<string, boolean>)[buffName] = false;
					}
				} else {
					tier[groupName] = 'None';
				}
			}
		}
		return next;
	}

	const tier = next[tierName];
	if (!tier) return next;
	const singles = (tier.single ?? {}) as Record<string, boolean>;
	const firstSingle = Object.keys(singles)[0];
	const enabled = firstSingle ? !singles[firstSingle] : true;

	for (const buffName of Object.keys(singles)) {
		singles[buffName] = enabled;
	}

	for (const groupName of Object.keys(tier)) {
		if (groupName === 'single') continue;
		tier[groupName] = enabled ? (TIER_DEFAULTS[tierName]?.[groupName] ?? 'None') : 'None';
	}

	return next;
}

export function setSingleBuff(
	selectedBuffs: SelectedBuffs,
	tierName: string,
	buffName: string,
	checked: boolean
): SelectedBuffs {
	const next = normalizeSelectedBuffs(selectedBuffs);
	const singles = next[tierName]?.single as Record<string, boolean> | undefined;
	if (singles && buffName in singles) singles[buffName] = checked;
	return next;
}

export function setChoiceBuff(
	selectedBuffs: SelectedBuffs,
	tierName: string,
	groupName: string,
	value: string
): SelectedBuffs {
	const next = normalizeSelectedBuffs(selectedBuffs);
	if (next[tierName] && groupName in next[tierName]) next[tierName][groupName] = value;
	return next;
}

export function getBuffStats(selectedBuffs: SelectedBuffs): NumericStats {
	const allBuffs = emptyNumericStats();
	const normalized = normalizeSelectedBuffs(selectedBuffs);
	const catalog = buffs as unknown as Record<string, Record<string, Record<string, Partial<NumericStats>>>>;

	for (const [tierName, tier] of Object.entries(catalog)) {
		for (const [groupName, group] of Object.entries(tier)) {
			if (groupName === 'single') {
				const selectedSingles = normalized[tierName].single as Record<string, boolean>;
				for (const [buffName, buffStats] of Object.entries(group)) {
					if (!selectedSingles[buffName]) continue;
					addBuffStats(allBuffs, buffStats);
				}
				continue;
			}

			const selected = normalized[tierName][groupName];
			if (typeof selected === 'string' && selected !== 'None' && group[selected]) {
				addBuffStats(allBuffs, group[selected]);
			}
		}
	}

	return allBuffs;
}

function addBuffStats(target: NumericStats, source: Partial<NumericStats>) {
	for (const [stat, pair] of Object.entries(source) as [StatKey, NumericPair][]) {
		target[stat][0] += pair[0];
		target[stat][1] += pair[1];
	}
}

export function formatBuffStats(buff: Partial<NumericStats>): string {
	return Object.entries(buff)
		.map(([stat, pair]) => {
			const [flat, percent] = pair as NumericPair;
			if (percent === 0) return `${STAT_LABELS[stat as StatKey]} +${flat}`;
			if (flat === 0) return `${STAT_LABELS[stat as StatKey]} +${percent}%`;
			return `${STAT_LABELS[stat as StatKey]} +${flat}/+${percent}%`;
		})
		.join(', ');
}

function damageSet(stats: NumericStats, settings: Settings, defenses: DefenseProfile) {
	const normal = calculateDamage(stats, settings, defenses, 'normal') as number;
	const boss = calculateDamage(stats, settings, defenses, 'boss') as number;
	return {
		normal,
		boss,
		avg: getAverageDamage(normal, boss, settings.bossWeight) as number
	};
}

function increaseSet(
	oldDamage: ReturnType<typeof damageSet>,
	newDamage: ReturnType<typeof damageSet>,
	settings: Settings
) {
	const normal = compareDamage(oldDamage.normal, newDamage.normal) as number;
	const boss = compareDamage(oldDamage.boss, newDamage.boss) as number;
	return {
		normal,
		boss,
		avg: getAverageDamage(normal, boss, settings.bossWeight) as number
	};
}

export function formatDamage(damage: number): string {
	if (Number.isNaN(damage)) return '---';
	const bil = Math.max(Math.floor(damage / 1_000_000_000), 0);
	const mil = Math.max(Math.round((damage / 1_000_000_000 - bil) * 1000), 0)
		.toString()
		.padStart(3, '0');
	return `${bil}b${mil}m`;
}

export function formatIncrease(increase: number): string {
	if (Number.isNaN(increase)) return '---';
	const signal = increase >= 0 ? '+' : '';
	return `${signal}${(increase * 100).toFixed(5)}%`;
}

function formatDamageSet(set: ReturnType<typeof damageSet>) {
	return {
		normal: formatDamage(set.normal),
		boss: formatDamage(set.boss),
		avg: formatDamage(set.avg)
	};
}

function formatIncreaseSet(set: ReturnType<typeof increaseSet>) {
	return {
		normal: formatIncrease(set.normal),
		boss: formatIncrease(set.boss),
		avg: formatIncrease(set.avg)
	};
}

export function calculateDashboard(state: CalculatorState) {
	const settings = normalizeSettings(state.settings);
	const defenses = getDefenses(settings.target);
	const baseStats = toNumericStats(state.stats);
	const changeA = toNumericStats(state.statsA);
	const changeB = toNumericStats(state.statsB);
	const changedA = applyChanges(baseStats, changeA) as NumericStats;
	const changedB = applyChanges(baseStats, changeB) as NumericStats;

	const baseDamage = damageSet(baseStats, settings, defenses);
	const damageA = damageSet(changedA, settings, defenses);
	const damageB = damageSet(changedB, settings, defenses);

	const buffStats = getBuffStats(state.selectedBuffs);
	const buffedStats = applyChanges(baseStats, buffStats) as NumericStats;
	const buffedA = applyChanges(buffedStats, changeA) as NumericStats;
	const buffedB = applyChanges(buffedStats, changeB) as NumericStats;
	const buffedDamage = damageSet(buffedStats, settings, defenses);
	const buffedDamageA = damageSet(buffedA, settings, defenses);
	const buffedDamageB = damageSet(buffedB, settings, defenses);

	return {
		settings,
		defenses,
		buffStats,
		buffedStats,
		raw: {
			base: baseDamage,
			a: damageA,
			b: damageB,
			buffed: buffedDamage,
			buffedA: buffedDamageA,
			buffedB: buffedDamageB,
			increaseA: increaseSet(baseDamage, damageA, settings),
			increaseB: increaseSet(baseDamage, damageB, settings),
			buffIncrease: increaseSet(baseDamage, buffedDamage, settings),
			buffedIncreaseA: increaseSet(buffedDamage, buffedDamageA, settings),
			buffedIncreaseB: increaseSet(buffedDamage, buffedDamageB, settings)
		},
		formatted: {
			base: formatDamageSet(baseDamage),
			a: formatDamageSet(damageA),
			b: formatDamageSet(damageB),
			buffed: formatDamageSet(buffedDamage),
			buffedA: formatDamageSet(buffedDamageA),
			buffedB: formatDamageSet(buffedDamageB),
			increaseA: formatIncreaseSet(increaseSet(baseDamage, damageA, settings)),
			increaseB: formatIncreaseSet(increaseSet(baseDamage, damageB, settings)),
			buffIncrease: formatIncreaseSet(increaseSet(baseDamage, buffedDamage, settings)),
			buffedIncreaseA: formatIncreaseSet(increaseSet(buffedDamage, buffedDamageA, settings)),
			buffedIncreaseB: formatIncreaseSet(increaseSet(buffedDamage, buffedDamageB, settings))
		}
	};
}

export function calculateEquivalenceTables(
	state: CalculatorState,
	values: { perc: number; critical: number }
) {
	const dashboard = calculateDashboard(state);
	const settings = dashboard.settings;
	const defenses = dashboard.defenses;
	const buffedStats = dashboard.buffedStats;
	const critStats = applyChanges(buffedStats, { critical: [values.critical, 0] }) as NumericStats;

	let critIncrease = getAverageDamage(
		compareDamage(
			calculateDamage(buffedStats, settings, defenses, 'normal') as number,
			calculateDamage(critStats, settings, defenses, 'normal') as number
		) as number,
		compareDamage(
			calculateDamage(buffedStats, settings, defenses, 'boss') as number,
			calculateDamage(critStats, settings, defenses, 'boss') as number
		) as number,
		settings.bossWeight
	) as number;
	critIncrease *= 100;

	const percent = calculateEquivalenceIncrease(
		buffedStats,
		settings,
		defenses,
		toNumber(values.perc) / 100
	) as Record<StatKey, [number | string, number | string]>;
	const critical = calculateEquivalenceIncrease(
		buffedStats,
		settings,
		defenses,
		critIncrease / 100
	) as Record<StatKey, [number | string, number | string]>;

	return {
		percent: formatEquivalence(percent),
		critical: formatEquivalence(critical),
		criticalIncrease: critIncrease
	};
}

function formatEquivalence(
	equivalence: Record<StatKey, [number | string, number | string]>
): Record<StatKey, [string, string]> {
	return Object.fromEntries(
		STAT_KEYS.map((key) => {
			const [flat, percent] = equivalence[key];
			return [
				key,
				[
					typeof flat === 'string' ? flat : flat.toFixed(2),
					typeof percent === 'string' ? percent : `${percent.toFixed(2)}%`
				]
			];
		})
	) as Record<StatKey, [string, string]>;
}

export function signedTone(value: string): 'positive' | 'negative' | 'neutral' {
	if (value.startsWith('+')) return 'positive';
	if (value.startsWith('-')) return 'negative';
	return 'neutral';
}

export { buffs };
