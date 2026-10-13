# SupaClip implementation

## Correction checks declared before edits (2026-10-13)

- Staged parts: `npm test` must prove finalization records its time, a ready clip is not swept while a signed part URL may remain valid, a failed purge remains eligible, and a successful purge after the window is marked complete. The schema change must be additive in this unapplied SQL.
- Project gates: `npm run check`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:browser` (browser execution may require the parent's macOS environment).

### Correction result

The unapplied `supabase/supaclip.sql` adds nullable `supaclip_clips.finalized_at`, set atomically by `supaclip_finalize`. The installed `@supabase/storage-js` documents signed upload URLs as valid for two hours (`StorageFileApi.ts`); ready-clip stage cleanup waits three hours from finalization to cover outstanding URLs for uploads finalized late in their 24-hour session. A failed Storage remove leaves `parts_cleaned_at` null, so maintenance retries; only a successful remove marks it complete. No existing data is deleted or rewritten. The server's internal clip row has an added timestamp; endpoint requests and responses are unchanged. Parent must review/apply this revised unapplied schema before deploying the corresponding code and keep the 15-minute maintenance schedule.

Correction verification (local, no cloud operations): `npm run check` exit 0 (`svelte-check found 0 errors and 0 warnings`); `npm run lint` exit 0; `npm test` 31/31 passed, including PostgreSQL finalization-time eligibility and failed/successful Storage purge tests; `npm run build` exit 0 (`Using @sveltejs/adapter-vercel`, `✔ done`); `git diff --check` exit 0. `npm run test:browser` exited 1 with all 10 tests blocked before page load by Chromium `bootstrap_check_in ... Permission denied (1100)` in the macOS sandbox. Parent must run the browser suite outside this sandbox and perform the real signed PUT/finalization/late-write check after applying SQL.

## Plan before editing

Authorization: build the appended web PRD's US-001–005 and preserve the native Tauri recorder. Parent owns install assistance, migrations, credentials, deployment and independent review. Original clone is read-only; its only dirty item is `.vscode/`, unrelated to product behavior.

1. Keep SvelteKit, incumbent zinc/red task UI and native screens. Select static adapter only for explicit native builds; Vercel for web. Add deliberate browser capture, separate optional mic consent, visible stop/status, 5-minute/50 MB caps, IndexedDB chunks, local recovery, preview/download and a labeled synthetic 10-second sample. No automatic upload.
2. Implement verified Supabase Auth, isolated `supaclip_` private storage and tables, resumable upload with ownership, signature/size/duration finalization, 20 retained clip quota, expiring hashed/revocable shares, 60-second playback URLs and safe deletion. SQL is review-only. Configuration failures retain local work.
3. Preserve native features; fix durable MP4 fragments, startup/device failures and recovery decode. Never capture real human media during testing. Native installer/signing remains a reported runtime gate unless a bundle is actually built.
4. Free pilot is parent notes' default. Implement a server-verified Stripe adapter/gate if paid mode is selected; no fabricated payment status. Analytics payloads contain only allowed enums/timing, no media/paths/tokens.

## Checks that prove the work

- `npm run check`: Svelte/TypeScript typecheck.
- `npm run lint`: ESLint on changed web code; Rust formatting/check separately.
- `npm test`: domain/adapter tests for auth/ownership, incomplete uploads, signatures/limits, quota, expiring/revoked links, deletion and persistence failures.
- `npm run build`: Vercel production build.
- `npm run build:native`: static native frontend compatibility.
- `npm run test:browser`: Chromium synthetic capture, mic opt-in, denial, stop/track cleanup, playback/download, IndexedDB reload recovery, sample isolation, upload failure, mobile flow.
- `npm run test:native`: synthetic FFmpeg fragmented recording, forced process termination, recovery remux and decode. `cargo check --manifest-path src-tauri/Cargo.toml` for Rust commands (subject to cached crates).

## Scope decisions

Use WebM VP8/VP9 + optional Opus for browser uploads. Codec compatibility is tested, not universally guaranteed. IndexedDB can retain chunks but arbitrary interrupted browser media may not decode; UI must state this. Native app remains macOS/AVFoundation; cross-platform packaging is not claimed. Future: extension, webcam in web, AI, transcription, advanced editing, teams/custom domains. Historical S3/native trim remain native features.

## Implemented story coverage

| PRD story / capability | Implementation and proof | Live gate |
| --- | --- | --- |
| US-001: private clip access | Verified Supabase email identity and HttpOnly session/refresh cookies; owner-bound queries; private `supaclip_media` and `supaclip_parts`; no client object read/list policies; ready-only 60-second playback/download. PostgreSQL RLS and foreign-owner/no-signed-URL tests pass. | Parent SQL migration, server env and email setup. |
| US-002: sample/privacy | Bundled 10-second synthetic WebM, labeled sample mode; no capture, upload or share controls for sample. `first_recording_previewed` includes sample/real and elapsed milliseconds. Optional tested PostHog adapter sends only allowed properties. | Browser test and rendered screenshot review; optional PostHog project. |
| US-003: deliberate capture | Click-triggered `getDisplayMedia`, microphone off by default with separate `getUserMedia`; selected surface without system audio; consent checkbox; sticky visible status/stop. Track cleanup on cancel, mic denial, encoder/storage failures, stop and page disposal. Five-minute and 50 MB retained-media caps. Orchestration tests pass. | Desktop Chromium real picker/codec/permission check. No real screen/audio captured during this work. |
| US-004: review/upload/recovery | IndexedDB durable chunks, interrupted recovery, local preview/download; no auto-upload. Confirmed resumable immutable 5 MB parts, 15-second part timeout/one retry, 24-hour sessions, atomic 20-clip quota including live pending uploads. Server checks actual size, SHA-256 equality, WebM signature/container, VP8/VP9 video, optional Opus, duration <=300s before ready. Failure retains local file. Provider, SQL and storage-failure tests pass. | Real Supabase Storage CORS/signed PUT/finalization test, including 50 MB load within Vercel 60s. |
| US-005: share/revoke/delete | Explicit creation shows scope and seven-day expiry before separate Copy action; random 256-bit tokens stored as SHA-256 hashes. Token in viewer URL fragment, not request URL/log. Expired/revoked/deleted links deny playback. Delete tombstones/revokes before purge; cleanup failures preserve denial and can retry. Ownership/expiry/revocation/delete tests pass. | Real two-account and forwarded/revoked link check; maintenance scheduler and provider backup retention. |
| Monetization | Free pilot default; quotas always enforced by server SQL. Paid mode requires a verified paid Stripe invoice and unexpired subscription. Checkout verifies USD 8/month price, reuses an hourly idempotency key and rejects already active accounts. Signed webhooks read current subscription truth. Returns grant no paid status. Download/deletion remain available after cancellation. Signature/unpaid/gate tests pass. | Parent payment decision; Stripe config/webhook only if paid mode chosen. No charges executed. |
| Instrumentation | Allowlisted preview/upload/share/confirmed subscription events. No autocapture/replay or media, titles, paths, signed URLs, share tokens or payment details. Disabled/provider-error results do not claim delivery. Analytics tests pass. | Optional PostHog server-only key/allowlisted host. |
| Incumbent native recorder | Native route selection and static build preserved. Installed FFmpeg, explicit device/startup errors, fragmented MP4 flushes, decode-checked remux/export/recovery; format/FPS/resolution/save directory respected. Mic/webcam default off. Registered shortcut, safe output/no overwrite, trim via installed FFmpeg. S3 stub replaced by real curl SigV4 adapter with fixed provider host validation and credential stdin. Native compile and synthetic forced-kill/decode/security tests pass. | macOS permissions, full Tauri runtime/shortcut/custom-folder testing, real optional S3 config, signing/notarization/package release. |

Trimming, S3 settings, local save location and hotkeys remain native features. Native webcam is a preview overlay; the web MVP excludes webcam. Removed the unused old browser recorder/chunk-writer helpers that invoked a nonexistent native `write_chunk` command. No extension, transcription, AI, teams, advanced editor or custom-domain phase was substituted into V1. No LLM is used.

## Passing checks and evidence

| Exact command | Result |
| --- | --- |
| `npm run check` | Exit 0: `svelte-check found 0 errors and 0 warnings`. |
| `npm run lint` | Exit 0. TypeScript and Svelte ESLint on web/server/routes/tests. |
| `npm test` | Exit 0: `tests 29; pass 29; fail 0`. Real WebM fixture, actual PostgreSQL/RLS via PGlite, IndexedDB semantics via fake-indexeddb, provider and billing/analytics adapters. |
| `npm run build` | Exit 0: `Using @sveltejs/adapter-vercel` / `✔ done`. |
| `npm run build:native` | Exit 0: `Using @sveltejs/adapter-static` / `Wrote site to "build"` / `✔ done`. |
| `npm run test:native` | Exit 0: 2 passed; synthetic FFmpeg recording killed forcibly, remuxed and decoded. |
| `CARGO_HOME=/private/tmp/supaclip-cargo cargo check --offline --manifest-path src-tauri/Cargo.toml` | Exit 0: `Finished dev profile`. |
| `CARGO_HOME=/private/tmp/supaclip-cargo cargo test --offline --manifest-path src-tauri/Cargo.toml --lib` | Exit 0: 3 passed; durable media, traversal/overwrite and private/credential endpoint denial. |
| `/private/tmp/supaclip-rustup/toolchains/stable-aarch64-apple-darwin/bin/rustfmt --check --edition 2021 --config skip_children=true src-tauri/src/media.rs src-tauri/src/lib.rs src-tauri/src/commands/recording.rs src-tauri/src/commands/settings.rs src-tauri/src/commands/ffmpeg.rs src-tauri/src/commands/upload.rs` | Exit 0. Formats only touched Rust modules. |
| `node scripts/smoke.mjs` (against `npm run preview -- --host 127.0.0.1 --port 4173`) | Exit 0: `/`, `/share`, `/sample.webm` return 200; `/api/session` without config returns 503, honest local guidance and no-store. |
| `npm run test:browser -- --list` | Exit 0: 10 Chromium flow tests discovered. Test discovery is not browser execution. |
| `node ../../.codex/skills/impeccable/scripts/detect.mjs --json src/lib/web/WebRecorder.svelte src/routes/share/+page.svelte src/routes/+page.svelte src/app.css` | `[]` saved in `docs/design-detector.json`. Incumbent zinc/red Operate world preserved. This is not visual acceptance. |
| `npm audit --omit=dev --json` | Exit 0: runtime advisories total 0. Full install audit reports 6 low-severity development advisories after in-range dependency updates. |
| `git diff --check` | Exit 0. |

Non-failing build notices: static fallback overwrites its prerendered index as incumbent native configuration does; native Tauri imports are unused in the SSR build and mixed static/dynamic imports remain in incumbent modules. No build or type errors.

## Blocked / external checks

`npm run test:browser` failed before any page loaded: macOS sandbox denied Chromium Mach port registration (`bootstrap_check_in ... Permission denied (1100)`). The first nine test launches were blocked; a tenth full sign-in/upload/share/revoke/delete test was subsequently added and successfully discovered. Parent must run the complete suite outside this sandbox, inspect its desktop/mobile screenshots and console, and fix any real failures before release. No browser rendering, media playback in Chromium, permission-picker behavior or browser acceptance is claimed passed here. Node capture lifecycle and media-parser checks passed separately.

Initial default-cache npm/Cargo installs failed because the sandbox cannot write home caches. Dependencies and native crates were then installed into writable temporary caches. Initial missing `http-range`/rustfmt blockers are resolved. A temporary Rust toolchain provides rustfmt; parent may use its own normal toolchain/cache.

No live Supabase migration, email send, production upload, PostHog call, Stripe checkout/payment, native human-screen/audio capture, commit, push, deployment, PR or merge occurred. Parent owns the fresh independent review and all release/cloud operations. Original dirty clone was read only; unrelated `.vscode/` changes were not incorporated. No separate prior root SupaClip audit/evidence file was found in the supplied worktree/canonical root docs/tasks or temporary evidence locations; full PRD and actual incumbent implementation were used, not a narrow prior experiment.

## Configuration and release prerequisites

1. Parent reviews/applies `supabase/supaclip.sql`. All tables/functions/buckets/policy names are prefixed; no existing global auth, other product policies or CI files change. Private buckets: `supaclip_media` (50 MB, WebM) and `supaclip_parts` (5 MB, octet-stream).
2. Server env: `SUPABASE_URL` (HTTPS `*.supabase.co`), `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. All are server-only; no public browser env needed. Configure Supabase email delivery and an OTP template containing `{{ .Token }}`. Test fresh signup, code expiration, refresh/30-day return, two-account isolation and logout revocation. This repo does not change shared Auth templates automatically.
3. Set `SUPACLIP_BILLING_MODE=pilot` for free pilot (default). For paid mode use `paid` plus server-only `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` (USD 8/month), `STRIPE_WEBHOOK_SECRET`; configure subscription/invoice/checkout webhooks to `/api/stripe-webhook`. Test genuine provider sandbox payment/retry/cancellation before a paid launch. Caller IDs/checkout returns never grant entitlement.
4. Optional analytics env: `POSTHOG_API_KEY`, `POSTHOG_HOST` (`https://us.i.posthog.com` or `https://eu.i.posthog.com`). Off by default; explicit allowlisted events only.
5. `SUPACLIP_MAINTENANCE_SECRET`: parent schedules protected `GET /api/maintenance` every 15 minutes. Never log its Authorization header. Sessions become ineligible at 24 hours; cleanup purges expired/incomplete media and retries tombstoned objects. Signed stage URLs are provider-expiring; a delayed sweep after three hours covers late stage writes. Batches are bounded to 100 rows, oldest first, with purge markers to avoid indefinite starvation. Monitor backlog to maintain primary purge within 24 hours. Provider/operator must configure backup expiry <=30 days; code cannot certify external backup deletion.
6. Parent deploys Vercel with `npm run build`, Node 22, provider env, HTTPS. Validate maximum-size finalization within configured 60-second function limit and region/connectivity. Adapter config is the only web deployment change; original config backups are in docs. No native download CTA exists.
7. Native release: installed FFmpeg with AVFoundation/H264/VP8/Opus, curl with AWS SigV4 for optional S3, macOS Screen Recording/mic/camera permission as chosen, Info.plist descriptions, Tauri runtime/manual tests, then signing/notarization/build. Native synthetic tests terminate FFmpeg, not the entire Tauri process; abrupt app-child lifecycle and actual OS permission prompts remain runtime checks. Old unfragmented MP4s may not be repairable. Power loss and arbitrary browser crash playback are not guaranteed.

## Public API / contract changes for parent review

All JSON endpoints live at `/api/[action]`; writes require same-origin POST except verified Stripe webhook. Bounded request bodies; provider failures are sanitized and non-cached. No caller-supplied user identity is used.

- Auth: `POST sign-in {email}`, `POST verify {email,code}`, `GET session`, `POST sign-out {}`. Verified email identity and refresh via HttpOnly cookies; server logout revokes current provider session before clearing cookies.
- Library: `GET clips`; `POST begin {title,size,duration,type:'video/webm',fingerprint:SHA256}` returns an owner-scoped reserved clip/session. `POST part {id,part}` returns existing-part status or immutable signed stage PUT URL. `POST finalize {id}` verifies bytes/container/codecs/duration, creates private final object, and marks ready; retry is idempotent.
- Owner media: `POST playback {id}`, `POST download {id}` return media URL with TTL 60 seconds. Both deny incomplete/deleted/foreign objects; download remains usable after subscription cancellation.
- Sharing/deletion: `POST share {id}` returns one newly generated token and seven-day expiry (replaces previous hash); `POST revoke {id}`; `POST delete {id}`. `POST view {token}` validates hash/expiry/revocation/ready state before signed URL. `/share#token` keeps bearer token out of URL request logs.
- Billing/telemetry/maintenance: `POST checkout {}` only in paid mode; signed `POST stripe-webhook`; `POST event {event:'first_recording_previewed',properties}` is rate-limited and sends only allowed properties; protected `GET maintenance` runs retention/purge retries. Analytics disabled/provider-error results never claim successful delivery.
- Native recording state adds `saving` during repair/export and defaults camera requests off. Native settings add `microphone_enabled:false` with serde default for existing config. New defaults are MP4, no mic/webcam; existing settings are read. Format/resolution/save path now affect actual capture/export. `start_session` remains caller-compatible and respects stored mic choice. Internal injected AppHandle parameters do not change JS invocation. S3 invoke parameters now match the existing JS caller and execute actual upload.
- Native `beforeBuildCommand` uses explicit static build; asset protocol is enabled for incumbent save/temp locations plus explicit newly exported files. Added microphone/camera Info.plist descriptions. Existing deployment configs backed up before editing. Removed unused internal recorder/chunk-writer modules; no exported application endpoint relied on them.

## Changed file list

- `.gitignore`
- `README.md`
- `docs/IMPLEMENTATION.md`
- `docs/design-detector.json`
- `docs/svelte.config.original.js`
- `docs/tauri.conf.original.json`
- `eslint.config.js`
- `package-lock.json`
- `package.json`
- `playwright.config.ts`
- `scripts/smoke.mjs`
- `scripts/test-native.mjs`
- `src-tauri/Cargo.lock`
- `src-tauri/Cargo.toml`
- `src-tauri/Info.plist`
- `src-tauri/src/commands/ffmpeg.rs`
- `src-tauri/src/commands/recording.rs`
- `src-tauri/src/commands/settings.rs`
- `src-tauri/src/commands/upload.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/media.rs`
- `src-tauri/tauri.conf.json`
- `src/app.css`
- `src/lib/commands.ts`
- `src/lib/components/DoneScreen.svelte`
- `src/lib/components/IdleScreen.svelte`
- `src/lib/components/NativeRecorder.svelte`
- `src/lib/components/RecoveryDialog.svelte`
- `src/lib/components/SettingsPanel.svelte`
- `src/lib/components/TrimEditor.svelte`
- `src/lib/recorder/chunkWriter.ts`
- `src/lib/recorder/mediaRecorder.ts`
- `src/lib/server/analytics.ts`
- `src/lib/server/auth.ts`
- `src/lib/server/billing.ts`
- `src/lib/server/clips.ts`
- `src/lib/server/domain.ts`
- `src/lib/server/media.ts`
- `src/lib/server/provider.ts`
- `src/lib/stores/recording.ts`
- `src/lib/stores/settings.ts`
- `src/lib/web/WebRecorder.svelte`
- `src/lib/web/capture.ts`
- `src/lib/web/cloud.ts`
- `src/lib/web/drafts.ts`
- `src/routes/+page.svelte`
- `src/routes/api/[action]/+server.ts`
- `src/routes/hud/+page.svelte`
- `src/routes/share/+page.svelte`
- `src/routes/share/+page.ts`
- `static/sample.webm`
- `supabase/supaclip.sql`
- `svelte.config.js`
- `tests/adapters.test.ts`
- `tests/analytics.test.ts`
- `tests/browser/recorder.spec.ts`
- `tests/domain.test.ts`
- `tests/local-capture.test.ts`
- `tests/persistence.test.ts`

Coordination: `docs/PARENT_NOTES.md` reread before final verification. Branch: `codex/prd-working-version`. No agent-owned commit created.
