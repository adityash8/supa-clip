import {test} from 'node:test';
import assert from 'node:assert/strict';
import {track,safeProperties} from '../src/lib/server/analytics';
test('analytics excludes titles, tokens, media and caller identity',async()=>{
 let body:any;
 const fetcher=async(_:unknown,init:any)=>{body=JSON.parse(init.body);return new Response('{}',{status:200});};
 await track({POSTHOG_API_KEY:'unit-test-project'},'first_recording_previewed',{mode:'sample',elapsed_ms:100,title:'private-title',token:'private-token',media:'private-media',user_id:'caller'},'verified-identity',fetcher as any);
 assert.deepEqual(body.properties,{schema_version:1,mode:'sample',elapsed_ms:100,$process_person_profile:false});assert.notEqual(body.distinct_id,'verified-identity');assert.equal(JSON.stringify(body).includes('private-token'),false);
});
test('analytics disabled/configured failure never claims event delivery and does not fetch unsafe host',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw new Error('provider failure');};
 assert.equal((await track({},'first_recording_previewed',{mode:'sample'},'test',fetcher as any)).accepted,false);
 assert.equal((await track({POSTHOG_API_KEY:'test',POSTHOG_HOST:'http://127.0.0.1'},'first_recording_previewed',{mode:'sample'},'test',fetcher as any)).accepted,false);assert.equal(calls,0);
 assert.equal((await track({POSTHOG_API_KEY:'test'},'first_recording_previewed',{mode:'sample'},'test',fetcher as any)).accepted,false);assert.equal(calls,1);
 assert.throws(()=>safeProperties({mode:'sample',elapsed_ms:Infinity}));
});
