import * as db from './backend.js';
import {escapeHtml,toast,pageLoading,setButtonBusy} from './utils.js';
import {landingPage,dashboardPage,resultsPage,historyPage,teacherPage} from './pages.js';
import {examPage,startExam} from './exam.js';
import {initAuthUI,openAuth,handleAuthCallback} from './auth.js';

const byId=id=>document.getElementById(id);
const guardedPages=new Set(['exam','results','history','teacher','dashboard']);
let pendingStart=null;
const page=document.body.dataset.page;

function refreshHeader(){
 const user=db.currentUser();
 byId('auth-open')?.classList.toggle('hidden',!db.isLive()||!!user);
 byId('logout-button')?.classList.toggle('hidden',!user);
 byId('user-name')?.classList.toggle('hidden',!user);
 if(byId('user-name'))byId('user-name').textContent=user?.email||'';
 byId('demo-flag')?.classList.toggle('hidden',db.isLive());
}
function afterSignedIn(){
 refreshHeader();
 if(pendingStart){const {mode,examId}=pendingStart;pendingStart=null;startExam(mode,examId);return}
 if(guardedPages.has(page)){location.reload();return}
}
async function main(){
 initAuthUI({onSignedIn:afterSignedIn});
 window.addEventListener('delf-auth-changed',refreshHeader);
 window.addEventListener('delf-auth-required',event=>{pendingStart=event.detail?.start||null});
 window.addEventListener('delf-auth-dismissed',()=>{pendingStart=null});
 byId('logout-button')?.addEventListener('click',async e=>{
  const restore=setButtonBusy(e.currentTarget,true,'Déconnexion…');
  try{await db.signOut();location.href='./index.html'}catch(error){restore();toast(error.message,'error')}
 });
 const titles={index:'Préparation de votre accueil…',dashboard:'Chargement de vos examens…',exam:'Chargement de votre épreuve…',results:'Calcul de vos résultats…',history:'Chargement de votre progression…',teacher:'Chargement de l’espace enseignant…'};
 pageLoading(page,'Connexion à votre espace…');
 try{
  await db.initBackend();refreshHeader();handleAuthCallback();
  if(db.requiresAuth()&&guardedPages.has(page)){
   byId('app').innerHTML='<div class="container auth-required-layout"><div class="panel auth-required-card"><span class="auth-required-mark">🔒</span><span class="eyebrow">ESPACE PERSONNEL</span><h1 class="h2 mt-3">Connectez-vous pour continuer</h1><p class="muted mt-3">Vos examens, réponses et résultats sont protégés. Connectez-vous ou créez un compte pour reprendre exactement où vous en étiez.</p><button class="btn btn-primary mt-5" id="auth-required">Continuer avec mon compte →</button><a href="./index.html" class="auth-back mt-3">Revenir à l’accueil</a></div></div>';
   byId('auth-required').onclick=()=>openAuth('signin');return;
  }
  pageLoading(page,titles[page]||'Chargement…');
  if(page==='index')await landingPage();
  else if(page==='dashboard')await dashboardPage();
  else if(page==='exam')await examPage();
  else if(page==='results')await resultsPage();
  else if(page==='history')await historyPage();
  else if(page==='teacher')await teacherPage();
 }catch(e){
  console.error(e);
  byId('app').innerHTML=`<section class="container auth-required-layout"><div class="panel auth-required-card"><h2 class="h2">Impossible de charger cette page</h2><p class="muted mt-3">${escapeHtml(e.message)}</p><div class="flex gap-3 mt-5 flex-wrap"><button class="btn btn-primary" id="retry-load">Réessayer</button><a href="./index.html" class="btn btn-light">Retour à l’accueil</a></div></div></section>`;
  byId('retry-load').onclick=()=>location.reload();
 }
}
main();
