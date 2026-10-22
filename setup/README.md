# Switching on the live link (about 5 minutes, free)

1. Go to https://supabase.com, sign in (GitHub sign-in works) and create a new project. Any name, e.g.
   "planet-songs"; pick the region closest to you (Cape Town: "West EU" or "Central EU" are fine).
2. When it is ready, open **SQL Editor › New query**, paste everything in `supabase.sql` from this folder and press
   **Run**. It should say "Success".
3. Open **Project Settings › API** and copy two things: the **Project URL** and the **anon public** key.
4. Put them in `js/config.js`: `mode: 'supabase'`, `url: '<Project URL>'`, `key: '<anon key>'`.
5. Push the change (the studio on GitHub Pages updates in a minute) and reinstall the teacher app
   (`zsh ipad/install-on-ipad.sh`).

The anon key is meant to be public: it is in every copy of the studio. It lets anyone with the studio link add
updates and songs to these three tables and nothing else in your Supabase account.
