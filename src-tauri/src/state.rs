use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;

#[derive(Debug, Clone, serde::Serialize)]
pub struct RecordingSession {
    pub session_id: String,
    pub temp_path: PathBuf,
    pub chunks_written: u64,
    pub bytes_written: u64,
    pub started_at: String,
}

#[derive(Debug, Default)]
pub struct AppState {
    pub current_session: Mutex<Option<RecordingSession>>,
    pub sessions: Mutex<HashMap<String, RecordingSession>>,
    pub ffmpeg_process: Mutex<Option<Child>>,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn tmp_dir() -> PathBuf {
        let home = dirs::home_dir().expect("Could not find home directory");
        home.join(".supaclip").join("tmp")
    }

    pub fn default_save_dir() -> PathBuf {
        let home = dirs::home_dir().expect("Could not find home directory");
        home.join("Videos").join("SupaClip")
    }

    pub fn config_dir() -> PathBuf {
        let config = dirs::config_dir().expect("Could not find config directory");
        config.join("supaclip")
    }
}
