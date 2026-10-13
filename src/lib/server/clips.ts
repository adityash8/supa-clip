import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, BUCKET, PART_BUCKET, partPath, mediaPath, partSize, PART_BYTES, ownsPlayable, validShare, newShare, tokenHash, validateUpload } from './domain';
import { verifyMedia } from './media';
import { dbResult, requiredResult } from './provider';
export interface Clip {
 id: string; owner_id: string; title: string; size: number; duration: number;
 fingerprint: string; status: string; created_at: string; deleted_at?: string;
}
export class Clips {
 constructor(private admin: SupabaseClient) {}
 async owned(id: string, owner: string, ready = false): Promise<Clip> {
  const clip = dbResult(await this.admin.from('supaclip_clips').select('*').eq('id', id).eq('owner_id', owner).maybeSingle()) as Clip | null;
  if (!clip || (ready && !ownsPlayable(clip, owner))) throw new AppError(404, 'Clip is unavailable.');
  return clip;
 }
 async begin(owner: string, value: unknown) {
  const data = validateUpload(value);
  return dbResult(await this.admin.rpc('supaclip_begin', { p_owner: owner, p_title: data.title, p_size: data.size, p_duration: data.duration, p_fingerprint: data.fingerprint })) as Clip;
 }
 async pending(id: string, owner: string) {
  const clip = await this.owned(id, owner);
  const session = dbResult(await this.admin.from('supaclip_upload_sessions').select('expires_at').eq('clip_id', id).maybeSingle());
  if (clip.status !== 'uploading' || !session || Date.parse(session.expires_at) <= Date.now()) throw new AppError(409, 'This upload session is closed. Delete the pending upload and retry from your local file.');
  return clip;
 }
 async parts(clip: Clip) {
  return requiredResult(await this.admin.storage.from(PART_BUCKET).list(`${clip.owner_id}/${clip.id}/parts`, { limit: 10 }));
 }
 async uploadPart(id: string, owner: string, part: number) {
  const clip = await this.pending(id, owner);
  const size = partSize(clip.size, part);
  const existing = (await this.parts(clip)).find(p => p.name === String(part));
  if (existing) {
   if (Number(existing.metadata?.size) !== size) throw new AppError(422, 'An upload part has the wrong size. Delete this pending upload and retry.');
   return { existing: true };
  }
  const signed = requiredResult(await this.admin.storage.from(PART_BUCKET).createSignedUploadUrl(partPath(clip, part), { upsert: false }));
  return { existing: false, url: signed.signedUrl };
 }
 async finalize(id: string, owner: string) {
  const existing = await this.owned(id, owner);
  if (existing.status === 'ready') return { ...existing, newlyFinalized: false };
  const clip = await this.pending(id, owner);
  const parts = await this.parts(clip);
  const count = Math.ceil(clip.size / PART_BYTES);
  if (parts.length !== count || parts.some(p => !/^\d$/.test(p.name) || Number(p.metadata?.size) !== partSize(clip.size, Number(p.name)))) throw new AppError(422, 'Upload is incomplete. Keep your local recording and retry the upload.');
  const bytes = new Uint8Array(clip.size);
  for (let i = 0; i < count; i++) {
   const blob = requiredResult(await this.admin.storage.from(PART_BUCKET).download(partPath(clip, i)));
   if (blob.size !== partSize(clip.size, i)) throw new AppError(422, 'Upload part size changed. Retry from your local file.');
   bytes.set(new Uint8Array(await blob.arrayBuffer()), i * PART_BYTES);
  }
  const duration = await verifyMedia(bytes, clip);
  // Immutable final object. A concurrent finalizer may already have written these verified bytes.
  const upload = await this.admin.storage.from(BUCKET).upload(mediaPath(clip), bytes, { contentType: 'video/webm', upsert: false });
  if (upload.error && String((upload.error as any).statusCode) !== '409') throw new AppError(503, 'Verified upload could not be saved. Retry; your local recording is retained.');
  const ready = dbResult(await this.admin.rpc('supaclip_finalize', { p_owner: owner, p_clip: id, p_duration: duration }));
  if (!ready) {
   const latest = await this.owned(id, owner);
   if (latest.status !== 'ready') { await this.admin.storage.from(BUCKET).remove([mediaPath(clip)]); throw new AppError(409, 'Upload was deleted or expired. It has not been published.'); }
  }
  // Stage objects are private and removed on a best-effort basis; maintenance retries.
  await this.admin.storage.from(PART_BUCKET).remove(Array.from({ length: count }, (_, i) => partPath(clip, i)));
  return { ...clip, duration, status: 'ready', newlyFinalized: !!ready };
 }
 async list(owner: string) {
  const clips = requiredResult(await this.admin.from('supaclip_clips').select('id,title,size,duration,status,created_at').eq('owner_id', owner).neq('status', 'deleted').order('created_at', { ascending: false }).limit(40));
  const ids = clips.map(c => c.id);
  const links = ids.length ? requiredResult(await this.admin.from('supaclip_share_tokens').select('clip_id,expires_at,revoked_at').in('clip_id', ids)) : [];
  return clips.map(c => ({ ...c, share: links.find(s => s.clip_id === c.id) ?? null }));
 }
 async signed(clip: Clip, download = false) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
   const result = await Promise.race([this.admin.storage.from(BUCKET).createSignedUrl(mediaPath(clip), 60, { download }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AppError(504, 'Playback request timed out. Try again.')), 5000); })]);
   return requiredResult(result).signedUrl;
  } finally { if(timer) clearTimeout(timer); }
 }
 async playback(id: string, owner: string) { return { url: await this.signed(await this.owned(id, owner, true)), expiresIn: 60 }; }
 async download(id: string, owner: string) { return { url: await this.signed(await this.owned(id,owner,true),true), expiresIn:60 }; }
 async share(id: string, owner: string) {
  await this.owned(id, owner, true);
  const link = newShare();
  if (!dbResult(await this.admin.rpc('supaclip_share', { p_owner: owner, p_clip: id, p_hash: link.token_hash, p_expiry: link.expires_at }))) throw new AppError(404, 'Clip is unavailable.');
  return { token: link.token, expiresAt: link.expires_at };
 }
 async revoke(id: string, owner: string) {
  await this.owned(id, owner);
  dbResult(await this.admin.from('supaclip_share_tokens').update({ revoked_at: new Date().toISOString() }).eq('clip_id', id));
 }
 async view(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AppError(404, 'This link is unavailable, expired or revoked.');
  const link = dbResult(await this.admin.from('supaclip_share_tokens').select('*').eq('token_hash', tokenHash(token)).maybeSingle());
  if (!validShare(link)) throw new AppError(404, 'This link is unavailable, expired or revoked.');
  const clip = dbResult(await this.admin.from('supaclip_clips').select('*').eq('id', link.clip_id).eq('status', 'ready').maybeSingle()) as Clip | null;
  if (!clip) throw new AppError(404, 'This clip has been deleted.');
  return { url: await this.signed(clip), title: clip.title, expiresAt: link.expires_at, expiresIn: 60 };
 }
 async remove(id: string, owner: string) {
  const clip = await this.owned(id, owner);
  if (!dbResult(await this.admin.rpc('supaclip_delete', { p_owner: owner, p_clip: id }))) throw new AppError(404, 'Clip is unavailable.');
  // Tombstone and revocation precede physical deletion. A failed purge never restores access.
  try {
  dbResult(await this.admin.storage.from(BUCKET).remove([mediaPath(clip)]));
  dbResult(await this.admin.storage.from(PART_BUCKET).remove(Array.from({ length: Math.ceil(clip.size / PART_BYTES) }, (_, i) => partPath(clip, i))));
  } catch { throw new AppError(503, 'Clip access and links are revoked, but storage cleanup failed. Retry deletion; scheduled cleanup will also retry.'); }
  if (clip.deleted_at && Date.parse(clip.deleted_at) < Date.now() - 3 * 3600000) dbResult(await this.admin.from('supaclip_clips').update({ purged_at: new Date().toISOString() }).eq('id', id).eq('status', 'deleted'));
 }
 async cleanup() {
  const expired = requiredResult(await this.admin.from('supaclip_upload_sessions').select('clip_id').lt('expires_at', new Date().toISOString()).order('expires_at').limit(100));
  const deleted = dbResult(await this.admin.from('supaclip_clips').select('*').eq('status', 'deleted').is('purged_at', null).order('deleted_at').limit(100)) as Clip[];
  for (const row of expired) {
   const clip = dbResult(await this.admin.from('supaclip_clips').select('*').eq('id', row.clip_id).maybeSingle()) as Clip | null;
   if (clip?.status === 'uploading') await this.remove(clip.id, clip.owner_id);
   dbResult(await this.admin.from('supaclip_upload_sessions').delete().eq('clip_id', row.clip_id));
  }
  for (const clip of deleted) await this.remove(clip.id, clip.owner_id);
  // Purge stage parts of ready clips too (old signed stage URLs may outlive finalization).
  const ready = dbResult(await this.admin.from('supaclip_clips').select('*').eq('status', 'ready').is('parts_cleaned_at', null).lt('finalized_at', new Date(Date.now()-3*3600000).toISOString()).order('finalized_at').limit(100)) as Clip[];
  for (const clip of ready) {
   dbResult(await this.admin.storage.from(PART_BUCKET).remove(Array.from({ length: Math.ceil(clip.size / PART_BYTES) }, (_, i) => partPath(clip, i))));
   dbResult(await this.admin.from('supaclip_clips').update({ parts_cleaned_at: new Date().toISOString() }).eq('id', clip.id));
  }
  dbResult(await this.admin.from('supaclip_rate_limits').delete().lt('window_at', new Date(Date.now()-86400000).toISOString()));
 }
}
