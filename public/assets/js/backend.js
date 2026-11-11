import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,AUDIO_BUCKET,configured} from './config.js';
import {getLS,setLS} from './utils.js';
let client=null,user=null;
const localKey='delfa2-local-v2';
const localState=()=>getLS(localKey,{attempts:[],answers:{},reviews:{},plays:{}});
const updateLocal=fn=>{let s=localState();fn(s);setLS(localKey,s)};
export const isLive=()=>Boolean(client);
export const currentUser=()=>user;
export const requiresAuth=()=>Boolean(client&&!user);
export async function initBackend(){
 if(configured){
  try{
   const lib=await import('https://esm.sh/@supabase/supabase-js@2.57.0');
   client=lib.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
   client.auth.onAuthStateChange((event,session)=>{user=session?.user||null;window.dispatchEvent(new CustomEvent('delf-auth-changed',{detail:user}));if(event==='PASSWORD_RECOVERY')window.dispatchEvent(new Event('delf-auth-recovery'));});
   const {data,error}=await client.auth.getUser();if(!error)user=data.user;
  }catch(error){console.error(error);throw Error('Unable to connect to Supabase: '+error.message)}
 }
 return {live:!!client,user};
}
const unwrap=({data,error})=>{if(error)throw Error(error.message);return data};
export async function signIn(email,password){if(!client)throw Error('Connect a Supabase project before signing in');const d=unwrap(await client.auth.signInWithPassword({email,password}));user=d.user;return d}
const authRedirect=flow=>new URL(`./index.html?auth=${flow}`,window.location.href).toString();
export async function signUp(email,password){if(!client)throw Error('Connect a Supabase project before creating an account');const d=unwrap(await client.auth.signUp({email,password,options:{emailRedirectTo:authRedirect('confirmed')}}));if(d.session){user=d.user;window.dispatchEvent(new CustomEvent('delf-auth-changed',{detail:user}))}return d;}
export async function resendConfirmation(email){if(!client)throw Error('Connection unavailable');return unwrap(await client.auth.resend({type:'signup',email,options:{emailRedirectTo:authRedirect('confirmed')}}));}
export async function sendPasswordReset(email){if(!client)throw Error('Connection unavailable');return unwrap(await client.auth.resetPasswordForEmail(email,{redirectTo:authRedirect('reset')}));}
export async function updatePassword(password){if(!client)throw Error('Connection unavailable');return unwrap(await client.auth.updateUser({password}));}
export async function signOut(){if(client){unwrap(await client.auth.signOut());user=null}}
const offlinePaper=async()=>{const res=await fetch('./assets/data/paper-1.json',{cache:'no-cache'});if(!res.ok)throw Error('Unable to load the exam paper');return await res.json()};
export async function getPapers(){
 if(!client)return (await offlinePaper()).exams;
 return unwrap(await client.from('exams').select('*').eq('published',true).order('created_at',{ascending:false}));
}
export async function getPaper(examId){
 if(!client){let d=await offlinePaper();if(!d.exams.some(x=>x.id===examId))throw Error('Exam paper not found');return d}
 const exams=unwrap(await client.from('exams').select('*').eq('id',examId));if(!exams.length)throw Error('Exam paper unavailable');
 const sections=unwrap(await client.from('sections').select('*').eq('exam_id',examId).order('position'));
 const exercises=unwrap(await client.from('exercises').select('*').in('section_id',sections.map(x=>x.id)).order('position'));
 const questions=unwrap(await client.from('questions').select('*').in('exercise_id',exercises.map(x=>x.id)).order('position'));
 const options=unwrap(await client.from('question_options').select('*').in('question_id',questions.map(x=>x.id)).order('position'));
 const audio_assets=unwrap(await client.from('audio_assets').select('*').in('exercise_id',exercises.map(x=>x.id)));
 const criteria=unwrap(await client.from('writing_rubric_criteria').select('*').in('question_id',questions.filter(q=>q.type==='writing').map(q=>q.id)).order('position'));
 return {exams,sections,exercises,questions:questions.map(q=>({...q,options:options.filter(o=>o.question_id===q.id)})),audio_assets,
 writing_rubric_criteria:criteria};
}
export async function getAttempts(){
 if(!client)return localState().attempts.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 if(!user)return [];
 return unwrap(await client.from('attempts').select('*').eq('user_id',user.id).order('created_at',{ascending:false}));
}
export async function getAttempt(id){
 if(!client)return localState().attempts.find(a=>a.id===id)||null;
 return unwrap(await client.from('attempts').select('*').eq('id',id).single());
}
export async function beginAttempt(examId,mode){
 if(client){const id=unwrap(await client.rpc('begin_attempt',{p_exam:examId,p_mode:mode}));return getAttempt(id)}
 const a={id:crypto.randomUUID(),exam_id:examId,mode,status:'in_progress',active_section:1,section_started_at:new Date().toISOString(),created_at:new Date().toISOString(),finished_at:null};
 updateLocal(s=>s.attempts.unshift(a));return a;
}
export async function getAnswers(attemptId){
 if(!client)return (localState().answers[attemptId]||{});
 const rows=unwrap(await client.from('answers').select('question_id,response,updated_at').eq('attempt_id',attemptId));
 return Object.fromEntries(rows.map(x=>[x.question_id,x.response]));
}
export async function saveAnswer(attemptId,qid,response){
 if(client)return unwrap(await client.rpc('save_response',{p_attempt:attemptId,p_question:qid,p_response:response}));
 updateLocal(s=>{s.answers[attemptId]??={};s.answers[attemptId][qid]=response});return true;
}
export async function advanceAttempt(attemptId){
 if(client){const before=await getAttempt(attemptId);const r=unwrap(await client.rpc('complete_step',{p_attempt:attemptId,p_expected_section:before.active_section}));return {...(await getAttempt(attemptId)),...r}}
 let a=null;updateLocal(s=>{a=s.attempts.find(x=>x.id===attemptId);if(a.status==='completed')return;
 if(a.active_section<3){a.active_section++;a.section_started_at=new Date().toISOString()}else{a.status='completed';a.finished_at=new Date().toISOString()}
 });return {...a};
}
export async function getReview(attemptId){
 if(client)return unwrap(await client.rpc('get_review',{p_attempt:attemptId}));
 return null; // Deliberately: objective keys are never distributed with the browser bundle.
}
export async function registerPlay(attemptId,assetId,mode,maxPlays){
 if(client)return unwrap(await client.rpc('register_audio_play',{p_attempt:attemptId,p_audio:assetId}));
 let value;updateLocal(s=>{let k=attemptId+':'+assetId;let n=s.plays[k]||0;if(mode==='premium'&&n>=maxPlays)throw Error('Both listening attempts have been used');
 s.plays[k]=n+1;value={plays:n+1,remaining:mode==='premium'?maxPlays-n-1:null}});return value;
}
export async function getPlayCounts(attemptId){
 if(client){const d=unwrap(await client.from('audio_play_events').select('audio_id').eq('attempt_id',attemptId));let c={};d.forEach(x=>c[x.audio_id]=(c[x.audio_id]||0)+1);return c}
 let s=localState();let c={};for(let [k,v] of Object.entries(s.plays))if(k.startsWith(attemptId+':'))c[k.slice(attemptId.length+1)]=v;return c;
}
export async function audioUrl(asset){
 const localFile='./'+asset.local_path;
 if(!client)return localFile;
 const {data,error}=await client.storage.from(AUDIO_BUCKET).createSignedUrl(asset.storage_path,3600);
 // Keep the three supplied ORIGINAL recordings playable while their authenticated
 // Storage upload is pending. These static files are part of the user's paper, not
 // replacements or generated audio. Do not fall back to a different recording.
 if(error || !data?.signedUrl){
  console.warn('Supabase Storage audio not yet uploaded; using supplied bundled audio:',asset.storage_path);
  return localFile;
 }
 return data.signedUrl;
}
export async function getTeacherStatus(){
 if(!client||!user)return false;
 let {data,error}=await client.from('teacher_access').select('enabled').eq('user_id',user.id).maybeSingle();
 if(error)return false;return !!data?.enabled;
}
export async function getTeacherAttempts(){
 if(!await getTeacherStatus())throw Error('Teacher access required');
 return unwrap(await client.from('attempts').select('*').eq('status','completed').order('finished_at',{ascending:false}).limit(50));
}
export async function reviewObjective(attemptId,questionId,score){
 if(!await getTeacherStatus())throw Error('Teacher access required');
 return unwrap(await client.rpc('teacher_review_answer',{p_attempt:attemptId,p_question:questionId,p_awarded:score}));
}
export async function reviewWriting(attemptId,questionId,scores,feedback,corrected){
 if(!await getTeacherStatus())throw Error('Teacher access required');
 return unwrap(await client.rpc('teacher_review_writing',{p_attempt:attemptId,p_question:questionId,p_scores:scores,p_feedback:feedback,p_corrected:corrected}));
}
