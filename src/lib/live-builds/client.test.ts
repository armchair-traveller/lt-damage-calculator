import { describe, expect, it } from 'vitest';
import { buildLiveBuildChanges } from './client.js';
import type { SnapshotEnvelopeV1 } from './contracts.js';
import { createDefaultState } from '$lib/calculator/model.js';

function envelope(): SnapshotEnvelopeV1 {
	return {
		version: 1,
		title: 'Raid build',
		createdAt: '2026-08-05T00:00:00.000Z',
		stateVersion: 2,
		formulaRevision: '1',
		state: createDefaultState()
	};
}

describe('buildLiveBuildChanges', () => {
	it('emits leaf changes for independent calculator fields', () => {
		const before = envelope();
		const originalAttack = before.state.stats.attack[0];
		const after = structuredClone(before);
		after.state.stats.attack[0] = '12345';
		after.state.settings.bossWeight = 0.75;

		expect(buildLiveBuildChanges(before, after)).toEqual([
			{ path: '/state/settings/bossWeight', before: 0.5, after: 0.75 },
			{ path: '/state/stats/attack/0', before: originalAttack, after: '12345' }
		]);
	});

	it('returns no changes for structurally equal envelopes', () => {
		const before = envelope();
		expect(buildLiveBuildChanges(before, structuredClone(before))).toEqual([]);
	});
});
