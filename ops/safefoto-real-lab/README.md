# Isolated SafeFoto + Immich test lab

Runtime directory: /srv/tests/safefoto/immich-real. Copy compose.yml there before running. Its .env and panel.env contain secrets and must stay outside Git with mode 0600.

- Immich (fork): http://192.168.0.188:13013
- SafeFoto panel: http://192.168.0.188:13014
- Original mock lab: http://192.168.0.188:13012 (separate Compose project)

The stack has its own PostgreSQL data, upload directory, Valkey, machine learning, SafeFoto backend and panel volumes. The panel's API key only has adminUser.read/create/update. Account deletion needs an additional permission before testing that path.

The fork image uses the `stage13-swagger-fix` tag. Rebuild and update the tag for a newer commit. The source link and commit are embedded in the image metadata.

Swagger/OpenAPI is enabled. Household invitation dates use Immich's ISO datetime codec so their schema can be generated during server startup.

A test administrator was created at stage13-real-admin@example.test. Its credentials stay only at /srv/tests/safefoto/immich-real/admin.credentials. The browser purchase check uses an account creation date 31 days in the past.
