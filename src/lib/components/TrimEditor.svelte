<script lang="ts">
	import { savedFilePath } from '$lib/stores/recording';
	import { trimVideo } from '$lib/commands';
	import { formatDuration } from '$lib/stores/recording';

	const { onClose, onTrimmed } = $props<{
		onClose: () => void;
		onTrimmed: (path: string) => void;
	}>();

	let videoEl = $state<HTMLVideoElement | null>(null);
	let videoDuration = $state(0);
	let startTime = $state(0);
	let endTime = $state(0);
	let currentTime = $state(0);
	let trimming = $state(false);
	let error = $state('');

	$effect(() => {
		if (videoEl && $savedFilePath) {
			videoEl.src = `asset://localhost/${$savedFilePath}`;
		}
	});

	function handleLoadedMetadata() {
		if (videoEl) {
			videoDuration = videoEl.duration;
			endTime = videoDuration;
		}
	}

	function handleTimeUpdate() {
		if (videoEl) {
			currentTime = videoEl.currentTime;
		}
	}

	function previewTrim() {
		if (videoEl) {
			videoEl.currentTime = startTime;
			videoEl.play();
		}
	}

	async function handleTrim() {
		if (!$savedFilePath) return;
		trimming = true;
		error = '';
		try {
			const ext = $savedFilePath.split('.').pop();
			const output = $savedFilePath.replace(`.${ext}`, `_trimmed.${ext}`);
			const result = await trimVideo($savedFilePath, output, startTime, endTime);
			onTrimmed(result);
		} catch (err) {
			error = String(err);
		} finally {
			trimming = false;
		}
	}
</script>

<div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" role="dialog">
	<div class="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg shadow-2xl">
		<div class="flex items-center justify-between p-4 border-b border-zinc-800">
			<h2 class="text-lg font-semibold text-white">Trim Recording</h2>
			<button onclick={onClose} aria-label="Close" class="text-zinc-500 hover:text-zinc-300 transition-colors">
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="18" y1="6" x2="6" y2="18"></line>
					<line x1="6" y1="6" x2="18" y2="18"></line>
				</svg>
			</button>
		</div>

		<div class="p-4 space-y-4">
			<div class="aspect-video bg-black rounded-lg overflow-hidden">
				<video
					bind:this={videoEl}
					onloadedmetadata={handleLoadedMetadata}
					ontimeupdate={handleTimeUpdate}
					class="w-full h-full object-contain"
					controls
				></video>
			</div>

			<div class="space-y-3">
				<div class="flex items-center gap-4">
					<label class="flex-1">
						<span class="text-xs text-zinc-500 block mb-1">Start: {formatDuration(Math.floor(startTime))}</span>
						<input
							type="range"
							min="0"
							max={videoDuration}
							step="0.1"
							bind:value={startTime}
							class="w-full accent-blue-500"
						/>
					</label>
					<label class="flex-1">
						<span class="text-xs text-zinc-500 block mb-1">End: {formatDuration(Math.floor(endTime))}</span>
						<input
							type="range"
							min="0"
							max={videoDuration}
							step="0.1"
							bind:value={endTime}
							class="w-full accent-blue-500"
						/>
					</label>
				</div>
				<div class="text-center text-sm text-zinc-400">
					Duration: {formatDuration(Math.floor(Math.max(0, endTime - startTime)))}
				</div>
			</div>

			{#if error}
				<div class="bg-red-900/50 border border-red-700 text-red-200 px-3 py-2 rounded-lg text-sm">
					{error}
				</div>
			{/if}
		</div>

		<div class="p-4 border-t border-zinc-800 flex gap-2">
			<button onclick={previewTrim}
				class="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
				Preview
			</button>
			<button onclick={handleTrim} disabled={trimming}
				class="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
				{trimming ? 'Trimming...' : 'Save Trimmed'}
			</button>
		</div>
	</div>
</div>
