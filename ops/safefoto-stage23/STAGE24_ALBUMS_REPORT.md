# Safe Foto Stage24 — test albumów rodzinnych w backendzie i przeglądarce
Data: 2026-11-04 ok. 16:55–17:01 Europe/Warsaw.
Tylko testowy kris-Standard. Produkcja My Free Server nietknięta.

## TEST medium/HTTP na izolowanym PostgreSQL
- Nowy test `server/test/medium/specs/safefoto-family-stage24-albums-http-filtering.spec.ts` korzysta z realnego NestJS Controller, FamilyAlbumService i FamilyAlbumRepository, Kysely i jednorazowej bazy Testcontainers. Sesje HTTP mapowane przez testowy AuthService na fikcyjne konta (nie pełna weryfikacja standardowego logowania).
- Dwie fikcyjne rodziny i dwa osobne albumy, po jednej własnej fotografii. Członek widzi oba albumy i dokładnie jedno zdjęcie we właściwym albumie; outsider nie widzi żadnego. Po przeniesieniu członka do innego gospodarstwa nie widzi już albumów ani zdjęć; właściciel nadal ma dostęp.
- Pełna regresja Stage14/15/15B/19/22/24: **24/24 PASS** (6 zestawów).
- TypeScript `pnpm check` PASS, ESLint testu PASS.

## Rzeczywisty LAB Docker :13013
- Na istniejącym zalogowanym koncie testowym było 23 zdjęcia rodzinne, lecz żadne nie było jego własnością; **nie wykorzystywano cudzych zdjęć**.
- Wygenerowano w przeglądarce dwa sztuczne PNG z napisami QA, przesłano je na to samo konto przez `POST /api/assets` (2×201). Następnie utworzono dwa zwykłe albumy (2×201) i świadomie opublikowano je w rodzinie przez `PUT /api/family/albums/:id/publication` (2×204, tryb share). Są to testowe fikcyjne dane, które właściciel dopuszcza do utraty; nie odczytywano ani nie modyfikowano fotografii innych kont.
- Nazwy albumów: `SafeFoto QA Stage24 1` oraz `SafeFoto QA Stage24 2`.
- Zalogowany Chromium desktop 1440×900: selektor ma 3 opcje, dwa albumy osobno zwracają dokładnie po jednym załadowanym sztucznym zdjęciu; HTTP GET `/api/family/albums/:id/photos` 200 dla obu.
- Zalogowany Chromium mobilny viewport 390×844: identyczne wyniki, bez błędów JavaScript; pierwotna rodzinna oś po publikacji liczy 25 zdjęć.
- Test jest powtarzalny i tylko do odczytu na istniejących fixtures: `ops/safefoto-stage23/album_browser_smoke.py`, wymaga zmiennej `SAFEFOTO_TEST_LOGIN_FILE`. Nie zawiera haseł ani prywatnych zdjęć w kodzie.
- Aktualny obraz to nadal `safefoto-immich-family:stage23-web-20261104`, kontener healthy. Nie przebudowano produkcji ani kontenerów backendu/DB.

## Audyt schema drift — ostrożność
- `immich-admin schema-check` 04.11 pokazał 15 rozbieżności; migracje wykonane, brak bezpośrednio wykrytej awarii.
- Migracja SafeFoto `1789180000000-ProtectSafeFotoPanelApiKey` dodaje kolumnę `api_key.isSystemManaged` jako `boolean`; proponowany auto-diff sugeruje DROP/ADD typu varchar. **Nie wykonywać!** Może to wyzerować flagi zabezpieczające klucze panelu.
- Migracja `1789200000001-AddSafeFotoFamilyAlbum` tworzy `family_album_mode_check`; schema-check sugeruje usunięcie tego constraint. Nie usuwać bez przejrzenia modelu.
- Migracja `1789160000000-AddSafeFotoHouseholdInvitations` tworzy własne indeksy i constraint zaproszeń. Auto-diff proponuje inne indeksy i zniesienie ograniczenia statusu. Nie stosować automatycznie.
- Funkcja `user_delete_audit` była modyfikowana przez naszą migrację `1789146351047`, ale schema-check pokazuje jej brak: wymaga osobnego odczytowego sprawdzenia zależności i migracji.
- Wniosek: część drift wynika z rozbieżności modeli deklaratywnych i niestandardowych migracji SafeFoto; pełna analiza pozostałych różnic jeszcze wymagana. Nie wprowadzać SQL na podstawie wygenerowanej propozycji.

## Git / dalsze prace
- Repo `krzyniot/immich-safefoto`, gałąź `test/safefoto-family-albums-http-stage24-20261104`. Pierwszy commit `e9792b181` z testem medium; kolejny commit z przeglądarkowym testem i raportem.
- Nie dotykano `/srv/tests/safefoto/web` — gałąź workera filmowego pozostała nienaruszona.
- Następne: dopracowanie wirtualizowanej, płynnej osi czasu, kontrola wielu stron/lat, test dwukontowy w działającym LAB, a przed zmianą backendu wyjaśnienie schema drift.
