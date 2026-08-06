<svelte:options runes={true} />

<script lang="ts">
	import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FileKeyIcon from '@lucide/svelte/icons/file-key';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import GitForkIcon from '@lucide/svelte/icons/git-fork';
	import LaptopIcon from '@lucide/svelte/icons/laptop';
	import LinkIcon from '@lucide/svelte/icons/link';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PinIcon from '@lucide/svelte/icons/pin';
	import PinOffIcon from '@lucide/svelte/icons/pin-off';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';
	import SaveIcon from '@lucide/svelte/icons/save';
	import Share2Icon from '@lucide/svelte/icons/share-2';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import type {
		Awaitable,
		BuildsSharingAction,
		BuildsSharingMode,
		BuildsSharingSheetProps,
		BuildsSharingStatus,
		BuildsSharingStatusKind,
		BuildsSharingTab,
		BuildSummary,
		LiveShareSummary,
		RecoveredLiveShareSummary
	} from './builds-sharing.js';

	type CopyTarget = 'snapshot' | 'view' | 'edit' | 'recovery';
	type Confirmation =
		| { kind: 'delete-build' | 'reset-build'; build: BuildSummary }
		| { kind: 'pin' | 'unpin' | 'rotate' | 'stop'; share: LiveShareSummary };

	let {
		open = $bindable(false),
		recoveryDialogOpen = $bindable(false),
		activeTab = $bindable<BuildsSharingTab>('drafts'),
		builds = [],
		activeBuildId = null,
		mode = 'device',
		liveShare = null,
		snapshotUrl = null,
		recoveryPhrase = null,
		recoveredLiveShares = [],
		recoveredLiveSharesStatus = 'idle',
		recoveredLiveSharesError = null,
		status = null,
		pendingAction = null,
		error = null,
		onSelectBuild,
		onCreateBuild,
		onRenameBuild,
		onDuplicateBuild,
		onDeleteBuild,
		onResetBuild,
		onCreateSnapshot,
		onCreateLiveShare,
		onPinLiveShare,
		onRotateEditLink,
		onStopLiveShare,
		onExportCurrent,
		onExportLibrary,
		onImportBackup,
		onRefreshRecoveredLiveShares,
		onAttachRecoveredLiveShare,
		onRevealRecoveryPhrase,
		onRestoreIdentity,
		onAcknowledgeRecoveryPhrase,
		onForkToDrafts,
		onOpenDrafts,
		onRetry
	}: BuildsSharingSheetProps = $props();

	const componentId = $props.id();
	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	let newBuildName = $state('');
	let renamingBuildId: string | null = $state(null);
	let renameValue = $state('');
	let restorePhrase = $state('');
	let restoreAttempted = $state(false);
	let localPendingAction: BuildsSharingAction | null = $state(null);
	let localError: string | null = $state(null);
	let copiedTarget: CopyTarget | null = $state(null);
	let confirmation: Confirmation | null = $state(null);
	let confirmationOpen = $state(false);
	let attachingRecoveredSlug: string | null = $state(null);

	const currentAction = $derived(pendingAction ?? localPendingAction);
	const displayedSnapshotUrl = $derived(snapshotUrl);
	const recoveryWords = $derived.by(() => {
		if (!recoveryPhrase) return [];
		return (typeof recoveryPhrase === 'string' ? recoveryPhrase.split(/\s+/) : recoveryPhrase)
			.map((word) => word.trim())
			.filter(Boolean);
	});
	const restoreWordCount = $derived(
		restorePhrase
			.trim()
			.split(/\s+/)
			.filter(Boolean).length
	);
	const restoreInvalid = $derived(restoreAttempted && restoreWordCount !== 24);
	const effectiveStatus = $derived(status ?? defaultStatus(mode));
	const confirmationCopy = $derived.by(() => getConfirmationCopy(confirmation));

	function defaultStatus(currentMode: BuildsSharingMode): BuildsSharingStatus {
		if (currentMode === 'snapshot-view') {
			return { kind: 'read-only' as const, label: 'Read-only snapshot' };
		}
		if (currentMode === 'live-view') {
			return { kind: 'read-only' as const, label: 'Read-only live build' };
		}
		if (currentMode === 'live-edit') {
			return { kind: 'synced' as const, label: 'Shared up to date' };
		}
		return { kind: 'saved' as const, label: 'Saved on this device' };
	}

	function statusLabel(kind: BuildsSharingStatusKind) {
		const labels: Record<BuildsSharingStatusKind, string> = {
			saved: 'Saved on this device',
			creating: 'Creating live share',
			syncing: 'Syncing',
			synced: 'Shared up to date',
			offline: 'Offline saved',
			'read-only': 'Read-only',
			error: "Couldn't sync"
		};
		return labels[kind];
	}

	function statusVariant(kind: BuildsSharingStatusKind) {
		if (kind === 'error') return 'destructive' as const;
		if (kind === 'saved' || kind === 'synced') return 'secondary' as const;
		return 'outline' as const;
	}

	function isWorking(action: BuildsSharingAction) {
		return currentAction === action;
	}

	function isAnyActionWorking() {
		return currentAction !== null;
	}

	async function runAction<T>(
		action: BuildsSharingAction,
		callback: (() => Awaitable<T>) | undefined
	): Promise<T | undefined> {
		if (!callback || isAnyActionWorking()) return undefined;
		localError = null;
		localPendingAction = action;
		try {
			return await callback();
		} catch (actionError) {
			localError =
				actionError instanceof Error ? actionError.message : 'That action could not be completed.';
			return undefined;
		} finally {
			localPendingAction = null;
		}
	}

	async function createBuild() {
		const name = newBuildName.trim();
		if (!name) return;
		await runAction('create-build', () => onCreateBuild?.(name));
		if (!localError) newBuildName = '';
	}

	function beginRename(build: BuildSummary) {
		renamingBuildId = build.id;
		renameValue = build.name;
	}

	function cancelRename() {
		renamingBuildId = null;
		renameValue = '';
	}

	async function saveRename(build: BuildSummary) {
		const name = renameValue.trim();
		if (!name || name === build.name) {
			cancelRename();
			return;
		}
		await runAction('rename-build', () => onRenameBuild?.(build.id, name));
		if (!localError) cancelRename();
	}

	async function createSnapshot() {
		await runAction('create-snapshot', onCreateSnapshot);
	}

	async function restoreIdentity() {
		restoreAttempted = true;
		if (restoreWordCount !== 24) return;
		await runAction('restore-identity', () => onRestoreIdentity?.(restorePhrase.trim()));
		if (!localError) {
			restorePhrase = '';
			restoreAttempted = false;
		}
	}

	async function refreshRecoveredLiveShares() {
		await runAction('refresh-recovered-shares', onRefreshRecoveredLiveShares);
	}

	async function attachRecoveredLiveShare(share: RecoveredLiveShareSummary) {
		attachingRecoveredSlug = share.publicSlug;
		await runAction('attach-recovered-share', () =>
			onAttachRecoveredLiveShare?.(share.publicSlug)
		);
		if (!localError) activeTab = 'share';
		attachingRecoveredSlug = null;
	}

	async function revealRecoveryPhrase() {
		await runAction('reveal-recovery', onRevealRecoveryPhrase);
	}

	async function copyText(value: string, target: CopyTarget) {
		try {
			await navigator.clipboard.writeText(value);
			copiedTarget = target;
			localError = null;
		} catch {
			localError = 'Clipboard access was blocked. Select the link and copy it manually.';
		}
	}

	function openConfirmation(nextConfirmation: Confirmation) {
		confirmation = nextConfirmation;
		confirmationOpen = true;
	}

	async function confirmAction() {
		if (!confirmation) return;
		const selected = confirmation;
		confirmationOpen = false;
		if (selected.kind === 'delete-build') {
			await runAction('delete-build', () => onDeleteBuild?.(selected.build.id));
		} else if (selected.kind === 'reset-build') {
			await runAction('reset-build', () => onResetBuild?.(selected.build.id));
		} else if (selected.kind === 'pin') {
			await runAction('pin-live-share', () => onPinLiveShare?.(true));
		} else if (selected.kind === 'unpin') {
			await runAction('pin-live-share', () => onPinLiveShare?.(false));
		} else if (selected.kind === 'rotate') {
			await runAction('rotate-edit-link', onRotateEditLink);
		} else {
			await runAction('stop-live-share', onStopLiveShare);
		}
		confirmation = null;
	}

	function getConfirmationCopy(current: Confirmation | null) {
		if (!current) {
			return { title: '', description: '', action: '', destructive: false };
		}
		if (current.kind === 'delete-build') {
			return {
				title: `Delete “${current.build.name}”?`,
				description:
					'This removes the draft from this device. A separate live or snapshot link will not be affected.',
				action: 'Delete draft',
				destructive: true
			};
		}
		if (current.kind === 'reset-build') {
			return {
				title: `Reset “${current.build.name}”?`,
				description: 'All calculator inputs in this draft will return to their defaults.',
				action: 'Reset draft',
				destructive: true
			};
		}
		if (current.kind === 'pin') {
			return {
				title: 'Keep this live share permanently?',
				description: 'Pinned shares do not expire after 30 days of inactivity. You can unpin it later.',
				action: 'Pin live share',
				destructive: false
			};
		}
		if (current.kind === 'unpin') {
			return {
				title: 'Return to automatic expiry?',
				description: 'The live share will expire 30 days after its most recent successful edit.',
				action: 'Unpin live share',
				destructive: false
			};
		}
		if (current.kind === 'rotate') {
			if (!current.share.editUrl) {
				return {
					title: 'Create a new edit link?',
					description:
						'This creates a secret editor link. Any older edit link and its editor access will stop working.',
					action: 'Create edit link',
					destructive: false
				};
			}
			return {
				title: 'Replace the edit link?',
				description:
					'Anyone using the old edit link will lose edit access. The view link will stay the same.',
				action: 'Replace edit link',
				destructive: false
			};
		}
		return {
			title: 'Stop this live share?',
			description:
				'The shared link will stop working. Your device draft remains available and can be shared again.',
			action: 'Stop sharing',
			destructive: true
		};
	}

	function formatTimestamp(value: string | null | undefined) {
		if (!value) return null;
		const timestamp = new Date(value);
		if (Number.isNaN(timestamp.valueOf())) return value;
		return dateFormatter.format(timestamp);
	}

	function handleTextSubmit(event: KeyboardEvent, submit: () => void) {
		if (event.key !== 'Enter' || event.isComposing) return;
		event.preventDefault();
		submit();
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content
		side="right"
		class="p-0 data-[side=right]:w-[calc(100%-1rem)] data-[side=right]:sm:max-w-xl"
	>
		<Sheet.Header class="pr-16">
			<div class="flex items-center gap-2">
				<Sheet.Title>Builds &amp; sharing</Sheet.Title>
				<Badge variant={statusVariant(effectiveStatus.kind)}>
					{#if effectiveStatus.kind === 'creating' || effectiveStatus.kind === 'syncing'}
						<Spinner />
					{:else if effectiveStatus.kind === 'saved' || effectiveStatus.kind === 'synced'}
						<CheckIcon />
					{/if}
					{effectiveStatus.label ?? statusLabel(effectiveStatus.kind)}
				</Badge>
			</div>
			<Sheet.Description>
				Keep drafts on this device, send a permanent snapshot, or collaborate through an unlisted
				live link.
			</Sheet.Description>
		</Sheet.Header>

		<Separator />

		<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 pb-6 pt-4">
			{#if error || localError || effectiveStatus.detail || effectiveStatus.kind === 'error'}
				<Alert.Root variant={error || localError || effectiveStatus.kind === 'error' ? 'destructive' : 'default'}>
					<AlertCircleIcon />
					<Alert.Title>{effectiveStatus.kind === 'error' ? "Couldn't sync" : 'Build status'}</Alert.Title>
					<Alert.Description>
						{error ?? localError ?? effectiveStatus.detail ?? 'Your changes remain on this device. Try syncing again.'}
					</Alert.Description>
					{#if effectiveStatus.kind === 'error' && onRetry}
						<div class="col-span-full mt-3">
							<Button
								variant="outline"
								size="sm"
								disabled={isAnyActionWorking()}
								onclick={() => runAction('retry', onRetry)}
							>
								{#if isWorking('retry')}<Spinner data-icon="inline-start" />{:else}<RefreshCwIcon data-icon="inline-start" />{/if}
								Retry
							</Button>
						</div>
					{/if}
				</Alert.Root>
			{/if}

			<Tabs.Root bind:value={activeTab} class="min-h-0 flex-1 gap-4">
				<Tabs.List class="grid w-full grid-cols-3">
					<Tabs.Trigger value="drafts">
						<FolderIcon data-icon="inline-start" />
						Drafts
					</Tabs.Trigger>
					<Tabs.Trigger value="share">
						<Share2Icon data-icon="inline-start" />
						Share
					</Tabs.Trigger>
					<Tabs.Trigger value="backup">
						<ArchiveIcon data-icon="inline-start" />
						Backup
					</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="drafts" class="min-h-0 overflow-y-auto">
					<div class="flex flex-col gap-4 pb-2">
						{#if mode !== 'device'}
							<Alert.Root>
								{#if mode === 'snapshot-view'}
									<FileTextIcon />
									<Alert.Title>Snapshot preview</Alert.Title>
									<Alert.Description>
										This permanent link is read-only. Fork it to make changes on this device.
									</Alert.Description>
								{:else if mode === 'live-view'}
									<CloudIcon />
									<Alert.Title>Viewing a live build</Alert.Title>
									<Alert.Description>
										Changes made by editors appear here. Fork it to create an independent draft.
									</Alert.Description>
								{:else}
									<CloudIcon />
									<Alert.Title>Editing a live build</Alert.Title>
									<Alert.Description>
										Successful changes sync to everyone with this link.
									</Alert.Description>
								{/if}
								<div class="col-span-full mt-3 flex flex-wrap gap-2">
									{#if onForkToDrafts}
										<Button
											size="sm"
											disabled={isAnyActionWorking()}
											onclick={() => runAction('fork-to-drafts', onForkToDrafts)}
										>
											{#if isWorking('fork-to-drafts')}<Spinner data-icon="inline-start" />{:else}<GitForkIcon data-icon="inline-start" />{/if}
											Fork to my drafts
										</Button>
									{/if}
									{#if onOpenDrafts}
										<Button
											variant="outline"
											size="sm"
											disabled={isAnyActionWorking()}
											onclick={() => runAction('open-drafts', onOpenDrafts)}
										>
											Open my drafts
										</Button>
									{/if}
								</div>
							</Alert.Root>
						{/if}

						<Field.Field>
							<Field.Label for={`${componentId}-new-build`}>New device draft</Field.Label>
							<InputGroup.Root>
								<InputGroup.Input
									id={`${componentId}-new-build`}
									placeholder="Build name"
									maxlength={80}
									bind:value={newBuildName}
									onkeydown={(event) => handleTextSubmit(event, createBuild)}
								/>
								<InputGroup.Addon align="inline-end">
									<InputGroup.Button
										variant="default"
										size="sm"
										disabled={!newBuildName.trim() || !onCreateBuild || isAnyActionWorking()}
										onclick={createBuild}
									>
										{#if isWorking('create-build')}<Spinner data-icon="inline-start" />{:else}<PlusIcon data-icon="inline-start" />{/if}
										Create
									</InputGroup.Button>
								</InputGroup.Addon>
							</InputGroup.Root>
							<Field.Description>Drafts stay in this browser on this device.</Field.Description>
						</Field.Field>

						<div class="flex flex-col gap-3">
							<div class="flex items-center justify-between gap-3">
								<div>
									<h3 class="font-medium">On this device</h3>
									<p class="text-muted-foreground text-sm">{builds.length} {builds.length === 1 ? 'draft' : 'drafts'}</p>
								</div>
								{#if onImportBackup}
									<Button variant="outline" size="sm" onclick={() => (activeTab = 'backup')}>
										<UploadIcon data-icon="inline-start" />
										Import
									</Button>
								{/if}
							</div>

							{#each builds as build (build.id)}
								<Card.Root size="sm">
									<Card.Header>
										<Card.Title class="truncate">{build.name}</Card.Title>
										<Card.Description>
											Updated {formatTimestamp(build.updatedAt)}
										</Card.Description>
										<Card.Action>
											<div class="flex flex-wrap justify-end gap-1">
												{#if build.id === activeBuildId}<Badge>Current</Badge>{/if}
												{#if build.hasLiveShare}<Badge variant="outline">Live</Badge>{/if}
												{#if build.liveSharePinned}<Badge variant="secondary">Pinned</Badge>{/if}
											</div>
										</Card.Action>
									</Card.Header>

									{#if renamingBuildId === build.id}
										<Card.Content>
											<Field.Field>
												<Field.Label class="sr-only" for={`${componentId}-rename-${build.id}`}>Rename {build.name}</Field.Label>
												<InputGroup.Root>
													<InputGroup.Input
														id={`${componentId}-rename-${build.id}`}
														maxlength={80}
														bind:value={renameValue}
														onkeydown={(event) => handleTextSubmit(event, () => saveRename(build))}
													/>
													<InputGroup.Addon align="inline-end">
														<InputGroup.Button
															variant="default"
															size="sm"
															disabled={!renameValue.trim() || isAnyActionWorking()}
															onclick={() => saveRename(build)}
														>
															{#if isWorking('rename-build')}<Spinner data-icon="inline-start" />{:else}<SaveIcon data-icon="inline-start" />{/if}
															Save
														</InputGroup.Button>
													</InputGroup.Addon>
												</InputGroup.Root>
											</Field.Field>
										</Card.Content>
									{/if}

									<Card.Footer class="flex-wrap gap-2">
										{#if build.id !== activeBuildId && onSelectBuild}
											<Button
												size="sm"
												disabled={isAnyActionWorking()}
												onclick={() => runAction('select-build', () => onSelectBuild?.(build.id))}
											>
												Open
											</Button>
										{/if}
										{#if onRenameBuild}
											<Button variant="outline" size="sm" disabled={isAnyActionWorking()} onclick={() => (renamingBuildId === build.id ? cancelRename() : beginRename(build))}>
												<PencilIcon data-icon="inline-start" />
												{renamingBuildId === build.id ? 'Cancel rename' : 'Rename'}
											</Button>
										{/if}
										{#if onDuplicateBuild}
											<Button variant="outline" size="sm" disabled={isAnyActionWorking()} onclick={() => runAction('duplicate-build', () => onDuplicateBuild?.(build.id))}>
												<CopyIcon data-icon="inline-start" />
												Duplicate
											</Button>
										{/if}
										{#if build.id === activeBuildId && onResetBuild}
											<Button variant="outline" size="sm" disabled={isAnyActionWorking()} onclick={() => openConfirmation({ kind: 'reset-build', build })}>
												<RotateCwIcon data-icon="inline-start" />
												Reset
											</Button>
										{/if}
										{#if onDeleteBuild}
											<Button variant="ghost" size="sm" disabled={isAnyActionWorking()} onclick={() => openConfirmation({ kind: 'delete-build', build })}>
												<Trash2Icon data-icon="inline-start" />
												Delete
											</Button>
										{/if}
									</Card.Footer>
								</Card.Root>
							{:else}
								<Empty.Root class="border">
									<Empty.Header>
										<Empty.Media variant="icon"><FolderIcon /></Empty.Media>
										<Empty.Title>No device drafts yet</Empty.Title>
										<Empty.Description>Name this build above to keep it on this device.</Empty.Description>
									</Empty.Header>
								</Empty.Root>
							{/each}
						</div>
					</div>
				</Tabs.Content>

				<Tabs.Content value="share" class="min-h-0 overflow-y-auto">
					<div class="flex flex-col gap-4 pb-2">
						<Card.Root size="sm">
							<Card.Header>
								<Card.Title>Snapshot link</Card.Title>
								<Card.Description>
									A read-only copy embedded in the URL. It never expires and stores nothing on the
									server.
								</Card.Description>
								<Card.Action><Badge variant="secondary">Permanent</Badge></Card.Action>
							</Card.Header>
							{#if displayedSnapshotUrl}
								<Card.Content>
									<Field.Field>
										<Field.Label for={`${componentId}-snapshot-link`}>Snapshot link</Field.Label>
										<InputGroup.Root>
											<InputGroup.Input id={`${componentId}-snapshot-link`} value={displayedSnapshotUrl} readonly />
											<InputGroup.Addon align="inline-end">
												<InputGroup.Button size="icon-sm" aria-label="Copy snapshot link" title="Copy snapshot link" onclick={() => copyText(displayedSnapshotUrl, 'snapshot')}>
													{#if copiedTarget === 'snapshot'}<CheckIcon />{:else}<CopyIcon />{/if}
												</InputGroup.Button>
											</InputGroup.Addon>
										</InputGroup.Root>
									</Field.Field>
								</Card.Content>
							{/if}
							<Card.Footer class="flex-wrap gap-2">
								<Button disabled={!onCreateSnapshot || isAnyActionWorking()} onclick={createSnapshot}>
									{#if isWorking('create-snapshot')}<Spinner data-icon="inline-start" />{:else}<LinkIcon data-icon="inline-start" />{/if}
									{displayedSnapshotUrl ? 'Refresh snapshot' : 'Create snapshot link'}
								</Button>
								{#if displayedSnapshotUrl}
									<Button variant="outline" onclick={() => copyText(displayedSnapshotUrl, 'snapshot')}>
										{#if copiedTarget === 'snapshot'}<CheckIcon data-icon="inline-start" />{:else}<CopyIcon data-icon="inline-start" />{/if}
										{copiedTarget === 'snapshot' ? 'Copied' : 'Copy link'}
									</Button>
								{/if}
							</Card.Footer>
						</Card.Root>

						{#if liveShare && liveShare.state !== 'stopped' && liveShare.state !== 'expired'}
							<Card.Root size="sm">
								<Card.Header>
									<Card.Title>Live share</Card.Title>
									<Card.Description>
										{#if liveShare.pinned}
											This link stays available until you stop it.
										{:else}
											Expires 30 days after the most recent successful edit{#if liveShare.expiresAt}, on {formatTimestamp(liveShare.expiresAt)}{/if}.
										{/if}
									</Card.Description>
									<Card.Action>
										<div class="flex gap-1">
											<Badge>{liveShare.access === 'viewer' ? 'View only' : 'Can edit'}</Badge>
											{#if liveShare.pinned}<Badge variant="secondary">Pinned</Badge>{/if}
										</div>
									</Card.Action>
								</Card.Header>
								<Card.Content class="flex flex-col gap-4">
									<Field.Field>
										<Field.Label for={`${componentId}-view-link`}>View link</Field.Label>
										<Field.Description>Anyone with this link can follow the live build.</Field.Description>
										<InputGroup.Root>
											<InputGroup.Input id={`${componentId}-view-link`} value={liveShare.viewUrl} readonly />
											<InputGroup.Addon align="inline-end">
												<InputGroup.Button size="icon-sm" aria-label="Copy view link" title="Copy view link" onclick={() => copyText(liveShare.viewUrl, 'view')}>
													{#if copiedTarget === 'view'}<CheckIcon />{:else}<CopyIcon />{/if}
												</InputGroup.Button>
											</InputGroup.Addon>
										</InputGroup.Root>
									</Field.Field>

									{#if liveShare.editUrl}
										<Field.Field>
											<Field.Label for={`${componentId}-edit-link`}>Edit link</Field.Label>
											<Field.Description>Anyone with this secret link can change the shared build.</Field.Description>
											<InputGroup.Root>
												<InputGroup.Input id={`${componentId}-edit-link`} value={liveShare.editUrl} readonly />
												<InputGroup.Addon align="inline-end">
													<InputGroup.Button size="icon-sm" aria-label="Copy edit link" title="Copy edit link" onclick={() => copyText(liveShare.editUrl ?? '', 'edit')}>
														{#if copiedTarget === 'edit'}<CheckIcon />{:else}<CopyIcon />{/if}
													</InputGroup.Button>
												</InputGroup.Addon>
											</InputGroup.Root>
										</Field.Field>
									{/if}
								</Card.Content>

								{#if liveShare.access === 'owner'}
									<Card.Footer class="flex-wrap gap-2">
										{#if onPinLiveShare}
											<Button variant="outline" size="sm" disabled={isAnyActionWorking()} onclick={() => openConfirmation({ kind: liveShare.pinned ? 'unpin' : 'pin', share: liveShare })}>
												{#if isWorking('pin-live-share')}<Spinner data-icon="inline-start" />{:else if liveShare.pinned}<PinOffIcon data-icon="inline-start" />{:else}<PinIcon data-icon="inline-start" />{/if}
												{liveShare.pinned ? 'Unpin' : 'Pin permanently'}
											</Button>
										{/if}
										{#if onRotateEditLink}
											<Button variant="outline" size="sm" disabled={isAnyActionWorking()} onclick={() => openConfirmation({ kind: 'rotate', share: liveShare })}>
												{#if isWorking('rotate-edit-link')}<Spinner data-icon="inline-start" />{:else}<RefreshCwIcon data-icon="inline-start" />{/if}
												{liveShare.editUrl ? 'Replace edit link' : 'Create edit link'}
											</Button>
										{/if}
										{#if onStopLiveShare}
											<Button variant="destructive" size="sm" disabled={isAnyActionWorking()} onclick={() => openConfirmation({ kind: 'stop', share: liveShare })}>
												<Trash2Icon data-icon="inline-start" />
												Stop sharing
											</Button>
										{/if}
									</Card.Footer>
								{/if}
							</Card.Root>
						{:else}
							<Card.Root size="sm">
								<Card.Header>
									<Card.Title>Live link</Card.Title>
									<Card.Description>
										Share ongoing edits without an account. Unpinned links expire after 30 days without an edit.
									</Card.Description>
									<Card.Action><Badge variant="outline">30-day expiry</Badge></Card.Action>
								</Card.Header>
								<Card.Footer>
									<Button disabled={!onCreateLiveShare || isAnyActionWorking()} onclick={() => runAction('create-live-share', onCreateLiveShare)}>
										{#if isWorking('create-live-share')}<Spinner data-icon="inline-start" />{:else}<CloudIcon data-icon="inline-start" />{/if}
										Create live share
									</Button>
								</Card.Footer>
							</Card.Root>
						{/if}

						<Alert.Root>
							<ShieldCheckIcon />
							<Alert.Title>Unlisted, not private</Alert.Title>
							<Alert.Description>
								View links are convenient addresses, not a privacy boundary: public build data may be
								discoverable without one. The edit link is a capability—share it carefully.
							</Alert.Description>
						</Alert.Root>
					</div>
				</Tabs.Content>

				<Tabs.Content value="backup" class="min-h-0 overflow-y-auto">
					<div class="flex flex-col gap-4 pb-2">
						<Card.Root size="sm">
							<Card.Header>
								<Card.Title>Build backups</Card.Title>
							<Card.Description>
								Download one build or your full device library as JSON. Importing a library merges it with existing drafts. Live links and edit capabilities are not included.
							</Card.Description>
							</Card.Header>
							<Card.Footer class="flex-wrap gap-2">
								{#if onExportCurrent}
									<Button variant="outline" disabled={isAnyActionWorking()} onclick={() => runAction('export-current', onExportCurrent)}>
										{#if isWorking('export-current')}<Spinner data-icon="inline-start" />{:else}<DownloadIcon data-icon="inline-start" />{/if}
										Export current
									</Button>
								{/if}
								{#if onExportLibrary}
									<Button variant="outline" disabled={isAnyActionWorking()} onclick={() => runAction('export-library', onExportLibrary)}>
										{#if isWorking('export-library')}<Spinner data-icon="inline-start" />{:else}<ArchiveIcon data-icon="inline-start" />{/if}
										Export all drafts
									</Button>
								{/if}
								{#if onImportBackup}
									<Button disabled={isAnyActionWorking()} onclick={() => runAction('import-backup', onImportBackup)}>
										{#if isWorking('import-backup')}<Spinner data-icon="inline-start" />{:else}<UploadIcon data-icon="inline-start" />{/if}
										Import backup
									</Button>
								{/if}
							</Card.Footer>
						</Card.Root>

						<Card.Root size="sm">
							<Card.Header>
								<Card.Title>Live-share recovery</Card.Title>
								<Card.Description>
									Use one recovery phrase to find and reconnect the active live shares you created on any device.
								</Card.Description>
								<Card.Action><FileKeyIcon /></Card.Action>
							</Card.Header>
							<Card.Content class="flex flex-col gap-4">
								<div class="flex flex-wrap items-start justify-between gap-3">
									<div class="flex min-w-0 flex-col gap-1">
										<h3 class="font-medium">Reconnect another device</h3>
										<p class="text-muted-foreground text-sm">
											Reveal this device’s phrase, then enter it on the other device.
										</p>
									</div>
									{#if onRevealRecoveryPhrase || recoveryWords.length > 0}
										<Button
											variant="outline"
											disabled={isAnyActionWorking()}
											onclick={() => recoveryWords.length > 0 ? (recoveryDialogOpen = true) : revealRecoveryPhrase()}
										>
											{#if isWorking('reveal-recovery')}<Spinner data-icon="inline-start" />{:else}<FileKeyIcon data-icon="inline-start" />{/if}
											{recoveryWords.length > 0 ? 'View phrase' : 'Show phrase'}
										</Button>
									{/if}
								</div>

								{#if onRestoreIdentity}
									<Separator />
									<form onsubmit={(event) => { event.preventDefault(); restoreIdentity(); }}>
										<Field.Field data-invalid={restoreInvalid || undefined}>
											<Field.Label for={`${componentId}-recovery-phrase`}>Recover shares on this device</Field.Label>
											<Textarea
												id={`${componentId}-recovery-phrase`}
												rows={4}
												placeholder="Enter the 24 words separated by spaces"
												aria-invalid={restoreInvalid || undefined}
												bind:value={restorePhrase}
											/>
											{#if restoreInvalid}
												<Field.Error>Enter all 24 words. Found {restoreWordCount}.</Field.Error>
											{:else}
												<Field.Description>
													This switches the live-share identity on this device. Drafts stay here, but this device stops managing shares from its current identity. Save this device’s phrase first if you may need them.
												</Field.Description>
											{/if}
											<Button type="submit" disabled={isAnyActionWorking()}>
												{#if isWorking('restore-identity')}<Spinner data-icon="inline-start" />{:else}<FileKeyIcon data-icon="inline-start" />{/if}
												Restore and find shares
											</Button>
										</Field.Field>
									</form>
								{/if}

								{#if onRefreshRecoveredLiveShares || recoveredLiveSharesStatus !== 'idle'}
									<Separator />
									<div class="flex items-start justify-between gap-3">
										<div class="flex min-w-0 flex-col gap-1">
											<h3 class="font-medium">Shares created with this identity</h3>
											<p class="text-muted-foreground text-sm">
												Attach one to keep an editable draft on this device.
											</p>
										</div>
										{#if onRefreshRecoveredLiveShares}
											<Button
												variant="outline"
												size="icon-sm"
												aria-label="Refresh active live shares"
												title="Refresh active live shares"
												disabled={isAnyActionWorking()}
												onclick={refreshRecoveredLiveShares}
											>
												{#if isWorking('refresh-recovered-shares') || recoveredLiveSharesStatus === 'loading'}<Spinner />{:else}<RefreshCwIcon />{/if}
											</Button>
										{/if}
									</div>

									{#if recoveredLiveSharesStatus === 'loading' && recoveredLiveShares.length === 0}
										<Empty.Root class="border">
											<Empty.Header>
												<Empty.Media variant="icon"><Spinner /></Empty.Media>
												<Empty.Title>Finding active shares…</Empty.Title>
											</Empty.Header>
										</Empty.Root>
									{:else if recoveredLiveSharesStatus === 'error' && recoveredLiveShares.length === 0}
										<Alert.Root variant="destructive">
											<AlertCircleIcon />
											<Alert.Title>Couldn’t find your live shares</Alert.Title>
											<Alert.Description>
												{recoveredLiveSharesError ?? 'Try refreshing after the sharing service is available.'}
											</Alert.Description>
										</Alert.Root>
									{:else if recoveredLiveSharesStatus === 'ready' && recoveredLiveShares.length === 0}
										<Empty.Root class="border">
											<Empty.Header>
												<Empty.Media variant="icon"><CloudIcon /></Empty.Media>
												<Empty.Title>No active live shares</Empty.Title>
												<Empty.Description>
													Expired and stopped shares are not listed; any device drafts remain. New live shares will appear here.
												</Empty.Description>
											</Empty.Header>
										</Empty.Root>
									{:else if recoveredLiveShares.length > 0}
										{#if recoveredLiveSharesError}
											<Alert.Root variant="destructive">
												<AlertCircleIcon />
												<Alert.Title>Refresh failed</Alert.Title>
												<Alert.Description>{recoveredLiveSharesError}</Alert.Description>
											</Alert.Root>
										{/if}
										<div class="flex flex-col gap-3">
											{#each recoveredLiveShares as share (share.publicSlug)}
												<Card.Root size="sm">
													<Card.Header>
														<Card.Title class="truncate">{share.title}</Card.Title>
														<Card.Description>
															Edited {formatTimestamp(share.lastEditedAt)} · revision {share.revision}
															{#if !share.pinned && share.expiresAt}<br />Expires {formatTimestamp(share.expiresAt)}{/if}
														</Card.Description>
														<Card.Action>
															<div class="flex flex-wrap justify-end gap-1">
																{#if share.attached}<Badge variant="secondary">On this device</Badge>{/if}
																{#if share.pinned}<Badge variant="outline">Pinned</Badge>{/if}
															</div>
														</Card.Action>
													</Card.Header>
													<Card.Footer>
														<Button
															size="sm"
															disabled={!onAttachRecoveredLiveShare || isAnyActionWorking()}
															onclick={() => attachRecoveredLiveShare(share)}
														>
															{#if isWorking('attach-recovered-share') && attachingRecoveredSlug === share.publicSlug}<Spinner data-icon="inline-start" />{:else}<LaptopIcon data-icon="inline-start" />{/if}
															{share.attached ? 'Open device draft' : 'Attach to this device'}
														</Button>
													</Card.Footer>
												</Card.Root>
											{/each}
										</div>
									{/if}
								{/if}
							</Card.Content>
						</Card.Root>
					</div>
				</Tabs.Content>
			</Tabs.Root>
		</div>
	</Sheet.Content>
</Sheet.Root>

<AlertDialog.Root bind:open={confirmationOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{confirmationCopy.title}</AlertDialog.Title>
			<AlertDialog.Description>{confirmationCopy.description}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant={confirmationCopy.destructive ? 'destructive' : 'default'} onclick={confirmAction}>
				{confirmationCopy.action}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<Dialog.Root bind:open={recoveryDialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Live-share recovery phrase</Dialog.Title>
			<Dialog.Description>
				Enter these words on another device to discover and attach your active live shares. Device drafts are separate.
			</Dialog.Description>
		</Dialog.Header>
		{#if recoveryWords.length > 0}
			<div class="grid grid-cols-2 gap-2 rounded-lg bg-muted p-4 sm:grid-cols-3">
				{#each recoveryWords as word, index (`${index}-${word}`)}
					<div class="flex min-w-0 items-baseline gap-2 rounded-md bg-background px-2 py-1.5">
						<span class="text-muted-foreground text-xs tabular-nums">{index + 1}.</span>
						<span class="truncate font-mono text-sm">{word}</span>
					</div>
				{/each}
			</div>
			<Alert.Root>
				<ShieldCheckIcon />
				<Alert.Title>Treat it like a password</Alert.Title>
				<Alert.Description>Store it offline. Never paste it into a build or send it with a share link.</Alert.Description>
			</Alert.Root>
		{/if}
		<Dialog.Footer>
			{#if recoveryWords.length > 0}
				<Button variant="outline" onclick={() => copyText(recoveryWords.join(' '), 'recovery')}>
					{#if copiedTarget === 'recovery'}<CheckIcon data-icon="inline-start" />{:else}<CopyIcon data-icon="inline-start" />{/if}
					{copiedTarget === 'recovery' ? 'Copied' : 'Copy phrase'}
				</Button>
			{/if}
			<Button
				disabled={!onAcknowledgeRecoveryPhrase || isAnyActionWorking()}
				onclick={async () => {
					await runAction('acknowledge-recovery', onAcknowledgeRecoveryPhrase);
					if (!localError) recoveryDialogOpen = false;
				}}
			>
				{#if isWorking('acknowledge-recovery')}<Spinner data-icon="inline-start" />{:else}<CheckIcon data-icon="inline-start" />{/if}
				I saved it
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
