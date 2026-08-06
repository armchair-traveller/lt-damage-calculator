import {
	TARGETS,
	calculateDashboard,
	normalizeState,
	type CalculatorState,
	type TargetKey
} from './model.js';
import type { JsonValue, SnapshotEnvelopeV1 } from '../live-builds/contracts.js';

export type { SnapshotEnvelopeV1 } from '../live-builds/contracts.js';

export const SNAPSHOT_ENVELOPE_VERSION = 1 as const;
export const SNAPSHOT_CALCULATOR_VERSION = 2 as const;
export const SNAPSHOT_FORMULA_VERSION = 1 as const;
export const SNAPSHOT_MAX_DECODED_BYTES = 64 * 1024;
export const SNAPSHOT_MAX_COMPRESSED_BYTES = 32 * 1024;
export const SNAPSHOT_HASH_PREFIX = '#snapshot=v1.';

const SNAPSHOT_RESULT_KEYS = [
	'base',
	'a',
	'b',
	'buffed',
	'buffedA',
	'buffedB',
	'increaseA',
	'increaseB',
	'buffIncrease',
	'buffedIncreaseA',
	'buffedIncreaseB'
] as const;

type JsonRecord = Record<string, unknown>;
type SnapshotCompatibilityVersion = 'older' | 'current' | 'newer';

export type SnapshotFormattedResultsV1 = ReturnType<typeof calculateDashboard>['formatted'];

export type SnapshotFrozenSummaryV1 = {
	target: {
		key: TargetKey;
		label: string;
	};
	selectedClassPreset: string | null;
	results: SnapshotFormattedResultsV1;
};

export type SnapshotCompatibility = {
	state: SnapshotCompatibilityVersion;
	formula: SnapshotCompatibilityVersion;
	canLoadState: boolean;
	warnings: string[];
};

export type DecodedSnapshot = {
	envelope: SnapshotEnvelopeV1;
	compatibility: SnapshotCompatibility;
};

export type SnapshotCodecErrorCode =
	| 'invalid-fragment'
	| 'unsupported-version'
	| 'malformed-payload'
	| 'compressed-too-large'
	| 'decoded-too-large'
	| 'compression-unavailable'
	| 'invalid-envelope';

export class SnapshotCodecError extends Error {
	readonly code: SnapshotCodecErrorCode;

	constructor(code: SnapshotCodecErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'SnapshotCodecError';
		this.code = code;
	}
}

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTitle(value: unknown): string {
	if (typeof value !== 'string') return 'Untitled build';
	return value.trim().slice(0, 120) || 'Untitled build';
}

function normalizeCreatedAt(value: unknown): string {
	if (typeof value !== 'string') {
		throw new SnapshotCodecError('invalid-envelope', 'The snapshot creation time is missing.');
	}
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) {
		throw new SnapshotCodecError('invalid-envelope', 'The snapshot creation time is invalid.');
	}
	return date.toISOString();
}

function normalizeSchemaVersion(value: unknown, label: string): number {
	const version = Number(value);
	if (!Number.isSafeInteger(version) || version < 1) {
		throw new SnapshotCodecError('invalid-envelope', `The snapshot ${label} version is invalid.`);
	}
	return version;
}

function normalizeFormulaRevision(value: unknown): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new SnapshotCodecError('invalid-envelope', 'The snapshot formula revision is invalid.');
	}
	return value.trim();
}

function copyFormattedResults(value: unknown): SnapshotFormattedResultsV1 {
	if (!isRecord(value)) {
		throw new SnapshotCodecError('invalid-envelope', 'The snapshot summary results are missing.');
	}

	const results = {} as Record<
		(typeof SNAPSHOT_RESULT_KEYS)[number],
		{ normal: string; boss: string; avg: string }
	>;
	for (const key of SNAPSHOT_RESULT_KEYS) {
		const result = value[key];
		if (
			!isRecord(result) ||
			typeof result.normal !== 'string' ||
			typeof result.boss !== 'string' ||
			typeof result.avg !== 'string'
		) {
			throw new SnapshotCodecError(
				'invalid-envelope',
				`The snapshot summary result "${key}" is invalid.`
			);
		}
		results[key] = { normal: result.normal, boss: result.boss, avg: result.avg };
	}
	return results as SnapshotFormattedResultsV1;
}

function normalizeFrozenSummary(value: unknown): SnapshotFrozenSummaryV1 {
	if (!isRecord(value) || !isRecord(value.target)) {
		throw new SnapshotCodecError('invalid-envelope', 'The snapshot summary is missing.');
	}

	const targetKey = value.target.key;
	if (targetKey !== 'soft' && targetKey !== '7k') {
		throw new SnapshotCodecError('invalid-envelope', 'The snapshot summary target is invalid.');
	}
	if (typeof value.target.label !== 'string' || !value.target.label.trim()) {
		throw new SnapshotCodecError('invalid-envelope', 'The snapshot summary target label is invalid.');
	}
	if (value.selectedClassPreset !== null && typeof value.selectedClassPreset !== 'string') {
		throw new SnapshotCodecError('invalid-envelope', 'The snapshot summary class is invalid.');
	}

	return {
		target: { key: targetKey, label: value.target.label },
		selectedClassPreset: value.selectedClassPreset,
		results: copyFormattedResults(value.results)
	};
}

export function createSnapshotFrozenSummary(state: CalculatorState): SnapshotFrozenSummaryV1 {
	const normalizedState = normalizeState(state);
	return {
		target: {
			key: normalizedState.settings.target,
			label: TARGETS[normalizedState.settings.target].label
		},
		selectedClassPreset: normalizedState.selectedClassPreset,
		results: calculateDashboard(normalizedState).formatted
	};
}

export function createSnapshotEnvelope(input: {
	title: string;
	state: CalculatorState;
	createdAt?: string | Date;
}): SnapshotEnvelopeV1 {
	const state = normalizeState(input.state);
	const createdAt = input.createdAt ?? new Date();
	return {
		version: SNAPSHOT_ENVELOPE_VERSION,
		title: normalizeTitle(input.title),
		createdAt: normalizeCreatedAt(
			createdAt instanceof Date ? createdAt.toISOString() : createdAt
		),
		stateVersion: SNAPSHOT_CALCULATOR_VERSION,
		formulaRevision: String(SNAPSHOT_FORMULA_VERSION),
		state,
		frozenSummary: createSnapshotFrozenSummary(state) as JsonValue
	};
}

export function normalizeSnapshotEnvelope(value: unknown): SnapshotEnvelopeV1 {
	if (!isRecord(value)) {
		throw new SnapshotCodecError('invalid-envelope', 'The snapshot envelope is not an object.');
	}

	const envelopeVersion = Number(value.version);
	if (envelopeVersion !== SNAPSHOT_ENVELOPE_VERSION) {
		throw new SnapshotCodecError(
			'unsupported-version',
			envelopeVersion > SNAPSHOT_ENVELOPE_VERSION
				? 'This snapshot was created by a newer version of the calculator.'
				: 'This snapshot version is not supported.'
		);
	}

	if (!('state' in value)) {
		throw new SnapshotCodecError('invalid-envelope', 'The snapshot has no calculator state.');
	}

	const frozenSummary =
		value.frozenSummary === undefined
			? undefined
			: (normalizeFrozenSummary(value.frozenSummary) as JsonValue);
	return {
		version: SNAPSHOT_ENVELOPE_VERSION,
		title: normalizeTitle(value.title),
		createdAt: normalizeCreatedAt(value.createdAt),
		stateVersion: normalizeSchemaVersion(value.stateVersion, 'calculator'),
		formulaRevision: normalizeFormulaRevision(value.formulaRevision),
		state: normalizeState(value.state),
		...(frozenSummary === undefined ? {} : { frozenSummary })
	};
}

export function readSnapshotFrozenSummary(
	envelope: SnapshotEnvelopeV1
): SnapshotFrozenSummaryV1 | undefined {
	return envelope.frozenSummary === undefined
		? undefined
		: normalizeFrozenSummary(envelope.frozenSummary);
}

function compareVersion(version: number, current: number): SnapshotCompatibilityVersion {
	if (version > current) return 'newer';
	if (version < current) return 'older';
	return 'current';
}

export function getSnapshotCompatibility(envelope: SnapshotEnvelopeV1): SnapshotCompatibility {
	const state = compareVersion(envelope.stateVersion, SNAPSHOT_CALCULATOR_VERSION);
	const numericFormulaRevision = Number(envelope.formulaRevision);
	const formula =
		envelope.formulaRevision === String(SNAPSHOT_FORMULA_VERSION)
			? 'current'
			: Number.isSafeInteger(numericFormulaRevision) && numericFormulaRevision > 0
				? compareVersion(numericFormulaRevision, SNAPSHOT_FORMULA_VERSION)
				: 'newer';
	const warnings: string[] = [];

	if (state === 'newer') {
		warnings.push(
			'This snapshot uses a newer calculator format. Its frozen results are available, but its inputs cannot be loaded safely.'
		);
	} else if (state === 'older') {
		warnings.push('This snapshot uses an older calculator format; its inputs were migrated when opened.');
	}
	if (formula !== 'current') {
		warnings.push(
			`This snapshot uses a ${formula} formula revision. The frozen results preserve what its author saw.`
		);
	}

	return { state, formula, canLoadState: state !== 'newer', warnings };
}

function utf8Bytes(value: string): Uint8Array {
	return new TextEncoder().encode(value);
}

function decodeUtf8(value: Uint8Array): string {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(value);
	} catch (cause) {
		throw new SnapshotCodecError('malformed-payload', 'The snapshot text is not valid UTF-8.', {
			cause
		});
	}
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlToBytes(payload: string): Uint8Array {
	if (!payload || !/^[A-Za-z0-9_-]+$/u.test(payload) || payload.length % 4 === 1) {
		throw new SnapshotCodecError('malformed-payload', 'The snapshot link payload is malformed.');
	}

	const approximateBytes = Math.floor((payload.length * 3) / 4);
	if (approximateBytes > SNAPSHOT_MAX_COMPRESSED_BYTES) {
		throw new SnapshotCodecError(
			'compressed-too-large',
			'The compressed snapshot exceeds the 32 KiB link limit.'
		);
	}

	const base64 = payload.replaceAll('-', '+').replaceAll('_', '/').padEnd(
		payload.length + ((4 - (payload.length % 4)) % 4),
		'='
	);
	try {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
		if (bytes.byteLength > SNAPSHOT_MAX_COMPRESSED_BYTES) {
			throw new SnapshotCodecError(
				'compressed-too-large',
				'The compressed snapshot exceeds the 32 KiB link limit.'
			);
		}
		return bytes;
	} catch (cause) {
		if (cause instanceof SnapshotCodecError) throw cause;
		throw new SnapshotCodecError('malformed-payload', 'The snapshot link payload is malformed.', {
			cause
		});
	}
}

async function collectStream(
	stream: ReadableStream<Uint8Array>,
	maxBytes: number,
	errorCode: 'compressed-too-large' | 'decoded-too-large'
): Promise<Uint8Array> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			length += value.byteLength;
			if (length > maxBytes) {
				await reader.cancel();
				throw new SnapshotCodecError(
					errorCode,
					errorCode === 'compressed-too-large'
						? 'The compressed snapshot exceeds the 32 KiB link limit.'
						: 'The decoded snapshot exceeds the 64 KiB data limit.'
				);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const result = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

async function gzip(value: Uint8Array): Promise<Uint8Array> {
	if (typeof globalThis.CompressionStream !== 'function') {
		throw new SnapshotCodecError(
			'compression-unavailable',
			'This browser cannot create compressed snapshot links.'
		);
	}
	const input = Uint8Array.from(value);
	return collectStream(
		new Blob([input.buffer]).stream().pipeThrough(new CompressionStream('gzip')),
		SNAPSHOT_MAX_COMPRESSED_BYTES,
		'compressed-too-large'
	);
}

async function gunzip(value: Uint8Array): Promise<Uint8Array> {
	if (typeof globalThis.DecompressionStream !== 'function') {
		throw new SnapshotCodecError(
			'compression-unavailable',
			'This browser cannot open compressed snapshot links.'
		);
	}
	const input = Uint8Array.from(value);
	try {
		return await collectStream(
			new Blob([input.buffer]).stream().pipeThrough(new DecompressionStream('gzip')),
			SNAPSHOT_MAX_DECODED_BYTES,
			'decoded-too-large'
		);
	} catch (cause) {
		if (cause instanceof SnapshotCodecError) throw cause;
		throw new SnapshotCodecError('malformed-payload', 'The snapshot payload is not valid gzip data.', {
			cause
		});
	}
}

export async function encodeSnapshotPayload(envelope: SnapshotEnvelopeV1): Promise<string> {
	const normalized = normalizeSnapshotEnvelope(envelope);
	const decoded = utf8Bytes(JSON.stringify(normalized));
	if (decoded.byteLength > SNAPSHOT_MAX_DECODED_BYTES) {
		throw new SnapshotCodecError(
			'decoded-too-large',
			'The snapshot exceeds the 64 KiB data limit.'
		);
	}
	return bytesToBase64Url(await gzip(decoded));
}

export async function decodeSnapshotPayload(payload: string): Promise<DecodedSnapshot> {
	const compressed = base64UrlToBytes(payload);
	const decoded = await gunzip(compressed);
	let value: unknown;
	try {
		value = JSON.parse(decodeUtf8(decoded));
	} catch (cause) {
		if (cause instanceof SnapshotCodecError) throw cause;
		throw new SnapshotCodecError('malformed-payload', 'The snapshot payload is not valid JSON.', {
			cause
		});
	}

	const envelope = normalizeSnapshotEnvelope(value);
	return { envelope, compatibility: getSnapshotCompatibility(envelope) };
}

export async function encodeSnapshotHash(envelope: SnapshotEnvelopeV1): Promise<string> {
	return `${SNAPSHOT_HASH_PREFIX}${await encodeSnapshotPayload(envelope)}`;
}

function extractHash(value: string): string {
	const hashIndex = value.indexOf('#');
	return hashIndex >= 0 ? value.slice(hashIndex) : value;
}

export function isSnapshotHash(value: string): boolean {
	return /^#?snapshot=v\d+\./u.test(extractHash(value));
}

export async function decodeSnapshotHash(value: string): Promise<DecodedSnapshot> {
	const hash = extractHash(value);
	const match = /^#?snapshot=v(\d+)\.(.+)$/u.exec(hash);
	if (!match) {
		throw new SnapshotCodecError('invalid-fragment', 'This is not a valid snapshot link.');
	}

	const version = Number(match[1]);
	if (version !== SNAPSHOT_ENVELOPE_VERSION) {
		throw new SnapshotCodecError(
			'unsupported-version',
			version > SNAPSHOT_ENVELOPE_VERSION
				? 'This snapshot link was created by a newer version of the calculator.'
				: 'This snapshot link version is not supported.'
		);
	}

	return decodeSnapshotPayload(match[2]);
}
