use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_format")]
    pub format: String,
    #[serde(default = "default_fps")]
    pub fps: u32,
    #[serde(default = "default_resolution")]
    pub resolution: String,
    #[serde(default)]
    pub save_path: Option<String>,
    #[serde(default = "default_hotkey")]
    pub hotkey: String,
    #[serde(default)]
    pub auto_copy_link: bool,
    #[serde(default)]
    pub s3_bucket: String,
    #[serde(default)]
    pub s3_access_key: String,
    #[serde(default)]
    pub s3_secret_key: String,
    #[serde(default)]
    pub s3_endpoint: String,
    #[serde(default = "default_s3_region")]
    pub s3_region: String,
    #[serde(default = "default_false")]
    pub webcam_enabled: bool,
    #[serde(default)]
    pub microphone_enabled: bool,
    #[serde(default = "default_webcam_position")]
    pub webcam_position: String,
}

fn default_format() -> String {
    "mp4".to_string()
}
fn default_fps() -> u32 {
    30
}
fn default_resolution() -> String {
    "auto".to_string()
}
fn default_hotkey() -> String {
    "CmdOrCtrl+Shift+9".to_string()
}
fn default_s3_region() -> String {
    "auto".to_string()
}
fn default_false() -> bool {
    false
}
fn default_webcam_position() -> String {
    "bottom-right".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            format: default_format(),
            fps: default_fps(),
            resolution: default_resolution(),
            save_path: None,
            hotkey: default_hotkey(),
            auto_copy_link: false,
            s3_bucket: String::new(),
            s3_access_key: String::new(),
            s3_secret_key: String::new(),
            s3_endpoint: String::new(),
            s3_region: default_s3_region(),
            webcam_enabled: false,
            microphone_enabled: false,
            webcam_position: default_webcam_position(),
        }
    }
}

fn settings_path() -> std::path::PathBuf {
    AppState::config_dir().join("settings.json")
}

#[tauri::command]
pub fn read_settings() -> Result<AppSettings, String> {
    let path = settings_path();
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let settings: AppSettings = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(settings)
}

#[tauri::command]
pub fn write_settings(settings: AppSettings) -> Result<(), String> {
    if !["mp4", "webm"].contains(&settings.format.as_str())
        || ![15, 30, 60].contains(&settings.fps)
        || !["auto", "720p", "1080p"].contains(&settings.resolution.as_str())
    {
        return Err("Choose a supported format, fps and resolution.".into());
    }
    let path = settings_path();
    let dir = path.parent().unwrap();
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;

    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    if path.exists() {
        fs::copy(&path, path.with_extension("json.bak"))
            .map_err(|_| "Could not back up settings".to_string())?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let backup = path.with_extension("json.bak");
        if backup.exists() {
            fs::set_permissions(backup, fs::Permissions::from_mode(0o600))
                .map_err(|_| "Could not secure settings backup".to_string())?;
        }
    }
    let temporary = path.with_extension("json.tmp");
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        file.write_all(content.as_bytes())
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    #[cfg(not(unix))]
    fs::write(&temporary, content).map_err(|e| e.to_string())?;
    fs::rename(temporary, &path).map_err(|e| e.to_string())?;
    Ok(())
}
