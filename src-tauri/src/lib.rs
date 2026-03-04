mod commands;
mod state;
mod tray;

use state::AppState;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize app state
            app.manage(AppState::new());

            // Setup system tray
            tray::setup_tray(app.handle())?;

            // Ensure directories exist
            let _ = std::fs::create_dir_all(AppState::tmp_dir());
            let _ = std::fs::create_dir_all(AppState::default_save_dir());
            let _ = std::fs::create_dir_all(AppState::config_dir());

            // Check for recoverable files on launch
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(files) = commands::recording::list_recoverable() {
                    if !files.is_empty() {
                        let _ = handle.emit("recoverable-files-found", files.len());
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::recording::start_session,
            commands::recording::stop_session,
            commands::recording::get_recording_size,
            commands::recording::finalize_recording,
            commands::recording::list_recoverable,
            commands::recording::delete_recoverable,
            commands::recording::recover_file,
            commands::recording::get_session_info,
            commands::ffmpeg::trim_video,
            commands::ffmpeg::convert_to_mp4,
            commands::ffmpeg::fix_webm_headers,
            commands::ffmpeg::get_video_duration,
            commands::settings::read_settings,
            commands::settings::write_settings,
            commands::upload::upload_to_s3,
            commands::upload::get_file_info,
            commands::upload::show_in_folder,
        ])
        .on_window_event(|window, event| {
            // Hide to tray on close instead of quitting
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap_or_default();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
