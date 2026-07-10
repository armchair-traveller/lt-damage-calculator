import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLASS_ART_BY_PRESET, getClassArt } from './class-art.js';
import { CLASS_PRESETS } from './model.js';

describe('class art registry', () => {
	it('covers every selectable class preset exactly once', () => {
		expect(Object.keys(CLASS_ART_BY_PRESET).sort()).toEqual(Object.keys(CLASS_PRESETS).sort());
	});

	it('shares artwork across weapon and stance variants', () => {
		expect(getClassArt('Hero (Greatsword)')).toBe(getClassArt('Hero (Spear)'));
		expect(getClassArt('Savior (Sword)')).toBe(getClassArt('Savior (Mace)'));
		expect(getClassArt('Demigod (Rage)')).toBe(getClassArt('Demigod (Divine)'));
	});

	it('uses the approved Dokkaebi subject as the unselected fallback', () => {
		expect(getClassArt(null).label).toBe('Dokkaebi');
	});

	it('references local artwork that exists in the static directory', () => {
		const uniqueSources = new Set(Object.values(CLASS_ART_BY_PRESET).map((entry) => entry.src));

		for (const source of uniqueSources) {
			expect(existsSync(resolve('static', source.slice(1))), source).toBe(true);
		}
	});
});
