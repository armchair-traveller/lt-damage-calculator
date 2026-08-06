<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { getDb, getSession, QuerySubscription } from 'jazz-tools/svelte';
	import { app } from '$lib/schema.js';
	import {
		COLLABORATION_HEARTBEAT_MS,
		COLLABORATION_STALE_AFTER_MS,
		aggregateCollaborationParticipants,
		parseCollaborationTarget,
		type CollaborationParticipant,
		type CollaborationPresenceMode,
		type CollaborationRole,
		type CollaborationTarget
	} from '$lib/live-builds/collaboration.js';

	type OwnPresence = {
		id: string;
		mode: CollaborationPresenceMode;
		target: CollaborationTarget | null;
	};
	type PresenceUpdate = {
		mode?: CollaborationPresenceMode;
		target?: CollaborationTarget | null;
		visible?: boolean;
		lastSeenAt?: Date;
	};

	let {
		slug,
		mode,
		role,
		target,
		onParticipants
	}: {
		slug: string;
		mode: 'live-edit' | 'live-view';
		role: CollaborationRole;
		target: CollaborationTarget | null;
		onParticipants: (participants: CollaborationParticipant[]) => void;
	} = $props();

	const db = getDb();
	const session = getSession();
	let pageVisible = $state(
		typeof document === 'undefined' || document.visibilityState === 'visible'
	);
	let ownPresence = $state.raw<OwnPresence | null>(null);
	let staleClock = $state(Date.now());

	const builds = new QuerySubscription(() =>
		slug ? app.liveBuilds.where({ publicSlug: slug }).limit(1) : undefined
	);
	const presenceRows = new QuerySubscription(() => {
		const build = builds.current?.[0];
		return build?.publicSlug === slug
			? app.liveBuildPresence.where({
					build_id: build.id,
					generation: build.editGeneration,
					visible: true,
					$updatedAt: {
						gte: new Date(staleClock - COLLABORATION_STALE_AFTER_MS),
						lte: new Date(staleClock + COLLABORATION_STALE_AFTER_MS)
					}
				})
					.select('*', '$updatedAt')
					.orderBy('$updatedAt', 'desc')
					.limit(128)
			: undefined;
	});

	function rowMode(): CollaborationPresenceMode {
		return mode === 'live-edit' && role !== 'viewer' ? 'edit' : 'view';
	}

	function publishedTarget(presenceMode = rowMode()) {
		return presenceMode === 'edit' ? parseCollaborationTarget(target) : null;
	}

	function randomSessionId() {
		if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
		const bytes = crypto.getRandomValues(new Uint8Array(16));
		bytes[6] = (bytes[6]! & 0x0f) | 0x40;
		bytes[8] = (bytes[8]! & 0x3f) | 0x80;
		return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
	}

	function sessionIdForSlug(currentSlug: string) {
		const storageKey = `ltdc:presence-session:v1:${currentSlug}`;
		try {
			const existing = sessionStorage.getItem(storageKey);
			if (existing) return existing;
			const created = randomSessionId();
			sessionStorage.setItem(storageKey, created);
			return created;
		} catch {
			return randomSessionId();
		}
	}

	function updatePresence(id: string, values: PresenceUpdate) {
		try {
			db.update(app.liveBuildPresence, id, values);
		} catch {
			// Presence is intentionally best effort and must never interrupt the workbench.
		}
	}

	function deletePresence(id: string) {
		try {
			db.delete(app.liveBuildPresence, id);
		} catch {
			// A stale generation or an interrupted connection can reject cleanup safely.
		}
	}

	function markPageVisibility() {
		pageVisible = document.visibilityState === 'visible';
		if (!pageVisible && ownPresence) {
			updatePresence(ownPresence.id, { visible: false, lastSeenAt: new Date() });
		}
	}

	function markPageHidden() {
		pageVisible = false;
		if (ownPresence) {
			updatePresence(ownPresence.id, { visible: false, lastSeenAt: new Date() });
		}
	}

	function markPageShown() {
		pageVisible = document.visibilityState === 'visible';
	}

	$effect(() => {
		const build = builds.current?.[0];
		const userId = session.current?.user_id;
		const currentSlug = slug;
		if (!pageVisible || !build || build.publicSlug !== currentSlug || !userId || !currentSlug) {
			ownPresence = null;
			return;
		}

		const initialMode = untrack(rowMode);
		const initialTarget = untrack(() => publishedTarget(initialMode));
		let inserted: OwnPresence | null = null;
		try {
			const result = db.insert(app.liveBuildPresence, {
				build_id: build.id,
				generation: build.editGeneration,
				user_id: userId,
				session_id: sessionIdForSlug(currentSlug),
				mode: initialMode,
				target: initialTarget,
				visible: true,
				lastSeenAt: new Date()
			});
			inserted = { id: result.value.id, mode: initialMode, target: initialTarget };
			ownPresence = inserted;
		} catch {
			ownPresence = null;
		}

		return () => {
			if (!inserted) return;
			if (ownPresence?.id === inserted.id) ownPresence = null;
			deletePresence(inserted.id);
		};
	});

	$effect(() => {
		const presence = ownPresence;
		const nextMode = rowMode();
		const nextTarget = publishedTarget(nextMode);
		if (!presence || (presence.mode === nextMode && presence.target === nextTarget)) return;

		updatePresence(presence.id, {
			mode: nextMode,
			target: nextTarget,
			visible: true,
			lastSeenAt: new Date()
		});
		presence.mode = nextMode;
		presence.target = nextTarget;
	});

	$effect(() => {
		const presence = ownPresence;
		if (!presence || !pageVisible) return;

		const heartbeat = window.setInterval(() => {
			const currentMode = rowMode();
			updatePresence(presence.id, {
				mode: currentMode,
				target: publishedTarget(currentMode),
				visible: true,
				lastSeenAt: new Date()
			});
		}, COLLABORATION_HEARTBEAT_MS);
		return () => window.clearInterval(heartbeat);
	});

	$effect(() => {
		const interval = window.setInterval(() => {
			staleClock = Date.now();
		}, Math.min(5_000, COLLABORATION_STALE_AFTER_MS));
		return () => window.clearInterval(interval);
	});

	const participants = $derived.by(() =>
		aggregateCollaborationParticipants(
			builds.current?.[0]?.publicSlug === slug ? (presenceRows.current ?? []) : [],
			{
				slug,
				selfUserId: session.current?.user_id ?? null,
				selfRole: role,
				now: staleClock
			}
		)
	);

	$effect(() => {
		onParticipants(participants);
	});

	onDestroy(() => onParticipants([]));
</script>

<svelte:document onvisibilitychange={markPageVisibility} />
<svelte:window onpagehide={markPageHidden} onpageshow={markPageShown} />
