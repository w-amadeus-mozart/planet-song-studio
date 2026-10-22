# Switching on the live link (about 10 minutes, free)

The link uses Supabase. Teachers sign in with an email and password. Learners never get accounts: each team
joins with its own code, which the teacher makes in the teacher app. The database itself enforces who can do what
(see the top of `supabase.sql`). The apps only ever use the public **anon** key; never put the **service_role**
key in `config.js` or anywhere in the apps.

1. **Create the project.** https://supabase.com › New project (e.g. "planet-songs").
2. **Allow anonymous sign-ins** (this is how a learner iPad gets a sign-in without an account):
   Authentication › Sign In / Providers › turn on **Allow anonymous sign-ins** › Save.
   Optional but good: Authentication › Rate Limits › raise "anonymous sign-ins per hour" to about 100, because
   all the school's iPads share one internet address.
3. **Run the database setup.** SQL Editor › New query › paste everything in `supabase.sql` › Run.
   It is safe to run again. If you ran the first version of this file, it moves your data across (see below).
4. **Make your teacher account.** Authentication › Users › Add user › Create new user: your email and a password,
   tick "Auto Confirm User". Then SQL Editor › New query › paste `make-teacher.sql`, put your email in it › Run.
   The last query should list your email.
5. **Connect the apps.** Project Settings › Data API: copy the Project URL. Project Settings › API Keys
   (Legacy tab): copy the **anon public** key. Put them in `js/config.js` (`mode: 'supabase'`, `url`, `key`),
   push, and reinstall the teacher app (`zsh ipad/install-on-ipad.sh`).

## In class

- Teacher app › sign in › **＋** next to the classes to add 6L, 6M, 6N.
- On each planet card, **＋ Team** adds a team and makes its code. Tap the **🔑 code** to show that team its own QR
  code (or read the code out to them). The board's "Show QR" only opens the studio; a team still needs its code.
- A code only opens its own team. If a code gets around, tap the code › **New code**: the old one stops working
  and that team's iPads type the new one (their work on the iPad is kept). **Close joining** stops new iPads
  joining a team without changing its code.
- Only teachers can delete songs, teams or classes. Deleting a team or class also deletes its MP3 files.

## Upgrading from the first version

The first version had open tables and a public bucket. Running the new `supabase.sql`:

- renames the old tables to `pss_legacy_events`, `pss_legacy_teams`, `pss_legacy_songs` and locks them
  (only you, in the dashboard, can read them; nothing is deleted);
- copies every class, team, update and song into the new tables (once; it records that it did);
- removes the old open policies and makes the `pss-songs` bucket private. MP3s already uploaded stay where they
  are, and teachers can still play them. Old teams get new join codes.

It all runs in one transaction: if anything fails, nothing changes. Once you're happy, you can drop the
`pss_legacy_*` tables yourself, but there's no need to.
