use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub async fn trim_video(
    app: AppHandle,
    input: String,
    output: String,
    start: f64,
    end: f64,
) -> Result<String, String> {
    let start_str = format!("{:.3}", start);
    let end_str = format!("{:.3}", end);

    let result = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create ffmpeg sidecar: {}", e))?
        .args([
            "-y",
            "-i", &input,
            "-ss", &start_str,
            "-to", &end_str,
            "-c", "copy",
            &output,
        ])
        .output()
        .await
        .map_err(|e| format!("ffmpeg failed: {}", e))?;

    if result.status.success() {
        Ok(output)
    } else {
        Err(format!(
            "ffmpeg trim failed: {}",
            String::from_utf8_lossy(&result.stderr)
        ))
    }
}

#[tauri::command]
pub async fn convert_to_mp4(
    app: AppHandle,
    input: String,
    output: String,
) -> Result<String, String> {
    let result = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create ffmpeg sidecar: {}", e))?
        .args([
            "-y",
            "-i", &input,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "128k",
            &output,
        ])
        .output()
        .await
        .map_err(|e| format!("ffmpeg failed: {}", e))?;

    if result.status.success() {
        Ok(output)
    } else {
        Err(format!(
            "ffmpeg convert failed: {}",
            String::from_utf8_lossy(&result.stderr)
        ))
    }
}

#[tauri::command]
pub async fn fix_webm_headers(
    app: AppHandle,
    input: String,
    output: String,
) -> Result<String, String> {
    let result = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create ffmpeg sidecar: {}", e))?
        .args([
            "-y",
            "-i", &input,
            "-c", "copy",
            &output,
        ])
        .output()
        .await
        .map_err(|e| format!("ffmpeg failed: {}", e))?;

    if result.status.success() {
        Ok(output)
    } else {
        Err(format!(
            "ffmpeg fix headers failed: {}",
            String::from_utf8_lossy(&result.stderr)
        ))
    }
}

#[tauri::command]
pub async fn get_video_duration(
    app: AppHandle,
    input: String,
) -> Result<f64, String> {
    let result = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create ffmpeg sidecar: {}", e))?
        .args([
            "-i", &input,
            "-f", "null",
            "-",
        ])
        .output()
        .await
        .map_err(|e| format!("ffmpeg failed: {}", e))?;

    // Parse duration from ffmpeg stderr output
    let stderr = String::from_utf8_lossy(&result.stderr);
    for line in stderr.lines() {
        if line.contains("Duration:") {
            if let Some(dur_str) = line.split("Duration:").nth(1) {
                if let Some(time_str) = dur_str.split(',').next() {
                    let parts: Vec<&str> = time_str.trim().split(':').collect();
                    if parts.len() == 3 {
                        let hours: f64 = parts[0].parse().unwrap_or(0.0);
                        let minutes: f64 = parts[1].parse().unwrap_or(0.0);
                        let seconds: f64 = parts[2].parse().unwrap_or(0.0);
                        return Ok(hours * 3600.0 + minutes * 60.0 + seconds);
                    }
                }
            }
        }
    }

    Err("Could not determine video duration".to_string())
}
