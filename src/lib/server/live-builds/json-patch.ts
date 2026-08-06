import type { JsonValue, LiveBuildPatchChange } from '$lib/live-builds/contracts';

import { badRequest } from './errors';

export const MAX_LIVE_BUILD_PATCH_CHANGES = 256;
const MAX_POINTER_LENGTH = 512;
const BLOCKED_POINTER_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isJsonValue(value: unknown): value is JsonValue {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
	if (typeof value === 'number') return Number.isFinite(value);
	if (Array.isArray(value)) return value.every(isJsonValue);
	if (!isRecord(value)) return false;
	return Object.values(value).every(isJsonValue);
}

export function jsonValuesEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (Array.isArray(left) && Array.isArray(right)) {
		return (
			left.length === right.length && left.every((value, index) => jsonValuesEqual(value, right[index]))
		);
	}
	if (isRecord(left) && isRecord(right)) {
		const leftKeys = Object.keys(left);
		const rightKeys = Object.keys(right);
		return (
			leftKeys.length === rightKeys.length &&
			leftKeys.every(
				(key) => Object.hasOwn(right, key) && jsonValuesEqual(left[key], right[key])
			)
		);
	}
	return false;
}

function decodePointerSegment(segment: string): string {
	if (/~(?:[^01]|$)/.test(segment)) badRequest('A change contains an invalid JSON Pointer.');
	const decoded = segment.replaceAll('~1', '/').replaceAll('~0', '~');
	if (BLOCKED_POINTER_SEGMENTS.has(decoded)) badRequest('A change targets a forbidden path.');
	return decoded;
}

function parsePointer(pointer: string): string[] {
	if (!pointer.startsWith('/') || pointer.length > MAX_POINTER_LENGTH) {
		badRequest('Each change path must be a bounded RFC 6901 JSON Pointer.');
	}
	const segments = pointer.slice(1).split('/').map(decodePointerSegment);
	if (
		!((segments[0] === 'state' && segments.length > 1) ||
			(segments.length === 1 && segments[0] === 'title'))
	) {
		badRequest('Live edits may only change the snapshot title or calculator state.');
	}
	return segments;
}

function readAtPointer(root: JsonValue, segments: string[]): JsonValue | undefined {
	let current: JsonValue | undefined = root;
	for (const segment of segments) {
		if (Array.isArray(current)) {
			if (!/^(0|[1-9]\d*)$/.test(segment)) return undefined;
			current = current[Number(segment)];
			continue;
		}
		if (isRecord(current) && Object.hasOwn(current, segment)) {
			current = current[segment] as JsonValue;
			continue;
		}
		return undefined;
	}
	return current;
}

function writeAtPointer(root: JsonValue, segments: string[], value: JsonValue): void {
	let parent: JsonValue = root;
	for (const segment of segments.slice(0, -1)) {
		if (Array.isArray(parent)) {
			parent = parent[Number(segment)] as JsonValue;
		} else if (isRecord(parent)) {
			parent = parent[segment] as JsonValue;
		} else {
			badRequest('A change targets a missing path.');
		}
	}

	const last = segments.at(-1) as string;
	if (Array.isArray(parent)) parent[Number(last)] = structuredClone(value);
	else (parent as Record<string, JsonValue>)[last] = structuredClone(value);
}

export function parsePatchChanges(input: unknown): LiveBuildPatchChange[] {
	if (
		!Array.isArray(input) ||
		input.length === 0 ||
		input.length > MAX_LIVE_BUILD_PATCH_CHANGES
	) {
		badRequest(`changes must contain between 1 and ${MAX_LIVE_BUILD_PATCH_CHANGES} entries.`);
	}

	const seenPaths = new Set<string>();
	return input.map((entry) => {
		if (!isRecord(entry) || typeof entry.path !== 'string') {
			badRequest('Each change must include a path, before value and after value.');
		}
		parsePointer(entry.path);
		if (seenPaths.has(entry.path)) badRequest('A patch cannot change the same path twice.');
		seenPaths.add(entry.path);
		if (!Object.hasOwn(entry, 'before') || !Object.hasOwn(entry, 'after')) {
			badRequest('Each change must include both before and after values.');
		}
		if (!isJsonValue(entry.before) || !isJsonValue(entry.after)) {
			badRequest('Patch values must be valid JSON values.');
		}
		return { path: entry.path, before: entry.before, after: entry.after };
	});
}

export function applyLiveBuildChanges<T extends JsonValue>(
	current: T,
	changes: LiveBuildPatchChange[]
): { next: T; changed: boolean; conflictingPaths: string[] } {
	const next = structuredClone(current);
	let changed = false;
	const conflictingPaths: string[] = [];

	for (const change of changes) {
		const segments = parsePointer(change.path);
		const currentValue = readAtPointer(next, segments);
		if (jsonValuesEqual(currentValue, change.after)) continue;
		if (!jsonValuesEqual(currentValue, change.before)) {
			conflictingPaths.push(change.path);
			continue;
		}
		if (change.after === undefined) badRequest('Patch values must be valid JSON values.');
		writeAtPointer(next, segments, change.after);
		changed = true;
	}

	return { next, changed, conflictingPaths };
}
