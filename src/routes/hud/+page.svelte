<script lang="ts">
	import { onMount } from 'svelte';
	import { listen } from '@tauri-apps/api/event';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { duration, bytesWritten, formatDuration, formatBytes, isRecording, stopRecording } from '$lib/stores/recording';

	let dragging = $state(false);

	onMount(async () => {
		const unlisten = await listen('toggle-recording', async () => {
			if ($isRecording) {
				await stopRecording();
				const win = getCurrentWindow();
				await win.close();
			}
		});

		return unlisten;
	});

	async function handleStop() {
		await stopRecording();
		const win = getCurrentWindow();
		await win.close();
	}

	async function startDrag(e: MouseEvent) {
		const win = getCurrentWindow();
		await win.startDragging();
	}
</script>

<div
	class="flex items-center gap-3 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-full px-4 py-2 shadow-2xl cursor-move select-none"
	role="toolbar"
	tabindex="0"
	onmousedown={startDrag}
>
	<div class="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>

	<span class="text-sm font-mono text-white min-w-[60px]">{formatDuration($duration)}</span>

	<span class="text-xs text-zinc-500">{formatBytes($bytesWritten)}</span>

	<button
		onclick={handleStop}
		class="ml-2 w-6 h-6 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center transition-colors"
		title="Stop recording"
	>
		<div class="w-2.5 h-2.5 rounded-sm bg-red-500"></div>
	</button>
</div>
