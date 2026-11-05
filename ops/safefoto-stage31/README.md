# Stage31 — przeglądarkowy test wydajności rodzinnej galerii

Data: 2026-11-05. Test LAB kris-Standard, serwer Stage26 :13013 healthy. Bez zmian produkcji, DB, kontenerów, zdjęć, kont i backendu.

## Metodyka

- Playwright Chromium headless 1440×900 desktop i 390×844 mobile emulation, autoryzowane wejście do widoku Safe Foto.
- 1000 i 3000 fikcyjnych rekordów zdjęć (generowane losowe UUID, chronologiczne daty); *interception* endpointu /api/family/photos z 50 rekordami na stronę, intercept i blokowanie miniaturek oraz oryginałów dla nieistniejących identyfikatorów. Żadnych plików użytkowników nie zapisano ani nie odczytywano w teście, poza jednym rekordem metadanych użytym w pamięci jako szablon.
- Skrypt `ops/safefoto-stage31/performance_smoke.py`; każde uruchomienie testu kontroluje kolejność i liczbę stron, duplikaty zdjęć, błędy JavaScript, poziomy overflow, count DOM i JS heap poprzez Chrome DevTools Protocol.
- Czasy obejmują automatyczne wymuszanie przejścia przez całą galerię do ostatniej strony i liczbę żądań; **nie są** rzeczywistym pomiarem szybkości sieci, dekodowania obrazów czy pracy iPhone'a.
- Oryginalny plik metryk z próby: `/tmp/safefoto-stage31-metrics.json` (bez danych osobowych).

## Wyniki — 4/4 PASS

| Widok | Syntetyczne zdjęcia | Strony (50) | Łącznie | Mediana przejścia do kolejnej strony | Max | JS heap końcowy | DOM nodes |
|---|---:|---:|---:|---:|---:|---:|---:|
| Desktop 1440 | 1000 | 20 | 3,71 s | 87,7 ms | 108,0 ms | 20,2 MB | 11257 |
| Mobile 390 | 1000 | 20 | 3,54 s | 79,5 ms | 115,3 ms | 16,2 MB | 8571 |
| Desktop 1440 | 3000 | 60 | 11,06 s | 94,6 ms | 138,6 ms | 37,8 MB | 22635 |
| Mobile 390 | 3000 | 60 | 10,91 s | 89,8 ms | 128,8 ms | 42,4 MB | 22597 |

W każdym przypadku: dokładnie 1 request na stronę (1–20 lub 1–60), 0 duplikatów, 0 JS exceptions, 0 horizontal overflow. Dane odtworzone w DOM, wszystkie 1000/3000 miniaturek reprezentowanych jako IMG; zapytania o media celowo blokowane.

## Wnioski i kolejność następnych zmian

- Paginacja i mechanizmy obrony przed wielokrotnym pobraniem działają.
- **Wąskie gardło**: brak wirtualizacji; przy 3000 zdjęć w DOM pozostaje około 22,6 tys. elementów. JS heap z testu 38–42 MB nie obejmuje pełnego dekodowania rzeczywistych zdjęć i zużycia GPU. W obecnym stanie nie należy deklarować pełnej wydajności 10k+ zdjęć na iPhone.
- Rekomendowany następny etap: wirtualizacja wierszy / grup miesięcznych przy zachowaniu przewijania, nawigacji po latach, dostępu klawiaturą i wycofywania uprawnień; test na 1000/3000/10000 pozycji i porównanie DOM i FPS.
- Dopiero po stabilnej wirtualizacji: test z realnymi miniaturami na urządzeniu mobilnym i wybranymi zdjęciami kontrolnymi.
- Niczego nie wdrażano w tym etapie, bo najpierw potrzebne są rzetelne pomiary bazowe.

## Powtórzenie

```sh
cd /srv/tests/safefoto/family
PYTHONDONTWRITEBYTECODE=1 SAFEFOTO_TEST_LOGIN_FILE=/srv/tests/safefoto/immich-real/admin.credentials \
 /srv/tests/ui-tools/.venv/bin/python ops/safefoto-stage31/performance_smoke.py
```

Skrypt tylko na TEST LAN. Bez logowania haseł.
