import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../live-builds/contracts.js';
import { createDefaultState } from './model.js';
import {
	SNAPSHOT_HASH_PREFIX,
	SNAPSHOT_MAX_COMPRESSED_BYTES,
	SNAPSHOT_MAX_DECODED_BYTES,
	createSnapshotEnvelope,
	decodeSnapshotHash,
	decodeSnapshotPayload,
	encodeSnapshotHash,
	encodeSnapshotPayload,
	isSnapshotHash,
	readSnapshotFrozenSummary,
	type SnapshotEnvelopeV1
} from './snapshot-codec.js';

async function rawGzipPayload(value: string): Promise<string> {
	const input = new TextEncoder().encode(value);
	const stream = new Blob([input.buffer]).stream().pipeThrough(new CompressionStream('gzip'));
	const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
	return Buffer.from(compressed).toString('base64url');
}

describe('snapshot codec', () => {
	it('round-trips a calculator snapshot through a self-contained hash', async () => {
		expect.assertions(10);
		const state = createDefaultState();
		state.stats.attack[0] = '123456';
		state.settings.target = 'soft';
		const envelope = createSnapshotEnvelope({
			title: '  Raid build  ',
			state,
			createdAt: '2026-08-05T12:00:00-07:00'
		});

		const hash = await encodeSnapshotHash(envelope);
		expect(hash.startsWith(SNAPSHOT_HASH_PREFIX)).toBe(true);
		expect(isSnapshotHash(hash)).toBe(true);
		expect(isSnapshotHash(`https://example.test/${hash}`)).toBe(true);

		const decoded = await decodeSnapshotHash(`https://example.test/calculator${hash}`);
		expect(decoded.envelope).toEqual(envelope);
		expect(decoded.envelope.title).toBe('Raid build');
		expect(decoded.envelope.createdAt).toBe('2026-08-05T19:00:00.000Z');
		expect(decoded.envelope.state.stats.attack[0]).toBe('123456');
		expect(readSnapshotFrozenSummary(decoded.envelope)?.target).toEqual({
			key: 'soft',
			label: 'Soft Dummy'
		});
		expect(decoded.compatibility).toEqual({
			state: 'current',
			formula: 'current',
			canLoadState: true,
			warnings: []
		});
		expect(readSnapshotFrozenSummary(decoded.envelope)?.results.base.normal).toMatch(/^\d+b\d{3}m$/u);
	});

	it('shares the canonical live-build envelope and allows an omitted frozen summary', async () => {
		expect.assertions(4);
		const canonical: SnapshotEnvelopeV1 = {
			version: 1,
			title: 'Live build',
			createdAt: '2026-08-05T12:00:00.000Z',
			stateVersion: 2,
			formulaRevision: '1',
			state: createDefaultState()
		};

		const decoded = await decodeSnapshotPayload(await encodeSnapshotPayload(canonical));
		expect(decoded.envelope).toEqual(canonical);
		expect(decoded.envelope.frozenSummary).toBeUndefined();
		expect(readSnapshotFrozenSummary(decoded.envelope)).toBeUndefined();
		expect(decoded.compatibility.canLoadState).toBe(true);
	});

	it('retains frozen results while flagging newer state and formula revisions', async () => {
		expect.assertions(6);
		const envelope = createSnapshotEnvelope({
			title: 'Future build',
			state: createDefaultState(),
			createdAt: '2026-08-05T12:00:00.000Z'
		});
		const future: SnapshotEnvelopeV1 = {
			...envelope,
			stateVersion: 3,
			formulaRevision: '2'
		};
		const decoded = await decodeSnapshotPayload(await encodeSnapshotPayload(future));

		expect(decoded.compatibility.state).toBe('newer');
		expect(decoded.compatibility.formula).toBe('newer');
		expect(decoded.compatibility.canLoadState).toBe(false);
		expect(decoded.compatibility.warnings).toHaveLength(2);
		expect(readSnapshotFrozenSummary(decoded.envelope)).toEqual(
			readSnapshotFrozenSummary(envelope)
		);
		expect(decoded.envelope.stateVersion).toBe(3);
	});

	it('rejects malformed and unsupported link fragments with typed codes', async () => {
		expect.assertions(5);
		await expect(decodeSnapshotHash('#not-a-snapshot')).rejects.toMatchObject({
			code: 'invalid-fragment'
		});
		await expect(decodeSnapshotHash('#snapshot=v2.abc')).rejects.toMatchObject({
			code: 'unsupported-version'
		});
		await expect(decodeSnapshotPayload('A')).rejects.toMatchObject({ code: 'malformed-payload' });
		await expect(decodeSnapshotPayload('AAAA')).rejects.toMatchObject({
			code: 'malformed-payload'
		});
		await expect(
			decodeSnapshotPayload('A'.repeat(Math.ceil((SNAPSHOT_MAX_COMPRESSED_BYTES * 4) / 3) + 4))
		).rejects.toMatchObject({ code: 'compressed-too-large' });
	});

	it('rejects malformed and newer envelopes after decompression', async () => {
		expect.assertions(2);
		const missingState = await rawGzipPayload(
			JSON.stringify({
				version: 1,
				title: 'Broken',
				createdAt: '2026-08-05T12:00:00.000Z',
				stateVersion: 2,
				formulaRevision: '1'
			})
		);
		await expect(decodeSnapshotPayload(missingState)).rejects.toMatchObject({
			code: 'invalid-envelope'
		});

		const newerEnvelope = await rawGzipPayload(JSON.stringify({ version: 2 }));
		await expect(decodeSnapshotPayload(newerEnvelope)).rejects.toMatchObject({
			code: 'unsupported-version'
		});
	});

	it('enforces the decoded limit before creating or expanding an oversized snapshot', async () => {
		expect.assertions(3);
		const envelope = createSnapshotEnvelope({
			title: 'Large build',
			state: createDefaultState(),
			createdAt: '2026-08-05T12:00:00.000Z'
		});
		const frozenSummary = readSnapshotFrozenSummary(envelope);
		expect(frozenSummary).toBeDefined();
		if (!frozenSummary) throw new Error('Expected a frozen summary.');
		frozenSummary.results.base.normal = 'x'.repeat(SNAPSHOT_MAX_DECODED_BYTES);
		const oversizedEnvelope: SnapshotEnvelopeV1 = {
			...envelope,
			frozenSummary: frozenSummary as JsonValue
		};
		await expect(encodeSnapshotPayload(oversizedEnvelope)).rejects.toMatchObject({
			code: 'decoded-too-large'
		});

		const compressedExpansion = await rawGzipPayload(
			JSON.stringify({ padding: 'x'.repeat(SNAPSHOT_MAX_DECODED_BYTES + 1) })
		);
		await expect(decodeSnapshotPayload(compressedExpansion)).rejects.toMatchObject({
			code: 'decoded-too-large'
		});
	});
});
