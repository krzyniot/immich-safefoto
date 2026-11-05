# Safe Foto — Stage32: wirtualizacja galerii rodzinnej

Data: 2026-11-05. TEST: Kris Standard, `http://192.168.0.188:13013/family-photos`.

## Zmiany

- `web/src/lib/services/safefoto-family-photo-virtualization.ts`: deterministyczny układ spłaszczonych wierszy z nagłówkami miesięcy, liczba kolumn 3/4/6/7/8 wg responsive viewport. Binary-search okna renderowania, overscan 1000px, górny i dolny dystans zachowują stałą wysokość galerii.
- `web/src/routes/(user)/family-photos/+page.svelte`: podczas przewijania montowane są tylko wiersze w pobliżu ekranu; obliczenia aktualizowane przez jeden handler scroll + requestAnimationFrame i ResizeObserver dla szerokości galerii. Zachowano przechodzenie do lat przez przyciski (scrollTo obliczonego offsetu), nagłówek aktywnego miesiąca, przycisk odświeżania, filtrowanie albumów, podgląd/klawisze, paginację i kontrolę aktualnych uprawnień.
- `web/src/lib/services/safefoto-family-photo-virtualization.spec.ts`: 4 nowe testy algorytmu (punkty responsive, wszystkie zdjęcia, wirtualizacja 10 000, puste galerie).
- `ops/safefoto-stage32/virtual_gallery_benchmark.py`: przeglądarkowy test z prawdziwą sesją testową i **syntetycznymi metadanymi** bez zapisywania zdjęć, z pobieraniem stron po 50, sprawdzeniem dokładnie 1 żądania na stronę, ilości renderowanych miniaturek, błędów JS, duplikatów, overflow, pamięci JS i liczby węzłów DOM. Brak realnego dekodowania zdjęć.
- Docker LAB: nowy obraz `safefoto-immich-family:stage32-virtual-gallery-20261105` na bazie Stage26; testowy `immich-server` został odtworzony, pozostałe kontenery i baza danych bez zmian. Rollback `docker compose -f compose.yml -f compose.stage26.override.yml up -d --no-deps --force-recreate immich-server`.

## Wyniki (Playwright Chromium headless, sześć scenariuszy PASS)

| Zdjęcia | Szerokość | Strony | Czas pełnego pobrania i przejścia | Miniatury w DOM | Wszystkie węzły DOM | JS heap końcowy |
|---:|---:|---:|---:|---:|---:|---:|
| 1000 | 1440 | 20 | 4.12 s | 150 | 6636 | 17.6 MB |
| 1000 | 390 | 20 | 4.12 s | 67 | 6652 | 17.7 MB |
| 3000 | 1440 | 60 | 11.01 s | 150 | 9033 | 35.9 MB |
| 3000 | 390 | 60 | 11.26 s | 69 | 3041 | 22.1 MB |
| 10000 | 1440 | 200 | 37.14 s | 154 | 14579 | 67.2 MB |
| 10000 | 390 | 200 | 37.28 s | 69 | 12243 | 56.7 MB |

- **6/6 PASS**: brak duplikatów, brak JS exceptions, brak poziomego overflow, każda wymagana strona dokładnie raz.
- Ograniczenie: nawet przy wirtualizacji DOM jako całość może rosnąć (nawigacja i inne części aplikacji, metadata), ale liczba elementów zawierających zdjęcia pozostaje ograniczona do ok. 67–154. JS heap nadal rośnie wraz z liczbą pobranych rekordów, bo dane wszystkich stron są nadal przechowywane w pamięci.
- Czas to wymuszone przewinięcie do końca **z syntetyczną listą**, nie pomiar prędkości ładowania 10k realnych obrazów na iPhone. W porównaniu ze Stage31 test 3000: desktop 22635 DOM → 9033 DOM, mobile 22597 DOM → 3041 DOM (inne warunki procesu i modyfikacje kodu, wartości traktować orientacyjnie).
- Wykonano unit tests virtualization+grouping **8/8 PASS**, Svelte 0 błędów/0 ostrzeżeń, TS/ESLint/build PASS, browser Stage26 viewer desktop + mobile PASS na działającym LAB.
- Test web nie używa urządzenia iPhone; przewijanie po latach wymaga jeszcze manualnej kontroli na realnym urządzeniu, podobnie jak długie filmowe materiały i GPU.

## Bezpieczeństwo
- Przeglądarka używa tych samych endpointów autoryzacji, sprawdzeń membership oraz generacji żądań jak Stage26, żadna zmiana polityki danych.
- Żadnych migracji SQL, zmian bazy ani realnych plików zdjęć.
- Produkcja My Free Server, Synology i gałąź workera `feature/safefoto-hero-family-video-20261104` pozostają nietknięte.

## Powtórzenie testu

```sh
cd /srv/tests/safefoto/family
PYTHONDONTWRITEBYTECODE=1 SAFEFOTO_TEST_LOGIN_FILE=/srv/tests/safefoto/immich-real/admin.credentials \
 /srv/tests/ui-tools/.venv/bin/python ops/safefoto-stage32/virtual_gallery_benchmark.py
```

Wyniki bieżącego przebiegu dostępne lokalnie w `/tmp/safefoto-stage32-metrics.json`.
