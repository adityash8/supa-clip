import { saveDraft, type Draft, draftBlob } from './drafts';
const MAX_BYTES = 50 * 1024 * 1024;
export interface CaptureCallbacks {
 state: (state: 'asking'|'recording'|'saving'|'idle') => void;
 progress: (seconds: number, bytes: number) => void;
 finish: (draft: Draft, blob: Blob) => void;
 error: (message: string) => void;
}
export function supported() {
 return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia &&
 ['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm'].some(t=>MediaRecorder.isTypeSupported(t));
}
export class Capture {
 private tracks: MediaStreamTrack[] = [];
 private recorder: MediaRecorder | null = null;
 private timer: ReturnType<typeof setInterval> | undefined;
 private deadline: ReturnType<typeof setTimeout> | undefined;
 private queue = Promise.resolve();
 private started = 0;
 private active = false;
 private disposed = false;
 constructor(private callbacks: CaptureCallbacks) {}
 async start(microphone: boolean, title: string) {
  if (this.active) return;
  if (!supported()) { this.callbacks.error('Screen capture is unavailable here. Use desktop Chrome or Edge over HTTPS. You can still play the sample.'); return; }
  this.active = true; this.callbacks.state('asking');
  try {
   // First operation is the deliberate browser surface picker, called from the user's click.
   const display = await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30}, audio:false});
   this.tracks.push(...display.getTracks());
   if(this.disposed) { this.release(); return; }
   if (microphone) {
    const mic = await navigator.mediaDevices.getUserMedia({video:false,audio:true});
    this.tracks.push(...mic.getTracks());
    if(this.disposed) { this.release(); return; }
   }
   const mime = ['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))!;
   const draft: Draft = {id:crypto.randomUUID(),title:title.trim() || 'Screen recording',created:Date.now(),mime,chunks:[],size:0,duration:0,complete:false};
   await saveDraft(draft);
   if(this.disposed) { this.release(); return; } // Refuse to start capture without a durable store.
   const recorder = new MediaRecorder(new MediaStream(this.tracks),{mimeType:mime,videoBitsPerSecond:1500000,audioBitsPerSecond:64000});
   this.recorder = recorder; this.started = Date.now();
   let intact=true;
   recorder.ondataavailable = (event) => {
    if (!event.data.size) return;
    if (Date.now()-this.started > 300000) { intact=false; this.callbacks.error('The time limit was reached while the page was paused. The final chunk was omitted. Review or download the retained recording.'); this.stop(); return; }
    if (draft.size + event.data.size > MAX_BYTES) { intact=false; this.callbacks.error('The 50 MB limit was reached. The last oversized chunk was omitted. Check playback and download the retained video.'); this.stop(); return; }
    draft.chunks.push(event.data); draft.size+=event.data.size;
    draft.duration=Math.min(300,(Date.now()-this.started)/1000);
    const snapshot = {...draft,chunks:[...draft.chunks]};
    this.queue = this.queue.then(()=>saveDraft(snapshot)).catch(()=> { this.callbacks.error('Local chunk save failed. Download the preview now; earlier saved chunks remain available after reload.'); this.stop(); });
   };
   recorder.onerror = () => { intact=false; this.callbacks.error('Recording stopped because the browser could not encode it. Check the retained preview and download.'); this.stop(); };
   recorder.onstop = async () => {
    this.release(); this.callbacks.state('saving');
    await this.queue;
    draft.complete=intact; draft.duration=Math.min(300,(Date.now()-this.started)/1000);
    try { await saveDraft(draft); } catch { this.callbacks.error('The final local save failed. Download the preview before leaving.'); }
    this.callbacks.finish(draft,draftBlob(draft)); this.callbacks.state('idle'); this.active=false;
   };
   display.getVideoTracks()[0].onended=()=>this.stop();
   recorder.start(1000);
   this.callbacks.state('recording');
   this.timer=setInterval(()=>this.callbacks.progress(Math.floor((Date.now()-this.started)/1000),draft.size),250);
   this.deadline=setTimeout(()=>{ this.callbacks.error('The five-minute limit was reached. Review and download your clip.'); this.stop(); },299000);
  } catch(error) {
   this.release(); this.active=false; this.callbacks.state('idle');
   const name = error instanceof DOMException ? error.name : '';
   this.callbacks.error(name === 'NotAllowedError' || name === 'AbortError' ? 'Capture was cancelled or permission was denied. Nothing was uploaded. Choose a surface again when ready.' : name === 'NotFoundError' ? 'No microphone was found. Turn microphone off and try again.' : error instanceof Error ? error.message : 'Capture could not start. Check browser permissions and try again.');
  }
 }
 dispose() { this.disposed=true; this.stop(); }
 stop() {
  if (this.recorder?.state === 'recording') this.recorder.stop();
  this.release();
 }
 private release() {
  for(const track of this.tracks) track.stop(); this.tracks=[];
  if(this.timer) clearInterval(this.timer);
  if(this.deadline) clearTimeout(this.deadline);
 }
}
