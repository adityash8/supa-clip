use serde::Serialize;
use std::process::Command;

#[tauri::command]
pub fn show_in_folder(path: String) -> Result<(), String> {
    Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|e| format!("Failed to open Finder: {}", e))?;
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct UploadResult {
    pub url: String,
    pub key: String,
}

// S3 upload will be implemented when aws-sdk-s3 is added
// For now, provide a stub that returns the local file path
#[tauri::command]
pub async fn upload_to_s3(
    _file_path: String,
    _bucket: String,
    _access_key: String,
    _secret_key: String,
    _endpoint: String,
    _region: String,
) -> Result<UploadResult, String> {
    Err("S3 upload not yet configured. Please set up your S3 credentials in Settings.".to_string())
}

#[tauri::command]
pub fn get_file_info(path: String) -> Result<FileInfo, String> {
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;

    Ok(FileInfo {
        path: path.clone(),
        name: std::path::Path::new(&path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        size: metadata.len(),
        size_formatted: format_bytes(metadata.len()),
    })
}

#[derive(Debug, Serialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub size_formatted: String,
}

fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}
