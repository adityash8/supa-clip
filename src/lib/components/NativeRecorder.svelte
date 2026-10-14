<script lang="ts">
	import { onMount } from 'svelte';
	import { listen } from '@tauri-apps/api/event';
	import {
		recordingState,
		startRecording,
		stopRecording,
		duration,
		bytesWritten,
		error,
		formatDuration,
		formatBytes,
		savedFilePath
	} from '$lib/stores/recording';
	import { loadSettings, settings } from '$lib/stores/settings';
	import IdleScreen from '$lib/components/IdleScreen.svelte';
	import DoneScreen from '$lib/components/DoneScreen.svelte';
	import SettingsPanel from '$lib/components/SettingsPanel.svelte';
	import WebcamOverlay from '$lib/components/WebcamOverlay.svelte';
	import RecoveryDialog from '$lib/components/RecoveryDialog.svelte';
	import TrimEditor from '$lib/components/TrimEditor.svelte';

	let showSettings = $state(false);
	let showRecovery = $state(false);
	let showTrim = $state(false);

	onMount(() => {
        let disposed = false;
        const cleanup: (() => void)[] = [];
        void (async () => {
            await loadSettings();
            const { register, unregisterAll } = await import('@tauri-apps/plugin-global-shortcut');
            const { emit } = await import('@tauri-apps/api/event');
            try { await register($settings.hotkey, event => { if (event.state === 'Pressed') void emit('toggle-recording'); }); }
            catch { error.set('The recording shortcut could not register. Use the record button or choose another shortcut in Settings.'); }
            cleanup.push(() => { void unregisterAll(); });
            const toggle = await listen('toggle-recording', async () => {
                try {
                    if ($recordingState === 'recording') await stopRecording();
                    else if ($recordingState === 'idle') await startRecording($settings.fps, $settings.webcam_enabled);
                } catch { /* Store displays capture errors. */ }
            });
            cleanup.push(toggle);
            const recovery = await listen('recoverable-files-found', () => { showRecovery = true; });
            cleanup.push(recovery);
            const { listRecoverable } = await import('$lib/commands');
            showRecovery = (await listRecoverable()).length > 0;
            if (disposed) cleanup.forEach(fn => fn());
        })().catch(() => error.set('Native setup could not finish. Use the record button; reopen the app to retry recovery and shortcuts.'));
        return () => { disposed = true; cleanup.forEach(fn => fn()); };
    });

</script>

<div class="h-screen bg-zinc-900 text-white relative overflow-hidden select-none">
	{#if $recordingState === 'idle'}
		<IdleScreen onOpenSettings={() => (showSettings = true)} />
	{:else if $recordingState === 'recording'}
		<div class="flex flex-col items-center justify-center h-full gap-6 p-8">
			<div class="flex items-center gap-3">
				<div class="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
				<span class="text-lg font-mono text-white">{formatDuration($duration)}</span>
			</div>

			<div class="text-sm text-zinc-400">
				{formatBytes($bytesWritten)}
			</div>

			<button
				onclick={() => stopRecording()}
				aria-label="Stop recording"
				class="w-20 h-20 rounded-full bg-zinc-700 hover:bg-zinc-600 active:bg-zinc-800
					transition-all duration-200 hover:scale-105 active:scale-95
					flex items-center justify-center shadow-lg"
			>
				<div class="w-7 h-7 rounded-sm bg-red-500"></div>
			</button>

			<p class="text-zinc-500 text-sm">
				Press <kbd class="px-1.5 py-0.5 bg-zinc-700 rounded text-xs text-zinc-400 font-mono">⌘⇧9</kbd> to stop
			</p>
		</div>
		<WebcamOverlay />
    {:else if $recordingState === 'saving'}
        <div class="p-8 text-center text-zinc-300" role="status">Stopping, repairing and checking your recording. Original fragments stay saved until export succeeds.</div>
	{:else if $recordingState === 'done'}
		<DoneScreen onOpenTrim={() => (showTrim = true)} />
	{/if}

    {#if $error && $recordingState === 'idle'}<button class="absolute bottom-4 left-4 px-4 py-2 bg-zinc-700 rounded" onclick={() => showRecovery = true}>Recover saved fragments</button>{/if}
	{#if showSettings}
		<SettingsPanel onClose={() => (showSettings = false)} />
	{/if}

	{#if showRecovery}
		<RecoveryDialog onClose={() => (showRecovery = false)} />
	{/if}

	{#if showTrim && $savedFilePath}
		<TrimEditor
			onClose={() => (showTrim = false)}
			onTrimmed={(path) => {
				savedFilePath.set(path);
				showTrim = false;
			}}
		/>
	{/if}
</div>
