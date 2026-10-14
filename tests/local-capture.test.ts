import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Capture } from '../src/lib/web/capture';
import { listDrafts, saveDraft, removeDraft, draftBlob, type Draft } from '../src/lib/web/drafts';
const media=new Blob([await readFile('static/sample.webm')],{type:'video/webm'});
let stopped=0;let micAsked=0;let deny=false;let micDeny=false;let selectedResolve:((stream:any)=>void)|null=null;
function stream() {const track={onended:null,stop:()=>{stopped++;}};return {getTracks:()=>[track],getVideoTracks:()=>[track]};}
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{
 getDisplayMedia:async()=>{if(deny)throw new DOMException('Denied','NotAllowedError');if(selectedResolve!==null)return new Promise(resolve=>{selectedResolve=resolve;});return stream();},
 getUserMedia:async()=>{micAsked++;if(micDeny)throw new DOMException('Denied','NotAllowedError');return stream();}
}}});
class Recorder {
 static current:Recorder;
 static isTypeSupported(){return true;}
 state='inactive';ondataavailable:any;onstop:any;onerror:any;
 constructor(){Recorder.current=this;}
 start(){this.state='recording';}
 emit(blob:Blob){this.ondataavailable?.({data:blob});}
 stop(){this.state='inactive';queueMicrotask(()=>{this.emit(media);void this.onstop?.();});}
}
Object.defineProperty(globalThis,'MediaRecorder',{value:Recorder,configurable:true});
Object.defineProperty(globalThis,'MediaStream',{value:class{constructor(public tracks:any[]){}},configurable:true});
function capture() {
 const states:string[]=[];const errors:string[]=[];let finish!:(draft:Draft)=>void;
 const done=new Promise<Draft>(resolve=>finish=resolve);
 const recorder=new Capture({state:s=>states.push(s),progress:()=>{},error:e=>errors.push(e),finish:d=>finish(d)});
 return {recorder,states,errors,done};
}
function reset(){stopped=0;micAsked=0;deny=false;micDeny=false;selectedResolve=null;}
test('local chunks persist complete data and can be reloaded and deleted',async()=>{
 reset();const test=capture();await test.recorder.start(false,'Local synthetic');Recorder.current.emit(media);test.recorder.stop();
 const draft=await test.done;assert.equal(stopped,1);assert.equal(micAsked,0);assert.equal(draft.complete,true);
 const stored=(await listDrafts()).find(row=>row.id===draft.id)!;assert.equal(draftBlob(stored).size,media.size*2);
 await removeDraft(stored.id);assert.equal((await listDrafts()).some(row=>row.id===stored.id),false);
});
test('permission cancellation stays inactive and creates no new saved draft',async()=>{
 reset();deny=true;const before=(await listDrafts()).length;const test=capture();await test.recorder.start(true,'Cancelled');
 assert.equal(micAsked,0);assert.deepEqual(test.states,['asking','idle']);assert.equal((await listDrafts()).length,before);
});
test('microphone denial stops the already selected screen track',async()=>{
 reset();micDeny=true;const test=capture();await test.recorder.start(true,'Mic denied');assert.equal(stopped,1);assert.equal(micAsked,1);assert.ok(test.errors[0].includes('cancelled'));
});
test('encode failure retains earlier chunks, marks interruption and stops all tracks',async()=>{
 reset();const test=capture();await test.recorder.start(true,'Encode failure');Recorder.current.emit(media);Recorder.current.onerror();const draft=await test.done;
 assert.equal(stopped,2);assert.equal(draft.complete,false);assert.ok(draft.size>0);
});
test('50 MB boundary is retained, oversized chunk omitted and capture stops',async()=>{
 reset();const test=capture();await test.recorder.start(false,'Size cap');Recorder.current.emit(new Blob([new Uint8Array(50*1024*1024)]));Recorder.current.emit(new Blob(['one-byte-over']));
 const draft=await test.done;assert.equal(draft.size,50*1024*1024);assert.equal(draft.complete,false);assert.equal(stopped,1);assert.ok(test.errors.some(e=>e.includes('50 MB')));
 await removeDraft(draft.id);
});
test('durable write failure retains in-memory preview and stops recording',async()=>{
 reset();const test=capture();await test.recorder.start(false,'Quota failure');
 const original=IDBDatabase.prototype.transaction;
 IDBDatabase.prototype.transaction=function(){throw new DOMException('Quota exhausted','QuotaExceededError');} as any;
 try {Recorder.current.emit(media);const draft=await test.done;assert.ok(draft.size>0);assert.equal(stopped,1);assert.ok(test.errors.some(e=>e.includes('save failed')));}
 finally{IDBDatabase.prototype.transaction=original;}
});
test('page disposal while permission picker is pending releases subsequently acquired track',async()=>{
 reset();selectedResolve=()=>{};const test=capture();const starting=test.recorder.start(false,'Disposed');test.recorder.dispose();
 selectedResolve!(stream());await starting;assert.equal(stopped,1);
});
test('persisted interrupted chunks stay marked incomplete',async()=>{
 const draft:Draft={id:crypto.randomUUID(),title:'Interrupted',created:Date.now(),mime:'video/webm',chunks:[media],size:media.size,duration:3,complete:false};
 await saveDraft(draft);const stored=(await listDrafts()).find(row=>row.id===draft.id)!;assert.equal(stored.complete,false);assert.equal(stored.chunks.length,1);await removeDraft(draft.id);
});
