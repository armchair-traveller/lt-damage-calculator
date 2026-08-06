import { LiveBuildError } from './errors';

export type JazzLiveBuildConfig = {
	appId: string;
	serverUrl: string;
	backendSecret: string;
};

const DEFAULT_JAZZ_SERVER_URL = 'https://v2.sync.jazz.tools/';

function requiredEnvironmentValue(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new LiveBuildError(
			503,
			'service_unavailable',
			`Live sharing is not configured (${name} is missing).`
		);
	}
	return value;
}

export function getJazzLiveBuildConfig(): JazzLiveBuildConfig {
	const backendSecret =
		process.env.JAZZ_BACKEND_SECRET?.trim() || process.env.BACKEND_SECRET?.trim();
	if (!backendSecret) {
		throw new LiveBuildError(
			503,
			'service_unavailable',
			'Live sharing is not configured (JAZZ_BACKEND_SECRET is missing).'
		);
	}
	return {
		appId: requiredEnvironmentValue('PUBLIC_JAZZ_APP_ID'),
		serverUrl: process.env.PUBLIC_JAZZ_SERVER_URL?.trim() || DEFAULT_JAZZ_SERVER_URL,
		backendSecret
	};
}
