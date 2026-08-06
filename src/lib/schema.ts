import { schema as s } from 'jazz-tools';

const schema = {
	liveBuilds: s
		.table({
			publicSlug: s.string(),
			title: s.string(),
			creator_id: s.string(),
			envelope: s.bytes(),
			stateVersion: s.int(),
			formulaRevision: s.string(),
			revision: s.int(),
			editGeneration: s.int(),
			pinned: s.boolean(),
			lastEditedAt: s.timestamp(),
			expiresAt: s.timestamp().optional()
		})
		.indexOnly(['publicSlug', 'creator_id', 'expiresAt', 'pinned']),
	liveBuildEditCapabilities: s
		.table({
			build_id: s.ref('liveBuilds'),
			generation: s.int(),
			secretHash: s.string(),
			revoked: s.boolean()
		})
		.indexOnly(['build_id', 'generation', 'revoked']),
	liveBuildEditors: s
		.table({
			build_id: s.ref('liveBuilds'),
			user_id: s.string(),
			generation: s.int(),
			revoked: s.boolean(),
			redeemedAt: s.timestamp()
		})
		.indexOnly(['build_id', 'user_id', 'generation', 'revoked'])
};

export type AppSchema = s.Schema<typeof schema>;
export const app: s.App<AppSchema> = s.defineApp(schema);

export type LiveBuildRow = s.RowOf<typeof app.liveBuilds>;
export type LiveBuildCapabilityRow = s.RowOf<typeof app.liveBuildEditCapabilities>;
export type LiveBuildEditorRow = s.RowOf<typeof app.liveBuildEditors>;
