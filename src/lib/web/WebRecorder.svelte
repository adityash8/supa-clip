<script lang="ts">
 import { onMount } from 'svelte';
 import { resolve } from '$app/paths';
 import { Capture, supported } from './capture';
 import { listDrafts, removeDraft, draftBlob, type Draft } from './drafts';
 import { api, upload, CloudError } from './cloud';
 import { formatBytes, formatDuration } from '$lib/stores/recording';
 let tab = $state<'record'|'local'|'library'>('record');
 let phase = $state<'idle'|'asking'|'recording'|'saving'>('idle');
 let canRecord = $state(false); let microphone = $state(false); let consent = $state(false);
 let title = $state(''); let seconds = $state(0); let size = $state(0);
 let message = $state(''); let notice = $state(''); let busy = $state('');
 let capture: Capture; let preview = $state(''); let current = $state<Draft|null>(null); let blob = $state<Blob|null>(null);
 let sample = $state(false); let drafts = $state<Draft[]>([]); let draftsLoaded = $state(false);
 let email = $state(''); let code = $state(''); let sent = $state(false); let account = $state(''); let cloudReady = $state(true); let billingMode = $state('pilot');
 let clips = $state<any[]>([]); let libraryLoaded = $state(false); let progress = $state(0);
 let confirmUpload = $state(false); let deleteId = $state(''); let shareInfo = $state<{id:string;url:string;expiresAt:string}|null>(null);
 const openedAt = Date.now();
 const recording = $derived(phase !== 'idle');
 function replacePreview(url:string) { if(preview.startsWith('blob:')) URL.revokeObjectURL(preview); preview=url; }
 async function refreshDrafts() {
  try { drafts=(await listDrafts()).sort((a,b)=>b.created-a.created).filter(d=>d.size>0); }
  catch(error) { message=error instanceof Error?error.message:'Local recordings could not load. Check browser storage permissions.'; }
  draftsLoaded=true;
 }
 async function loadSession() {
  try { const result=await api('session'); account=result.email; billingMode=result.billingMode; cloudReady=true; }
  catch(error) { if(error instanceof CloudError && error.status===503) cloudReady=false; }
 }
 onMount(()=>{
  canRecord=supported();
  capture=new Capture({state:value=>phase=value,progress:(s,b)=>{seconds=s;size=b;},error:value=>message=value,
   finish:(draft,video)=>{current=draft;blob=video;sample=false;replacePreview(URL.createObjectURL(video));confirmUpload=false;void refreshDrafts();}});
  void refreshDrafts(); void loadSession();
  const unload=(event:BeforeUnloadEvent)=>{if(recording){ event.preventDefault(); }};
  window.addEventListener('beforeunload',unload);
  return ()=>{capture.dispose();if(preview.startsWith('blob:'))URL.revokeObjectURL(preview);window.removeEventListener('beforeunload',unload);};
 });
 async function task(label:string,work:()=>Promise<void>) {
  if(busy) return; busy=label;message='';notice='';
  try { await work(); }
  catch(error) {message=error instanceof Error?error.message:'The request failed. Retry; your local video is retained.';}
  finally {busy='';}
 }
 async function start() {
  message='';notice='';sample=false;seconds=0;size=0;
  await capture.start(microphone,title);
 }
 function showSample() { current=null;blob=null;sample=true;confirmUpload=false;replacePreview('/sample.webm');notice='Sample video only. No capture permissions, upload session or share link were created.'; }
 function openDraft(draft:Draft) {
  current=draft;blob=draftBlob(draft);sample=false;title=draft.title;confirmUpload=false;
  replacePreview(URL.createObjectURL(blob));tab='record';message='';
  notice=draft.complete?'Saved on this browser. Review before uploading.':'Recovered saved chunks. Playback after an interruption depends on the codec and last saved chunk. Download even if preview cannot play.';
 }
 function previewed() {
  const mode=sample?'sample':'real'; const key=`supaclip_previewed_${mode}`;
  if(!sessionStorage.getItem(key)) {sessionStorage.setItem(key,'1');const properties={schema_version:1,mode,elapsed_ms:Date.now()-openedAt};window.dispatchEvent(new CustomEvent('first_recording_previewed',{detail:properties}));void api('event',{event:'first_recording_previewed',properties}).catch(()=>{});}
 }
 async function loadLibrary() { libraryLoaded=false; const result=await api('clips');clips=result.clips;libraryLoaded=true; }
 async function library() {tab='library';if(account)await task('Loading library',loadLibrary);}
 async function signIn() { await task('Sending code',async()=>{await api('sign-in',{email});sent=true;notice='Check your email for the sign-in code. Recording locally is available while you wait.';}); }
 async function verify() {await task('Verifying code',async()=>{await api('verify',{email,code});code='';sent=false;await loadSession();await loadLibrary();notice='Signed in. Your library is private.';});}
 async function uploadCurrent() {
  if(!blob||!current||sample||!confirmUpload)return;
  const local=blob; const draft=current;
  await task('Uploading',async()=>{
   progress=0;await upload(local,title.trim()||draft.title,draft.duration,value=>progress=value);
   window.dispatchEvent(new CustomEvent('recording_uploaded',{detail:{schema_version:1,mode:'real',visibility:'private'}}));
   confirmUpload=false;notice='Upload verified. Your clip is private. Your browser copy is still saved.';await loadLibrary();
  });
 }
 async function playClip(clip:any) { await task('Opening clip',async()=>{const result=await api('playback',{id:clip.id});replacePreview(result.url);current=null;blob=null;sample=false;tab='record';notice='Private cloud playback. If the URL expires, open the clip again from your library.';}); }
 async function downloadClip(clip:any) { await task('Preparing download',async()=>{const result=await api('download',{id:clip.id});location.assign(result.url);notice='Download requested. The browser will save the cloud clip.';}); }
 async function createShare(clip:any) {await task('Creating link',async()=>{
  const result=await api('share',{id:clip.id});shareInfo={id:clip.id,url:`${location.origin}/share#${result.token}`,expiresAt:result.expiresAt};
  window.dispatchEvent(new CustomEvent('share_link_created',{detail:{schema_version:1,mode:'real',visibility:'shared'}}));await loadLibrary();
 });}
 async function copyShare() {if(!shareInfo)return;await task('Copying link',async()=>{try { await navigator.clipboard.writeText(shareInfo!.url); } catch { throw new Error('Clipboard access was blocked. Select and copy the link field manually.'); } notice='Link copied. Anyone with it can view the clip until expiry or revocation.';});}
 async function revoke(clip:any) {await task('Revoking link',async()=>{await api('revoke',{id:clip.id});if(shareInfo?.id===clip.id)shareInfo=null;await loadLibrary();notice='Link revoked. Previously issued video URLs expire within 60 seconds.';});}
 async function removeCloud(clip:any) {await task('Deleting clip',async()=>{await api('delete',{id:clip.id});deleteId='';if(shareInfo?.id===clip.id)shareInfo=null;await loadLibrary();notice='Cloud clip deleted and link access revoked. Browser copies remain until you delete them.';});}
 async function deleteLocal(draft:Draft) {await task('Deleting browser copy',async()=>{await removeDraft(draft.id);if(current?.id===draft.id){current=null;blob=null;replacePreview('');}deleteId='';await refreshDrafts();notice='Browser copy deleted. Cloud clips are unchanged.';});}
</script>

<div class="web-app">
 <header class="app-header"><a href={resolve('/')} class="brand" aria-label="SupaClip recorder"><span class="brand-mark"></span>SupaClip</a><span class="header-note">Local first. Share by choice.</span><button class="quiet" disabled={recording||!!busy} onclick={library}>{account?'Private library':'Sign in'}</button></header>
 <div class:live={phase==='recording'} class="status-bar" role="status" aria-live="polite">
  <span class="status-dot"></span>
  <span>{phase==='recording'?`Recording · ${formatDuration(seconds)} · ${formatBytes(size)}${microphone?' · Microphone on':' · Microphone off'}`:phase==='asking'?'Waiting for capture permission':phase==='saving'?'Saving your local preview':'Capture is off · Nothing uploads automatically'}</span>
  {#if phase==='recording'}<button class="stop" onclick={()=>capture.stop()}>Stop recording</button>{/if}
 </div>
 <main>
  <nav class="tabs" aria-label="Recorder workspace">
   <button class:active={tab==='record'} onclick={()=>tab='record'}>Recorder</button>
   <button class:active={tab==='local'} disabled={recording||!!busy} onclick={()=>{tab='local';void refreshDrafts();}}>On this browser <span>{drafts.length}</span></button>
   <button class:active={tab==='library'} disabled={recording||!!busy} onclick={library}>Private library</button>
  </nav>
  {#if message}<div class="feedback error" role="alert">{message}<button class="quiet" onclick={()=>message=''} aria-label="Dismiss error">Dismiss</button></div>{/if}
  {#if notice}<div class="feedback" role="status">{notice}</div>{/if}
  {#if tab==='record'}
   <div class="recorder-grid">
    <section class="record-controls" aria-labelledby="record-heading">
     <h1 id="record-heading">Record a screen explanation</h1>
     <p>Choose a tab, window or screen in the browser prompt. Review the video here before anyone else can see it.</p>
     <label class="field">Clip title<input maxlength="100" bind:value={title} disabled={recording||!!busy} placeholder="e.g. How to update the invoice" /></label>
     <label class="check-row"><input type="checkbox" bind:checked={microphone} disabled={recording} /><span>Include microphone<small>Asks for separate microphone permission. System audio is not recorded.</small></span></label>
     <label class="check-row"><input type="checkbox" bind:checked={consent} disabled={recording} /><span>I have permission to record this content and any participants.</span></label>
     {#if phase==='recording'}<button class="primary full stop" onclick={()=>capture.stop()}>Stop and review</button>{:else}<button class="primary full" disabled={!canRecord||!consent||recording||!!busy} onclick={start}>{phase==='asking'?'Choose a surface in the browser…':phase==='saving'?'Saving…':'Choose screen and record'}</button>{/if}
     {#if !canRecord}<p class="hint">Screen capture needs desktop Chrome or Edge, HTTPS, and browser support. On mobile, use the sample or view shared clips.</p>{/if}
     <div class="limits"><span>5 minutes maximum</span><span>50 MB maximum</span><span>Saved chunks stay on this browser</span></div>
     <button class="quiet sample-button" disabled={recording||!!busy} onclick={showSample}>Preview the 10-second sample</button>
    </section>
    <section class="preview-area" aria-labelledby="preview-heading">
     <div class="section-heading"><h2 id="preview-heading">{sample?'Sample preview':current?'Local preview':'Preview'}</h2><span>{sample?'Synthetic video':current?'On this browser':'Private by default'}</span></div>
     <div class="video-frame">
      {#if preview}<video src={preview} controls playsinline onplaying={previewed} onerror={()=>message='This preview could not play. For a local recording, download the saved chunks. For a cloud clip, reopen it from the library.'}><track kind="captions" /></video>
      {:else}<div class="preview-empty"><svg viewBox="0 0 64 48" aria-hidden="true"><rect x="2" y="2" width="60" height="38" rx="4"/><path d="M23 46h18M32 40v6M28 13l12 8-12 8z"/></svg><h3>{phase==='recording'?'Your recording is in progress':'Your preview appears after you stop'}</h3><p>{phase==='recording'?'Use the visible stop control when you are ready.':'Try the sample or record a selected surface. No account is needed to download.'}</p></div>{/if}
     </div>
     {#if current && blob && !sample}
      <div class="preview-actions"><a class="button" rel="external" href={preview} download={`${(title.trim()||current.title).replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,80)||'supaclip'}.webm`}>Download WebM</a><span>{formatBytes(blob.size)} · {formatDuration(Math.ceil(current.duration))}</span></div>
      <div class="upload-controls"><h3>Keep it private in your library</h3><p>Uploading sends this video to private cloud storage. It does not create a public link.</p>
       {#if account}<label class="check-row"><input type="checkbox" bind:checked={confirmUpload} disabled={!!busy}/><span>I reviewed this clip and want to upload it.</span></label><button class="button" disabled={!confirmUpload||!!busy||recording||!current.complete} onclick={uploadCurrent}>{busy==='Uploading'?`Uploading ${progress}%`:progress>0&&progress<100?'Retry private upload':'Upload private clip'}</button>{#if !current.complete}<p class="hint">Interrupted chunks can be downloaded, but need a complete playable recording before cloud upload.</p>{/if}{:else}<button class="button" disabled={!!busy||recording} onclick={library}>Sign in to upload</button>{/if}
       {#if busy==='Uploading'}<progress value={progress} max="100" aria-label="Upload progress"></progress><p class="hint">{progress===99?'Verifying file bytes and playback format…':'Keep this page open. Failed parts retry once. Your local preview stays saved.'}</p>{/if}
      </div>
     {:else if sample}<p class="hint">Sample mode. Upload and sharing are unavailable for this sample. Nothing was captured.</p>{/if}
    </section>
   </div>
  {:else if tab==='local'}
   <section class="list-section"><h1>Recordings on this browser</h1><p>Saved locally without an account. Browser storage can be cleared or evicted; download files you need to keep.</p>
    {#if !draftsLoaded}<p>Loading saved recordings…</p>{:else if !drafts.length}<div class="empty-state"><h2>No saved recordings yet</h2><p>Record a selected screen to save chunks here, then preview or download.</p><button class="button" onclick={()=>tab='record'}>Open recorder</button></div>{:else}
     {#each drafts as draft (draft.id)}<article class="clip-row"><div><h2>{draft.title}</h2><p>{new Date(draft.created).toLocaleString()} · {formatBytes(draft.size)} · {draft.complete?'Stopped and saved':'Interrupted recording'}</p></div><div class="row-actions"><button class="button" disabled={!!busy} onclick={()=>openDraft(draft)}>{draft.complete?'Preview':'Recover chunks'}</button>{#if deleteId===draft.id}<button class="danger" disabled={!!busy} onclick={()=>deleteLocal(draft)}>Confirm delete browser copy</button><button class="quiet" onclick={()=>deleteId=''}>Cancel</button>{:else}<button class="quiet" disabled={!!busy} onclick={()=>deleteId=draft.id}>Delete browser copy</button>{/if}</div></article>{/each}
    {/if}
   </section>
  {:else}
   <section class="list-section"><div class="section-heading"><h1>Private clip library</h1>{#if account}<button class="quiet" disabled={!!busy} onclick={()=>task('Signing out',async()=>{await api('sign-out',{});account='';clips=[];shareInfo=null;})}>Sign out</button>{/if}</div>
    {#if !account}
     <div class="auth-section"><h2>Sign in with an email code</h2><p>Local recording is free of account requirements. Sign in to host up to 20 private clips and create revocable seven-day links.</p>
      {#if !cloudReady}<p class="feedback">Cloud hosting is not configured on this deployment. Record, preview and download locally.</p>{:else}<form onsubmit={(event)=>{event.preventDefault();void(sent?verify():signIn());}}><label class="field">Email<input type="email" bind:value={email} maxlength="254" autocomplete="email" required disabled={!!busy||sent}/></label>{#if sent}<label class="field">Email code<input inputmode="numeric" pattern={'[0-9]{6,8}'} bind:value={code} autocomplete="one-time-code" minlength="6" maxlength="8" required/></label>{/if}<button class="button" disabled={!!busy}>{busy||(sent?'Verify and sign in':'Send sign-in code')}</button>{#if sent}<button type="button" class="quiet" disabled={!!busy} onclick={()=>{sent=false;code='';}}>Change email or request new code</button>{/if}</form>{/if}
     </div>
    {:else}
     <div class="library-toolbar"><p>{account} · {billingMode==='pilot'?'Free pilot':'USD 8 per month'} · 20 retained clips maximum</p><button class="quiet" disabled={!!busy} onclick={()=>task('Refreshing library',loadLibrary)}>Refresh</button>{#if billingMode==='paid'}<button class="button" disabled={!!busy} onclick={()=>task('Opening checkout',async()=>{const result=await api('checkout',{});location.assign(result.url);})}>Subscribe for USD 8/month</button>{/if}</div>
     <p class="hint">Clips start private. Creating a link lets anyone who receives it view the video for seven days. Replacing a link invalidates the previous link.</p>
     {#if !libraryLoaded}<p>{busy||'Library could not load. Use Refresh to retry.'}</p>{:else if !clips.length}<div class="empty-state"><h2>Your library is empty</h2><p>Record a clip, review it and explicitly upload it. Nothing from this browser uploads on sign-in.</p><button class="button" onclick={()=>tab='record'}>Record a clip</button></div>{:else}
      {#each clips as clip (clip.id)}<article class="clip-row"><div><h2>{clip.title}</h2><p>{formatBytes(clip.size)} · {formatDuration(Math.ceil(clip.duration))} · {clip.status==='ready'?(clip.share&&!clip.share.revoked_at&&Date.parse(clip.share.expires_at)>Date.now()?'Shared until '+new Date(clip.share.expires_at).toLocaleString():'Private'):'Incomplete upload: retry from local preview or delete'}</p></div><div class="row-actions">{#if clip.status==='ready'}<button class="button" disabled={!!busy} onclick={()=>playClip(clip)}>Play</button><button class="button" disabled={!!busy} onclick={()=>downloadClip(clip)}>Download</button><button class="button" disabled={!!busy} onclick={()=>createShare(clip)}>{clip.share?'Replace 7-day link':'Create 7-day link'}</button>{#if clip.share&&!clip.share.revoked_at}<button class="quiet" disabled={!!busy} onclick={()=>revoke(clip)}>Revoke link</button>{/if}{/if}
       {#if deleteId===clip.id}<button class="danger" disabled={!!busy} onclick={()=>removeCloud(clip)}>Confirm cloud deletion</button><button class="quiet" onclick={()=>deleteId=''}>Cancel</button>{:else}<button class="quiet" disabled={!!busy} onclick={()=>deleteId=clip.id}>Delete cloud clip</button>{/if}
      </div></article>{/each}
     {/if}
     {#if shareInfo}<div class="share-details"><h2>Link created</h2><p>Anyone with this link can view this clip until {new Date(shareInfo.expiresAt).toLocaleString()}. Revoke it from the clip row. Existing media URLs expire within 60 seconds.</p><label class="field">Share link<input value={shareInfo.url} readonly /></label><button class="button" disabled={!!busy} onclick={copyShare}>Copy share link</button></div>{/if}
    {/if}
   </section>
  {/if}
 </main>
 <footer>WebM recording · Your capture surface is chosen by you · Cloud upload is always explicit</footer>
</div>
