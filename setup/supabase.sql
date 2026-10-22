-- Planet Song Studio database, with teacher-controlled access.
-- Run it in Supabase: SQL Editor > New query > paste all of this > Run. It is safe to run more than once.
--
-- Who can do what
--   Teachers sign in with email and password, and are listed in pss_teachers (see make-teacher.sql).
--     They create classes and teams, see everything, and are the only ones who can delete classes, teams or songs.
--   Learners have no accounts. The studio gives each iPad an anonymous sign-in, and the team's join code
--     (made by the teacher) puts that iPad in one team. From then on the iPad can only:
--       read its own team and its own class, and the songs of its own class;
--       post progress updates and songs for its own team (through pss_team_update and pss_add_song);
--       upload MP3s into its own team's folder, and play MP3s from its own class's folder.
--   Anyone else (the anon key on its own, or a signed-in account that is neither) can read and write nothing.
--   There are no USING (true) or WITH CHECK (true) policies, and nothing here needs the service-role key.
--
-- Upgrading from the first version (open tables pss_events / pss_teams / pss_songs and a public bucket):
--   the old tables are renamed pss_legacy_* and locked (no one but you in the dashboard can read them),
--   every class, team, update and song in them is copied into the new tables, the open policies are removed,
--   and the bucket is made private. MP3s already uploaded stay where they are; teachers can still play them.
--   Nothing is deleted. Everything runs in one transaction, so if any step fails nothing changes.

begin;

-- 1. Move the first version's tables out of the way --------------------------------------------------------
do $$
declare t text; c text;
begin
  foreach t in array array['pss_teams', 'pss_events', 'pss_songs'] loop
    c := case t when 'pss_teams' then 'join_code' else 'team_id' end;   -- a column only the new tables have
    if to_regclass('public.' || t) is not null and not exists (
      select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = c
    ) then
      if to_regclass('public.pss_legacy_' || substr(t, 5)) is not null then
        raise exception 'Both %, from the first version, and pss_legacy_% exist. Rename one of them and run this again.', t, substr(t, 5);
      end if;
      execute format('alter table public.%I rename to %I', t, 'pss_legacy_' || substr(t, 5));
    end if;
  end loop;
end $$;

-- Lock the old tables: drop their open policies, take away table rights, stop live updates from them.
do $$
declare t text; p record;
begin
  foreach t in array array['pss_legacy_teams', 'pss_legacy_events', 'pss_legacy_songs'] loop
    continue when to_regclass('public.' || t) is null;
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

-- 2. Tables -------------------------------------------------------------------------------------------------
create table if not exists public.pss_teachers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.pss_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 20),
  created_at timestamptz not null default now()
);

-- A six-character join code (no 0/O, 1/I/L), from the random part of a UUID.
create or replace function public.pss_new_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  a constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea; code text;
begin
  loop
    b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    code := '';
    for i in 0..5 loop code := code || substr(a, 1 + get_byte(b, i) % length(a), 1); end loop;
    exit when not exists (select 1 from public.pss_teams where join_code = code);
  end loop;
  return code;
end $$;

create table if not exists public.pss_teams (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.pss_classes (id) on delete cascade,
  planet text not null check (char_length(planet) between 1 and 20),
  name text not null check (char_length(name) between 1 and 40),
  join_code text not null unique default public.pss_new_code(),
  joining_open boolean not null default true,
  members text[] not null default '{}',
  info jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists pss_teams_one_name on public.pss_teams (class_id, planet, lower(name));

-- Which team each learner iPad (anonymous sign-in) belongs to. One team per iPad.
create table if not exists public.pss_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  team_id uuid not null references public.pss_teams (id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index if not exists pss_members_team on public.pss_members (team_id);

create table if not exists public.pss_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  class_id uuid not null references public.pss_classes (id) on delete cascade,
  team_id uuid not null references public.pss_teams (id) on delete cascade,
  user_id uuid,
  what text not null check (char_length(what) <= 120),
  info jsonb not null default '{}'
);
create index if not exists pss_events_class on public.pss_events (class_id, created_at desc);

create table if not exists public.pss_songs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  class_id uuid not null references public.pss_classes (id) on delete cascade,
  team_id uuid not null references public.pss_teams (id) on delete cascade,
  user_id uuid,
  title text check (char_length(title) <= 80),
  genre text check (char_length(genre) <= 30),
  lyrics text check (char_length(lyrics) <= 20000),
  info jsonb not null default '{}',
  file text not null unique
);
create index if not exists pss_songs_class on public.pss_songs (class_id, created_at desc);

-- Wrong join codes per iPad, to slow down guessing.
create table if not exists public.pss_join_tries (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists pss_join_tries_user on public.pss_join_tries (user_id, at);

-- Records that the first version's data has been copied, so running this file again does not copy it twice.
create table if not exists public.pss_meta (key text primary key, value text, at timestamptz not null default now());

-- 3. Who is asking --------------------------------------------------------------------------------------------
create or replace function public.pss_is_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and exists (select 1 from public.pss_teachers where user_id = auth.uid())
$$;

create or replace function public.pss_my_team() returns uuid
language sql stable security definer set search_path = '' as $$
  select team_id from public.pss_members where user_id = auth.uid()
$$;

create or replace function public.pss_my_class() returns uuid
language sql stable security definer set search_path = '' as $$
  select t.class_id from public.pss_members m join public.pss_teams t on t.id = m.team_id where m.user_id = auth.uid()
$$;

create or replace function public.pss_team_json(t public.pss_teams) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'class_id', t.class_id, 'cls', c.name, 'planet', t.planet, 'name', t.name, 'members', to_jsonb(t.members))
  from public.pss_classes c where c.id = t.class_id
$$;

create or replace function public.pss_clean_names(names text[]) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(left(btrim(n), 30)), '{}') from unnest(coalesce(names, '{}'::text[])) with ordinality as x(n, i)
  where btrim(n) <> '' and i <= 8
$$;

-- 4. What the studio and the teacher app call ------------------------------------------------------------------
-- Studio: the signed-in user's role and team. {"teacher": bool, "team": {...} or null}
create or replace function public.pss_whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'teacher', public.pss_is_teacher(),
    'team', (select public.pss_team_json(t) from public.pss_teams t where t.id = public.pss_my_team()))
$$;

-- Studio: join a team with its code. Returns {"team": {...}} or {"error": "wrong_code" | "too_many_tries" | "not_signed_in"}.
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

-- Studio: a progress update for the teacher's live board ("chose Rap"), plus the team's latest summary.
create or replace function public.pss_team_update(p_what text, p_info jsonb default '{}', p_members text[] default null) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare t public.pss_teams;
begin
  select * into t from public.pss_teams where id = public.pss_my_team();
  if not found then raise exception 'This iPad is not in a team.' using errcode = '42501'; end if;
  if char_length(coalesce(p_info, '{}')::text) > 4000 then raise exception 'Update too big.' using errcode = '22001'; end if;
  insert into public.pss_events (class_id, team_id, user_id, what, info)
    values (t.class_id, t.id, auth.uid(), left(coalesce(p_what, ''), 120), coalesce(p_info, '{}'));
  update public.pss_teams set info = coalesce(p_info, '{}') || jsonb_build_object('last', left(coalesce(p_what, ''), 120)),
    members = case when cardinality(public.pss_clean_names(p_members)) > 0 then public.pss_clean_names(p_members) else members end,
    updated_at = now()
  where id = t.id;
  return true;
end $$;

-- Studio: record a finished song after uploading its MP3 to <class id>/<team id>/... in the pss-songs bucket.
create or replace function public.pss_add_song(p_file text, p_title text, p_genre text, p_lyrics text, p_info jsonb default '{}') returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare t public.pss_teams; new_id bigint;
begin
  select * into t from public.pss_teams where id = public.pss_my_team();
  if not found then raise exception 'This iPad is not in a team.' using errcode = '42501'; end if;
  if p_file is null or p_file not like t.class_id || '/' || t.id || '/%.mp3' or p_file like '%..%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'pss-songs' and o.name = p_file and o.owner_id = auth.uid()::text) then
    raise exception 'Upload the MP3 to this team''s folder first.' using errcode = '42501';
  end if;
  if char_length(coalesce(p_info, '{}')::text) > 4000 then raise exception 'Song details too big.' using errcode = '22001'; end if;
  insert into public.pss_songs (class_id, team_id, user_id, title, genre, lyrics, info, file)
    values (t.class_id, t.id, auth.uid(), left(p_title, 80), left(p_genre, 30), left(p_lyrics, 20000), coalesce(p_info, '{}'), p_file)
    returning id into new_id;
  insert into public.pss_events (class_id, team_id, user_id, what, info)
    values (t.class_id, t.id, auth.uid(), 'sent their song', jsonb_build_object('genre', left(p_genre, 30)));
  return new_id;
end $$;

-- Teacher: give a team a new join code. iPads already in the team are taken out and need the new code.
create or replace function public.pss_new_team_code(p_team uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare code text;
begin
  if not public.pss_is_teacher() then raise exception 'Only teachers can do this.' using errcode = '42501'; end if;
  update public.pss_teams set join_code = public.pss_new_code() where id = p_team returning join_code into code;
  delete from public.pss_members where team_id = p_team;
  return code;
end $$;

-- Teacher: how many iPads are in each team.
create or replace function public.pss_team_devices() returns table (team_id uuid, devices bigint)
language sql stable security definer set search_path = '' as $$
  select m.team_id, count(*) from public.pss_members m where public.pss_is_teacher() group by m.team_id
$$;

-- Only these may be called from the apps, and only by signed-in users (learner iPads included).
revoke execute on function public.pss_new_code(), public.pss_is_teacher(), public.pss_my_team(), public.pss_my_class(),
  public.pss_team_json(public.pss_teams), public.pss_clean_names(text[]), public.pss_whoami(), public.pss_join_team(text, text[]),
  public.pss_team_update(text, jsonb, text[]), public.pss_add_song(text, text, text, text, jsonb), public.pss_new_team_code(uuid),
  public.pss_team_devices() from public, anon;
-- internal helpers: not callable from the apps at all
revoke execute on function public.pss_team_json(public.pss_teams), public.pss_clean_names(text[]) from authenticated;
grant execute on function public.pss_new_code(), public.pss_is_teacher(), public.pss_my_team(), public.pss_my_class(),
  public.pss_whoami(), public.pss_join_team(text, text[]), public.pss_team_update(text, jsonb, text[]),
  public.pss_add_song(text, text, text, text, jsonb), public.pss_new_team_code(uuid), public.pss_team_devices() to authenticated;

-- 5. Row level security ---------------------------------------------------------------------------------------
alter table public.pss_teachers enable row level security;
alter table public.pss_classes enable row level security;
alter table public.pss_teams enable row level security;
alter table public.pss_members enable row level security;
alter table public.pss_events enable row level security;
alter table public.pss_songs enable row level security;
alter table public.pss_join_tries enable row level security;
alter table public.pss_meta enable row level security;

revoke all on public.pss_teachers, public.pss_classes, public.pss_teams, public.pss_members, public.pss_events,
  public.pss_songs, public.pss_join_tries, public.pss_meta from anon, authenticated;
grant select on public.pss_teachers to authenticated;
grant select, insert, update, delete on public.pss_classes, public.pss_teams to authenticated;
grant select, delete on public.pss_members, public.pss_events to authenticated;
grant select, update, delete on public.pss_songs to authenticated;
-- pss_join_tries and pss_meta: no access from the apps at all.

drop policy if exists "teacher sees own row" on public.pss_teachers;
create policy "teacher sees own row" on public.pss_teachers for select to authenticated using (user_id = auth.uid());

drop policy if exists "teachers and own class read classes" on public.pss_classes;
create policy "teachers and own class read classes" on public.pss_classes for select to authenticated
  using (public.pss_is_teacher() or id = public.pss_my_class());
drop policy if exists "teachers add classes" on public.pss_classes;
create policy "teachers add classes" on public.pss_classes for insert to authenticated with check (public.pss_is_teacher());
drop policy if exists "teachers rename classes" on public.pss_classes;
create policy "teachers rename classes" on public.pss_classes for update to authenticated
  using (public.pss_is_teacher()) with check (public.pss_is_teacher());
drop policy if exists "teachers delete classes" on public.pss_classes;
create policy "teachers delete classes" on public.pss_classes for delete to authenticated using (public.pss_is_teacher());

drop policy if exists "teachers and own team read teams" on public.pss_teams;
create policy "teachers and own team read teams" on public.pss_teams for select to authenticated
  using (public.pss_is_teacher() or id = public.pss_my_team());
drop policy if exists "teachers add teams" on public.pss_teams;
create policy "teachers add teams" on public.pss_teams for insert to authenticated with check (public.pss_is_teacher());
drop policy if exists "teachers change teams" on public.pss_teams;
create policy "teachers change teams" on public.pss_teams for update to authenticated
  using (public.pss_is_teacher()) with check (public.pss_is_teacher());
drop policy if exists "teachers delete teams" on public.pss_teams;
create policy "teachers delete teams" on public.pss_teams for delete to authenticated using (public.pss_is_teacher());

drop policy if exists "teachers and self read members" on public.pss_members;
create policy "teachers and self read members" on public.pss_members for select to authenticated
  using (public.pss_is_teacher() or user_id = auth.uid());
drop policy if exists "teachers remove, iPads leave" on public.pss_members;
create policy "teachers remove, iPads leave" on public.pss_members for delete to authenticated
  using (public.pss_is_teacher() or user_id = auth.uid());

drop policy if exists "teachers and own team read updates" on public.pss_events;
create policy "teachers and own team read updates" on public.pss_events for select to authenticated
  using (public.pss_is_teacher() or team_id = public.pss_my_team());
drop policy if exists "teachers clear updates" on public.pss_events;
create policy "teachers clear updates" on public.pss_events for delete to authenticated using (public.pss_is_teacher());

drop policy if exists "teachers and own class read songs" on public.pss_songs;
create policy "teachers and own class read songs" on public.pss_songs for select to authenticated
  using (public.pss_is_teacher() or class_id = public.pss_my_class());
drop policy if exists "teachers edit songs" on public.pss_songs;
create policy "teachers edit songs" on public.pss_songs for update to authenticated
  using (public.pss_is_teacher()) with check (public.pss_is_teacher());
drop policy if exists "teachers delete songs" on public.pss_songs;
create policy "teachers delete songs" on public.pss_songs for delete to authenticated using (public.pss_is_teacher());

-- 6. The MP3s: a private bucket, one folder per class, one sub-folder per team -------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pss-songs', 'pss-songs', false, 52428800, array['audio/mpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- the first version's open policies
drop policy if exists "pss upload songs" on storage.objects;
drop policy if exists "pss read song files" on storage.objects;
drop policy if exists "pss delete song files" on storage.objects;

drop policy if exists "pss song files: teachers and own class listen" on storage.objects;
create policy "pss song files: teachers and own class listen" on storage.objects for select to authenticated
  using (bucket_id = 'pss-songs' and (public.pss_is_teacher() or (storage.foldername(name))[1] = public.pss_my_class()::text));
drop policy if exists "pss song files: teams upload to own folder" on storage.objects;
create policy "pss song files: teams upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'pss-songs'
    and (storage.foldername(name))[1] = public.pss_my_class()::text
    and (storage.foldername(name))[2] = public.pss_my_team()::text
    and lower(storage.extension(name)) = 'mp3');
drop policy if exists "pss song files: teachers delete" on storage.objects;
create policy "pss song files: teachers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'pss-songs' and public.pss_is_teacher());

-- 7. Copy the first version's data (once) ------------------------------------------------------------------
do $$
declare planets constant text[] := array['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune'];
begin
  if exists (select 1 from public.pss_meta where key = 'legacy_copied') then return; end if;
  if to_regclass('public.pss_legacy_teams') is null and to_regclass('public.pss_legacy_events') is null
     and to_regclass('public.pss_legacy_songs') is null then return; end if;

  create temp table legacy_rows (src text, src_id bigint, cls text, planet text, team text, what text, title text,
    genre text, lyrics text, info jsonb, file text, at timestamptz) on commit drop;
  if to_regclass('public.pss_legacy_teams') is not null then
    insert into legacy_rows (src, cls, planet, team, info, at)
      select 'team', cls, planet, team, info, updated_at from public.pss_legacy_teams;
  end if;
  if to_regclass('public.pss_legacy_events') is not null then
    insert into legacy_rows (src, src_id, cls, planet, team, what, info, at)
      select 'event', id, cls, planet, team, what, info, created_at from public.pss_legacy_events;
  end if;
  if to_regclass('public.pss_legacy_songs') is not null then
    insert into legacy_rows (src, src_id, cls, planet, team, title, genre, lyrics, info, file, at)
      select 'song', id, cls, planet, team, title, genre, lyrics, info, file, created_at from public.pss_legacy_songs;
  end if;
  -- tidy names the same way the new tables need them
  update legacy_rows set cls = left(coalesce(nullif(btrim(cls), ''), 'Unknown class'), 20),
    planet = coalesce((select p from unnest(planets) p where lower(p) = lower(btrim(legacy_rows.planet))), left(coalesce(nullif(btrim(planet), ''), 'Unknown'), 20)),
    team = left(coalesce(nullif(btrim(team), ''), 'Team'), 40);

  insert into public.pss_classes (name) select distinct cls from legacy_rows on conflict (name) do nothing;

  insert into public.pss_teams (class_id, planet, name, members, info, updated_at)
    select distinct on (c.id, r.planet, lower(r.team)) c.id, r.planet, r.team,
      case when r.src = 'team' and jsonb_typeof(r.info -> 'members') = 'array'
        then public.pss_clean_names(array(select jsonb_array_elements_text(r.info -> 'members'))) else '{}' end,
      case when r.src = 'team' then coalesce(r.info, '{}') else '{}' end, coalesce(r.at, now())
    from legacy_rows r join public.pss_classes c on c.name = r.cls
    order by c.id, r.planet, lower(r.team), (r.src = 'team') desc, r.at desc nulls last
    on conflict do nothing;

  insert into public.pss_events (created_at, class_id, team_id, what, info)
    select coalesce(r.at, now()), t.class_id, t.id, left(coalesce(r.what, ''), 120), coalesce(r.info, '{}')
    from legacy_rows r join public.pss_classes c on c.name = r.cls
    join public.pss_teams t on t.class_id = c.id and t.planet = r.planet and lower(t.name) = lower(r.team)
    where r.src = 'event' order by r.src_id;

  insert into public.pss_songs (created_at, class_id, team_id, title, genre, lyrics, info, file)
    select coalesce(r.at, now()), t.class_id, t.id, left(r.title, 80), left(r.genre, 30), left(r.lyrics, 20000),
      coalesce(r.info, '{}'), coalesce(nullif(r.file, ''), 'legacy-missing-file-' || r.src_id)
    from legacy_rows r join public.pss_classes c on c.name = r.cls
    join public.pss_teams t on t.class_id = c.id and t.planet = r.planet and lower(t.name) = lower(r.team)
    where r.src = 'song' order by r.src_id
    on conflict (file) do nothing;

  insert into public.pss_meta (key, value) values ('legacy_copied',
    format('%s teams, %s updates, %s songs', (select count(*) from legacy_rows where src = 'team'),
      (select count(*) from legacy_rows where src = 'event'), (select count(*) from legacy_rows where src = 'song')));
end $$;

-- 8. Live updates for the teacher's iPad (each viewer only receives rows their policies let them read) ------
do $$
declare t text;
begin
  foreach t in array array['pss_events', 'pss_teams', 'pss_songs'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
alter table public.pss_songs replica identity full;   -- so the teacher's other screens hear about deleted songs

-- 9. Cloud save: each team's whole song as JSON, and its voice takes (raw 16-bit audio) in <class>/<team>/takes/.
--    The school wipes iPads, so a team rejoining with its code gets its song back.
update storage.buckets set allowed_mime_types = array['audio/mpeg', 'application/octet-stream'] where id = 'pss-songs';
create table if not exists public.pss_saves (team_id uuid primary key references public.pss_teams (id) on delete cascade, project jsonb not null, user_id uuid, updated_at timestamptz not null default now());
alter table public.pss_saves enable row level security;
revoke all on public.pss_saves from anon, authenticated;
grant select on public.pss_saves to authenticated;
drop policy if exists "teachers and own team read saves" on public.pss_saves;
create policy "teachers and own team read saves" on public.pss_saves for select to authenticated using (public.pss_is_teacher() or team_id = public.pss_my_team());
create or replace function public.pss_save_project(p_project jsonb) returns timestamptz language plpgsql volatile security definer set search_path = '' as $$
declare tid uuid := public.pss_my_team(); at timestamptz := now();
begin
  if tid is null then raise exception 'This iPad is not in a team.' using errcode = '42501'; end if;
  if p_project is null or jsonb_typeof(p_project) <> 'object' or octet_length(p_project::text) > 1000000 then raise exception 'Song too big to save.' using errcode = '22001'; end if;
  insert into public.pss_saves (team_id, project, user_id, updated_at) values (tid, p_project, auth.uid(), at)
    on conflict (team_id) do update set project = excluded.project, user_id = excluded.user_id, updated_at = excluded.updated_at;
  return at;
end $$;
create or replace function public.pss_load_project() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('project', s.project, 'updated_at', s.updated_at) from public.pss_saves s where s.team_id = public.pss_my_team() $$;
revoke execute on function public.pss_save_project(jsonb), public.pss_load_project() from public, anon;
grant execute on function public.pss_save_project(jsonb), public.pss_load_project() to authenticated;
drop policy if exists "pss song files: teams upload takes to own folder" on storage.objects;
create policy "pss song files: teams upload takes to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'pss-songs' and (storage.foldername(name))[1] = public.pss_my_class()::text and (storage.foldername(name))[2] = public.pss_my_team()::text and (storage.foldername(name))[3] = 'takes' and lower(storage.extension(name)) = 'pcm');


commit;

-- What happened (shows in the results panel):
select (select count(*) from public.pss_classes) as classes, (select count(*) from public.pss_teams) as teams,
  (select count(*) from public.pss_songs) as songs, (select count(*) from public.pss_teachers) as teachers,
  (select value from public.pss_meta where key = 'legacy_copied') as copied_from_first_version;
