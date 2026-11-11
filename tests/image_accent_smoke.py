"""End-to-end UI smoke checks for the original images, fullscreen and accent writing tools. Uses local demo only."""
from pathlib import Path
import mimetypes
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
server=ThreadingHTTPServer(("127.0.0.1",0),partial(SimpleHTTPRequestHandler,directory=str(root))) if False else None
root=Path(__file__).resolve().parents[1]/'public'
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(root)))
Thread(target=server.serve_forever,daemon=True).start()
BASE=f'http://127.0.0.1:{server.server_port}/'
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking'])
 context=browser.new_context(viewport={'width':1250,'height':900})
 def serve(route):
  url=route.request.url
  if not url.startswith(BASE):
   route.abort();return
  path=(root/unquote(urlparse(url).path).lstrip('/')).resolve()
  if path.name=='config.js' and path.parent.name=='js':
   route.fulfill(status=200,content_type='text/javascript',body="export const configured=false;export const SUPABASE_URL='';export const SUPABASE_PUBLISHABLE_KEY='';export const AUDIO_BUCKET='delf-audio';");return
  if not path.is_relative_to(root) or not path.is_file():route.fulfill(status=404,body=b'not found');return
  route.fulfill(status=200,content_type=mimetypes.guess_type(str(path))[0] or 'application/octet-stream',body=path.read_bytes())
 context.route('**/*',serve)
 page=context.new_page()
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE+'dashboard.html',wait_until='domcontentloaded')
 page.wait_for_selector('.paper-card',timeout=10000)
 page.locator('.paper-card [data-start="standard"]').click()
 page.wait_for_url('**/exam.html?attempt=*',timeout=10000)
 page.wait_for_selector('.question-item',timeout=10000)
 # listening ex 2: image from individual question payload is visible.
 page.locator('[data-exercise="1"]').click()
 cards=page.locator('.exam-image-card')
 assert cards.count()==1, f'missing listening picture: {cards.count()}'
 assert page.locator('.exam-image-card img').evaluate('(x)=>x.complete&&x.naturalWidth>0')
 page.locator('.image-expand').click()
 viewer=page.locator('#exam-image-viewer')
 assert viewer.is_visible()
 assert page.locator('#image-viewer-picture').evaluate('(x)=>x.complete&&x.naturalWidth>0')
 page.locator('[data-zoom="in"]').click()
 assert page.locator('#image-viewer-zoom').inner_text()=='130 %'
 page.locator('[data-zoom="fit"]').click()
 assert page.locator('#image-viewer-zoom').inner_text()=='100 %'
 page.keyboard.press('Escape')
 assert not viewer.is_visible()
 page.screenshot(path=str(root/'tests/listening-picture.png'))
 # reading signs
 page.locator('[data-section="1"]').click()
 assert page.locator('.exam-image-card').count()==1
 assert 'reading-signs' in page.locator('.exam-image-card img').get_attribute('src')
 page.locator('.exam-image-preview').click()
 assert viewer.is_visible()
 page.locator('[data-zoom="close"]').click()
 assert not viewer.is_visible()
 # reading email
 page.locator('[data-exercise="3"]').click()
 assert 'reading-email' in page.locator('.exam-image-card img').get_attribute('src')
 assert page.locator('details.source-text-details').count()==1
 # writing accent after cursor
 page.locator('[data-section="2"]').click()
 page.wait_for_selector('.writing-area')
 assert 'writing-paris' in page.locator('.exam-image-card img').get_attribute('src')
 area=page.locator('.writing-area')
 area.fill('Je vis a Paris')
 area.evaluate('(x)=>{x.selectionStart=8;x.selectionEnd=9}')
 page.locator('[data-accent="à"]').click()
 assert area.input_value()=='Je vis à Paris',repr(area.input_value())
 page.locator('[data-accent="é"]').click()
 assert area.input_value()=='Je vis àé Paris'
 assert page.locator('.word-count').count()==1
 page.wait_for_timeout(900)
 page.reload(wait_until='domcontentloaded')
 page.wait_for_selector('.writing-area')
 assert page.locator('.writing-area').input_value()=='Je vis àé Paris','accent not autosaved'
 page.locator('.exam-image-preview').click()
 assert viewer.is_visible()
 page.keyboard.press('Escape')
 # writing letter image
 page.locator('[data-exercise="1"]').click()
 assert 'writing-letter' in page.locator('.exam-image-card img').get_attribute('src')
 assert page.locator('.accent-key').count()>=20
 page.screenshot(path=str(root/'tests/writing-accents.png'),full_page=True)
 # premium mode remains usable
 page.goto(BASE+'dashboard.html',wait_until='domcontentloaded')
 page.wait_for_selector('.paper-card')
 page.locator('[data-start="premium"]').first.click()
 page.wait_for_selector('.modal-panel')
 page.locator('[data-confirm]').click()
 page.wait_for_url('**/exam.html?attempt=*',timeout=10000)
 page.wait_for_selector('#timer-value')
 assert page.locator('[data-section="1"]').is_disabled()
 assert not page.locator('.image-viewer.is-open').count()
 # mobile no horizontal scrolling in exam and image viewer
 mobile=browser.new_context(viewport={'width':375,'height':812},is_mobile=True,device_scale_factor=1)
 mobile.route('**/*',serve)
 m=mobile.new_page();m.on('pageerror',lambda e:errors.append(str(e)))
 m.goto(BASE+'dashboard.html',wait_until='domcontentloaded');m.wait_for_selector('.paper-card')
 m.locator('[data-start="standard"]').first.click();m.wait_for_url('**/exam.html?attempt=*');m.wait_for_selector('.question-item')
 m.locator('[data-section="2"]').click()
 assert not m.evaluate('document.documentElement.scrollWidth > window.innerWidth+1')
 m.locator('.image-expand').click()
 assert m.locator('#exam-image-viewer').is_visible()
 assert not m.evaluate('document.documentElement.scrollWidth > window.innerWidth+1')
 m.locator('[data-zoom="close"]').click()
 m.locator('[data-accent="ç"]').click()
 assert m.locator('.writing-area').input_value()=='ç'
 m.screenshot(path=str(root/'tests/writing-mobile.png'),full_page=True)
 assert not errors, errors
 browser.close()
server.shutdown()
print('PASS: desktop image expand/zoom/escape, question-level images, image context, accent insertion+autosave, premium mode, mobile no overflow')
