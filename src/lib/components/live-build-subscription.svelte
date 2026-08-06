<script lang="ts">
	import { QuerySubscription } from 'jazz-tools/svelte';
	import { app } from '$lib/schema.js';

	let {
		slug,
		onRevision,
		onUnavailable,
		onError
	}: {
		slug: string;
		onRevision: (revision: number, editGenerationChanged?: boolean) => void;
		onUnavailable?: () => void;
		onError?: (error: Error) => void;
	} = $props();

	const builds = new QuerySubscription(() =>
		slug ? app.liveBuilds.where({ publicSlug: slug }).limit(1) : undefined
	);
	let lastRevision = -1;
	let lastEditGeneration = -1;
	let observedSlug = '';
	let reportedUnavailable = false;
	let lastError: Error | null = null;
	let expiryTimer: number | null = null;

	function clearExpiryTimer() {
		if (expiryTimer !== null) window.clearTimeout(expiryTimer);
		expiryTimer = null;
	}

	function reportUnavailable() {
		if (reportedUnavailable) return;
		reportedUnavailable = true;
		onUnavailable?.();
	}

	function scheduleExpiry(expiryTime: number, expectedSlug: string) {
		clearExpiryTimer();
		const checkExpiry = () => {
			if (observedSlug !== expectedSlug || reportedUnavailable) return;
			const remaining = expiryTime - Date.now();
			if (remaining <= 0) {
				reportUnavailable();
				return;
			}
			expiryTimer = window.setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
		};
		checkExpiry();
	}

	$effect(() => {
		clearExpiryTimer();
		if (slug !== observedSlug) {
			observedSlug = slug;
			lastRevision = -1;
			lastEditGeneration = -1;
			reportedUnavailable = false;
			lastError = null;
		}
		const build = builds.current?.[0];
		const expiryTime = build?.expiresAt && !build.pinned ? new Date(build.expiresAt).getTime() : null;
		if (expiryTime !== null && Number.isFinite(expiryTime) && expiryTime <= Date.now()) {
			reportUnavailable();
		} else if (build) {
			reportedUnavailable = false;
			if (expiryTime !== null && Number.isFinite(expiryTime)) scheduleExpiry(expiryTime, slug);
			if (build.revision !== lastRevision || build.editGeneration !== lastEditGeneration) {
				const editGenerationChanged =
					lastEditGeneration === -1 || build.editGeneration !== lastEditGeneration;
				lastRevision = build.revision;
				lastEditGeneration = build.editGeneration;
				onRevision(build.revision, editGenerationChanged);
			}
		}
		if (!build && !builds.loading && builds.current && !reportedUnavailable) {
			reportUnavailable();
		}
		if (builds.error && builds.error !== lastError) {
			lastError = builds.error;
			onError?.(builds.error);
		}
		return clearExpiryTimer;
	});
</script>
