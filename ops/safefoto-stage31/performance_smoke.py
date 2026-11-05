"""Stage31: read-only synthetic family gallery browser load benchmark.

Creates no database users/photos. The real authenticated SafeFoto UI uses intercepted
synthetic family listing responses and blocked synthetic thumbnail/preview requests.
Measurements are test-machine/browser measurements, not end-user benchmarks.
"""
import json
import os
import statistics
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import sync_playwright

BASE = os.environ.get('SAFEFOTO_TEST_URL', 'http://192.168.0.188:13013').rstrip('/')
assert BASE.startswith(('http://192.168.', 'http://127.0.0.1:')), 'TEST LAN only'
LOGIN = dict(line.split('=', 1) for line in Path(os.environ['SAFEFOTO_TEST_LOGIN_FILE']).read_text().splitlines() if '=' in line)
assert LOGIN.get('EMAIL') and LOGIN.get('PASSWORD')
SIZES = (1000, 3000)
VIEWPORTS = ((1440, 900), (390, 844))
OUT = Path(os.environ.get('SAFEFOTO_STAGE31_REPORT', '/tmp/safefoto-stage31-metrics.json'))
results = []

def bench(browser, viewport, count, template):
    width, height = viewport
    ctx = browser.new_context(
        viewport={'width': width, 'height': height},
        is_mobile=width < 600,
        has_touch=width < 600,
    )
    page = ctx.new_page()
    page.goto(BASE+'/auth/login')
    page.locator('#email').fill(LOGIN['EMAIL'])
    page.locator('#password').fill(LOGIN['PASSWORD'])
    page.locator('button[type=submit]').click()
    page.wait_for_url(lambda url: '/auth/login' not in url, timeout=20000)

    # Immutable, valid synthetic metadata; no real asset IDs or media in report.
    start = datetime(2026, 11, 4, tzinfo=timezone.utc)
    items = []
    for n in range(count):
        item = dict(template)
        item['id'] = str(uuid.uuid4())
        stamp = (start - timedelta(days=n//10)).isoformat().replace('+00:00','Z')
        item['fileCreatedAt'] = stamp
        item['localDateTime'] = stamp
        items.append(item)

    requests = []
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)[:140]))

    def listings(route):
        params = parse_qs(urlsplit(route.request.url).query)
        page_number = int(params.get('page', ['1'])[0])
        requests.append(page_number)
        begin = (page_number - 1) * 50
        payload = {
            'items': items[begin:begin+50],
            'page': page_number,
            'limit': 50,
            'nextPage': page_number+1 if begin+50 < count else None,
        }
        route.fulfill(status=200, content_type='application/json', body=json.dumps(payload))

    def image(route):
        # Synthetic IDs are never on disk: do not request any real media.
        route.abort('blockedbyclient')

    page.route('**/api/family/photos?*', listings)
    page.route('**/api/assets/*/thumbnail?*', image)
    page.route('**/api/assets/*/original*', image)
    session = ctx.new_cdp_session(page)
    session.send('Performance.enable')
    baseline = session.send('Performance.getMetrics')
    init_heap = next((int(v['value']) for v in baseline['metrics'] if v['name']=='JSHeapUsedSize'),0)

    started = time.perf_counter()
    page.goto(BASE+'/family-photos')
    page.wait_for_function(
        'document.querySelectorAll(\'button[aria-label^="Pokaż zdjęcie z"]\').length >= 50', timeout=20000
    )
    times=[]
    last = 0
    while last < count and (time.perf_counter()-started) < 110:
        current = page.locator('button[aria-label^="Pokaż zdjęcie z"]').count()
        if current >= count:
            break
        if current > last:
            last = current
        t0 = time.perf_counter()
        page.locator('[data-family-load-sentinel]').scroll_into_view_if_needed(timeout=8000)
        page.wait_for_function(
            '(old) => document.querySelectorAll(\'button[aria-label^="Pokaż zdjęcie z"]\').length > old',
            arg=current, timeout=12000,
        )
        times.append(round(1000*(time.perf_counter()-t0),1))
        last = page.locator('button[aria-label^="Pokaż zdjęcie z"]').count()

    elapsed = round(time.perf_counter()-started, 2)
    final = page.locator('button[aria-label^="Pokaż zdjęcie z"]').count()
    image_nodes = page.locator('img[alt="Zdjęcie rodzinne"]').count()
    duplicate_count = page.locator('button[aria-label^="Pokaż zdjęcie z"]').evaluate_all(
        '(buttons) => buttons.length - new Set(buttons.map(x => x.querySelector("img")?.src)).size'
    )
    later = session.send('Performance.getMetrics')
    used = next((int(v['value']) for v in later['metrics'] if v['name']=='JSHeapUsedSize'),0)
    node_count = next((int(v['value']) for v in later['metrics'] if v['name']=='Nodes'),0)
    overflows = page.evaluate('document.documentElement.scrollWidth > innerWidth')
    assert final == count, f'{width}/{count}: {final} loaded'
    assert requests == list(range(1, count//50+1)),f'{width}/{count}: bad pagination {requests}'
    assert duplicate_count==0, f'{width}/{count}: duplicate thumbnails'
    assert image_nodes==count
    assert not errors, f'{width}/{count}: {errors}'
    assert not overflows, f'{width}/{count}: horizontal overflow'
    metrics = {
        'viewport':width,
        'synthetic_photos':count,
        'pages_fetched':len(requests),
        'last_page':requests[-1],
        'seconds_to_render_all':elapsed,
        'median_next_page_ms':round(statistics.median(times),1) if times else 0,
        'max_next_page_ms':max(times) if times else 0,
        'js_heap_start_mb':round(init_heap/1048576,1),
        'js_heap_end_mb':round(used/1048576,1),
        'dom_nodes_end':node_count,
        'thumbnail_dom_nodes':image_nodes,
        'duplicates':duplicate_count,
        'js_errors':len(errors),
        'horizontal_overflow':overflows,
    }
    print('PASS',json.dumps(metrics,ensure_ascii=False),flush=True)
    ctx.close()
    return metrics

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--disable-background-networking'])
    # Read only a single response template from the existing test family account.
    context = browser.new_context()
    page = context.new_page()
    page.goto(BASE+'/auth/login')
    page.locator('#email').fill(LOGIN['EMAIL'])
    page.locator('#password').fill(LOGIN['PASSWORD'])
    page.locator('button[type=submit]').click()
    page.wait_for_url(lambda url: '/auth/login' not in url, timeout=20000)
    template = page.evaluate("""async() => {
        const r=await fetch('/api/family/photos?page=1&limit=50');
        if (!r.ok) throw new Error('No family template response');
        const data=await r.json();
        return data.items[0];
    }""")
    assert template, 'At least one test family photo required as metadata template'
    context.close()
    for size in SIZES:
        for vp in VIEWPORTS:
            results.append(bench(browser,vp,size,template))
    browser.close()
OUT.write_text(json.dumps({'source':'synthetic browser-only metadata','cases':results},indent=2)+'\n')
print('REPORT',OUT,flush=True)
