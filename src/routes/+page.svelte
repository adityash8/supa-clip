<script lang="ts">
 import { onMount } from 'svelte';
 import NativeRecorder from '$lib/components/NativeRecorder.svelte';
 import WebRecorder from '$lib/web/WebRecorder.svelte';
 let native = $state(false);
 let ready = $state(false);
 onMount(() => { native = '__TAURI_INTERNALS__' in window; ready = true; });
</script>
<svelte:head><title>SupaClip | Record, review, share</title><meta name="description" content="Record a selected screen, review locally, and choose when to share." /></svelte:head>
{#if ready}{#if native}<NativeRecorder />{:else}<WebRecorder />{/if}{:else}<p class="p-8 text-zinc-300">Opening recorder…</p>{/if}
