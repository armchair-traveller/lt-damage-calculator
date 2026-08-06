import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { requireLiveBuildActor } from '$lib/server/live-builds/auth';
import { LiveBuildError } from '$lib/server/live-builds/errors';
import { liveBuildErrorResponse } from '$lib/server/live-builds/request';
import { isValidLiveBuildSlug, rotateLiveBuildEditLink } from '$lib/server/live-builds/service';

export const prerender = false;

export const POST: RequestHandler = async ({ request, params, url }) => {
	try {
		if (!isValidLiveBuildSlug(params.slug)) {
			throw new LiveBuildError(404, 'not_found', 'Live build not found.');
		}
		const actorId = requireLiveBuildActor(request);
		return json(await rotateLiveBuildEditLink(params.slug, actorId, url.origin), {
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		return liveBuildErrorResponse(error, 'rotate-live-build-edit-link');
	}
};
