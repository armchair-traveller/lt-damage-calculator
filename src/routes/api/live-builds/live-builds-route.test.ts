import { mintLocalFirstToken, verifyLocalFirstIdentityProof } from 'jazz-napi';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultState } from '$lib/calculator/model';
import { createSnapshotEnvelope } from '$lib/calculator/snapshot-codec';
import { LIVE_BUILD_IDENTITY_AUDIENCE } from '$lib/live-builds/contracts';
import { encodeStoredEnvelope } from '$lib/server/live-builds/envelope';
import { JazzLiveBuildRepository } from '$lib/server/live-builds/repository';

import { GET } from './+server.js';

afterEach(() => {
	vi.restoreAllMocks();
});

function identity(): { actorId: string; proof: string } {
	const secret = Buffer.alloc(32, 21).toString('base64url');
	const proof = mintLocalFirstToken(secret, LIVE_BUILD_IDENTITY_AUDIENCE, 60);
	const result = verifyLocalFirstIdentityProof(proof, LIVE_BUILD_IDENTITY_AUDIENCE);
	if (!result.ok) throw new Error('Could not create a test identity.');
	return { actorId: result.id, proof };
}

describe('GET /api/live-builds', () => {
	it('requires a Jazz identity proof', async () => {
		const response = await GET({
			request: new Request('https://example.test/api/live-builds')
		} as Parameters<typeof GET>[0]);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toMatchObject({
			error: { code: 'unauthorized' }
		});
	});

	it('returns the current identity\'s active builds without caching', async () => {
		const { actorId, proof } = identity();
		const snapshot = createSnapshotEnvelope({
			title: 'Recovered build',
			state: createDefaultState()
		});
		vi.spyOn(JazzLiveBuildRepository.prototype, 'listBuildsByCreator').mockResolvedValue([
			{
				id: 'build-1',
				publicSlug: '1'.padStart(32, '0'),
				title: snapshot.title,
				creator_id: actorId,
				envelope: encodeStoredEnvelope(snapshot),
				stateVersion: snapshot.stateVersion,
				formulaRevision: snapshot.formulaRevision,
				revision: 1,
				editGeneration: 1,
				pinned: false,
				lastEditedAt: new Date('2098-01-01T00:00:00.000Z'),
				expiresAt: new Date('2099-01-01T00:00:00.000Z')
			}
		]);

		const response = await GET({
			request: new Request('https://example.test/api/live-builds', {
				headers: { authorization: `Bearer ${proof}` }
			})
		} as Parameters<typeof GET>[0]);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(body.builds).toHaveLength(1);
		expect(body.builds[0]).toMatchObject({ title: 'Recovered build', role: 'creator' });
		expect(body.builds[0]).not.toHaveProperty('editSecret');
	});
});
