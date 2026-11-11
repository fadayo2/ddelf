import * as db from './backend.js';
import {escapeHtml,textLines,$,$$,getLS,setLS,readParams,fmtTime,wordCount,toast,modal,sectionNames,sectionShort,badge,showTransition,setButtonBusy} from './utils.js';
const s={attempt:null,paper:null,answers:{},section:0,exercise:0,audioPlays:{},audioPhases:{},timer:null,audioTick:null,processing:false,saving:0};
const key=()=>`delfa2-backup:${s.attempt?.id}`;
const audioKey=()=>`delfa2-audio-phase:${s.attempt?.id}`;
const anyQuestions=()=>s.paper.questions;
const exerciseList=()=>s.paper.exercises.filter(e=>e.section_id===s.paper.sections[s.section]?.id).sort((a,b)=>a.position-b.position);
const getSection=()=>s.paper.sections[s.section];
const activeExercise=()=>exerciseList()[s.exercise];
const qList=(e)=>s.paper.questions.filter(q=>q.exercise_id===e.id).sort((a,b)=>a.position-b.position);
const isPremium=()=>s.attempt.mode==='premium';
const getRemaining=()=>Math.max(0,Math.ceil((new Date(s.attempt.section_started_at).getTime()+getSection().duration_seconds*1000-Date.now())/1000));
const answersFor=(qs)=>qs.filter(q=>{let a=s.answers[q.id];return a&&((a.value!=null&&a.value!=='')||(a.text||'').trim()!=='')}).length;
export async function startExam(mode,examId,trigger=null){
 if(db.requiresAuth()){
  window.dispatchEvent(new CustomEvent('delf-auth-required',{detail:{message:'Connectez-vous pour enregistrer votre tentative et reprendre vos réponses.',start:{mode,examId}}}));
  return;
 }
 if(mode==='premium'){
  const yes=await modal({title:'Avant de commencer l’examen',body:'<p>Vous allez passer les trois épreuves dans l’ordre : compréhension de l’oral (25 min), compréhension des écrits (30 min), production écrite (45 min).</p><p class="mt-2">Chaque section commence dès son ouverture. Le chronomètre continue après un rafraîchissement ou une fermeture de page. Les deux écoutes autorisées par enregistrement et leurs pauses sont gérées par le simulateur.</p><p class="mt-2">Vos réponses sont enregistrées automatiquement. Les corrections ne seront visibles qu’après la fin de la production écrite.</p>',action:'Commencer l’examen'});
  if(!yes)return;
 }
 const restore=trigger?setButtonBusy(trigger,true,'Préparation…'):()=>{};
 const dismiss=showTransition('Préparation de votre tentative…');
 try{let a=await db.beginAttempt(examId,mode);location.href=`./exam.html?attempt=${encodeURIComponent(a.id)}`}
 catch(e){dismiss();restore();toast(e.message,'error')}
}
export async function examPage(){
 const id=readParams().get('attempt');if(!id){location.href='./dashboard.html';return}
 try{
  s.attempt=await db.getAttempt(id);if(!s.attempt)throw Error('Tentative introuvable');
  if(s.attempt.status==='completed'){location.href=`./results.html?attempt=${id}`;return}
  s.paper=await db.getPaper(s.attempt.exam_id);
  s.paper.sections.sort((a,b)=>a.position-b.position);
  s.section=isPremium()?s.attempt.active_section-1:0;
  s.answers=await db.getAnswers(id);s.audioPlays=await db.getPlayCounts(id);
  s.audioPhases=getLS(audioKey(),{});
  const backups=getLS(key(),{});
  for(let [qid,item] of Object.entries(backups))if(item.pending)s.answers[qid]=item.response;
  render();flushBackups();
  if(isPremium()){s.timer=setInterval(tick,1000);tick()}
  window.addEventListener('online',flushBackups);
  window.addEventListener('beforeunload',e=>{if(s.saving>0){e.preventDefault();e.returnValue=''}});
 }catch(e){$('#app').innerHTML=`<div class="panel"><h2 class="h2">Impossible d’ouvrir cette tentative</h2><p class="muted mt-2">${escapeHtml(e.message)}</p><a href="./dashboard.html" class="btn btn-primary mt-5">Retour au tableau de bord</a></div>`}
}
const FRENCH_ACCENTS=['é','è','ê','ë','à','â','ù','û','ü','î','ï','ô','ö','ç','œ','æ','É','È','Ê','À','Ç','Œ'];
function imageCard(path,caption,compact=false){
 const safe=escapeHtml(path),label=escapeHtml(caption);
 return `<figure class="exam-image-card ${compact?'exam-image-card--compact':''}">
  <div class="exam-image-heading"><figcaption>${label}</figcaption><button type="button" class="image-expand" data-image-open="./${safe}" data-image-caption="${label}" aria-label="Agrandir ${label}">⛶ Agrandir</button></div>
  <button type="button" class="exam-image-preview" data-image-open="./${safe}" data-image-caption="${label}" title="Afficher l’image en grand" aria-label="Afficher ${label} en grand">
   <img src="./${safe}" alt="${label}" loading="lazy" decoding="async"><span class="image-preview-hint">Cliquer pour agrandir</span>
  </button>
 </figure>`;
}
let imageViewer=null;
let viewerFocus=null;
function ensureImageViewer(){
 if(imageViewer)return imageViewer;
 imageViewer=document.createElement('div');
 imageViewer.id='exam-image-viewer';imageViewer.className='image-viewer';
 imageViewer.setAttribute('role','dialog');imageViewer.setAttribute('aria-modal','true');imageViewer.setAttribute('aria-label','Agrandissement du document');
 imageViewer.innerHTML=`<div class="image-viewer-head"><div class="image-viewer-title" id="image-viewer-caption"></div><div class="image-viewer-actions"><button type="button" data-zoom="out" aria-label="Réduire l’image">−</button><span id="image-viewer-zoom" aria-live="polite">100 %</span><button type="button" data-zoom="in" aria-label="Zoom avant">+</button><button type="button" data-zoom="fit">Ajuster</button><button type="button" data-zoom="fullscreen" id="image-viewer-fullscreen">Plein écran</button><button type="button" data-zoom="close" class="image-viewer-close" aria-label="Fermer l’image">×</button></div></div><div class="image-viewer-stage" id="image-viewer-stage"><img id="image-viewer-picture" alt="Document de l’examen agrandi"></div>`;
 document.body.appendChild(imageViewer);
 imageViewer.addEventListener('click',e=>{if(e.target===imageViewer)closeImageViewer()});
 imageViewer.querySelectorAll('[data-zoom]').forEach(btn=>btn.addEventListener('click',()=>{
  const action=btn.dataset.zoom;
  if(action==='close')return closeImageViewer();
  if(action==='fullscreen')return toggleViewerFullscreen();
  const img=imageViewer.querySelector('#image-viewer-picture');
  if(action==='fit')imageViewer.dataset.zoom='1';
  else imageViewer.dataset.zoom=String(Math.min(4,Math.max(.65,(Number(imageViewer.dataset.zoom)||1)*(action==='in'?1.3:1/1.3))));
  sizeViewerImage(img);
 }));
 document.addEventListener('keydown',e=>{
  if(!imageViewer?.classList.contains('is-open'))return;
  if(e.key==='Escape'){e.preventDefault();closeImageViewer()}
  if(e.key==='+'||e.key==='='){e.preventDefault();imageViewer.querySelector('[data-zoom="in"]').click()}
  if(e.key==='-'){e.preventDefault();imageViewer.querySelector('[data-zoom="out"]').click()}
  if(e.key==='Tab'){
   const buttons=[...imageViewer.querySelectorAll('button')];
   const first=buttons[0],last=buttons[buttons.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
 });
 document.addEventListener('fullscreenchange',()=>{if(imageViewer&& !document.fullscreenElement){const btn=imageViewer.querySelector('#image-viewer-fullscreen');if(btn)btn.textContent='Plein écran'}});
 return imageViewer;
}
function sizeViewerImage(img){
 const zoom=Number(imageViewer.dataset.zoom)||1;
 const width=Math.min(img.naturalWidth||700,Math.max(260,window.innerWidth-50));
 img.style.width=Math.round(width*zoom)+'px';img.style.maxWidth='none';
 imageViewer.querySelector('#image-viewer-zoom').textContent=Math.round(zoom*100)+' %';
}
function openImageViewer(path,caption,origin){
 const viewer=ensureImageViewer();viewerFocus=origin;
 const img=viewer.querySelector('#image-viewer-picture');
 img.src=path;img.alt=caption;viewer.querySelector('#image-viewer-caption').textContent=caption;
 viewer.dataset.zoom='1';viewer.classList.add('is-open');document.body.classList.add('image-viewer-open');
 img.onload=()=>sizeViewerImage(img);if(img.complete&&img.naturalWidth)sizeViewerImage(img);
 viewer.querySelector('[data-zoom="close"]').focus();
}
async function toggleViewerFullscreen(){
 if(document.fullscreenElement===imageViewer){await document.exitFullscreen();return}
 if(imageViewer.requestFullscreen){try{await imageViewer.requestFullscreen();imageViewer.querySelector('#image-viewer-fullscreen').textContent='Quitter plein écran'}catch{/* The full-viewport viewer remains available when browser fullscreen is blocked. */}}
}
async function closeImageViewer(){
 if(!imageViewer)return;
 if(document.fullscreenElement===imageViewer){try{await document.exitFullscreen()}catch{}}
 imageViewer.classList.remove('is-open');document.body.classList.remove('image-viewer-open');
 if(viewerFocus?.isConnected)viewerFocus.focus();viewerFocus=null;
}
function bindImageCards(){
 document.querySelectorAll('#app [data-image-open]').forEach(el=>el.addEventListener('click',()=>openImageViewer(el.dataset.imageOpen,el.dataset.imageCaption,el)));
}
function insertAccent(textarea,char){
 if(!textarea)return;
 const start=textarea.selectionStart,end=textarea.selectionEnd;
 textarea.focus({preventScroll:true});textarea.setRangeText(char,start,end,'end');
 textarea.dispatchEvent(new Event('input',{bubbles:true}));
}
function bindAccentKeys(){
 document.querySelectorAll('#app [data-accent]').forEach(button=>button.addEventListener('click',()=>{
  const textarea=button.closest('.question-item')?.querySelector('textarea.writing-area');
  insertAccent(textarea,button.dataset.accent);
 }));
}
function render(){
 const sc=getSection(),ex=activeExercise(),allQ=s.paper.questions.filter(q=>exerciseList().some(e=>e.id===q.exercise_id));
 const ans=answersFor(allQ);const total=allQ.length;
 $('#app').innerHTML=`<div class="exam-top"><div class="exam-header container"><div><div class="eyebrow">SUJET N° 01 · DELF A2 TOUT PUBLIC</div><h1 class="h2 mt-1">${sectionNames[sc.kind]}</h1><div class="muted small mt-1">${isPremium()?'Mode Premium · Simulation chronométrée':'Mode Standard · Entraînement libre'}</div></div><div class="exam-header-end"><span class="badge ${isPremium()?'badge-red':'badge-green'}">${isPremium()?'SIMULATION':'PRATIQUE'}</span>${isPremium()?`<div class="timer" id="timer"><span>Temps restant</span><strong id="timer-value">--:--</strong></div>`:''}</div></div><div class="container"><div class="section-tabs">${s.paper.sections.map((p,i)=>`<button class="section-tab ${i===s.section?'selected':''}" data-section="${i}" ${isPremium()&&i!==s.section?'disabled':''}><span class="tab-number">0${i+1}</span><span>${sectionShort[p.kind]}</span></button>`).join('')}</div></div></div>
 <div class="container exam-grid mt-6"><aside class="exam-sidebar"><div class="panel sidebar-panel"><div class="eyebrow">EXERCICES</div><h2 class="font-semibold mt-1">${sectionNames[sc.kind]}</h2><div class="exercise-links mt-4">${exerciseList().map((e,i)=>{const q=qList(e);return `<button class="exercise-link ${i===s.exercise?'active':''}" data-exercise="${i}"><span>${escapeHtml(e.title)} <small>· ${e.points} pts</small></span><span class="dot-indicator ${answersFor(q)===q.length?'filled':''}"></span></button>`}).join('')}</div><div class="progress-track mt-5"><span style="width:${total?ans/total*100:0}%"></span></div><div class="small muted mt-2">${ans} sur ${total} réponses</div></div><div class="hint-card mt-4"><strong>Consignes générales</strong><p class="small mt-2">${escapeHtml(sc.instructions)}</p></div></aside>
 <section class="exam-main"><div class="panel question-panel"><div class="flex justify-between items-center flex-wrap gap-2"><div class="eyebrow">${escapeHtml(ex.title.toUpperCase())} · ${ex.points} POINTS</div>${badge(`${s.exercise+1} / ${exerciseList().length} exercices`)}</div><p class="font-medium text-dark mt-4">${escapeHtml(ex.instructions||sc.instructions)}</p>
 ${ex.context?ex.image_path?`<details class="source-card source-text-details mt-5"><summary>Version texte du document (facultatif)</summary><div class="source-body">${textLines(ex.context)}</div></details>`:`<div class="source-card mt-5"><div class="source-label">DOCUMENT À LIRE</div><div class="source-body">${textLines(ex.context)}</div></div>`:''}
 ${ex.image_path?imageCard(ex.image_path,'Document original — '+ex.title+' ('+sectionShort[sc.kind]+')'):''}
 <div id="audio-slot"></div>
 <div class="questions-stack">${qList(ex).map(q=>renderQuestion(q)).join('')}</div>
 <div class="exam-controls"><button class="btn btn-light" id="previous" ${s.exercise===0?'disabled':''}>← Exercice précédent</button><div class="autosave"><span class="save-dot"></span><span id="save-status">Sauvegarde automatique</span></div><button class="btn ${s.exercise===exerciseList().length-1?'btn-outline':'btn-primary'}" id="next">${s.exercise===exerciseList().length-1?'Terminer cette section':'Exercice suivant →'}</button></div></div></section></div>`;
 bindFields(ex);
 bindImageCards();
 bindAccentKeys();
 $$('#app [data-exercise]').forEach(b=>b.onclick=()=>{s.exercise=Number(b.dataset.exercise);render();scrollTo({top:0,behavior:'smooth'})});
 $$('#app [data-section]').forEach(b=>b.onclick=()=>{if(isPremium())return;s.section=Number(b.dataset.section);s.exercise=0;render();scrollTo({top:0,behavior:'smooth'})});
 $('#previous').onclick=()=>{s.exercise--;render();scrollTo({top:0,behavior:'smooth'})};
 $('#next').onclick=()=>{if(s.exercise<exerciseList().length-1){s.exercise++;render();scrollTo({top:0,behavior:'smooth'})}else submitSection(false)};
 const audio=s.paper.audio_assets.find(x=>x.exercise_id===ex.id);if(audio)renderAudio(audio,ex.id);
 if(isPremium())tick();
}
function renderQuestion(q){
 const val=s.answers[q.id]||{};let content='';
 if(q.type==='single'||q.type==='choice_justification'){
  content=`${q.image_path?imageCard(q.image_path,'Illustrations originales — question '+q.position,true):''}<div class="answer-options">${q.options.map(o=>`<label class="option ${val.value===o.value?'checked':''}"><input type="radio" name="q-${q.id}" data-qid="${q.id}" data-kind="value" value="${escapeHtml(o.value)}" ${val.value===o.value?'checked':''}><span class="option-radio"></span><span>${escapeHtml(o.label)}</span></label>`).join('')}</div>`;
  if(q.type==='choice_justification')content+=`<label class="field-label mt-3" for="j-${q.id}">Justification : citez une expression du texte.</label><textarea class="form-input answer-textarea" id="j-${q.id}" data-qid="${q.id}" data-kind="justification" rows="2" placeholder="Relevez un passage précis du document…">${escapeHtml(val.justification||'')}</textarea>`;
 }else if(q.type==='short')content=`<input class="form-input mt-4" data-qid="${q.id}" data-kind="text" value="${escapeHtml(val.text||'')}" placeholder="Écrivez votre réponse…" autocomplete="off">`;
 else if(q.type==='writing'){
  const n=wordCount(val.text||'');content=`<div class="writing-toolbar"><span>Rédigez votre réponse en français</span><span class="word-count ${n>80||n<60?'word-alert':''}" id="wc-${q.id}">${n} / 60–80 mots</span></div><textarea class="form-input writing-area" id="write-${q.id}" data-qid="${q.id}" data-kind="text" rows="12" placeholder="Écrivez votre texte ici…" spellcheck="true" lang="fr" aria-label="Réponse écrite ${q.position}">${escapeHtml(val.text||'')}</textarea><div class="accent-bar" role="group" aria-label="Caractères accentués français"><span class="accent-label">Caractères français</span><div class="accent-keys">${FRENCH_ACCENTS.map(c=>`<button type="button" class="accent-key" data-accent="${c}" title="Insérer ${c}" aria-label="Insérer ${c}">${c}</button>`).join('')}</div><span class="accent-help">Appuyez pour insérer au curseur.</span></div><p class="muted small mt-2">Le brouillon est sauvegardé automatiquement. La note sera une estimation de pratique, pas une note officielle.</p>`;
 }
 return `<article class="question-item" id="question-${q.id}"><div class="question-heading"><span class="question-no">${q.position}</span><div class="flex-1"><h3 class="question-title">${escapeHtml(q.prompt)}</h3><span class="small muted">${q.points} ${q.points===1?'point':'points'}</span></div></div>${content}</article>`;
}
const saveTimers=new Map();
function bindFields(ex){
 $$('[data-qid]').forEach(el=>{
  const type=el.type==='radio'?'change':'input';
  el.addEventListener(type,()=>{
   let qid=el.dataset.qid;let field=el.dataset.kind;let a={...(s.answers[qid]||{})};a[field]=el.value;s.answers[qid]=a;
   if(el.type==='radio')$$(`input[name="q-${qid}"]`).forEach(r=>r.closest('.option')?.classList.toggle('checked',r.checked));
   if(field==='text'){let wc=$(`#wc-${qid}`);if(wc){let n=wordCount(a.text);wc.textContent=`${n} / 60–80 mots`;wc.classList.toggle('word-alert',n<60||n>80)}}
   let backup=getLS(key(),{});backup[qid]={response:a,pending:true,saved_at:Date.now()};setLS(key(),backup);
   const status=$('#save-status');if(status)status.textContent='Enregistrement…';
   clearTimeout(saveTimers.get(qid));saveTimers.set(qid,setTimeout(()=>persist(qid,a),580));
  });
 });
}
async function persist(qid,value){
 s.saving++;try{await db.saveAnswer(s.attempt.id,qid,value);
  const backups=getLS(key(),{});if(backups[qid]&&JSON.stringify(backups[qid].response)===JSON.stringify(value)){backups[qid].pending=false;setLS(key(),backups)}
  const status=$('#save-status');if(status)status.textContent='Réponses enregistrées';
 }catch(e){const status=$('#save-status');if(status)status.textContent='Sauvegarde locale · en attente';toast('Enregistrement serveur en attente : '+e.message,'error')}
 finally{s.saving--}
}
async function flushBackups(){
 if(s.processing)return;
 const backups=getLS(key(),{});for(let [qid,item] of Object.entries(backups))if(item.pending){try{await persist(qid,item.response)}catch{break}}
}
async function flushAll(){
 for(const timer of saveTimers.values())clearTimeout(timer);saveTimers.clear();
 const backup=getLS(key(),{});for(let [qid,item] of Object.entries(backup))if(item.pending)await persist(qid,item.response);
 if(db.isLive()&&Object.values(getLS(key(),{})).some(x=>x.pending))throw Error('Certaines réponses ne sont pas synchronisées avec Supabase. Vérifiez la connexion avant de terminer.');
}
async function submitSection(expired){
 if(s.processing)return;
 const final=isPremium()?s.attempt.active_section===3:true;
 if(!expired){const question=final?'Terminer et soumettre les trois épreuves ?':'Passer à l’épreuve suivante ?';
  const yes=await modal({title:question,body:`<p>${final?'Une fois soumis, vous pourrez consulter les résultats et les corrections disponibles.':'Le chronomètre de la prochaine épreuve commencera immédiatement et vous ne pourrez plus revenir en arrière.'}</p><p class="mt-2">Les réponses non renseignées restent sans points. Vérifiez votre travail avant de confirmer.</p>`,action:final?'Soumettre ma copie':'Terminer cette épreuve',danger:final});
  if(!yes)return;
 }
 s.processing=true;const dismiss=showTransition(expired?'Temps écoulé · Enregistrement des réponses…':'Enregistrement de votre copie…');try{
  if(expired){
   for(const timer of saveTimers.values())clearTimeout(timer);saveTimers.clear();
   if(Object.values(getLS(key(),{})).some(x=>x.pending))toast('Le temps est écoulé : une réponse en attente de synchronisation pourrait ne pas être notée.','error');
  } else await flushAll();
  let steps=(isPremium()?1:4-s.attempt.active_section);let current;
  for(let i=0;i<steps;i++){current=await db.advanceAttempt(s.attempt.id);s.attempt=current;if(current.status==='completed')break}
  if(current.status==='completed'){location.href=`./results.html?attempt=${s.attempt.id}`;return}
  s.section=current.active_section-1;s.exercise=0;render();window.scrollTo(0,0);
  toast(expired?'Le temps est écoulé. L’épreuve suivante commence.':'Épreuve soumise.');
 }catch(e){toast('Soumission impossible : '+e.message,'error')}
 finally{s.processing=false;dismiss()}
}
function tick(){
 if(!s.attempt||!s.paper||s.processing)return;
 let sec=getRemaining();const el=$('#timer-value');if(el)el.textContent=fmtTime(sec);
 const box=$('#timer');if(box)box.classList.toggle('timer-alert',sec<=300);
 if(sec===0)submitSection(true);
}
async function renderAudio(asset,exId){
 const slot=$('#audio-slot');if(!slot)return;
 let count=s.audioPlays[asset.id]||0;
 let data=s.audioPhases[exId]||{};
 let phase=data.phase||'idle';
 if(isPremium() && (count>=2||phase==='done'))phase='done';
 else if(isPremium()&&phase==='playing1')phase='pause';
 else if(isPremium()&&phase==='playing2')phase='done';
 if(phase==='pause'&&data.until&&Date.now()>=data.until)phase='ready2';
 if(phase==='read'&&data.until&&Date.now()>=data.until)phase='ready1';
 const store=(p,until=0)=>{phase=p;s.audioPhases[exId]={phase,until};setLS(audioKey(),s.audioPhases)};
 store(phase,data.until||0);
 slot.innerHTML=`<div class="audio-panel mt-5"><div class="audio-symbol">♫</div><div class="audio-main"><div class="eyebrow">DOCUMENT AUDIO ORIGINAL</div><h3 class="font-semibold mt-1">Écoute — ${escapeHtml(activeExercise().title)}</h3><div class="small muted" id="audio-help">${isPremium()?'Deux écoutes, séparées par une pause de 30 secondes.':'Écoute libre · Relecture autorisée'}</div><div class="audio-controls"><button class="audio-button" id="play-audio" aria-label="Écouter">▶</button><div class="audio-track"><input type="range" id="audio-range" min="0" max="100" value="0" aria-label="Progression audio" ${isPremium()?'disabled':''}><div class="audio-times"><span id="audio-current">00:00</span><span id="audio-total">${fmtTime(asset.duration_seconds)}</span></div></div><span class="badge badge-neutral" id="audio-plays">${isPremium()?`${count}/2 écoutes`:'Illimité'}</span></div><audio id="audio-element" preload="metadata"></audio></div></div>`;
 const audio=$('#audio-element'),btn=$('#play-audio'),range=$('#audio-range'),helper=$('#audio-help');
 const unbusy=setButtonBusy(btn,true,'…');helper.textContent='Préparation du document audio…';
 try{audio.src=await db.audioUrl(asset)}catch(e){unbusy();helper.textContent=e.message;btn.disabled=true;return}
 unbusy();helper.textContent=isPremium()?'Deux écoutes autorisées · consignes et pauses intégrées.':'Écoute libre · Relecture autorisée';
 audio.onloadedmetadata=()=>{$('#audio-total').textContent=fmtTime(audio.duration||asset.duration_seconds)};
 audio.ontimeupdate=()=>{$('#audio-current').textContent=fmtTime(audio.currentTime);range.value=String(audio.duration?audio.currentTime/audio.duration*100:0)};
 if(!isPremium())range.oninput=()=>{audio.currentTime=audio.duration*Number(range.value)/100};
 const refresh=()=>{
  if(!slot.isConnected){audio.pause();return}
  let current=s.audioPhases[exId]||{};let now=Date.now();
  if(phase==='read'&&current.until<=now)store('ready1');
  if(phase==='pause'&&current.until<=now)store('ready2');
  if(isPremium()){
   btn.disabled=['idle','read','pause','done'].includes(phase);
   if(phase==='idle'){btn.disabled=false;btn.textContent='▶';helper.textContent='Appuyez pour commencer les 30 secondes de lecture des questions.'}
   if(phase==='read')helper.textContent=`Lisez les questions · Première écoute dans ${Math.max(0,Math.ceil((current.until-now)/1000))} s`;
   if(phase==='ready1')helper.textContent='Première écoute : appuyez sur lecture.';
   if(phase==='pause')helper.textContent=`Pause pour répondre : ${Math.max(0,Math.ceil((current.until-now)/1000))} s`;
   if(phase==='ready2')helper.textContent='Deuxième écoute : appuyez sur lecture.';
   if(phase==='done')helper.textContent='Deux écoutes terminées. Vous pouvez terminer les réponses.';
  }
 };
 refresh();
 let interval=setInterval(()=>{if(!slot.isConnected){clearInterval(interval);audio.pause()}else refresh()},350);
 btn.onclick=async()=>{
  if(!isPremium()){
   if(audio.paused){if(audio.currentTime===0)try{let r=await db.registerPlay(s.attempt.id,asset.id,'standard',asset.max_plays);s.audioPlays[asset.id]=r.plays}catch(e){toast(e.message,'error');return}
    try{await audio.play();btn.textContent='Ⅱ'}catch(e){toast('Lecture impossible : '+e.message,'error')}}
   else{audio.pause();btn.textContent='▶'}return;
  }
  if(phase==='idle'){store('read',Date.now()+30000);refresh();return}
  if(phase!=='ready1'&&phase!=='ready2')return;
  if(count>=2){store('done');refresh();return}
  try{
   audio.currentTime=0;
   let r=await db.registerPlay(s.attempt.id,asset.id,'premium',asset.max_plays);
   count=r.plays;s.audioPlays[asset.id]=count;$('#audio-plays').textContent=`${count}/2 écoutes`;
   store(count===1?'playing1':'playing2');await audio.play();
   btn.disabled=true;btn.textContent='Ⅱ';refresh();
  }catch(e){toast(e.message,'error')}
 };
 audio.onended=()=>{
  if(isPremium()){if(count===1)store('pause',Date.now()+30000);else store('done');refresh()}
  btn.textContent='▶';
 };
}
