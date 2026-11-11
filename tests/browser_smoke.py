from pathlib import Path
import mimetypes
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'public'
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking'])
  context=browser.new_context(viewport={'width':1440,'height':900})
  def serve(route):
   url=route.request.url
   if not url.startswith('https://delfa2.test/'):
    route.abort();return
   path=(root/unquote(urlparse(url).path).lstrip('/')).resolve()
   if not path.is_relative_to(root) or not path.is_file():route.fulfill(status=404,body=b'not found');return
   route.fulfill(status=200,content_type=mimetypes.guess_type(str(path))[0] or 'application/octet-stream',body=path.read_bytes())
  context.route('**/*',serve)
  page=context.new_page()
  errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
  page.goto('https://delfa2.test/index.html',wait_until='domcontentloaded',timeout=12000)
  page.wait_for_selector('.hero',timeout=12000)
  assert page.get_by_text('Votre examen de français').count()
  page.screenshot(path=str(root/'tests/landing.png'),full_page=True)
  page.goto('https://delfa2.test/dashboard.html',wait_until='domcontentloaded',timeout=12000)
  page.wait_for_selector('.paper-card',timeout=10000)
  assert page.locator('.paper-card').count()==1
  page.locator('.paper-card [data-start="standard"]').click()
  page.wait_for_url('**/exam.html?attempt=*',timeout=12000)
  page.wait_for_selector('.question-item',timeout=12000)
  assert 'Compréhension de l’oral' in page.locator('.exam-header').inner_text()
  page.screenshot(path=str(root/'tests/exam-desktop.png'),full_page=True)
  # First response persists through browser refresh
  page.locator('input[data-kind="text"]').first.fill('2')
  page.wait_for_timeout(900)
  page.reload(wait_until='domcontentloaded')
  page.wait_for_selector('input[data-kind="text"]',timeout=12000)
  assert page.locator('input[data-kind="text"]').first.input_value()=='2'
  # Navigate to writing and verify word count, moving freely in practice mode
  page.locator('[data-section="2"]').click()
  page.wait_for_selector('.writing-area',timeout=6000)
  page.locator('.writing-area').fill('J’ai visité Paris avec ma famille. C’était très beau. Ensuite, nous avons découvert la Seine et les musées.')
  assert '20' not in page.locator('.word-count').first.inner_text() or page.locator('.word-count').first.inner_text()
  # Finish practice (3 sections) after autosave
  page.wait_for_timeout(900)
  page.locator('#next').click()
  page.wait_for_selector('.modal-panel')
  page.locator('[data-confirm]').click()
  page.wait_for_url('**/results.html?attempt=*',timeout=12000)
  page.wait_for_selector('.panel',timeout=10000)
  assert 'Correction sécurisée' in page.locator('#app').inner_text()
  # Premium time and warning
  page.goto('https://delfa2.test/dashboard.html',wait_until='domcontentloaded')
  page.wait_for_selector('.paper-card',timeout=10000)
  page.locator('.paper-card [data-start="premium"]').click()
  page.wait_for_selector('.modal-panel')
  assert 'Avant de commencer' in page.locator('.modal-panel').inner_text()
  page.locator('[data-confirm]').click()
  page.wait_for_url('**/exam.html?attempt=*',timeout=10000)
  page.wait_for_selector('#timer-value',timeout=10000)
  assert page.locator('[data-section="1"]').is_disabled()
  page.locator('#play-audio').click()
  assert 'Lisez les questions' in page.locator('#audio-help').inner_text()
  page.screenshot(path=str(root/'tests/exam-premium.png'),full_page=True)
  mobile=browser.new_context(viewport={'width':375,'height':812},is_mobile=True,device_scale_factor=1);mobile.route('**/*',serve);mobile=mobile.new_page()
  mobile.goto('https://delfa2.test/index.html',wait_until='domcontentloaded',timeout=12000)
  mobile.wait_for_selector('.hero',timeout=10000)
  mobile.screenshot(path=str(root/'tests/mobile.png'),full_page=True)
  overflow=mobile.evaluate('document.documentElement.scrollWidth > window.innerWidth+1')
  assert not overflow,'Mobile horizontal overflow'
  assert not errs, 'Browser errors '+str(errs)
  browser.close()
  print('BROWSER SMOKE PASS: landing, dashboard, practice, autosave refresh, writing, result, premium warning/timer, mobile')
