# Safe Foto — Stage 27: HTTP media access revocation

Date: 2026-11-05. TEST kris-Standard. Production My Free Server untouched.

## Implementation and actual test scope

- New `server/test/medium/specs/safefoto-family-stage27-http-media-revocation.spec.ts`.
- The test uses **actual NestJS AssetMediaController, actual AssetMediaService method implementations**, real AccessRepository + FamilyPhotoRepository + UserRepository on an **isolated disposable PostgreSQL/Testcontainers** instance. Real Express HTTP response handling sends a disposable generated 1×1 PNG file from a temporary directory; the physical-media lookup is stubbed only to redirect file paths to that fixture. Authentication tokens are synthetic per-user labels mapped by a mocked AuthService.authenticate; real user credential/login processing is NOT tested.
- Two scenarios:
  1. Owner publishes photo, member sees media HTTP 200, outsider cannot; member leaves family, media access is refused; owner retains access. Family photo API list for former member empty.
  2. Owner publishes photo, member sees media, owner marks it Private, member immediately loses access; owner retains access.
- Each scenario checks three real media HTTP routes: `GET /assets/:id/original`, `GET /assets/:id/thumbnail?size=thumbnail`, `GET /assets/:id/thumbnail?size=preview`. Media bytes and image/png are returned for authorized access, and no image/png is returned after revocation.
- Actual denial statuses differ (400 and 404) depending on endpoint; tests accept either status and assert that **no image bytes** are served. This is a behavior discrepancy worth harmonizing in the future; no change to server error semantics was made today.
- Regression: **26/26 PASS** across 7 medium suites (Stage14/15A/15B/19/22/24/27). TypeScript `pnpm check` PASS, ESLint and Prettier PASS.

## Important security limitation

- `sendFile` uses `CacheControl.PrivateWithCache` for media: headers allow a browser to retain previously fetched bytes for a time. A server-side revocation prevents **new network responses** but cannot retroactively erase files already saved on a user's device. Family web client uses refreshed cache keys after membership revalidation; this mitigates stale UI but does not delete offline copies. Do not claim absolute deletion or erasure.
- Not a full two-account login E2E through real Immich sessions. This is strong HTTP-controller/service/repository integration on an isolated DB and a disposable fixture file.

## Environment and next work

- No running LAB database changes; no Docker rebuild or server restart. Existing `safefoto-immich-family:stage26-gallery-20261105` remains healthy.
- Worker landing-page branch `feature/safefoto-hero-family-video-20261104` untouched.
- Follow-up: real two-user login/HTTP test in disposable LAB accounts with actual images, cache policy assessment (especially already downloaded bytes), mobile Immich app compatibility, and safe read-only schema drift audit before backend deployments.
- Source code on dedicated Git branch `test/safefoto-family-http-media-stage27-20261105`.
