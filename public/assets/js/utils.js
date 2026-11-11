export const $ = (s,root=document)=>root.querySelector(s);
export const $$ = (s,root=document)=>Array.from(root.querySelectorAll(s));
export const escapeHtml = (s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const textLines = (s='')=>escapeHtml(s).replace(/\n/g,'<br>');
export const readParams = ()=>new URLSearchParams(window.location.search);
export const fmtTime = (s)=>`${String(Math.max(0,Math.floor(s/60))).padStart(2,'0')}:${String(Math.max(0,Math.floor(s%60))).padStart(2,'0')}`;
export const getLS = (k,fallback=null)=>{try{let v=localStorage.getItem(k);return v===null?fallback:JSON.parse(v)}catch{return fallback}};
export const setLS = (k,v)=>localStorage.setItem(k,JSON.stringify(v));
export const wordCount = (s='')=>s.trim()?s.trim().split(/\s+/).length:0;
export const sectionNames = {listening:"Listening comprehension",reading:"Reading comprehension",writing:'Written production'};
export const sectionShort = {listening:'Listening',reading:'Reading',writing:'Writing'};
export const icon = {listening:'♫',reading:'▣',writing:'✎'};
export const stamp = d=>new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
export const badge = (label,cls='badge-neutral')=>`<span class="badge ${cls}">${escapeHtml(label)}</span>`;
export const link = (path)=>`./${path}`;
export function toast(text,kind='info'){
 let box=document.getElementById('toast-box');if(!box){box=document.createElement('div');box.id='toast-box';box.className='toast-box';document.body.append(box)}
 const el=document.createElement('div');el.className='toast '+(kind==='error'?'toast-error':'');el.textContent=text;box.append(el);
 setTimeout(()=>el.remove(),5500);
}
export function modal({title,body,action='Continue',cancel='Cancel',danger=false}){
 return new Promise(resolve=>{
  let root=document.createElement('div');root.className='modal-overlay';root.innerHTML=`<div class="modal-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><h2 class="h2">${escapeHtml(title)}</h2><div class="muted leading-7 mt-3">${body}</div><div class="flex gap-3 justify-end mt-6 flex-wrap"><button class="btn btn-light" data-cancel>${escapeHtml(cancel)}</button><button class="btn ${danger?'btn-red':'btn-primary'}" data-confirm>${escapeHtml(action)}</button></div></div>`;
  document.body.append(root);const finish=v=>{root.remove();resolve(v)};
  root.querySelector('[data-cancel]').onclick=()=>finish(false);root.querySelector('[data-confirm]').onclick=()=>finish(true);
 });
}
export function chartBars(data){
 if(!data.length)return '<p class="muted">No results yet.</p>';
 return `<div class="chart-area">${data.map((d,i)=>`<div class="chart-entry" title="${escapeHtml(d.title||'')}: ${d.value}/75"><span class="chart-bar" style="height:${Math.max(3,Math.round(d.value/75*100))}%"></span><span class="chart-caption">${i+1}</span></div>`).join('')}</div>`;
}

/** A page-level loading skeleton with an accessible live message. */
export function pageLoading(page='dashboard',message='Loading…'){
 const root=document.getElementById('app');if(!root)return;
 const count=page==='index'?2:page==='exam'?1:3;
 root.innerHTML=`<section class="container page-loading" role="status" aria-live="polite"><div class="page-loading-top"><span class="page-loader-spinner" aria-hidden="true"></span><div><strong>${escapeHtml(message)}</strong><p class="small muted">Preparing your ddelf workspace</p></div></div><div class="skeleton skeleton-title" aria-hidden="true"></div><div class="skeleton skeleton-subtitle" aria-hidden="true"></div><div class="page-loading-grid" aria-hidden="true">${Array.from({length:count},()=>'<div class="skeleton skeleton-card"></div>').join('')}</div></section>`;
}
/** Disables a button while an async operation is running; returns a restore callback. */
export function setButtonBusy(button,on=true,label='Loading…'){
 if(!button)return ()=>{};
 if(!on)return ()=>{};
 const original=button.innerHTML,wasDisabled=button.disabled;
 button.disabled=true;button.setAttribute('aria-busy','true');button.classList.add('is-busy');
 button.innerHTML=`<span class="button-spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span>`;
 return ()=>{button.innerHTML=original;button.disabled=wasDisabled;button.removeAttribute('aria-busy');button.classList.remove('is-busy')};
}
/** Shows a blocking transition for operations which can navigate away, e.g. exam creation or submission. */
export function showTransition(message='Loading…'){
 let overlay=document.getElementById('delf-transition');
 if(overlay)overlay.remove();
 overlay=document.createElement('div');overlay.id='delf-transition';overlay.className='delf-transition';overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');
 overlay.innerHTML=`<div class="delf-transition-card"><span class="page-loader-spinner" aria-hidden="true"></span><strong>${escapeHtml(message)}</strong><span class="small muted">Please do not close this page.</span></div>`;
 document.body.append(overlay);return ()=>overlay.remove();
}
