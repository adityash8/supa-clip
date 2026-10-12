import { test, expect, type Page } from '@playwright/test';
async function setup(page:Page,options:{deny?:boolean;micDeny?:boolean;autoStop?:boolean}={}) {
 await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Cloud library is not configured yet. Record and download locally.'})}));
 await page.addInitScript(({deny,micDeny,autoStop})=>{
  const state={display:0,mic:0,stopped:0};(window as any).__capture=state;
  if(autoStop){const timeout=window.setTimeout;window.setTimeout=((fn:any,delay?:number,...args:any[])=>timeout(fn,delay===299000?2200:delay,...args)) as any;}
  const trackStop=(stream:MediaStream)=>{stream.getTracks().forEach(track=>{const stop=track.stop.bind(track);track.stop=()=>{state.stopped++;stop();};});return stream;};
  navigator.mediaDevices.getDisplayMedia=async()=>{
   state.display++;if(deny)throw new DOMException('Cancelled','NotAllowedError');
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
   const ctx=canvas.getContext('2d')!;let n=0;
   const draw=()=>{ctx.fillStyle='#18181b';ctx.fillRect(0,0,640,360);ctx.fillStyle='#f87171';ctx.fillRect(n++%500,100,100,100);ctx.fillStyle='white';ctx.font='24px sans-serif';ctx.fillText('Synthetic acceptance recording',40,40);};draw();setInterval(draw,66);
   return trackStop(canvas.captureStream(15));
  };
  navigator.mediaDevices.getUserMedia=async()=>{
   state.mic++;if(micDeny)throw new DOMException('Denied','NotAllowedError');
   const audio=new AudioContext();const oscillator=audio.createOscillator();const destination=audio.createMediaStreamDestination();oscillator.connect(destination);oscillator.start();return trackStop(destination.stream);
  };
 },options);
 await page.goto('/');await expect(page.getByRole('heading',{name:'Record a screen explanation'})).toBeVisible();
}
async function record(page:Page,mic=false) {
 await page.getByRole('textbox',{name:'Clip title'}).fill('Synthetic flow test');
 if(mic)await page.getByRole('checkbox',{name:'Include microphone'}).check();
 await page.getByRole('checkbox',{name:'I have permission'}).check();
 await page.getByRole('button',{name:'Choose screen and record'}).click();
 await expect(page.getByRole('button',{name:'Stop recording',exact:true})).toBeVisible();
 await page.waitForTimeout(2300);
}
test('sample plays without capture, upload or link; mobile layout fits',async({page})=>{
 await setup(page);await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Preview the 10-second sample'}).click();
 await expect(page.getByRole('heading',{name:'Sample preview'})).toBeVisible();
 await page.locator('video').evaluate(async(video:HTMLVideoElement)=>{await video.play();});
 await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(0);
 expect(await page.evaluate(()=>(window as any).__capture)).toEqual({display:0,mic:0,stopped:0});
 expect(await page.getByRole('button',{name:'Upload private clip',exact:true}).count()).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'docs/browser-mobile.png',fullPage:true});
});
test('deliberate capture stops tracks, plays locally, downloads and survives reload',async({page})=>{
 await setup(page);await record(page);await page.getByRole('button',{name:'Stop recording',exact:true}).click();
 await expect(page.getByRole('link',{name:'Download WebM'})).toBeVisible();
 await page.locator('video').evaluate(async(video:HTMLVideoElement)=>{await video.play();});
 await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(0);
 expect(await page.evaluate(()=>(window as any).__capture)).toEqual({display:1,mic:0,stopped:1});
 const downloaded=page.waitForEvent('download');await page.getByRole('link',{name:'Download WebM'}).click();expect((await downloaded).suggestedFilename()).toBe('Synthetic flow test.webm');
 await page.screenshot({path:'docs/browser-desktop.png',fullPage:true});
 await page.reload();await page.getByRole('button',{name:/On this browser/}).click();
 await expect(page.getByRole('heading',{name:'Synthetic flow test'})).toBeVisible();await page.getByRole('button',{name:'Preview',exact:true}).click();
 await expect(page.getByRole('link',{name:'Download WebM'})).toBeVisible();
});
test('cancelled permission creates no recording and never requests microphone',async({page})=>{
 await setup(page,{deny:true});await page.getByRole('checkbox',{name:'I have permission'}).check();await page.getByRole('button',{name:'Choose screen and record'}).click();
 await expect(page.getByRole('alert')).toContainText('Capture was cancelled');expect(await page.evaluate(()=>(window as any).__capture.mic)).toBe(0);
 await expect(page.getByRole('button',{name:'Stop recording',exact:true})).toHaveCount(0);
});
test('optional mic needs separate consent and both tracks stop',async({page})=>{
 await setup(page);await record(page,true);await expect(page.getByRole('status').first()).toContainText('Microphone on');
 await page.getByRole('button',{name:'Stop recording',exact:true}).click();await expect(page.getByRole('link',{name:'Download WebM'})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__capture)).toEqual({display:1,mic:1,stopped:2});
});
test('mic denial releases already selected screen',async({page})=>{
 await setup(page,{micDeny:true});await page.getByRole('checkbox',{name:'Include microphone'}).check();await page.getByRole('checkbox',{name:'I have permission'}).check();await page.getByRole('button',{name:'Choose screen and record'}).click();
 await expect(page.getByRole('alert')).toContainText('Capture was cancelled');expect(await page.evaluate(()=>(window as any).__capture.stopped)).toBe(1);
});
test('interrupted saved chunks reload without claiming guaranteed playback',async({page})=>{
 await setup(page);await record(page);page.on('dialog',dialog=>dialog.accept());await page.reload();
 await page.getByRole('button',{name:/On this browser/}).click();await page.getByRole('button',{name:'Recover chunks'}).click();
 await expect(page.getByText(/Playback after an interruption depends/)).toBeVisible();await expect(page.getByRole('link',{name:'Download WebM'})).toBeVisible();
});
test('recording deadline stops and saves synthetic media',async({page})=>{
 await setup(page,{autoStop:true});await record(page);await expect(page.getByRole('link',{name:'Download WebM'})).toBeVisible();
 await expect(page.getByRole('alert')).toContainText('five-minute limit');expect(await page.evaluate(()=>(window as any).__capture.stopped)).toBe(1);
});
test('private upload failure keeps local preview and download',async({page})=>{
 await setup(page);await page.unroute('**/api/**');
 await page.route('**/api/**',route=>{
  const action=new URL(route.request().url()).pathname;
  const data=action.endsWith('/session')?{email:'synthetic@example.test',billingMode:'pilot'}:action.endsWith('/clips')?{clips:[]}:action.endsWith('/begin')?{id:'33333333-3333-4333-8333-333333333333'}:null;
  return route.fulfill({status:data?200:503,contentType:'application/json',body:JSON.stringify(data??{message:'Upload part failed. Retry from your local recording.'})});
 });
 await page.reload();await record(page);await page.getByRole('button',{name:'Stop recording',exact:true}).click();await page.getByRole('checkbox',{name:'I reviewed this clip'}).check();await page.getByRole('button',{name:'Upload private clip',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Upload part failed');await expect(page.getByRole('link',{name:'Download WebM'})).toBeVisible();
});
test('storage failure prevents capture and releases tracks',async({page})=>{
 await setup(page);await page.evaluate(()=>{const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args:any[]){if(args[1]==='readwrite')throw new Error('Synthetic storage is full');return original.apply(this,args as any);};});
 await page.getByRole('checkbox',{name:'I have permission'}).check();await page.getByRole('button',{name:'Choose screen and record'}).click();await expect(page.getByRole('alert')).toContainText('storage is full');expect(await page.evaluate(()=>(window as any).__capture.stopped)).toBe(1);
});
test('email code, empty library, explicit verified upload, sharing, revocation and safe deletion connect',async({page})=>{
 await setup(page);await page.unroute('**/api/**');let signedIn=false;let uploaded=false;let shared=false;let revoked=false;let deleted=false;let uploadParts=0;
 const clip={id:'33333333-3333-4333-8333-333333333333',title:'Synthetic flow test',duration:3,size:10000,status:'ready',created_at:new Date().toISOString()};
 await page.route('**/synthetic-part',async route=>{uploadParts++;expect(route.request().method()).toBe('PUT');expect(route.request().postDataBuffer()!.length).toBeLessThanOrEqual(5*1024*1024);await route.fulfill({status:200,body:'{}'});});
 await page.route('**/api/**',async route=>{
  const action=new URL(route.request().url()).pathname.split('/').pop();let data:any={};let status=200;
  if(action==='session'){data=signedIn?{email:'synthetic@example.test',billingMode:'pilot'}:{message:'Sign in'};status=signedIn?200:401;}
  if(action==='sign-in')data={sent:true};if(action==='verify'){signedIn=true;data={signedIn:true};}
  if(action==='clips')data={clips:uploaded&&!deleted?[{...clip,share:shared?{expires_at:new Date(Date.now()+7*86400000).toISOString(),revoked_at:revoked?new Date().toISOString():null}:null}]:[]};
  if(action==='begin')data={id:clip.id};if(action==='part')data={existing:false,url:'http://127.0.0.1:1420/synthetic-part'};
  if(action==='finalize'){uploaded=true;data={...clip};}
  if(action==='share'){shared=true;data={token:'a'.repeat(43),expiresAt:new Date(Date.now()+7*86400000).toISOString()};}
  if(action==='revoke'){revoked=true;data={revoked:true};}if(action==='delete'){deleted=true;data={deleted:true};}
  if(action==='view'){status=404;data={message:'This link is unavailable, expired or revoked.'};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.reload();await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('textbox',{name:'Email',exact:true}).fill('synthetic@example.test');await page.getByRole('button',{name:'Send sign-in code'}).click();
 await page.getByRole('textbox',{name:'Email code'}).fill('123456');await page.getByRole('button',{name:'Verify and sign in'}).click();await expect(page.getByRole('heading',{name:'Your library is empty'})).toBeVisible();
 await page.getByRole('button',{name:'Record a clip',exact:true}).click();await record(page);await page.getByRole('button',{name:'Stop recording',exact:true}).click();await expect(page.getByRole('link',{name:'Download WebM'})).toBeVisible();expect(uploadParts).toBe(0);
 await page.getByRole('checkbox',{name:'I reviewed this clip'}).check();await page.getByRole('button',{name:'Upload private clip',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Upload verified'})).toBeVisible();expect(uploadParts).toBe(1);
 await page.getByRole('button',{name:'Private library',exact:true}).first().click();await expect(page.getByRole('heading',{name:'Synthetic flow test'})).toBeVisible();await page.getByRole('button',{name:'Create 7-day link'}).click();await expect(page.getByRole('heading',{name:'Link created'})).toBeVisible();await expect(page.getByText(/Anyone with this link can view/)).toBeVisible();
 await page.getByRole('button',{name:'Revoke link',exact:true}).click();await expect(page.getByText(/Link revoked/)).toBeVisible();await page.getByRole('button',{name:'Delete cloud clip'}).click();expect(deleted).toBe(false);await page.getByRole('button',{name:'Confirm cloud deletion'}).click();await expect(page.getByRole('heading',{name:'Your library is empty'})).toBeVisible();
 await page.goto('/share#'+'a'.repeat(43));await expect(page.getByRole('alert')).toContainText('expired or revoked');
});
