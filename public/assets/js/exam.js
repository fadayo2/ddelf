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
  window.dispatchEvent(new CustomEvent('delf-auth-required',{detail:{message:'Sign in to save your attempt and resume your answers.',start:{mode,examId}}}));
  return;
 }
 if(mode==='premium'){
  const yes=await modal({title:'Before you begin the exam',body:'<p>You will complete the three sections in order: listening comprehension (25 min), reading comprehension (30 min), and written production (45 min).</p><p class="mt-2">Each section timer starts when the section opens. The timer continues if you refresh or close the page. The simulator manages the two permitted plays per recording and the required pauses.</p><p class="mt-2">Your answers are saved automatically. Corrections will only be available after the written production section is complete.</p>',action:'Start exam'});
  if(!yes)return;
 }
 const restore=trigger?setButtonBusy(trigger,true,'Preparing…'):()=>{};
 const dismiss=showTransition('Preparing your exam attempt…');
 try{let a=await db.beginAttempt(examId,mode);location.href=`./exam.html?attempt=${encodeURIComponent(a.id)}`}
 catch(e){dismiss();restore();toast(e.message,'error')}
}
export async function examPage(){
 const id=readParams().get('attempt');if(!id){location.href='./dashboard.html';return}
 try{
  s.attempt=await db.getAttempt(id);if(!s.attempt)throw Error('Attempt not found');
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
 }catch(e){$('#app').innerHTML=`<div class="panel"><h2 class="h2">Unable to open this attempt</h2><p class="muted mt-2">${escapeHtml(e.message)}</p><a href="./dashboard.html" class="btn btn-primary mt-5">Back to dashboard</a></div>`}
}
const FRENCH_ACCENTS=['é','è','ê','ë','à','â','ù','û','ü','î','ï','ô','ö','ç','œ','æ','É','È','Ê','À','Ç','Œ'];
function imageCard(path,caption,compact=false){
 const safe=escapeHtml(path),label=escapeHtml(caption);
 return `<figure class="exam-image-card ${compact?'exam-image-card--compact':''}">
  <div class="exam-image-heading"><figcaption>${label}</figcaption><button type="button" class="image-expand" data-image-open="./${safe}" data-image-caption="${label}" aria-label="Agrandir ${label}">⛶ Agrandir</button></div>
  <button type="button" class="exam-image-preview" data-image-open="./${safe}" data-image-caption="${label}" title="View image at full size" aria-label="View ${label} en grand">
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
 imageViewer.setAttribute('role','dialog');imageViewer.setAttribute('aria-modal','true');imageViewer.setAttribute('aria-label','Enlarged exam document');
 imageViewer.innerHTML=`<div class="image-viewer-head"><div class="image-viewer-title" id="image-viewer-caption"></div><div class="image-viewer-actions"><button type="button" data-zoom="out" aria-label="Zoom out">−</button><span id="image-viewer-zoom" aria-live="polite">100 %</span><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="fit">Fit</button><button type="button" data-zoom="fullscreen" id="image-viewer-fullscreen">Full screen</button><button type="button" data-zoom="close" class="image-viewer-close" aria-label="Close image">×</button></div></div><div class="image-viewer-stage" id="image-viewer-stage"><img id="image-viewer-picture" alt="Enlarged exam document"></div>`;
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
 document.addEventListener('fullscreenchange',()=>{if(imageViewer&& !document.fullscreenElement){const btn=imageViewer.querySelector('#image-viewer-fullscreen');if(btn)btn.textContent='Full screen'}});
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
 if(imageViewer.requestFullscreen){try{await imageViewer.requestFullscreen();imageViewer.querySelector('#image-viewer-fullscreen').textContent='Exit full screen'}catch{/* The full-viewport viewer remains available when browser fullscreen is blocked. */}}
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
 $('#app').innerHTML=`<div class="exam-top"><div class="exam-header container"><div><div class="eyebrow">SUJET N° 01 · DELF A2 TOUT PUBLIC</div><h1 class="h2 mt-1">${sectionNames[sc.kind]}</h1><div class="muted small mt-1">${isPremium()?'Premium mode · Timed simulation':'Standard mode · Free practice'}</div></div><div class="exam-header-end"><span class="badge ${isPremium()?'badge-red':'badge-green'}">${isPremium()?'SIMULATION':'PRACTICE'}</span>${isPremium()?`<div class="timer" id="timer"><span>Time remaining</span><strong id="timer-value">--:--</strong></div>`:''}</div></div><div class="container"><div class="section-tabs">${s.paper.sections.map((p,i)=>`<button class="section-tab ${i===s.section?'selected':''}" data-section="${i}" ${isPremium()&&i!==s.section?'disabled':''}><span class="tab-number">0${i+1}</span><span>${sectionShort[p.kind]}</span></button>`).join('')}</div></div></div>
 <div class="container exam-grid mt-6"><aside class="exam-sidebar"><div class="panel sidebar-panel"><div class="eyebrow">EXERCISES</div><h2 class="font-semibold mt-1">${sectionNames[sc.kind]}</h2><div class="exercise-links mt-4">${exerciseList().map((e,i)=>{const q=qList(e);return `<button class="exercise-link ${i===s.exercise?'active':''}" data-exercise="${i}"><span>${escapeHtml(e.title)} <small>· ${e.points} pts</small></span><span class="dot-indicator ${answersFor(q)===q.length?'filled':''}"></span></button>`}).join('')}</div><div class="progress-track mt-5"><span style="width:${total?ans/total*100:0}%"></span></div><div class="small muted mt-2">${ans} of ${total} answered</div></div><div class="hint-card mt-4"><strong>General instructions</strong><p class="small mt-2">${escapeHtml(sc.instructions)}</p></div></aside>
 <section class="exam-main"><div class="panel question-panel"><div class="flex justify-between items-center flex-wrap gap-2"><div class="eyebrow">${escapeHtml(ex.title.toUpperCase())} · ${ex.points} POINTS</div>${badge(`${s.exercise+1} / ${exerciseList().length} exercises`)}</div><p class="font-medium text-dark mt-4">${escapeHtml(ex.instructions||sc.instructions)}</p>
 ${ex.context?ex.image_path?`<details class="source-card source-text-details mt-5"><summary>Text version of the document (optional)</summary><div class="source-body">${textLines(ex.context)}</div></details>`:`<div class="source-card mt-5"><div class="source-label">DOCUMENT TO READ</div><div class="source-body">${textLines(ex.context)}</div></div>`:''}
 ${ex.image_path?imageCard(ex.image_path,'Original document — '+ex.title+' ('+sectionShort[sc.kind]+')'):''}
 <div id="audio-slot"></div>
 <div class="questions-stack">${qList(ex).map(q=>renderQuestion(q)).join('')}</div>
 <div class="exam-controls"><button class="btn btn-light" id="previous" ${s.exercise===0?'disabled':''}>← Previous exercise</button><div class="autosave"><span class="save-dot"></span><span id="save-status">Auto-save</span></div><button class="btn ${s.exercise===exerciseList().length-1?'btn-outline':'btn-primary'}" id="next">${s.exercise===exerciseList().length-1?'Finish this section':'Next exercise →'}</button></div></div></section></div>`;
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
  content=`${q.image_path?imageCard(q.image_path,'Original illustrations — question '+q.position,true):''}<div class="answer-options">${q.options.map(o=>`<label class="option ${val.value===o.value?'checked':''}"><input type="radio" name="q-${q.id}" data-qid="${q.id}" data-kind="value" value="${escapeHtml(o.value)}" ${val.value===o.value?'checked':''}><span class="option-radio"></span><span>${escapeHtml(o.label)}</span></label>`).join('')}</div>`;
  if(q.type==='choice_justification')content+=`<label class="field-label mt-3" for="j-${q.id}">Justification: quote an expression from the text.</label><textarea class="form-input answer-textarea" id="j-${q.id}" data-qid="${q.id}" data-kind="justification" rows="2" placeholder="Quote a specific passage from the document…">${escapeHtml(val.justification||'')}</textarea>`;
 }else if(q.type==='short')content=`<input class="form-input mt-4" data-qid="${q.id}" data-kind="text" value="${escapeHtml(val.text||'')}" placeholder="Write your answer…" autocomplete="off">`;
 else if(q.type==='writing'){
  const n=wordCount(val.text||'');content=`<div class="writing-toolbar"><span>Write your answer in French</span><span class="word-count ${n>80||n<60?'word-alert':''}" id="wc-${q.id}">${n} / 60–80 words</span></div><textarea class="form-input writing-area" id="write-${q.id}" data-qid="${q.id}" data-kind="text" rows="12" placeholder="Write your text here…" spellcheck="true" lang="fr" aria-label="Written response ${q.position}">${escapeHtml(val.text||'')}</textarea><div class="accent-bar" role="group" aria-label="French accent characters"><span class="accent-label">French characters</span><div class="accent-keys">${FRENCH_ACCENTS.map(c=>`<button type="button" class="accent-key" data-accent="${c}" title="Insert ${c}" aria-label="Insert ${c}">${c}</button>`).join('')}</div><span class="accent-help">Select a character to insert it at the cursor.</span></div><p class="muted small mt-2">Your draft is saved automatically. The score is a practice estimate, not an official result.</p>`;
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
   if(field==='text'){let wc=$(`#wc-${qid}`);if(wc){let n=wordCount(a.text);wc.textContent=`${n} / 60–80 words`;wc.classList.toggle('word-alert',n<60||n>80)}}
   let backup=getLS(key(),{});backup[qid]={response:a,pending:true,saved_at:Date.now()};setLS(key(),backup);
   const status=$('#save-status');if(status)status.textContent='Saving…';
   clearTimeout(saveTimers.get(qid));saveTimers.set(qid,setTimeout(()=>persist(qid,a),580));
  });
 });
}
async function persist(qid,value){
 s.saving++;try{await db.saveAnswer(s.attempt.id,qid,value);
  const backups=getLS(key(),{});if(backups[qid]&&JSON.stringify(backups[qid].response)===JSON.stringify(value)){backups[qid].pending=false;setLS(key(),backups)}
  const status=$('#save-status');if(status)status.textContent='Answers saved';
 }catch(e){const status=$('#save-status');if(status)status.textContent='Saved locally · waiting to sync';toast('Server save pending: '+e.message,'error')}
 finally{s.saving--}
}
async function flushBackups(){
 if(s.processing)return;
 const backups=getLS(key(),{});for(let [qid,item] of Object.entries(backups))if(item.pending){try{await persist(qid,item.response)}catch{break}}
}
async function flushAll(){
 for(const timer of saveTimers.values())clearTimeout(timer);saveTimers.clear();
 const backup=getLS(key(),{});for(let [qid,item] of Object.entries(backup))if(item.pending)await persist(qid,item.response);
 if(db.isLive()&&Object.values(getLS(key(),{})).some(x=>x.pending))throw Error('Some answers have not synced with Supabase. Check your connection before finishing.');
}
async function submitSection(expired){
 if(s.processing)return;
 const final=isPremium()?s.attempt.active_section===3:true;
 if(!expired){const question=final?'Finish and submit all three sections?':'Move to the next section?';
  const yes=await modal({title:question,body:`<p>${final?'After submission, you can view your results and available corrections.':'The next section timer will start immediately, and you will not be able to return to this section.'}</p><p class="mt-2">Unanswered questions receive no points. Review your work before confirming.</p>`,action:final?'Submit my paper':'Finish this section',danger:final});
  if(!yes)return;
 }
 s.processing=true;const dismiss=showTransition(expired?'Time is up · Saving your answers…':'Saving your paper…');try{
  if(expired){
   for(const timer of saveTimers.values())clearTimeout(timer);saveTimers.clear();
   if(Object.values(getLS(key(),{})).some(x=>x.pending))toast('Time is up: an answer still waiting to sync may not be graded.','error');
  } else await flushAll();
  let steps=(isPremium()?1:4-s.attempt.active_section);let current;
  for(let i=0;i<steps;i++){current=await db.advanceAttempt(s.attempt.id);s.attempt=current;if(current.status==='completed')break}
  if(current.status==='completed'){location.href=`./results.html?attempt=${s.attempt.id}`;return}
  s.section=current.active_section-1;s.exercise=0;render();window.scrollTo(0,0);
  toast(expired?'Time is up. The next section is starting.':'Section submitted.');
 }catch(e){toast('Unable to submit: '+e.message,'error')}
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
 slot.innerHTML=`<div class="audio-panel mt-5"><div class="audio-symbol">♫</div><div class="audio-main"><div class="eyebrow">ORIGINAL AUDIO RECORDING</div><h3 class="font-semibold mt-1">Listening — ${escapeHtml(activeExercise().title)}</h3><div class="small muted" id="audio-help">${isPremium()?'Two plays, with a 30-second pause between them.':'Practice mode · Replay allowed'}</div><div class="audio-controls"><button class="audio-button" id="play-audio" aria-label="Play audio">▶</button><div class="audio-track"><input type="range" id="audio-range" min="0" max="100" value="0" aria-label="Audio progress" ${isPremium()?'disabled':''}><div class="audio-times"><span id="audio-current">00:00</span><span id="audio-total">${fmtTime(asset.duration_seconds)}</span></div></div><span class="badge badge-neutral" id="audio-plays">${isPremium()?`${count}/2 plays`:'Unlimited'}</span></div><audio id="audio-element" preload="metadata"></audio></div></div>`;
 const audio=$('#audio-element'),btn=$('#play-audio'),range=$('#audio-range'),helper=$('#audio-help');
 const unbusy=setButtonBusy(btn,true,'…');helper.textContent='Preparing audio…';
 try{audio.src=await db.audioUrl(asset)}catch(e){unbusy();helper.textContent=e.message;btn.disabled=true;return}
 unbusy();helper.textContent=isPremium()?'Two plays allowed · instructions and pauses are built in.':'Practice mode · Replay allowed';
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
   if(phase==='idle'){btn.disabled=false;btn.textContent='▶';helper.textContent='Press to begin the 30-second question-reading period.'}
   if(phase==='read')helper.textContent=`Read the questions · First play in ${Math.max(0,Math.ceil((current.until-now)/1000))} s`;
   if(phase==='ready1')helper.textContent='First play: press play.';
   if(phase==='pause')helper.textContent=`Answering pause: ${Math.max(0,Math.ceil((current.until-now)/1000))} s`;
   if(phase==='ready2')helper.textContent='Second play: press play.';
   if(phase==='done')helper.textContent='Both plays are complete. You can finish your answers.';
  }
 };
 refresh();
 let interval=setInterval(()=>{if(!slot.isConnected){clearInterval(interval);audio.pause()}else refresh()},350);
 btn.onclick=async()=>{
  if(!isPremium()){
   if(audio.paused){if(audio.currentTime===0)try{let r=await db.registerPlay(s.attempt.id,asset.id,'standard',asset.max_plays);s.audioPlays[asset.id]=r.plays}catch(e){toast(e.message,'error');return}
    try{await audio.play();btn.textContent='Ⅱ'}catch(e){toast('Unable to play audio: '+e.message,'error')}}
   else{audio.pause();btn.textContent='▶'}return;
  }
  if(phase==='idle'){store('read',Date.now()+30000);refresh();return}
  if(phase!=='ready1'&&phase!=='ready2')return;
  if(count>=2){store('done');refresh();return}
  try{
   audio.currentTime=0;
   let r=await db.registerPlay(s.attempt.id,asset.id,'premium',asset.max_plays);
   count=r.plays;s.audioPlays[asset.id]=count;$('#audio-plays').textContent=`${count}/2 plays`;
   store(count===1?'playing1':'playing2');await audio.play();
   btn.disabled=true;btn.textContent='Ⅱ';refresh();
  }catch(e){toast(e.message,'error')}
 };
 audio.onended=()=>{
  if(isPremium()){if(count===1)store('pause',Date.now()+30000);else store('done');refresh()}
  btn.textContent='▶';
 };
}
