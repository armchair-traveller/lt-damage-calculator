import { createJazzContext, type Db, type JazzContext } from 'jazz-tools/backend';

import { jazzEnvironment, JAZZ_TIER, JAZZ_USER_BRANCH } from '$lib/jazz-runtime-config';
import { permissions } from '$lib/permissions';
import { app } from '$lib/schema';

import { getJazzLiveBuildConfig } from './config';

let context: JazzContext | undefined;

export function getLiveBuildJazzContext(): JazzContext {
	if (context) return context;
	const config = getJazzLiveBuildConfig();
	context = createJazzContext({
		appId: config.appId,
		app,
		permissions,
		driver: { type: 'memory' },
		serverUrl: config.serverUrl,
		backendSecret: config.backendSecret,
		allowLocalFirstAuth: true,
		env: jazzEnvironment(process.env.NODE_ENV === 'production'),
		userBranch: JAZZ_USER_BRANCH,
		tier: JAZZ_TIER
	});
	return context;
}

export function getLiveBuildDb(actorId?: string): Db {
	const jazz = getLiveBuildJazzContext();
	return actorId ? jazz.withAttribution(actorId) : jazz.asBackend();
}

export async function shutdownLiveBuildJazzContext(): Promise<void> {
	const active = context;
	context = undefined;
	if (active) await active.shutdown();
}
