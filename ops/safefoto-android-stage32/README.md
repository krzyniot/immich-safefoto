# Safe Foto Android — Stage 32: kontynuacja istniejącego APK Stage31

Data: 2026-11-05. Wyłącznie kris-Standard. Kod: `/srv/tests/safefoto/family-selection` na gałęzi `fix/safefoto-android-stage32-tests-apk-20261105` bazującej na `checkpoint/2026-10-18-mobile-stage31`.

## Stan zastany
- Istnieje aplikacja Flutter Android z prywatnymi zdjęciami, galerią rodzinną, akcjami `share` i `move`, albumami, synchronizacją, lokalnym cache, polskimi etykietami i własną nawigacją Safe Foto.
- Istniejący APK Stage31: `/srv/tests/safefoto/builds/SafeFoto-Test-stage31-Samsung-arm64.apk` (2026-10-16, ok. 155 MiB).
- Pakiet `pl.safefoto.app`, wersja `3.0.1+3054`, minimalny Android API 26, target 36.
- Flutter 3.44.1, Dart 3.12.1, lokalne Android SDK w `/srv/tests/safefoto/toolchains/android-sdk`.

## Poprawki
1. `mobile/test/presentation/family_bulk_action_test.dart`: dodano testowy `appConfigProvider`; testy klikają aktualne etykiety przycisków `Do rodziny` oraz `Dla rodziny` zamiast starych nazw.
2. `mobile/lib/entities/store.entity.dart`: wcześniejszy `final Store = StoreService.I` zapamiętywał starą instancję StoreService po ponownej inicjalizacji; zastąpiono dynamicznym getterem `StoreService get Store => StoreService.I`. W aplikacji nadal używane jest bieżące konto/sesja. To usuwa problem wykorzystania przestarzałego cache po zmianie instancji magazynu w testach.

## Testy
- Początkowe 23 testy UI/rodzinne: 19 PASS / 4 FAIL (brak kontekstu settings, nieaktualne przyciski i odwołanie do starego store).
- Po poprawkach: **23/23 PASS**.
- Rozszerzona wyłącznie funkcjonalna próba rodzinna (11 plików: family gallery, publication, bulk selection, gallery models, timeline, sync, private visibility i family cache): **63/63 PASS**.
- Dart static analysis obu modyfikowanych plików: **0 issues**.
- Bardziej ogólny zestaw `test/presentation` objął starsze niezwiązane widgety; wynik 75 PASS/22 FAIL. W szczególności testy `drift_album_option_widget_test.dart` budują `BaseActionButton` bez `SettingsRepository`, a część oczekuje nieaktualnych surowych ikon; wymaga oddzielnej aktualizacji testowych harnessów. Tych błędów nie ukrywać.
- Nie wykonano testu na fizycznym Androidzie; `adb devices -l` nie zwróciło urządzenia.

## APK i ograniczenia
- Build profile arm64 `flutter build apk --profile --target-platform android-arm64 --no-pub`: **PASS**, ok. 129 s Gradle; wynik `SafeFoto-Test-Android-stage32-20261105-arm64.apk` w `/srv/tests/safefoto/builds/`, 162 111 342 bajty (ok. 155 MiB).
- SHA-256: `455cd8751054e730c4e656eb919cc1fae76b726f163c3916d5c4f17c00b357b4`. `aapt`: pakiet `pl.safefoto.app`, wersja `3.0.1 (3054)`, min API 26, target API 36, etykieta `SafeFoto`. `apksigner verify`: **PASS** (v2); testowy certyfikat Android Debug ma ten sam fingerprint SHA-256 co poprzedni Stage31.
- To **profilowy APK testowy**; brak podpiętego telefonu do ADB, więc nie zweryfikowano rzeczywistej instalacji ani backupu w tle.
- Ostrzeżenie podczas Gradle: część pluginów korzysta ze starego Kotlin Gradle Plugin i wymaga migracji przed przyszłą aktualizacją Fluttera.
- Wydanie profilowe/testowe, **niepodpisany produkcyjnie release** do Google Play. Nie podnosić wersji istniejącej produkcji ani nie modyfikować jej klucza podpisu.
- API testowe `http://192.168.0.188:13013` działa tylko w LAN i nie oznacza wdrożenia na produkcji.
- Produkcja My Free Server, Synology i osobny worker marketingowy nietknięte.
