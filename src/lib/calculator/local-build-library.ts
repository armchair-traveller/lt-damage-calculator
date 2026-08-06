import {
	STORAGE_KEY,
	createDefaultState,
	normalizeState,
	parseStoredState,
	type CalculatorState
} from './model.js';

export const LOCAL_BUILD_LIBRARY_KEY = 'ltdc:library:v1';
export const LOCAL_BUILD_LIBRARY_VERSION = 1 as const;
export const LOCAL_BUILD_BACKUP_FORMAT = 'ltdc-build-library' as const;
export const DEFAULT_LOCAL_BUILD_NAME = 'Untitled build';
export const MAX_LOCAL_BUILD_NAME_LENGTH = 120;

export const LEGACY_LOCAL_BUILD_KEYS = [
	'ltdcStats',
	'ltdcStatsA',
	'ltdcStatsB',
	'ltdcSettings',
	'ltdcSelectedBuffs'
] as const;

export type LocalBuildLiveShare = {
	publicSlug: string;
	editSecret?: string;
	revision: number;
	lastSyncedState?: CalculatorState;
};

export type LocalBuild = {
	id: string;
	name: string;
	state: CalculatorState;
	createdAt: string;
	updatedAt: string;
	liveShare?: LocalBuildLiveShare;
};

export type LocalBuildLibrary = {
	version: typeof LOCAL_BUILD_LIBRARY_VERSION;
	activeBuildId: string;
	builds: LocalBuild[];
};

export type LocalBuildBackupV1 = {
	format: typeof LOCAL_BUILD_BACKUP_FORMAT;
	version: typeof LOCAL_BUILD_LIBRARY_VERSION;
	exportedAt: string;
	library: LocalBuildLibrary;
};

export type LocalBuildLibrarySource = 'library' | 'state-v2' | 'legacy' | 'default';

export type LocalBuildLibraryErrorCode =
	| 'invalid-library'
	| 'invalid-backup'
	| 'unsupported-version'
	| 'build-not-found';

export class LocalBuildLibraryError extends Error {
	readonly code: LocalBuildLibraryErrorCode;

	constructor(code: LocalBuildLibraryErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'LocalBuildLibraryError';
		this.code = code;
	}
}

export type LocalBuildStorageErrorCode = 'quota-exceeded' | 'unavailable' | 'unknown';

export class LocalBuildStorageError extends Error {
	readonly code: LocalBuildStorageErrorCode;

	constructor(code: LocalBuildStorageErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'LocalBuildStorageError';
		this.code = code;
	}
}

export type LoadLocalBuildLibraryResult =
	| {
			ok: true;
			library: LocalBuildLibrary;
			source: LocalBuildLibrarySource;
			migrated: boolean;
	  }
	| {
			ok: false;
			library: LocalBuildLibrary;
			source: LocalBuildLibrarySource;
			migrated: boolean;
			error: LocalBuildStorageError | LocalBuildLibraryError;
	  };

export type SaveLocalBuildLibraryResult =
	| { ok: true; bytes: number }
	| { ok: false; error: LocalBuildStorageError };

export type MergeLocalBuildLibrariesResult = {
	library: LocalBuildLibrary;
	importedCount: number;
	remappedIds: Record<string, string>;
};

export interface LocalBuildReadableStorage {
	getItem(key: string): string | null;
}

export interface LocalBuildWritableStorage {
	setItem(key: string, value: string): void;
}

export type LocalBuildRuntime = {
	now?: () => string | Date;
	idFactory?: () => string;
};

type LocalBuildNormalizationOptions = LocalBuildRuntime & {
	defaultName?: string;
};

type JsonRecord = Record<string, unknown>;

const LEGACY_CALCULATOR_STATE_VERSION = 2;
const LEGACY_CALCULATOR_STATE_SECTIONS = [
	'stats',
	'statsA',
	'statsB',
	'settings',
	'selectedBuffs'
] as const;

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLegacyCalculatorState(value: unknown): value is JsonRecord {
	return (
		isRecord(value) &&
		LEGACY_CALCULATOR_STATE_SECTIONS.every((section) => isRecord(value[section]))
	);
}

function currentTimestamp(runtime: LocalBuildRuntime = {}): string {
	const raw = runtime.now?.() ?? new Date();
	const date = raw instanceof Date ? raw : new Date(raw);
	return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function normalizeTimestamp(value: unknown, fallback: string): string {
	if (typeof value !== 'string') return fallback;
	const date = new Date(value);
	return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function randomId(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();

	if (typeof globalThis.crypto?.getRandomValues === 'function') {
		const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
		bytes[6] = (bytes[6] & 0x0f) | 0x40;
		bytes[8] = (bytes[8] & 0x3f) | 0x80;
		const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
		return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	}

	throw new LocalBuildLibraryError(
		'invalid-library',
		'This browser cannot generate a local build identifier.'
	);
}

function createId(runtime: LocalBuildRuntime = {}): string {
	const id = (runtime.idFactory?.() ?? randomId()).trim();
	if (!id) {
		throw new LocalBuildLibraryError('invalid-library', 'A local build identifier cannot be empty.');
	}
	return id;
}

export function normalizeLocalBuildName(value: unknown): string {
	if (typeof value !== 'string') return DEFAULT_LOCAL_BUILD_NAME;
	const name = value.trim().slice(0, MAX_LOCAL_BUILD_NAME_LENGTH);
	return name || DEFAULT_LOCAL_BUILD_NAME;
}

function normalizeLiveShare(value: unknown): LocalBuildLiveShare | undefined {
	if (!isRecord(value)) return undefined;
	const publicSlug = typeof value.publicSlug === 'string' ? value.publicSlug.trim() : '';
	const revision = Number(value.revision);
	if (!publicSlug || !Number.isSafeInteger(revision) || revision < 0) return undefined;

	const editSecret = typeof value.editSecret === 'string' ? value.editSecret.trim() : '';
	const lastSyncedState =
		value.lastSyncedState === undefined ? undefined : normalizeState(value.lastSyncedState);
	return {
		publicSlug,
		...(editSecret ? { editSecret } : {}),
		revision,
		...(lastSyncedState ? { lastSyncedState } : {})
	};
}

function normalizeBuild(
	value: unknown,
	options: LocalBuildNormalizationOptions,
	usedIds: Set<string>
): LocalBuild {
	if (!isRecord(value) || !('state' in value)) {
		throw new LocalBuildLibraryError('invalid-library', 'Each saved build must contain calculator data.');
	}

	const fallbackTime = currentTimestamp(options);
	let id = typeof value.id === 'string' ? value.id.trim() : '';
	if (!id || usedIds.has(id)) id = createUniqueId(usedIds, options);
	usedIds.add(id);

	const createdAt = normalizeTimestamp(value.createdAt, fallbackTime);
	const updatedAt = normalizeTimestamp(value.updatedAt, createdAt);
	const liveShare = normalizeLiveShare(value.liveShare);

	return {
		id,
		name: normalizeLocalBuildName(value.name),
		state: normalizeState(value.state),
		createdAt,
		updatedAt,
		...(liveShare ? { liveShare } : {})
	};
}

function createUniqueId(usedIds: Set<string>, runtime: LocalBuildRuntime): string {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const id = createId(runtime);
		if (!usedIds.has(id)) return id;
	}
	throw new LocalBuildLibraryError(
		'invalid-library',
		'Could not generate a unique local build identifier.'
	);
}

export function createLocalBuild(
	input: {
		id?: string;
		name?: string;
		state?: CalculatorState;
		createdAt?: string;
		updatedAt?: string;
		liveShare?: LocalBuildLiveShare;
	} = {},
	runtime: LocalBuildRuntime = {}
): LocalBuild {
	const timestamp = currentTimestamp(runtime);
	return normalizeBuild(
		{
			id: input.id ?? createId(runtime),
			name: input.name ?? DEFAULT_LOCAL_BUILD_NAME,
			state: input.state ?? createDefaultState(),
			createdAt: input.createdAt ?? timestamp,
			updatedAt: input.updatedAt ?? input.createdAt ?? timestamp,
			liveShare: input.liveShare
		},
		runtime,
		new Set()
	);
}

export function createLocalBuildLibrary(
	input: { name?: string; state?: CalculatorState } = {},
	runtime: LocalBuildRuntime = {}
): LocalBuildLibrary {
	const build = createLocalBuild(input, runtime);
	return { version: LOCAL_BUILD_LIBRARY_VERSION, activeBuildId: build.id, builds: [build] };
}

export function normalizeLocalBuildLibrary(
	value: unknown,
	options: LocalBuildNormalizationOptions = {}
): LocalBuildLibrary {
	if (!isRecord(value)) {
		throw new LocalBuildLibraryError('invalid-library', 'The saved-build library is not an object.');
	}

	const version = Number(value.version);
	if (version !== LOCAL_BUILD_LIBRARY_VERSION) {
		throw new LocalBuildLibraryError(
			'unsupported-version',
			Number.isFinite(version) && version > LOCAL_BUILD_LIBRARY_VERSION
				? 'This saved-build library was created by a newer version of the calculator.'
				: 'This saved-build library version is not supported.'
		);
	}

	if (!Array.isArray(value.builds)) {
		throw new LocalBuildLibraryError('invalid-library', 'The saved-build library has no builds list.');
	}

	const usedIds = new Set<string>();
	const builds = value.builds.map((build) => normalizeBuild(build, options, usedIds));
	if (builds.length === 0) {
		const fallback = createLocalBuild(
			{ name: options.defaultName ?? DEFAULT_LOCAL_BUILD_NAME },
			options
		);
		builds.push(fallback);
	}

	const requestedActiveId = typeof value.activeBuildId === 'string' ? value.activeBuildId : '';
	const activeBuildId = builds.some((build) => build.id === requestedActiveId)
		? requestedActiveId
		: builds[0].id;

	return { version: LOCAL_BUILD_LIBRARY_VERSION, activeBuildId, builds };
}

export function parseLocalBuildLibrary(
	text: string,
	options: LocalBuildNormalizationOptions = {}
): LocalBuildLibrary {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (cause) {
		throw new LocalBuildLibraryError('invalid-library', 'The saved-build library is not valid JSON.', {
			cause
		});
	}
	return normalizeLocalBuildLibrary(parsed, options);
}

export function serializeLocalBuildLibrary(library: LocalBuildLibrary): string {
	return JSON.stringify(normalizeLocalBuildLibrary(library), null, 2);
}

export function getActiveLocalBuild(library: LocalBuildLibrary): LocalBuild {
	const active = library.builds.find((build) => build.id === library.activeBuildId);
	if (!active) {
		throw new LocalBuildLibraryError('build-not-found', 'The active local build could not be found.');
	}
	return active;
}

function requireBuildIndex(library: LocalBuildLibrary, buildId: string): number {
	const index = library.builds.findIndex((build) => build.id === buildId);
	if (index < 0) {
		throw new LocalBuildLibraryError('build-not-found', `Local build "${buildId}" was not found.`);
	}
	return index;
}

export function setActiveLocalBuild(library: LocalBuildLibrary, buildId: string): LocalBuildLibrary {
	requireBuildIndex(library, buildId);
	return { ...library, activeBuildId: buildId };
}

export function addLocalBuild(
	library: LocalBuildLibrary,
	input: { name?: string; state?: CalculatorState } = {},
	runtime: LocalBuildRuntime = {}
): LocalBuildLibrary {
	const usedIds = new Set(library.builds.map((build) => build.id));
	const build = createLocalBuild(
		{ id: createUniqueId(usedIds, runtime), name: input.name, state: input.state },
		runtime
	);
	return {
		...library,
		activeBuildId: build.id,
		builds: [...library.builds, build]
	};
}

export function duplicateLocalBuild(
	library: LocalBuildLibrary,
	buildId: string,
	name?: string,
	runtime: LocalBuildRuntime = {}
): LocalBuildLibrary {
	const source = library.builds[requireBuildIndex(library, buildId)];
	return addLocalBuild(
		library,
		{ name: name ?? `${source.name} copy`, state: source.state },
		runtime
	);
}

export function renameLocalBuild(
	library: LocalBuildLibrary,
	buildId: string,
	name: string,
	runtime: LocalBuildRuntime = {}
): LocalBuildLibrary {
	const index = requireBuildIndex(library, buildId);
	const builds = [...library.builds];
	builds[index] = {
		...builds[index],
		name: normalizeLocalBuildName(name),
		updatedAt: currentTimestamp(runtime)
	};
	return { ...library, builds };
}

export function updateLocalBuildState(
	library: LocalBuildLibrary,
	buildId: string,
	state: CalculatorState,
	runtime: LocalBuildRuntime = {}
): LocalBuildLibrary {
	const index = requireBuildIndex(library, buildId);
	const builds = [...library.builds];
	builds[index] = {
		...builds[index],
		state: normalizeState(state),
		updatedAt: currentTimestamp(runtime)
	};
	return { ...library, builds };
}

export function resetLocalBuild(
	library: LocalBuildLibrary,
	buildId: string,
	runtime: LocalBuildRuntime = {}
): LocalBuildLibrary {
	return updateLocalBuildState(library, buildId, createDefaultState(), runtime);
}

export function updateLocalBuildLiveShare(
	library: LocalBuildLibrary,
	buildId: string,
	liveShare: LocalBuildLiveShare | undefined,
	runtime: LocalBuildRuntime = {}
): LocalBuildLibrary {
	const index = requireBuildIndex(library, buildId);
	const builds = [...library.builds];
	const normalizedShare = normalizeLiveShare(liveShare);
	builds[index] = {
		...builds[index],
		...(normalizedShare ? { liveShare: normalizedShare } : { liveShare: undefined }),
		updatedAt: currentTimestamp(runtime)
	};
	return { ...library, builds };
}

export function deleteLocalBuild(
	library: LocalBuildLibrary,
	buildId: string,
	runtime: LocalBuildRuntime = {}
): LocalBuildLibrary {
	const deletedIndex = requireBuildIndex(library, buildId);
	if (library.builds.length === 1) return createLocalBuildLibrary({}, runtime);

	const builds = library.builds.filter((build) => build.id !== buildId);
	const activeBuildId =
		library.activeBuildId === buildId
			? builds[Math.min(deletedIndex, builds.length - 1)].id
			: library.activeBuildId;
	return { ...library, activeBuildId, builds };
}

export function serializeLocalBuildBackup(
	library: LocalBuildLibrary,
	runtime: LocalBuildRuntime = {}
): string {
	const redactedLibrary = normalizeLocalBuildLibrary(library);
	for (const build of redactedLibrary.builds) delete build.liveShare;

	const backup: LocalBuildBackupV1 = {
		format: LOCAL_BUILD_BACKUP_FORMAT,
		version: LOCAL_BUILD_LIBRARY_VERSION,
		exportedAt: currentTimestamp(runtime),
		library: redactedLibrary
	};
	return JSON.stringify(backup, null, 2);
}

export function parseLegacyCalculatorStateBackup(text: string): CalculatorState {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (cause) {
		throw new LocalBuildLibraryError(
			'invalid-backup',
			'The legacy calculator backup is not valid JSON.',
			{ cause }
		);
	}

	let state: unknown = value;
	if (isRecord(value) && 'state' in value) {
		if (value.version !== LEGACY_CALCULATOR_STATE_VERSION) {
			throw new LocalBuildLibraryError(
				'unsupported-version',
				'This legacy calculator backup version is not supported.'
			);
		}
		state = value.state;
	}

	if (!isLegacyCalculatorState(state)) {
		throw new LocalBuildLibraryError(
			'invalid-backup',
			'This is not a legacy LaTale calculator-state backup.'
		);
	}

	return normalizeState(state);
}

export function parseLocalBuildBackup(
	text: string,
	options: LocalBuildNormalizationOptions = {}
): LocalBuildBackupV1 {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (cause) {
		throw new LocalBuildLibraryError('invalid-backup', 'The build backup is not valid JSON.', {
			cause
		});
	}

	if (!isRecord(value) || value.format !== LOCAL_BUILD_BACKUP_FORMAT) {
		throw new LocalBuildLibraryError('invalid-backup', 'This is not a LaTale build-library backup.');
	}

	const version = Number(value.version);
	if (version !== LOCAL_BUILD_LIBRARY_VERSION) {
		throw new LocalBuildLibraryError(
			'unsupported-version',
			version > LOCAL_BUILD_LIBRARY_VERSION
				? 'This backup was created by a newer version of the calculator.'
				: 'This build backup version is not supported.'
		);
	}

	if (!('library' in value)) {
		throw new LocalBuildLibraryError('invalid-backup', 'The backup does not contain a build library.');
	}

	const fallbackTime = currentTimestamp(options);
	return {
		format: LOCAL_BUILD_BACKUP_FORMAT,
		version: LOCAL_BUILD_LIBRARY_VERSION,
		exportedAt: normalizeTimestamp(value.exportedAt, fallbackTime),
		library: normalizeLocalBuildLibrary(value.library, options)
	};
}

export function mergeLocalBuildLibraries(
	current: LocalBuildLibrary,
	imported: LocalBuildLibrary,
	runtime: LocalBuildRuntime = {}
): MergeLocalBuildLibrariesResult {
	const currentLibrary = normalizeLocalBuildLibrary(current);
	const importedLibrary = normalizeLocalBuildLibrary(imported, runtime);
	const usedIds = new Set(currentLibrary.builds.map((build) => build.id));
	const remappedIds: Record<string, string> = {};

	const importedBuilds = importedLibrary.builds.map((build) => {
		let id = build.id;
		if (usedIds.has(id)) {
			id = createUniqueId(usedIds, runtime);
			remappedIds[build.id] = id;
		}
		usedIds.add(id);
		return { ...build, id, state: normalizeState(build.state) };
	});

	return {
		library: {
			...currentLibrary,
			builds: [...currentLibrary.builds, ...importedBuilds]
		},
		importedCount: importedBuilds.length,
		remappedIds
	};
}

export function mergeLocalBuildBackup(
	current: LocalBuildLibrary,
	backupText: string,
	runtime: LocalBuildRuntime = {}
): MergeLocalBuildLibrariesResult {
	const backup = parseLocalBuildBackup(backupText, runtime);
	return mergeLocalBuildLibraries(current, backup.library, runtime);
}

function parseLegacyItem(storage: LocalBuildReadableStorage, key: string): unknown {
	const item = storage.getItem(key);
	if (!item) return undefined;
	try {
		return JSON.parse(item);
	} catch {
		return undefined;
	}
}

function readLegacyState(storage: LocalBuildReadableStorage): CalculatorState | undefined {
	const entries = Object.fromEntries(
		LEGACY_LOCAL_BUILD_KEYS.map((key) => [key, storage.getItem(key)])
	) as Record<(typeof LEGACY_LOCAL_BUILD_KEYS)[number], string | null>;
	if (!Object.values(entries).some((value) => value !== null)) return undefined;

	return normalizeState({
		stats: parseLegacyItem(storage, 'ltdcStats'),
		statsA: parseLegacyItem(storage, 'ltdcStatsA'),
		statsB: parseLegacyItem(storage, 'ltdcStatsB'),
		settings: parseLegacyItem(storage, 'ltdcSettings'),
		selectedBuffs: parseLegacyItem(storage, 'ltdcSelectedBuffs')
	});
}

function migrateOlderState(
	storage: LocalBuildReadableStorage,
	runtime: LocalBuildRuntime
): { library: LocalBuildLibrary; source: Exclude<LocalBuildLibrarySource, 'library'> } {
	const storedState = storage.getItem(STORAGE_KEY);
	if (storedState) {
		let state: CalculatorState;
		try {
			state = parseStoredState(storedState);
		} catch (cause) {
			throw new LocalBuildLibraryError(
				'invalid-library',
				'The previously saved calculator state is not valid JSON.',
				{ cause }
			);
		}
		return {
			library: createLocalBuildLibrary({ state }, runtime),
			source: 'state-v2'
		};
	}

	const legacyState = readLegacyState(storage);
	if (legacyState) {
		return {
			library: createLocalBuildLibrary({ state: legacyState }, runtime),
			source: 'legacy'
		};
	}

	return { library: createLocalBuildLibrary({}, runtime), source: 'default' };
}

export function loadLocalBuildLibrary(
	storage: LocalBuildReadableStorage,
	runtime: LocalBuildRuntime = {}
): LoadLocalBuildLibraryResult {
	try {
		const storedLibrary = storage.getItem(LOCAL_BUILD_LIBRARY_KEY);
		if (storedLibrary) {
			try {
				return {
					ok: true,
					library: parseLocalBuildLibrary(storedLibrary, runtime),
					source: 'library',
					migrated: false
				};
			} catch (error) {
				const fallback = migrateOlderState(storage, runtime);
				return {
					ok: false,
					...fallback,
					migrated: true,
					error:
						error instanceof LocalBuildLibraryError
							? error
							: new LocalBuildLibraryError(
									'invalid-library',
									'The saved-build library could not be read.',
									{ cause: error }
								)
				};
			}
		}

		const migrated = migrateOlderState(storage, runtime);
		return { ok: true, ...migrated, migrated: true };
	} catch (cause) {
		return {
			ok: false,
			library: createLocalBuildLibrary({}, runtime),
			source: 'default',
			migrated: true,
			error:
				cause instanceof LocalBuildLibraryError ? cause : classifyStorageError(cause, 'read')
		};
	}
}

function classifyStorageError(cause: unknown, operation: 'read' | 'write'): LocalBuildStorageError {
	const name = isRecord(cause) && typeof cause.name === 'string' ? cause.name : '';
	const code = isRecord(cause) && typeof cause.code === 'number' ? cause.code : undefined;
	const isQuota =
		name === 'QuotaExceededError' ||
		name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
		code === 22 ||
		code === 1014;
	if (isQuota) {
		return new LocalBuildStorageError(
			'quota-exceeded',
			'This device is out of browser storage space. Export a backup, then remove unused builds.',
			{ cause }
		);
	}

	if (name === 'SecurityError' || name === 'InvalidStateError' || name === 'NotSupportedError') {
		return new LocalBuildStorageError(
			'unavailable',
			`Browser storage is unavailable, so the build could not be ${operation === 'read' ? 'loaded' : 'saved'}.`,
			{ cause }
		);
	}

	return new LocalBuildStorageError(
		'unknown',
		`The build could not be ${operation === 'read' ? 'loaded from' : 'saved to'} this device.`,
		{ cause }
	);
}

export function saveLocalBuildLibrary(
	storage: LocalBuildWritableStorage,
	library: LocalBuildLibrary
): SaveLocalBuildLibraryResult {
	try {
		const serialized = serializeLocalBuildLibrary(library);
		storage.setItem(LOCAL_BUILD_LIBRARY_KEY, serialized);
		return { ok: true, bytes: new TextEncoder().encode(serialized).byteLength };
	} catch (cause) {
		return { ok: false, error: classifyStorageError(cause, 'write') };
	}
}
