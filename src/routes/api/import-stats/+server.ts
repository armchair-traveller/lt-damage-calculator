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
const MODEL = 'gpt-5.6-sol';
const IMAGE_DETAIL = 'original';
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const SCREENSHOT_IMPORT_PROMPT = [
	'Extract exact text from one LaTale status screenshot into the provided schema.',
	'Transcription rules:',
	'- Return only the final JSON object that matches the schema. After the final JSON, output nothing further.',
	'- Transcribe visible text only. Never calculate, infer, correct, normalize, or round a value.',
	'- Use null for any value that is hidden, unreadable, absent, or not clearly tied to the requested field.',
	'- Preserve every visible digit, comma, decimal point, sign, slash, tilde, and percent sign. For a range, use its visible right-hand value where the schema requests one value.',
	'- Right-hand value means the endpoint of an explicit ~ range inside one cell; it never means the Magical column.',
	'- Keep Physical and Magical columns separate. Do not choose one focus or copy a value between columns.',
	'Panel map:',
	'1. Detailed Stats is the left panel. Read STR, INT, Attack, Ele. Intensity, the main Physical/Magical values, and the lower Normal/Boss values there.',
	'2. Additional Details is the right panel. Read the power indicators, upper bonus rows, lower Physical/Magical bonus grid, Melee Damage, and Status Damage there.',
	'Lower bonus-grid procedure:',
	'- Process these named rows one at a time: Critical Damage, Minimum Damage, Maximum Damage, Static Damage, Strength/Magic.',
	'- On each row, first confirm the row label, then read the complete Physical cell and the complete Magical cell before moving to another row.',
	'- Critical Damage, Minimum Damage, Maximum Damage, and Static Damage are independent adjacent rows. Never reuse a flat or percent from the row above or below.',
	'- For every Critical, Minimum, Maximum, or Static *BonusRow field, return the complete matching cell text, including the visible +flat / percent.',
	'- For each matching damage *Percent field, return only the percent from that same row and column.',
	'- Cross-check each Critical, Minimum, Maximum, and Static percent against its BonusRow cell. If they disagree, re-read the row; use null and add a warning if still unresolved.',
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
	'- Do not use the Detailed Stats Def. Penetration value as any Static Damage percent.',
	'- Extract both Physical Power and Magical Power indicator values even though they are not imported into base stats.',
	'- Before returning, verify that every schema field is filled from its named cell or is null. Add concise warnings for unresolved or low-confidence cells; otherwise use [].'
].join('\n');

const SCREENSHOT_FIELD_DESCRIPTIONS: Partial<
	Record<(typeof SCREENSHOT_EXTRACTION_FIELD_KEYS)[number], string>
> = {
	physicalCriticalDamage: 'Detailed Stats left panel, Critical Damage row, Physical column main value.',
	magicalCriticalDamage: 'Detailed Stats left panel, Critical Damage row, Magical column main value.',
	physicalMinimumDamage: 'Detailed Stats left panel, Minimum Damage row, Physical column main value.',
	magicalMinimumDamage: 'Detailed Stats left panel, Minimum Damage row, Magical column main value.',
	physicalMaximumDamage: 'Detailed Stats left panel, Maximum Damage row, Physical column main value.',
	magicalMaximumDamage: 'Detailed Stats left panel, Maximum Damage row, Magical column main value.',
	physicalCriticalDamageBonusRow:
		'Complete Physical cell on the Additional Details Critical Damage row, including +flat / percent. Do not use Minimum Damage.',
	magicalCriticalDamageBonusRow:
		'Complete Magical cell on the Additional Details Critical Damage row, including +flat / percent. Do not use Minimum Damage.',
	physicalMinimumDamageBonusRow:
		'Complete Physical cell on the Additional Details Minimum Damage row, including +flat / percent. Do not use Critical or Maximum Damage.',
	magicalMinimumDamageBonusRow:
		'Complete Magical cell on the Additional Details Minimum Damage row, including +flat / percent. Do not use Critical or Maximum Damage.',
	physicalMaximumDamageBonusRow:
		'Complete Physical cell on the Additional Details Maximum Damage row, including +flat / percent. Do not use Minimum Damage.',
	magicalMaximumDamageBonusRow:
		'Complete Magical cell on the Additional Details Maximum Damage row, including +flat / percent. Do not use Minimum Damage.',
	physicalStaticDamageBonusRow:
		'Complete Physical cell on the Additional Details Static Damage row, including +flat / percent.',
	magicalStaticDamageBonusRow:
		'Complete Magical cell on the Additional Details Static Damage row, including +flat / percent.',
	physicalCriticalDamagePercent:
		'Exact percent after the slash in the Additional Details Critical Damage row, Physical column. Do not round.',
	magicalCriticalDamagePercent:
		'Exact percent after the slash in the Additional Details Critical Damage row, Magical column. Do not round.',
	physicalMinimumDamagePercent:
		'Exact percent after the slash in the Additional Details Minimum Damage row, Physical column. Never use Critical Damage. Do not round.',
	magicalMinimumDamagePercent:
		'Exact percent after the slash in the Additional Details Minimum Damage row, Magical column. Never use Critical Damage. Do not round.',
	physicalMaximumDamagePercent:
		'Exact percent after the slash in the Additional Details Maximum Damage row, Physical column. Do not round.',
	magicalMaximumDamagePercent:
		'Exact percent after the slash in the Additional Details Maximum Damage row, Magical column. Do not round.',
	physicalStaticDamagePercent:
		'Exact percent after the slash in the Additional Details Static Damage row, Physical column. Do not use Def. Penetration.',
	magicalStaticDamagePercent:
		'Exact percent after the slash in the Additional Details Static Damage row, Magical column. Do not use Def. Penetration.'
};

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
						detail: IMAGE_DETAIL
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
		SCREENSHOT_EXTRACTION_FIELD_KEYS.map((key) => {
			const description = SCREENSHOT_FIELD_DESCRIPTIONS[key];
			return [
				key,
				{
					type: ['string', 'null'],
					...(description ? { description } : {})
				}
			];
		})
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
