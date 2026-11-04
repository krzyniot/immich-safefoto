# Test lab only. Preserve proven Stage16 server/API and mobile compatibility.
# Build context: web/build (output of `cd web && pnpm build`).
FROM safefoto-immich-family:stage16-preview
COPY --chown=root:root . /build/www/
LABEL safefoto.test.stage="23" \
      safefoto.test.origin="f6f2e6f8f" \
      safefoto.test.note="Stage16 server plus SafeFoto family WEB gallery"
