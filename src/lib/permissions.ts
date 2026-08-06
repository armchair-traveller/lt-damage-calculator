import { schema as s } from 'jazz-tools';

import { app } from './schema';

/**
 * Live build payloads are deliberately public-but-unlisted. The capability and
 * editor tables are never readable from a client, and durable build mutations
 * are routed through the server so quotas, expiry and edit-link rotation cannot
 * be bypassed. Presence is the sole client-writable table: a visitor may only
 * own rows attributed to their local-first Jazz identity and only for a current
 * live-build generation.
 */
export const permissions = s.definePermissions(app, ({ policy, allOf, isCreator, session }) => {
	policy.liveBuilds.allowRead.always();
	policy.liveBuilds.allowInsert.never();
	policy.liveBuilds.allowUpdate.never();
	policy.liveBuilds.allowDelete.never();

	policy.liveBuildEditCapabilities.allowRead.never();
	policy.liveBuildEditCapabilities.allowInsert.never();
	policy.liveBuildEditCapabilities.allowUpdate.never();
	policy.liveBuildEditCapabilities.allowDelete.never();

	policy.liveBuildEditors.allowRead.never();
	policy.liveBuildEditors.allowInsert.never();
	policy.liveBuildEditors.allowUpdate.never();
	policy.liveBuildEditors.allowDelete.never();

	const ownsCurrentPresence = (presence: {
		build_id: { readonly __jazzPermissionKind: 'row-ref'; readonly column: string };
		generation: { readonly __jazzPermissionKind: 'row-ref'; readonly column: string };
	}) =>
		allOf([
			isCreator,
			{ user_id: session.user_id },
			policy.liveBuilds.exists.where({
				id: presence.build_id,
				editGeneration: presence.generation
			})
		]);

	policy.liveBuildPresence.allowRead.always();
	policy.liveBuildPresence.allowInsert.where(ownsCurrentPresence);
	policy.liveBuildPresence.allowUpdate
		.whereOld(ownsCurrentPresence)
		.whereNew(ownsCurrentPresence);
	policy.liveBuildPresence.allowDelete.where(
		allOf([isCreator, { user_id: session.user_id }])
	);
});

export default permissions;
