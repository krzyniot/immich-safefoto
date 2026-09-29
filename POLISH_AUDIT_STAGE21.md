# SafeFoto — przegląd polskiej wersji aplikacji (Stage 21)

- Pierwsze uruchomienie: język polski (startLocale: pl, fallbackLocale: pl odziedziczone z Stage 19).
- Ręczna zmiana języka: istniejący ekran Ustawienia → Język, lista obsługiwanych języków i przycisk Zastosuj. Biblioteka easy_localization zachowuje zapisany wybór użytkownika przed startLocale. Przeniesiono Polski na początek listy i nadano mu polską nazwę.
- Dolna nawigacja: Moje zdjęcia / Zdjęcia rodziny / Szukaj / Albumy / Biblioteka z kluczami tłumaczeń, reaguje na zmianę języka. Nagłówek rodzinnej galerii korzysta z klucza językowego.
- Uzupełniono 32 wcześniej brakujące klucze polskie względem wygenerowanego zestawu angielskiego (15 nowych głównych komunikatów + 17 opcji integralności); dodano dwa nowe klucze nawigacyjne po polsku i angielsku. Statyczny audyt i18n/en.json kontra i18n/pl.json: zero brakujących kluczy głównych.
- Przejrzano widoczne na sztywno teksty w kodzie; spolszczono techniczny ekran diagnostyki zdjęcia, domyślną nazwę nowego albumu, status pobierania z iCloud i część komunikatów synchronizacji.
- Narzędzie scripts/audit_mobile_polish.py sprawdza brakujące klucze i sygnalizuje 20 różnic w tokenach między tłumaczeniami EN/PL. Część z nich to odmienne formy ICU plural/select, wymagają osobnej oceny językowej, a nie automatycznej podmiany tokenów. Nie należy uznawać pełnej jakości całego tłumaczenia za zweryfikowaną bez przejścia wszystkich ekranów na urządzeniu.
- Testy regresyjne trzech modułów galerii 19/19 PASS po aktualizacji asercji niezależnej od EasyLocalization w teście jednostkowym. Flutter analyze 7 zmienionych plików: no issues. Brak testu ręcznego przełączenia PL → EN → restart w emulatorze na tym etapie.
- Oddzielny katalog /srv/tests/safefoto/family-polish i gałąź feature/safefoto-mobile-stage21-polish-audit; nie dotykano zmian równolegle powstających w /srv/tests/safefoto/family ani produkcji/main.
