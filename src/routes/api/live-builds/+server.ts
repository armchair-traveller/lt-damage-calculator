import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { requireLiveBuildActor } from '$lib/server/live-builds/auth';
import { liveBuildErrorResponse, readJsonBody } from '$lib/server/live-builds/request';
import { createLiveBuild, listLiveBuilds } from '$lib/server/live-builds/service';

export const prerender = false;

export const GET: RequestHandler = async ({ request }) => {
	try {
		const actorId = requireLiveBuildActor(request);
		return json(await listLiveBuilds(actorId), {
			headers: { 'cache-control': 'private, no-store' }
		});
	} catch (error) {
		return liveBuildErrorResponse(error, 'list-live-builds');
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	try {
		const actorId = requireLiveBuildActor(request);
		const body = await readJsonBody(request);
		return json(await createLiveBuild(actorId, body, url.origin), {
			status: 201,
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		return liveBuildErrorResponse(error, 'create-live-build');
	}
};
