<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { browser } from '$app/environment';
	import {
		BrowserAuthSecretStore,
		LocalFirstAuth,
		createJazzClient,
		type JazzClient
	} from 'jazz-tools/svelte';
	import { ModeWatcher } from 'mode-watcher';
	import './layout.css';
	import favicon from '$lib/assets/favicon.ico';
	import { setJazzAuthContext } from '$lib/jazz-auth-context.js';
	import { jazzEnvironment, JAZZ_USER_BRANCH } from '$lib/jazz-runtime-config.js';

	let { children } = $props();

	const auth = new LocalFirstAuth();
	const configured = Boolean(env.PUBLIC_JAZZ_APP_ID && env.PUBLIC_JAZZ_SERVER_URL);

	const jazzClient: Promise<JazzClient> | null = browser
		? Promise.resolve()
				.then(() => BrowserAuthSecretStore.getOrCreateSecret())
				.then((secret) => createJazzClient({
					appId: env.PUBLIC_JAZZ_APP_ID || 'lt-damage-calculator-local',
					serverUrl: env.PUBLIC_JAZZ_SERVER_URL || undefined,
					driver: { type: 'memory' },
					env: jazzEnvironment(import.meta.env.PROD),
					userBranch: JAZZ_USER_BRANCH,
					secret
				}))
		: null;

	function getClient(): Promise<JazzClient> {
		if (jazzClient) return jazzClient;
		return Promise.reject(new Error('The live-sharing runtime is only available in the browser.'));
	}

	setJazzAuthContext({
		auth,
		client: jazzClient,
		configured,
		getClient
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ModeWatcher />
{@render children()}
