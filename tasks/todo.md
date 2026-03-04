# SupaClip - Task Tracker

## Phase 0: Strategy & Planning
- [x] Deep research on Loom user complaints
- [x] Competitive landscape analysis (Cap.so, Tella, Screen Studio, OBS, Screenity)
- [x] Apply growth + product mental models
- [x] Generate positioning angles
- [x] Build detailed PRD
- [x] Honest critique of the idea
- [ ] User selects positioning angle
- [x] Finalize tech architecture decisions

## Phase 1: Scaffold + Configuration
- [x] Install Rust toolchain
- [x] Scaffold Tauri v2 + SvelteKit project
- [x] Configure SPA mode (adapter-static, ssr: false)
- [x] Install + configure Tailwind CSS v4
- [x] Configure tauri.conf.json (main window, permissions)
- [x] Configure capabilities/default.json with plugin permissions
- [x] Install Tauri plugins (global-shortcut, clipboard, fs, shell, notification, dialog)

## Phase 2: Recording Engine
- [x] mediaRecorder.ts (getDisplayMedia + MediaRecorder + chunk sending)
- [x] chunkWriter.ts for queued writes
- [x] recording.rs (start_session, write_chunk, finalize, list_recoverable)
- [x] state.rs (AppState with session management)
- [x] Recording state machine store (Svelte)
- [x] Settings store

## Phase 3: Hotkey + System Tray
- [x] tray.rs — system tray with menu (Show, Start/Stop, Quit)
- [x] Tray icon click → show window
- [x] toggle-recording event from tray/hotkey
- [x] Global shortcut registration in lib.rs

## Phase 4: UI Components
- [x] IdleScreen (record button, hotkey hint, settings gear)
- [x] Recording state in main page (duration, file size, stop button)
- [x] DoneScreen (file info, trim/upload/finder buttons)
- [x] SettingsPanel (recording, hotkey, S3 upload config)
- [x] WebcamOverlay (circle video, configurable position)
- [x] RecoveryDialog (list recoverable files, recover/delete)
- [x] HUD page (floating toolbar for recording)

## Phase 5: Trimming + ffmpeg
- [x] ffmpeg.rs commands (trim, convert_to_mp4, fix_headers, get_duration)
- [x] TrimEditor component (video preview, dual-handle slider)

## Phase 6: Upload + Sharing
- [x] upload.rs (S3 stub — ready for aws-sdk-s3)
- [x] get_file_info command
- [x] Viewer page (static HTML with video player + branding)

## Phase 7: Settings + Polish
- [x] settings.rs (read/write JSON at ~/.config/supaclip/)
- [x] Default settings with sensible defaults
- [x] .gitignore updated for Tauri

## BLOCKER
- [ ] Accept Xcode license: `sudo xcodebuild -license accept`
- [ ] Verify Rust backend compiles
- [ ] Day 0 POC: verify getDisplayMedia works in Tauri webview
- [ ] Download + bundle ffmpeg sidecar binary
- [ ] End-to-end test: record → stop → finalize → play

## Future (v0.2)
- [ ] System audio capture (ScreenCaptureKit)
- [ ] Native Rust recording engine
- [ ] aws-sdk-s3 full implementation
- [ ] Auto-updater
- [ ] Windows/Linux builds
