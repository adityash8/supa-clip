use std::process::{Command, Stdio};
use tauri::Manager;

fn execute(args: Vec<String>) -> Result<(), String> {
    let status = Command::new(crate::media::ffmpeg()?)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|_| "FFmpeg could not start. Install FFmpeg and retry.".to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("FFmpeg processing failed. Original file is retained; choose a new output and check the recording.".into())
    }
}

#[tauri::command]
pub async fn trim_video(
    app: tauri::AppHandle,
    input: String,
    output: String,
    start: f64,
    end: f64,
) -> Result<String, String> {
    if !start.is_finite() || !end.is_finite() || start < 0.0 || end <= start || input == output {
        return Err("Choose a valid start/end range and a different output file.".into());
    }
    let destination = output.clone();
    tokio::task::spawn_blocking(move || {
        execute(vec![
            "-v".into(),
            "error".into(),
            "-n".into(),
            "-ss".into(),
            format!("{start:.3}"),
            "-i".into(),
            input,
            "-t".into(),
            format!("{:.3}", end - start),
            "-c".into(),
            "copy".into(),
            output,
        ])
    })
    .await
    .map_err(|_| "Trim task failed".to_string())??;
    app.asset_protocol_scope()
        .allow_file(&destination)
        .map_err(|_| "Could not allow trimmed preview".to_string())?;
    Ok(destination)
}

#[tauri::command]
pub async fn convert_to_mp4(input: String, output: String) -> Result<String, String> {
    let destination = output.clone();
    tokio::task::spawn_blocking(move || {
        execute(vec![
            "-v".into(),
            "error".into(),
            "-n".into(),
            "-i".into(),
            input,
            "-c:v".into(),
            "libx264".into(),
            "-c:a".into(),
            "aac".into(),
            output,
        ])
    })
    .await
    .map_err(|_| "Conversion task failed".to_string())??;
    Ok(destination)
}

#[tauri::command]
pub async fn fix_webm_headers(input: String, output: String) -> Result<String, String> {
    let destination = output.clone();
    tokio::task::spawn_blocking(move || {
        crate::media::remux(std::path::Path::new(&input), std::path::Path::new(&output))
    })
    .await
    .map_err(|_| "Repair task failed".to_string())??;
    Ok(destination)
}

#[tauri::command]
pub async fn get_video_duration(input: String) -> Result<f64, String> {
    tokio::task::spawn_blocking(move || {
        let result = Command::new(crate::media::ffmpeg()?)
            .args(["-i", &input, "-f", "null", "-"])
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .output()
            .map_err(|_| "Could not inspect video".to_string())?;
        for line in String::from_utf8_lossy(&result.stderr).lines() {
            if let Some(duration) = line
                .split("Duration:")
                .nth(1)
                .and_then(|s| s.split(',').next())
            {
                let parts: Vec<f64> = duration
                    .trim()
                    .split(':')
                    .filter_map(|s| s.parse().ok())
                    .collect();
                if parts.len() == 3 {
                    return Ok(parts[0] * 3600.0 + parts[1] * 60.0 + parts[2]);
                }
            }
        }
        Err("Could not determine video duration".into())
    })
    .await
    .map_err(|_| "Video inspection failed".to_string())?
}
