import { createClient } from '@supabase/supabase-js';
import { AppError } from './domain';
export function provider(env: Record<string, string | undefined>) {
 if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_ANON_KEY) throw new AppError(503, 'Cloud library is not configured yet. Record and download locally.');
 const url = new URL(env.SUPABASE_URL);
 if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) throw new AppError(503, 'Cloud library configuration needs review. Local recording is available.');
 const timedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000), redirect: 'error' });
 const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: timedFetch } };
 return { admin: createClient(url.href, env.SUPABASE_SERVICE_ROLE_KEY, options), auth: createClient(url.href, env.SUPABASE_ANON_KEY, options), url: url.origin };
}
export function dbResult<T>(result: { data: T; error: any }) {
 if (result.error) {
  if (result.error.message?.includes('supaclip_quota')) throw new AppError(409, 'Your library has 20 clips or pending uploads. Delete a clip before uploading another.');
  throw new AppError(503, 'Cloud library request failed. Keep your local file and retry.');
 }
 return result.data;
}

export function requiredResult<T>(result: { data: T | null; error: any }): T {
 const data = dbResult(result);
 if (data === null) throw new AppError(503, 'Cloud library returned no result. Retry with your local file retained.');
 return data;
}
