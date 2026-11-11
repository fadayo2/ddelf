import * as db from './backend.js';
import {toast,setButtonBusy} from './utils.js';

const $=id=>document.getElementById(id);
const views=['signin','signup','forgot','checkmail','reset','success'];
const descriptions={
 signin:['Welcome back.','Sign in to continue your preparation.'],
 signup:['Create your account.','Use one account to access your work on all your devices.'],
 forgot:['Forgot your password?','Enter your email address to receive a secure reset link.'],
 checkmail:['One more step.','Check your inbox to continue.'],
 reset:['Choose a new password.','Your new password must contain at least 8 characters.'],
 success:['You’re all set!','Your ddelf account is ready.']
};
let view='signin',busy=false,returnFocus=null,pendingEmail='',mailType='signup',afterSignIn=null;
const getFirstField=kind=>$(`auth-${kind}`)?.querySelector('input:not([type=hidden])');
const emailValue=kind=>$(`${kind}-email`)?.value.trim() || '';
function setMessage(message='',type='info'){
 const notice=$('auth-notice');if(!notice)return;
 notice.textContent=message;notice.classList.toggle('hidden',!message);notice.dataset.kind=type;
 $('auth-status').textContent=message;
}
function toggleForm(next){
 view=next;
 $('auth-confirm-help')?.classList.add('hidden');
 for(const kind of views){const el=$(`auth-${kind}`);el?.classList.toggle('hidden',kind!==next)}
 $('auth-title').textContent=descriptions[next][0];$('auth-description').textContent=descriptions[next][1];
 $('auth-tabs').classList.toggle('hidden',!['signin','signup'].includes(next));
 document.querySelectorAll('[data-auth-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.authTab===next)));
 setMessage('');
 if(next==='checkmail')$('auth-email-sent').textContent=pendingEmail;
 if(next==='forgot'&&!emailValue('forgot'))$('forgot-email').value=emailValue('signin')||emailValue('signup')||pendingEmail;
 if(next==='signup'&&!emailValue('signup'))$('signup-email').value=emailValue('signin');
 if(next==='signin'&&!emailValue('signin'))$('signin-email').value=emailValue('signup')||pendingEmail;
 if(!($('auth-panel').classList.contains('hidden')))window.requestAnimationFrame(()=>getFirstField(next)?.focus());
}
export function openAuth(next='signin',message=''){
 if(!db.isLive())return;
 returnFocus=document.activeElement;
 $('auth-panel').classList.remove('hidden');document.body.classList.add('auth-modal-open');
 toggleForm(next);if(message)setMessage(message,'info');
 window.requestAnimationFrame(()=>{(getFirstField(next)||$('auth-close')).focus()});
}
export function closeAuth(force=false){
 if(busy&&!force)return;
 $('auth-panel').classList.add('hidden');document.body.classList.remove('auth-modal-open');
 if(!force)window.dispatchEvent(new Event('delf-auth-dismissed'));
 returnFocus?.focus?.();
}
function friendlyError(error){
 const message=String(error?.message||'').toLowerCase();
 if(/email not confirmed/.test(message))$('auth-confirm-help')?.classList.remove('hidden');
 if(/invalid login|invalid credentials|email not confirmed/.test(message))return /not confirmed/.test(message)?'Please confirm your email address before signing in.':'Incorrect email address or password.';
 if(/rate limit|too many|over_email_send_rate_limit/.test(message))return 'Too many attempts. Please try again in a few minutes.';
 if(/password should be|weak password|least 6/.test(message))return 'Please choose a stronger password.';
 if(/user already registered|already registered/.test(message))return 'An account already exists with this email address. Try signing in.';
 if(/network|fetch|failed to fetch|timeout/.test(message))return 'Connection interrupted. Check your internet connection and try again.';
 return error?.message||'Something went wrong. Please try again.';
}
function validate(form){
 if(!form.checkValidity()){form.reportValidity();return false}return true;
}
async function perform(btn,label,callback){
 if(busy)return;
 busy=true;$('auth-panel').querySelector('.auth-dialog').setAttribute('aria-busy','true');
 setMessage('');const restore=setButtonBusy(btn,true,label);
 try{await callback()}catch(error){setMessage(friendlyError(error),'error')}
 finally{busy=false;$('auth-panel').querySelector('.auth-dialog').removeAttribute('aria-busy');restore()}
}
function strength(){
 const value=$('signup-password').value;
 let n=0;if(value.length>=8)n++;if(/[a-z]/.test(value)&&/[A-Z]/.test(value))n++;if(/\d/.test(value))n++;if(/[^a-zA-Z0-9]/.test(value))n++;
 document.querySelectorAll('.auth-strength span').forEach((bar,i)=>{bar.classList.toggle('filled',i<n);bar.dataset.level=n<=1?'low':n===2?'medium':'good'});
 $('auth-strength-label').textContent=value?(n<=1?'Needs improvement: use a mix of letters, numbers and symbols.':n===2?'Good start. Add a wider mix of characters.':'Stronger password.'): 'At least 8 characters. A mix of letters, numbers and symbols is recommended.';
}
function checkPasswords(a,b){
 if(a!==b){setMessage('The passwords do not match.','error');return false}
 return true;
}
function successHandler(){
 closeAuth(true);toast('Welcome to your ddelf account.');
 afterSignIn?.();
}
function cleanAuthQuery(){
 const url=new URL(window.location.href);if(!['auth','code','token_hash'].some(x=>url.searchParams.has(x))&&!/access_token=|refresh_token=/.test(url.hash))return;
 for(const param of ['auth','code','token_hash','type'])url.searchParams.delete(param);
 const hash=/access_token=|refresh_token=/.test(url.hash)?'':url.hash;
 history.replaceState(history.state,'',url.pathname+url.search+hash);
}
export function initAuthUI({onSignedIn}={}){
 afterSignIn=onSignedIn||null;
 $('auth-open')?.addEventListener('click',()=>openAuth('signin'));
 $('auth-close')?.addEventListener('click',()=>closeAuth());
 $('auth-panel')?.addEventListener('mousedown',e=>{if(e.target===$('auth-panel'))closeAuth()});
 document.addEventListener('keydown',e=>{
  if($('auth-panel')?.classList.contains('hidden'))return;
  if(e.key==='Escape'){e.preventDefault();closeAuth()}
  if(e.key==='Tab'){
   const focusable=[...$('auth-panel').querySelectorAll('button:not([disabled]):not(.hidden),input:not([disabled]),a[href]')].filter(el=>el.offsetParent!==null);
   if(!focusable.length)return;
   const first=focusable[0],last=focusable[focusable.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
 });
 document.querySelectorAll('[data-auth-tab]').forEach(btn=>btn.addEventListener('click',()=>toggleForm(btn.dataset.authTab)));
 document.querySelectorAll('[data-auth-view]').forEach(btn=>btn.addEventListener('click',()=>toggleForm(btn.dataset.authView)));
 document.querySelectorAll('[data-toggle-password]').forEach(btn=>btn.addEventListener('click',()=>{
  const target=$(btn.dataset.togglePassword),revealed=target.type==='password';target.type=revealed?'text':'password';btn.textContent=revealed?'Hide':'Show';btn.setAttribute('aria-pressed',String(revealed));btn.setAttribute('aria-label',revealed?'Hide password':'Show password');target.focus();
 }));
 $('signup-password').addEventListener('input',strength);
 $('auth-confirm-help')?.addEventListener('click',()=>{
  const email=emailValue('signin');if(!email||!$('signin-email').checkValidity()){$('signin-email').reportValidity();return}
  pendingEmail=email;mailType='signup';
  perform($('auth-confirm-help'),'Sending link…',async()=>{await db.resendConfirmation(email);toggleForm('checkmail')});
 });
 $('auth-signin').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;if(!validate(form))return;
  perform($('auth-signin-submit'),'Signing in…',async()=>{
   await db.signIn(emailValue('signin'),$('signin-password').value);
   successHandler();
  });
 });
 $('auth-signup').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;if(!validate(form))return;
  const pass=$('signup-password').value;if(!checkPasswords(pass,$('signup-confirm').value))return;
  perform($('auth-signup-submit'),'Creating account…',async()=>{
   pendingEmail=emailValue('signup');
   const data=await db.signUp(pendingEmail,pass);
   if(data.session){successHandler();return}
   mailType='signup';toggleForm('checkmail');
  });
 });
 $('auth-forgot').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;if(!validate(form))return;
  perform(form.querySelector('[type=submit]'),'Sending link…',async()=>{
   pendingEmail=emailValue('forgot');await db.sendPasswordReset(pendingEmail);
   mailType='reset';toggleForm('checkmail');
  });
 });
 $('auth-reset').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;if(!validate(form))return;
  const password=$('reset-password').value;if(!checkPasswords(password,$('reset-confirm').value))return;
  perform(form.querySelector('[type=submit]'),'Saving…',async()=>{
   await db.updatePassword(password);
   toggleForm('success');cleanAuthQuery();
  });
 });
 $('auth-resend').addEventListener('click',()=>{
  if(!pendingEmail)return;
  perform($('auth-resend'),'Sending…',async()=>{
   if(mailType==='signup')await db.resendConfirmation(pendingEmail);
   else await db.sendPasswordReset(pendingEmail);
   setMessage('Email sent again. Check your inbox and spam folder.','success');
  });
 });
 window.addEventListener('delf-auth-recovery',()=>{if(db.isLive())openAuth('reset')});
 window.addEventListener('delf-auth-required',event=>openAuth('signin',event.detail?.message||''));
}
export function handleAuthCallback(){
 const flow=new URLSearchParams(location.search).get('auth');if(!flow)return;
 if(flow==='reset'){
  if(db.currentUser())openAuth('reset');
  else openAuth('forgot','This password-reset link has expired or is invalid. Request a new link.');
 }else if(flow==='confirmed'){
  if(db.currentUser())toast('Email confirmed. Welcome!');
  else openAuth('signin','Your email is confirmed. Sign in to continue.');
  cleanAuthQuery();
 }
}
