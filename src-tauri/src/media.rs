use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub const FRAGMENT_FLAGS: [&str; 6] = [
    "-movflags",
    "frag_keyframe+empty_moov+default_base_moof",
    "-frag_duration",
    "1000000",
    "-flush_packets",
    "1",
];

pub fn ffmpeg() -> Result<PathBuf, String> {
    for name in [
        "ffmpeg",
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
    ] {
        if Command::new(name)
            .arg("-version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
        {
            return Ok(PathBuf::from(name));
        }
    }
    Err("FFmpeg is unavailable. Install FFmpeg, then reopen SupaClip. No recording started.".into())
}

pub fn validate_id(id: &str) -> Result<(), String> {
    if id.len() != 36 || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("Invalid recording identifier".into());
    }
    Ok(())
}

pub fn remux(input: &Path, output: &Path) -> Result<(), String> {
    if input == output || output.exists() {
        return Err("Choose a new output file; existing files are never overwritten.".into());
    }
    let binary = ffmpeg()?;
    let mut command = Command::new(&binary);
    command.args(["-v", "error", "-n", "-i"]).arg(input);
    if output.extension().is_some_and(|ext| ext == "webm") {
        command.args(["-c:v", "libvpx", "-b:v", "2M", "-c:a", "libopus"]);
    } else {
        command.args(["-c", "copy", "-movflags", "+faststart"]);
    }
    let status = command
        .arg(output)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|_| "FFmpeg could not start. Original recording is retained.".to_string())?;
    if !status.success() {
        return Err("Recording repair/export failed. The original file is retained.".into());
    }
    let decode = Command::new(binary)
        .args(["-v", "error", "-xerror", "-i"])
        .arg(output)
        .args(["-f", "null", "-"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|_| "Playback validation could not start.".to_string())?;
    if !decode.success() {
        return Err("Export could not be decoded. Original recording is retained.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn forced_termination_recovers_decodable_fragments() {
        let dir = std::env::temp_dir().join(format!("supaclip-synthetic-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("interrupted.mp4");
        let output = dir.join("recovered.mp4");
        let mut child = Command::new(ffmpeg().unwrap())
            .args([
                "-v",
                "error",
                "-re",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=320x180:rate=15",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-g",
                "15",
            ])
            .args(FRAGMENT_FLAGS)
            .arg(&source)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(2600));
        child.kill().unwrap();
        child.wait().unwrap();
        assert!(std::fs::metadata(&source).unwrap().len() > 1000);
        remux(&source, &output).unwrap();
        let status = Command::new(ffmpeg().unwrap())
            .args(["-v", "error", "-xerror", "-i"])
            .arg(output)
            .args(["-f", "null", "-"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap();
        assert!(status.success());
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn refuses_path_traversal_and_overwrite() {
        assert!(validate_id("../../private").is_err());
        let path = Path::new("same.mp4");
        assert!(remux(path, path).is_err());
    }
}
