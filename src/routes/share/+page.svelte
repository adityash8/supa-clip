<script lang="ts">
 import { onMount } from 'svelte';
 import { resolve } from '$app/paths';
 import { api } from '$lib/web/cloud';
 let url=$state('');let title=$state('');let expires=$state('');let message=$state('');let loading=$state(true);
 async function load() {
  loading=true;message='';url='';
  try {const result=await api('view',{token:location.hash.slice(1)});url=result.url;title=result.title;expires=result.expiresAt;}
  catch(error){message=error instanceof Error?error.message:'This clip is unavailable. Ask the creator for a new link.';}
  finally{loading=false;}
 }
 onMount(()=>{void load();});
</script>
<svelte:head><title>SupaClip | Shared clip</title><meta name="robots" content="noindex,nofollow"/><meta name="referrer" content="no-referrer"/></svelte:head>
<div class="web-app"><header class="app-header"><a class="brand" href={resolve('/')}>SupaClip</a><span class="header-note">Shared by link</span></header><main><section class="list-section">
 {#if loading}<p role="status">Checking link access…</p>{:else if message}<div class="feedback error" role="alert">{message}</div><button class="button" onclick={load}>Check link again</button>{:else}<h1>{title}</h1><p>This link expires {new Date(expires).toLocaleString()}. The creator can revoke it sooner.</p><div class="video-frame"><video src={url} controls playsinline onerror={()=>message='Playback URL expired or the clip could not load. Check link access again.'}><track kind="captions"/></video></div><button class="button" onclick={load}>Refresh playback access</button>{/if}
 <p class="hint">Media access expires within 60 seconds. If playback expires, refresh access. A shared link can be forwarded; ask the creator before sharing it.</p>
 </section></main></div>
