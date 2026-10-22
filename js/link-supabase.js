// Team iPad -> teacher, through Supabase: live updates (pss_events), each team's latest state (pss_teams),
// finished songs (pss_songs + the MP3 in the pss-songs bucket). See setup/supabase.sql.

let client = null, online = false;

function loadLib(){
  if (window.supabase) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = new URL('../shared/supabase.js', import.meta.url).href; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}

export function create(cfg){
  const ready = loadLib().then(async () => {
    client = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: false } });
    const { error } = await client.from('pss_teams').select('team', { head: true, count: 'exact' }).eq('room', cfg.room).limit(1);
    online = !error;
    return online;
  }).catch(() => (online = false));

  const team = m => ({ room: cfg.room, cls: m.cls, planet: m.planet, team: m.team });
  return {
    ready,
    status: () => (online ? 'online' : 'offline'),
    async send(m){
      await ready; if (!client) return false;
      const { kind, what, ...info } = m;
      const a = await client.from('pss_events').insert({ ...team(m), what, info });
      const b = await client.from('pss_teams').upsert({ ...team(m), info: { ...info, last: what }, updated_at: new Date().toISOString() });
      online = !a.error && !b.error;
      return online;
    },
    async upload(meta, mp3){
      await ready; if (!client) return false;
      const safe = s => String(s).replace(/[^\w-]+/g, '_');
      const file = `${safe(cfg.room)}/${safe(meta.cls)}/${safe(meta.planet)}-${safe(meta.team)}-${Date.now()}.mp3`;
      const up = await client.storage.from('pss-songs').upload(file, mp3, { contentType: 'audio/mpeg', upsert: false });
      if (up.error) return false;
      const { lyrics, title, genre, ...info } = meta;
      const row = await client.from('pss_songs').insert({ ...team(meta), title, genre, lyrics, info, file });
      if (row.error) return false;
      await this.send({ ...meta, kind: 'update', what: 'sent their song' });
      return true;
    }
  };
}
