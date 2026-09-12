# SafeFoto Family Stage 1F — mobile runtime test plan

Baseline: Immich 3.0.1, SafeFoto branch `feature/safefoto-family-stage1`.

This plan uses synthetic accounts and media only. Run it against an isolated test server. Do not use production credentials, customer data, or production storage.

## Static audit result

`SyncResetV1` is handled by `SyncStreamService`, which applies `SyncStreamRepository.reset()`, acknowledges the reset, and then awaits a second full sync stream. The reset does not log the user out and does not directly invoke the background upload queue or device-media deletion APIs.

| Data class                                                    | Reset behavior                                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Device assets, local albums, local album membership           | Preserved                                                                                                                     |
| Album backup selection and application settings               | Preserved                                                                                                                     |
| Background upload queue                                       | Not addressed by `SyncResetV1`; owned by `background_downloader`                                                              |
| Sync checkpoints                                              | Server session checkpoints are reset; the mobile client acknowledges and performs a full resync                               |
| Users and authenticated-user projection                       | Deleted, then rebuilt                                                                                                         |
| Remote albums, memberships, assets, EXIF and cloud-ID mapping | Deleted, then rebuilt                                                                                                         |
| Partners                                                      | Deleted, then rebuilt                                                                                                         |
| People, faces, memories, stacks, edits and OCR                | Deleted, then rebuilt                                                                                                         |
| Map, search and visible thumbnail references                  | Rebuilt from the deleted remote projections; native image bytes may remain cached but have no surviving database/UI reference |
| Notifications and shared links                                | No persistent mobile Drift tables in this version                                                                             |
| Token/session and Store settings                              | Preserved by `SyncResetV1`                                                                                                    |
| Logout or invalid session                                     | Remote projections and auth values are cleared; backup is disabled and account-bound upload tasks are cancelled               |

Exact storage boundary:

- **A. Device-local data preserved by sync reset:** `localAssetEntity`, `localAlbumEntity`, `localAlbumAssetEntity`, `trashedLocalAssetEntity`, `settingsEntity` and `storeEntity`. `linkedRemoteAlbumId` is deliberately nulled while the local album and its `backupSelection` survive.
- **B. Server-derived cache removed by sync reset:** `assetFaceEntity`, `memoryAssetEntity`, `memoryEntity`, `partnerEntity`, `personEntity`, `remoteAlbumAssetEntity`, `remoteAlbumEntity`, `remoteAlbumUserEntity`, `remoteAssetEntity`, `remoteExifEntity`, `stackEntity`, `authUserEntity`, `userEntity`, `userMetadataEntity`, `remoteAssetCloudIdEntity`, `assetEditEntity` and `assetOcrEntity`.
- **C. Upload/backup work:** the native `background_downloader` queue is outside Drift and is not called by sync reset. Candidate detection remains based on preserved local assets/albums and remote owner/checksum rows rebuilt by the full sync.
- **D. Authentication:** sync reset does not delete `StoreKey.accessToken`, `StoreKey.currentUser` or network settings. Logout/invalid-session cleanup does remove account auth/cache, disables backup and cancels account-bound queued uploads to prevent reuse by another login.

The automated tests cover the local database boundary and sync ordering. Native queue persistence, OS media libraries, image caches and real authentication transitions still require the following device tests.

## Common preparation

Create households A and B with synthetic accounts A1 and B1. Before isolation/reset, prepare A1's device with:

- one local photo already backed up;
- one local photo pending upload, preferably with upload paused by airplane mode;
- one own remote-only asset and album;
- synthetic B1 user, album, asset and partner/shared-album data visible in the pre-reset cache;
- a recognized person/face, location marker and searchable metadata if the platform/build supports them.

Record before every run:

- account and session ID (never record the token);
- local device-asset count;
- selected backup-album count and names;
- pending/running upload count;
- remote-asset, album, partner and people counts visible in the app;
- sync checkpoint/reset state from server logs;
- app version, OS version and timestamp.

## Android

1. Sign in as A1, enable backup for Camera, and confirm the prepared state.
2. Keep one photo pending by disabling connectivity immediately after it is discovered.
3. Change the test household projection so B1 is no longer visible to A1, and mark A1's session for sync reset.
4. Restore connectivity and capture filtered app logs from launch through completion of the second/full sync.
5. Confirm the local gallery and the pending photo remain present. Confirm Camera remains selected for backup.
6. Confirm B1, B1 albums/assets, stale partner data, people/faces, map markers and search results are absent.
7. Confirm A1's allowed data is rebuilt and thumbnails cannot be opened through history, search, map, notifications or cached screens.
8. Allow backup to continue. Confirm the pending photo uploads once, the already-backed-up photo is not uploaded again, and no duplicate remote assets appear.
9. Repeat with **Manage local media** both disabled and enabled. A reset event alone must not trash or delete local media in either mode.
10. Invalidate A1's server session. Confirm the app returns to login, removes A1's remote cache, disables backup and cancels account-bound queued work before B1 can sign in.
11. Sign in as B1 and confirm no A1 remote projection, thumbnail, search result or partner/person record is visible. Re-enable backup explicitly only after verifying the selected local albums.

## iOS

1. Sign in as A1, grant the intended Photos permission level, select the backup album and confirm the prepared state.
2. Keep one photo pending by disabling connectivity after discovery.
3. Change the test household projection, mark A1's session for sync reset, restore connectivity and capture device/app logs.
4. Confirm Photos-library assets and the pending photo remain present and backup selection remains enabled.
5. Confirm B1 user/album/asset/partner/person/map/search data disappears after the full resync and cannot be opened from a stale screen or cached thumbnail.
6. Let background upload resume. Confirm exactly one upload for the pending photo, no re-upload of the completed photo and no duplicate asset.
7. Repeat after backgrounding and force-closing the app between reset and full resync; the app must finish rebuilding safely on next launch.
8. Invalidate the session and confirm login routing, remote-cache cleanup, backup disablement and account-bound queue cancellation.
9. Sign in as B1 and confirm no A1 server-derived data is visible. Explicitly review backup album selection before enabling backup for B1.

## Evidence and acceptance record

For each platform attach:

- before/after counts for local, pending and remote assets;
- before/after album, partner and people counts;
- screenshots of backup selection and absence of foreign data;
- sync logs showing one reset acknowledgement followed by a completed full sync;
- upload task IDs/statuses before and after;
- server asset IDs/checksums proving no duplicate upload;
- session status before reset, after reset and after forced 401/re-login;
- any crash, stale screen, cached image or unexpected full-upload observation.

Stage 1F is accepted only when SF-FAM-MOB-001 through 008 pass in automation and both device plans pass. Static analysis or unit tests alone are not sufficient.
