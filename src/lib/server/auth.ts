import type { Cookies } from '@sveltejs/kit';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import { AppError } from './domain';
const accessName = 'supaclip_access';
const refreshName = 'supaclip_refresh';
export function saveSession(cookies: Cookies, session: Session, secure: boolean) {
 const options = { path: '/', httpOnly: true, secure, sameSite: 'lax' as const };
 cookies.set(accessName, session.access_token, { ...options, maxAge: session.expires_in });
 cookies.set(refreshName, session.refresh_token, { ...options, maxAge: 30 * 86400 });
}
export function clearSession(cookies: Cookies) {
 cookies.delete(accessName, { path: '/' }); cookies.delete(refreshName, { path: '/' });
}
export async function identity(auth: SupabaseClient, cookies: Cookies, secure: boolean) {
 let access = cookies.get(accessName);
 let result = access ? await auth.auth.getUser(access) : null;
 if (!result || result.error) {
  const refresh = cookies.get(refreshName);
  if (!refresh) throw new AppError(401, 'Sign in to use your private library. Local recording needs no account.');
  const renewed = await auth.auth.refreshSession({ refresh_token: refresh });
  if (renewed.error || !renewed.data.session) { clearSession(cookies); throw new AppError(401, 'Your session expired. Sign in again. Your local recording is still here.'); }
  saveSession(cookies, renewed.data.session, secure);
  access = renewed.data.session.access_token;
  result = await auth.auth.getUser(access);
 }
 if (result.error || !result.data.user?.email_confirmed_at) throw new AppError(401, 'Confirm your email before using the cloud library.');
 return result.data.user;
}
