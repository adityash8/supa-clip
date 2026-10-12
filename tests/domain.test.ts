import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUpload, validShare, ownsPlayable, MAX_BYTES, tokenHash } from '../src/lib/server/domain.ts';

test('upload limits are bounded including non-finite and fractional values', () => {
 for (const size of [0, -1, MAX_BYTES + 1, NaN, 1.5]) assert.throws(() => validateUpload({ size, duration: 2, type: 'video/webm', title: 'clip', fingerprint: 'a'.repeat(64) }));
 for (const duration of [0, 301, NaN]) assert.throws(() => validateUpload({ size: 100, duration, type: 'video/webm', title: 'clip', fingerprint: 'a'.repeat(64) }));
 assert.equal(validateUpload({ size: MAX_BYTES, duration: 300, type: 'video/webm', title: 'clip', fingerprint: 'a'.repeat(64) }).size, MAX_BYTES);
});
test('incomplete, deleted and foreign clips cannot play', () => {
 assert.equal(ownsPlayable({ owner_id: 'a', status: 'ready' }, 'a'), true);
 for (const status of ['uploading', 'deleted']) assert.equal(ownsPlayable({ owner_id: 'a', status }, 'a'), false);
 assert.equal(ownsPlayable({ owner_id: 'a', status: 'ready' }, 'b'), false);
});
test('revocation and expiry deny access at the boundary', () => {
 const link = { revoked_at: null, expires_at: new Date(1000).toISOString() };
 assert.equal(validShare(link, 999), true);
 assert.equal(validShare(link, 1000), false);
 assert.equal(validShare({ ...link, revoked_at: new Date(0).toISOString() }, 100), false);
 assert.equal(validShare({ ...link, expires_at: 'invalid' }, 100), false);
 assert.equal(tokenHash('sensitive-token').includes('sensitive'), false);
});
