# Stage26 — gallery layout and photo preview
Date 2026-11-05. TEST ONLY on kris-Standard. My Free Server production unchanged.
- Source: branch feature/safefoto-family-gallery-stage26-20261105.
- Family gallery: fixed month group headings, responsive denser thumbnail grid (3,4,6,7,8 columns by viewport), subtle hover interaction disabled for reduced motion.
- Preview: previous/next buttons, arrow keyboard navigation, Escape to close, close button and click backdrop, current position/total.
- Existing access refresh generation safeguards and infinite pagination unchanged; no backend/DB changes.
- Quality: Svelte check 0 errors/0 warnings, TypeScript check PASS, ESLint PASS, web Vitest 20/20 PASS, static build PASS.
- Authenticated browser checks: 1440px and 390px gallery navigation PASS; old browser smoke: 23/23 images load in both viewports and API status 200; no JS errors/overflow.
- TEST Docker image safefoto-immich-family:stage26-gallery-20261105, only immich-server recreated, healthy. Compose overlay /srv/tests/safefoto/immich-real/compose.stage26.override.yml. Stage25 image preserved.
- Rollback: cd /srv/tests/safefoto/immich-real && docker compose -f compose.yml -f compose.stage25-clean-header.override.yml up -d --no-deps --force-recreate immich-server
- Note: this stage improves the current family grid, not a rewrite to native Immich TimelineManager. No official mobile app e2e tests were claimed.
