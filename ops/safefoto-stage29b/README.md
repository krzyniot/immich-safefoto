# Safe Foto Stage29B — audyt rzeczywistej funkcji usuwania użytkowników

Data: 2026-11-05. Środowisko: Kris Standard, WYŁĄCZNIE testowe PostgreSQL.

## Wynik

- Wbrew sformułowaniu `FunctionCreate ... missing` z `immich-admin schema-check`, w działającym LAB baza `public.user_delete_audit()` faktycznie istnieje (OID 18746), jest powiązana z aktywnym triggerem na `public.user`, a ciało funkcji zapisuje zarówno `userId` jak i `householdId`. Wcześniejsze niepełne wyniki odczytu katalogu PostgreSQL były mylące; Stage29 należy w tym zakresie skorygować.
- `migration_overrides.function_user_delete_audit` jest przechowywane jako wartość `jsonb` typu `string`. Rozbieżność zgłoszona przez generator jest prawdopodobnie związana z porównaniem reprezentacji/definicji, lecz **nie wykazano dokładnej przyczyny**. Nie należy automatycznie modyfikować override ani uruchamiać SQL wygenerowanego przez checker.
- Nowy izolowany test integracyjny `server/test/medium/specs/safefoto-family-stage29b-user-audit.spec.ts`: aktualny trigger i funkcja istnieją; twarde usunięcie fikcyjnego użytkownika zapisuje poprawny rekord `user_audit` ze snapshotem `householdId`; miękkie usunięcie nie tworzy rekordu; inne konto pozostaje.
- Test w disposable PostgreSQL/Testcontainers **3/3 PASS**; regresja Stage19/24/27/29B **7/7 PASS**; TypeScript i ESLint PASS.
- Działająca baza testowego LAB była jedynie odczytywana do weryfikacji definicji, bez zmian danych. Żaden rzeczywisty użytkownik ani jego zdjęcia nie zostały usunięte.
- Pozostałe rozbieżności schema-check Stage29 pozostają otwarte. Nie uruchomiono migracji, nie zmieniono schematu.

## Ograniczenia i dalszy plan

Test poprawności triggera dotyczy isolated PostgreSQL, a porównanie kodu z katalogiem dotyczy działającego LAB. Nie obejmuje wszystkich ścieżek kaskadowych usuwania kont lub odzyskiwania danych. Zalecane później: oddzielny test końcowy dwóch faktycznych kont HTTP, diagnostyka reprezentacji override w sql-tools oraz świadome ujednolicenie modelu deklaratywnego z zachowaniem ograniczeń integralności.

Gałąź: `test/safefoto-user-audit-stage29b-20261105`. Produkcja My Free Server i inne projekty nie były dotykane.
