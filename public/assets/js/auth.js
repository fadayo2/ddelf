import * as db from './backend.js';
import {toast,setButtonBusy} from './utils.js';

const $=id=>document.getElementById(id);
const views=['signin','signup','forgot','checkmail','reset','success'];
const descriptions={
 signin:['Heureux de vous revoir.','Connectez-vous pour reprendre votre préparation.'],
 signup:['Créer votre compte.','Un seul compte pour retrouver vos copies sur tous vos appareils.'],
 forgot:['Mot de passe oublié ?','Entrez votre adresse e-mail pour recevoir un lien sécurisé.'],
 checkmail:['Encore une petite étape.','Vérifiez votre messagerie pour poursuivre.'],
 reset:['Choisir un nouveau mot de passe.','Votre nouveau mot de passe doit comporter au moins 8 caractères.'],
 success:['Tout est prêt !','Votre accès à delfA2 est disponible.']
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
 if(/invalid login|invalid credentials|email not confirmed/.test(message))return /not confirmed/.test(message)?'Veuillez confirmer votre adresse e-mail avant de vous connecter.':'Adresse e-mail ou mot de passe incorrect.';
 if(/rate limit|too many|over_email_send_rate_limit/.test(message))return 'Trop de tentatives. Réessayez dans quelques minutes.';
 if(/password should be|weak password|least 6/.test(message))return 'Choisissez un mot de passe plus solide.';
 if(/user already registered|already registered/.test(message))return 'Un compte existe déjà avec cette adresse. Essayez de vous connecter.';
 if(/network|fetch|failed to fetch|timeout/.test(message))return 'Connexion interrompue. Vérifiez Internet, puis réessayez.';
 return error?.message||'Une erreur est survenue. Veuillez réessayer.';
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
 $('auth-strength-label').textContent=value?(n<=1?'À renforcer : utilisez des lettres, des chiffres et des symboles.':n===2?'Bon début. Ajoutez un mélange de caractères.':'Mot de passe plus solide.'): 'Au moins 8 caractères ; lettres, chiffres et symboles recommandés.';
}
function checkPasswords(a,b){
 if(a!==b){setMessage('Les mots de passe ne correspondent pas.','error');return false}
 return true;
}
function successHandler(){
 closeAuth(true);toast('Bienvenue dans votre espace delfA2.');
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
  const target=$(btn.dataset.togglePassword),revealed=target.type==='password';target.type=revealed?'text':'password';btn.textContent=revealed?'Masquer':'Afficher';btn.setAttribute('aria-pressed',String(revealed));btn.setAttribute('aria-label',revealed?'Masquer le mot de passe':'Afficher le mot de passe');target.focus();
 }));
 $('signup-password').addEventListener('input',strength);
 $('auth-confirm-help')?.addEventListener('click',()=>{
  const email=emailValue('signin');if(!email||!$('signin-email').checkValidity()){$('signin-email').reportValidity();return}
  pendingEmail=email;mailType='signup';
  perform($('auth-confirm-help'),'Envoi du lien…',async()=>{await db.resendConfirmation(email);toggleForm('checkmail')});
 });
 $('auth-signin').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;if(!validate(form))return;
  perform($('auth-signin-submit'),'Connexion en cours…',async()=>{
   await db.signIn(emailValue('signin'),$('signin-password').value);
   successHandler();
  });
 });
 $('auth-signup').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;if(!validate(form))return;
  const pass=$('signup-password').value;if(!checkPasswords(pass,$('signup-confirm').value))return;
  perform($('auth-signup-submit'),'Création du compte…',async()=>{
   pendingEmail=emailValue('signup');
   const data=await db.signUp(pendingEmail,pass);
   if(data.session){successHandler();return}
   mailType='signup';toggleForm('checkmail');
  });
 });
 $('auth-forgot').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;if(!validate(form))return;
  perform(form.querySelector('[type=submit]'),'Envoi du lien…',async()=>{
   pendingEmail=emailValue('forgot');await db.sendPasswordReset(pendingEmail);
   mailType='reset';toggleForm('checkmail');
  });
 });
 $('auth-reset').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;if(!validate(form))return;
  const password=$('reset-password').value;if(!checkPasswords(password,$('reset-confirm').value))return;
  perform(form.querySelector('[type=submit]'),'Enregistrement…',async()=>{
   await db.updatePassword(password);
   toggleForm('success');cleanAuthQuery();
  });
 });
 $('auth-resend').addEventListener('click',()=>{
  if(!pendingEmail)return;
  perform($('auth-resend'),'Envoi en cours…',async()=>{
   if(mailType==='signup')await db.resendConfirmation(pendingEmail);
   else await db.sendPasswordReset(pendingEmail);
   setMessage('E-mail renvoyé. Vérifiez votre messagerie et le dossier spam.','success');
  });
 });
 window.addEventListener('delf-auth-recovery',()=>{if(db.isLive())openAuth('reset')});
 window.addEventListener('delf-auth-required',event=>openAuth('signin',event.detail?.message||''));
}
export function handleAuthCallback(){
 const flow=new URLSearchParams(location.search).get('auth');if(!flow)return;
 if(flow==='reset'){
  if(db.currentUser())openAuth('reset');
  else openAuth('forgot','Le lien de réinitialisation est expiré ou invalide. Demandez un nouveau lien.');
 }else if(flow==='confirmed'){
  if(db.currentUser())toast('Adresse e-mail confirmée. Bienvenue !');
  else openAuth('signin','Votre adresse est confirmée. Connectez-vous pour continuer.');
  cleanAuthQuery();
 }
}
