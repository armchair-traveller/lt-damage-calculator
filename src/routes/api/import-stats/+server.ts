import { json } from '@sveltejs/kit';
import { OPENAI_API_KEY } from '$env/static/private';
import { Buffer } from 'node:buffer';
import type { RequestHandler } from './$types.js';
import {
	SCREENSHOT_EXTRACTION_FIELD_KEYS,
	mapScreenshotExtraction,
	type ScreenshotExtraction
} from '$lib/calculator/importer.js';
import {
	preprocessScreenshotImage,
	type PreprocessedScreenshot
} from '$lib/server/screenshot-preprocessor.js';

export const prerender = false;

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MODEL = 'gpt-5.4-mini';
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const SCREENSHOT_IMPORT_PROMPT = [
	'Role: Extract LaTale status-window stats from one screenshot for a stat-import tool.',
	'Critical rules:',
	'- Return only the final JSON object that matches the schema. After the final JSON, output nothing further.',
	'- Do not ask a follow-up question, explain the extraction, or choose a physical or magical focus.',
	'- Extract both physical and magical variants exactly as visible.',
	'- Use null for any value that is hidden, unreadable, absent, or not clearly tied to the requested field.',
	'- Do not guess from nearby rows. Add a short warning for ambiguous, hidden, or low-confidence values.',
	'- Keep numeric text exact; include commas or percent signs only if they appear. When a stat is shown as a range, use the higher or right-side value.',
	'Step order:',
	'1. Read the main status values: STR, INT, Attack, and Ele. Intensity. Keep STR separate from INT and Attack separate from Ele. Intensity.',
	'2. Read both Physical and Magical columns separately wherever a table has both columns.',
	'3. Read Additional Details rows for Strength, Intelligence, Attack, Ele. Intensity, Normal Add. DMG, and Boss Add. DMG.',
	'4. Read the lower Physical/Magical table rows for Critical Damage, Minimum Damage, Maximum Damage, Static Damage, Strength/Magic, Back Attack Damage, Physical Power, and Magical Power.',
	'5. Read the lower Detailed Stats Normal/Boss table rows for Added Damage and Damage Amplification.',
	'6. Read Melee Damage and Status Damage if visible.',
	'7. Before finalizing, verify every schema field was either filled from visible text or set to null.',
	'Field rules:',
	'- For strengthPercent, read the percent on the Strength row in Additional Details. For intelligencePercent, read the percent on the Intelligence row.',
	'- For attackBonusRow, return the full Additional Details Attack row text, including the flat bonus or range and the percent or percent range if visible.',
	'- For elementalIntensityBonusRow, return the full Additional Details Ele. Intensity row text, including the flat bonus and percent if visible.',
	'- For attackPercent and elementalIntensityPercent, read the rightmost percent or percent range from those same rows.',
	'- For detailedNormalAddedFlat and detailedBossAddedFlat, read the lower Detailed Stats table row named Added Damage under the Normal and Boss columns.',
	'- For detailedNormalAmpFlat and detailedBossAmpFlat, read the lower Detailed Stats table row named Damage Amplification under the Normal and Boss columns.',
	'- For normalAddedFlat, bossAddedFlat, normalAmpFlat, and bossAmpFlat, do not use the Additional Details bonus rows; prefer the Detailed Stats Normal/Boss table values.',
	'- For normalAddedPercent and bossAddedPercent, use the Additional Details Normal Add. DMG and Boss Add. DMG percent values.',
	'- For statRatioPercent, read the lower Physical/Magical table row named Strength/Magic; do not use this value as strengthPercent or intelligencePercent.',
	'- For physicalStaticDamagePercent and magicalStaticDamagePercent, read the percent on the Static Damage row in the lower Physical/Magical table, next to the Static Damage bonus flat value.',
	'- For physicalStaticDamageBonusRow and magicalStaticDamageBonusRow, return the full lower-table Static Damage row text for each column, including the bonus flat value and slash percent.',
	'- Do not use the Detailed Stats Def. Penetration value as any Static Damage percent.',
	'- Extract both Physical Power and Magical Power indicator values even though they are not imported into base stats.',
	'Output:',
	'- fields: include every schema field.',
	'- confidence: a number from 0 to 1 based on screenshot readability and extraction certainty.',
	'- warnings: concise strings; use [] when there are no issues.'
].join('\n');

type ImportHandlerOptions = {
	apiKey?: string;
	fetch?: typeof fetch;
	preprocessImage?: (bytes: Uint8Array) => Promise<PreprocessedScreenshot>;
};

export const POST: RequestHandler = async ({ request }) => {
	return _handleImportRequest(request);
};

export async function _handleImportRequest(request: Request, options: ImportHandlerOptions = {}) {
	const apiKey = options.apiKey ?? OPENAI_API_KEY;
	if (!apiKey) {
		return json({ message: 'OPENAI_API_KEY is not configured.' }, { status: 500 });
	}

	const fileResult = await readScreenshotFile(request);
	if (!fileResult.ok) {
		return json({ message: fileResult.message }, { status: fileResult.status });
	}

	let image: PreprocessedScreenshot;
	try {
		const preprocessImage = options.preprocessImage ?? preprocessScreenshotImage;
		image = await preprocessImage(fileResult.bytes);
	} catch {
		return json({ message: 'Upload a readable screenshot image.' }, { status: 400 });
	}

	const clientFetch = options.fetch ?? fetch;
	const response = await clientFetch(OPENAI_RESPONSES_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(buildOpenAIRequest(imageDataUrl(image)))
	});

	if (!response.ok) {
		return json({ message: 'OpenAI could not read the screenshot.' }, { status: 502 });
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		return json({ message: 'OpenAI returned an unreadable response.' }, { status: 502 });
	}

	const text = extractOpenAIText(payload);
	if (!text) {
		return json({ message: 'OpenAI returned no extracted stats.' }, { status: 502 });
	}

	try {
		const extraction = JSON.parse(text) as ScreenshotExtraction;
		return json(mapScreenshotExtraction(extraction));
	} catch {
		return json({ message: 'OpenAI returned malformed stat data.' }, { status: 502 });
	}
}

async function readScreenshotFile(request: Request) {
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return { ok: false as const, status: 400, message: 'Upload a screenshot file.' };
	}

	const file = formData.get('screenshot');
	if (!(file instanceof File)) {
		return { ok: false as const, status: 400, message: 'Upload a screenshot file.' };
	}

	const type = normalizeMimeType(file);
	if (!ACCEPTED_TYPES.has(type)) {
		return { ok: false as const, status: 415, message: 'Use a PNG, JPEG, WEBP, or non-animated GIF.' };
	}

	if (file.size > MAX_IMAGE_BYTES) {
		return { ok: false as const, status: 413, message: 'Use an image smaller than 8 MB.' };
	}

	const bytes = new Uint8Array(await file.arrayBuffer());
	if (type === 'image/gif' && isAnimatedGif(bytes)) {
		return { ok: false as const, status: 415, message: 'Animated GIFs are not supported.' };
	}

	return {
		ok: true as const,
		bytes
	};
}

function imageDataUrl(image: PreprocessedScreenshot) {
	return `data:${image.type};base64,${Buffer.from(image.bytes).toString('base64')}`;
}

function normalizeMimeType(file: File) {
	if (ACCEPTED_TYPES.has(file.type)) return file.type;
	const extension = file.name.split('.').pop()?.toLowerCase();
	if (extension === 'png') return 'image/png';
	if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
	if (extension === 'webp') return 'image/webp';
	if (extension === 'gif') return 'image/gif';
	return file.type;
}

function isAnimatedGif(bytes: Uint8Array) {
	let imageCount = 0;
	for (let index = 0; index < bytes.length; index += 1) {
		if (bytes[index] === 0x2c) imageCount += 1;
		if (imageCount > 1) return true;
	}
	return false;
}

function buildOpenAIRequest(imageUrl: string) {
	return {
		model: MODEL,
		reasoning: { effort: 'none' },
		input: [
			{
				role: 'user',
				content: [
					{
						type: 'input_text',
						text: SCREENSHOT_IMPORT_PROMPT
					},
					{
						type: 'input_image',
						image_url: imageUrl,
						detail: 'high'
					}
				]
			}
		],
		text: {
			format: {
				type: 'json_schema',
				name: 'latale_screenshot_stat_import',
				strict: true,
				schema: extractionSchema()
			}
		}
	};
}

function extractionSchema() {
	const fieldProperties = Object.fromEntries(
		SCREENSHOT_EXTRACTION_FIELD_KEYS.map((key) => [
			key,
			{
				type: ['string', 'null']
			}
		])
	);

	return {
		type: 'object',
		additionalProperties: false,
		required: ['fields', 'confidence', 'warnings'],
		properties: {
			fields: {
				type: 'object',
				additionalProperties: false,
				required: SCREENSHOT_EXTRACTION_FIELD_KEYS,
				properties: fieldProperties
			},
			confidence: {
				type: 'number',
				minimum: 0,
				maximum: 1
			},
			warnings: {
				type: 'array',
				items: { type: 'string' }
			}
		}
	};
}

function extractOpenAIText(payload: unknown): string {
	const record = payload as { output_text?: unknown; output?: unknown };
	if (typeof record.output_text === 'string') return record.output_text;
	if (!Array.isArray(record.output)) return '';

	for (const output of record.output) {
		const content = (output as { content?: unknown }).content;
		if (!Array.isArray(content)) continue;
		for (const item of content) {
			const text = (item as { text?: unknown; value?: unknown }).text ?? (item as { value?: unknown }).value;
			if (typeof text === 'string') return text;
		}
	}

	return '';
}
