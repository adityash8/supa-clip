# SupaClip

**The crash-proof screen recorder. Your recording is saved. Always.**

Ever been 20 minutes into a perfect screen recording and the app just... dies? Recording gone. Poof. You stare at the screen. You question your life choices. You re-record it (worse the second time, obviously).

SupaClip says: **never again.**

We write your recording to disk in real-time, chunk by chunk. Kill the app. Pull the power cable. Throw your laptop into a lake (okay, don't do that). Your recording survives.

---

## Why SupaClip Exists

Loom got acquired. Prices skyrocketed. Recordings started vanishing during upload. The AI features started randomly cutting your videos. Teams went from paying $240/year to $24,000/year overnight.

Meanwhile, all people wanted was: **press a button, record screen, get a file.**

That's SupaClip. No cloud dependency. No subscription traps. No AI that "helpfully" shreds your timeline. Just a recorder that works.

---

## Features

### The Stuff That Matters

- **Crash-proof recording** — Chunks written to disk every second. App crashes? File's still there. We'll even ask if you want to recover it on next launch.
- **Offline-first** — No internet? No problem. Everything works locally. Upload is optional.
- **Instant launch** — ~10MB binary (not 150MB+ like Electron apps). Cold start under 500ms.
- **Hotkey toggle** — `Cmd+Shift+9` to start. Same combo to stop. Never leave your flow.
- **Trim editor** — Chop the "uhhh let me find the right tab" from the beginning and the "wait how do I stop this" from the end.
- **Floating HUD** — Minimal recording indicator showing duration and file size. Stays out of your way.
- **System tray** — Lives in your menu bar. Pulsing red dot when recording. You know, like a professional app.

### The Stuff That's Nice

- **Upload to S3/Bunny** — Optional cloud upload with link auto-copied to clipboard.
- **Webcam overlay** — Picture-in-picture for when people need to see your face.
- **Format options** — WebM (default, streaming-friendly) or MP4 (universal). 30fps or 60fps. Native resolution or downscaled.
- **Custom save location** — Pick your folder. Default: `~/Videos/SupaClip/`.
- **Recovery dialog** — Detects orphaned temp files on launch and offers to recover them.

---

## Tech Stack

| Layer | Tech | Why |
|---|---|---|
| Desktop shell | **Tauri v2** | Rust-powered, tiny binary, native performance |
| Frontend | **SvelteKit** | Fast, lightweight, great DX |
| Styling | **Tailwind CSS v4** | Rapid UI, consistent design |
| Recording | **MediaRecorder API** | Browser-native screen + mic capture |
| Video processing | **FFmpeg** (bundled) | Trimming, format conversion, crash recovery |
| Backend logic | **Rust** | Chunk writing, file I/O, clipboard, hotkeys |
| Settings | **Local JSON** | `~/.config/supaclip/settings.json` — human-readable, no database |

---

## How Crash-Proof Works

```
You hit record
       |
       v
  MediaRecorder captures video chunks (~1 second each)
       |
       v
  Rust backend appends each chunk to a temp file on disk
  (your recording exists as a playable file at ALL times)
       |
       v
  You stop recording normally?
       |
   YES |          NO (crash, power loss, rage quit)
       |               |
       v               v
  FFmpeg finalizes    Next launch detects the temp file
  & moves to your     "Hey, we found an unsaved recording.
  save folder          Want to recover it?"
                       |
                       v
                      You get your recording back.
                      Crisis averted. You're welcome.
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+
- **Rust** (latest stable) — [install via rustup](https://rustup.rs/)
- **Tauri CLI** — installed as a dev dependency
- **FFmpeg** — bundled with the app, but useful to have locally for development

### Development

```bash
# Install dependencies
npm install

# Run in development mode (opens the Tauri app with hot-reload)
npm run tauri dev

# Type-check the frontend
npm run check
```

### Build

```bash
# Create a production build
npm run tauri build
```

This outputs platform-specific installers in `src-tauri/target/release/bundle/`.

---

## Project Structure

```
supa-clip/
├── src/                          # SvelteKit frontend
│   ├── lib/
│   │   ├── components/
│   │   │   ├── IdleScreen.svelte       # "Ready to record" state
│   │   │   ├── DoneScreen.svelte       # Post-recording actions
│   │   │   ├── TrimEditor.svelte       # Trim start/end of recording
│   │   │   ├── SettingsPanel.svelte    # All the knobs and dials
│   │   │   ├── RecoveryDialog.svelte   # "We found a lost recording!"
│   │   │   └── WebcamOverlay.svelte    # PiP webcam feed
│   │   ├── recorder/
│   │   │   ├── mediaRecorder.ts        # MediaRecorder API wrapper
│   │   │   └── chunkWriter.ts          # Sends chunks to Rust backend
│   │   ├── stores/
│   │   │   ├── recording.ts            # Recording state management
│   │   │   └── settings.ts             # User preferences store
│   │   └── commands.ts                 # Tauri command bindings
│   └── routes/
│       ├── +page.svelte                # Main app window
│       └── hud/+page.svelte            # Floating recording HUD
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── commands/
│   │   │   ├── ffmpeg.rs               # FFmpeg operations (trim, convert)
│   │   │   ├── recording.rs            # Chunk writing, crash recovery
│   │   │   ├── settings.rs             # Settings load/save
│   │   │   └── upload.rs               # S3-compatible upload
│   │   ├── state.rs                    # App state management
│   │   ├── tray.rs                     # System tray icon + menu
│   │   ├── lib.rs                      # Plugin registration
│   │   └── main.rs                     # Entry point
│   └── tauri.conf.json           # Tauri configuration
├── viewer/                       # Standalone HTML video viewer
└── static/                       # Static assets
```

---

## Settings

Settings live at `~/.config/supaclip/settings.json`. Here's the full schema:

```jsonc
{
  "recording": {
    "format": "webm",           // "webm" or "mp4"
    "resolution": "native",     // "native", "1080p", "720p"
    "fps": 30,                  // 30 or 60
    "audioSource": "default"    // mic input device
  },
  "storage": {
    "savePath": "~/Videos/SupaClip/",
    "autoName": "timestamp"     // "timestamp" or "ask"
  },
  "hotkey": {
    "toggleRecording": "CommandOrControl+Shift+9"
  },
  "upload": {
    "enabled": false,
    "provider": "s3",           // S3-compatible storage
    "s3": {
      "bucket": "",
      "region": "",
      "accessKeyId": "",
      "secretAccessKey": "",
      "endpoint": "",
      "publicUrlBase": ""
    }
  }
}
```

---

## Platform Support

| Platform | Status |
|---|---|
| macOS (Apple Silicon) | Primary development target |
| macOS (Intel) | Supported via universal build |
| Windows 10/11 | Supported |
| Linux | Best-effort (screen capture APIs vary by DE) |

---

## Pricing Philosophy

**Recording is free. Forever. No limits. No time caps.**

We'll never charge you to record your own screen on your own computer. That's absurd.

Planned paid tier ($20/year) is for cloud features only — upload hosting, shareable links, that sort of thing.

---

## License

MIT

---

*Built with an mass amounts of mass frustration with existing screen recorders.*
