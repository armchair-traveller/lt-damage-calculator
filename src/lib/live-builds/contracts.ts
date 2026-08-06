import type { CalculatorState } from '$lib/calculator/model';

export const LIVE_BUILD_IDENTITY_AUDIENCE = 'lt-damage-calculator:live-build-api:v1';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type SnapshotEnvelopeV1 = {
	version: 1;
	title: string;
	createdAt: string;
	stateVersion: number;
	formulaRevision: string;
	state: CalculatorState;
	frozenSummary?: JsonValue;
};

export type LiveBuildResource = {
	publicSlug: string;
	title: string;
	snapshot: SnapshotEnvelopeV1;
	stateVersion: number;
	formulaRevision: string;
	revision: number;
	pinned: boolean;
	lastEditedAt: string;
	expiresAt: string | null;
	role: 'viewer' | 'editor' | 'creator';
};

export type LiveBuildLinks = {
	viewUrl: string;
	editUrl?: string;
};

export type CreateLiveBuildRequest = {
	title: string;
	snapshot: SnapshotEnvelopeV1;
};

export type CreateLiveBuildResponse = {
	build: LiveBuildResource;
	links: Required<LiveBuildLinks>;
	editSecret: string;
};

export type LiveBuildResponse = {
	build: LiveBuildResource;
};

export type RedeemLiveBuildEditRequest = {
	editSecret: string;
};

export type RedeemLiveBuildEditResponse = LiveBuildResponse & {
	role: 'editor' | 'creator';
};

export type LiveBuildPatchChange = {
	/** RFC 6901 JSON Pointer into the snapshot envelope. */
	path: string;
	before: JsonValue | undefined;
	after: JsonValue | undefined;
};

export type PatchLiveBuildRequest = {
	baseRevision: number;
	changes: LiveBuildPatchChange[];
};

export type PinLiveBuildRequest = {
	pinned: boolean;
};

export type RotateLiveBuildEditLinkResponse = LiveBuildResponse & {
	links: Required<LiveBuildLinks>;
	editSecret: string;
};

export type LiveBuildApiErrorCode =
	| 'bad_request'
	| 'unauthorized'
	| 'forbidden'
	| 'not_found'
	| 'expired'
	| 'conflict'
	| 'quota_exceeded'
	| 'payload_too_large'
	| 'service_unavailable';

export type LiveBuildApiErrorResponse = {
	error: {
		code: LiveBuildApiErrorCode;
		message: string;
	};
	build?: LiveBuildResource;
	conflictingPaths?: string[];
};
