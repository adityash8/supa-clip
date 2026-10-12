import { createHash, randomBytes } from 'node:crypto';
export const MAX_BYTES = 50 * 1024 * 1024;
export const PART_BYTES = 5 * 1024 * 1024;
export const MAX_SECONDS = 300;
export const PART_BUCKET = 'supaclip_parts';
export const BUCKET = 'supaclip_media';
export class AppError extends Error {
 constructor(public status: number, message: string) { super(message); }
}
export function validateUpload(value: any) {
 if (!value || !Number.isSafeInteger(value.size) || value.size < 1 || value.size > MAX_BYTES ||
 !Number.isFinite(value.duration) || value.duration <= 0 || value.duration > MAX_SECONDS || value.type !== 'video/webm' ||
 typeof value.title !== 'string' || !value.title.trim() || value.title.length > 100 ||
 typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint)) throw new AppError(400, 'Use a WebM clip up to 5 minutes and 50 MB, with a title under 100 characters.');
 return { size: value.size as number, duration: value.duration as number, title: value.title.trim() as string, fingerprint: value.fingerprint as string };
}
export function ownsPlayable(clip: { owner_id: string; status: string } | null, owner: string) {
 return !!clip && clip.owner_id === owner && clip.status === 'ready';
}
export function validShare(link: { revoked_at: string | null; expires_at: string } | null, now = Date.now()) {
 return !!link && !link.revoked_at && Date.parse(link.expires_at) > now;
}
export function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
export function newShare() {
 const token = randomBytes(32).toString('base64url');
 return { token, token_hash: tokenHash(token), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() };
}
export function clipId(value: unknown) {
 if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/.test(value)) throw new AppError(400, 'Invalid clip.');
 return value;
}
export function partSize(size: number, part: number) {
 if (!Number.isInteger(part) || part < 0 || part >= Math.ceil(size / PART_BYTES)) throw new AppError(400, 'Invalid upload part.');
 return Math.min(PART_BYTES, size - part * PART_BYTES);
}
export function partPath(clip: { owner_id: string; id: string }, part: number) { return `${clip.owner_id}/${clip.id}/parts/${part}`; }
export function mediaPath(clip: { owner_id: string; id: string }) { return `${clip.owner_id}/${clip.id}/clip.webm`; }
