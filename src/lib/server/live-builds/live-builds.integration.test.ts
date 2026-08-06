import { randomUUID } from 'node:crypto';

import { mintLocalFirstToken, verifyLocalFirstIdentityProof } from 'jazz-napi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deploy, startLocalJazzServer, type LocalJazzServerHandle } from 'jazz-tools/testing';

import { createDefaultState } from '$lib/calculator/model';
import { createSnapshotEnvelope } from '$lib/calculator/snapshot-codec';
import { LIVE_BUILD_IDENTITY_AUDIENCE } from '$lib/live-builds/contracts';
import { permissions } from '$lib/permissions';
import { app } from '$lib/schema';

import { getLiveBuildJazzContext, shutdownLiveBuildJazzContext } from './jazz-context';
import { LiveBuildError } from './errors';
import { JazzLiveBuildRepository } from './repository';
import {
	cleanupExpiredLiveBuilds,
	createLiveBuild,
	deleteLiveBuild,
	getLiveBuild,
	listLiveBuilds,
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

function localFirstIdentity(fill: number): { id: string; token: string } {
	const secret = Buffer.alloc(32, fill).toString('base64url');
	const token = mintLocalFirstToken(secret, APP_ID, 60);
	return { id: verifyLocalFirstIdentityProof(token, APP_ID).id, token };
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
	it('allows accountless visitors to publish only owned, non-authoritative presence', async () => {
		const creator = localFirstIdentity(21);
		const visitor = localFirstIdentity(22);
		const stranger = localFirstIdentity(23);
		const snapshot = createSnapshotEnvelope({
			title: 'Presence room',
			state: createDefaultState()
		});
		const first = await createLiveBuild(
			creator.id,
			{ title: 'Presence room', snapshot },
			ORIGIN
		);
		const second = await createLiveBuild(
			creator.id,
			{ title: 'Another room', snapshot },
			ORIGIN
		);
		const repository = new JazzLiveBuildRepository(creator.id);
		const firstRow = await repository.findBuildBySlug(first.build.publicSlug);
		const secondRow = await repository.findBuildBySlug(second.build.publicSlug);
		expect(firstRow).not.toBeNull();
		expect(secondRow).not.toBeNull();

		const context = getLiveBuildJazzContext();
		const visitorDb = await context.forRequest({
			headers: { authorization: `Bearer ${visitor.token}` }
		});
		const strangerDb = await context.forRequest({
			headers: { authorization: `Bearer ${stranger.token}` }
		});
		const presence = await visitorDb
			.insert(app.liveBuildPresence, {
				build_id: firstRow!.id,
				generation: firstRow!.editGeneration,
				user_id: visitor.id,
				session_id: 'visitor-tab',
				mode: 'view',
				target: null,
				visible: true,
				lastSeenAt: new Date()
			})
			.wait({ tier: 'global' });

		await expect(async () =>
			visitorDb
				.insert(app.liveBuildPresence, {
					build_id: firstRow!.id,
					generation: firstRow!.editGeneration,
					user_id: stranger.id,
					session_id: 'forged-owner',
					mode: 'view',
					target: null,
					visible: true,
					lastSeenAt: new Date()
				})
				.wait({ tier: 'global' })
		).rejects.toThrow();
		await expect(async () =>
			visitorDb
				.insert(app.liveBuildPresence, {
					build_id: firstRow!.id,
					generation: firstRow!.editGeneration + 1,
					user_id: visitor.id,
					session_id: 'future-generation',
					mode: 'view',
					target: null,
					visible: true,
					lastSeenAt: new Date()
				})
				.wait({ tier: 'global' })
		).rejects.toThrow();
		await expect(async () =>
			strangerDb
				.update(app.liveBuildPresence, presence.id, { target: 'stat:base:attack:flat' })
				.wait({ tier: 'global' })
		).rejects.toThrow();

		await visitorDb
			.update(app.liveBuildPresence, presence.id, {
				visible: false,
				lastSeenAt: new Date()
			})
			.wait({ tier: 'global' });
		const publicRows = await strangerDb.all(
			app.liveBuildPresence.where({ id: presence.id }),
			{ tier: 'global' }
		);
		expect(publicRows).toHaveLength(1);

		// Jazz 2 cannot compare OLD and NEW row columns in update permissions. A
		// custom client can retarget only its own disposable UI row to another
		// current room; doing so never grants authority over durable build data.
		await visitorDb
			.update(app.liveBuildPresence, presence.id, {
				build_id: secondRow!.id,
				generation: secondRow!.editGeneration,
				mode: 'edit'
			})
			.wait({ tier: 'global' });
		await expect(async () =>
			visitorDb
				.update(app.liveBuilds, secondRow!.id, { title: 'Forged edit' })
				.wait({ tier: 'global' })
		).rejects.toThrow();
		await expect(
			patchLiveBuild(second.build.publicSlug, visitor.id, {
				baseRevision: second.build.revision,
				changes: [{ path: '/title', before: second.build.title, after: 'Forged edit' }]
			})
		).rejects.toMatchObject({ status: 403, code: 'forbidden' });

		await visitorDb.delete(app.liveBuildPresence, presence.id).wait({ tier: 'global' });
		await deleteLiveBuild(first.build.publicSlug, creator.id);
		await deleteLiveBuild(second.build.publicSlug, creator.id);
	}, 40_000);

	it('recovers creator-owned builds without exposing editor access or internal fields', async () => {
		const creator = actor(17);
		const editor = actor(18);
		const snapshot = createSnapshotEnvelope({
			title: 'Recoverable setup',
			state: createDefaultState()
		});
		const created = await createLiveBuild(
			creator,
			{ title: 'Recoverable setup', snapshot },
			ORIGIN
		);

		await expect(
			redeemLiveBuildEdit(created.build.publicSlug, editor, {
				editSecret: created.editSecret
			})
		).resolves.toMatchObject({ role: 'editor' });
		await expect(listLiveBuilds(editor)).resolves.toEqual({ builds: [] });

		const recovered = await listLiveBuilds(creator);
		expect(recovered.builds).toHaveLength(1);
		expect(recovered.builds[0]).toMatchObject({
			publicSlug: created.build.publicSlug,
			title: 'Recoverable setup',
			role: 'creator'
		});
		expect(Object.keys(recovered.builds[0]).sort()).toEqual([
			'expiresAt',
			'formulaRevision',
			'lastEditedAt',
			'pinned',
			'publicSlug',
			'revision',
			'role',
			'snapshot',
			'stateVersion',
			'title'
		]);

		const attackBefore = recovered.builds[0].snapshot.state.stats.attack[0];
		const patched = await patchLiveBuild(created.build.publicSlug, creator, {
			baseRevision: recovered.builds[0].revision,
			changes: [{ path: '/state/stats/attack/0', before: attackBefore, after: '54321' }]
		});
		expect(patched).toMatchObject({ revision: 2, role: 'creator' });
		expect(patched.snapshot.state.stats.attack[0]).toBe('54321');

		await deleteLiveBuild(created.build.publicSlug, creator);
	}, 40_000);

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
		const backendDb = getLiveBuildJazzContext().asBackend();
		await backendDb
			.insert(app.liveBuildPresence, {
				build_id: storedBuild!.id,
				generation: storedBuild!.editGeneration,
				user_id: creator,
				session_id: 'before-rotation',
				mode: 'edit',
				target: 'stat:base:attack:flat',
				visible: true,
				lastSeenAt: new Date()
			})
			.wait({ tier: 'global' });

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
		expect(await repository.listPresence(storedBuild!.id)).toEqual([]);
		await expect(
			patchLiveBuild(created.build.publicSlug, editor, {
				baseRevision: 2,
				changes: [{ path: '/state/stats/attack/0', before: '12345', after: '12346' }]
			})
		).rejects.toMatchObject({ status: 403, code: 'forbidden' });

		const pinned = await pinLiveBuild(created.build.publicSlug, creator, { pinned: true });
		expect(pinned.pinned).toBe(true);
		expect(pinned.expiresAt).toBeNull();

		await backendDb
			.insert(app.liveBuildPresence, {
				build_id: storedBuild!.id,
				generation: 2,
				user_id: creator,
				session_id: 'before-stop',
				mode: 'edit',
				target: null,
				visible: false,
				lastSeenAt: new Date()
			})
			.wait({ tier: 'global' });
		await deleteLiveBuild(created.build.publicSlug, creator);
		expect(await repository.listPresence(storedBuild!.id)).toEqual([]);
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

	it('uses system update time for presence retention instead of a client timestamp', async () => {
		const creator = actor(24);
		const now = new Date();
		const snapshot = createSnapshotEnvelope({ title: 'Active room', state: createDefaultState() });
		const created = await createLiveBuild(creator, { title: 'Active room', snapshot }, ORIGIN, now);
		const repository = new JazzLiveBuildRepository(creator);
		const build = await repository.findBuildBySlug(created.build.publicSlug);
		expect(build).not.toBeNull();
		const backendDb = getLiveBuildJazzContext().asBackend();
		await backendDb
			.insert(app.liveBuildPresence, {
				build_id: build!.id,
				generation: build!.editGeneration,
				user_id: creator,
				session_id: 'forged-future-heartbeat',
				mode: 'edit',
				target: null,
				visible: true,
				lastSeenAt: new Date('2100-01-01T00:00:00.000Z')
			})
			.wait({ tier: 'global' });

		const recentResult = await cleanupExpiredLiveBuilds(now);
		expect(recentResult.presenceDeleted).toBe(0);
		expect(await repository.findBuildBySlug(created.build.publicSlug)).not.toBeNull();
		expect(await repository.listPresence(build!.id)).toHaveLength(1);

		const afterRetention = new Date(now.getTime() + 25 * 60 * 60 * 1000);
		const staleResult = await cleanupExpiredLiveBuilds(afterRetention);
		expect(staleResult.presenceDeleted).toBeGreaterThanOrEqual(1);
		expect(await repository.findBuildBySlug(created.build.publicSlug)).not.toBeNull();
		expect(await repository.listPresence(build!.id)).toEqual([]);

		await deleteLiveBuild(created.build.publicSlug, creator);
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
