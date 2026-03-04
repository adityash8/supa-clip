import { writable } from 'svelte/store';
import { readSettings, writeSettings, type AppSettings } from '$lib/commands';

const defaultSettings: AppSettings = {
	format: 'webm',
	fps: 30,
	resolution: 'auto',
	save_path: null,
	hotkey: 'CmdOrCtrl+Shift+9',
	auto_copy_link: false,
	s3_bucket: '',
	s3_access_key: '',
	s3_secret_key: '',
	s3_endpoint: '',
	s3_region: 'auto',
	webcam_enabled: true,
	webcam_position: 'bottom-right'
};

export const settings = writable<AppSettings>(defaultSettings);
export const settingsLoaded = writable(false);

export async function loadSettings() {
	try {
		const s = await readSettings();
		settings.set(s);
		settingsLoaded.set(true);
	} catch (err) {
		console.error('Failed to load settings:', err);
		settings.set(defaultSettings);
		settingsLoaded.set(true);
	}
}

export async function saveSettings(newSettings: AppSettings) {
	try {
		await writeSettings(newSettings);
		settings.set(newSettings);
	} catch (err) {
		console.error('Failed to save settings:', err);
		throw err;
	}
}
