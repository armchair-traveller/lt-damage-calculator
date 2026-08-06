import type {
	CreateLiveBuildRequest,
	CreateLiveBuildResponse,
	JsonValue,
	LiveBuildLinks,
	LiveBuildResource,
	PatchLiveBuildRequest,
	RedeemLiveBuildEditResponse,
	RotateLiveBuildEditLinkResponse,
	SnapshotEnvelopeV1
} from '$lib/live-builds/contracts';
import type { LiveBuildRow } from '$lib/schema';

import { createEditSecret, createPublicSlug, editSecretMatches, hashEditSecret } from './crypto';
import { decodeStoredEnvelope, encodeStoredEnvelope, normalizeLiveBuildTitle, normalizeSnapshotEnvelope } from './envelope';
import { LiveBuildError, badRequest } from './errors';
import { applyLiveBuildChanges, parsePatchChanges } from './json-patch';
import { JazzLiveBuildRepository } from './repository';

export const LIVE_BUILD_TTL_DAYS = 30;
export const MAX_ACTIVE_LIVE_BUILDS = 20;
export const MAX_PINNED_LIVE_BUILDS = 5;
export const MAX_LIVE_BUILD_EDITORS_PER_GENERATION = 32;
export const CLEANUP_BATCH_SIZE = 50;
export const CLEANUP_RUNTIME_BUDGET_MS = 8_000;

export type CleanupExpiredLiveBuildsOptions = {
	runtimeBudgetMs?: number;
	clock?: () => number;
};

export type CleanupExpiredLiveBuildsResult = {
	examined: number;
	deleted: number;
	failed: number;
};

type LiveBuildRole = LiveBuildResource['role'];

const locks = new Map<string, Promise<void>>();

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expirationFrom(now: Date): Date {
	return new Date(now.getTime() + LIVE_BUILD_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function isExpired(build: LiveBuildRow, now = new Date()): boolean {
	return !build.pinned && build.expiresAt !== null && build.expiresAt.getTime() <= now.getTime();
}

function assertAvailable(build: LiveBuildRow, now = new Date()): void {
	if (isExpired(build, now)) {
		throw new LiveBuildError(410, 'expired', 'This live build has expired. Fork it from a local copy if one is available.');
	}
}

async function withBuildLock<T>(slug: string, callback: () => Promise<T>): Promise<T> {
	const previous = locks.get(slug) ?? Promise.resolve();
	let release = () => {};
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	locks.set(slug, current);
	await previous;
	try {
		return await callback();
	} finally {
		release();
		if (locks.get(slug) === current) locks.delete(slug);
	}
}

function links(origin: string, publicSlug: string, editSecret?: string): LiveBuildLinks {
	const base = `${origin.replace(/\/$/, '')}/`;
	return {
		viewUrl: `${base}#share=${encodeURIComponent(publicSlug)}`,
		...(editSecret
			? { editUrl: `${base}#share=${encodeURIComponent(publicSlug)}&edit=${encodeURIComponent(editSecret)}` }
			: {})
	};
}

function parseCreateRequest(input: unknown): CreateLiveBuildRequest {
	if (!isRecord(input)) badRequest('The request body must be an object.');
	const title = normalizeLiveBuildTitle(input.title);
	const snapshot = normalizeSnapshotEnvelope(input.snapshot, { title });
	return { title, snapshot };
}

function parsePatchRequest(input: unknown): PatchLiveBuildRequest {
	if (!isRecord(input) || !Number.isSafeInteger(input.baseRevision) || Number(input.baseRevision) < 1) {
		badRequest('baseRevision must be a positive integer.');
	}
	return {
		baseRevision: Number(input.baseRevision),
		changes: parsePatchChanges(input.changes)
	};
}

function buildWithUpdate(build: LiveBuildRow, update: Partial<LiveBuildRow>): LiveBuildRow {
	return { ...build, ...update };
}

function resource(build: LiveBuildRow, role: LiveBuildRole): LiveBuildResource {
	return {
		publicSlug: build.publicSlug,
		title: build.title,
		snapshot: decodeStoredEnvelope(build.envelope),
		stateVersion: build.stateVersion,
		formulaRevision: build.formulaRevision,
		revision: build.revision,
		pinned: build.pinned,
		lastEditedAt: build.lastEditedAt.toISOString(),
		expiresAt: build.expiresAt?.toISOString() ?? null,
		role
	};
}

async function uniquePublicSlug(repository: JazzLiveBuildRepository): Promise<string> {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const slug = createPublicSlug();
		if (!(await repository.findBuildBySlug(slug))) return slug;
	}
	throw new LiveBuildError(503, 'service_unavailable', 'Could not allocate a share link. Please retry.');
}

async function roleFor(
	repository: JazzLiveBuildRepository,
	build: LiveBuildRow,
	actorId: string | null
): Promise<LiveBuildRole> {
	if (!actorId) return 'viewer';
	if (build.creator_id === actorId) return 'creator';
	const editor = await repository.findEditor(build.id, actorId, build.editGeneration);
	return editor ? 'editor' : 'viewer';
}

async function requireBuild(repository: JazzLiveBuildRepository, slug: string): Promise<LiveBuildRow> {
	const build = await repository.findBuildBySlug(slug);
	if (!build) throw new LiveBuildError(404, 'not_found', 'Live build not found.');
	return build;
}

async function requireEditorRole(
	repository: JazzLiveBuildRepository,
	build: LiveBuildRow,
	actorId: string
): Promise<'editor' | 'creator'> {
	const role = await roleFor(repository, build, actorId);
	if (role === 'viewer') {
		throw new LiveBuildError(403, 'forbidden', 'This device does not have edit access.');
	}
	return role;
}

function requireCreator(build: LiveBuildRow, actorId: string): void {
	if (build.creator_id !== actorId) {
		throw new LiveBuildError(403, 'forbidden', 'Only the creator can manage this live build.');
	}
}

export async function createLiveBuild(
	actorId: string,
	input: unknown,
	origin: string,
	now = new Date()
): Promise<CreateLiveBuildResponse> {
	const request = parseCreateRequest(input);
	const repository = new JazzLiveBuildRepository(actorId);
	const ownedBuilds = await repository.listBuildsByCreator(actorId);
	const activeBuilds = ownedBuilds.filter((build) => !isExpired(build, now));
	if (activeBuilds.length >= MAX_ACTIVE_LIVE_BUILDS) {
		throw new LiveBuildError(
			429,
			'quota_exceeded',
			`This device already has ${MAX_ACTIVE_LIVE_BUILDS} active live builds.`
		);
	}

	const publicSlug = await uniquePublicSlug(repository);
	const editSecret = createEditSecret();
	const envelope = encodeStoredEnvelope(request.snapshot);
	const build = await repository.createBuild(
		{
			publicSlug,
			title: request.title,
			creator_id: actorId,
			envelope,
			stateVersion: request.snapshot.stateVersion,
			formulaRevision: request.snapshot.formulaRevision,
			revision: 1,
			editGeneration: 1,
			pinned: false,
			lastEditedAt: now,
			expiresAt: expirationFrom(now)
		},
		hashEditSecret(editSecret)
	);

	return {
		build: resource(build, 'creator'),
		links: links(origin, publicSlug, editSecret) as Required<LiveBuildLinks>,
		editSecret
	};
}

export async function getLiveBuild(slug: string, actorId: string | null): Promise<LiveBuildResource> {
	const repository = new JazzLiveBuildRepository(actorId ?? undefined);
	const build = await requireBuild(repository, slug);
	assertAvailable(build);
	return resource(build, await roleFor(repository, build, actorId));
}

export async function redeemLiveBuildEdit(
	slug: string,
	actorId: string,
	input: unknown
): Promise<RedeemLiveBuildEditResponse> {
	if (!isRecord(input) || typeof input.editSecret !== 'string') {
		badRequest('editSecret is required.');
	}
	const editSecret = input.editSecret;
	return withBuildLock(slug, async () => {
		const repository = new JazzLiveBuildRepository(actorId);
		const build = await requireBuild(repository, slug);
		assertAvailable(build);
		const capability = await repository.findCapability(build.id, build.editGeneration);
		if (!capability || !editSecretMatches(editSecret, capability.secretHash)) {
			throw new LiveBuildError(403, 'forbidden', 'This edit link is invalid or has been replaced.');
		}
		if (build.creator_id !== actorId) {
			const existingEditor = await repository.findEditor(build.id, actorId, build.editGeneration);
			if (!existingEditor) {
				const editors = await repository.listActiveEditorsForGeneration(
					build.id,
					build.editGeneration
				);
				if (editors.length >= MAX_LIVE_BUILD_EDITORS_PER_GENERATION) {
					throw new LiveBuildError(
						429,
						'quota_exceeded',
						`This live build already has ${MAX_LIVE_BUILD_EDITORS_PER_GENERATION} editors for its current edit link.`
					);
				}
			}
			await repository.grantEditor(build.id, actorId, build.editGeneration, new Date());
		}
		const role = build.creator_id === actorId ? 'creator' : 'editor';
		return { build: resource(build, role), role };
	});
}

export async function patchLiveBuild(
	slug: string,
	actorId: string,
	input: unknown,
	now = new Date()
): Promise<LiveBuildResource> {
	const request = parsePatchRequest(input);
	return withBuildLock(slug, async () => {
		const repository = new JazzLiveBuildRepository(actorId);
		const build = await requireBuild(repository, slug);
		assertAvailable(build, now);
		const role = await requireEditorRole(repository, build, actorId);
		const currentResource = resource(build, role);
		if (request.baseRevision > build.revision) {
			throw new LiveBuildError(409, 'conflict', 'The shared build revision is out of date.', {
				build: currentResource
			});
		}

		const currentEnvelope = currentResource.snapshot;
		const patch = applyLiveBuildChanges(
			currentEnvelope as unknown as JsonValue,
			request.changes
		);
		if (patch.conflictingPaths.length > 0) {
			throw new LiveBuildError(409, 'conflict', 'Some fields changed on another device.', {
				build: currentResource,
				conflictingPaths: patch.conflictingPaths
			});
		}
		if (!patch.changed) return currentResource;

		const nextEnvelope = normalizeSnapshotEnvelope(patch.next, { preserveCreatedAt: true });
		const expiresAt = build.pinned ? null : expirationFrom(now);
		const revision = build.revision + 1;
		const envelope = encodeStoredEnvelope(nextEnvelope);
		await repository.updateBuild(build.id, {
			title: nextEnvelope.title,
			envelope,
			stateVersion: nextEnvelope.stateVersion,
			formulaRevision: nextEnvelope.formulaRevision,
			revision,
			lastEditedAt: now,
			expiresAt
		});

		return resource(
			buildWithUpdate(build, {
				title: nextEnvelope.title,
				envelope,
				stateVersion: nextEnvelope.stateVersion,
				formulaRevision: nextEnvelope.formulaRevision,
				revision,
				lastEditedAt: now,
				expiresAt
			}),
			role
		);
	});
}

export async function pinLiveBuild(
	slug: string,
	actorId: string,
	input: unknown,
	now = new Date()
): Promise<LiveBuildResource> {
	if (!isRecord(input) || typeof input.pinned !== 'boolean') badRequest('pinned must be a boolean.');
	const pinned = input.pinned;
	return withBuildLock(slug, async () => {
		const repository = new JazzLiveBuildRepository(actorId);
		const build = await requireBuild(repository, slug);
		assertAvailable(build, now);
		requireCreator(build, actorId);
		if (build.pinned === pinned) return resource(build, 'creator');

		if (pinned) {
			const ownedBuilds = await repository.listBuildsByCreator(actorId);
			const pinnedCount = ownedBuilds.filter((owned) => owned.pinned && !isExpired(owned, now)).length;
			if (pinnedCount >= MAX_PINNED_LIVE_BUILDS) {
				throw new LiveBuildError(
					429,
					'quota_exceeded',
					`This device already has ${MAX_PINNED_LIVE_BUILDS} pinned live builds.`
				);
			}
		}

		const expiresAt = pinned ? null : expirationFrom(build.lastEditedAt);
		await repository.updateBuild(build.id, { pinned, expiresAt });
		return resource(buildWithUpdate(build, { pinned, expiresAt }), 'creator');
	});
}

export async function rotateLiveBuildEditLink(
	slug: string,
	actorId: string,
	origin: string,
	now = new Date()
): Promise<RotateLiveBuildEditLinkResponse> {
	return withBuildLock(slug, async () => {
		const repository = new JazzLiveBuildRepository(actorId);
		const build = await requireBuild(repository, slug);
		assertAvailable(build, now);
		requireCreator(build, actorId);
		const editSecret = createEditSecret();
		const editGeneration = build.editGeneration + 1;
		await repository.rotateEditCapability(build, editGeneration, hashEditSecret(editSecret));
		const nextBuild = buildWithUpdate(build, { editGeneration });
		return {
			build: resource(nextBuild, 'creator'),
			links: links(origin, slug, editSecret) as Required<LiveBuildLinks>,
			editSecret
		};
	});
}

export async function deleteLiveBuild(slug: string, actorId: string): Promise<void> {
	await withBuildLock(slug, async () => {
		const repository = new JazzLiveBuildRepository(actorId);
		const build = await requireBuild(repository, slug);
		requireCreator(build, actorId);
		await repository.deleteBuildAndChildren(build);
	});
}

export async function cleanupExpiredLiveBuilds(
	now = new Date(),
	limit = CLEANUP_BATCH_SIZE,
	options: CleanupExpiredLiveBuildsOptions = {}
): Promise<CleanupExpiredLiveBuildsResult> {
	const repository = new JazzLiveBuildRepository();
	const requestedBatchSize = Number.isFinite(limit) ? Math.trunc(limit) : CLEANUP_BATCH_SIZE;
	const batchSize = Math.min(Math.max(requestedBatchSize, 1), CLEANUP_BATCH_SIZE);
	const requestedBudget = options.runtimeBudgetMs ?? CLEANUP_RUNTIME_BUDGET_MS;
	const runtimeBudgetMs = Number.isFinite(requestedBudget)
		? Math.max(1, Math.trunc(requestedBudget))
		: CLEANUP_RUNTIME_BUDGET_MS;
	const clock = options.clock ?? Date.now;
	const startedAt = clock();
	const withinBudget = () => clock() - startedAt < runtimeBudgetMs;
	const failedIds = new Set<string>();
	let examined = 0;
	let deleted = 0;
	let failed = 0;

	while (withinBudget()) {
		const candidates = await repository.findExpiredBuilds(now, batchSize, failedIds.size);
		if (candidates.length === 0) break;

		let completedBatch = true;
		for (const candidate of candidates) {
			if (!withinBudget()) {
				completedBatch = false;
				break;
			}
			examined += 1;
			try {
				const wasDeleted = await withBuildLock(candidate.publicSlug, async () => {
					const current = await repository.findBuildBySlug(candidate.publicSlug);
					if (!current || !isExpired(current, now)) return false;
					await repository.deleteBuildAndChildren(current);
					return true;
				});
				if (wasDeleted) deleted += 1;
			} catch {
				failedIds.add(candidate.id);
				failed += 1;
			}
		}

		if (!completedBatch || candidates.length < batchSize) break;
	}

	return { examined, deleted, failed };
}

export function isValidLiveBuildSlug(slug: string): boolean {
	return /^[A-Za-z0-9_-]{32}$/.test(slug);
}
