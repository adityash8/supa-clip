use crate::state::{AppState, RecordingSession};
use std::fs;
use std::process::Command;
use tauri::Manager;
use tauri::State;

fn detect_avfoundation_devices(microphone: bool) -> Result<(String, String), String> {
    if !cfg!(target_os = "macos") {
        return Err("Native recording currently requires macOS. Use the browser recorder on other platforms.".into());
    }
    let output = Command::new(crate::media::ffmpeg()?)
        .args(["-f", "avfoundation", "-list_devices", "true", "-i", ""])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|_| {
            "Could not list capture devices. Check macOS Screen Recording permission.".to_string()
        })?;
    let text = String::from_utf8_lossy(&output.stderr);
    let mut screen = None;
    let mut mic = None;
    let mut video = false;
    let mut audio = false;
    for line in text.lines() {
        if line.contains("AVFoundation video devices:") {
            video = true;
            audio = false;
        } else if line.contains("AVFoundation audio devices:") {
            video = false;
            audio = true;
        } else if video && line.contains("Capture screen") && screen.is_none() {
            screen = extract_device_index(line);
        } else if audio && mic.is_none() {
            mic = extract_device_index(line);
        }
    }
    let screen = screen.ok_or("No screen device found. Allow Screen Recording for SupaClip in macOS Settings, then reopen the app.")?;
    let mic = if microphone {
        mic.ok_or("No microphone found. Disable microphone in Settings or grant macOS microphone permission.")?
    } else {
        "none".into()
    };
    Ok((screen, mic))
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
pub fn start_session(state: State<'_, AppState>, fps: Option<u32>) -> Result<String, String> {
    let settings = super::settings::read_settings()?;
    let mut ffmpeg = state.ffmpeg_process.lock().map_err(|e| e.to_string())?;
    let mut current = state.current_session.lock().map_err(|e| e.to_string())?;
    if current.is_some() {
        return Err("Already recording".into());
    }

    let session_id = uuid::Uuid::new_v4().to_string();
    let tmp_dir = AppState::tmp_dir();
    fs::create_dir_all(&tmp_dir).map_err(|e| format!("Failed to create tmp dir: {}", e))?;

    let temp_path = tmp_dir.join(format!("{}.mp4", session_id));
    let fps_val = fps.unwrap_or(settings.fps);
    if ![15, 30, 60].contains(&fps_val) {
        return Err("Use 15, 30 or 60 fps.".into());
    }

    // Auto-detect correct screen capture and mic devices
    let (screen_idx, mic_idx) = detect_avfoundation_devices(settings.microphone_enabled)?;
    let input_spec = format!("{}:{}", screen_idx, mic_idx);

    let mut command = Command::new(crate::media::ffmpeg()?);
    command.args([
        "-f",
        "avfoundation",
        "-framerate",
        &fps_val.to_string(),
        "-capture_cursor",
        "1",
        "-i",
        &input_spec,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-g",
        &fps_val.to_string(),
        "-c:a",
        "aac",
        "-b:a",
        "128k",
    ]);
    match settings.resolution.as_str() {
        "720p" => {
            command.args(["-vf", "scale=1280:-2"]);
        }
        "1080p" => {
            command.args(["-vf", "scale=1920:-2"]);
        }
        "auto" => {}
        _ => return Err("Unsupported capture resolution".into()),
    }
    let mut child = command
        .args(crate::media::FRAGMENT_FLAGS)
        .arg("-n")
        .arg(&temp_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|_| {
            "FFmpeg could not start. Install FFmpeg and check macOS capture permissions."
                .to_string()
        })?;
    let startup = std::time::Instant::now();
    loop {
        if child
            .try_wait()
            .map_err(|_| "Could not check recorder process".to_string())?
            .is_some()
        {
            return Err("Recorder exited during startup. Check macOS Screen Recording and microphone permissions, then reopen SupaClip.".into());
        }
        if fs::metadata(&temp_path).is_ok_and(|m| m.len() > 0) {
            break;
        }
        if startup.elapsed() > std::time::Duration::from_secs(8) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Recorder did not start writing. Check capture permissions and try again. No successful recording is claimed.".into());
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    let session = RecordingSession {
        session_id: session_id.clone(),
        temp_path: temp_path.clone(),
        chunks_written: 0,
        bytes_written: 0,
        started_at: chrono::Local::now().format("%Y-%m-%d_%H-%M-%S").to_string(),
    };

    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;

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
                            unsafe {
                                libc::kill(pid as i32, libc::SIGINT);
                            }
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
    let mut process = state.ffmpeg_process.lock().map_err(|e| e.to_string())?;
    if let Some(child) = process.as_mut() {
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            *process = None;
            *state.current_session.lock().map_err(|e| e.to_string())? = None;
            return Err(
                "Recorder exited unexpectedly. Saved fragments are available in recovery.".into(),
            );
        }
    }
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
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions.get(&session_id).ok_or("Session not found")?;

    let temp_path = &session.temp_path;
    if !temp_path.exists() {
        return Err("Temp file not found".to_string());
    }

    let settings = super::settings::read_settings()?;
    let save_dir = settings
        .save_path
        .map(std::path::PathBuf::from)
        .unwrap_or_else(AppState::default_save_dir);
    fs::create_dir_all(&save_dir).map_err(|e| format!("Could not create save directory: {}", e))?;
    let ext = if settings.format == "webm" {
        "webm"
    } else {
        "mp4"
    };
    let filename = format!(
        "supaclip_{}_{}.{}",
        session.started_at,
        &session.session_id[..8],
        ext
    );
    let final_path = save_path
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| save_dir.join(filename));
    crate::media::remux(temp_path, &final_path)?;
    fs::remove_file(temp_path)
        .map_err(|_| "Recording saved, but temporary file cleanup failed.".to_string())?;

    app.asset_protocol_scope()
        .allow_file(&final_path)
        .map_err(|_| "Could not allow preview of saved file".to_string())?;
    let path_str = final_path.to_string_lossy().to_string();
    log::info!("Recording finalized and decode-checked");
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
    crate::media::validate_id(&session_id)?;
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
pub fn recover_file(
    app: tauri::AppHandle,
    session_id: String,
    save_path: Option<String>,
) -> Result<String, String> {
    crate::media::validate_id(&session_id)?;
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

    crate::media::remux(&temp_path, &final_path)?;
    let _ = fs::remove_file(&temp_path);

    app.asset_protocol_scope()
        .allow_file(&final_path)
        .map_err(|_| "Could not allow recovered preview".to_string())?;
    Ok(final_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_session_info(state: State<'_, AppState>) -> Result<Option<RecordingSession>, String> {
    let current = state.current_session.lock().map_err(|e| e.to_string())?;
    Ok(current.clone())
}
