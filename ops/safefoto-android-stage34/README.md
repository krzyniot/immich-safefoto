# Safe Foto Android — Stage 34: temporary cloud markers

On the personal timeline, a local-only image/video retains its crossed-out cloud while there is no confirmed remote copy. When the server reports a remote asset with a valid upload timestamp, a checked cloud is displayed for 15 minutes after that timestamp and then disappears. Older backed-up images/videos have no cloud overlay. The timer is scheduled only for a recent remote asset and is cancelled upon tile disposal. Reopening the app does not reset the time window.

The marker remains a presentation feature: it never mutates local files, server assets, backup jobs, or sync state. Missing or future timestamps do not trigger a false recent-upload confirmation. The existing user preference to hide storage indicators is preserved. The threshold should be used for the later iOS client as well.

Validation: six focused Flutter tests cover local-only, remote-only, merged, exact 15-minute boundary, reopening after 15 minutes, and missing/future timestamps. Static analysis of modified Dart files is clean.

Limitations: existing `uploadedAt` data is populated from the server's asset creation timestamp (via sync `createdAt`). That time is expected to correspond to server-side ingestion, but has not been separately verified against a physical-device upload. A device-level check remains advisable.

Build status on 2026-11-05: Android x64 profile build is blocked by the upstream sqlite3 3.3.2 native-asset downloader. The downloaded `libsqlite3.x64.android.so` fails its pinned SHA-256 validation (observed `bef140a1...`, expected `07a6c9f...`). The check was not bypassed and the existing Stage 33 APK was not replaced. New Stage 34 APK requires a clean, verified dependency download/build.
