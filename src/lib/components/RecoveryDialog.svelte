<script lang="ts">
	import { listRecoverable, recoverFile, deleteRecoverable, type RecoverableFile } from '$lib/commands';
	import { formatBytes } from '$lib/stores/recording';

	const { onClose } = $props<{ onClose: () => void }>();

	let files = $state<RecoverableFile[]>([]);
	let loading = $state(true);
	let recovering = $state<string | null>(null);

	async function load() {
		loading = true;
		try {
			files = await listRecoverable();
		} catch (err) {
			console.error('Failed to list recoverable files:', err);
		} finally {
			loading = false;
		}
	}

	async function handleRecover(file: RecoverableFile) {
		recovering = file.session_id;
		try {
			await recoverFile(file.session_id);
			files = files.filter((f) => f.session_id !== file.session_id);
			if (files.length === 0) onClose();
		} catch (err) {
			console.error('Failed to recover:', err);
		} finally {
			recovering = null;
		}
	}

	async function handleDelete(file: RecoverableFile) {
		try {
			await deleteRecoverable(file.session_id);
			files = files.filter((f) => f.session_id !== file.session_id);
			if (files.length === 0) onClose();
		} catch (err) {
			console.error('Failed to delete:', err);
		}
	}

	async function handleRecoverAll() {
		for (const file of files) {
			await handleRecover(file);
		}
	}

	async function handleDeleteAll() {
		for (const file of files) {
			await handleDelete(file);
		}
	}

	load();
</script>

<div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" role="dialog">
	<div class="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md shadow-2xl">
		<div class="p-4 border-b border-zinc-800">
			<h2 class="text-lg font-semibold text-white">Recovered Recordings</h2>
			<p class="text-sm text-zinc-400 mt-1">
				Found recordings from a previous session. Would you like to recover them?
			</p>
		</div>

		<div class="p-4 space-y-2 max-h-64 overflow-y-auto">
			{#if loading}
				<div class="text-center text-zinc-500 py-4">Loading...</div>
			{:else}
				{#each files as file}
					<div class="flex items-center justify-between bg-zinc-800 rounded-lg p-3">
						<div>
							<div class="text-sm text-zinc-200 font-mono truncate max-w-[200px]">
								{file.session_id.slice(0, 8)}...
							</div>
							<div class="text-xs text-zinc-500">
								{formatBytes(file.size)} &middot; {file.modified}
							</div>
						</div>
						<div class="flex gap-2">
							<button
								onclick={() => handleRecover(file)}
								disabled={recovering === file.session_id}
								class="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded-md transition-colors disabled:opacity-50"
							>
								{recovering === file.session_id ? '...' : 'Recover'}
							</button>
							<button
								onclick={() => handleDelete(file)}
								class="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded-md transition-colors"
							>
								Delete
							</button>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		{#if files.length > 1}
			<div class="px-4 pb-2 flex gap-2">
				<button onclick={handleRecoverAll}
					class="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors">
					Recover All
				</button>
				<button onclick={handleDeleteAll}
					class="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded-lg transition-colors">
					Delete All
				</button>
			</div>
		{/if}

		<div class="p-4 border-t border-zinc-800">
			<button onclick={onClose}
				class="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
				Dismiss
			</button>
		</div>
	</div>
</div>
