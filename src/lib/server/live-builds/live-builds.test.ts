import { mintLocalFirstToken } from 'jazz-napi';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultState } from '$lib/calculator/model';
import { createSnapshotEnvelope } from '$lib/calculator/snapshot-codec';
import { buildLiveBuildChanges } from '$lib/live-builds/client';
import { LIVE_BUILD_IDENTITY_AUDIENCE, type JsonValue } from '$lib/live-builds/contracts';
import { permissions } from '$lib/permissions';
import type { LiveBuildRow } from '$lib/schema';

import { requireLiveBuildActor } from './auth';
import { createEditSecret, editSecretMatches, hashEditSecret } from './crypto';
import { decodeStoredEnvelope, encodeStoredEnvelope, normalizeSnapshotEnvelope } from './envelope';
import { LiveBuildError } from './errors';
import {
	MAX_LIVE_BUILD_PATCH_CHANGES,
	applyLiveBuildChanges,
	parsePatchChanges
} from './json-patch';
import { JazzLiveBuildRepository } from './repository';
import {
	MAX_LIVE_BUILD_EDITORS_PER_GENERATION,
	cleanupExpiredLiveBuilds,
	listLiveBuilds,
	redeemLiveBuildEdit
} from './service';

afterEach(() => {
	vi.restoreAllMocks();
});

function mutateEveryJsonLeaf(value: JsonValue): JsonValue {
	if (value === null) return true;
	if (typeof value === 'string') return `${value}-changed`;
	if (typeof value === 'number') return value + 1;
	if (typeof value === 'boolean') return !value;
	if (Array.isArray(value)) return value.map(mutateEveryJsonLeaf);
	return Object.fromEntries(
		Object.entries(value).map(([key, child]) => [key, mutateEveryJsonLeaf(child)])
	);
}

function cleanupCandidate(index: number): LiveBuildRow {
	return {
		id: `build-${index}`,
		publicSlug: String(index).padStart(32, '0'),
		title: `Build ${index}`,
		creator_id: 'creator',
		envelope: new Uint8Array(),
		stateVersion: 2,
		formulaRevision: '1',
		revision: 1,
		editGeneration: 1,
		pinned: false,
		lastEditedAt: new Date('2026-01-01T00:00:00.000Z'),
		expiresAt: new Date('2026-01-31T00:00:00.000Z')
	};
}

describe('live build identity proofs', () => {
	it('accepts a current proof minted for the API audience', () => {
		const secret = Buffer.alloc(32, 7).toString('base64url');
		const token = mintLocalFirstToken(secret, LIVE_BUILD_IDENTITY_AUDIENCE, 60);
		const actorId = requireLiveBuildActor(
			new Request('https://example.test/api/live-builds', {
				headers: { authorization: `Bearer ${token}` }
			})
		);
		expect(actorId).toMatch(/^[a-f0-9-]{36}$/);
	});

	it('rejects a proof minted for a different audience', () => {
		const secret = Buffer.alloc(32, 8).toString('base64url');
		const token = mintLocalFirstToken(secret, 'somewhere-else', 60);
		expect(() =>
			requireLiveBuildActor(
				new Request('https://example.test/api/live-builds', {
					headers: { authorization: `Bearer ${token}` }
				})
			)
		).toThrow(LiveBuildError);
	});
});

describe('live build edit capabilities', () => {
	it('uses a fixed-size random secret and constant-time hash comparison', () => {
		const secret = createEditSecret();
		const hash = hashEditSecret(secret);
		expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(hash).toMatch(/^[a-f0-9]{64}$/);
		expect(editSecretMatches(secret, hash)).toBe(true);
		expect(editSecretMatches(createEditSecret(), hash)).toBe(false);
	});

	it('serializes concurrent redemptions and caps each edit generation at 32 editors', async () => {
		const secret = createEditSecret();
		const build = {
			...cleanupCandidate(99),
			creator_id: 'creator',
			envelope: encodeStoredEnvelope(
				createSnapshotEnvelope({ title: 'Shared build', state: createDefaultState() })
			),
			expiresAt: new Date('2099-01-01T00:00:00.000Z')
		};
		const editors: Array<{
			id: string;
			build_id: string;
			user_id: string;
			generation: number;
			revoked: boolean;
			redeemedAt: Date;
		}> = [];
		let grantsInFlight = 0;
		let maxGrantsInFlight = 0;

		vi.spyOn(JazzLiveBuildRepository.prototype, 'findBuildBySlug').mockResolvedValue(build);
		vi.spyOn(JazzLiveBuildRepository.prototype, 'findCapability').mockResolvedValue({
			id: 'capability-1',
			build_id: build.id,
			generation: build.editGeneration,
			secretHash: hashEditSecret(secret),
			revoked: false
		});
		vi.spyOn(JazzLiveBuildRepository.prototype, 'findEditor').mockImplementation(
			async (_buildId, userId, generation) =>
				editors.find(
					(editor) =>
						editor.user_id === userId && editor.generation === generation && !editor.revoked
				) ?? null
		);
		vi.spyOn(
			JazzLiveBuildRepository.prototype,
			'listActiveEditorsForGeneration'
		).mockImplementation(async (_buildId, generation) =>
			editors.filter((editor) => editor.generation === generation && !editor.revoked)
		);
		vi.spyOn(JazzLiveBuildRepository.prototype, 'grantEditor').mockImplementation(
			async (buildId, userId, generation, redeemedAt) => {
				grantsInFlight += 1;
				maxGrantsInFlight = Math.max(maxGrantsInFlight, grantsInFlight);
				await Promise.resolve();
				const existingIndex = editors.findIndex(
					(editor) => editor.user_id === userId && editor.generation === generation
				);
				const editor = {
					id: existingIndex === -1 ? `editor-${userId}` : editors[existingIndex].id,
					build_id: buildId,
					user_id: userId,
					generation,
					revoked: false,
					redeemedAt
				};
				if (existingIndex === -1) editors.push(editor);
				else editors[existingIndex] = editor;
				grantsInFlight -= 1;
			}
		);

		const actorIds = Array.from(
			{ length: MAX_LIVE_BUILD_EDITORS_PER_GENERATION + 1 },
			(_, index) => `actor-${index}`
		);
		const results = await Promise.allSettled(
			actorIds.map((actorId) =>
				redeemLiveBuildEdit(build.publicSlug, actorId, { editSecret: secret })
			)
		);

		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(
			MAX_LIVE_BUILD_EDITORS_PER_GENERATION
		);
		const rejected = results.filter(
			(result): result is PromiseRejectedResult => result.status === 'rejected'
		);
		expect(rejected).toHaveLength(1);
		expect(rejected[0].reason).toMatchObject({ status: 429, code: 'quota_exceeded' });
		expect(editors).toHaveLength(MAX_LIVE_BUILD_EDITORS_PER_GENERATION);
		expect(maxGrantsInFlight).toBe(1);

		await expect(
			redeemLiveBuildEdit(build.publicSlug, actorIds[0], { editSecret: secret })
		).resolves.toMatchObject({ role: 'editor' });
		expect(editors).toHaveLength(MAX_LIVE_BUILD_EDITORS_PER_GENERATION);
	});
});

describe('live build envelopes', () => {
	it('normalizes, compresses and restores a calculator snapshot', () => {
		const snapshot = createSnapshotEnvelope({ title: ' Raid build ', state: createDefaultState() });
		const normalized = normalizeSnapshotEnvelope(snapshot, { title: 'Raid build' });
		const frozenSummary = normalized.frozenSummary as {
			results: { base: { avg: string } };
		};
		frozenSummary.results.base.avg = 'historical-result';
		const restored = decodeStoredEnvelope(encodeStoredEnvelope(normalized));
		expect(restored).toEqual(normalized);
		expect(
			(restored.frozenSummary as { results: { base: { avg: string } } }).results.base.avg
		).toBe('historical-result');
	});
});

describe('owned live build discovery', () => {
	it('returns only the actor\'s active builds with newest edits first', async () => {
		const actorId = 'creator';
		const now = new Date('2026-02-01T00:00:00.000Z');
		const envelope = encodeStoredEnvelope(
			createSnapshotEnvelope({ title: 'Recovered build', state: createDefaultState() })
		);
		const older = {
			...cleanupCandidate(11),
			title: 'Older active build',
			envelope,
			lastEditedAt: new Date('2026-01-10T00:00:00.000Z'),
			expiresAt: new Date('2026-02-09T00:00:00.000Z')
		};
		const newest = {
			...cleanupCandidate(12),
			title: 'Newest active build',
			envelope,
			lastEditedAt: new Date('2026-01-20T00:00:00.000Z'),
			expiresAt: new Date('2026-02-19T00:00:00.000Z')
		};
		const pinned = {
			...cleanupCandidate(13),
			title: 'Pinned active build',
			envelope,
			pinned: true,
			lastEditedAt: new Date('2026-01-15T00:00:00.000Z'),
			expiresAt: new Date('2026-01-01T00:00:00.000Z')
		};
		const expired = {
			...cleanupCandidate(14),
			title: 'Expired build',
			envelope: new Uint8Array(),
			lastEditedAt: new Date('2026-01-25T00:00:00.000Z'),
			expiresAt: now
		};
		const anotherCreator = {
			...cleanupCandidate(15),
			title: 'Someone else\'s build',
			creator_id: 'someone-else',
			envelope: new Uint8Array(),
			lastEditedAt: new Date('2026-01-30T00:00:00.000Z'),
			expiresAt: new Date('2026-03-01T00:00:00.000Z')
		};
		const listByCreator = vi
			.spyOn(JazzLiveBuildRepository.prototype, 'listBuildsByCreator')
			.mockResolvedValue([expired, older, anotherCreator, pinned, newest]);

		const result = await listLiveBuilds(actorId, now);

		expect(listByCreator).toHaveBeenCalledWith(actorId);
		expect(result.builds.map((build) => build.title)).toEqual([
			'Newest active build',
			'Pinned active build',
			'Older active build'
		]);
		expect(result.builds.every((build) => build.role === 'creator')).toBe(true);
		expect(result.builds.every((build) => !('editSecret' in build))).toBe(true);
	});
});

describe('live build leaf patches', () => {
	it('allows one patch to carry every normalized calculator leaf', () => {
		const before = createSnapshotEnvelope({ title: 'Build', state: createDefaultState() });
		const after = structuredClone(before);
		after.title = 'Changed build';
		after.state = mutateEveryJsonLeaf(
			before.state as unknown as JsonValue
		) as unknown as typeof after.state;

		const changes = buildLiveBuildChanges(before, after);
		expect(changes).toHaveLength(149);
		expect(MAX_LIVE_BUILD_PATCH_CHANGES).toBeGreaterThan(changes.length);
		expect(parsePatchChanges(changes)).toEqual(changes);
	});

	it('accepts 256 unique changes but rejects a larger patch', () => {
		const changes = Array.from({ length: MAX_LIVE_BUILD_PATCH_CHANGES }, (_, index) => ({
			path: `/state/synthetic/${index}`,
			before: null,
			after: index
		}));
		expect(parsePatchChanges(changes)).toHaveLength(MAX_LIVE_BUILD_PATCH_CHANGES);
		expect(() =>
			parsePatchChanges([
				...changes,
				{ path: '/state/synthetic/overflow', before: null, after: true }
			])
		).toThrow(LiveBuildError);
	});

	it('merges an unchanged leaf even when the base revision is stale', () => {
		const current = {
			title: 'Build',
			state: { stats: { attack: ['100', '0%'] }, settings: { bossWeight: 0.5 } }
		};
		const changes = parsePatchChanges([
			{ path: '/state/stats/attack/0', before: '100', after: '125' }
		]);
		const result = applyLiveBuildChanges(current, changes);
		expect(result.changed).toBe(true);
		expect(result.conflictingPaths).toEqual([]);
		expect(result.next.state.stats.attack[0]).toBe('125');
		expect(result.next.state.settings.bossWeight).toBe(0.5);
	});

	it('reports a same-field conflict without overwriting the shared value', () => {
		const current = { title: 'Build', state: { value: 200 } };
		const changes = parsePatchChanges([
			{ path: '/state/value', before: 100, after: 150 }
		]);
		const result = applyLiveBuildChanges(current, changes);
		expect(result.changed).toBe(false);
		expect(result.conflictingPaths).toEqual(['/state/value']);
		expect(result.next.state.value).toBe(200);
	});

	it('rejects metadata and prototype paths', () => {
		expect(() =>
			parsePatchChanges([{ path: '/formulaRevision', before: '1', after: '2' }])
		).toThrow(LiveBuildError);
		expect(() =>
			parsePatchChanges([{ path: '/state/__proto__/polluted', before: false, after: true }])
		).toThrow(LiveBuildError);
	});
});

describe('expired live build cleanup', () => {
	it('drains multiple pages and isolates a row deletion failure', async () => {
		const rows = [cleanupCandidate(1), cleanupCandidate(2), cleanupCandidate(3)];
		const deletedIds = new Set<string>();
		vi.spyOn(JazzLiveBuildRepository.prototype, 'findExpiredBuilds').mockImplementation(
			async (_now, limit, offset = 0) =>
				rows.filter((row) => !deletedIds.has(row.id)).slice(offset, offset + limit)
		);
		vi.spyOn(JazzLiveBuildRepository.prototype, 'findBuildBySlug').mockImplementation(
			async (slug) => rows.find((row) => row.publicSlug === slug && !deletedIds.has(row.id)) ?? null
		);
		const deleteBuild = vi
			.spyOn(JazzLiveBuildRepository.prototype, 'deleteBuildAndChildren')
			.mockImplementation(async (build) => {
				if (build.id === rows[0].id) throw new Error('poison row');
				deletedIds.add(build.id);
			});

		await expect(
			cleanupExpiredLiveBuilds(new Date('2026-02-01T00:00:00.000Z'), 1, {
				runtimeBudgetMs: 1_000,
				clock: () => 0
			})
		).resolves.toEqual({ examined: 3, deleted: 2, failed: 1 });
		expect(deleteBuild).toHaveBeenCalledTimes(3);
	});

	it('stops starting new cleanup work when its runtime budget is spent', async () => {
		const rows = [cleanupCandidate(4), cleanupCandidate(5)];
		const deletedIds = new Set<string>();
		let elapsed = 0;
		vi.spyOn(JazzLiveBuildRepository.prototype, 'findExpiredBuilds').mockImplementation(
			async (_now, limit, offset = 0) =>
				rows.filter((row) => !deletedIds.has(row.id)).slice(offset, offset + limit)
		);
		vi.spyOn(JazzLiveBuildRepository.prototype, 'findBuildBySlug').mockImplementation(
			async (slug) => rows.find((row) => row.publicSlug === slug && !deletedIds.has(row.id)) ?? null
		);
		vi.spyOn(JazzLiveBuildRepository.prototype, 'deleteBuildAndChildren').mockImplementation(
			async (build) => {
				deletedIds.add(build.id);
				elapsed = 100;
			}
		);

		await expect(
			cleanupExpiredLiveBuilds(new Date('2026-02-01T00:00:00.000Z'), 1, {
				runtimeBudgetMs: 50,
				clock: () => elapsed
			})
		).resolves.toEqual({ examined: 1, deleted: 1, failed: 0 });
		expect(deletedIds).toEqual(new Set([rows[0].id]));
	});
});

describe('Jazz live build permissions', () => {
	it('allows public payload reads and denies every client mutation/private-table operation', () => {
		expect(permissions.liveBuilds.select?.using).toEqual({ type: 'True' });
		expect(permissions.liveBuilds.insert?.with_check).toEqual({ type: 'False' });
		expect(permissions.liveBuilds.update?.using).toEqual({ type: 'False' });
		expect(permissions.liveBuilds.delete?.using).toEqual({ type: 'False' });
		expect(permissions.liveBuildEditCapabilities.select?.using).toEqual({ type: 'False' });
		expect(permissions.liveBuildEditors.select?.using).toEqual({ type: 'False' });
	});
});
