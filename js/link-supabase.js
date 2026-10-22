// Team iPad -> teacher, through Supabase. See setup/supabase.sql for the rules the database enforces.
// Each iPad signs in anonymously (no account, no password) and joins one team with the team's code from the teacher.
// After that it can only post updates and songs for that team; it never sees other teams or their codes.

let client = null, online = false, team = null;

function loadLib(){
  if (window.supabase) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = new URL('../shared/supabase.js', import.meta.url).href; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}

export function create(cfg){
  const ready = loadLib().then(async () => {
    // The sign-in is kept on the iPad, so a team stays joined after the studio is closed.
    client = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pss-auth' } });
    const { data } = await client.auth.getSession();
    if (data.session) await whoami();
    online = true;
    return true;
  }).catch(e => { console.warn(e); online = false; return false; });

  async function whoami(){
    const { data, error } = await client.rpc('pss_whoami');
    if (error) throw error;
    team = data && data.team ? data.team : null;
    return team;
  }

  return {
    ready,
    status: () => (online && team ? 'online' : 'offline'),
    team: () => team,
    // {team} or {error: 'wrong_code' | 'too_many_tries' | 'offline' | ...}
    async join(code, members){
      await ready; if (!client) return { error: 'offline' };
      try {
        const { data: s } = await client.auth.getSession();
        if (!s.session){
          const { error } = await client.auth.signInAnonymously();
          if (error) return { error: /rate|limit/i.test(error.message) ? 'busy' : 'offline' };
        }
        const { data, error } = await client.rpc('pss_join_team', { p_code: code, p_members: members || [] });
        if (error) return { error: 'offline' };
        if (data.team){ team = data.team; online = true; }
        return data;
      } catch (e){ console.warn(e); return { error: 'offline' }; }
    },
    async leave(){
      await ready; if (!client) return;
      const { data: s } = await client.auth.getSession();
      if (s.session) await client.from('pss_members').delete().eq('user_id', s.session.user.id);
      team = null;
    },
    async send(m){
      await ready; if (!client || !team) return false;
      const { what, members, ...info } = m;
      const { error } = await client.rpc('pss_team_update', { p_what: what, p_info: info, p_members: members && members.length ? members : null });
      if (error && /not in a team/i.test(error.message)) team = null;   // the teacher gave the team a new code
      online = !error || online;
      return !error;
    },
    // Cloud backup of the whole song, so a wiped iPad loses nothing.
    async saveProject(json){
      await ready; if (!client || !team) return false;
      const { error } = await client.rpc('pss_save_project', { p_project: json });
      if (error) console.warn(error);
      return !error;
    },
    async loadProject(){
      await ready; if (!client || !team) return null;
      const { data, error } = await client.rpc('pss_load_project');
      return error ? null : data;
    },
    async uploadTake(takeId, sampleRate, blob){
      await ready; if (!client || !team) return false;
      const path = `${team.class_id}/${team.id}/takes/${String(takeId).replace(/[^\w-]/g, '_')}-${sampleRate}.pcm`;
      const { error } = await client.storage.from('pss-songs').upload(path, blob, { contentType: 'application/octet-stream', upsert: false });
      return !error || /exists|duplicate/i.test(error.message || '');
    },
    async downloadTake(takeId){
      await ready; if (!client || !team) return null;
      const folder = `${team.class_id}/${team.id}/takes`, base = String(takeId).replace(/[^\w-]/g, '_') + '-';
      const { data: list } = await client.storage.from('pss-songs').list(folder, { limit: 1000, search: base });
      const f = (list || []).find(x => x.name.startsWith(base) && x.name.endsWith('.pcm')); if (!f) return null;
      const { data, error } = await client.storage.from('pss-songs').download(`${folder}/${f.name}`);
      return error ? null : { blob: data, sampleRate: +f.name.slice(base.length, -4) };
    },
    async sendLyrics(text, title, genre){
      await ready; if (!client || !team) return false;
      const { error } = await client.rpc('pss_send_lyrics', { p_lyrics: text, p_title: title || null, p_genre: genre || null });
      if (error) console.warn(error);
      return !error;
    },
    async upload(meta, mp3){
      await ready; if (!client || !team) return false;
      const file = `${team.class_id}/${team.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
      const up = await client.storage.from('pss-songs').upload(file, mp3, { contentType: 'audio/mpeg', upsert: false });
      if (up.error){ console.warn(up.error); return false; }
      const { lyrics, title, genre, members, ...info } = meta;
      const { error } = await client.rpc('pss_add_song', { p_file: file, p_title: title || null, p_genre: genre || null, p_lyrics: lyrics || '', p_info: info });
      if (error){ console.warn(error); return false; }
      return true;
    }
  };
}
