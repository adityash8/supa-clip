<script lang="ts">
	import { webcamStream } from '$lib/stores/recording';
	import { settings } from '$lib/stores/settings';
	import { onMount } from 'svelte';

	let videoEl = $state<HTMLVideoElement | null>(null);

	$effect(() => {
		if (videoEl && $webcamStream) {
			videoEl.srcObject = $webcamStream;
		}
	});

	const positionClasses: Record<string, string> = {
		'bottom-right': 'bottom-4 right-4',
		'bottom-left': 'bottom-4 left-4',
		'top-right': 'top-4 right-4',
		'top-left': 'top-4 left-4'
	};
</script>

{#if $webcamStream}
	<div class="fixed {positionClasses[$settings.webcam_position] || positionClasses['bottom-right']} z-40">
		<div class="w-32 h-32 rounded-full overflow-hidden border-2 border-white/30 shadow-lg">
			<video
				bind:this={videoEl}
				autoplay
				muted
				playsinline
				class="w-full h-full object-cover scale-x-[-1]"
			></video>
		</div>
	</div>
{/if}
