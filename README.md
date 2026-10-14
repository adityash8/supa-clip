# SupaClip

Record a deliberately selected screen, review locally and choose whether to upload or share. The browser app runs on SvelteKit/Vercel. The existing macOS Tauri recorder remains available from the same codebase.

## Browser workflow

1. Open the recorder in desktop Chromium over HTTPS (localhost works in development).
2. Confirm you have permission to record the content. Choose a tab, window or screen. Microphone is off by default and asks for separate permission when enabled.
3. Stop to preview and download WebM. Chunks are saved in IndexedDB. An interrupted recording may be recoverable, but arbitrary crashed media playback is not guaranteed; browser storage can be evicted. Download recordings you need to keep.
4. Sign in with a verified email code, review the clip, and confirm private upload. Limits: 5 minutes, 50 MB per clip, 20 private/pending clips per account.
5. Explicitly create a seven-day link. Anyone with the link can view the clip. Revoke or delete to block new access; already issued media URLs expire within 60 seconds.

The labeled ten-second sample is synthetic video without screen or audio capture. It cannot upload or share. No recording uploads automatically.

## Development and checks

```sh
npm install
npm run dev
npm run check
npm run lint
npm test
npm run build
npm run test:browser
npm run test:native
npm run build:native
```

`npm test` executes domain, Supabase adapter, actual PostgreSQL SQL/RLS (PGlite) and Stripe signature/gate tests without production accounts. Browser acceptance injects only synthetic canvas/audio streams. Native tests generate a test video, force-kill FFmpeg, remux fragments and decode the result.

## Cloud configuration (parent-owned)

Review and apply [supabase/supaclip.sql](supabase/supaclip.sql) to the shared Supabase project. All tables, functions and private buckets use `supaclip_` prefixes. Do not modify other products' auth or storage policies.

Server-only environment: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. No credentials are embedded in the browser. Configure Supabase email delivery and an email OTP template that contains `{{ .Token }}`. The app accepts email codes rather than authentication links. No global auth change is made by this repository.

`SUPACLIP_BILLING_MODE=pilot` (default) enables the free pilot with the same server-enforced quotas. Paid hosting requires `SUPACLIP_BILLING_MODE=paid`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` (USD 8/month recurring), and `STRIPE_WEBHOOK_SECRET`. Point verified subscription/invoice/checkout webhook events to `/api/stripe-webhook`. Checkout return URLs grant no entitlement. Recording, local download, library playback and deletion remain available after cancellation.

Configure a protected scheduler to call `/api/maintenance` with `Authorization: Bearer <SUPACLIP_MAINTENANCE_SECRET>` every 15 minutes. It purges expired incomplete uploads and deletion retries in bounded batches. Do not log this header. Storage backup deletion within 30 days is a provider/operator retention setting, not an application guarantee.

Optional server-only analytics: `POSTHOG_API_KEY` and `POSTHOG_HOST` (`https://us.i.posthog.com` or `https://eu.i.posthog.com`). Only explicit allowlisted events are sent; no autocapture/replay, titles, media, paths, share tokens or payment details. Missing configuration returns an explicit disabled result. Paid conversion emits only after a verified paid Stripe invoice.

Vercel uses `npm run build`. Native uses `npm run build:native`; the adapter is selected explicitly by `NATIVE_BUILD=1` so native builds retain their static assets. No deployment runs as part of development or tests.

## Native recorder

macOS/AVFoundation capture uses installed FFmpeg (PATH, Homebrew or `/usr/local/bin`), with fragmented MP4 written every second. Startup rejects missing screen devices and FFmpeg failures; it never falls back to the camera as a screen. Microphone and webcam are off in new settings. Recording status remains visible if the main window is closed during capture.

Native settings choose MP4/WebM export, FPS, scaled resolution, save directory and shortcut. Export/recovery remuxes and validates decode before deleting the source fragments. Old unfragmented damaged MP4 files may be irreparable. Trim uses the installed FFmpeg; stream-copy boundaries follow keyframes. Custom output files are not overwritten.

Optional native S3 upload uses installed curl with AWS SigV4 support. Supported endpoints: AWS S3, Cloudflare R2, DigitalOcean Spaces and Backblaze B2. Credentials are passed through process stdin, not command arguments or logs. The copied object URL obeys the bucket's access policy and is not a guarantee of public playback. Browser sharing uses private Supabase storage instead.

No native installer is offered by the web app. Tauri runtime permissions, macOS signing/notarization and installer testing are separate release gates. FFmpeg is not bundled. See [implementation evidence and exact story coverage](docs/IMPLEMENTATION.md).
