"""SafeFoto Stage23 read-only browser smoke: login, family images, media, layout.
Requires Playwright Chromium and SAFEFOTO_TEST_LOGIN_FILE (EMAIL=/PASSWORD= lines).
Only test accounts. No writes, no user data or passwords in logs.
Usage:
 SAFEFOTO_TEST_LOGIN_FILE=/path/to/test.credentials \\
   /srv/tests/ui-tools/.venv/bin/python ops/safefoto-stage23/browser_smoke.py
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ.get("SAFEFOTO_TEST_URL", "http://192.168.0.188:13013").rstrip("/")
CREDENTIALS = os.environ.get("SAFEFOTO_TEST_LOGIN_FILE")
if not CREDENTIALS:
    raise SystemExit("Set SAFEFOTO_TEST_LOGIN_FILE to an existing TEST account credential file")
credentials = dict(
    line.split("=", 1)
    for line in Path(CREDENTIALS).read_text().splitlines()
    if "=" in line
)
assert credentials.get("EMAIL") and credentials.get("PASSWORD"), "Missing test login credentials"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    for width, height in ((1440, 900), (390, 844)):
        context = browser.new_context(
            viewport={"width": width, "height": height},
            is_mobile=width < 500,
            has_touch=width < 500,
        )
        page = context.new_page()
        errors, bad_media, family_responses = [], [], []
        page.on("pageerror", lambda error: errors.append(type(error).__name__))
        def observe(response):
            if "/api/family/" in response.url:
                family_responses.append(response.status)
            elif "/api/assets/" in response.url and response.status >= 400:
                bad_media.append(response.status)
        page.on("response", observe)
        page.goto(URL + "/auth/login")
        page.locator("#email").fill(credentials["EMAIL"])
        page.locator("#password").fill(credentials["PASSWORD"])
        page.locator("button[type=submit]").click()
        page.wait_for_url(lambda location: "/auth/login" not in location, timeout=15000)
        page.goto(URL + "/family-photos")
        page.wait_for_function(
            "() => document.querySelector('#family-album-filter') !== null && !document.body.innerText.includes('Wczytywanie zdjęć rodziny')",
            timeout=10000,
        )
        page.wait_for_timeout(900)
        metrics = page.evaluate(
            """() => ({
              photos: document.querySelectorAll('img[alt="Zdjęcie rodzinne"]').length,
              loaded: [...document.querySelectorAll('img[alt="Zdjęcie rodzinne"]')]
                .filter(image => image.complete && image.naturalWidth > 0).length,
              albumOptions: document.querySelectorAll('#family-album-filter option').length,
              overflow: document.documentElement.scrollWidth > innerWidth
            })"""
        )
        assert not errors and not bad_media, (errors, bad_media)
        assert not metrics["overflow"], metrics
        assert len(family_responses) >= 2 and all(code == 200 for code in family_responses), family_responses
        assert metrics["photos"] == metrics["loaded"], metrics
        if metrics["photos"]:
            page.locator('button[aria-label^="Pokaż zdjęcie z"]').first.click()
            assert page.get_by_role("button", name="Zamknij podgląd zdjęcia").count() == 1
        print(f"PASS {width}px: photos={metrics['photos']}, loaded={metrics['loaded']}, album_options={metrics['albumOptions']}, HTTP={family_responses}")
        context.close()
    browser.close()
