import { timingSafeEqual } from 'node:crypto';

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { LiveBuildError } from '$lib/server/live-builds/errors';
import { liveBuildErrorResponse } from '$lib/server/live-builds/request';
import { cleanupExpiredLiveBuilds } from '$lib/server/live-builds/service';

export const prerender = false;

function secureEqual(left: string, right: string): boolean {
	const leftBytes = Buffer.from(left, 'utf8');
	const rightBytes = Buffer.from(right, 'utf8');
	return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function authorizeCron(request: Request): void {
	const secret = process.env.CRON_SECRET?.trim();
	const authorization = request.headers.get('authorization') ?? '';
	if (!secret || !secureEqual(authorization, `Bearer ${secret}`)) {
		throw new LiveBuildError(401, 'unauthorized', 'Unauthorized.');
	}
}

export const GET: RequestHandler = async ({ request }) => {
	try {
		authorizeCron(request);
		const result = await cleanupExpiredLiveBuilds();
		const counts = {
			examined: result.examined,
			deleted: result.deleted,
			failed: result.failed
		};
		if (result.failed > 0) {
			console.warn('[live-builds] Cleanup completed with row failures.', counts);
		} else {
			console.info('[live-builds] Cleanup completed.', counts);
		}
		return json(result, {
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		return liveBuildErrorResponse(error, 'cleanup-live-builds');
	}
};
