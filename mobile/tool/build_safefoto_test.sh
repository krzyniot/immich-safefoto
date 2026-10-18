#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Explicit test endpoint: never fall back to the production login server.
exec "${FLUTTER_BIN:-flutter}" build apk --profile --target-platform android-arm64 --no-pub \
  --dart-define=SAFEFOTO_SERVER_URL=http://192.168.0.188:13013
