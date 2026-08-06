import { randomUUID } from 'node:crypto';

import { mintLocalFirstToken, verifyLocalFirstIdentityProof } from 'jazz-napi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deploy, startLocalJazzServer, type LocalJazzServerHandle } from 'jazz-tools/testing';

import { createDefaultState } from '$lib/calculator/model';
import { createSnapshotEnvelope } from '$lib/calculator/snapshot-codec';
import { LIVE_BUILD_IDENTITY_AUDIENCE } from '$lib/live-builds/contracts';
import { permissions } from '$lib/permissions';
import { app } from '$lib/schema';

import { shutdownLiveBuildJazzContext } from './jazz-context';
import { LiveBuildError } from './errors';
import { JazzLiveBuildRepository } from './repository';
import {
	cleanupExpiredLiveBuilds,
	createLiveBuild,
	deleteLiveBuild,
	getLiveBuild,
	patchLiveBuild,
	pinLiveBuild,
	redeemLiveBuildEdit,
	rotateLiveBuildEditLink
} from './service';

const APP_ID = randomUUID();
const BACKEND_SECRET = `backend-${randomUUID()}`;
const ADMIN_SECRET = `admin-${randomUUID()}`;
const ORIGIN = 'https://calculator.example';

let server: LocalJazzServerHandle;

function actor(fill: number): string {
	const secret = Buffer.alloc(32, fill).toString('base64url');
	const proof = mintLocalFirstToken(secret, LIVE_BUILD_IDENTITY_AUDIENCE, 60);
	return verifyLocalFirstIdentityProof(proof, LIVE_BUILD_IDENTITY_AUDIENCE).id;
}

beforeAll(async () => {
	server = await startLocalJazzServer({
		appId: APP_ID,
		backendSecret: BACKEND_SECRET,
		adminSecret: ADMIN_SECRET,
		inMemory: true
	});
	await deploy({
		appId: APP_ID,
		serverUrl: server.url,
		adminSecret: ADMIN_SECRET,
		schema: app,
		permissions
	});
	process.env.PUBLIC_JAZZ_APP_ID = APP_ID;
	process.env.PUBLIC_JAZZ_SERVER_URL = server.url;
	process.env.JAZZ_BACKEND_SECRET = BACKEND_SECRET;
	delete process.env.JAZZ_ADMIN_SECRET;
}, 20_000);

afterAll(async () => {
	await shutdownLiveBuildJazzContext();
	await server.stop();
}, 20_000);

describe('Jazz-backed live build lifecycle', () => {
	it('creates, grants, patches, rotates, pins and stops a live build', async () => {
		const creator = actor(13);
		const editor = actor(14);
		const snapshot = createSnapshotEnvelope({ title: 'Raid setup', state: createDefaultState() });
		const created = await createLiveBuild(creator, { title: 'Raid setup', snapshot }, ORIGIN);

		expect(created.build.role).toBe('creator');
		expect(created.links.viewUrl).toContain(`#share=${created.build.publicSlug}`);
		expect((await getLiveBuild(created.build.publicSlug, null)).role).toBe('viewer');

		const redeemed = await redeemLiveBuildEdit(created.build.publicSlug, editor, {
			editSecret: created.editSecret
		});
		expect(redeemed.role).toBe('editor');
		const repository = new JazzLiveBuildRepository(creator);
		const storedBuild = await repository.findBuildBySlug(created.build.publicSlug);
		expect(storedBuild).not.toBeNull();
		expect(await repository.listEditors(storedBuild!.id)).toHaveLength(1);
		expect(await repository.listCapabilities(storedBuild!.id)).toHaveLength(1);

		const before = created.build.snapshot.state.stats.attack[0];
		const patched = await patchLiveBuild(created.build.publicSlug, editor, {
			baseRevision: 1,
			changes: [{ path: '/state/stats/attack/0', before, after: '12345' }]
		});
		expect(patched.revision).toBe(2);
		expect(patched.snapshot.state.stats.attack[0]).toBe('12345');

		await expect(
			patchLiveBuild(created.build.publicSlug, creator, {
				baseRevision: 1,
				changes: [{ path: '/state/stats/attack/0', before, after: '99999' }]
			})
		).rejects.toMatchObject({ status: 409, code: 'conflict' });

		const rotated = await rotateLiveBuildEditLink(created.build.publicSlug, creator, ORIGIN);
		expect(rotated.editSecret).not.toBe(created.editSecret);
		expect(await repository.listEditors(storedBuild!.id)).toEqual([]);
		const rotatedCapabilities = await repository.listCapabilities(storedBuild!.id);
		expect(rotatedCapabilities).toHaveLength(1);
		expect(rotatedCapabilities[0]).toMatchObject({ generation: 2, revoked: false });
		await expect(
			patchLiveBuild(created.build.publicSlug, editor, {
				baseRevision: 2,
				changes: [{ path: '/state/stats/attack/0', before: '12345', after: '12346' }]
			})
		).rejects.toMatchObject({ status: 403, code: 'forbidden' });

		const pinned = await pinLiveBuild(created.build.publicSlug, creator, { pinned: true });
		expect(pinned.pinned).toBe(true);
		expect(pinned.expiresAt).toBeNull();

		await deleteLiveBuild(created.build.publicSlug, creator);
		await expect(getLiveBuild(created.build.publicSlug, null)).rejects.toBeInstanceOf(LiveBuildError);
	}, 40_000);

	it('cleans up an expired unpinned build', async () => {
		const creator = actor(15);
		const snapshot = createSnapshotEnvelope({ title: 'Temporary', state: createDefaultState() });
		const oldNow = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
		const created = await createLiveBuild(creator, { title: 'Temporary', snapshot }, ORIGIN, oldNow);
		const result = await cleanupExpiredLiveBuilds(new Date());
		expect(result.deleted).toBeGreaterThanOrEqual(1);
		await expect(getLiveBuild(created.build.publicSlug, null)).rejects.toMatchObject({
			status: 404,
			code: 'not_found'
		});
	}, 40_000);

	it('expires an unpinned build relative to its last successful edit', async () => {
		const creator = actor(16);
		const snapshot = createSnapshotEnvelope({ title: 'Pinned archive', state: createDefaultState() });
		const lastEditedAt = new Date('2026-01-01T00:00:00.000Z');
		const created = await createLiveBuild(
			creator,
			{ title: 'Pinned archive', snapshot },
			ORIGIN,
			lastEditedAt
		);
		await pinLiveBuild(
			created.build.publicSlug,
			creator,
			{ pinned: true },
			new Date('2026-01-02T00:00:00.000Z')
		);

		const unpinned = await pinLiveBuild(
			created.build.publicSlug,
			creator,
			{ pinned: false },
			new Date('2026-03-01T00:00:00.000Z')
		);
		expect(unpinned.expiresAt).toBe('2026-01-31T00:00:00.000Z');

		await deleteLiveBuild(created.build.publicSlug, creator);
	}, 40_000);
});
