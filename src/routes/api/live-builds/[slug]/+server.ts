import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { optionalLiveBuildActor, requireLiveBuildActor } from '$lib/server/live-builds/auth';
import { LiveBuildError } from '$lib/server/live-builds/errors';
import { liveBuildErrorResponse, readJsonBody } from '$lib/server/live-builds/request';
import {
	deleteLiveBuild,
	getLiveBuild,
	isValidLiveBuildSlug,
	patchLiveBuild
} from '$lib/server/live-builds/service';

export const prerender = false;

function validateSlug(slug: string): void {
	if (!isValidLiveBuildSlug(slug)) {
		throw new LiveBuildError(404, 'not_found', 'Live build not found.');
	}
}

export const GET: RequestHandler = async ({ request, params }) => {
	try {
		validateSlug(params.slug);
		const actorId = optionalLiveBuildActor(request);
		return json(
			{ build: await getLiveBuild(params.slug, actorId) },
			{ headers: { 'cache-control': 'private, no-store' } }
		);
	} catch (error) {
		return liveBuildErrorResponse(error, 'get-live-build');
	}
};

export const PATCH: RequestHandler = async ({ request, params }) => {
	try {
		validateSlug(params.slug);
		const actorId = requireLiveBuildActor(request);
		const body = await readJsonBody(request);
		return json(
			{ build: await patchLiveBuild(params.slug, actorId, body) },
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (error) {
		return liveBuildErrorResponse(error, 'patch-live-build');
	}
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	try {
		validateSlug(params.slug);
		const actorId = requireLiveBuildActor(request);
		await deleteLiveBuild(params.slug, actorId);
		return new Response(null, {
			status: 204,
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		return liveBuildErrorResponse(error, 'delete-live-build');
	}
};
