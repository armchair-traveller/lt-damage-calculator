import { describe, expect, it } from 'vitest';
import {
	COLLABORATION_STALE_AFTER_MS,
	aggregateCollaborationParticipants,
	collaborationAlias,
	collaborationColor,
	collaborationTargetLabel,
	collaborationTargetPanel,
	collaborationTargetSurface,
	parameterCollaborationTarget,
	parseCollaborationTarget,
	statCollaborationTarget,
	type CollaborationPresenceRecord
} from './collaboration.js';

function presence(
	overrides: Partial<CollaborationPresenceRecord> = {}
): CollaborationPresenceRecord {
	return {
		id: 'row-1',
		user_id: 'user-1',
		session_id: 'session-1',
		mode: 'edit',
		target: 'stat:base:attack:flat',
		visible: true,
		lastSeenAt: new Date(100_000),
		...overrides
	};
}

describe('collaboration targets', () => {
	it('constructs and parses canonical stat and parameter targets', () => {
		expect(statCollaborationTarget('a', 'critical', 1)).toBe('stat:a:critical:percent');
		expect(parameterCollaborationTarget('boss-weight')).toBe('parameter:boss-weight');
		expect(parseCollaborationTarget('stat:b:attack:flat')).toBe('stat:b:attack:flat');
		expect(parseCollaborationTarget('parameter:class-preset')).toBe('parameter:class-preset');
		expect(parseCollaborationTarget('buffs')).toBe('buffs');
	});

	it('rejects malformed targets and percent fields that do not exist', () => {
		expect(parseCollaborationTarget('stat:c:attack:flat')).toBeNull();
		expect(parseCollaborationTarget('stat:base:not-a-stat:flat')).toBeNull();
		expect(parseCollaborationTarget('stat:base:ratio:percent')).toBeNull();
		expect(parseCollaborationTarget('parameter:not-a-parameter')).toBeNull();
		expect(parseCollaborationTarget(`stat:base:attack:${'x'.repeat(100)}`)).toBeNull();
		expect(parseCollaborationTarget({ target: 'workbench' })).toBeNull();
	});

	it('provides activity labels and navigation groupings', () => {
		const statTarget = statCollaborationTarget('b', 'bossAdded', 'percent');
		expect(collaborationTargetLabel(statTarget)).toBe('Change B · Boss Added · Percent');
		expect(collaborationTargetSurface(statTarget)).toBe('workbench');
		expect(collaborationTargetPanel(statTarget)).toBe('b');
		expect(collaborationTargetLabel(parameterCollaborationTarget('final-factor'))).toBe(
			'Parameters · Final factor'
		);
		expect(collaborationTargetSurface('buffs')).toBe('buffs');
		expect(collaborationTargetPanel('parameters')).toBeNull();
		expect(collaborationTargetLabel(null)).toBe('Editing');
	});
});

describe('anonymous collaboration identity', () => {
	it('is deterministic within a build and salted between builds', () => {
		expect(collaborationAlias('build-a', 'user-1')).toBe(
			collaborationAlias('build-a', 'user-1')
		);
		expect(collaborationColor('build-a', 'user-1')).toBe(
			collaborationColor('build-a', 'user-1')
		);
		expect(collaborationAlias('build-a', 'user-1')).not.toBe(
			collaborationAlias('build-b', 'user-1')
		);
	});
});

describe('aggregateCollaborationParticipants', () => {
	it('groups duplicate sessions by Jazz identity and uses the newest editing target', () => {
		const participants = aggregateCollaborationParticipants(
			[
				presence({
					id: 'older-edit',
					session_id: 'tab-a',
					target: 'stat:base:attack:flat',
					lastSeenAt: new Date(90_000)
				}),
				presence({
					id: 'newer-edit',
					session_id: 'tab-b',
					target: 'parameter:target',
					lastSeenAt: new Date(99_000)
				}),
				presence({
					id: 'newest-view',
					session_id: 'tab-c',
					mode: 'view',
					target: 'buffs',
					lastSeenAt: new Date(100_000)
				})
			],
			{ slug: 'build', selfUserId: 'user-1', selfRole: 'creator', now: 100_000 }
		);

		expect(participants).toHaveLength(1);
		expect(participants[0]).toMatchObject({
			id: 'user-1',
			mode: 'edit',
			role: 'creator',
			target: 'parameter:target',
			isSelf: true,
			lastSeenAt: 100_000
		});
		expect(participants[0]?.sessionIds).toEqual(['tab-a', 'tab-b', 'tab-c']);
	});

	it('keeps viewers in the roster but strips their targets', () => {
		const participants = aggregateCollaborationParticipants(
			[
				presence({
					user_id: 'viewer',
					mode: 'view',
					target: 'stat:a:critical:flat'
				})
			],
			{ slug: 'build', selfUserId: 'editor', selfRole: 'editor', now: 100_000 }
		);

		expect(participants[0]).toMatchObject({
			id: 'viewer',
			role: 'viewer',
			mode: 'view',
			target: null,
			isSelf: false
		});
	});

	it('filters hidden, stale, invalid, and implausibly future rows', () => {
		const participants = aggregateCollaborationParticipants(
			[
				presence({ id: 'hidden', user_id: 'hidden', visible: false }),
				presence({
					id: 'stale',
					user_id: 'stale',
					lastSeenAt: new Date(100_000 - COLLABORATION_STALE_AFTER_MS - 1)
				}),
				presence({ id: 'invalid-date', user_id: 'invalid', lastSeenAt: 'never' }),
				presence({
					id: 'future',
					user_id: 'future',
					lastSeenAt: new Date(100_000 + COLLABORATION_STALE_AFTER_MS + 1)
				}),
				presence({ id: 'active', user_id: 'active' })
			],
			{ slug: 'build', selfUserId: null, selfRole: 'viewer', now: 100_000 }
		);

		expect(participants.map(({ id }) => id)).toEqual(['active']);
	});

	it('uses Jazz system update time instead of a client-supplied heartbeat when available', () => {
		const participants = aggregateCollaborationParticipants(
			[
				presence({
					id: 'forged-client-time',
					user_id: 'active',
					lastSeenAt: new Date('2100-01-01T00:00:00.000Z'),
					$updatedAt: new Date(100_000)
				}),
				presence({
					id: 'stale-system-time',
					user_id: 'stale',
					lastSeenAt: new Date(100_000),
					$updatedAt: new Date(100_000 - COLLABORATION_STALE_AFTER_MS - 1)
				})
			],
			{ slug: 'build', selfUserId: null, selfRole: 'viewer', now: 100_000 }
		);

		expect(participants.map(({ id }) => id)).toEqual(['active']);
	});

	it('sorts the current identity first, then active editors before viewers', () => {
		const participants = aggregateCollaborationParticipants(
			[
				presence({ id: 'viewer', user_id: 'viewer', mode: 'view' }),
				presence({ id: 'editor', user_id: 'editor' }),
				presence({ id: 'self', user_id: 'self', mode: 'view' })
			],
			{ slug: 'build', selfUserId: 'self', selfRole: 'viewer', now: 100_000 }
		);

		expect(participants.map(({ id }) => id)).toEqual(['self', 'editor', 'viewer']);
	});
});
