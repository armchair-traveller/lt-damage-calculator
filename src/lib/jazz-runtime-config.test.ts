import { describe, expect, it } from 'vitest';

import { jazzEnvironment, JAZZ_TIER, JAZZ_USER_BRANCH } from './jazz-runtime-config.js';

describe('Jazz runtime configuration', () => {
	it('uses the same explicit branch and environment names in every runtime', () => {
		expect(JAZZ_USER_BRANCH).toBe('main');
		expect(JAZZ_TIER).toBe('edge');
		expect(jazzEnvironment(false)).toBe('dev');
		expect(jazzEnvironment(true)).toBe('prod');
	});
});
