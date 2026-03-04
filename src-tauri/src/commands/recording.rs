use crate::state::{AppState, RecordingSession};
use std::fs;
use std::process::Command;
use tauri::State;

fn detect_avfoundation_devices() -> (String, String) {
    // Run ffmpeg to list devices
    let output = Command::new("ffmpeg")
        .args(["-f", "avfoundation", "-list_devices", "true", "-i", ""])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output();

    let mut screen_index = "0".to_string();
    let mut mic_index = "0".to_string();
    let mut in_video = false;
    let mut in_audio = false;

    if let Ok(out) = output {
        let stderr = String::from_utf8_lossy(&out.stderr);
        for line in stderr.lines() {
            if line.contains("AVFoundation video devices:") {
                in_video = true;
                in_audio = false;
                continue;
            }
            if line.contains("AVFoundation audio devices:") {
                in_video = false;
                in_audio = true;
                continue;
            }
            if in_video {
                // Look for "Capture screen" device
                if line.contains("Capture screen") {
                    if let Some(idx) = extract_device_index(line) {
                        screen_index = idx;
                    }
                }
            }
            if in_audio {
                // Prefer MacBook microphone, fall back to first device
                if line.contains("MacBook") && line.contains("Microphone") {
                    if let Some(idx) = extract_device_index(line) {
                        mic_index = idx;
                    }
                }
            }
        }
    }

    log::info!("Detected screen device: {}, mic device: {}", screen_index, mic_index);
    (screen_index, mic_index)
}

fn extract_device_index(line: &str) -> Option<String> {
    // Line format: "[AVFoundation indev @ 0x...] [4] Capture screen 0"
    // We need the SECOND [...] group which contains the device index
    let mut count = 0;
    for (i, c) in line.char_indices() {
        if c == '[' {
            count += 1;
            if count == 2 {
                // Found second opening bracket
                if let Some(end) = line[i..].find(']') {
                    let idx = &line[i + 1..i + end];
                    return Some(idx.to_string());
                }
            }
        }
    }
    None
}

#[tauri::command]
pub fn start_session(
    state: State<'_, AppState>,
    fps: Option<u32>,
) -> Result<String, String> {
    // Check if already recording
    {
        let current = state.current_session.lock().map_err(|e| e.to_string())?;
        if current.is_some() {
            return Err("Already recording".to_string());
        }
    }

    let session_id = uuid::Uuid::new_v4().to_string();
    let tmp_dir = AppState::tmp_dir();
    fs::create_dir_all(&tmp_dir).map_err(|e| format!("Failed to create tmp dir: {}", e))?;

    let temp_path = tmp_dir.join(format!("{}.mp4", session_id));
    let fps_val = fps.unwrap_or(30);

    // Auto-detect correct screen capture and mic devices
    let (screen_idx, mic_idx) = detect_avfoundation_devices();
    let input_spec = format!("{}:{}", screen_idx, mic_idx);

    let child = Command::new("ffmpeg")
        .args([
            "-f", "avfoundation",
            "-framerate", &fps_val.to_string(),
            "-capture_cursor", "1",
            "-i", &input_spec,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            "-y",
            &temp_path.to_string_lossy(),
        ])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start ffmpeg: {}. Is ffmpeg installed?", e))?;

    let session = RecordingSession {
        session_id: session_id.clone(),
        temp_path: temp_path.clone(),
        chunks_written: 0,
        bytes_written: 0,
        started_at: chrono::Local::now().format("%Y-%m-%d_%H-%M-%S").to_string(),
    };

    let mut current = state.current_session.lock().map_err(|e| e.to_string())?;
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let mut ffmpeg = state.ffmpeg_process.lock().map_err(|e| e.to_string())?;

    sessions.insert(session_id.clone(), session.clone());
    *current = Some(session);
    *ffmpeg = Some(child);

    log::info!("Native recording started: {} ({}fps)", session_id, fps_val);
    Ok(session_id)
}

#[tauri::command]
pub fn stop_session(state: State<'_, AppState>) -> Result<String, String> {
    {
        let mut ffmpeg = state.ffmpeg_process.lock().map_err(|e| e.to_string())?;
        if let Some(ref mut child) = *ffmpeg {
            let pid = child.id();

            // Send 'q' to stdin for graceful stop
            if let Some(ref mut stdin) = child.stdin.take() {
                use std::io::Write;
                let _ = stdin.write_all(b"q");
                let _ = stdin.flush();
            }

            // Give ffmpeg 3 seconds to finish, then SIGTERM
            let start = std::time::Instant::now();
            loop {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        log::info!("ffmpeg exited with: {}", status);
                        break;
                    }
                    Ok(None) => {
                        if start.elapsed() > std::time::Duration::from_secs(3) {
                            log::warn!("ffmpeg didn't stop gracefully, sending SIGTERM");
                            // Send SIGINT (like Ctrl+C) which ffmpeg handles gracefully
                            unsafe { libc::kill(pid as i32, libc::SIGINT); }
                            // Wait another 2 seconds
                            std::thread::sleep(std::time::Duration::from_secs(2));
                            match child.try_wait() {
                                Ok(Some(status)) => {
                                    log::info!("ffmpeg exited after SIGINT: {}", status);
                                }
                                _ => {
                                    log::warn!("Force killing ffmpeg");
                                    let _ = child.kill();
                                    let _ = child.wait();
                                }
                            }
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                    Err(e) => {
                        log::warn!("ffmpeg wait error: {}", e);
                        break;
                    }
                }
            }
        }
        *ffmpeg = None;
    }

    let mut current = state.current_session.lock().map_err(|e| e.to_string())?;
    let session = current.take().ok_or("No active recording session")?;

    // Update file size in sessions
    if let Ok(metadata) = fs::metadata(&session.temp_path) {
        if let Ok(mut sessions) = state.sessions.lock() {
            if let Some(s) = sessions.get_mut(&session.session_id) {
                s.bytes_written = metadata.len();
            }
        }
    }

    log::info!("Recording session stopped: {}", session.session_id);
    Ok(session.session_id)
}

#[tauri::command]
pub fn get_recording_size(state: State<'_, AppState>) -> Result<u64, String> {
    let current = state.current_session.lock().map_err(|e| e.to_string())?;
    if let Some(ref session) = *current {
        let size = fs::metadata(&session.temp_path)
            .map(|m| m.len())
            .unwrap_or(0);
        Ok(size)
    } else {
        Ok(0)
    }
}

#[tauri::command]
pub fn finalize_recording(
    session_id: String,
    save_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or("Session not found")?;

    let temp_path = &session.temp_path;
    if !temp_path.exists() {
        return Err("Temp file not found".to_string());
    }

    let save_dir = AppState::default_save_dir();
    fs::create_dir_all(&save_dir)
        .map_err(|e| format!("Failed to create save dir: {}", e))?;

    let filename = format!("supaclip_{}.mp4", session.started_at);
    let final_path = if let Some(p) = save_path {
        std::path::PathBuf::from(p)
    } else {
        save_dir.join(&filename)
    };

    fs::rename(temp_path, &final_path)
        .or_else(|_| fs::copy(temp_path, &final_path).map(|_| ()))
        .map_err(|e| format!("Failed to save recording: {}", e))?;

    // Clean up temp file (if copy was used)
    let _ = fs::remove_file(temp_path);

    let path_str = final_path.to_string_lossy().to_string();
    log::info!("Recording finalized: {}", path_str);
    Ok(path_str)
}

#[derive(serde::Serialize)]
pub struct RecoverableFile {
    pub session_id: String,
    pub path: String,
    pub size: u64,
    pub modified: String,
}

#[tauri::command]
pub fn list_recoverable() -> Result<Vec<RecoverableFile>, String> {
    let tmp_dir = AppState::tmp_dir();
    if !tmp_dir.exists() {
        return Ok(vec![]);
    }

    let entries = fs::read_dir(&tmp_dir).map_err(|e| e.to_string())?;
    let mut files = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let is_video = path.extension().is_some_and(|e| e == "mp4" || e == "webm");
        if is_video {
            if let Ok(metadata) = path.metadata() {
                let session_id = path
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();

                let modified = metadata
                    .modified()
                    .ok()
                    .and_then(|t| {
                        let datetime: chrono::DateTime<chrono::Local> = t.into();
                        Some(datetime.format("%Y-%m-%d %H:%M:%S").to_string())
                    })
                    .unwrap_or_default();

                if metadata.len() > 0 {
                    files.push(RecoverableFile {
                        session_id,
                        path: path.to_string_lossy().to_string(),
                        size: metadata.len(),
                        modified,
                    });
                }
            }
        }
    }

    Ok(files)
}

#[tauri::command]
pub fn delete_recoverable(session_id: String) -> Result<(), String> {
    let tmp_dir = AppState::tmp_dir();
    // Try both extensions
    for ext in &["mp4", "webm"] {
        let path = tmp_dir.join(format!("{}.{}", session_id, ext));
        if path.exists() {
            fs::remove_file(&path).map_err(|e| format!("Failed to delete: {}", e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn recover_file(session_id: String, save_path: Option<String>) -> Result<String, String> {
    let tmp_dir = AppState::tmp_dir();

    // Find the file (could be mp4 or webm)
    let temp_path = ["mp4", "webm"]
        .iter()
        .map(|ext| tmp_dir.join(format!("{}.{}", session_id, ext)))
        .find(|p| p.exists())
        .ok_or("Recoverable file not found")?;

    let ext = temp_path.extension().unwrap_or_default().to_string_lossy();
    let save_dir = AppState::default_save_dir();
    fs::create_dir_all(&save_dir).map_err(|e| e.to_string())?;

    let final_path = if let Some(p) = save_path {
        std::path::PathBuf::from(p)
    } else {
        save_dir.join(format!("recovered_{}.{}", session_id, ext))
    };

    fs::copy(&temp_path, &final_path).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&temp_path);

    Ok(final_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_session_info(state: State<'_, AppState>) -> Result<Option<RecordingSession>, String> {
    let current = state.current_session.lock().map_err(|e| e.to_string())?;
    Ok(current.clone())
}
