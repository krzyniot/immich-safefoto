"""Read-only authenticated browser regression for deliberately created Stage24 QA family albums.
Usage: SAFEFOTO_TEST_LOGIN_FILE=/secure/test.credentials /srv/tests/ui-tools/.venv/bin/python ops/safefoto-stage23/album_browser_smoke.py
No user content, credentials or identifiers are committed. Requires both QA album fixtures.
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright
base=os.environ.get('SAFEFOTO_TEST_URL','http://192.168.0.188:13013').rstrip('/')
creds=dict(l.split('=',1) for l in Path(os.environ['SAFEFOTO_TEST_LOGIN_FILE']).read_text().splitlines() if '=' in l)
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True)
 for width,height in [(1440,900),(390,844)]:
  ctx=browser.new_context(viewport={'width':width,'height':height},is_mobile=width<500,has_touch=width<500)
  page=ctx.new_page();errors=[];responses=[]
  page.on('pageerror',lambda e:errors.append(str(e)[:120]))
  page.on('response',lambda r:responses.append((r.url.split('?')[0].split(base)[-1],r.status)) if '/api/family/' in r.url else None)
  page.goto(base+'/auth/login');page.locator('#email').fill(creds['EMAIL']);page.locator('#password').fill(creds['PASSWORD']);page.locator('button[type=submit]').click();page.wait_for_url(lambda u:'/auth/login' not in u,timeout=14000)
  page.goto(base+'/family-photos');page.wait_for_timeout(1600)
  print('VIEWPORT',width,'OPTIONS',page.locator('#family-album-filter option').count(),'photos',page.locator('button[aria-label^="Pokaż zdjęcie z"]').count())
  for name in ['SafeFoto QA Stage24 1','SafeFoto QA Stage24 2']:
   option=page.locator('#family-album-filter option',has_text=name)
   assert option.count()==1,'album option absent'
   page.locator('#family-album-filter').select_option(label=name)
   page.wait_for_timeout(2000)
   images=page.locator('img[alt="Zdjęcie rodzinne"]')
   counts=images.count()
   loaded=images.evaluate_all('(imgs)=>imgs.filter(i=>i.complete && i.naturalWidth>0).length')
   print('SELECT',width,name,'count',counts,'loaded',loaded,'HTTP', [status for _,status in responses[-3:]])
   assert counts==1 and loaded==1, 'album must contain just one loaded test image'
  assert not errors,errors
  ctx.close()
 browser.close()
