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

fn upload_url(endpoint: &str, bucket: &str, key: &str) -> Result<String, String> {
    let host = endpoint
        .strip_prefix("https://")
        .ok_or("Use an HTTPS S3 provider endpoint")?;
    if host.len() > 253
        || !host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
        || host.contains('/')
        || host.contains('@')
        || host.contains(':')
        || ![
            "amazonaws.com",
            "r2.cloudflarestorage.com",
            "digitaloceanspaces.com",
            "backblazeb2.com",
        ]
        .iter()
        .any(|suffix| host.ends_with(&format!(".{suffix}")))
    {
        return Err("Use an AWS S3, Cloudflare R2, DigitalOcean Spaces or Backblaze B2 HTTPS endpoint without a path.".into());
    }
    if bucket.is_empty()
        || bucket.len() > 63
        || !bucket
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
    {
        return Err("Invalid S3 bucket name".into());
    }
    Ok(format!("https://{host}/{bucket}/{key}"))
}

#[tauri::command]
pub async fn upload_to_s3(
    file_path: String,
    bucket: String,
    access_key: String,
    secret_key: String,
    endpoint: String,
    region: String,
) -> Result<UploadResult, String> {
    if [access_key.as_str(), secret_key.as_str(), region.as_str()]
        .iter()
        .any(|v| {
            v.is_empty()
                || v.len() > 256
                || v.chars().any(|c| c.is_control() || c == '"' || c == '\\')
        })
    {
        return Err(
            "Check saved S3 credentials and region. They must not contain control characters."
                .into(),
        );
    }
    let key = format!(
        "supaclip_{}.{}",
        uuid::Uuid::new_v4(),
        if file_path.ends_with(".webm") {
            "webm"
        } else {
            "mp4"
        }
    );
    let endpoint = if endpoint.is_empty() {
        "https://s3.amazonaws.com".to_string()
    } else {
        endpoint.trim_end_matches('/').to_string()
    };
    let url = upload_url(&endpoint, &bucket, &key)?;
    let destination = url.clone();
    tokio::task::spawn_blocking(move || {
        use std::io::Write;
        let mut child = Command::new("curl").args(["--disable","--fail","--silent","--proto","=https","--max-time","120","--connect-timeout","10","--upload-file",&file_path,"--config","-"])
            .stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn()
            .map_err(|_| "curl is unavailable; install curl with AWS SigV4 support.".to_string())?;
        // Secrets go through stdin, never process arguments or logs. No shell is used.
        let config = format!("url = \"{url}\"\nuser = \"{access_key}:{secret_key}\"\naws-sigv4 = \"aws:amz:{region}:s3\"\n");
        if let Some(mut input) = child.stdin.take() { input.write_all(config.as_bytes()).map_err(|_| "Could not configure upload".to_string())?; }
        let status = child.wait().map_err(|_| "Upload process failed".to_string())?;
        if !status.success() { return Err("S3 upload failed. Check endpoint, region and bucket permissions. Your local file is retained.".to_string()); }
        Ok(())
    }).await.map_err(|_| "Upload task failed".to_string())??;
    Ok(UploadResult {
        url: destination,
        key,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_private_and_credential_endpoints() {
        for endpoint in [
            "http://localhost",
            "https://127.0.0.1",
            "https://user@host.amazonaws.com",
            "https://host.amazonaws.com/private",
            "https://host.amazonaws.com:443",
            "https://host\n.amazonaws.com",
        ] {
            assert!(upload_url(endpoint, "bucket", "key").is_err());
        }
        assert!(upload_url("https://s3.amazonaws.com", "bucket", "key").is_ok());
    }
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
