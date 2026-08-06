import { createContext } from 'svelte';
import type { JazzClient, LocalFirstAuth } from 'jazz-tools/svelte';

export type JazzAuthContext = {
	auth: LocalFirstAuth;
	client: Promise<JazzClient> | null;
	configured: boolean;
	getClient: () => Promise<JazzClient>;
};

export const [getJazzAuthContext, setJazzAuthContext] = createContext<JazzAuthContext>();
