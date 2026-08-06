export const JAZZ_USER_BRANCH = 'main' as const;
export const JAZZ_TIER = 'edge' as const;

export function jazzEnvironment(isProduction: boolean): 'prod' | 'dev' {
	return isProduction ? 'prod' : 'dev';
}
