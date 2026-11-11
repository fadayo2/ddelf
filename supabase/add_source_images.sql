-- Run AFTER deploying the new image files to the website.
-- This only changes the candidate-paper asset paths, never corrections or scores.
update public.exercises set image_path='assets/img/reading-email.png' where id='b209b726-c929-5cbb-b8ad-95abf7c5c5b2';
update public.exercises set image_path='assets/img/writing-letter.png' where id='bbb31069-fdf2-5641-851c-448a96be7613';
select s.kind,e.position,e.image_path from public.exercises e
join public.sections s on s.id=e.section_id
where e.id in ('b209b726-c929-5cbb-b8ad-95abf7c5c5b2','bbb31069-fdf2-5641-851c-448a96be7613');
