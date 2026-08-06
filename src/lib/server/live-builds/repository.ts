import {
	app,
	type LiveBuildCapabilityRow,
	type LiveBuildEditorRow,
	type LiveBuildPresenceRow,
	type LiveBuildRow
} from '$lib/schema';

import { getLiveBuildDb } from './jazz-context';

const READ_OPTIONS = { tier: 'global' as const };
const WRITE_OPTIONS = { tier: 'global' as const };

export type InsertLiveBuild = {
	publicSlug: string;
	title: string;
	creator_id: string;
	envelope: Uint8Array;
	stateVersion: number;
	formulaRevision: string;
	revision: number;
	editGeneration: number;
	pinned: boolean;
	lastEditedAt: Date;
	expiresAt: Date | null;
};

export type LiveBuildUpdate = Partial<
	Pick<
		InsertLiveBuild,
		| 'title'
		| 'envelope'
		| 'stateVersion'
		| 'formulaRevision'
		| 'revision'
		| 'editGeneration'
		| 'pinned'
		| 'lastEditedAt'
		| 'expiresAt'
	>
>;

export class JazzLiveBuildRepository {
	constructor(private readonly actorId?: string) {}

	private db() {
		return getLiveBuildDb(this.actorId);
	}

	async findBuildBySlug(publicSlug: string): Promise<LiveBuildRow | null> {
		return this.db().one(app.liveBuilds.where({ publicSlug }).limit(1), READ_OPTIONS);
	}

	async listBuildsByCreator(creatorId: string): Promise<LiveBuildRow[]> {
		return this.db().all(app.liveBuilds.where({ creator_id: creatorId }), READ_OPTIONS);
	}

	async findCapability(
		buildId: string,
		generation: number
	): Promise<LiveBuildCapabilityRow | null> {
		return this.db().one(
			app.liveBuildEditCapabilities
				.where({ build_id: buildId, generation, revoked: false })
				.limit(1),
			READ_OPTIONS
		);
	}

	async listCapabilities(buildId: string): Promise<LiveBuildCapabilityRow[]> {
		return this.db().all(
			app.liveBuildEditCapabilities.where({ build_id: buildId }),
			READ_OPTIONS
		);
	}

	async findEditor(
		buildId: string,
		userId: string,
		generation: number
	): Promise<LiveBuildEditorRow | null> {
		return this.db().one(
			app.liveBuildEditors
				.where({ build_id: buildId, user_id: userId, generation, revoked: false })
				.limit(1),
			READ_OPTIONS
		);
	}

	async listEditors(buildId: string): Promise<LiveBuildEditorRow[]> {
		return this.db().all(app.liveBuildEditors.where({ build_id: buildId }), READ_OPTIONS);
	}

	async listActiveEditorsForGeneration(
		buildId: string,
		generation: number
	): Promise<LiveBuildEditorRow[]> {
		return this.db().all(
			app.liveBuildEditors.where({ build_id: buildId, generation, revoked: false }),
			READ_OPTIONS
		);
	}

	async listPresence(buildId: string): Promise<LiveBuildPresenceRow[]> {
		return this.db().all(app.liveBuildPresence.where({ build_id: buildId }), READ_OPTIONS);
	}

	async listPresenceForGeneration(
		buildId: string,
		generation: number
	): Promise<LiveBuildPresenceRow[]> {
		return this.db().all(
			app.liveBuildPresence.where({ build_id: buildId, generation }),
			READ_OPTIONS
		);
	}

	async findStalePresence(
		staleBefore: Date,
		limit: number,
		offset = 0
	): Promise<LiveBuildPresenceRow[]> {
		return this.db().all(
			app.liveBuildPresence
				.where({ $updatedAt: { lt: staleBefore } })
				.orderBy('$updatedAt', 'asc')
				.orderBy('id', 'asc')
				.limit(limit)
				.offset(offset),
			READ_OPTIONS
		);
	}

	async deletePresence(presenceId: string): Promise<void> {
		await this.db().delete(app.liveBuildPresence, presenceId).wait(WRITE_OPTIONS);
	}

	async createBuild(input: InsertLiveBuild, secretHash: string): Promise<LiveBuildRow> {
		const result = this.db().batch((batch) => {
			const build = batch.insert(app.liveBuilds, input);
			batch.insert(app.liveBuildEditCapabilities, {
				build_id: build.id,
				generation: input.editGeneration,
				secretHash,
				revoked: false
			});
			return build;
		});
		return result.wait(WRITE_OPTIONS);
	}

	async grantEditor(
		buildId: string,
		userId: string,
		generation: number,
		redeemedAt: Date
	): Promise<void> {
		const existing = await this.db().one(
			app.liveBuildEditors.where({ build_id: buildId, user_id: userId, generation }).limit(1),
			READ_OPTIONS
		);
		if (existing) {
			await this.db()
				.update(app.liveBuildEditors, existing.id, { revoked: false, redeemedAt })
				.wait(WRITE_OPTIONS);
			return;
		}
		await this.db()
			.insert(app.liveBuildEditors, {
				build_id: buildId,
				user_id: userId,
				generation,
				revoked: false,
				redeemedAt
			})
			.wait(WRITE_OPTIONS);
	}

	async updateBuild(buildId: string, update: LiveBuildUpdate): Promise<void> {
		await this.db().update(app.liveBuilds, buildId, update).wait(WRITE_OPTIONS);
	}

	async rotateEditCapability(
		build: LiveBuildRow,
		generation: number,
		secretHash: string
	): Promise<void> {
		const [capabilities, editors, presenceRows] = await Promise.all([
			this.listCapabilities(build.id),
			this.listEditors(build.id),
			this.listPresence(build.id)
		]);
		const result = this.db().batch((batch) => {
			for (const presence of presenceRows) batch.delete(app.liveBuildPresence, presence.id);
			for (const editor of editors) batch.delete(app.liveBuildEditors, editor.id);
			for (const capability of capabilities) {
				batch.delete(app.liveBuildEditCapabilities, capability.id);
			}
			batch.insert(app.liveBuildEditCapabilities, {
				build_id: build.id,
				generation,
				secretHash,
				revoked: false
			});
			batch.update(app.liveBuilds, build.id, { editGeneration: generation });
		});
		await result.wait(WRITE_OPTIONS);
	}

	async deleteBuildAndChildren(build: LiveBuildRow): Promise<void> {
		const [capabilities, editors, presenceRows] = await Promise.all([
			this.listCapabilities(build.id),
			this.listEditors(build.id),
			this.listPresence(build.id)
		]);
		const result = this.db().batch((batch) => {
			for (const presence of presenceRows) batch.delete(app.liveBuildPresence, presence.id);
			for (const editor of editors) batch.delete(app.liveBuildEditors, editor.id);
			for (const capability of capabilities) {
				batch.delete(app.liveBuildEditCapabilities, capability.id);
			}
			batch.delete(app.liveBuilds, build.id);
		});
		await result.wait(WRITE_OPTIONS);
	}

	async findExpiredBuilds(now: Date, limit: number, offset = 0): Promise<LiveBuildRow[]> {
		return this.db().all(
			app.liveBuilds
				.where({ pinned: false, expiresAt: { lte: now } })
				.orderBy('expiresAt', 'asc')
				.orderBy('id', 'asc')
				.limit(limit)
				.offset(offset),
			READ_OPTIONS
		);
	}
}
