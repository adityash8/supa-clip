import assert from 'node:assert/strict';
const origin='http://127.0.0.1:4173';
for(const path of ['/','/share','/sample.webm']) {
 const response=await fetch(origin+path);assert.equal(response.status,200);console.log(`GET ${path}: 200`);
}
const response=await fetch(origin+'/api/session');
assert.equal(response.status,503);assert.match((await response.json()).message,/not configured/);assert.equal(response.headers.get('cache-control'),'no-store');
console.log('GET /api/session without configuration: 503, honest local-recording guidance, no-store');
