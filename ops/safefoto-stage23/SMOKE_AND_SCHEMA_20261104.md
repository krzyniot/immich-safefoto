# SafeFoto — Stage 23: real authenticated browser smoke and schema drift audit

Date: 2026-11-04, 16:47 Europe/Warsaw. TEST kris-Standard only. No production changes.
This report contains no credentials, personal photo names, or binary media.

## Worker handoff
- Public landing website repository `/srv/tests/safefoto/web` has worker commit `3f003f9` on `feature/safefoto-hero-family-video-20261104`, confirmed present on remote GitHub.
- Worker logged 62 browser checks PASS for the laptop/phone video hero; the source has untracked older backups and previews. Leave it alone; do not merge it into Immich or change that branch.

## Authenticated Stage23 verification (existing TEST account, read only)
- Login successfully completed via Chromium/Playwright, no password printed or stored in Git.
- Path: `http://192.168.0.188:13013/family-photos`.
- Desktop Chromium viewport 1440×900: GET `/api/family/albums` and GET `/api/family/photos` returned HTTP 200, **23/23 photo thumbnails loaded**, modal preview opened, no horizontal overflow, no JS errors, no HTTP >=400 for the asset media requested.
- Mobile viewport 390×844: same results: **23/23 thumbnails loaded**, preview works, no horizontal overflow, no JS errors.
- Only 1 album option (all family photos); there are no family albums published on this test account. Consequently **actual album filtering with photos has not been verified**.
- An automatic and read-only regression script has been added as `ops/safefoto-stage23/browser_smoke.py`. It requires `SAFEFOTO_TEST_LOGIN_FILE`; never commit this credential file. It uses the pre-existing `/srv/tests/ui-tools/.venv` Playwright installation.
- These checks do NOT replace real two-user household revocation browser E2E or an official Immich mobile app smoke test.

## Schema drift investigation (READ ONLY)
- `docker exec safefoto-immich-real-lab-immich-server-1 immich-admin schema-check` returned exit 0 with `Migrations are up to date`, but **Detected schema drift**.
- Report contains 15 differences, including missing `user_delete_audit` function, the `api_key.isSystemManaged` type, defaults for household IDs/timestamps, missing invitation indexes, and check constraints.
- The command output suggests SQL, including dropping existing constraints/columns; **NO SQL was applied**. Automatic migration or schema repair would be risky without comparing SafeFoto custom migrations.
- Stage23 is WEB-only and inherited server Stage16; no new backend migrations were introduced in this step. Do not infer the drift began with Stage23.

## Follow-up
1. Create intentionally published family albums in an explicitly disposable test dataset to verify filtering. Avoid altering any real user data.
2. Read-only inspect schema differences against SafeFoto migrations and Immich overrides. Before any SQL changes, prepare rollback.
3. Smoke-test mobile Immich login and personal photo upload/backup on an actual mobile app.
4. Preserve GitHub pushes for code and documentation; My Free Server remains untouched.
