import { describe, expect, it } from 'vitest';
import {
	DEFAULT_LOCAL_BUILD_NAME,
	LOCAL_BUILD_LIBRARY_KEY,
	LocalBuildLibraryError,
	addLocalBuild,
	createLocalBuildLibrary,
	deleteLocalBuild,
	duplicateLocalBuild,
	getActiveLocalBuild,
	loadLocalBuildLibrary,
	mergeLocalBuildBackup,
	parseLegacyCalculatorStateBackup,
	parseLocalBuildBackup,
	parseLocalBuildLibrary,
	renameLocalBuild,
	resetLocalBuild,
	saveLocalBuildLibrary,
	serializeLocalBuildBackup,
	serializeLocalBuildLibrary,
	setActiveLocalBuild,
	updateLocalBuildLiveShare,
	updateLocalBuildState,
	type LocalBuildReadableStorage,
	type LocalBuildWritableStorage
} from './local-build-library.js';
import { STORAGE_KEY, createDefaultState, serializeState } from './model.js';

class MemoryStorage implements LocalBuildReadableStorage, LocalBuildWritableStorage {
	readonly values = new Map<string, string>();

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}
}

function runtime(ids: string[], timestamp = '2026-08-05T12:00:00.000Z') {
	let idIndex = 0;
	return {
		now: () => timestamp,
		idFactory: () => ids[idIndex++] ?? `generated-${idIndex}`
	};
}

describe('local build library', () => {
	it('creates, selects, updates, duplicates, renames, resets, and deletes builds immutably', () => {
		expect.assertions(14);
		const initial = createLocalBuildLibrary(
			{ name: 'Main' },
			runtime(['main'], '2026-08-05T12:00:00.000Z')
		);
		const added = addLocalBuild(
			initial,
			{ name: 'Alt' },
			runtime(['alt'], '2026-08-05T12:01:00.000Z')
		);

		expect(initial.builds).toHaveLength(1);
		expect(added.builds).toHaveLength(2);
		expect(getActiveLocalBuild(added).id).toBe('alt');

		const selected = setActiveLocalBuild(added, 'main');
		const changedState = createDefaultState();
		changedState.stats.attack[0] = '999';
		const updated = updateLocalBuildState(
			selected,
			'main',
			changedState,
			runtime([], '2026-08-05T12:02:00.000Z')
		);
		expect(getActiveLocalBuild(updated).state.stats.attack[0]).toBe('999');
		expect(getActiveLocalBuild(selected).state.stats.attack[0]).not.toBe('999');
		expect(getActiveLocalBuild(updated).updatedAt).toBe('2026-08-05T12:02:00.000Z');

		const renamed = renameLocalBuild(
			updated,
			'main',
			'  Main damage  ',
			runtime([], '2026-08-05T12:03:00.000Z')
		);
		expect(getActiveLocalBuild(renamed).name).toBe('Main damage');

		const duplicated = duplicateLocalBuild(
			renamed,
			'main',
			undefined,
			runtime(['main-copy'], '2026-08-05T12:04:00.000Z')
		);
		expect(getActiveLocalBuild(duplicated).name).toBe('Main damage copy');
		expect(getActiveLocalBuild(duplicated).state.stats.attack[0]).toBe('999');

		const reset = resetLocalBuild(
			duplicated,
			'main-copy',
			runtime([], '2026-08-05T12:05:00.000Z')
		);
		expect(getActiveLocalBuild(reset).state).toEqual(createDefaultState());

		const withoutCopy = deleteLocalBuild(reset, 'main-copy');
		expect(withoutCopy.activeBuildId).toBe('alt');
		expect(withoutCopy.builds.map((build) => build.id)).toEqual(['main', 'alt']);

		const oneBuild = createLocalBuildLibrary({}, runtime(['only']));
		const replaced = deleteLocalBuild(oneBuild, 'only', runtime(['fresh']));
		expect(replaced.builds[0].id).toBe('fresh');
		expect(replaced.builds[0].name).toBe(DEFAULT_LOCAL_BUILD_NAME);
	});

	it('serializes and parses a normalized library', () => {
		expect.assertions(5);
		const library = createLocalBuildLibrary(
			{ name: '  Build A  ' },
			runtime(['a'], '2026-08-05T12:00:00.000Z')
		);
		const syncedState = createDefaultState();
		syncedState.stats.attack[0] = '808';
		const shared = updateLocalBuildLiveShare(library, 'a', {
			publicSlug: 'share-1',
			editSecret: 'secret-1',
			revision: 4,
			lastSyncedState: syncedState
		});
		const parsed = parseLocalBuildLibrary(serializeLocalBuildLibrary(shared));

		expect(parsed).toEqual(shared);
		expect(parsed.builds[0].name).toBe('Build A');
		expect(parsed.builds[0].liveShare?.revision).toBe(4);
		expect(parsed.builds[0].liveShare?.lastSyncedState?.stats.attack[0]).toBe('808');
		expect(() => parseLocalBuildLibrary('{"version":2,"builds":[]}')).toThrowError(
			expect.objectContaining({ code: 'unsupported-version' })
		);
	});

	it('redacts all live-share metadata from portable backups without changing device storage', () => {
		expect.assertions(5);
		const library = createLocalBuildLibrary({}, runtime(['private-build']));
		const shared = updateLocalBuildLiveShare(library, 'private-build', {
			publicSlug: 'public-slug',
			editSecret: 'live-edit-capability',
			revision: 7,
			lastSyncedState: createDefaultState()
		});

		const backupText = serializeLocalBuildBackup(shared);
		const backup = parseLocalBuildBackup(backupText);

		expect(backup.library.builds[0]).not.toHaveProperty('liveShare');
		expect(backupText).not.toContain('live-edit-capability');
		expect(backupText).not.toContain('public-slug');
		expect(shared.builds[0].liveShare?.editSecret).toBe('live-edit-capability');
		expect(parseLocalBuildLibrary(serializeLocalBuildLibrary(shared))).toEqual(shared);
	});

	it('strictly parses legacy calculator-state backups', () => {
		expect.assertions(6);
		const state = createDefaultState();
		state.stats.attack[0] = '7654';

		expect(parseLegacyCalculatorStateBackup(serializeState(state))).toEqual(state);
		expect(parseLegacyCalculatorStateBackup(JSON.stringify(state))).toEqual(state);

		for (const invalidBackup of ['{}', 'null', '[]', '{"version":2,"state":{}}']) {
			expect(() => parseLegacyCalculatorStateBackup(invalidBackup)).toThrowError(
				expect.objectContaining({ code: 'invalid-backup' })
			);
		}
	});

	it('loads the v1 library before older storage formats', () => {
		expect.assertions(4);
		const storage = new MemoryStorage();
		const stateV2 = createDefaultState();
		stateV2.stats.attack[0] = '222';
		storage.setItem(STORAGE_KEY, serializeState(stateV2));

		const library = createLocalBuildLibrary(
			{ name: 'Saved library' },
			runtime(['library-build'], '2026-08-05T12:00:00.000Z')
		);
		storage.setItem(LOCAL_BUILD_LIBRARY_KEY, serializeLocalBuildLibrary(library));
		const loaded = loadLocalBuildLibrary(storage, runtime(['unused']));

		expect(loaded.ok).toBe(true);
		expect(loaded.source).toBe('library');
		expect(loaded.migrated).toBe(false);
		expect(getActiveLocalBuild(loaded.library).name).toBe('Saved library');
	});

	it('migrates the current single-state key, legacy keys, and empty storage', () => {
		expect.assertions(9);
		const stateStorage = new MemoryStorage();
		const currentState = createDefaultState();
		currentState.stats.strength[0] = '12345';
		stateStorage.setItem(STORAGE_KEY, serializeState(currentState));
		const fromState = loadLocalBuildLibrary(stateStorage, runtime(['from-v2']));
		expect(fromState.ok).toBe(true);
		expect(fromState.source).toBe('state-v2');
		expect(getActiveLocalBuild(fromState.library).state.stats.strength[0]).toBe('12345');

		const legacyStorage = new MemoryStorage();
		legacyStorage.setItem('ltdcSettings', JSON.stringify({ target: 'soft', aF: 777 }));
		legacyStorage.setItem('ltdcStats', JSON.stringify({ attack: ['42', '3'] }));
		const fromLegacy = loadLocalBuildLibrary(legacyStorage, runtime(['from-legacy']));
		expect(fromLegacy.ok).toBe(true);
		expect(fromLegacy.source).toBe('legacy');
		expect(getActiveLocalBuild(fromLegacy.library).state.settings.target).toBe('soft');
		expect(getActiveLocalBuild(fromLegacy.library).state.stats.attack).toEqual(['42', '3']);

		const fromDefault = loadLocalBuildLibrary(new MemoryStorage(), runtime(['default']));
		expect(fromDefault.source).toBe('default');
		expect(getActiveLocalBuild(fromDefault.library).state).toEqual(createDefaultState());
	});

	it('surfaces a corrupt v1 library while recovering from the prior state', () => {
		expect.assertions(5);
		const storage = new MemoryStorage();
		storage.setItem(LOCAL_BUILD_LIBRARY_KEY, '{bad json');
		const state = createDefaultState();
		state.stats.critical[0] = '987';
		storage.setItem(STORAGE_KEY, serializeState(state));

		const result = loadLocalBuildLibrary(storage, runtime(['recovered']));
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('Expected the corrupt library to return a recovery error.');
		expect(result.source).toBe('state-v2');
		expect(result.migrated).toBe(true);
		expect(result.error).toBeInstanceOf(LocalBuildLibraryError);
		expect(getActiveLocalBuild(result.library).state.stats.critical[0]).toBe('987');
	});

	it('round-trips a full backup and merges colliding ids without overwriting local builds', () => {
		expect.assertions(8);
		const current = createLocalBuildLibrary(
			{ name: 'On this device' },
			runtime(['same-id'], '2026-08-05T12:00:00.000Z')
		);
		const imported = addLocalBuild(
			createLocalBuildLibrary(
				{ name: 'Imported one' },
				runtime(['same-id'], '2026-08-04T12:00:00.000Z')
			),
			{ name: 'Imported two' },
			runtime(['other-id'], '2026-08-04T12:01:00.000Z')
		);
		const backupText = serializeLocalBuildBackup(
			imported,
			runtime([], '2026-08-05T13:00:00.000Z')
		);
		const backup = parseLocalBuildBackup(backupText);
		expect(backup.exportedAt).toBe('2026-08-05T13:00:00.000Z');
		expect(backup.library.builds).toHaveLength(2);

		const merged = mergeLocalBuildBackup(current, backupText, runtime(['remapped-id']));
		expect(merged.importedCount).toBe(2);
		expect(merged.remappedIds).toEqual({ 'same-id': 'remapped-id' });
		expect(merged.library.activeBuildId).toBe('same-id');
		expect(merged.library.builds.map((build) => build.id)).toEqual([
			'same-id',
			'remapped-id',
			'other-id'
		]);
		expect(merged.library.builds.map((build) => build.name)).toEqual([
			'On this device',
			'Imported one',
			'Imported two'
		]);
		expect(() => parseLocalBuildBackup('{"format":"something-else","version":1}')).toThrowError(
			expect.objectContaining({ code: 'invalid-backup' })
		);
	});

	it('returns typed storage failures instead of reporting a save', () => {
		expect.assertions(5);
		const library = createLocalBuildLibrary({}, runtime(['build']));
		const quotaStorage: LocalBuildWritableStorage = {
			setItem() {
				throw new DOMException('full', 'QuotaExceededError');
			}
		};
		const unavailableStorage: LocalBuildWritableStorage = {
			setItem() {
				throw new DOMException('blocked', 'SecurityError');
			}
		};

		const quota = saveLocalBuildLibrary(quotaStorage, library);
		expect(quota.ok).toBe(false);
		if (!quota.ok) expect(quota.error.code).toBe('quota-exceeded');

		const unavailable = saveLocalBuildLibrary(unavailableStorage, library);
		expect(unavailable.ok).toBe(false);
		if (!unavailable.ok) expect(unavailable.error.code).toBe('unavailable');

		const storage = new MemoryStorage();
		expect(saveLocalBuildLibrary(storage, library)).toEqual(
			expect.objectContaining({ ok: true, bytes: expect.any(Number) })
		);
	});
});
