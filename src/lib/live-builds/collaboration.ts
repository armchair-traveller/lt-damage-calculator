import {
	PERCENTLESS_STATS,
	STAT_KEYS,
	STAT_LABELS,
	type StatKey
} from '$lib/calculator/model.js';

export const COLLABORATION_HEARTBEAT_MS = 20_000;
export const COLLABORATION_STALE_AFTER_MS = 45_000;

export const COLLABORATION_PANELS = ['base', 'a', 'b'] as const;
export const COLLABORATION_STAT_VALUES = ['flat', 'percent'] as const;
export const COLLABORATION_PARAMETER_KEYS = [
	'class-preset',
	'target',
	'final-factor',
	'stats-factor',
	'skill-factor',
	'summon-weight',
	'back-weight',
	'minimum-weight',
	'boss-weight'
] as const;

export type CollaborationPanel = (typeof COLLABORATION_PANELS)[number];
export type CollaborationStatValue = (typeof COLLABORATION_STAT_VALUES)[number];
export type CollaborationParameterKey = (typeof COLLABORATION_PARAMETER_KEYS)[number];
export type CollaborationSurface = 'workbench' | 'parameters' | 'buffs';
export type CollaborationTarget =
	| CollaborationSurface
	| `stat:${CollaborationPanel}:${StatKey}:${CollaborationStatValue}`
	| `parameter:${CollaborationParameterKey}`;
export type CollaborationRole = 'creator' | 'editor' | 'viewer';
export type CollaborationPresenceMode = 'edit' | 'view';

export type CollaborationParticipant = {
	id: string;
	sessionIds: string[];
	alias: string;
	color: string;
	role: CollaborationRole;
	mode: CollaborationPresenceMode;
	target: CollaborationTarget | null;
	isSelf: boolean;
	lastSeenAt: number;
};

export type CollaborationPresenceRecord = {
	id: string;
	user_id: string;
	session_id: string;
	mode: CollaborationPresenceMode;
	target?: unknown;
	visible: boolean;
	lastSeenAt: unknown;
	$updatedAt?: unknown;
};

export type AggregateCollaborationParticipantsOptions = {
	slug: string;
	selfUserId: string | null;
	selfRole: CollaborationRole;
	now?: number;
	staleAfterMs?: number;
};

const PANEL_LABELS: Record<CollaborationPanel, string> = {
	base: 'Base',
	a: 'Change A',
	b: 'Change B'
};

const PARAMETER_LABELS: Record<CollaborationParameterKey, string> = {
	'class-preset': 'Class preset',
	target: 'Target',
	'final-factor': 'Final factor',
	'stats-factor': 'Stats factor',
	'skill-factor': 'Skill factor',
	'summon-weight': 'Summon weight',
	'back-weight': 'Back/Melee weight',
	'minimum-weight': 'Minimum weight',
	'boss-weight': 'Boss weight'
};

const ALIAS_ADJECTIVES = [
	'Amber',
	'Brave',
	'Bright',
	'Calm',
	'Copper',
	'Crimson',
	'Daring',
	'Golden',
	'Indigo',
	'Jolly',
	'Lucky',
	'Misty',
	'Quiet',
	'Silver',
	'Swift',
	'Vivid'
] as const;

const ALIAS_NOUNS = [
	'Comet',
	'Dragon',
	'Falcon',
	'Fox',
	'Knight',
	'Lantern',
	'Lotus',
	'Maple',
	'Meteor',
	'Otter',
	'Phoenix',
	'Raven',
	'Sprite',
	'Star',
	'Tiger',
	'Voyager'
] as const;

// Dark enough for white text while remaining distinct as outlines in both themes.
const COLLABORATION_COLORS = [
	'#9f1239',
	'#1d4ed8',
	'#6d28d9',
	'#0f766e',
	'#b45309',
	'#0369a1',
	'#a21caf',
	'#3f6212'
] as const;

const panelSet = new Set<string>(COLLABORATION_PANELS);
const statSet = new Set<string>(STAT_KEYS);
const statValueSet = new Set<string>(COLLABORATION_STAT_VALUES);
const parameterSet = new Set<string>(COLLABORATION_PARAMETER_KEYS);

function stableHash(value: string) {
	let hash = 2_166_136_261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	return hash >>> 0;
}

function timestampMilliseconds(value: unknown) {
	if (value instanceof Date) return value.getTime();
	if (typeof value === 'number') return value;
	if (typeof value === 'string') return new Date(value).getTime();
	return Number.NaN;
}

export function statCollaborationTarget(
	panel: CollaborationPanel,
	stat: StatKey,
	value: CollaborationStatValue | 0 | 1
): CollaborationTarget {
	const valueName = value === 0 ? 'flat' : value === 1 ? 'percent' : value;
	return `stat:${panel}:${stat}:${valueName}`;
}

export function parameterCollaborationTarget(
	parameter: CollaborationParameterKey
): CollaborationTarget {
	return `parameter:${parameter}`;
}

export function parseCollaborationTarget(value: unknown): CollaborationTarget | null {
	if (value === 'workbench' || value === 'parameters' || value === 'buffs') return value;
	if (typeof value !== 'string' || value.length > 80) return null;

	const parts = value.split(':');
	if (
		parts.length === 4 &&
		parts[0] === 'stat' &&
		panelSet.has(parts[1] ?? '') &&
		statSet.has(parts[2] ?? '') &&
		statValueSet.has(parts[3] ?? '')
	) {
		const [, panel, stat, statValue] = parts;
		if (statValue === 'percent' && PERCENTLESS_STATS.has(stat as StatKey)) return null;
		return `stat:${panel as CollaborationPanel}:${stat as StatKey}:${statValue as CollaborationStatValue}`;
	}

	if (parts.length === 2 && parts[0] === 'parameter' && parameterSet.has(parts[1] ?? '')) {
		return `parameter:${parts[1] as CollaborationParameterKey}`;
	}

	return null;
}

export function collaborationTargetLabel(target: CollaborationTarget | null) {
	if (!target) return 'Editing';
	if (target === 'workbench') return 'Workbench';
	if (target === 'parameters') return 'Parameters';
	if (target === 'buffs') return 'Buffs';

	const parts = target.split(':');
	if (parts[0] === 'parameter') {
		return `Parameters · ${PARAMETER_LABELS[parts[1] as CollaborationParameterKey]}`;
	}

	const panel = parts[1] as CollaborationPanel;
	const stat = parts[2] as StatKey;
	const statValue = parts[3] as CollaborationStatValue;
	return `${PANEL_LABELS[panel]} · ${STAT_LABELS[stat]} · ${statValue === 'flat' ? 'Flat' : 'Percent'}`;
}

export function collaborationTargetSurface(
	target: CollaborationTarget | null
): CollaborationSurface | null {
	if (!target) return null;
	if (target === 'workbench' || target.startsWith('stat:')) return 'workbench';
	if (target === 'parameters' || target.startsWith('parameter:')) return 'parameters';
	return 'buffs';
}

export function collaborationTargetPanel(
	target: CollaborationTarget | null
): CollaborationPanel | null {
	if (!target?.startsWith('stat:')) return null;
	return target.split(':')[1] as CollaborationPanel;
}

export function collaborationAlias(slug: string, userId: string) {
	const hash = stableHash(`alias:${slug}:${userId}`);
	const adjective = ALIAS_ADJECTIVES[hash % ALIAS_ADJECTIVES.length];
	const noun = ALIAS_NOUNS[Math.floor(hash / ALIAS_ADJECTIVES.length) % ALIAS_NOUNS.length];
	const suffix = String((Math.floor(hash / 4_096) % 90) + 10);
	return `${adjective} ${noun} ${suffix}`;
}

export function collaborationColor(slug: string, userId: string) {
	return COLLABORATION_COLORS[stableHash(`color:${slug}:${userId}`) % COLLABORATION_COLORS.length];
}

export function aggregateCollaborationParticipants(
	rows: readonly CollaborationPresenceRecord[],
	options: AggregateCollaborationParticipantsOptions
): CollaborationParticipant[] {
	const now = options.now ?? Date.now();
	const staleAfterMs = options.staleAfterMs ?? COLLABORATION_STALE_AFTER_MS;
	const newestRowsByUser = new Map<
		string,
		Array<{ row: CollaborationPresenceRecord; lastSeenAt: number }>
	>();

	for (const row of rows) {
		const lastSeenAt = timestampMilliseconds(row.$updatedAt ?? row.lastSeenAt);
		const age = now - lastSeenAt;
		if (
			!row.visible ||
			!row.user_id ||
			!row.session_id ||
			(row.mode !== 'edit' && row.mode !== 'view') ||
			!Number.isFinite(lastSeenAt) ||
			age > staleAfterMs ||
			age < -staleAfterMs
		) {
			continue;
		}

		const userRows = newestRowsByUser.get(row.user_id) ?? [];
		userRows.push({ row, lastSeenAt });
		newestRowsByUser.set(row.user_id, userRows);
	}

	const participants = Array.from(newestRowsByUser, ([userId, userRows]) => {
		userRows.sort(
			(left, right) =>
				right.lastSeenAt - left.lastSeenAt || left.row.id.localeCompare(right.row.id)
		);
		const editRows = userRows.filter(({ row }) => row.mode === 'edit');
		const activeRow = editRows[0] ?? userRows[0]!;
		const mode: CollaborationPresenceMode = editRows.length > 0 ? 'edit' : 'view';
		const isSelf = userId === options.selfUserId;
		const role: CollaborationRole =
			mode === 'view'
				? 'viewer'
				: isSelf && options.selfRole !== 'viewer'
					? options.selfRole
					: 'editor';

		return {
			id: userId,
			sessionIds: Array.from(new Set(userRows.map(({ row }) => row.session_id))).sort(),
			alias: collaborationAlias(options.slug, userId),
			color: collaborationColor(options.slug, userId),
			role,
			mode,
			target: mode === 'edit' ? parseCollaborationTarget(activeRow.row.target) : null,
			isSelf,
			lastSeenAt: userRows[0]!.lastSeenAt
		};
	});

	return participants.sort(
		(left, right) =>
			Number(right.isSelf) - Number(left.isSelf) ||
			Number(right.mode === 'edit') - Number(left.mode === 'edit') ||
			left.alias.localeCompare(right.alias)
	);
}
