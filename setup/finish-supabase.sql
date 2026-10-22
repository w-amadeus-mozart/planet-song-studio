-- Planet Song: the last two database functions (join with a team code, and "new code").
-- Supabase > SQL Editor > New query > paste all of this > Run.
create or replace function public.pss_join_team(p_code text, p_members text[] default '{}') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  t public.pss_teams;
begin
  if uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  if (select count(*) from public.pss_join_tries where user_id = uid and at > now() - interval '15 minutes') >= 8 then
    return jsonb_build_object('error', 'too_many_tries');
  end if;
  select * into t from public.pss_teams where join_code = code and joining_open;
  if not found then
    insert into public.pss_join_tries (user_id) values (uid);
    return jsonb_build_object('error', 'wrong_code');
  end if;
  delete from public.pss_join_tries where user_id = uid or at < now() - interval '1 day';
  insert into public.pss_members (user_id, team_id) values (uid, t.id)
    on conflict (user_id) do update set team_id = excluded.team_id, joined_at = now();
  if cardinality(public.pss_clean_names(p_members)) > 0 then
    update public.pss_teams set members = public.pss_clean_names(p_members) where id = t.id returning * into t;
  end if;
  return jsonb_build_object('team', public.pss_team_json(t));
end $$;

create or replace function public.pss_new_team_code(p_team uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare code text;
begin
  if not public.pss_is_teacher() then raise exception 'Only teachers can do this.' using errcode = '42501'; end if;
  update public.pss_teams set join_code = public.pss_new_code() where id = p_team returning join_code into code;
  delete from public.pss_members where team_id = p_team;
  return code;
end $$;

revoke execute on function public.pss_join_team(text, text[]), public.pss_new_team_code(uuid) from public, anon;
grant execute on function public.pss_join_team(text, text[]), public.pss_new_team_code(uuid) to authenticated;
select 'Done' as result;
