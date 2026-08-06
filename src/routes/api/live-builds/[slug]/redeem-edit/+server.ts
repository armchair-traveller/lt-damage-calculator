import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { requireLiveBuildActor } from '$lib/server/live-builds/auth';
import { LiveBuildError } from '$lib/server/live-builds/errors';
import { liveBuildErrorResponse, readJsonBody } from '$lib/server/live-builds/request';
import { isValidLiveBuildSlug, redeemLiveBuildEdit } from '$lib/server/live-builds/service';

export const prerender = false;

export const POST: RequestHandler = async ({ request, params }) => {
	try {
		if (!isValidLiveBuildSlug(params.slug)) {
			throw new LiveBuildError(404, 'not_found', 'Live build not found.');
		}
		const actorId = requireLiveBuildActor(request);
		const body = await readJsonBody(request);
		return json(await redeemLiveBuildEdit(params.slug, actorId, body), {
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		return liveBuildErrorResponse(error, 'redeem-live-build-edit');
	}
};
