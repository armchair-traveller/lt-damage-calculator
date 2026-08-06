import type { Db } from 'jazz-tools';
import { LIVE_BUILD_IDENTITY_AUDIENCE } from './contracts.js';
import type {
	CreateLiveBuildRequest,
	CreateLiveBuildResponse,
	JsonValue,
	LiveBuildApiErrorCode,
	LiveBuildApiErrorResponse,
	LiveBuildPatchChange,
	LiveBuildResource,
	LiveBuildResponse,
	PatchLiveBuildRequest,
	RedeemLiveBuildEditResponse,
	RotateLiveBuildEditLinkResponse,
	SnapshotEnvelopeV1
} from './contracts.js';

export class LiveBuildApiError extends Error {
	readonly status: number;
	readonly code: LiveBuildApiErrorCode;
	readonly build?: LiveBuildResource;
	readonly conflictingPaths?: string[];

	constructor(status: number, response: LiveBuildApiErrorResponse) {
		super(response.error.message);
		this.name = 'LiveBuildApiError';
		this.status = status;
		this.code = response.error.code;
		this.build = response.build;
		this.conflictingPaths = response.conflictingPaths;
	}
}

function identityProof(db: Db): string {
	const proof = db.getLocalFirstIdentityProof({
		ttlSeconds: 60,
		audience: LIVE_BUILD_IDENTITY_AUDIENCE
	});
	if (!proof) throw new Error('This device does not have a writable sharing identity.');
	return proof;
}

async function apiRequest<T>(
	path: string,
	options: RequestInit = {},
	db?: Db
): Promise<T> {
	const headers = new Headers(options.headers);
	if (options.body !== undefined) headers.set('content-type', 'application/json');
	if (db) headers.set('authorization', `Bearer ${identityProof(db)}`);

	const response = await fetch(path, { ...options, headers });
	if (response.ok) {
		if (response.status === 204) return undefined as T;
		return (await response.json()) as T;
	}

	let body: LiveBuildApiErrorResponse;
	try {
		body = (await response.json()) as LiveBuildApiErrorResponse;
	} catch {
		body = {
			error: {
				code: response.status === 503 ? 'service_unavailable' : 'bad_request',
				message: 'The sharing service returned an unexpected response.'
			}
		};
	}
	throw new LiveBuildApiError(response.status, body);
}

export function fetchLiveBuild(slug: string, db?: Db): Promise<LiveBuildResponse> {
	return apiRequest(`/api/live-builds/${encodeURIComponent(slug)}`, {}, db);
}

export function createLiveBuild(
	db: Db,
	request: CreateLiveBuildRequest
): Promise<CreateLiveBuildResponse> {
	return apiRequest('/api/live-builds', {
		method: 'POST',
		body: JSON.stringify(request)
	}, db);
}

export function redeemLiveBuildEdit(
	db: Db,
	slug: string,
	editSecret: string
): Promise<RedeemLiveBuildEditResponse> {
	return apiRequest(`/api/live-builds/${encodeURIComponent(slug)}/redeem-edit`, {
		method: 'POST',
		body: JSON.stringify({ editSecret })
	}, db);
}

export function patchLiveBuild(
	db: Db,
	slug: string,
	request: PatchLiveBuildRequest
): Promise<LiveBuildResponse> {
	return apiRequest(`/api/live-builds/${encodeURIComponent(slug)}`, {
		method: 'PATCH',
		body: JSON.stringify(request)
	}, db);
}

export function setLiveBuildPinned(
	db: Db,
	slug: string,
	pinned: boolean
): Promise<LiveBuildResponse> {
	return apiRequest(`/api/live-builds/${encodeURIComponent(slug)}/pin`, {
		method: 'POST',
		body: JSON.stringify({ pinned })
	}, db);
}

export function rotateLiveBuildEditLink(
	db: Db,
	slug: string
): Promise<RotateLiveBuildEditLinkResponse> {
	return apiRequest(`/api/live-builds/${encodeURIComponent(slug)}/rotate-edit-link`, {
		method: 'POST',
		body: '{}'
	}, db);
}

export function stopLiveBuild(db: Db, slug: string): Promise<void> {
	return apiRequest(`/api/live-builds/${encodeURIComponent(slug)}`, {
		method: 'DELETE'
	}, db);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (typeof left !== typeof right || left === null || right === null) return false;
	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
		return left.every((value, index) => jsonEqual(value, right[index]));
	}
	if (!isRecord(left) || !isRecord(right)) return false;
	const leftKeys = Object.keys(left).sort();
	const rightKeys = Object.keys(right).sort();
	return leftKeys.length === rightKeys.length && leftKeys.every(
		(key, index) => key === rightKeys[index] && jsonEqual(left[key], right[key])
	);
}

function escapeJsonPointerPart(part: string): string {
	return part.replaceAll('~', '~0').replaceAll('/', '~1');
}

function asJsonValue(value: unknown): JsonValue | undefined {
	return value === undefined ? undefined : structuredClone(value) as JsonValue;
}

function collectChanges(
	before: unknown,
	after: unknown,
	path: string,
	changes: LiveBuildPatchChange[]
): void {
	if (jsonEqual(before, after)) return;

	if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
		for (let index = 0; index < before.length; index += 1) {
			collectChanges(before[index], after[index], `${path}/${index}`, changes);
		}
		return;
	}

	if (isRecord(before) && isRecord(after)) {
		for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
			collectChanges(
				before[key],
				after[key],
				`${path}/${escapeJsonPointerPart(key)}`,
				changes
			);
		}
		return;
	}

	changes.push({
		path,
		before: asJsonValue(before),
		after: asJsonValue(after)
	});
}

export function buildLiveBuildChanges(
	before: SnapshotEnvelopeV1,
	after: SnapshotEnvelopeV1
): LiveBuildPatchChange[] {
	const changes: LiveBuildPatchChange[] = [];
	collectChanges(before.title, after.title, '/title', changes);
	collectChanges(before.state, after.state, '/state', changes);
	return changes;
}
