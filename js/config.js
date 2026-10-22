// How team iPads reach the teacher's app. Shared by the studio and the teacher app.
// mode 'supabase': fill in the project URL and the anon public key from Supabase (see setup/README.md).
// Only ever the anon key: it is public by design, and the database rules decide what it can do.
// Never put the service_role key here or anywhere in the apps.
// mode 'none': songs stay on each iPad and can be saved as MP3.
export const CONFIG = {
  mode: 'none',
  url: '',
  key: '',
  studioUrl: 'https://w-amadeus-mozart.github.io/planet-song-studio/'
};
