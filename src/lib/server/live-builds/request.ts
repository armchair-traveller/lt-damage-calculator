import { json } from '@sveltejs/kit';

import type { LiveBuildApiErrorResponse } from '$lib/live-builds/contracts';

import { LiveBuildError } from './errors';

const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_LOG_MESSAGE_LENGTH = 2_000;
const MAX_LOG_STACK_LENGTH = 8_000;
const REDACTED = '[REDACTED]';

const AUTHORIZATION_PATTERN =
	/(\b(?:authorization|proxy-authorization)\b\s*(?:=|:)\s*)(?:bearer|basic)?\s*[^,;\r\n]+/gi;
const COOKIE_PATTERN = /(\b(?:cookie|set-cookie)\b\s*(?:=|:)\s*)[^\r\n]+/gi;
const BEARER_PATTERN = /\bbearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SECRET_ASSIGNMENT_PATTERN =
	/(\b(?:api[_-]?key|password|token|(?:jazz_(?:backend|admin)|backend|cron)_secret)\b\s*(?:=|:)\s*)(?:"[^"]*"|'[^']*'|[^\s,;\r\n]+)/gi;

function sanitizeLogText(value: string, maximumLength: number): string {
	const sanitized = value
		.replace(AUTHORIZATION_PATTERN, `$1${REDACTED}`)
		.replace(COOKIE_PATTERN, `$1${REDACTED}`)
		.replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
		.replace(SECRET_ASSIGNMENT_PATTERN, `$1${REDACTED}`);
	return sanitized.length <= maximumLength
		? sanitized
		: `${sanitized.slice(0, maximumLength)}…`;
}

function unexpectedErrorForLog(error: unknown): {
	name: string;
	message: string;
	code?: string | number;
	stack?: string;
} {
	if (!(error instanceof Error)) {
		return {
			name: 'NonErrorThrow',
			message: `A non-Error value of type ${typeof error} was thrown.`
		};
	}

	const code = (error as Error & { code?: unknown }).code;
	return {
		name: sanitizeLogText(error.name || 'Error', 128),
		message: sanitizeLogText(error.message, MAX_LOG_MESSAGE_LENGTH),
		...(typeof code === 'string' || typeof code === 'number'
			? { code: typeof code === 'string' ? sanitizeLogText(code, 128) : code }
			: {}),
		...(error.stack
			? { stack: sanitizeLogText(error.stack, MAX_LOG_STACK_LENGTH) }
			: {})
	};
}

export async function readJsonBody(request: Request): Promise<unknown> {
	const declaredLengthHeader = request.headers.get('content-length');
	const declaredLength = declaredLengthHeader === null ? 0 : Number(declaredLengthHeader);
	if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
		throw new LiveBuildError(413, 'payload_too_large', 'The request is too large.');
	}

	const reader = request.body?.getReader();
	const chunks: Uint8Array[] = [];
	let byteLength = 0;
	if (reader) {
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				byteLength += value.byteLength;
				if (byteLength > MAX_REQUEST_BYTES) {
					try {
						await reader.cancel();
					} catch {
						// The size error is authoritative even if the producer rejects cancellation.
					}
					throw new LiveBuildError(413, 'payload_too_large', 'The request is too large.');
				}
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}
	}

	const bytes = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	const text = new TextDecoder().decode(bytes);

	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new LiveBuildError(400, 'bad_request', 'The request body must be valid JSON.');
	}
}

export function liveBuildErrorResponse(error: unknown, operation: string): Response {
	if (error instanceof LiveBuildError) {
		const body: LiveBuildApiErrorResponse = {
			error: { code: error.code, message: error.message },
			...(error.details?.build ? { build: error.details.build } : {}),
			...(error.details?.conflictingPaths
				? { conflictingPaths: error.details.conflictingPaths }
				: {})
		};
		return json(body, {
			status: error.status,
			headers: { 'cache-control': 'no-store' }
		});
	}

	console.error('[live-builds] Unexpected API failure.', {
		operation: sanitizeLogText(operation, 128),
		error: unexpectedErrorForLog(error)
	});

	return json(
		{
			error: {
				code: 'service_unavailable',
				message: 'Live sharing is temporarily unavailable.'
			}
		} satisfies LiveBuildApiErrorResponse,
		{ status: 503, headers: { 'cache-control': 'no-store' } }
	);
}
