# Isolated SafeFoto + Immich test lab

Runtime directory: /srv/tests/safefoto/immich-real. Copy compose.yml there before running. Its .env and panel.env contain secrets and must stay outside Git with mode 0600.

- Immich (fork): http://192.168.0.188:13013
- SafeFoto panel: http://192.168.0.188:13014
- Original mock lab: http://192.168.0.188:13012 (separate Compose project)

The stack has its own PostgreSQL data, upload directory, Valkey, machine learning, SafeFoto backend and panel volumes. The panel's API key only has adminUser.read/create/update. Account deletion needs an additional permission before testing that path.

The fork image is built from commit a393d3ed6179ce135a62861ed438524a478140ed. Rebuild and update the tag for a newer commit. The source link is embedded in the image metadata.

The lab currently uses SAFEFOTO_SKIP_SWAGGER=1 because generated Swagger metadata crashes on a Zod Date codec. This disables only the API documentation route. Resolve this before production readiness.

A test administrator was created at stage13-real-admin@example.test. Its credentials stay only at /srv/tests/safefoto/immich-real/admin.credentials. The browser purchase check uses an account creation date 31 days in the past.
