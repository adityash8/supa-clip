import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { Clips, type Clip } from '../src/lib/server/clips';
import { verifyMedia } from '../src/lib/server/media';
import { identity } from '../src/lib/server/auth';
import { requireHosting, checkout, billingEvent } from '../src/lib/server/billing';
import Stripe from 'stripe';
const bytes = new Uint8Array(await readFile('static/sample.webm'));
const owner = '11111111-1111-4111-8111-111111111111';
const foreign = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const clip: Clip = {id,owner_id:owner,title:'Synthetic sample',size:bytes.length,duration:10,status:'uploading',created_at:new Date().toISOString(),fingerprint:createHash('sha256').update(bytes).digest('hex')};
function fake(options: {clip?:Clip|null; expired?:boolean; revoked?:boolean; missing?:boolean; purgeFail?:boolean; finalizeFail?:boolean}={}) {
 const row = options.clip===undefined?{...clip}:options.clip;
 let tombstone=false; let signed=0; const calls:string[]=[];
 const client=createClient('https://unit.supabase.co','unit-test-key',{auth:{persistSession:false},global:{fetch:async(input,init)=>{
  const url=new URL(String(input));const method=init?.method??'GET';calls.push(`${method} ${url.pathname}`);
  const respond=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
  if(url.pathname==='/rest/v1/supaclip_clips') {
   if(url.searchParams.get('owner_id') && url.searchParams.get('owner_id')!==`eq.${row?.owner_id}`)return respond(null);
   if(url.searchParams.get('status')==='eq.ready' && row?.status!=='ready')return respond(null);
   return respond(row);
  }
  if(url.pathname==='/rest/v1/supaclip_upload_sessions')return respond({expires_at:new Date(Date.now()+(options.expired?-1:60000)).toISOString()});
  if(url.pathname==='/rest/v1/supaclip_share_tokens')return respond({clip_id:id,expires_at:new Date(Date.now()+(options.expired?-1:60000)).toISOString(),revoked_at:options.revoked?'revoked':null});
  if(url.pathname.includes('/rpc/supaclip_delete')){tombstone=true;if(row)row.status='deleted';return respond(true);}
  if(url.pathname.includes('/rpc/supaclip_finalize')){if(!options.finalizeFail&&row)row.status='ready';return respond(!options.finalizeFail);}
  if(url.pathname.includes('/object/list/'))return respond(options.missing?[]:[{name:'0',metadata:{size:bytes.length}}]);
  if(url.pathname.includes('/object/sign/')){assert.equal(JSON.parse(String(init?.body)).expiresIn,60);signed++;return respond({signedURL:'/signed-test-only'});}
  if(method==='DELETE') {if(url.pathname.includes('/object/supaclip_media')) assert.equal(tombstone,true,'access must be revoked before purge');return options.purgeFail?respond({message:'failed'},500):respond([]);}
  if(method==='GET' && url.pathname.includes('/object/supaclip_parts/'))return new Response(bytes,{headers:{'content-type':'application/octet-stream'}});
  if(method==='POST'&&url.pathname.includes('/object/supaclip_media/'))return respond({Key:'test'});
  return respond({message:'Unexpected provider path'},500);
 }}});
 return {service:new Clips(client),client,calls,get signed(){return signed;}};
}
test('real WebM signature, hash, tracks and duration verified; spoofed or oversized payload denied',async()=>{
 const duration=await verifyMedia(bytes,clip);assert.ok(duration>=9.9&&duration<=10.1);
 await assert.rejects(verifyMedia(new Uint8Array(bytes.length),clip));
 await assert.rejects(verifyMedia(bytes,{...clip,size:bytes.length+1}));
 await assert.rejects(verifyMedia(bytes,{...clip,fingerprint:'a'.repeat(64)}));
 const invalid=new Uint8Array(bytes);invalid.fill(0,4);await assert.rejects(verifyMedia(invalid,{...clip,fingerprint:createHash('sha256').update(invalid).digest('hex')}));
});
test('foreign and incomplete playback requests never issue signed URLs',async()=>{
 const test=fake();await assert.rejects(test.service.playback(id,foreign));await assert.rejects(test.service.playback(id,owner));assert.equal(test.signed,0);
});
test('missing/expired upload cannot finalize and does not produce final media',async()=>{
 for(const config of [{missing:true},{expired:true}]) { const test=fake(config);await assert.rejects(test.service.finalize(id,owner));assert.equal(test.calls.some(c=>c.includes('POST /storage/v1/object/supaclip_media')),false); }
});
test('verified assembled media becomes private playable clip',async()=>{
 const test=fake();const result=await test.service.finalize(id,owner);assert.equal(result.status,'ready');await test.service.playback(id,owner);assert.equal(test.signed,1);
});
test('expired/revoked links cannot issue a signed URL',async()=>{
 for(const config of [{expired:true},{revoked:true},{clip:{...clip,status:'deleted'}}]) {const test=fake(config);await assert.rejects(test.service.view('a'.repeat(43)));assert.equal(test.signed,0);}
});
test('failed physical delete leaves a tombstone, without issuing media URLs',async()=>{
 const test=fake({clip:{...clip,status:'ready'},purgeFail:true});await assert.rejects(test.service.remove(id,owner));await assert.rejects(test.service.playback(id,owner));assert.equal(test.signed,0);
});
test('auth verifies server identity and confirmed email instead of a caller ID',async()=>{
 const cookies={get:()=> 'untrusted'} as any;
 await assert.rejects(identity({auth:{getUser:async()=>({error:null,data:{user:{id:foreign,email_confirmed_at:null}}})}} as any,cookies,true));
 const user=await identity({auth:{getUser:async()=>({error:null,data:{user:{id:owner,email_confirmed_at:'confirmed'}}})}} as any,cookies,true);assert.equal(user.id,owner);
});
test('paid gate fails closed; pilot never claims paid entitlement',async()=>{
 const provider={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{active_until:new Date(0).toISOString()},error:null})})})})} as any;
 await assert.rejects(requireHosting(provider,owner,'paid'));await requireHosting(provider,owner,'pilot');await assert.rejects(requireHosting(provider,owner,'unknown'));
});
test('checkout checks price and never creates entitlement from return URL',async()=>{
 let checkouts=0;
 const stripe={prices:{retrieve:async()=>({id:'price',unit_amount:900,currency:'usd',recurring:{interval:'month',interval_count:1}})},checkout:{sessions:{create:async()=>{checkouts++;return {url:'https://checkout.stripe.com/test'};}}}} as any;
 await assert.rejects(checkout(stripe,{STRIPE_PRICE_ID:'price'},owner,'https://app.test'));assert.equal(checkouts,0);
});
test('Stripe webhook signature rejects forgery and unpaid invoice never activates subscription',async()=>{
 const stripe=new Stripe('unit-test-key');const payload=JSON.stringify({id:'evt_test',type:'customer.subscription.updated',data:{object:{id:'sub_test'}}});
 assert.throws(()=>stripe.webhooks.constructEvent(payload,'invalid','test-signing-secret'));
 const header=Stripe.webhooks.generateTestHeaderString({payload,secret:'test-signing-secret'});
 const event=stripe.webhooks.constructEvent(payload,header,'test-signing-secret');
 let saved:any;
 const fakeStripe={subscriptions:{retrieve:async()=>({id:'sub_test',customer:'cus_test',status:'active',metadata:{product:'supaclip',supaclip_user:owner},items:{data:[{price:{id:'price'},current_period_end:Math.floor(Date.now()/1000)+86400}]},latest_invoice:{status:'open'}})}} as any;
 const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})}),upsert:async(row:unknown)=>{saved=row;return {data:null,error:null};}})} as any;
 await billingEvent(fakeStripe,db,event,'price');assert.equal(Date.parse(saved.active_until),0);
});

test('cloud download needs verified ownership and remains available without billing entitlement',async()=>{
 const test=fake({clip:{...clip,status:'ready'}});await assert.rejects(test.service.download(id,foreign));assert.equal(test.signed,0);
 const result=await test.service.download(id,owner);assert.equal(result.expiresIn,60);assert.ok(result.url.includes('download='));
});
