// How team iPads reach the teacher's app. Shared by the studio and the teacher app.
// mode 'supabase': fill in the project URL and the anon public key from Supabase (see setup/README.md).
// Only ever the anon key: it is public by design, and the database rules decide what it can do.
// Never put the service_role key here or anywhere in the apps.
// mode 'none': songs stay on each iPad and can be saved as MP3.
export const CONFIG = {
  mode: 'supabase',
  url: 'https://ssmecsrzvigrbkkmwyoq.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzbWVjc3J6dmlncmJra213eW9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NDk1MjAsImV4cCI6MjEwODIyNTUyMH0.zhuR05SFoTk3CVyy0imI3qQ7STaNRfLsnqJHPM7UBis',
  studioUrl: 'https://w-amadeus-mozart.github.io/planet-song-studio/'
};
