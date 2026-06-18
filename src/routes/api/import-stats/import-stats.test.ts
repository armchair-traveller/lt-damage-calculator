import { describe, expect, it, vi } from 'vitest';
import { _handleImportRequest } from './+server.js';
import type { ScreenshotExtraction } from '$lib/calculator/importer.js';

const extraction: ScreenshotExtraction = {
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
		physicalStaticDamagePercent: '92%',
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
		expect.assertions(17);
		const uploadBytes = new Uint8Array([1, 2, 3, 4]);
		const processedBytes = new Uint8Array([137, 80, 78, 71]);
		const preprocessMock = vi.fn(async (bytes: Uint8Array) => {
			expect(Array.from(bytes)).toEqual(Array.from(uploadBytes));
			return processedScreenshot(processedBytes);
		});
		const fetchMock = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body)) as {
				model: string;
				reasoning: { effort: string };
				input: Array<{ content: Array<{ type: string; detail?: string; image_url?: string; text?: string }> }>;
				text: { format: { schema: { required: string[]; properties: Record<string, unknown> } } };
			};
			const image = body.input[0].content.find((item) => item.type === 'input_image');
			const prompt = body.input[0].content.find((item) => item.type === 'input_text');
			expect(body.model).toBe('gpt-5.4-mini');
			expect(body.reasoning.effort).toBe('none');
			expect(prompt?.text).toContain('Step order:');
			expect(image?.detail).toBe('high');
			expect(image?.image_url).toBe(`data:image/png;base64,${Buffer.from(processedBytes).toString('base64')}`);
			expect(body.text.format.schema.required).not.toContain('variant');
			expect(body.text.format.schema.properties).not.toHaveProperty('variant');
			return Response.json({ output_text: JSON.stringify(extraction) });
		});

		const response = await _handleImportRequest(uploadRequest('stats.png', 'image/png', uploadBytes), {
			apiKey: 'test-key',
			fetch: fetchMock as typeof fetch,
			preprocessImage: preprocessMock
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(preprocessMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(body.variant).toBe('physical');
		expect(body.stats.strength).toEqual(['4262437', '409']);
		expect(body.stats.attack).toEqual(['55657', '370']);
		expect(body.stats.static).toEqual(['672263', '92']);
		expect(body.variants.magical.static).toEqual(['551320', '64']);
		expect(body.warnings).toEqual([]);
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
		expect.assertions(4);
		const fetchMock = vi.fn();
		const preprocessMock = vi.fn(async () => processedScreenshot());
		const textResponse = await _handleImportRequest(uploadRequest('stats.txt', 'text/plain'), {
			apiKey: 'test-key',
			fetch: fetchMock as typeof fetch,
			preprocessImage: preprocessMock
		});
		const animatedGifResponse = await _handleImportRequest(
			uploadRequest('stats.gif', 'image/gif', new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x2c, 0x00, 0x2c])),
			{ apiKey: 'test-key', fetch: fetchMock as typeof fetch, preprocessImage: preprocessMock }
		);

		expect(textResponse.status).toBe(415);
		expect(animatedGifResponse.status).toBe(415);
		expect(preprocessMock).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rejects unreadable image bytes before OpenAI', async () => {
		expect.assertions(3);
		const fetchMock = vi.fn();
		const response = await _handleImportRequest(uploadRequest('stats.png', 'image/png'), {
			apiKey: 'test-key',
			fetch: fetchMock as typeof fetch
		});

		expect(response.status).toBe(400);
		expect((await response.json()).message).toContain('readable');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('handles malformed OpenAI output', async () => {
		expect.assertions(2);
		const fetchMock = vi.fn(async () => Response.json({ output_text: '{"nope"' }));
		const response = await _handleImportRequest(uploadRequest('stats.webp', 'image/webp'), {
			apiKey: 'test-key',
			fetch: fetchMock as typeof fetch,
			preprocessImage: async () => processedScreenshot()
		});

		expect(response.status).toBe(502);
		expect((await response.json()).message).toContain('malformed');
	});
});

function processedScreenshot(bytes = new Uint8Array([1, 2, 3])) {
	return {
		bytes,
		type: 'image/png' as const,
		width: 2,
		height: 2
	};
}

function uploadRequest(name: string, type: string, bytes = new Uint8Array([1, 2, 3, 4])) {
	const formData = new FormData();
	formData.set('screenshot', new File([bytes], name, { type }));
	return new Request('http://local/api/import-stats', {
		method: 'POST',
		body: formData
	});
}
