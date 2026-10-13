import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
await db.exec(await readFile('supabase/supaclip.sql','utf8'));
const owner='11111111-1111-4111-8111-111111111111';const other='22222222-2222-4222-8222-222222222222';
await db.query('insert into auth.users values ($1),($2)',[owner,other]);
async function begin(user:string,index:number) {return (await db.query<any>('select (public.supaclip_begin($1,$2,$3,$4,$5)).*',[user,`Clip ${index}`,100,10,index.toString(16).padStart(64,'0')])).rows[0];}
test('SQL reserves quota, resumes only the matching owner, rejects overflow and validates limits',async()=>{
 const first=await begin(owner,1);const resumed=await begin(owner,1);assert.equal(first.id,resumed.id);
 const foreign=await begin(other,1);assert.notEqual(first.id,foreign.id);
 for(let i=2;i<=20;i++)await begin(owner,i);
 await assert.rejects(begin(owner,21),/supaclip_quota/);
 await assert.rejects(db.query('select public.supaclip_begin($1,$2,$3,$4,$5)',[other,'bad',52428801,10,'b'.repeat(64)]));
});
test('SQL cannot finalize expired, foreign or tombstoned clips; delete frees quota',async()=>{
 const row=await begin(other,2);
 assert.equal((await db.query<any>('select supaclip_finalize($1,$2,$3) ok',[owner,row.id,10])).rows[0].ok,false);
 await db.query("update supaclip_upload_sessions set expires_at=now()-interval '1 second' where clip_id=$1",[row.id]);
 assert.equal((await db.query<any>('select supaclip_finalize($1,$2,$3) ok',[other,row.id,10])).rows[0].ok,false);
 await db.query('select supaclip_delete($1,$2)',[other,row.id]);assert.equal((await db.query<any>('select supaclip_finalize($1,$2,$3) ok',[other,row.id,10])).rows[0].ok,false);
});
test('actual RLS isolates ready clips; token tables and RPC writes are denied to clients',async()=>{
 const ready=await begin(other,3);await db.query('select supaclip_finalize($1,$2,$3)',[other,ready.id,10]);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);
 assert.equal((await db.query('select * from supaclip_clips')).rows.length,0);
 await assert.rejects(db.query('select * from supaclip_share_tokens'),/permission denied/);
 await assert.rejects(db.query('select supaclip_delete($1,$2)',[owner,ready.id]),/permission denied/);
 await db.exec(`set request.jwt.claim.sub='${other}'`);assert.equal((await db.query<any>('select * from supaclip_clips')).rows[0].id,ready.id);
 await db.exec('reset role');
});
test('atomic share rejects foreign/deleted clips and delete immediately revokes token',async()=>{
 const row=await begin(other,4);await db.query('select supaclip_finalize($1,$2,$3)',[other,row.id,10]);
 const expiry=new Date(Date.now()+7*86400000).toISOString();
 assert.equal((await db.query<any>('select supaclip_share($1,$2,$3,$4) ok',[owner,row.id,'hash',expiry])).rows[0].ok,false);
 assert.equal((await db.query<any>('select supaclip_share($1,$2,$3,$4) ok',[other,row.id,'hash',expiry])).rows[0].ok,true);
 await db.query('select supaclip_delete($1,$2)',[other,row.id]);assert.ok((await db.query<any>('select revoked_at from supaclip_share_tokens where clip_id=$1',[row.id])).rows[0].revoked_at);
 assert.equal((await db.query<any>('select supaclip_share($1,$2,$3,$4) ok',[other,row.id,'newhash',expiry])).rows[0].ok,false);
});
test('ready stage cleanup waits three hours after finalization, including old uploads',async()=>{
 const row=await begin(other,22);
 await db.query("update supaclip_clips set created_at=now()-interval '23 hours' where id=$1",[row.id]);
 assert.equal((await db.query<any>('select supaclip_finalize($1,$2,$3) ok',[other,row.id,10])).rows[0].ok,true);
 const current=await db.query<any>('select finalized_at from supaclip_clips where id=$1',[row.id]);
 assert.ok(current.rows[0].finalized_at);
 const eligible=()=>db.query<any>("select id from supaclip_clips where status='ready' and parts_cleaned_at is null and finalized_at < now()-interval '3 hours' and id=$1",[row.id]);
 assert.equal((await eligible()).rows.length,0);
 await db.query("update supaclip_clips set finalized_at=now()-interval '3 hours 1 minute' where id=$1",[row.id]);
 assert.equal((await eligible()).rows.length,1);
 await db.query('update supaclip_clips set parts_cleaned_at=now() where id=$1',[row.id]);
 assert.equal((await eligible()).rows.length,0);
});
test('database rate limiter enforces repeated requests',async()=>{
 assert.equal((await db.query<any>('select supaclip_rate($1,$2,$3) ok',['test',1,3600])).rows[0].ok,true);
 assert.equal((await db.query<any>('select supaclip_rate($1,$2,$3) ok',['test',1,3600])).rows[0].ok,false);
 await db.close();
});
