"""Run auth UI interaction tests in an isolated Chromium document (no external browser navigation)."""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'public'
html=(root/'index.html').read_text()
css=(root/'assets/css/styles.css').read_text()
html=re.sub(r'<link[^>]+>', '', html)
html=re.sub(r'<script type="module"[^>]*></script>', '', html)
html=html.replace('</head>','<style>'+css+'</style></head>')
utils=(root/'assets/js/utils.js').read_text().replace('export ','')+'\nwindow.__mockUtils={toast,setButtonBusy};'
auth=(root/'assets/js/auth.js').read_text()
auth=re.sub(r"import .*?from .*?;\n",'',auth)
auth=auth.replace('export ','')
auth='const db=window.__mockDb;const {toast,setButtonBusy}=window.__mockUtils;\n'+auth+'\nwindow.authUI={openAuth,closeAuth,initAuthUI,handleAuthCallback};'
mock=r'''
window.__mockUser=null;
window.__mockDb={
 isLive(){return true},currentUser(){return window.__mockUser},
 async signIn(email,password){await new Promise(r=>setTimeout(r,250));if(password==='incorrect')throw Error('Invalid login credentials');window.__mockUser={id:'u1',email};return {user:window.__mockUser,session:{token:'test'}}},
 async signUp(email,password){await new Promise(r=>setTimeout(r,230));window.__signup={email,password};return {user:{email},session:null}},
 async resendConfirmation(email){window.__resend=email;await new Promise(r=>setTimeout(r,120));return {}},
 async sendPasswordReset(email){window.__forgot=email;await new Promise(r=>setTimeout(r,120));return {}},
 async updatePassword(password){window.__reset=password;await new Promise(r=>setTimeout(r,120));return {user:window.__mockUser}}
};
'''

def test():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':1100,'height':870})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html)
  page.add_script_tag(content=mock)
  page.add_script_tag(content='(function(){'+utils+'})();')
  page.add_script_tag(content='(function(){'+auth+'})();')
  page.evaluate("window.authUI.initAuthUI({onSignedIn(){window.__signedIn=true}})")
  page.locator('#auth-open').evaluate('(e)=>e.classList.remove("hidden")')
  page.locator('#auth-open').click()
  assert page.locator('#auth-title').inner_text()=='Welcome back.'
  page.locator('[data-auth-tab="signup"]').click()
  page.locator('#signup-email').fill('learner@example.com')
  page.locator('#signup-password').fill('Abcdefg123!')
  page.locator('#signup-confirm').fill('Mismatch123!')
  page.locator('#auth-signup-submit').click()
  page.wait_for_function('document.getElementById("auth-notice").textContent.includes("do not match")',timeout=3000)
  assert 'do not match' in page.locator('#auth-notice').inner_text()
  page.locator('[data-toggle-password="signup-password"]').click()
  assert page.locator('#signup-password').get_attribute('type')=='text'
  page.locator('#signup-confirm').fill('Abcdefg123!')
  page.locator('#auth-signup-submit').click()
  assert page.locator('#auth-signup-submit').get_attribute('aria-busy')=='true'
  page.wait_for_selector('#auth-checkmail:not(.hidden)',timeout=5000)
  assert 'learner@example.com' in page.locator('#auth-checkmail').inner_text()
  page.locator('#auth-resend').click()
  page.wait_for_function('Boolean(window.__resend)')
  page.wait_for_function('!document.getElementById("auth-resend").disabled')
  page.locator('#auth-checkmail [data-auth-view="signin"]').click()
  page.locator('#signin-email').fill('learner@example.com')
  page.locator('#signin-password').fill('incorrect')
  page.locator('#auth-signin-submit').click()
  page.wait_for_function('document.getElementById("auth-notice").textContent.includes("Incorrect")',timeout=5000)
  page.locator('#signin-password').fill('correct-password')
  page.locator('#auth-signin-submit').click()
  page.wait_for_function('Boolean(window.__signedIn)')
  assert page.locator('#auth-panel').is_hidden()
  page.evaluate("window.authUI.openAuth('signin')")
  page.locator('[data-auth-view="forgot"]').click()
  page.locator('#forgot-email').fill('learner@example.com')
  page.locator('#auth-forgot button[type=submit]').click()
  page.wait_for_selector('#auth-checkmail:not(.hidden)',timeout=5000)
  assert page.evaluate('window.__forgot')=='learner@example.com'
  page.evaluate("window.authUI.openAuth('reset')")
  page.locator('#reset-password').fill('NewPassword123!')
  page.locator('#reset-confirm').fill('NewPassword123!')
  page.locator('#auth-reset button[type=submit]').click()
  page.wait_for_selector('#auth-success:not(.hidden)',timeout=5000)
  assert page.evaluate('window.__reset')=='NewPassword123!'
  assert not errors,'JS errors '+str(errors)
  phone=browser.new_page(viewport={'width':375,'height':812},is_mobile=True,device_scale_factor=1)
  phone.set_content(html)
  phone.add_script_tag(content=mock)
  phone.add_script_tag(content='(function(){'+utils+'})();')
  phone.add_script_tag(content='(function(){'+auth+'})();')
  phone.evaluate("window.authUI.initAuthUI({})")
  phone.evaluate("window.authUI.openAuth('signup')")
  assert not phone.evaluate('document.documentElement.scrollWidth > innerWidth + 1'),'Mobile horizontal overflow'
  phone.screenshot(path='/mnt/data/delfA2_auth_upgrade/auth-signup-mobile.png',full_page=False)
  browser.close()
  print('PASS: modal, signup, password confirmation, visibility, loading buttons, email resend, invalid login, successful login, forgot password, reset, mobile.')
if __name__=='__main__':test()
