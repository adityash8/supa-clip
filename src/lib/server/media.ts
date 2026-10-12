import { Input, BufferSource, WEBM } from 'mediabunny';
import { AppError, MAX_BYTES, MAX_SECONDS } from './domain';
import { createHash } from 'node:crypto';
export async function verifyMedia(bytes: Uint8Array, expected: { size: number; fingerprint: string }) {
 if (bytes.byteLength !== expected.size || bytes.byteLength > MAX_BYTES || bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) throw new AppError(422, 'Upload is incomplete or is not a WebM video. Retry from your local recording.');
 if (createHash('sha256').update(bytes).digest('hex') !== expected.fingerprint) throw new AppError(422, 'Upload bytes do not match your local recording. Retry the upload.');
 const input = new Input({ source: new BufferSource(bytes), formats: [WEBM] });
 try {
  const tracks = await input.getTracks();
  const video = await input.getPrimaryVideoTrack();
  if (!video || !['vp8', 'vp9'].includes(video.codec ?? '') || tracks.some(t => t.type === 'audio' && t.codec !== 'opus')) throw new Error('codec');
  const duration = await input.computeDuration();
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_SECONDS) throw new Error('duration');
  return duration;
 } catch { throw new AppError(422, 'This file cannot be verified. Upload a playable WebM VP8/VP9 clip with optional Opus audio, up to 5 minutes. Your local file is retained.'); }
 finally { input.dispose(); }
}
