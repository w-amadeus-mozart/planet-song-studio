-- Make a teacher. First add the teacher in Supabase: Authentication > Users > Add user > Create new user
-- (email + password, tick "Auto Confirm User"). Then put that email below, and run this in the SQL Editor.
-- Only someone signed in to your Supabase dashboard can run this; the apps cannot make teachers.

insert into public.pss_teachers (user_id)
select id from auth.users where lower(email) = lower('teacher@example.com')
on conflict (user_id) do nothing;

-- Should list the teacher. If it is empty, check the email matches the user you added.
select u.email, t.created_at as teacher_since
from public.pss_teachers t join auth.users u on u.id = t.user_id;

-- To remove a teacher later:
-- delete from public.pss_teachers where user_id = (select id from auth.users where lower(email) = lower('teacher@example.com'));
