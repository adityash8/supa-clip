<script lang="ts">
	import { startRecording, error } from '$lib/stores/recording';
	import { settings } from '$lib/stores/settings';

	let isStarting = $state(false);
	let showSettings = $state(false);

	async function handleRecord() {
		isStarting = true;
		try {
			await startRecording($settings.fps, $settings.webcam_enabled);
		} catch {
			// Error is set in the store
		} finally {
			isStarting = false;
		}
	}

	const { onOpenSettings } = $props<{ onOpenSettings: () => void }>();
</script>

<div class="flex flex-col items-center justify-center h-full gap-8 p-8">
	<div class="text-center">
		<h1 class="text-3xl font-bold text-white">SupaClip</h1>
		<p class="text-sm text-zinc-400 mt-1">Crash-proof screen recorder</p>
	</div>

	<button
		onclick={handleRecord}
		disabled={isStarting}
		class="group relative w-28 h-28 rounded-full bg-red-500 hover:bg-red-400 active:bg-red-600
			transition-all duration-200 hover:scale-105 active:scale-95
			disabled:opacity-50 disabled:cursor-not-allowed
			shadow-lg shadow-red-500/25 hover:shadow-red-400/40"
	>
		<div class="absolute inset-0 rounded-full border-4 border-red-400/30 group-hover:border-red-300/50 transition-colors"></div>
		{#if isStarting}
			<div class="flex items-center justify-center">
				<div class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
			</div>
		{:else}
			<div class="flex items-center justify-center">
				<div class="w-8 h-8 rounded-full bg-white"></div>
			</div>
		{/if}
	</button>

	<div class="text-center">
		<p class="text-zinc-400 text-sm">
			Press <kbd class="px-1.5 py-0.5 bg-zinc-700 rounded text-xs text-zinc-300 font-mono">⌘⇧9</kbd> to start recording
		</p>
	</div>

	{#if $error}
		<div class="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm max-w-sm text-center">
			{$error}
		</div>
	{/if}

	<button
		onclick={onOpenSettings}
		class="absolute top-4 right-4 p-2 text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-zinc-800"
		aria-label="Settings"
	>
		<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
			<circle cx="12" cy="12" r="3"/>
		</svg>
	</button>
</div>
