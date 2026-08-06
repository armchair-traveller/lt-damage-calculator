<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { LocalFirstAuth, createJazzClient, JazzSvelteProvider } from 'jazz-tools/svelte';
	import { ModeWatcher } from 'mode-watcher';
	import './layout.css';
	import favicon from '$lib/assets/favicon.ico';
	import { setJazzAuthContext } from '$lib/jazz-auth-context.js';
	import { jazzEnvironment, JAZZ_USER_BRANCH } from '$lib/jazz-runtime-config.js';

	let { children } = $props();

	const auth = new LocalFirstAuth();
	const configured = Boolean(env.PUBLIC_JAZZ_APP_ID && env.PUBLIC_JAZZ_SERVER_URL);
	setJazzAuthContext({ auth, configured });

	let jazzClient = $derived(
		!auth.isLoading && auth.secret
			? createJazzClient({
					appId: env.PUBLIC_JAZZ_APP_ID || 'lt-damage-calculator-local',
					serverUrl: env.PUBLIC_JAZZ_SERVER_URL || undefined,
					driver: { type: 'memory' },
					env: jazzEnvironment(import.meta.env.PROD),
					userBranch: JAZZ_USER_BRANCH,
					secret: auth.secret
				})
			: null
	);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ModeWatcher />
{#if jazzClient}
	<JazzSvelteProvider client={jazzClient}>
		{@render children()}
		{#snippet fallback()}
			<div class="grid min-h-dvh place-items-center bg-background text-sm text-muted-foreground">
				Loading your workbench…
			</div>
		{/snippet}
	</JazzSvelteProvider>
{:else}
	<div class="grid min-h-dvh place-items-center bg-background text-sm text-muted-foreground">
		Loading your workbench…
	</div>
{/if}
