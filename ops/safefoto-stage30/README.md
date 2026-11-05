# Stage 30 — E2E: three real TEST accounts and family membership

Date: 2026-11-05, Kris Standard. Test LAB at `http://192.168.0.188:13013`. Production My Free Server untouched.

## What was tested (actual login sessions and HTTP, not mocked)

- Python stdlib script `ops/safefoto-stage30/real_accounts_http_smoke.py` using an existing test admin login whose credentials are supplied by `SAFEFOTO_TEST_LOGIN_FILE` (never committed).
- Creates three **unique temporary TEST users** with randomly generated passwords: owner, member and outsider. Logins succeed using real `POST /auth/login`; no existing accounts were changed.
- Initially users belong to different households.
- Owner issues a real family invitation `POST /users/me/household/invitations`; member retrieves it through `GET /users/me/household/invitations/incoming` and accepts via `POST /users/me/household/invitations/:id/accept`. Both then have the same family/household ID, outsider differs.
- Owner uploads one unique synthetic PNG 8×8 through the standard Immich `POST /assets` API. Neither member nor outsider sees the photo in `GET /family/photos` before publication.
- Owner explicitly publishes photo with `PUT /family/photos/publication` (`mode=share`). Member sees the photo and downloads its original HTTP 200 (image/png); outsider neither sees metadata nor receives image bytes for its original.
- Member leaves family using `POST /users/me/household/leave`: photo disappears from family listing; subsequent original-file request is blocked with HTTP 400/403/404, no PNG bytes. Owner still sees the photo.
- Script cleanup: changes synthetic photo to `private` (204), deletes **only** the test photo (204), and invokes force removal for exactly the three newly created TEST accounts (3 × HTTP 200). The server may clean up those accounts asynchronously; HTTP 200 indicates request accepted, not verified physical deletion. No existing photos, albums, users, or family memberships changed.
- Real end-to-end workflow: **PASS**. Python syntax PASS; test Docker `safefoto-immich-family:stage26-gallery-20261105` HEALTHY. No application code, schema migrations or Docker changes.

## Notes and boundaries

- All stateful operations were performed on **the running TEST LAB database**, with disposable fixtures and explicit cleanup. The earlier Stage29B audit/deletion test ran separately on a disposable Testcontainers DB, with 3/3 tests PASS and a passing 7-test security regression.
- We now have actual 3-account login/invitation/revocation coverage, rather than just mocked authentication. This does not validate downloaded photo deletion from an end-user's device, offline cache erasure, or the iOS Immich app itself.
- For repeat, run:
```sh
cd /srv/tests/safefoto/family
PYTHONDONTWRITEBYTECODE=1 SAFEFOTO_TEST_LOGIN_FILE=/srv/tests/safefoto/immich-real/admin.credentials \
  /srv/tests/ui-tools/.venv/bin/python ops/safefoto-stage30/real_accounts_http_smoke.py
```
- For safety, run only in a controlled test environment. The script explicitly refuses non-LAN IP URLs, but do not repoint it at production.
- Git branch `test/safefoto-real-accounts-stage30-20261105` (based on Stage29B).
