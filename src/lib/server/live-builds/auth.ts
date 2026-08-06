import { verifyLocalFirstIdentityProof } from 'jazz-napi';

import { LIVE_BUILD_IDENTITY_AUDIENCE } from '$lib/live-builds/contracts';

import { LiveBuildError } from './errors';

function bearerToken(request: Request): string | null {
	const authorization = request.headers.get('authorization');
	if (!authorization) return null;
	const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
	if (!match?.[1]) {
		throw new LiveBuildError(401, 'unauthorized', 'A valid identity proof is required.');
	}
	return match[1];
}

function verifyProof(token: string): string {
	const result = verifyLocalFirstIdentityProof(token, LIVE_BUILD_IDENTITY_AUDIENCE);
	if (!result.ok || !result.id) {
		throw new LiveBuildError(401, 'unauthorized', 'The identity proof is invalid or expired.');
	}
	return result.id;
}

export function requireLiveBuildActor(request: Request): string {
	const token = bearerToken(request);
	if (!token) {
		throw new LiveBuildError(401, 'unauthorized', 'An identity proof is required.');
	}
	return verifyProof(token);
}

export function optionalLiveBuildActor(request: Request): string | null {
	const token = bearerToken(request);
	return token ? verifyProof(token) : null;
}
