import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const PUBLIC_SLUG_PATTERN = /^[A-Za-z0-9_-]{32}$/;
export const EDIT_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createPublicSlug(): string {
	return randomBytes(24).toString('base64url');
}

export function createEditSecret(): string {
	return randomBytes(32).toString('base64url');
}

export function hashEditSecret(secret: string): string {
	return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function editSecretMatches(secret: string, expectedHash: string): boolean {
	if (!EDIT_SECRET_PATTERN.test(secret) || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
	const actual = Buffer.from(hashEditSecret(secret), 'hex');
	const expected = Buffer.from(expectedHash, 'hex');
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}
