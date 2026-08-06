import { gunzipSync, gzipSync } from 'node:zlib';

import {
	SnapshotCodecError,
	createSnapshotEnvelope,
	normalizeSnapshotEnvelope as normalizeCalculatorSnapshot
} from '$lib/calculator/snapshot-codec';
import type { SnapshotEnvelopeV1 } from '$lib/live-builds/contracts';

import { LiveBuildError, badRequest } from './errors';

export const MAX_LIVE_BUILD_DECODED_BYTES = 64 * 1024;
export const MAX_LIVE_BUILD_COMPRESSED_BYTES = 32 * 1024;

export function normalizeLiveBuildTitle(input: unknown): string {
	if (typeof input !== 'string') badRequest('title must be a string.');
	const title = input.trim();
	if (title.length < 1 || title.length > 80) badRequest('title must be between 1 and 80 characters.');
	return title;
}

export function normalizeSnapshotEnvelope(
	input: unknown,
	options: { title?: string; preserveCreatedAt?: boolean } = {}
): SnapshotEnvelopeV1 {
	try {
		const normalized = normalizeCalculatorSnapshot(input);
		return createSnapshotEnvelope({
			title: normalizeLiveBuildTitle(options.title ?? normalized.title),
			state: normalized.state,
			createdAt: options.preserveCreatedAt ? normalized.createdAt : new Date()
		});
	} catch (error) {
		if (error instanceof SnapshotCodecError) badRequest(error.message);
		throw error;
	}
}

export function encodeStoredEnvelope(envelope: SnapshotEnvelopeV1): Uint8Array {
	const decoded = Buffer.from(JSON.stringify(envelope), 'utf8');
	if (decoded.byteLength > MAX_LIVE_BUILD_DECODED_BYTES) {
		throw new LiveBuildError(413, 'payload_too_large', 'The build snapshot is too large.');
	}
	const compressed = gzipSync(decoded, { level: 9 });
	if (compressed.byteLength > MAX_LIVE_BUILD_COMPRESSED_BYTES) {
		throw new LiveBuildError(413, 'payload_too_large', 'The compressed build snapshot is too large.');
	}
	return new Uint8Array(compressed);
}

export function decodeStoredEnvelope(value: Uint8Array): SnapshotEnvelopeV1 {
	if (value.byteLength > MAX_LIVE_BUILD_COMPRESSED_BYTES) {
		throw new LiveBuildError(503, 'service_unavailable', 'The stored build is invalid.');
	}
	try {
		const decoded = gunzipSync(value, { maxOutputLength: MAX_LIVE_BUILD_DECODED_BYTES });
		const parsed = JSON.parse(decoded.toString('utf8')) as unknown;
		const normalized = normalizeCalculatorSnapshot(parsed);
		if (normalizeLiveBuildTitle(normalized.title) !== normalized.title) {
			throw new Error('Stored title is not canonical.');
		}
		return normalized;
	} catch {
		throw new LiveBuildError(503, 'service_unavailable', 'The stored build is invalid.');
	}
}
