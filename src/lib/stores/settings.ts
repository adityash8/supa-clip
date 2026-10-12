import { writable } from 'svelte/store';
import { readSettings, writeSettings, type AppSettings } from '$lib/commands';

const defaultSettings: AppSettings = {
	format: 'mp4',
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
	webcam_enabled: false,
	microphone_enabled: false,
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
		// Keep local defaults when native settings cannot load.
		settings.set(defaultSettings);
		settingsLoaded.set(true);
	}
}

export async function saveSettings(newSettings: AppSettings) {
	try {
		await writeSettings(newSettings);
        const { unregisterAll, register } = await import('@tauri-apps/plugin-global-shortcut');
        const { emit } = await import('@tauri-apps/api/event');
        await unregisterAll();
        await register(newSettings.hotkey, event => { if (event.state === 'Pressed') void emit('toggle-recording'); });
		settings.set(newSettings);
	} catch (err) {

		throw err;
	}
}
