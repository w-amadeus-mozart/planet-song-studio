-- Planet Song Studio: run this once in your Supabase project (SQL Editor > New query > paste > Run).
-- It makes three tables (live updates, teams, songs), a storage bucket for the MP3s, and turns on live updates.
-- The studio and the teacher app both use the project's public "anon" key, so anyone with the studio link can add
-- updates and songs. Nothing here is private: keep children's full names out of team names if that matters.

create table if not exists pss_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  room text not null, cls text, planet text, team text, what text, info jsonb
);
create table if not exists pss_teams (
  room text not null, cls text not null, planet text not null, team text not null,
  info jsonb, updated_at timestamptz not null default now(),
  primary key (room, cls, planet, team)
);
create table if not exists pss_songs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  room text not null, cls text, planet text, team text, title text, genre text, lyrics text, info jsonb, file text
);

alter table pss_events enable row level security;
alter table pss_teams enable row level security;
alter table pss_songs enable row level security;

drop policy if exists "pss read events" on pss_events;   create policy "pss read events" on pss_events for select to anon, authenticated using (true);
drop policy if exists "pss add events" on pss_events;    create policy "pss add events" on pss_events for insert to anon, authenticated with check (true);
drop policy if exists "pss clear events" on pss_events;  create policy "pss clear events" on pss_events for delete to anon, authenticated using (true);
drop policy if exists "pss read teams" on pss_teams;     create policy "pss read teams" on pss_teams for select to anon, authenticated using (true);
drop policy if exists "pss add teams" on pss_teams;      create policy "pss add teams" on pss_teams for insert to anon, authenticated with check (true);
drop policy if exists "pss update teams" on pss_teams;   create policy "pss update teams" on pss_teams for update to anon, authenticated using (true) with check (true);
drop policy if exists "pss remove teams" on pss_teams;   create policy "pss remove teams" on pss_teams for delete to anon, authenticated using (true);
drop policy if exists "pss read songs" on pss_songs;     create policy "pss read songs" on pss_songs for select to anon, authenticated using (true);
drop policy if exists "pss add songs" on pss_songs;      create policy "pss add songs" on pss_songs for insert to anon, authenticated with check (true);
drop policy if exists "pss remove songs" on pss_songs;   create policy "pss remove songs" on pss_songs for delete to anon, authenticated using (true);

-- live updates for the teacher's iPad
do $$ begin
  begin alter publication supabase_realtime add table pss_events; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table pss_teams; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table pss_songs; exception when duplicate_object then null; end;
end $$;

-- the MP3s
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pss-songs', 'pss-songs', true, 52428800, array['audio/mpeg'])
on conflict (id) do nothing;
drop policy if exists "pss upload songs" on storage.objects;
create policy "pss upload songs" on storage.objects for insert to anon, authenticated with check (bucket_id = 'pss-songs');
drop policy if exists "pss read song files" on storage.objects;
create policy "pss read song files" on storage.objects for select to anon, authenticated using (bucket_id = 'pss-songs');
drop policy if exists "pss delete song files" on storage.objects;
create policy "pss delete song files" on storage.objects for delete to anon, authenticated using (bucket_id = 'pss-songs');
