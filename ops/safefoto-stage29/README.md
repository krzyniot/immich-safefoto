# Safe Foto — Stage 29: audyt schema drift (TYLKO ODCZYT)

Data: 2026-11-05, kris-Standard. Baza testowa `safefoto-immich-real-lab-database-1`. Produkcja My Free Server jest offline i **nie była dotykana**.

## Wynik
- `immich-admin schema-check`: exit 0; migracje oznaczone jako aktualne, ale **15 rozbieżności**.
- Weryfikacja DDL migracji Safe Foto, deklaracji `server/src/schema/tables` i odczyt informacji katalogowych PostgreSQL.
- Zero `ALTER`, `DROP`, `CREATE`, `UPDATE`, migracji, restartów i zmian danych. Nie wykonywano proponowanego przez schema-check SQL.
- Docker testowy: Stage26 healthy.

## Mapa wszystkich 15 rozbieżności

| # | Raport schema-check | Ustalenie i zalecenie |
|---|---|---|
| 1 | `FunctionCreate: user_delete_audit` | **WYSOKI PRIORYTET**. Kod oczekuje funkcji audytu użytkownika uwzględniającej `householdId` (migracja `1789146351047`; `schema/functions.ts`). Checker zgłasza jej brak. Katalog triggerów pokazuje wpis triggera `user_delete_audit` wskazujący na OID 18746, ale wyszukiwanie definicji funkcji nie dało potwierdzenia. Należy ustalić rzeczywisty schemat/funkcję/override przed testowaniem usuwania użytkowników. **Nie naprawiać automatycznie**. |
| 2 | `household.id` — default | DDL Safe Foto świadomie stosuje `immich_uuid_v7()`; generator chce `uuid_generate_v4()`. Nie cofać do v4 bez decyzji projektowej. |
| 3–4 | `api_key.isSystemManaged` DROP + ADD | Dwa wpisy są jedną rozbieżnością typu: DDL `boolean NOT NULL DEFAULT false` (migracja `1789180000000`), katalog DB potwierdza boolean; model `@Column({default:false})` jest przez generator wywnioskowany inaczej (VARCHAR). Automatyczny DROP+ADD zniszczyłby znaczniki chroniące konta panelu. **ZAKAZ automatycznego zastosowania**. |
| 5–6 | `family_album.publishedAt/updatedAt` — default | DDL `clock_timestamp()` a schema-check wymaga `now()`; różne znaczenie czasowe. Nie zmieniać w ciemno. |
| 7 | `family_album_mode_check` DROP | Własny CHECK ogranicza `defaultMode` do `share`/ `move`. Generator nie odtwarza tego CHECK. Pozostawić. |
| 8–9 | `family_asset.publishedAt/updatedAt` — default | DDL `clock_timestamp()` a model generuje `now()`; nie ma podstaw do usuwania celowego zachowania. |
| 10 | `household_invitation.id` — default | DDL `immich_uuid_v7()`; generator `uuid_generate_v4()`. Pozostawić do świadomego uzgodnienia. |
| 11–13 | 3 indeksy zaproszeń | Generator wymaga osobnych indeksów `householdId`, `adminId`, `inviteeId`; DDL posiada `household_invitation_pending_idx` unikalny częściowy (`householdId`, `inviteeId`) oraz `household_invitation_invitee_idx`. **Nie usuwać częściowego indeksu**, bo chroni przed wieloma aktywnymi zaproszeniami. Osobne indeksy mogą być ewentualnie dodatkowo potrzebne po analizie zapytań/EXPLAIN; to nie jest awaria migracji. |
| 14 | `household_invitation_status_check` DROP | CHECK ogranicza statusy do `PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`; generator nie modeluje CHECK. Pozostawić. |
| 15 | `OverrideUpdate function_user_delete_audit` | Wartość `migration_overrides` jest zapisana jako JSONB string (katalog zwrócił typ `string`, 351 znaków), a checker oczekuje zgodności z definicją funkcji. Wymaga diagnozy powiązanej z #1, bez bezpośredniej edycji override. |

## Potencjalne ryzyka i zalecana bezpieczna kolejność

1. **Najpierw przeanalizować #1 i #15** w odrębnym, jednorazowym klonie testowej bazy. Zweryfikować OID triggera w PostgreSQL, schemat funkcji, poprawność struktury `migration_overrides`, a następnie na danych fikcyjnych testować audyt usunięcia użytkownika. Nie usuwać ani nie modyfikować istniejącego konta.
2. Poprawić model deklaratywny SQL-tools, **zachowując** `isSystemManaged boolean`, `CHECK`, unikalny indeks częściowy i świadomie dobrane defaulty. Poprawki należy testować na izolowanej bazie i sprawdzać wynik schema-check przed jakimkolwiek wdrożeniem.
3. Rozbieżności indeksowe rozpatrywać według rzeczywistych potrzeb odczytu, bez kasowania mechanizmów integralności.
4. Po testach wykonać backup/rollback plan, a dopiero następnie podjąć decyzję o migracji *wyłącznie LAB*. Produkcja bez dostępu, pozostaje poza zakresem.

## Weryfikacje tylko do odczytu

```sh
docker exec safefoto-immich-real-lab-immich-server-1 immich-admin schema-check
docker exec safefoto-immich-real-lab-database-1 sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -c "SELECT table_name,column_name,data_type,column_default FROM information_schema.columns WHERE table_schema = '\''public'\'' AND table_name IN ('\''household'\'','\''household_invitation'\'','\''family_album'\'','\''family_asset'\'','\''api_key'\'');"'
```

**Uwaga:** skrypt SQL podany przez `schema-check` jest destrukcyjny dla części funkcji ochronnych Safe Foto. Nie wykonywać go w całości ani częściowo bez osobnego przeglądu migracji, uprawnień i kopii DB.

## Dowody lokalne i kod
- Pełny wynik `/tmp/safefoto-stage29-schema-check.txt` (odczyt z LAB).
- Migracje Safe Foto `server/src/schema/migrations/1789142247620`, `1789146351047`, `1789160000000`, `1789180000000`, `1789200000000`, `1789200000001`.
- Deklaracje `server/src/schema/tables` i `server/src/schema/functions.ts`.
- Git: gałąź `audit/safefoto-schema-drift-stage29-20261105`.

**Stan:** audyt rozpoznawczy skończony, żadna poprawka SQL nie została autoryzowana ani wprowadzona.
