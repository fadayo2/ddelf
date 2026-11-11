"""Offline Chromium interaction test of exact image-viewer and accent-toolbar functions.
No HTTP navigation, so this also runs in network-restricted containers.
"""
from pathlib import Path
import base64
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'public'
js=(root/'assets/js/exam.js').read_text()
start=js.index('const FRENCH_ACCENTS=')
end=js.index('\nfunction render(){',start)
helpers=js[start:end]
css=(root/'assets/css/styles.css').read_text()
img_path=root/'assets/img/reading-signs.png'
data='data:image/png;base64,'+base64.b64encode(img_path.read_bytes()).decode()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-background-networking'])
 page=b.new_page(viewport={'width':1200,'height':800})
 page.set_content('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="app"></div></body></html>')
 page.add_script_tag(content='const escapeHtml=(x)=>String(x).replace(/&/g,"&amp;").replace(/"/g,"&quot;");'+helpers+"\nwindow.testSetup=(path)=>{document.querySelector('#app').innerHTML=imageCard(path,'Signes originaux')+'<article class=\"question-item\"><textarea class=\"writing-area\">Je vis a Paris</textarea><div>'+FRENCH_ACCENTS.map(x=>'<button type=\"button\" data-accent=\"'+x+'\">'+x+'</button>').join('')+'</div></article>';bindImageCards();bindAccentKeys();};")
 page.evaluate('(path)=>window.testSetup(path)',data)
 assert page.locator('.exam-image-card img').count()==1
 page.locator('.image-expand').click()
 assert page.locator('.image-viewer.is-open').count()==1
 page.locator('[data-zoom="in"]').click()
 assert page.locator('#image-viewer-zoom').inner_text()=='130 %'
 page.locator('[data-zoom="fit"]').click()
 assert page.locator('#image-viewer-zoom').inner_text()=='100 %'
 page.keyboard.press('Escape')
 assert page.locator('.image-viewer.is-open').count()==0
 textarea=page.locator('.writing-area')
 textarea.evaluate('(el)=>{el.selectionStart=7;el.selectionEnd=8}')
 page.locator('[data-accent="à"]').click()
 assert textarea.input_value()=='Je vis à Paris'
 page.set_viewport_size({'width':375,'height':812})
 assert not page.evaluate('document.documentElement.scrollWidth > window.innerWidth+1')
 page.locator('.exam-image-preview').click()
 assert page.locator('.image-viewer.is-open').count()==1
 assert not page.evaluate('document.documentElement.scrollWidth > window.innerWidth+1')
 page.screenshot(path=str(root/'assets/img/interactive-mobile-preview.png'),full_page=False)
 page.locator('[data-zoom="close"]').click()
 page.screenshot(path=str(root/'assets/img/accents-mobile-preview.png'),full_page=False)
 b.close()
print('PASS: browser controls — images expand, zoom, fit, Escape, close, character insertion, mobile viewport')
