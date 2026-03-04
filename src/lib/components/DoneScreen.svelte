<script lang="ts">
	import { savedFilePath, duration, bytesWritten, formatDuration, formatBytes, resetRecording } from '$lib/stores/recording';
	import { settings } from '$lib/stores/settings';
	import { writeText } from '@tauri-apps/plugin-clipboard-manager';
	import { invoke } from '@tauri-apps/api/core';

	let showTrimEditor = $state(false);
	let toastMessage = $state('');
	let uploading = $state(false);

	const { onOpenTrim } = $props<{ onOpenTrim: () => void }>();

	function showToast(msg: string) {
		toastMessage = msg;
		setTimeout(() => { toastMessage = ''; }, 3000);
	}

	async function showInFinder() {
		if ($savedFilePath) {
			try {
				await invoke('show_in_folder', { path: $savedFilePath });
			} catch (err) {
				showToast('Could not open Finder: ' + String(err));
			}
		}
	}

	async function handleUpload() {
		if (!$settings.s3_bucket || !$settings.s3_access_key) {
			showToast('Configure S3 credentials in Settings first');
			return;
		}
		uploading = true;
		try {
			const { uploadToS3 } = await import('$lib/commands');
			const result = await uploadToS3(
				$savedFilePath!,
				$settings.s3_bucket,
				$settings.s3_access_key,
				$settings.s3_secret_key,
				$settings.s3_endpoint,
				$settings.s3_region
			);
			await writeText(result.url);
			showToast('Link copied to clipboard!');
		} catch (err) {
			showToast(String(err));
		} finally {
			uploading = false;
		}
	}

	function fileName(): string {
		if (!$savedFilePath) return '';
		return $savedFilePath.split('/').pop() || '';
	}
</script>

<div class="flex flex-col items-center justify-center h-full gap-6 p-8">
	<div class="text-center">
		<div class="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
			<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-400">
				<polyline points="20 6 9 17 4 12"></polyline>
			</svg>
		</div>
		<h2 class="text-xl font-semibold text-white">Recording Saved</h2>
	</div>

	<div class="bg-zinc-800 rounded-lg p-4 w-full max-w-sm space-y-2">
		<div class="flex justify-between text-sm">
			<span class="text-zinc-400">File</span>
			<span class="text-zinc-200 truncate ml-4 max-w-[200px]">{fileName()}</span>
		</div>
		<div class="flex justify-between text-sm">
			<span class="text-zinc-400">Duration</span>
			<span class="text-zinc-200">{formatDuration($duration)}</span>
		</div>
		<div class="flex justify-between text-sm">
			<span class="text-zinc-400">Size</span>
			<span class="text-zinc-200">{formatBytes($bytesWritten)}</span>
		</div>
	</div>

	<div class="flex flex-col gap-2 w-full max-w-sm">
		<button
			onclick={onOpenTrim}
			class="w-full py-2.5 px-4 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors text-sm font-medium"
		>
			Trim
		</button>

		<button
			onclick={handleUpload}
			disabled={uploading}
			class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
		>
			{uploading ? 'Uploading...' : 'Upload & Copy Link'}
		</button>

		<button
			onclick={showInFinder}
			class="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors text-sm"
		>
			Show in Finder
		</button>

		<button
			onclick={resetRecording}
			class="w-full py-2.5 px-4 text-zinc-500 hover:text-zinc-300 transition-colors text-sm mt-2"
		>
			New Recording
		</button>
	</div>

	{#if toastMessage}
		<div class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm shadow-lg animate-fade-in">
			{toastMessage}
		</div>
	{/if}
</div>
