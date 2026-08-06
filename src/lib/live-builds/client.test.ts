import type { Db } from 'jazz-tools';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLiveBuildChanges, listLiveBuilds } from './client.js';
import { LIVE_BUILD_IDENTITY_AUDIENCE, type SnapshotEnvelopeV1 } from './contracts.js';
import { createDefaultState } from '$lib/calculator/model.js';

function envelope(): SnapshotEnvelopeV1 {
	return {
		version: 1,
		title: 'Raid build',
		createdAt: '2026-08-05T00:00:00.000Z',
		stateVersion: 2,
		formulaRevision: '1',
		state: createDefaultState()
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('listLiveBuilds', () => {
	it('authenticates an owned-build list request with the current Jazz identity', async () => {
		const getLocalFirstIdentityProof = vi.fn(() => 'identity-proof');
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) =>
			new Response(JSON.stringify({ builds: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			listLiveBuilds({ getLocalFirstIdentityProof } as unknown as Db)
		).resolves.toEqual({ builds: [] });
		expect(getLocalFirstIdentityProof).toHaveBeenCalledWith({
			ttlSeconds: 60,
			audience: LIVE_BUILD_IDENTITY_AUDIENCE
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [path, options] = fetchMock.mock.calls[0]!;
		expect(path).toBe('/api/live-builds');
		expect(options?.method).toBeUndefined();
		expect(new Headers(options?.headers).get('authorization')).toBe('Bearer identity-proof');
	});
});

describe('buildLiveBuildChanges', () => {
	it('emits leaf changes for independent calculator fields', () => {
		const before = envelope();
		const originalAttack = before.state.stats.attack[0];
		const after = structuredClone(before);
		after.state.stats.attack[0] = '12345';
		after.state.settings.bossWeight = 0.75;

		expect(buildLiveBuildChanges(before, after)).toEqual([
			{ path: '/state/settings/bossWeight', before: 0.5, after: 0.75 },
			{ path: '/state/stats/attack/0', before: originalAttack, after: '12345' }
		]);
	});

	it('returns no changes for structurally equal envelopes', () => {
		const before = envelope();
		expect(buildLiveBuildChanges(before, structuredClone(before))).toEqual([]);
	});
});
