<script lang="ts">
	import { settings, saveSettings } from '$lib/stores/settings';
	import type { AppSettings } from '$lib/commands';

	const { onClose } = $props<{ onClose: () => void }>();

	let local = $state<AppSettings>({ ...$settings });
	let saving = $state(false);
	let saved = $state(false);

	async function handleSave() {
		saving = true;
		try {
			await saveSettings(local);
			saved = true;
			setTimeout(() => { saved = false; }, 2000);
		} catch (err) {
			console.error('Failed to save settings:', err);
		} finally {
			saving = false;
		}
	}
</script>

<div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" role="dialog">
	<div class="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
		<div class="flex items-center justify-between p-4 border-b border-zinc-800">
			<h2 class="text-lg font-semibold text-white">Settings</h2>
			<button onclick={onClose} aria-label="Close" class="text-zinc-500 hover:text-zinc-300 transition-colors">
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="18" y1="6" x2="6" y2="18"></line>
					<line x1="6" y1="6" x2="18" y2="18"></line>
				</svg>
			</button>
		</div>

		<div class="p-4 space-y-6">
			<!-- Recording -->
			<section>
				<h3 class="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">Recording</h3>
				<div class="space-y-3">
					<label class="flex items-center justify-between">
						<span class="text-sm text-zinc-300">Format</span>
						<select bind:value={local.format} class="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5">
							<option value="webm">WebM</option>
							<option value="mp4">MP4 (convert after)</option>
						</select>
					</label>
					<label class="flex items-center justify-between">
						<span class="text-sm text-zinc-300">FPS</span>
						<select bind:value={local.fps} class="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5">
							<option value={30}>30 fps</option>
							<option value={60}>60 fps</option>
						</select>
					</label>
					<label class="flex items-center justify-between">
						<span class="text-sm text-zinc-300">Webcam</span>
						<input type="checkbox" bind:checked={local.webcam_enabled}
							class="w-4 h-4 accent-blue-500" />
					</label>
					<label class="flex items-center justify-between">
						<span class="text-sm text-zinc-300">Webcam position</span>
						<select bind:value={local.webcam_position} class="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5">
							<option value="bottom-right">Bottom Right</option>
							<option value="bottom-left">Bottom Left</option>
							<option value="top-right">Top Right</option>
							<option value="top-left">Top Left</option>
						</select>
					</label>
				</div>
			</section>

			<!-- Hotkey -->
			<section>
				<h3 class="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">Hotkey</h3>
				<label class="flex items-center justify-between">
					<span class="text-sm text-zinc-300">Toggle recording</span>
					<input type="text" bind:value={local.hotkey}
						class="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5 w-48 text-right" />
				</label>
			</section>

			<!-- Upload -->
			<section>
				<h3 class="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">Upload (S3 Compatible)</h3>
				<div class="space-y-3">
					<label class="block">
						<span class="text-sm text-zinc-300">Endpoint</span>
						<input type="text" bind:value={local.s3_endpoint} placeholder="https://s3.amazonaws.com"
							class="mt-1 w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5" />
					</label>
					<label class="block">
						<span class="text-sm text-zinc-300">Bucket</span>
						<input type="text" bind:value={local.s3_bucket}
							class="mt-1 w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5" />
					</label>
					<label class="block">
						<span class="text-sm text-zinc-300">Access Key</span>
						<input type="text" bind:value={local.s3_access_key}
							class="mt-1 w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5" />
					</label>
					<label class="block">
						<span class="text-sm text-zinc-300">Secret Key</span>
						<input type="password" bind:value={local.s3_secret_key}
							class="mt-1 w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5" />
					</label>
					<label class="block">
						<span class="text-sm text-zinc-300">Region</span>
						<input type="text" bind:value={local.s3_region} placeholder="auto"
							class="mt-1 w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5" />
					</label>
				</div>
			</section>
		</div>

		<div class="p-4 border-t border-zinc-800 flex gap-2">
			<button onclick={onClose}
				class="flex-1 py-2 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
				Cancel
			</button>
			<button onclick={handleSave} disabled={saving}
				class="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
				{#if saved}
					Saved!
				{:else if saving}
					Saving...
				{:else}
					Save
				{/if}
			</button>
		</div>
	</div>
</div>
