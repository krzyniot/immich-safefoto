# Safe Foto Stage 28 — standard Immich mobile API compatibility

Date: 2026-11-05. Device: kris-Standard. Environment: existing test LAB `http://192.168.0.188:13013`. Production My Free Server untouched.

## Test method

The standard Immich mobile client (Flutter) uses generated OpenAPI endpoints; the expected operations were inspected in `mobile/lib/services/server_info.service.dart`, `mobile/lib/infrastructure/repositories/sync_api.repository.dart`, and `mobile/lib/repositories/asset_api.repository.dart`.

Added `ops/safefoto-stage28/mobile_api_smoke.py`: executable Python stdlib-only HTTP test using the **real server /auth/login response token** and real standard Immich API URLs, on an existing TEST user. Credentials come ONLY from `SAFEFOTO_TEST_LOGIN_FILE`, never in source, Git or console. The test creates a unique artificial 8×8 PNG, uploads it **privately**, fetches its standard asset metadata and original bytes, verifies its ID is not in the family photo listing, deletes ONLY the created test photo, and logs out the temporary authenticated session.

Command:
```sh
cd /srv/tests/safefoto/family
SAFEFOTO_TEST_LOGIN_FILE=/srv/tests/safefoto/immich-real/admin.credentials \
  /srv/tests/ui-tools/.venv/bin/python ops/safefoto-stage28/mobile_api_smoke.py
```

## Real TEST LAB results — two complete runs

- `GET /api/server/version`: HTTP 200, semver fields (v3.0.1).
- `POST /api/auth/login`: HTTP 201 (real password-based session), returns standard token; `POST /api/auth/validateToken`: HTTP 200, authStatus true.
- `GET /api/server/features`, `/server/config`, `/server/storage`: HTTP 200, valid JSON.
- `GET /api/users/me`, `/users/me/preferences`: HTTP 200, valid JSON.
- `GET /api/albums`, `/assets/statistics`, `/sync/ack`: HTTP 200, valid JSON.
- `POST /api/sync/stream` with standard version-3 mobile sync types `AuthUsersV1`, `UsersV1`, `AssetsV2`, `AlbumsV2`: HTTP 200, JSON-lines content type, 15 events first run and 16 second (parsed without logging user data); actual mobile full list of types is broader and not fully exercised.
- `POST /api/assets` standard multipart PNG upload: HTTP 201 CREATED in both runs, unique synthetic image.
- `GET /api/assets/:id` metadata: HTTP 200, correct owner and ID; `GET /api/assets/:id/original`: HTTP 200 and real PNG signature.
- `GET /api/family/photos`: HTTP 200; the just-uploaded synthetic personal image did **not** appear in the family listing, preserving default-private behavior.
- `DELETE /api/assets` for **only** the synthetic image: HTTP 204. `POST /api/auth/logout`: HTTP 200. No image asset/album from other users was altered.

## Scope and limitations

- This is an **actual HTTP contract and upload/download smoke test**, *not an actual iOS/Android application UI test*. No iPhone/Android device or simulator was connected, and the official Immich mobile app was not launched. In particular, automatic background camera backups, iOS photo library permissions, local mobile sqlite migrations, notifications, all sync stream entity types, and large HEIC/4K videos were **not tested**.
- The server binary/API is still based on Stage16; web-only Stage26 image is running, Docker HEALTHY. No new API or database migrations deployed, no container restarts.
- This test intentionally does not publish a photo to a family album. The mobile client should continue to operate against the **standard** Immich API; the SafeFoto family features are additional endpoints.
- Existing schema drift warning remains; do not automatically execute its suggested SQL.
- Future: test an actual iPhone with official Immich against :13013 on LAN (login, select photos, enable background backup, albums, playback) and complete full mobile sync contract with current API generated schema. Avoid using real personal media during initial tests.

Git branch: `test/safefoto-mobile-api-stage28-20261105`.
