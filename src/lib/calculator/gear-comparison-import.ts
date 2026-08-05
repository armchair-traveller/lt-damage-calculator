import {
	clearUiStats,
	PERCENTLESS_STATS,
	STAT_KEYS,
	type CalculatorState,
	type NumericPair,
	type StatKey,
	type UiStats
} from './model.js';
import { panelHasEnteredValues, panelHasMeaningfulChanges } from './workbench-impact.js';

export const LT_GEAR_FRAGMENT_PARAM = 'ltgear';
export const LT_GEAR_COMPARISON_KIND = 'lt-gear-comparison';
export const LT_GEAR_COMPARISON_VERSION = 1;
export const LT_GEAR_COMPARISON_SOURCE = 'lt-gear-score-calculator';
export const MAX_LT_GEAR_FRAGMENT_LENGTH = 16 * 1024;
export const MAX_LT_GEAR_ID_LENGTH = 120;
export const MAX_LT_GEAR_TEXT_LENGTH = 200;
export const MAX_LT_GEAR_OMITTED_STATS = 20;
export const MAX_LT_GEAR_ENCHANT_LEVEL = 99;

export type GearComparisonChanges = Partial<Record<StatKey, NumericPair>>;
export type GearComparisonItem = {
	gearType: string;
	pieceType: string;
	enchantLevel?: number;
};
export type GearComparisonOmittedStat = {
	stat: string;
	value: number;
};
export type GearComparisonCandidate = {
	id: string;
	label: string;
	item: GearComparisonItem;
	changes: GearComparisonChanges;
	omitted: GearComparisonOmittedStat[];
};
export type GearComparisonPayload = {
	kind: typeof LT_GEAR_COMPARISON_KIND;
	version: typeof LT_GEAR_COMPARISON_VERSION;
	source: typeof LT_GEAR_COMPARISON_SOURCE;
	candidates: GearComparisonCandidate[];
};
export type ChangeTarget = 'a' | 'b';

const STAT_KEY_SET = new Set<string>(STAT_KEYS);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedNonEmptyString(value: unknown, maxLength: number): value is string {
	return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function normalizePair(value: unknown): NumericPair | null {
	if (
		!Array.isArray(value) ||
		value.length !== 2 ||
		!isFiniteNumber(value[0]) ||
		!isFiniteNumber(value[1]) ||
		value[0] < 0 ||
		value[1] < 0
	) {
		return null;
	}

	return [value[0], value[1]];
}

function normalizeChanges(value: unknown): GearComparisonChanges | null {
	if (!isRecord(value)) return null;

	const keys = Object.keys(value);
	if (keys.some((key) => !STAT_KEY_SET.has(key))) return null;

	const changes: GearComparisonChanges = {};
	let hasPositiveChange = false;
	for (const key of STAT_KEYS) {
		if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
		const pair = normalizePair(value[key]);
		if (!pair) return null;
		if (PERCENTLESS_STATS.has(key) && pair[1] !== 0) return null;
		if (pair[0] > 0 || pair[1] > 0) hasPositiveChange = true;
		changes[key] = pair;
	}

	return hasPositiveChange ? changes : null;
}

function normalizeItem(value: unknown): GearComparisonItem | null {
	if (
		!isRecord(value) ||
		!isBoundedNonEmptyString(value.gearType, MAX_LT_GEAR_TEXT_LENGTH) ||
		!isBoundedNonEmptyString(value.pieceType, MAX_LT_GEAR_TEXT_LENGTH)
	) {
		return null;
	}

	const item: GearComparisonItem = {
		gearType: value.gearType,
		pieceType: value.pieceType
	};

	if (value.enchantLevel !== undefined) {
		if (
			!isFiniteNumber(value.enchantLevel) ||
			!Number.isInteger(value.enchantLevel) ||
			value.enchantLevel < 0 ||
			value.enchantLevel > MAX_LT_GEAR_ENCHANT_LEVEL
		) {
			return null;
		}
		item.enchantLevel = value.enchantLevel;
	}

	return item;
}

function normalizeOmitted(value: unknown): GearComparisonOmittedStat[] | null {
	if (!Array.isArray(value) || value.length > MAX_LT_GEAR_OMITTED_STATS) return null;

	const omitted: GearComparisonOmittedStat[] = [];
	for (const entry of value) {
		if (
			!isRecord(entry) ||
			!isBoundedNonEmptyString(entry.stat, MAX_LT_GEAR_TEXT_LENGTH) ||
			!isFiniteNumber(entry.value) ||
			entry.value <= 0
		) {
			return null;
		}
		omitted.push({ stat: entry.stat, value: entry.value });
	}

	return omitted;
}

function normalizeCandidate(value: unknown): GearComparisonCandidate | null {
	if (
		!isRecord(value) ||
		!isBoundedNonEmptyString(value.id, MAX_LT_GEAR_ID_LENGTH) ||
		!isBoundedNonEmptyString(value.label, MAX_LT_GEAR_TEXT_LENGTH)
	) {
		return null;
	}

	const item = normalizeItem(value.item);
	const changes = normalizeChanges(value.changes);
	const omitted = normalizeOmitted(value.omitted);
	if (!item || !changes || !omitted) return null;

	return {
		id: value.id,
		label: value.label,
		item,
		changes,
		omitted
	};
}

export function normalizeGearComparisonPayload(value: unknown): GearComparisonPayload | null {
	if (
		!isRecord(value) ||
		value.kind !== LT_GEAR_COMPARISON_KIND ||
		value.version !== LT_GEAR_COMPARISON_VERSION ||
		value.source !== LT_GEAR_COMPARISON_SOURCE ||
		!Array.isArray(value.candidates) ||
		value.candidates.length < 1 ||
		value.candidates.length > 2
	) {
		return null;
	}

	const candidates: GearComparisonCandidate[] = [];
	for (const candidateValue of value.candidates) {
		const candidate = normalizeCandidate(candidateValue);
		if (!candidate) return null;
		candidates.push(candidate);
	}

	return {
		kind: LT_GEAR_COMPARISON_KIND,
		version: LT_GEAR_COMPARISON_VERSION,
		source: LT_GEAR_COMPARISON_SOURCE,
		candidates
	};
}

export function parseGearComparisonFragment(fragment: string): GearComparisonPayload | null {
	try {
		const hashIndex = fragment.indexOf('#');
		const rawFragment = hashIndex >= 0 ? fragment.slice(hashIndex + 1) : fragment.replace(/^#/, '');
		if (rawFragment.length > MAX_LT_GEAR_FRAGMENT_LENGTH) return null;
		const params = new URLSearchParams(rawFragment);
		const payloadValues = params.getAll(LT_GEAR_FRAGMENT_PARAM);
		if (payloadValues.length !== 1) return null;

		return normalizeGearComparisonPayload(JSON.parse(payloadValues[0]));
	} catch {
		return null;
	}
}

export function candidateChangesToUiStats(candidate: GearComparisonCandidate): UiStats {
	const stats = clearUiStats();

	for (const key of STAT_KEYS) {
		const pair = candidate.changes[key];
		if (!pair) continue;
		stats[key] = [pair[0] === 0 ? '' : String(pair[0]), pair[1] === 0 ? '' : String(pair[1])];
	}

	return stats;
}

export function mergeGearComparisonCandidate(
	state: CalculatorState,
	candidate: GearComparisonCandidate,
	target: ChangeTarget
): CalculatorState {
	const stats = candidateChangesToUiStats(candidate);
	if (target === 'a') return { ...state, statsA: stats };
	if (target === 'b') return { ...state, statsB: stats };
	throw new RangeError(`Unknown comparison target: ${String(target)}`);
}

export function findFirstEmptyChangeTarget(state: CalculatorState): ChangeTarget | null {
	const panelIsUsed = (stats: UiStats) =>
		panelHasMeaningfulChanges(stats) || panelHasEnteredValues(stats);

	if (!panelIsUsed(state.statsA)) return 'a';
	if (!panelIsUsed(state.statsB)) return 'b';
	return null;
}
