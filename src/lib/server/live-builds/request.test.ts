import { afterEach, describe, expect, it, vi } from 'vitest';

import { LiveBuildError } from './errors';
import { liveBuildErrorResponse, readJsonBody } from './request';

afterEach(() => {
	vi.restoreAllMocks();
});

function streamingRequest(body: ReadableStream<Uint8Array>, headers?: HeadersInit): Request {
	return new Request('https://example.test/api/live-builds', {
		method: 'POST',
		body,
		headers,
		duplex: 'half'
	} as RequestInit & { duplex: 'half' });
}

describe('live build JSON request bodies', () => {
	it('parses JSON split across byte chunks', async () => {
		const encoded = new TextEncoder().encode(JSON.stringify({ title: 'Raid 🎵' }));
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoded.subarray(0, 17));
				controller.enqueue(encoded.subarray(17, 19));
				controller.enqueue(encoded.subarray(19));
				controller.close();
			}
		});

		await expect(readJsonBody(streamingRequest(stream))).resolves.toEqual({ title: 'Raid 🎵' });
	});

	it('cancels a streaming body as soon as it crosses 256 KiB', async () => {
		let pulls = 0;
		let cancelled = false;
		const stream = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					pulls += 1;
					controller.enqueue(new Uint8Array(200 * 1024));
				},
				cancel() {
					cancelled = true;
				}
			},
			{ highWaterMark: 0 }
		);

		await expect(readJsonBody(streamingRequest(stream))).rejects.toMatchObject({
			status: 413,
			code: 'payload_too_large'
		} satisfies Partial<LiveBuildError>);
		expect(pulls).toBe(2);
		expect(cancelled).toBe(true);
	});

	it('rejects an oversized declared length without pulling the body', async () => {
		let pulled = false;
		const stream = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					pulled = true;
					controller.close();
				}
			},
			{ highWaterMark: 0 }
		);

		await expect(
			readJsonBody(streamingRequest(stream, { 'content-length': String(256 * 1024 + 1) }))
		).rejects.toMatchObject({ status: 413, code: 'payload_too_large' });
		expect(pulled).toBe(false);
	});
});

describe('liveBuildErrorResponse', () => {
	it('logs unexpected errors with secrets redacted', () => {
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const error = new Error(
			'Authorization: Bearer bearer-value, JAZZ_BACKEND_SECRET=backend-value CRON_SECRET=cron-value'
		);

		const response = liveBuildErrorResponse(error, 'cleanup-live-builds');
		const logged = JSON.stringify(errorLog.mock.calls);

		expect(response.status).toBe(503);
		expect(errorLog).toHaveBeenCalledOnce();
		expect(logged).toContain('cleanup-live-builds');
		expect(logged).toContain('[REDACTED]');
		expect(logged).not.toContain('bearer-value');
		expect(logged).not.toContain('backend-value');
		expect(logged).not.toContain('cron-value');
	});

	it('does not log expected API errors', () => {
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const response = liveBuildErrorResponse(
			new LiveBuildError(404, 'not_found', 'Live build not found.'),
			'get-live-build'
		);

		expect(response.status).toBe(404);
		expect(errorLog).not.toHaveBeenCalled();
	});
});
