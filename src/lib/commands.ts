import { invoke } from '@tauri-apps/api/core';

// Recording commands
export function startSession(fps?: number, audioDevice?: string): Promise<string> {
	return invoke('start_session', { fps, audioDevice });
}

export function stopSession(): Promise<string> {
	return invoke('stop_session');
}

export function getRecordingSize(): Promise<number> {
	return invoke('get_recording_size');
}

export function finalizeRecording(
	sessionId: string,
	savePath?: string
): Promise<string> {
	return invoke('finalize_recording', { sessionId, savePath });
}

export interface RecoverableFile {
	session_id: string;
	path: string;
	size: number;
	modified: string;
}

export function listRecoverable(): Promise<RecoverableFile[]> {
	return invoke('list_recoverable');
}

export function deleteRecoverable(sessionId: string): Promise<void> {
	return invoke('delete_recoverable', { sessionId });
}

export function recoverFile(sessionId: string, savePath?: string): Promise<string> {
	return invoke('recover_file', { sessionId, savePath });
}

export interface SessionInfo {
	session_id: string;
	temp_path: string;
	chunks_written: number;
	bytes_written: number;
	started_at: string;
}

export function getSessionInfo(): Promise<SessionInfo | null> {
	return invoke('get_session_info');
}

// FFmpeg commands
export function trimVideo(
	input: string,
	output: string,
	start: number,
	end: number
): Promise<string> {
	return invoke('trim_video', { input, output, start, end });
}

export function convertToMp4(input: string, output: string): Promise<string> {
	return invoke('convert_to_mp4', { input, output });
}

export function fixWebmHeaders(input: string, output: string): Promise<string> {
	return invoke('fix_webm_headers', { input, output });
}

export function getVideoDuration(input: string): Promise<number> {
	return invoke('get_video_duration', { input });
}

// Settings commands
export interface AppSettings {
	format: string;
	fps: number;
	resolution: string;
	save_path: string | null;
	hotkey: string;
	auto_copy_link: boolean;
	s3_bucket: string;
	s3_access_key: string;
	s3_secret_key: string;
	s3_endpoint: string;
	s3_region: string;
	webcam_enabled: boolean;
	webcam_position: string;
}

export function readSettings(): Promise<AppSettings> {
	return invoke('read_settings');
}

export function writeSettings(settings: AppSettings): Promise<void> {
	return invoke('write_settings', { settings });
}

// Upload commands
export interface UploadResult {
	url: string;
	key: string;
}

export function uploadToS3(
	filePath: string,
	bucket: string,
	accessKey: string,
	secretKey: string,
	endpoint: string,
	region: string
): Promise<UploadResult> {
	return invoke('upload_to_s3', {
		filePath,
		bucket,
		accessKey,
		secretKey,
		endpoint,
		region
	});
}

export interface FileInfo {
	path: string;
	name: string;
	size: number;
	size_formatted: string;
}

export function getFileInfo(path: string): Promise<FileInfo> {
	return invoke('get_file_info', { path });
}
