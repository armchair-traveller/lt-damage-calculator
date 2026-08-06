import { createContext } from 'svelte';
import type { LocalFirstAuth } from 'jazz-tools/svelte';

export type JazzAuthContext = {
	auth: LocalFirstAuth;
	configured: boolean;
};

export const [getJazzAuthContext, setJazzAuthContext] = createContext<JazzAuthContext>();
