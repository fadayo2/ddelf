import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const web=path.join(root,'public');
const paper=JSON.parse(fs.readFileSync(path.join(web,'assets/data/paper-1.json')));
const schema=fs.readFileSync(path.join(root,'supabase/schema.sql'),'utf8');
const seed=fs.readFileSync(path.join(root,'supabase/seed.sql'),'utf8');
const sectionIds=Object.fromEntries(paper.sections.map(s=>[s.kind,s.id]));
const questionSections=paper.questions.map(q=>{let e=paper.exercises.find(e=>e.id===q.exercise_id);return {...q,section_id:e.section_id}});
test('source mapping contains exactly three examinable sections in correct sequence',()=>{
 assert.deepEqual(paper.sections.map(s=>s.kind),['listening','reading','writing']);
 assert.deepEqual(paper.sections.map(s=>s.duration_seconds),[1500,1800,2700]);
 assert.deepEqual(paper.sections.map(s=>s.max_score),[25,25,25]);
 assert.equal(paper.exercises.length,9);assert.equal(paper.questions.length,37);
 assert.equal(paper.questions.filter(q=>q.type==='writing').length,2);
 assert.equal(paper.questions.filter(q=>q.type!=='writing').length,35);
 assert.equal(paper.sections.some(s=>s.kind==='speaking'),false);
});
test('question weights sum to correct rubric totals for all sections/exercises',()=>{
 for(const section of paper.sections){
  const n=questionSections.filter(q=>q.section_id===section.id).reduce((sum,q)=>sum+q.points,0);
  assert.equal(n,25,section.kind+' points');
 }
 for(const ex of paper.exercises){
  const total=paper.questions.filter(q=>q.exercise_id===ex.id).reduce((sum,q)=>sum+q.points,0);
  assert.equal(total,ex.points,ex.title);
 }
});
test('writing criteria are sourced from official 13+12 point rubric',()=>{
 for(const [index,max] of [[1,13],[2,12]]){
  let criteria=paper.writing_rubrics[String(index)];
  assert.equal(criteria.length,6);
  assert.equal(criteria.reduce((sum,c)=>sum+c[2],0),max);
 }
});
test('correct audio assets are present and source images retained',()=>{
 assert.equal(paper.audio_assets.length,3);
 for(let i=1;i<=3;i++){
  const asset=paper.audio_assets.find(a=>a.storage_path===`exercice-${i}.mp3`);
  assert.ok(asset);assert.ok(asset.max_plays===2);
  assert.ok(fs.statSync(path.join(web,asset.local_path)).size>200000);
 }
 for(const name of ['reading-signs.png','listening-pictures.png','writing-paris.png']){
  assert.ok(fs.statSync(path.join(web,'assets/img',name)).size>10000);
 }
});
test('public bundle contains NO protected answer key',()=>{
 const all=[];
 const recursive=folder=>{for(const item of fs.readdirSync(folder,{withFileTypes:true})){
  const full=path.join(folder,item.name);if(item.isDirectory())recursive(full);else all.push(full)
 }};recursive(web);
 for(let f of all){assert.ok(!f.endsWith('.sql'),'SQL source in public bundle: '+f);
  assert.ok(!f.endsWith('private-seed.json'));
 }
 assert.ok(schema.includes('private.answer_keys'));
 assert.ok(schema.includes('row level security'));
 assert.ok(schema.includes("status='completed'"));
 assert.ok(schema.includes('private.can_edit_answer'));
 assert.ok(!fs.readFileSync(path.join(web,'assets/js/config.js'),'utf8').includes('sb_secret_'));
 assert.equal((seed.match(/insert into private.answer_keys\(/g)||[]).length,35);
});
test('all options and source pointers resolve, IDs are unique',()=>{
 let ids=new Set();for(let category of ['exams','sections','exercises','questions','audio_assets'])for(let v of paper[category]){
  assert.ok(!ids.has(v.id),'duplicate ID '+v.id);ids.add(v.id);
 }
 for(let q of paper.questions){if(q.type==='single'||q.type==='choice_justification')assert.ok(q.options.length>=2,q.prompt)}
 for(let v of [...paper.questions,...paper.exercises])if(v.image_path)assert.ok(fs.existsSync(path.join(web,v.image_path)),v.image_path);
});

test('five original paper visual assets are mapped to their exercises and questions',()=>{
 const names=['listening-pictures.png','reading-signs.png','reading-email.png','writing-paris.png','writing-letter.png'];
 for(const name of names){
  const file=path.join(web,'assets/img',name),png=fs.readFileSync(file);
  assert.equal(png.subarray(1,4).toString('ascii'),'PNG',name);
  assert.ok(png.readUInt32BE(16)>=900,name+' should be high resolution');
 }
 const mapped=[...paper.exercises,...paper.questions].map(q=>q.image_path).filter(Boolean);
 for(const name of names)assert.ok(mapped.some(p=>p.endsWith(name)),name+' not mapped');
 const js=fs.readFileSync(path.join(web,'assets/js/exam.js'),'utf8');
 assert.ok(js.includes('q.image_path?imageCard('),'question-level image must render');
 assert.ok(js.includes('ex.image_path?imageCard('),'exercise-level image must render');
 assert.ok(js.includes('toggleViewerFullscreen'),'browser fullscreen button is available');
 assert.ok(js.includes('data-zoom="fit"'),'image fit control available');
});

test('accent keyboard inserts at selection and dispatches input event used by autosave',async()=>{
 const vm=await import('node:vm');
 const js=fs.readFileSync(path.join(web,'assets/js/exam.js'),'utf8');
 const start=js.indexOf('function insertAccent(');
 const end=js.indexOf('\nfunction bindAccentKeys()',start);
 assert.ok(start!==-1&&end>start);
 let events=0,focused=false;
 const textarea={value:'Je vis a Paris',selectionStart:7,selectionEnd:8,
  focus(){focused=true},
  setRangeText(c,a,b){this.value=this.value.slice(0,a)+c+this.value.slice(b);this.selectionStart=this.selectionEnd=a+c.length},
  dispatchEvent(e){assert.equal(e.type,'input');events++;assert.equal(e.bubbles,true)}
 };
 const insert=vm.runInNewContext(js.slice(start,end)+'\ninsertAccent;', {Event:class{constructor(type,{bubbles}){this.type=type;this.bubbles=bubbles}}});
 insert(textarea,'à');
 assert.equal(textarea.value,'Je vis à Paris');
 insert(textarea,'é');
 assert.equal(textarea.value,'Je vis àé Paris');
 assert.equal(events,2);assert.equal(focused,true);
});
