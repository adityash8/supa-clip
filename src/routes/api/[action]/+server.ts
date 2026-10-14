import { json, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { provider, dbResult } from '$lib/server/provider';
import { Clips } from '$lib/server/clips';
import { AppError, clipId, tokenHash } from '$lib/server/domain';
import { identity, saveSession, clearSession } from '$lib/server/auth';
import { track } from '$lib/server/analytics';
import { randomUUID } from 'node:crypto';
import { requireHosting, stripeClient, checkout, billingEvent } from '$lib/server/billing';
export const prerender = false;
const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' };
async function body(event: RequestEvent, limit = 4096) {
 const reader = event.request.body?.getReader();
 if (!reader) throw new AppError(400, 'Request body is missing.');
 let size = 0; const chunks: Uint8Array[] = [];
 for (;;) {
  const { value, done } = await reader.read(); if (done) break;
  size += value.length; if (size > limit) { await reader.cancel(); throw new AppError(413, 'Request is too large.'); }
  chunks.push(value);
 }
 const bytes = new Uint8Array(size); let pos=0;
 for(const c of chunks) { bytes.set(c,pos); pos+=c.length; }
 return new TextDecoder().decode(bytes);
}
function email(value: unknown) {
 if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new AppError(400, 'Enter a valid email address.');
 return value.trim().toLowerCase();
}
async function run(event: RequestEvent) {
 const action = event.params.action;
 const { admin, auth } = provider(env);
 const clips = new Clips(admin);
 const secure = event.url.protocol === 'https:';
 if (action === 'maintenance') {
  if (!env.SUPACLIP_MAINTENANCE_SECRET || event.request.headers.get('authorization') !== `Bearer ${env.SUPACLIP_MAINTENANCE_SECRET}`) throw new AppError(401, 'Unauthorized.');
  await clips.cleanup(); return { ok: true };
 }
 if (action === 'stripe-webhook') {
  if (event.request.method !== 'POST') throw new AppError(405, 'Use POST.');
  const stripe = stripeClient(env); let verified;
  try { verified = stripe.webhooks.constructEvent(await body(event, 256000), event.request.headers.get('stripe-signature') ?? '', env.STRIPE_WEBHOOK_SECRET!); }
  catch { throw new AppError(400, 'Webhook signature is invalid.'); }
  await billingEvent(stripe, admin, verified, env.STRIPE_PRICE_ID!, env); return { received: true };
 }
 if (event.request.method === 'POST' && event.request.headers.get('origin') !== event.url.origin) throw new AppError(403, 'Open this app directly to continue.');
 const ip = tokenHash(event.getClientAddress());
 const rate = dbResult(await admin.rpc('supaclip_rate', { p_key: `${action}:${ip}`, p_limit: ['sign-in','verify'].includes(action!) ? 8 : 120, p_seconds: 3600 }));
 if (!rate) throw new AppError(429, 'Too many requests. Try again later. Your local recording is retained.');
 let value: any = {};
 if (event.request.method === 'POST') { try { value = JSON.parse(await body(event)); } catch(err) { if (err instanceof AppError) throw err; throw new AppError(400, 'Invalid request.'); } }
 if(action==='event') {
  if(event.request.method!=='POST'||value.event!=='first_recording_previewed') throw new AppError(400, 'Invalid preview event.');
  let visitor=event.cookies.get('supaclip_visitor');
  if(!visitor || !/^[a-f0-9-]{36}$/.test(visitor)) { visitor=randomUUID(); event.cookies.set('supaclip_visitor',visitor,{path:'/',httpOnly:true,secure,sameSite:'lax',maxAge:86400}); }
  return track(env,value.event,value.properties,visitor);
 }
 if (action === 'sign-in') {
  if (event.request.method !== 'POST') throw new AppError(405, 'Use POST.');
  const result = await auth.auth.signInWithOtp({ email: email(value.email), options: { shouldCreateUser: true } });
  if (result.error) throw new AppError(503, 'Email sign-in could not be sent. Try again later; you can still record locally.');
  return { sent: true };
 }
 if (action === 'verify') {
  if (event.request.method !== 'POST' || typeof value.code !== 'string' || !/^\d{6,8}$/.test(value.code)) throw new AppError(400, 'Enter the email verification code.');
  const result = await auth.auth.verifyOtp({ email: email(value.email), token: value.code, type: 'email' });
  if (result.error || !result.data.session || !result.data.user?.email_confirmed_at) throw new AppError(401, 'This code is invalid or expired. Request a new code.');
  saveSession(event.cookies, result.data.session, secure); return { signedIn: true };
 }
 if (action === 'view') {
  if (event.request.method !== 'POST') throw new AppError(405, 'Use POST.');
  return clips.view(value.token);
 }
 const user = await identity(auth, event.cookies, secure);
 const userRate = dbResult(await admin.rpc('supaclip_rate', { p_key: `${action}:${user.id}`, p_limit: action === 'begin' ? 20 : 180, p_seconds: 3600 }));
 if (!userRate) throw new AppError(429, 'Account request limit reached. Try again later.');
 if (action === 'session' && event.request.method === 'GET') return { email: user.email, billingMode: env.SUPACLIP_BILLING_MODE ?? 'pilot' };
 if (action === 'clips' && event.request.method === 'GET') return { clips: await clips.list(user.id) };
 if (event.request.method !== 'POST') throw new AppError(405, 'Use POST.');
 if (action === 'sign-out') {
  const logout = await auth.auth.admin.signOut(event.cookies.get('supaclip_access')!, 'local');
  if(logout.error) throw new AppError(503, 'Session sign-out failed. Try again.');
  clearSession(event.cookies); return { signedOut: true };
 }
 if (action === 'checkout') {
  if (env.SUPACLIP_BILLING_MODE !== 'paid') throw new AppError(409, 'This pilot does not require payment.');
  const billing = dbResult(await admin.from('supaclip_billing').select('active_until').eq('owner_id',user.id).maybeSingle());
  if(billing && Date.parse(billing.active_until)>Date.now()) throw new AppError(409, 'Your subscription is already active. No new checkout was created.');
  return checkout(stripeClient(env), env, user.id, event.url.origin);
 }
 if (action === 'begin') { await requireHosting(admin, user.id, env.SUPACLIP_BILLING_MODE); return clips.begin(user.id, value); }
 const id = clipId(value.id);
 switch (action) {
  case 'part': return clips.uploadPart(id, user.id, value.part);
  case 'finalize': { await requireHosting(admin,user.id,env.SUPACLIP_BILLING_MODE); const result=await clips.finalize(id,user.id);if(result.newlyFinalized)await track(env,'recording_uploaded',{mode:'real',visibility:'private'},user.id);return result; }
  case 'playback': return clips.playback(id, user.id);
  case 'download': return clips.download(id, user.id);
  case 'share': {const result=await clips.share(id,user.id);await track(env,'share_link_created',{mode:'real',visibility:'shared'},user.id);return result;}
  case 'revoke': await clips.revoke(id, user.id); return { revoked: true };
  case 'delete': await clips.remove(id, user.id); return { deleted: true };
  default: throw new AppError(404, 'Unknown action.');
 }
}
async function handle(event: RequestEvent) {
 try { return json(await run(event), { headers }); }
 catch(err) { return json({ message: err instanceof AppError ? err.message : 'Cloud request failed. Keep your local recording and retry.' }, { status: err instanceof AppError ? err.status : 503, headers }); }
}
export const GET = handle;
export const POST = handle;
