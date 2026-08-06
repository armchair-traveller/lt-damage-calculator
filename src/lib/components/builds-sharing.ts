export type Awaitable<T> = T | Promise<T>;

export type BuildsSharingMode = 'device' | 'live-view' | 'live-edit' | 'snapshot-view';

export type BuildsSharingTab = 'drafts' | 'share' | 'backup';

export type BuildsSharingStatusKind =
	| 'saved'
	| 'creating'
	| 'syncing'
	| 'synced'
	| 'offline'
	| 'read-only'
	| 'error';

export type BuildsSharingAction =
	| 'select-build'
	| 'create-build'
	| 'rename-build'
	| 'duplicate-build'
	| 'delete-build'
	| 'reset-build'
	| 'create-snapshot'
	| 'create-live-share'
	| 'pin-live-share'
	| 'rotate-edit-link'
	| 'stop-live-share'
	| 'export-current'
	| 'export-library'
	| 'import-backup'
	| 'refresh-recovered-shares'
	| 'attach-recovered-share'
	| 'reveal-recovery'
	| 'restore-identity'
	| 'acknowledge-recovery'
	| 'fork-to-drafts'
	| 'open-drafts'
	| 'retry';

export interface BuildSummary {
	id: string;
	name: string;
	updatedAt: string;
	hasLiveShare?: boolean;
	liveSharePinned?: boolean;
	liveShareExpiresAt?: string | null;
}

export interface LiveShareSummary {
	access: 'owner' | 'editor' | 'viewer';
	state?: 'active' | 'expired' | 'stopped';
	viewUrl: string;
	editUrl?: string | null;
	pinned: boolean;
	expiresAt?: string | null;
	lastEditedAt?: string | null;
	revision?: number;
}

export type RecoveredLiveSharesStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface RecoveredLiveShareSummary {
	publicSlug: string;
	title: string;
	revision: number;
	pinned: boolean;
	lastEditedAt: string;
	expiresAt: string | null;
	attached: boolean;
}

export interface BuildsSharingStatus {
	kind: BuildsSharingStatusKind;
	label?: string;
	detail?: string;
}

export interface BuildsSharingSheetProps {
	open?: boolean;
	recoveryDialogOpen?: boolean;
	activeTab?: BuildsSharingTab;
	builds?: readonly BuildSummary[];
	activeBuildId?: string | null;
	mode?: BuildsSharingMode;
	liveShare?: LiveShareSummary | null;
	snapshotUrl?: string | null;
	recoveryPhrase?: string | readonly string[] | null;
	recoveredLiveShares?: readonly RecoveredLiveShareSummary[];
	recoveredLiveSharesStatus?: RecoveredLiveSharesStatus;
	recoveredLiveSharesError?: string | null;
	status?: BuildsSharingStatus | null;
	pendingAction?: BuildsSharingAction | null;
	error?: string | null;
	onSelectBuild?: (id: string) => Awaitable<void>;
	onCreateBuild?: (name: string) => Awaitable<void>;
	onRenameBuild?: (id: string, name: string) => Awaitable<void>;
	onDuplicateBuild?: (id: string) => Awaitable<void>;
	onDeleteBuild?: (id: string) => Awaitable<void>;
	onResetBuild?: (id: string) => Awaitable<void>;
	onCreateSnapshot?: () => Awaitable<string | void>;
	onCreateLiveShare?: () => Awaitable<void>;
	onPinLiveShare?: (pinned: boolean) => Awaitable<void>;
	onRotateEditLink?: () => Awaitable<void>;
	onStopLiveShare?: () => Awaitable<void>;
	onExportCurrent?: () => Awaitable<void>;
	onExportLibrary?: () => Awaitable<void>;
	onImportBackup?: () => Awaitable<void>;
	onRefreshRecoveredLiveShares?: () => Awaitable<void>;
	onAttachRecoveredLiveShare?: (publicSlug: string) => Awaitable<void>;
	onRevealRecoveryPhrase?: () => Awaitable<void>;
	onRestoreIdentity?: (phrase: string) => Awaitable<void>;
	onAcknowledgeRecoveryPhrase?: () => Awaitable<void>;
	onForkToDrafts?: () => Awaitable<void>;
	onOpenDrafts?: () => Awaitable<void>;
	onRetry?: () => Awaitable<void>;
}
