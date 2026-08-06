import { schema as s } from 'jazz-tools';

import { app } from './schema';

/**
 * Live build payloads are deliberately public-but-unlisted. The capability and
 * editor tables are never readable from a client, and every mutation is routed
 * through the server so quotas, expiry and edit-link rotation cannot be bypassed.
 */
export const permissions = s.definePermissions(app, ({ policy }) => {
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
});

export default permissions;
