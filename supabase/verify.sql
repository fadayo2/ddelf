-- Run after schema.sql and seed.sql in the Supabase SQL Editor (trusted admin session).
select 'exam_count' as check_name,count(*)::numeric as value from public.exams where code='sample-1'
union all select 'section_count',count(*) from public.sections s join public.exams x on x.id=s.exam_id where x.code='sample-1'
union all select 'exercise_count',count(*) from public.exercises e join public.sections s on s.id=e.section_id join public.exams x on x.id=s.exam_id where x.code='sample-1'
union all select 'question_count',count(*) from public.questions q join public.exercises e on e.id=q.exercise_id join public.sections s on s.id=e.section_id join public.exams x on x.id=s.exam_id where x.code='sample-1'
union all select 'protected_keys',count(*) from private.answer_keys
union all select 'audio_assets',count(*) from public.audio_assets
union all select 'total_points',sum(q.points) from public.questions q join public.exercises e on e.id=q.exercise_id join public.sections s on s.id=e.section_id join public.exams x on x.id=s.exam_id where x.code='sample-1';
-- Expected: 1 exam, 3 sections, 9 exercises, 37 questions, 35 keys, 3 audio, 75 points.
select s.kind,sum(q.points) as exact_question_points,s.max_score
from public.sections s join public.exercises e on e.section_id=s.id join public.questions q on q.exercise_id=e.id
join public.exams x on x.id=s.exam_id where x.code='sample-1'
group by s.id,s.kind,s.max_score order by s.position;
-- Expected three rows, each 25/25.
select a.storage_path,exists(select 1 from storage.objects o where o.bucket_id='delf-audio' and o.name=a.storage_path) as uploaded
from public.audio_assets a order by a.storage_path;
-- Expected uploaded=true for all three files.
select tablename,rowsecurity from pg_tables where schemaname='public' and tablename in
 ('exams','sections','exercises','questions','question_options','audio_assets','attempts',
 'answers','writing_submissions','writing_assessments','answer_grades','section_results','teacher_access');
-- Expected rowsecurity=true for every returned table.
