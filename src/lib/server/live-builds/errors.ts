import type { LiveBuildApiErrorCode, LiveBuildResource } from '$lib/live-builds/contracts';

export class LiveBuildError extends Error {
	constructor(
		readonly status: number,
		readonly code: LiveBuildApiErrorCode,
		message: string,
		readonly details?: {
			build?: LiveBuildResource;
			conflictingPaths?: string[];
		}
	) {
		super(message);
		this.name = 'LiveBuildError';
	}
}

export function badRequest(message: string): never {
	throw new LiveBuildError(400, 'bad_request', message);
}
