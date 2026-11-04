# Safe Foto Stage 23 — WEB family timeline on the existing test stack

Date: 2026-11-04. Test environment only: kris-Standard 192.168.0.188:13013.
The user explicitly permits losing TEST photos, but the production My Free Server must never be touched.

## What is actually deployed
- New `/family-photos` page with a family album filter and date/month/year navigation; use authenticated session for actual photo browsing.
- Existing proven `safefoto-immich-family:stage16-preview` server/API; the image only adds the rebuilt static `/build/www` frontend. No new backend binary or intentional database schema changes.
- Container `safefoto-immich-real-lab-immich-server-1`: `safefoto-immich-family:stage23-web-20261104`.
- New image ID: `sha256:eb67bfedea6ec515a4c3fe99fc0c229c3b962961d61ddd5d1332fdd69de7ec64`; previous image ID `sha256:de6c05afa3b8b2d139b04d8d7ec8f9ed80d6d55a915815eb852762369160ad74`.
- Source Git at build time: `f6f2e6f8f`, branch `test/safefoto-family-http-medium-20261104`. No merge to main.

## Build (reproducible on the existing Kris Standard)
```sh
cd /srv/tests/safefoto/family/web
pnpm check:svelte && pnpm check:typescript
pnpm test --run src/lib/services/safefoto-family-photo.service.spec.ts src/lib/services/safefoto-family-photo-groups.spec.ts src/lib/services/safefoto-family-album.service.spec.ts
pnpm build

cd /srv/tests/safefoto/family
docker build --pull=false -t safefoto-immich-family:stage23-web-20261104 -f ops/safefoto-stage23/Dockerfile web/build
```

## Deploy (TEST LAB ONLY)
Copy `ops/safefoto-stage23/compose.stage23.override.yml` to `/srv/tests/safefoto/immich-real/compose.stage23.override.yml`, then:
```sh
cd /srv/tests/safefoto/immich-real
docker compose -f compose.yml -f compose.stage23.override.yml up -d --no-deps --force-recreate immich-server
docker inspect -f '{{.State.Health.Status}}' safefoto-immich-real-lab-immich-server-1
```
Do not run `docker compose down -v`, `up --renew-anon-volumes` or any database reset.

## Rollback (TEST LAB ONLY)
The older overlay `compose.stage16.override.yml` still exists. If Stage23 fails, switch ONLY the server container back:
```sh
cd /srv/tests/safefoto/immich-real
docker compose -f compose.yml -f compose.stage16.override.yml up -d --no-deps --force-recreate immich-server
```

## Actual checks, 2026-11-04
- WEB Svelte 0 errors/warnings, TypeScript PASS, Vitest **19/19 PASS**, Vite static build PASS.
- Backend Family medium regressions earlier today **23/23 PASS** (isolated PostgreSQL/Testcontainers).
- Docker build PASS, Docker Compose recreate `immich-server` only PASS.
- Server health **healthy**; GET `/` HTTP 200; GET `/family-photos` HTTP 200.
- GET `/api/server/ping` and `/api/server/version`: HTTP 200. Unauthenticated GET family photos/albums/sync: HTTP 401.
- Panel port 13014 HTTP 302 as expected, public test WWW 18090 HTTP 200.
- Static `/build/www/index.html` SHA256 equals locally rebuilt `web/build/index.html`: `0a8b4d04012a2477474f8b7b0eb1ae7f613842af2136ed3a83b689e3ba41b969`.
- Both before/after image tags remain available. No changes to My Free Server.

## Known limitations and next work
1. Not yet verified in a browser WITH authenticated household accounts; HTTP 200 for static `/family-photos` alone does NOT prove that private images load. Check member and nonmember after user tests.
2. Official mobile Immich must be smoke-tested after this change (login, upload, private photos, standard albums). No mobile code was modified, but compatibility is not automatically proven.
3. Docker logs include `Detected schema drift` warnings (Microservices and API). This may predate this frontend-only update. Investigate read-only before server/backend migrations; no new migrations implemented in Stage23.
4. Current gallery is a page/grid with month/year jump and manual pagination, **not yet the fully native virtualized TimelineManager**.
5. GitHub contains source+recipe, not photo/media or database backups. A 2026-11-04 logical database dump exists locally, but media are intentionally not backed up per owner's test-only decision.
6. Rebuild depends on the older Stage16 base image. It is present locally, but not yet archived to a remote image registry. A server-total-loss recovery would require rebuilding that base or securing an image artifact separately.
