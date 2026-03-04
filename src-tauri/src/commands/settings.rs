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
    #[serde(default = "default_true")]
    pub webcam_enabled: bool,
    #[serde(default = "default_webcam_position")]
    pub webcam_position: String,
}

fn default_format() -> String { "webm".to_string() }
fn default_fps() -> u32 { 30 }
fn default_resolution() -> String { "auto".to_string() }
fn default_hotkey() -> String { "CmdOrCtrl+Shift+9".to_string() }
fn default_s3_region() -> String { "auto".to_string() }
fn default_true() -> bool { true }
fn default_webcam_position() -> String { "bottom-right".to_string() }

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
            webcam_enabled: true,
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
    let path = settings_path();
    let dir = path.parent().unwrap();
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;

    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}
