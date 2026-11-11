-- delfA2 - one-time migration for a fresh, dedicated Supabase project.
-- Never run this over an existing app's schema without reviewing conflicts.
create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.exams (
 id uuid primary key default gen_random_uuid(), code text not null unique, title text not null,
 source_name text not null, published boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.sections (
 id uuid primary key default gen_random_uuid(), exam_id uuid not null references public.exams(id) on delete cascade,
 kind text not null check(kind in ('listening','reading','writing')),
 position int not null check(position between 1 and 3), duration_seconds int not null check(duration_seconds>0),
 max_score numeric(5,2) not null check(max_score=25), instructions text not null,
 unique(exam_id,kind),unique(exam_id,position)
);
create table if not exists public.exercises (
 id uuid primary key default gen_random_uuid(),section_id uuid not null references public.sections(id) on delete cascade,
 position int not null check(position>0),title text not null,instructions text not null default '',
 context text not null default '',image_path text, points numeric(5,2) not null check(points>0),unique(section_id,position)
);
create table if not exists public.questions (
 id uuid primary key default gen_random_uuid(),exercise_id uuid not null references public.exercises(id) on delete cascade,
 position int not null check(position>0),prompt text not null,
 type text not null check(type in ('single','short','choice_justification','writing')),
 points numeric(5,2) not null check(points>0),image_path text,unique(exercise_id,position)
);
create table if not exists public.question_options (
 id uuid primary key default gen_random_uuid(),question_id uuid not null references public.questions(id) on delete cascade,
 position int not null check(position>0),value text not null,label text not null,
 unique(question_id,position),unique(question_id,value)
);
-- Answer keys reside ONLY in a schema not exposed through Supabase's Data API.
create table if not exists private.answer_keys (
 question_id uuid primary key references public.questions(id) on delete cascade,
 correct_value text not null,explanation text not null default '',accepted_examples jsonb not null default '[]'::jsonb,
 constraint examples_array check(jsonb_typeof(accepted_examples)='array')
);
create table if not exists public.audio_assets (
 id uuid primary key default gen_random_uuid(),exercise_id uuid not null unique references public.exercises(id) on delete cascade,
 storage_path text not null unique,local_path text not null,duration_seconds numeric(8,3) not null,
 max_plays int not null default 2 check(max_plays>0)
);
create table if not exists public.writing_rubric_criteria (
 id uuid primary key default gen_random_uuid(), question_id uuid not null references public.questions(id) on delete cascade,
 code text not null, title text not null,position int not null,
 max_points numeric(4,1) not null check(max_points>0),unique(question_id,code),unique(question_id,position)
);
create table if not exists public.teacher_access (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default true,created_at timestamptz not null default now()
);
create table if not exists public.attempts (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 exam_id uuid not null references public.exams(id),mode text not null check(mode in ('standard','premium')),
 status text not null default 'in_progress' check(status in ('in_progress','completed')),
 active_section int not null default 1 check(active_section between 1 and 3),
 section_started_at timestamptz not null default now(),
 created_at timestamptz not null default now(),finished_at timestamptz,
 constraint finished_state check((status='completed')=(finished_at is not null))
);
create table if not exists public.answers (
 id uuid primary key default gen_random_uuid(),attempt_id uuid not null references public.attempts(id) on delete cascade,
 question_id uuid not null references public.questions(id),response jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now(),unique(attempt_id,question_id),
 constraint answer_object check(jsonb_typeof(response)='object')
);
create table if not exists public.writing_submissions (
 id uuid primary key default gen_random_uuid(),attempt_id uuid not null references public.attempts(id) on delete cascade,
 question_id uuid not null references public.questions(id), body text not null default '',
 word_count int not null default 0, updated_at timestamptz not null default now(),
 unique(attempt_id,question_id)
);
create table if not exists public.writing_assessments (
 id uuid primary key default gen_random_uuid(),attempt_id uuid not null references public.attempts(id) on delete cascade,
 question_id uuid not null references public.questions(id),
 criterion_scores jsonb not null default '{}'::jsonb,score numeric(5,2) not null default 0 check(score between 0 and 25),
 feedback jsonb not null default '[]'::jsonb,corrected_text text not null default '',
 reviewed_by uuid references auth.users(id), is_estimate boolean not null default true,
 updated_at timestamptz not null default now(),unique(attempt_id,question_id)
);
create table if not exists public.answer_grades (
 id uuid primary key default gen_random_uuid(),attempt_id uuid not null references public.attempts(id) on delete cascade,
 question_id uuid not null references public.questions(id),awarded numeric(5,2) not null default 0,
 manual_review boolean not null default false,unique(attempt_id,question_id)
);
create table if not exists public.section_results (
 id uuid primary key default gen_random_uuid(),attempt_id uuid not null references public.attempts(id) on delete cascade,
 section_id uuid not null references public.sections(id),score numeric(5,2) not null default 0 check(score between 0 and 25),
 pending_review boolean not null default false,unique(attempt_id,section_id)
);
create table if not exists public.audio_play_events (
 id uuid primary key default gen_random_uuid(),attempt_id uuid not null references public.attempts(id) on delete cascade,
 audio_id uuid not null references public.audio_assets(id),started_at timestamptz not null default now()
);
create index if not exists idx_questions_exercise on public.questions(exercise_id,position);
create index if not exists idx_exercises_section on public.exercises(section_id,position);
create index if not exists idx_attempts_owner on public.attempts(user_id,created_at desc);
create index if not exists idx_answers_attempt on public.answers(attempt_id);
create index if not exists idx_writing_attempt on public.writing_submissions(attempt_id);
create index if not exists idx_audio_attempt on public.audio_play_events(attempt_id,audio_id);

-- Harden ownership: private helpers are callable only by specifically granted roles.
create or replace function private.is_teacher() returns boolean
 language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.teacher_access where user_id=(select auth.uid()) and enabled=true);
$$;
create or replace function private.can_edit_answer(p_attempt uuid,p_question uuid) returns boolean
 language sql stable security definer set search_path = '' as $$
 select exists(
  select 1 from public.attempts a
  join public.sections s on s.exam_id=a.exam_id
  join public.exercises e on e.section_id=s.id
  join public.questions q on q.exercise_id=e.id
  where a.id=p_attempt and q.id=p_question and a.user_id=(select auth.uid())
  and a.status='in_progress'
  and (a.mode='standard' or (
       s.position=a.active_section
       and now() < a.section_started_at + (s.duration_seconds * interval '1 second')
  ))
 );
$$;
-- Enforce write protection against direct REST calls as well as RPC calls.
create or replace function private.is_owned_attempt(p_attempt uuid) returns boolean
 language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.attempts where id=p_attempt and user_id=(select auth.uid()));
$$;

-- Enable RLS on every exposed table and the protected key table.
do $$ declare t text; begin
 foreach t in array array['exams','sections','exercises','questions','question_options','audio_assets','writing_rubric_criteria',
 'teacher_access','attempts','answers','writing_submissions','writing_assessments','answer_grades','section_results','audio_play_events'] loop
  execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
alter table private.answer_keys enable row level security;
revoke all on private.answer_keys from public,anon,authenticated;
revoke all on public.teacher_access from anon,authenticated;
revoke all on public.answer_grades from anon;
revoke all on public.section_results from anon;

create policy "public read published exams" on public.exams for select to anon,authenticated using(published);
create policy "read published sections" on public.sections for select to anon,authenticated
 using(exists(select 1 from public.exams x where x.id=exam_id and x.published));
create policy "read published exercises" on public.exercises for select to anon,authenticated
 using(exists(select 1 from public.sections s join public.exams x on x.id=s.exam_id where s.id=section_id and x.published));
create policy "read published questions" on public.questions for select to anon,authenticated
 using(exists(select 1 from public.exercises e join public.sections s on s.id=e.section_id
 join public.exams x on x.id=s.exam_id where e.id=exercise_id and x.published));
create policy "read published options" on public.question_options for select to anon,authenticated
 using(exists(select 1 from public.questions q join public.exercises e on e.id=q.exercise_id join public.sections s on s.id=e.section_id
 join public.exams x on x.id=s.exam_id where q.id=question_id and x.published));
create policy "read published audio metadata" on public.audio_assets for select to anon,authenticated
 using(exists(select 1 from public.exercises e join public.sections s on s.id=e.section_id join public.exams x on x.id=s.exam_id
 where e.id=exercise_id and x.published));
create policy "read writing criteria" on public.writing_rubric_criteria for select to anon,authenticated
 using(exists(select 1 from public.questions q join public.exercises e on e.id=q.exercise_id join public.sections s on s.id=e.section_id
 join public.exams x on x.id=s.exam_id where q.id=question_id and x.published));
create policy "teacher sees own membership" on public.teacher_access for select to authenticated using(user_id=(select auth.uid()));
create policy "learner or teacher read attempts" on public.attempts for select to authenticated
 using(user_id=(select auth.uid()) or (select private.is_teacher()));
create policy "learner start attempts" on public.attempts for insert to authenticated
 with check(user_id=(select auth.uid()) and status='in_progress' and active_section=1
 and exists(select 1 from public.exams e where e.id=exam_id and e.published));
create policy "learner or teacher read responses" on public.answers for select to authenticated
 using((select private.is_owned_attempt(attempt_id)) or (select private.is_teacher()));
create policy "learner save responses" on public.answers for insert to authenticated
 with check(private.can_edit_answer(attempt_id,question_id));
create policy "learner edit responses" on public.answers for update to authenticated
 using(private.can_edit_answer(attempt_id,question_id)) with check(private.can_edit_answer(attempt_id,question_id));
create policy "read writing submissions" on public.writing_submissions for select to authenticated
 using((select private.is_owned_attempt(attempt_id)) or (select private.is_teacher()));
create policy "read own writing evaluations after completion" on public.writing_assessments for select to authenticated
 using((select private.is_teacher()) or exists(select 1 from public.attempts a where a.id=attempt_id
 and a.user_id=(select auth.uid()) and a.status='completed'));
create policy "read own answer grades after completion" on public.answer_grades for select to authenticated
 using((select private.is_teacher()) or exists(select 1 from public.attempts a where a.id=attempt_id
 and a.user_id=(select auth.uid()) and a.status='completed'));
create policy "read own section scores after completion" on public.section_results for select to authenticated
 using((select private.is_teacher()) or exists(select 1 from public.attempts a where a.id=attempt_id
 and a.user_id=(select auth.uid()) and a.status='completed'));
create policy "read own audio events" on public.audio_play_events for select to authenticated
 using((select private.is_owned_attempt(attempt_id)));
-- Explicitly remove any inherited default API grants; RLS and table grants are separate controls.
revoke all on public.exams,public.sections,public.exercises,public.questions,public.question_options,
 public.audio_assets,public.writing_rubric_criteria,public.teacher_access,public.attempts,
 public.answers,public.writing_submissions,public.writing_assessments,public.answer_grades,
 public.section_results,public.audio_play_events from public,anon,authenticated;
-- Basic grants for Data API exposure. No DML access to results, keys or teacher membership.
grant select on public.exams,public.sections,public.exercises,public.questions,public.question_options,
 public.audio_assets,public.writing_rubric_criteria to anon,authenticated;
grant select on public.teacher_access to authenticated;
grant select on public.attempts,public.answers,public.writing_submissions,
 public.writing_assessments,public.answer_grades,public.section_results,public.audio_play_events to authenticated;
grant insert(user_id,exam_id,mode) on public.attempts to authenticated;
grant insert(attempt_id,question_id,response),update(response,updated_at) on public.answers to authenticated;
-- Keep the key table private and only explicitly grant helper function calls.
revoke all on all functions in schema private from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_teacher() to authenticated;
grant execute on function private.can_edit_answer(uuid,uuid) to authenticated;
grant execute on function private.is_owned_attempt(uuid) to authenticated;

-- RPC 1: create a server-clocked attempt.
create or replace function public.begin_attempt(p_exam uuid,p_mode text) returns uuid
 language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_mode not in ('standard','premium') then raise exception 'Unknown mode'; end if;
 insert into public.attempts(user_id,exam_id,mode) values(auth.uid(),p_exam,p_mode) returning id into v_id;
 return v_id;
end $$;

-- RPC 2: autosave safely. RLS and time restrictions apply, including to direct writes.
create or replace function public.save_response(p_attempt uuid,p_question uuid,p_response jsonb) returns boolean
 language plpgsql security invoker set search_path='' as $$
declare v_type text;v_body text;
begin
 if not private.can_edit_answer(p_attempt,p_question) then raise exception 'This section is closed or does not belong to you';end if;
 if jsonb_typeof(p_response)<>'object' then raise exception 'Object response required';end if;
 select type into v_type from public.questions where id=p_question;
 if v_type='writing' and length(coalesce(p_response->>'text',''))>15000 then raise exception 'Writing exceeds storage limit';end if;
 insert into public.answers(attempt_id,question_id,response) values(p_attempt,p_question,p_response)
 on conflict(attempt_id,question_id) do update set response=excluded.response,updated_at=now();
 -- The secure completion function extracts the final writing answer; no client writes this table.
 return true;
end $$;

-- Normalize Unicode French strings for exact phrases/quotes. Does not imply free-form equivalence.
create or replace function private.norm(p_text text) returns text
 language sql immutable set search_path='' as $$
 select trim(regexp_replace(translate(lower(coalesce(p_text,'')),
 'àáâäçèéêëìíîïñòóôöùúûüÿœæ','aaaaceeeeiiiinoooouuuuyoa'),
 '[^a-z0-9]+',' ','g'));
$$;

create or replace function private.grade_one(p_question uuid,p_response jsonb)
 returns table(awarded numeric,manual_review boolean) language plpgsql security definer set search_path='' as $$
declare v_key private.answer_keys%rowtype;v_q public.questions%rowtype;v_ans text;v_quote text;v_example text;v_source text;
 v_exact boolean:=false;v_quote_ok boolean:=false;
begin
 select * into v_key from private.answer_keys where question_id=p_question;
 select * into v_q from public.questions where id=p_question;
 if v_q.type='writing' then return query select 0::numeric,false;return;end if;
 if v_key.question_id is null then raise exception 'Missing protected answer key for question %',p_question;end if;
 v_ans=case when v_q.type='short' then p_response->>'text' else p_response->>'value' end;
 v_quote=coalesce(p_response->>'justification','');
 select e.context into v_source from public.exercises e where e.id=v_q.exercise_id;
 v_exact=(private.norm(v_ans)=private.norm(v_key.correct_value));
 if v_q.type='short' then
  v_exact=v_exact or (length(private.norm(v_ans))>=8 and
   private.norm(v_ans) like '%'||private.norm(v_key.correct_value)||'%');
 end if;
 if v_q.type<>'choice_justification' then
  return query select (case when v_exact then v_q.points else 0 end)::numeric,
    (v_q.type='short' and not v_exact and length(trim(coalesce(v_ans,'')))>0)::boolean;
  return;
 end if;
 for v_example in select jsonb_array_elements_text(v_key.accepted_examples) loop
  if length(private.norm(v_quote))>=10 and
     private.norm(v_source) like '%'||private.norm(v_quote)||'%' and
     (private.norm(v_quote) like '%'||private.norm(v_example)||'%' or
      private.norm(v_example) like '%'||private.norm(v_quote)||'%') then
   v_quote_ok=true;exit;
  end if;
 end loop;
 return query select (case when v_exact then 0.5 else 0 end + case when v_quote_ok then 1 else 0 end)::numeric,
  (length(trim(v_quote))>0 and not v_quote_ok)::boolean;
end $$;

-- A conservative, transparent rubric estimate. Not an official DELF examiner judgment.
create or replace function private.estimate_writing(p_question uuid,p_body text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare v_n int;v_len_factor numeric;v_ex_pos int;v_code text;v_max numeric;v_score numeric;
 v_scores jsonb:='{}'::jsonb;v_messages jsonb:='[]'::jsonb;v_total numeric:=0;
 v_b text:=coalesce(p_body,'');v_norm text;v_corrected text;v_has_link boolean;v_has_task boolean;v_has_impressions boolean;v_changes int:=0;
begin
 v_n=case when length(trim(v_b))=0 then 0 else array_length(regexp_split_to_array(trim(v_b),'\s+'),1) end;
 v_norm=private.norm(v_b);v_len_factor=least(1,round(v_n/65.0,2));
 select e.position into v_ex_pos from public.questions q join public.exercises e on q.exercise_id=e.id where q.id=p_question;
 v_has_link=v_norm~'(mais|puis|ensuite|parce que|alors|apres|aussi|donc)';
 v_has_impressions=v_norm~'(beau|belle|joli|aime|adore|interessant|magnifique|super|content|heureux|heureuse|formidable)';
 v_has_task=case when v_ex_pos=1 then v_norm~'(paris|versailles|seine)' and v_norm~'(visite|alle|jour|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)'
 else v_norm~'(merci|remercie)' and v_norm~'(pas|impossible|desole|regret)' and v_norm~'(propose|pourrait|autre|venir|se voir|retrouver)' end;
 for v_code,v_max in select code,max_points from public.writing_rubric_criteria where question_id=p_question order by position loop
  v_score=case v_code
   when 'respect_consignes' then case when v_n between 60 and 80 and v_has_task then 1 when v_n>=40 and v_has_task then 0.5 else 0 end
   when 'raconter_decrire' then 4*v_len_factor*(case when v_norm~'(hier|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|visite|passe|fait|alle)' then 1 else .5 end)
   when 'impressions' then 2*v_len_factor*(case when v_has_impressions then 1 else .3 end)
   when 'sociolinguistique' then 1*v_len_factor*(case when v_norm~'(bonjour|salut|cher|chere)' and v_norm~'(amicalement|bientot|a tres vite|bisous|au revoir)' then 1 else .5 end)
   when 'interaction' then 4*v_len_factor*(case when v_has_task then 1 else .4 end)
   when 'lexique' then 2*v_len_factor*(case when v_n>=45 then .85 else .6 end)
   when 'grammaire' then 2.5*v_len_factor*(case when v_norm~'(j ai visiter|je suis aller|je vais visite|nous a ete)' then .45 else .72 end)
   when 'coherence' then 1.5*v_len_factor*(case when v_has_link then 1 else .45 end)
   else 0 end;
  v_score=least(v_max,greatest(0,round(v_score*2)/2));
  v_total=v_total+v_score;v_scores=v_scores||jsonb_build_object(v_code,v_score);
 end loop;
 if v_n<60 then v_messages=v_messages||jsonb_build_array('Texte trop court : '||v_n||' mots. La consigne demande 60 à 80 mots.');end if;
 if v_n>80 then v_messages=v_messages||jsonb_build_array('Texte trop long : '||v_n||' mots. Visez 60 à 80 mots.');end if;
 if not v_has_task then v_messages=v_messages||jsonb_build_array('Plusieurs éléments demandés par la consigne ne sont pas clairement repérés. Vérifiez chaque point.');end if;
 if not v_has_link then v_messages=v_messages||jsonb_build_array('Ajoutez des connecteurs simples : puis, ensuite, mais, parce que.');end if;
 if v_ex_pos=1 and not v_has_impressions then v_messages=v_messages||jsonb_build_array('Indiquez vos impressions personnelles sur la vie à Paris.');end if;
 v_corrected=regexp_replace(v_b,'\mj''ai visiter\M','j''ai visité','gi');
 v_corrected=regexp_replace(v_corrected,'\mj''ai manger\M','j''ai mangé','gi');
 if v_corrected<>v_b then v_messages=v_messages||jsonb_build_array('Quelques formes verbales fréquentes ont été corrigées automatiquement dans la version proposée.');
 else v_messages=v_messages||jsonb_build_array('Aucune correction grammaticale certaine détectée par les règles intégrées. Le texte proposé est identique ; une relecture humaine reste nécessaire.');end if;
 return jsonb_build_object('score',v_total,'criterion_scores',v_scores,'feedback',v_messages,'corrected_text',v_corrected,'word_count',v_n);
end $$;

create or replace function private.complete_step(p_attempt uuid,p_expected_section integer)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts%rowtype;v_section public.sections%rowtype;v_q record;v_resp jsonb;v_grade record;
 v_text text;v_assess jsonb;v_points numeric;v_pending boolean;v_sec_score numeric;
begin
 select * into a from public.attempts where id=p_attempt for update;
 if a.id is null or a.user_id<>auth.uid() then raise exception 'Attempt not found or not owned';end if;
 if a.status='completed' then return jsonb_build_object('completed',true,'active_section',3);end if;
 if p_expected_section<>a.active_section then
  return jsonb_build_object('completed',false,'active_section',a.active_section);
 end if;
 if a.active_section<3 then
  update public.attempts set active_section=a.active_section+1,
   section_started_at=(case when a.mode='premium' and now() >= a.section_started_at +
     (select s.duration_seconds from public.sections s where s.exam_id=a.exam_id and s.position=a.active_section) * interval '1 second'
   then a.section_started_at + (select s.duration_seconds from public.sections s where s.exam_id=a.exam_id and s.position=a.active_section) * interval '1 second'
   else now() end) where id=a.id;
  return jsonb_build_object('completed',false,'active_section',a.active_section+1);
 end if;
 -- Close writing, mark objectively from protected answer keys and estimate writing.
 update public.attempts set status='completed',finished_at=now() where id=a.id;
 for v_section in select * from public.sections where exam_id=a.exam_id order by position loop
  v_sec_score=0;v_pending=false;
  for v_q in select q.* from public.questions q join public.exercises e on e.id=q.exercise_id
   where e.section_id=v_section.id order by e.position,q.position loop
   select response into v_resp from public.answers where attempt_id=a.id and question_id=v_q.id;
   if v_q.type='writing' then
    v_text=coalesce(v_resp->>'text','');
    insert into public.writing_submissions(attempt_id,question_id,body,word_count)
      values(a.id,v_q.id,v_text,case when trim(v_text)='' then 0 else array_length(regexp_split_to_array(trim(v_text),'\s+'),1) end)
      on conflict(attempt_id,question_id) do update set body=excluded.body,word_count=excluded.word_count,updated_at=now();
    v_assess=private.estimate_writing(v_q.id,v_text);
    insert into public.writing_assessments(attempt_id,question_id,criterion_scores,score,feedback,corrected_text)
     values(a.id,v_q.id,v_assess->'criterion_scores',(v_assess->>'score')::numeric,v_assess->'feedback',v_assess->>'corrected_text')
     on conflict(attempt_id,question_id) do update set criterion_scores=excluded.criterion_scores,score=excluded.score,
     feedback=excluded.feedback,corrected_text=excluded.corrected_text,updated_at=now();
    v_sec_score=v_sec_score+(v_assess->>'score')::numeric;
    v_pending=true; -- Writing scores are estimates pending optional teacher review.
   else
    select awarded,manual_review into v_grade from private.grade_one(v_q.id,coalesce(v_resp,'{}'::jsonb));
    insert into public.answer_grades(attempt_id,question_id,awarded,manual_review)
     values(a.id,v_q.id,v_grade.awarded,v_grade.manual_review)
     on conflict(attempt_id,question_id) do update set awarded=excluded.awarded,manual_review=excluded.manual_review;
    v_sec_score=v_sec_score+v_grade.awarded;v_pending=v_pending or v_grade.manual_review;
   end if;
  end loop;
  insert into public.section_results(attempt_id,section_id,score,pending_review)
    values(a.id,v_section.id,least(25,v_sec_score),v_pending)
    on conflict(attempt_id,section_id) do update set score=excluded.score,pending_review=excluded.pending_review;
 end loop;
 return jsonb_build_object('completed',true,'active_section',3);
end $$;
create or replace function public.complete_step(p_attempt uuid,p_expected_section integer) returns jsonb
 language sql security invoker set search_path='' as $$select private.complete_step(p_attempt,p_expected_section);$$;

create or replace function private.review_attempt(p_attempt uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare a public.attempts%rowtype;v_items jsonb;v_sections jsonb;v_writing jsonb;
begin
 select * into a from public.attempts where id=p_attempt;
 if a.id is null or (a.user_id<>auth.uid() and not private.is_teacher()) then raise exception 'Not authorized';end if;
 if a.status<>'completed' then raise exception 'Results unlock only after the completed exam';end if;
 select coalesce(jsonb_agg(jsonb_build_object('question_id',g.question_id,'awarded',g.awarded,
  'manual_review',g.manual_review,'correct_value',k.correct_value,'explanation',k.explanation,
  'accepted_examples',k.accepted_examples) order by e.position,q.position),'[]'::jsonb) into v_items
 from public.answer_grades g join public.questions q on q.id=g.question_id join public.exercises e on e.id=q.exercise_id
 join private.answer_keys k on k.question_id=q.id where g.attempt_id=p_attempt;
 select coalesce(jsonb_agg(jsonb_build_object('section_id',section_id,'score',score,'pending_review',pending_review)
 order by s.position),'[]'::jsonb) into v_sections from public.section_results r
 join public.sections s on s.id=r.section_id where r.attempt_id=p_attempt;
 select coalesce(jsonb_agg(jsonb_build_object('question_id',question_id,'score',score,'criterion_scores',criterion_scores,
  'feedback',feedback,'corrected_text',corrected_text,'is_estimate',is_estimate,'reviewed_by',reviewed_by)),'[]'::jsonb)
 into v_writing from public.writing_assessments where attempt_id=p_attempt;
 return jsonb_build_object('attempt_id',p_attempt,'sections',v_sections,'grades',v_items,'writing',v_writing);
end $$;
create or replace function public.get_review(p_attempt uuid) returns jsonb
 language sql security invoker set search_path='' as $$select private.review_attempt(p_attempt);$$;

create or replace function private.register_audio_play(p_attempt uuid,p_audio uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts%rowtype; v_audio public.audio_assets%rowtype;v_count int;v_pos int;v_duration int;
begin
 select * into a from public.attempts where id=p_attempt for update;
 if a.id is null or a.user_id<>auth.uid() or a.status<>'in_progress' then raise exception 'Active attempt required';end if;
 select * into v_audio from public.audio_assets where id=p_audio;
 select s.position,s.duration_seconds into v_pos,v_duration from public.exercises e join public.sections s on s.id=e.section_id where e.id=v_audio.exercise_id and s.exam_id=a.exam_id;
 if v_pos is distinct from 1 then raise exception 'Not a listening recording';end if;
 if a.mode='premium' and (a.active_section<>1 or now()>=a.section_started_at+v_duration*interval '1 second') then raise exception 'Listening section closed';end if;
 select count(*) into v_count from public.audio_play_events where attempt_id=p_attempt and audio_id=p_audio;
 if a.mode='premium' and v_count>=v_audio.max_plays then raise exception 'Playback limit reached';end if;
 insert into public.audio_play_events(attempt_id,audio_id) values(p_attempt,p_audio);
 return jsonb_build_object('plays',v_count+1,'remaining',case when a.mode='standard' then null else greatest(0,v_audio.max_plays-v_count-1) end);
end $$;
create or replace function public.register_audio_play(p_attempt uuid,p_audio uuid) returns jsonb
 language sql security invoker set search_path='' as $$select private.register_audio_play(p_attempt,p_audio);$$;

create or replace function private.teacher_review_writing(p_attempt uuid,p_question uuid,p_scores jsonb,p_feedback jsonb,p_corrected text)
 returns numeric language plpgsql security definer set search_path='' as $$
declare c record;v_total numeric:=0;v_score numeric;v_section uuid;
begin
 if not private.is_teacher() then raise exception 'Teacher access required';end if;
 if not exists(select 1 from public.attempts where id=p_attempt and status='completed') then raise exception 'Attempt not completed';end if;
 if not exists(select 1 from public.writing_submissions where attempt_id=p_attempt and question_id=p_question) then raise exception 'Writing submission missing';end if;
 for c in select code,max_points from public.writing_rubric_criteria where question_id=p_question loop
  v_score=coalesce((p_scores->>c.code)::numeric,0);
  if v_score<0 or v_score>c.max_points or v_score*2<>trunc(v_score*2) then raise exception 'Criterion % score out of range or not half-point increment',c.code;end if;
  v_total=v_total+v_score;
 end loop;
 if jsonb_typeof(p_feedback)<>'array' then raise exception 'Feedback must be an array';end if;
 update public.writing_assessments set criterion_scores=p_scores,score=v_total,feedback=p_feedback,
 corrected_text=p_corrected,reviewed_by=auth.uid(),is_estimate=false,updated_at=now()
 where attempt_id=p_attempt and question_id=p_question;
 select e.section_id into v_section from public.questions q join public.exercises e on e.id=q.exercise_id where q.id=p_question;
 update public.section_results set
  score=(select coalesce(sum(wa.score),0) from public.writing_assessments wa
   join public.questions q on q.id=wa.question_id join public.exercises e on e.id=q.exercise_id
   where wa.attempt_id=p_attempt and e.section_id=v_section),
  pending_review=exists(select 1 from public.writing_assessments wa
   join public.questions q on q.id=wa.question_id join public.exercises e on e.id=q.exercise_id
   where wa.attempt_id=p_attempt and e.section_id=v_section and wa.is_estimate)
 where attempt_id=p_attempt and section_id=v_section;
 return v_total;
end $$;
create or replace function public.teacher_review_writing(p_attempt uuid,p_question uuid,p_scores jsonb,p_feedback jsonb,p_corrected text)
 returns numeric language sql security invoker set search_path='' as $$select private.teacher_review_writing(p_attempt,p_question,p_scores,p_feedback,p_corrected);$$;

create or replace function private.teacher_review_answer(p_attempt uuid,p_question uuid,p_awarded numeric)
 returns numeric language plpgsql security definer set search_path='' as $$
declare v_max numeric;v_sec uuid;v_total numeric;v_pending boolean;
begin
 if not private.is_teacher() then raise exception 'Teacher access required';end if;
 if not exists(select 1 from public.attempts where id=p_attempt and status='completed') then raise exception 'Completed attempt required';end if;
 select q.points,e.section_id into v_max,v_sec from public.questions q join public.exercises e on e.id=q.exercise_id
 where q.id=p_question and q.type<>'writing';
 if v_max is null or p_awarded<0 or p_awarded>v_max or p_awarded*2<>trunc(p_awarded*2) then
   raise exception 'Invalid grade for question';end if;
 update public.answer_grades set awarded=p_awarded,manual_review=false where attempt_id=p_attempt and question_id=p_question;
 if not found then raise exception 'Answer grade not found';end if;
 select coalesce(sum(g.awarded),0),bool_or(g.manual_review) into v_total,v_pending from public.answer_grades g
 join public.questions q on q.id=g.question_id join public.exercises e on e.id=q.exercise_id
 where g.attempt_id=p_attempt and e.section_id=v_sec;
 update public.section_results set score=v_total,pending_review=coalesce(v_pending,false)
 where attempt_id=p_attempt and section_id=v_sec;
 return p_awarded;
end $$;
create or replace function public.teacher_review_answer(p_attempt uuid,p_question uuid,p_awarded numeric)
 returns numeric language sql security invoker set search_path='' as $$
 select private.teacher_review_answer(p_attempt,p_question,p_awarded);
$$;

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_teacher() to authenticated;
grant execute on function private.can_edit_answer(uuid,uuid) to authenticated;
grant execute on function private.is_owned_attempt(uuid) to authenticated;
grant execute on function private.complete_step(uuid,integer) to authenticated;
grant execute on function private.review_attempt(uuid) to authenticated;
grant execute on function private.register_audio_play(uuid,uuid) to authenticated;
grant execute on function private.teacher_review_writing(uuid,uuid,jsonb,jsonb,text) to authenticated;
grant execute on function private.teacher_review_answer(uuid,uuid,numeric) to authenticated;
revoke all on function public.begin_attempt(uuid,text),public.save_response(uuid,uuid,jsonb),
 public.complete_step(uuid,integer),public.get_review(uuid),public.register_audio_play(uuid,uuid),
 public.teacher_review_writing(uuid,uuid,jsonb,jsonb,text),public.teacher_review_answer(uuid,uuid,numeric) from public,anon;
grant execute on function public.begin_attempt(uuid,text),public.save_response(uuid,uuid,jsonb),
 public.complete_step(uuid,integer),public.get_review(uuid),public.register_audio_play(uuid,uuid),
 public.teacher_review_writing(uuid,uuid,jsonb,jsonb,text),public.teacher_review_answer(uuid,uuid,numeric) to authenticated;

-- Authenticated learners can access published audio files but cannot upload/replace them.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('delf-audio','delf-audio',false,20971520,array['audio/mpeg'])
 on conflict(id) do nothing;
create policy "learners stream published exam audio" on storage.objects for select to authenticated
 using(bucket_id='delf-audio' and exists(
 select 1 from public.audio_assets a join public.exercises e on e.id=a.exercise_id
 join public.sections s on s.id=e.section_id join public.exams x on x.id=s.exam_id
 where a.storage_path=storage.objects.name and x.published
 ));
