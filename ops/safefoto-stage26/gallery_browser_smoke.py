"""Read-only smoke for Stage26 family gallery keyboard and buttons."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get('SAFEFOTO_TEST_URL','http://192.168.0.188:13013').rstrip('/')
secret_file = os.environ['SAFEFOTO_TEST_LOGIN_FILE']
credentials = dict(line.split('=',1) for line in Path(secret_file).read_text().splitlines() if '=' in line)
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    for width, height in ((1440,900),(390,844)):
        context = browser.new_context(viewport={'width':width,'height':height},has_touch=width<500,is_mobile=width<500)
        page = context.new_page()
        errors = []
        page.on('pageerror',lambda error: errors.append(str(error)[:150]))
        page.goto(BASE+'/auth/login')
        page.locator('#email').fill(credentials['EMAIL'])
        page.locator('#password').fill(credentials['PASSWORD'])
        page.locator('button[type=submit]').click()
        page.wait_for_url(lambda url: '/auth/login' not in url, timeout=15000)
        page.goto(BASE+'/family-photos')
        page.wait_for_function("document.querySelectorAll('button[aria-label^=\"Pokaż zdjęcie z\"]').length > 2",timeout=16000)
        tiles = page.locator('button[aria-label^="Pokaż zdjęcie z"]')
        tiles.first.click()
        count = page.locator('span[aria-live="polite"]').inner_text()
        assert count.startswith('1 / '),(width,count)
        assert page.get_by_role('button',name='Następne zdjęcie rodzinne').count()==1
        if width > 500:
            page.keyboard.press('ArrowRight')
        else:
            page.get_by_role('button',name='Następne zdjęcie rodzinne').click()
        assert page.locator('span[aria-live="polite"]').inner_text().startswith('2 / ')
        if width > 500:
            page.keyboard.press('ArrowLeft')
            assert page.locator('span[aria-live="polite"]').inner_text().startswith('1 / ')
            page.keyboard.press('Escape')
        else:
            page.get_by_role('button',name='Zamknij podgląd zdjęcia').click()
        assert page.get_by_role('button',name='Zamknij podgląd zdjęcia').count()==0
        assert not errors,errors
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        print('PASS',width,'keyboard/controls + modal + no overflow/JS errors',flush=True)
        context.close()
    browser.close()
