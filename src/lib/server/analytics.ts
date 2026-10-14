import { AppError, tokenHash } from './domain';
const events = ['first_recording_previewed','recording_uploaded','share_link_created','subscription_started'];
export function safeProperties(value: any) {
 if (!value || !['sample','real'].includes(value.mode)) throw new AppError(400,'Invalid event mode.');
 const result: Record<string,string|number> = {schema_version:1,mode:value.mode};
 if(value.elapsed_ms !== undefined) {
  if(!Number.isSafeInteger(value.elapsed_ms)||value.elapsed_ms<0||value.elapsed_ms>86400000)throw new AppError(400,'Invalid event timing.');
  result.elapsed_ms=value.elapsed_ms;
 }
 if(['private','shared'].includes(value.visibility))result.visibility=value.visibility;
 return result;
}
export async function track(env:Record<string,string|undefined>,event:string,properties:unknown,identity:string,request:typeof fetch=fetch) {
 if(!events.includes(event))throw new AppError(400,'Unknown event.');
 const safe=safeProperties(properties);
 if(!env.POSTHOG_API_KEY)return {accepted:false,reason:'disabled'};
 const host=env.POSTHOG_HOST??'https://us.i.posthog.com';
 if(!['https://us.i.posthog.com','https://eu.i.posthog.com'].includes(host))return {accepted:false,reason:'configuration'};
 try {
  const response=await request(`${host}/capture/`,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({api_key:env.POSTHOG_API_KEY,event,distinct_id:tokenHash(identity),properties:{...safe,$process_person_profile:false}}),signal:AbortSignal.timeout(5000)});
  return {accepted:response.ok,reason:response.ok?'sent':'provider'};
 } catch {return {accepted:false,reason:'provider'};}
}
