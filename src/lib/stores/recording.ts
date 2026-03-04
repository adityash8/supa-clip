import { writable, derived, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

export type RecordingState = 'idle' | 'recording' | 'done';

export const recordingState = writable<RecordingState>('idle');
export const sessionId = writable<string | null>(null);
export const duration = writable<number>(0);
export const bytesWritten = writable<number>(0);
export const savedFilePath = writable<string | null>(null);
export const error = writable<string | null>(null);
export const webcamStream = writable<MediaStream | null>(null);

export const isRecording = derived(recordingState, ($s) => $s === 'recording');
export const isDone = derived(recordingState, ($s) => $s === 'done');

let durationInterval: ReturnType<typeof setInterval> | null = null;
let sizeInterval: ReturnType<typeof setInterval> | null = null;
let startTime = 0;

export async function startRecording(fps: number = 30, enableWebcam: boolean = true) {
	try {
		error.set(null);

		// Start native ffmpeg recording via Rust
		const sid: string = await invoke('start_session', { fps });
		sessionId.set(sid);

		// Start webcam preview (getUserMedia works in WKWebView)
		if (enableWebcam) {
			try {
				const cam = await navigator.mediaDevices.getUserMedia({
					video: { width: { ideal: 320 }, height: { ideal: 320 }, facingMode: 'user' },
					audio: false
				});
				webcamStream.set(cam);
			} catch {
				// Webcam not available, that's fine
			}
		}

		// Start duration timer
		startTime = Date.now();
		duration.set(0);
		durationInterval = setInterval(() => {
			duration.set(Math.floor((Date.now() - startTime) / 1000));
		}, 100);

		// Poll file size periodically
		sizeInterval = setInterval(async () => {
			try {
				const size: number = await invoke('get_recording_size');
				bytesWritten.set(size);
			} catch {
				// ignore
			}
		}, 1000);

		recordingState.set('recording');
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		error.set(message);
		cleanup();
		throw err;
	}
}

export async function stopRecording(): Promise<string | null> {
	const state = get(recordingState);
	if (state !== 'recording') return null;

	cleanup();

	try {
		const sid = get(sessionId);
		if (sid) {
			await invoke('stop_session');

			// Small delay to let ffmpeg finish writing
			await new Promise((r) => setTimeout(r, 500));

			const path: string = await invoke('finalize_recording', { sessionId: sid });
			savedFilePath.set(path);

			// Get final file size
			try {
				const info: { size: number } = await invoke('get_file_info', { path });
				bytesWritten.set(info.size);
			} catch {
				// ignore
			}

			recordingState.set('done');
			return path;
		}
	} catch (err) {
		console.error('Failed to finalize:', err);
		error.set(err instanceof Error ? err.message : String(err));
	}

	return null;
}

export function resetRecording() {
	recordingState.set('idle');
	sessionId.set(null);
	duration.set(0);
	bytesWritten.set(0);
	savedFilePath.set(null);
	error.set(null);
}

function cleanup() {
	if (durationInterval) {
		clearInterval(durationInterval);
		durationInterval = null;
	}
	if (sizeInterval) {
		clearInterval(sizeInterval);
		sizeInterval = null;
	}
	// Stop webcam
	const cam = get(webcamStream);
	if (cam) {
		cam.getTracks().forEach((t) => t.stop());
		webcamStream.set(null);
	}
}

export function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;

	if (h > 0) {
		return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}
	return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
	}
	if (bytes >= 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	if (bytes >= 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${bytes} B`;
}
