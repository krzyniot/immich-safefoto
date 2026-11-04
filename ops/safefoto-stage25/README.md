# Safe Foto — Stage 25 (2026-11-04)

Test-only, Kris Standard, no production My Free Server changes.

- Implemented IntersectionObserver-based automatic pagination on `/family-photos` with a 300px prefetch margin. Preserves requestGeneration guarding against stale album/user responses and the manual button as a fallback when IntersectionObserver is unavailable. Stops loading at nextPage=null.
- Fixed month grouping to sort by displayed localDateTime (descending months and photos), avoiding misordered month sections when fileCreatedAt differs.
- Source branch `feature/safefoto-family-infinite-scroll-stage25-20261104`.
- Tests: web Vitest **20/20 PASS**; Svelte 0 errors/0 warnings; TypeScript and ESLint PASS; build PASS.
- Headless Chromium using synthetic intercepted 110-item pages: desktop 1440 and mobile 390 both fetched 3 pages exactly [1,2,3] and displayed 110 unique photos; no JS errors. Fake metadata is handled within the browser and did not enter the database.
- Authenticated live-gallery browser smoke: 23 family photos loaded on desktop and mobile, no errors. Two old QA albums remain listed but return no photos, including from direct GET; fixture state changed since Stage24. This is not an automatic-pagination regression, but previous Stage24 album photo smoke now requires fresh fixtures.
- Web-only derivative Docker image `safefoto-immich-family:stage25-infinite-20261104`, inheriting the Stage23 server, deployed via existing Compose overlay `/srv/tests/safefoto/immich-real/compose.stage25.override.yml`, only recreates immich-server.
- Stage23 Docker image and Compose overlay remain available for rollback. No database migrations, no backend code changes, no other containers touched.
- Run browser test: `SAFEFOTO_TEST_LOGIN_FILE=/srv/tests/safefoto/immich-real/admin.credentials /srv/tests/ui-tools/.venv/bin/python ops/safefoto-stage25/infinite_scroll_smoke.py` (TEST account only; no credentials in Git).
- Rollback: in `/srv/tests/safefoto/immich-real`, run `docker compose -f compose.yml -f compose.stage23.override.yml up -d --no-deps --force-recreate immich-server`.
- Native Immich fully virtualized TimelineManager and real mobile app compatibility still need later dedicated checks. This stage only adds infinite scroll with the existing monthly grid.
