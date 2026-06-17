import { describe, expect, it, vi } from 'vitest';
import { _handleImportRequest } from './+server.js';
import type { ScreenshotExtraction } from '$lib/calculator/importer.js';

const extraction: ScreenshotExtraction = {
	variant: 'magical',
	confidence: 0.88,
	warnings: [],
	fields: {
		str: '4,262,437',
		int: '4,194,643',
		attack: '54,544 ~ 55,657',
		elementalIntensity: '39,764',
		attackBonusRow: 'Attack 11,454 ~ 11,727 370 ~ 370',
		elementalIntensityBonusRow: 'Ele. Intensity +9,058 339%',
		physicalPowerDirectAttack: '441,757',
		magicalPowerDirectAttack: '286,053',
		physicalPowerSummonAttack: '384,708',
		magicalPowerSummonAttack: '290,227',
		physicalCriticalDamage: '7,900',
		magicalCriticalDamage: '7,307',
		physicalMinimumDamage: '6,596',
		magicalMinimumDamage: '6,465',
		physicalMaximumDamage: '7,060',
		magicalMaximumDamage: '6,498',
		physicalStaticDamage: '672,263',
		magicalStaticDamage: '551,320',
		physicalStaticDamageBonusRow: 'Static Damage +350,137 / 92%',
		magicalStaticDamageBonusRow: 'Static Damage +336,171 / 64%',
		physicalBackAttackDamage: '1,033',
		magicalBackAttackDamage: '1,032',
		detailedNormalAddedFlat: '867,057',
		detailedBossAddedFlat: '924,731',
		detailedNormalAmpFlat: '67.7',
		detailedBossAmpFlat: '61.5',
		normalAddedFlat: '760,577',
		bossAddedFlat: '804,114',
		normalAmpFlat: '14',
		bossAmpFlat: '15',
		strengthPercent: '409%',
		intelligencePercent: '409%',
		attackPercent: null,
		elementalIntensityPercent: null,
		physicalCriticalDamagePercent: '39%',
		magicalCriticalDamagePercent: '34%',
		physicalMinimumDamagePercent: '38%',
		magicalMinimumDamagePercent: '38%',
		physicalMaximumDamagePercent: '33%',
		magicalMaximumDamagePercent: '28%',
		physicalStaticDamagePercent: '97%',
		magicalStaticDamagePercent: '64%',
		normalAddedPercent: '14%',
		bossAddedPercent: '15%',
		statRatioPercent: '12%',
		meleeDamage: '336',
		statusDamage: '59'
	}
};

describe('screenshot stat import route', () => {
	it('returns mapped stats from a mocked OpenAI response', async () => {
		expect.assertions(9);
		const fetchMock = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body)) as {
				model: string;
				input: Array<{ content: Array<{ type: string; detail?: string }> }>;
			};
			expect(body.model).toBe('gpt-5.4-mini');
			expect(body.input[0].content.some((item) => item.type === 'input_image' && item.detail === 'high')).toBe(true);
			return Response.json({ output_text: JSON.stringify(extraction) });
		});

		const response = await _handleImportRequest(uploadRequest('stats.png', 'image/png'), {
			apiKey: 'test-key',
			fetch: fetchMock as typeof fetch
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(body.variant).toBe('physical');
		expect(body.stats.strength).toEqual(['4262437', '409']);
		expect(body.stats.attack).toEqual(['55657', '370']);
		expect(body.stats.static).toEqual(['672263', '92']);
		expect(body.warnings).toContain('Corrected focus to physical because the power columns indicate that build.');
	});

	it('rejects requests before OpenAI when the key or file is missing', async () => {
		expect.assertions(4);
		const fetchMock = vi.fn();

		const missingKey = await _handleImportRequest(uploadRequest('stats.png', 'image/png'), {
			apiKey: '',
			fetch: fetchMock as typeof fetch
		});
		const missingFile = await _handleImportRequest(new Request('http://local/api/import-stats', { method: 'POST' }), {
			apiKey: 'test-key',
			fetch: fetchMock as typeof fetch
		});

		expect(missingKey.status).toBe(500);
		expect(missingFile.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
		expect((await missingKey.json()).message).toContain('OPENAI_API_KEY');
	});

	it('rejects unsupported image types and animated GIFs', async () => {
		expect.assertions(3);
		const fetchMock = vi.fn();
		const textResponse = await _handleImportRequest(uploadRequest('stats.txt', 'text/plain'), {
			apiKey: 'test-key',
			fetch: fetchMock as typeof fetch
		});
		const animatedGifResponse = await _handleImportRequest(
			uploadRequest('stats.gif', 'image/gif', new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x2c, 0x00, 0x2c])),
			{ apiKey: 'test-key', fetch: fetchMock as typeof fetch }
		);

		expect(textResponse.status).toBe(415);
		expect(animatedGifResponse.status).toBe(415);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('handles malformed OpenAI output', async () => {
		expect.assertions(2);
		const fetchMock = vi.fn(async () => Response.json({ output_text: '{"nope"' }));
		const response = await _handleImportRequest(uploadRequest('stats.webp', 'image/webp'), {
			apiKey: 'test-key',
			fetch: fetchMock as typeof fetch
		});

		expect(response.status).toBe(502);
		expect((await response.json()).message).toContain('malformed');
	});
});

function uploadRequest(name: string, type: string, bytes = new Uint8Array([1, 2, 3, 4])) {
	const formData = new FormData();
	formData.set('screenshot', new File([bytes], name, { type }));
	return new Request('http://local/api/import-stats', {
		method: 'POST',
		body: formData
	});
}
