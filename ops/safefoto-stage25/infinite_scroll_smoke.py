"""Stage25: synthetic 110-photo pagination test; authenticated TEST account only.
No database writes, no user-media logging. Network interception supplies fixture metadata.
"""
import os
import uuid
from datetime import datetime,timedelta,timezone
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('SAFEFOTO_TEST_URL','http://192.168.0.188:13013').rstrip('/')
CREDENTIALS=Path(os.environ['SAFEFOTO_TEST_LOGIN_FILE'])
account=dict(line.split('=',1) for line in CREDENTIALS.read_text().splitlines() if '=' in line)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for width,height in [(1440,900),(390,844)]:
        context=browser.new_context(viewport={'width':width,'height':height},is_mobile=width<500,has_touch=width<500)
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)[:200]))
        page.goto(BASE+'/auth/login')
        page.locator('#email').fill(account['EMAIL'])
        page.locator('#password').fill(account['PASSWORD'])
        page.locator('button[type=submit]').click()
        page.wait_for_url(lambda u:'/auth/login' not in u,timeout=15000)
        template=page.evaluate("""async()=>{const r=await fetch('/api/family/photos?page=1&limit=50');if(!r.ok)throw new Error('Failed to fetch live family template');const j=await r.json();return j.items[0]}""")
        assert template,'QA needs at least one family item to validate the response shape'
        items=[]
        start=datetime(2026,11,4,tzinfo=timezone.utc)
        for i in range(110):
            item=dict(template)
            item['id']=str(uuid.uuid4())
            stamp=(start-timedelta(days=i)).isoformat().replace('+00:00','Z')
            item['fileCreatedAt']=stamp
            item['localDateTime']=stamp
            items.append(item)
        requests=[]
        def family(route):
            query=route.request.url.split('?',1)[-1]
            from urllib.parse import parse_qs
            params=parse_qs(query)
            page_num=int(params.get('page',['1'])[0])
            requests.append(page_num)
            start_at=(page_num-1)*50
            data={'items':items[start_at:start_at+50],'page':page_num,'limit':50,'nextPage':page_num+1 if start_at+50<len(items) else None}
            route.fulfill(status=200,content_type='application/json',body=__import__('json').dumps(data))
        page.route('**/api/family/photos?*',family)
        page.goto(BASE+'/family-photos')
        page.wait_for_function("()=>document.querySelectorAll('button[aria-label^=\"Pokaż zdjęcie z\"]').length>=50",timeout=15000)
        for _ in range(8):
            if page.locator('button[aria-label^="Pokaż zdjęcie z"]').count()>=110:
                break
            page.locator('[data-family-load-sentinel]').scroll_into_view_if_needed()
            page.wait_for_timeout(550)
        count=page.locator('button[aria-label^="Pokaż zdjęcie z"]').count()
        assert count==110,(width,count,requests)
        assert requests==[1,2,3],(width,requests)
        assert not errors,(width,errors)
        assert page.locator('button:has-text("Pokaż starsze zdjęcia")').count()==0
        print('PASS width',width,'photos',count,'requests',requests,'JS_ERRORS',len(errors))
        context.close()
    browser.close()
