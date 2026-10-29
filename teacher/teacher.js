// Planet Song Teacher: watch every team live, collect their songs by class and planet, and get them ready for Suno.

import { CLASSES, PLANETS, PMAP, GMAP, SUNO_STYLE } from '../js/data.js';
import { CONFIG } from '../js/config.js';

const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const orb = (p, s) => `<span class="orb ${p.id === 'Saturn' ? 'ring' : p.id === 'Uranus' ? 'ring side' : ''}" style="--s:${s}px;--c1:${p.orb[0]};--c2:${p.orb[1]}" aria-hidden="true"></span>`;
const pref = (k, d) => { try { const v = localStorage.getItem('pst:' + k); return v == null ? d : JSON.parse(v); } catch (e){ return d; } };
const setPref = (k, v) => { try { localStorage.setItem('pst:' + k, JSON.stringify(v)); } catch (e){} };
function toast(m){ const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2000); }
function ago(t){
  const s = Math.round((Date.now() - new Date(t)) / 1000);
  if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago';
  return new Date(t).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
const planetOrder = (a, b) => (PMAP[a.planet]?.n || 9) - (PMAP[b.planet]?.n || 9) || String(a.team).localeCompare(b.team);
const fileBase = s => `${s.cls} - ${s.planet} - ${s.team}`.replace(/[\/\\:*?"<>|]+/g, '_');

/* ---------- state ---------- */
const cloud = CONFIG.mode === 'supabase' && !!CONFIG.url && !!CONFIG.key;
let classes = cloud ? [] : CLASSES.map(n => ({ id: n, name: n }));   // [{id, name}]
let cls = pref('cls', CLASSES[0]);  // the class on screen, by name
let view = 'live';
let online = false, sb = null;
let auth = cloud ? 'loading' : 'local';   // loading | signin | notTeacher | ok | local
let me = null;                      // signed-in teacher's email
const teams = new Map();            // id -> {id, class_id, planet, name, join_code, joining_open, members, info, updated_at}
const devices = new Map();          // team id -> iPads joined
let songs = [];                     // {id, team_id?, cls, planet, team, title, genre, lyrics, info, file, url, created_at, local?}
let events = [];                    // newest first: {team_id?, cls, planet, team, what, info, created_at}
let medley = null;                  // {cls, url, blob}
let sheet = null;                   // open pop-up: {kind: 'team'|'addTeam'|'classes', ...}

const classById = id => classes.find(c => c.id === id);
const classByName = n => classes.find(c => c.name === n);
// Rows from the cloud carry ids; the screens use class name, planet and team name.
function named(r){
  if (!r.team_id) return r;
  const t = teams.get(r.team_id), c = t && classById(t.class_id);
  return { ...r, cls: c ? c.name : '?', planet: t ? t.planet : '?', team: t ? t.name : 'Removed team' };
}
const teamView = t => ({ ...t, cls: classById(t.class_id)?.name || '?', team: t.name });

/* ---------- cloud: teacher sign-in, then everything for this teacher ---------- */
function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function connect(){
  if (!cloud){ render(); return; }
  try {
    await loadScript('../shared/supabase.js');
    sb = window.supabase.createClient(CONFIG.url, CONFIG.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pst-auth' } });
    const { data } = await sb.auth.getSession();
    if (data.session) await afterSignIn(data.session); else { auth = 'signin'; render(); }
  } catch (err){ console.error(err); auth = 'signin'; render(); toast("Can't reach the cloud. Check the wifi."); }
}
async function signIn(email, password){
  const err = document.getElementById('signErr'), b = document.querySelector('[data-act=signin]');
  b.disabled = true; b.textContent = 'Signing in…';
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error){ b.disabled = false; b.textContent = 'Sign in'; err.hidden = false; err.textContent = /invalid/i.test(error.message) ? 'Email or password is wrong.' : error.message; return; }
  await afterSignIn(data.session);
}
async function afterSignIn(session){
  me = session.user.email || '';
  const { data, error } = await sb.rpc('pss_whoami');
  if (error || !data || !data.teacher){ auth = 'notTeacher'; render(); return; }
  auth = 'ok';
  try { await loadAll(); subscribe(); } catch (e){ console.error(e); toast("Signed in, but couldn't load the classes. Did setup/supabase.sql run?"); }
  render();
}
async function signOut(){
  if (sb){ sb.removeAllChannels(); await sb.auth.signOut(); }
  teams.clear(); devices.clear(); songs = songs.filter(s => s.local); events = []; classes = []; online = false; me = null;
  auth = 'signin'; render();
}
async function loadAll(){
  const [c, t, s, e] = await Promise.all([
    sb.from('pss_classes').select('id,name').order('name'),
    sb.from('pss_teams').select('*'),
    sb.from('pss_songs').select('*').order('created_at', { ascending: false }),
    sb.from('pss_events').select('*').order('created_at', { ascending: false }).limit(300)
  ]);
  if (c.error || t.error) throw c.error || t.error;
  classes = c.data;
  if (!classByName(cls) && classes.length) cls = classes[0].name;
  teams.clear(); t.data.forEach(r => teams.set(r.id, r));
  songs = songs.filter(x => x.local).concat(await signed(s.data || []));
  events = e.data || [];
  await loadDevices();
  online = true;
}
async function loadDevices(){
  const { data } = await sb.rpc('pss_team_devices');
  devices.clear(); (data || []).forEach(r => devices.set(r.team_id, r.devices));
}
// The bucket is private: songs play through links that work for a few hours, made fresh when needed.
async function signed(rows){
  const files = rows.map(r => r.file).filter(Boolean);
  const urls = new Map();
  for (let i = 0; i < files.length; i += 100){
    const { data } = await sb.storage.from('pss-songs').createSignedUrls(files.slice(i, i + 100), 6 * 3600);
    (data || []).forEach(d => { if (d.signedUrl) urls.set(d.path, d.signedUrl); });
  }
  return rows.map(r => ({ ...r, url: urls.get(r.file) || '' }));
}
function subscribe(){
  sb.channel('pss-teacher')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pss_events' }, p => { onEvent(p.new); loadDevicesSoon(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pss_teams' }, p => {
      if (p.eventType === 'DELETE') teams.delete(p.old.id); else if (p.new && p.new.id) teams.set(p.new.id, p.new);
      refresh();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pss_songs' }, async p => { const [r] = await signed([p.new]); songs = songs.filter(x => x.id !== r.id); songs.unshift(r); refresh(); })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pss_songs' }, p => { songs = songs.filter(x => x.local || x.id !== p.old.id); refresh(); })
    .subscribe(st => { const was = online; online = st === 'SUBSCRIBED' || (st !== 'CLOSED' && st !== 'CHANNEL_ERROR' && st !== 'TIMED_OUT' && online); if (was !== online) paintConn(); });
}
let devT = 0;
function loadDevicesSoon(){ clearTimeout(devT); devT = setTimeout(() => loadDevices().then(refresh), 1500); }
function onEvent(raw){
  events.unshift(raw); events = events.slice(0, 300);
  const ev = named(raw);
  const g = ev.info && ev.info.genre ? GMAP[ev.info.genre] : null;
  let text = `${ev.cls} · ${ev.planet} · ${ev.team} ${ev.what}`;
  if (/^chose /.test(ev.what) && g) text = `${ev.cls} · ${ev.planet} is building ${g.name}`;
  banner(text, PMAP[ev.planet]);
  refresh();
  const card = document.querySelector(`[data-planet="${ev.cls}|${ev.planet}"]`);
  if (card){ card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
}

/* ---------- teacher actions on classes, teams and songs ---------- */
async function addClass(name){
  name = String(name || '').trim().slice(0, 20); if (!name) return;
  if (classByName(name)){ toast(`${name} is already there`); return; }
  const { data, error } = await sb.from('pss_classes').insert({ name }).select('id,name').single();
  if (error){ toast('Could not add the class'); console.error(error); return; }
  classes.push(data); classes.sort((a, b) => a.name.localeCompare(b.name));
  if (!classByName(cls)) cls = name;
}
// Every MP3 file under a folder of the bucket (a class folder holds one folder per team).
async function filesUnder(prefix){
  const out = [];
  const { data } = await sb.storage.from('pss-songs').list(prefix, { limit: 1000 });
  for (const f of data || []){
    if (f.id) out.push(`${prefix}/${f.name}`);         // a file
    else out.push(...await filesUnder(`${prefix}/${f.name}`));   // a folder
  }
  return out;
}
async function removeFiles(paths){
  for (let i = 0; i < paths.length; i += 100){ const { error } = await sb.storage.from('pss-songs').remove(paths.slice(i, i + 100)); if (error) throw error; }
}
async function deleteClass(id){
  const c = classById(id); if (!c) return;
  try {
    const files = new Set([...songs.filter(s => !s.local && teams.get(s.team_id)?.class_id === id).map(s => s.file), ...await filesUnder(id)]);
    await removeFiles([...files].filter(Boolean));
    const { error } = await sb.from('pss_classes').delete().eq('id', id); if (error) throw error;
  } catch (e){ console.error(e); toast('Could not delete the class'); return; }
  [...teams.values()].filter(t => t.class_id === id).forEach(t => teams.delete(t.id));
  songs = songs.filter(s => s.local || teams.has(s.team_id)); events = events.filter(e => teams.has(e.team_id));
  classes = classes.filter(x => x.id !== id);
  if (cls === c.name) cls = classes[0]?.name || CLASSES[0];
  toast(`${c.name} deleted`);
}
async function addTeam(planet, name){
  const c = classByName(cls); name = String(name || '').trim().slice(0, 40);
  if (!c || !name) return null;
  const { data, error } = await sb.from('pss_teams').insert({ class_id: c.id, planet, name }).select('*').single();
  if (error){ toast(/duplicate|unique/i.test(error.message) ? `${planet} already has a team called ${name}` : 'Could not add the team'); return null; }
  teams.set(data.id, data); return data;
}
async function deleteTeam(id){
  const t = teams.get(id); if (!t) return;
  try {
    const files = new Set([...songs.filter(s => s.team_id === id).map(s => s.file), ...await filesUnder(`${t.class_id}/${id}`)]);
    await removeFiles([...files].filter(Boolean));
    const { error } = await sb.from('pss_teams').delete().eq('id', id); if (error) throw error;
  } catch (e){ console.error(e); toast('Could not delete the team'); return; }
  teams.delete(id); songs = songs.filter(s => s.team_id !== id); events = events.filter(e => e.team_id !== id);
  toast(`${t.name} deleted`);
}
async function newCode(id){
  const { data, error } = await sb.rpc('pss_new_team_code', { p_team: id });
  if (error){ toast('Could not make a new code'); return; }
  const t = teams.get(id); if (t) t.join_code = data; devices.set(id, 0);
  toast('New code made. The team types it on their iPad.');
}
async function setJoining(id, open){
  const { data, error } = await sb.from('pss_teams').update({ joining_open: open }).eq('id', id).select('*').single();
  if (error){ toast('Could not change that'); return; }
  teams.set(id, data);
}
async function deleteSong(s){
  if (s.local){ await localDel(s.id); }
  else {
    if (s.file){ const { error } = await sb.storage.from('pss-songs').remove([s.file]); if (error) console.warn(error); }
    const { error } = await sb.from('pss_songs').delete().eq('id', s.id);
    if (error){ toast('Could not remove the song'); return; }
  }
  songs = songs.filter(x => x !== s);
}

let bannerT = 0;
function banner(text, p){
  document.querySelectorAll('.banner').forEach(b => b.remove());
  const b = document.createElement('div'); b.className = 'banner'; b.setAttribute('role', 'status');
  b.innerHTML = (p ? orb(p, 30) : '') + `<span>${esc(text)}</span>`;
  document.body.appendChild(b); clearTimeout(bannerT); bannerT = setTimeout(() => b.remove(), 4500);
}

/* ---------- songs added from Files (works with no internet) ---------- */
let dbp = null;
function db(){ return dbp ||= new Promise((res, rej) => { const r = indexedDB.open('planet-song-teacher', 1); r.onupgradeneeded = () => r.result.createObjectStore('songs', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function localAll(){ const d = await db(); return new Promise(res => { const q = d.transaction('songs').objectStore('songs').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); }
async function localPut(rec){ const d = await db(); return new Promise((res, rej) => { const t = d.transaction('songs', 'readwrite'); t.objectStore('songs').put(rec); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function localDel(id){ const d = await db(); return new Promise(res => { const t = d.transaction('songs', 'readwrite'); t.objectStore('songs').delete(id); t.oncomplete = res; t.onerror = res; }); }
async function loadLocal(){
  const recs = await localAll();
  recs.forEach(r => songs.push({ ...r, url: URL.createObjectURL(r.blob), local: true }));
}
// A team's file is named like "6M-Mars-Red_Rappers.mp3" by the studio, so class, planet and team come from the name.
async function addFiles(files){
  let n = 0;
  for (const f of files){
    const m = f.name.replace(/\.mp3$/i, '').split(/[-–]/).map(s => s.trim().replace(/_/g, ' '));
    const c = [...classes.map(x => x.name), ...CLASSES].find(x => x.toLowerCase() === (m[0] || '').toLowerCase()) || cls;
    const p = PLANETS.find(x => x.id.toLowerCase() === (m[1] || '').toLowerCase());
    const rec = { id: 'local-' + Date.now() + '-' + n, cls: c, planet: p ? p.id : 'Mercury', team: m.slice(2).join(' ') || f.name, title: '', genre: null, lyrics: '', created_at: new Date().toISOString(), blob: f };
    await localPut(rec); songs.unshift({ ...rec, url: URL.createObjectURL(f), local: true }); n++;
  }
  toast(`Added ${n} song${n === 1 ? '' : 's'}`); render();
}

/* ---------- render ---------- */
function render(){
  if (auth === 'loading'){ app.innerHTML = '<div class="gate"><h1>Planet Song Teacher</h1><p class="muted">Connecting…</p></div>'; return; }
  if (auth === 'signin' || auth === 'notTeacher'){ app.innerHTML = renderSignIn(); return; }
  const tabs = [['live', 'Live'], ['songs', 'Songs'], ['suno', 'Suno']];
  app.innerHTML = `<div class="top">
      <h1>Planet Song Teacher</h1>
      <div class="classes" role="group" aria-label="Class">${classes.map(c => `<button data-act="cls" data-v="${esc(c.name)}" aria-pressed="${c.name === cls}">${esc(c.name)}</button>`).join('')}${auth === 'ok' ? '<button data-act="classes" aria-label="Add or delete classes" title="Classes">＋</button>' : ''}</div>
      <nav class="tabs" role="tablist">${tabs.map(([id, n]) => `<button class="tab" role="tab" data-act="view" data-v="${id}" aria-selected="${view === id}">${n}</button>`).join('')}</nav>
      <span class="conn" id="conn"><i></i><span></span></span>
      <button class="btn primary" data-act="qr">Show QR</button>
      ${auth === 'ok' ? `<button class="btn ghost sm" data-act="signout" title="Signed in as ${esc(me)}">Sign out</button>` : ''}
    </div>
    <main id="main">${body()}</main>${sheet ? renderSheet() : ''}`;
  paintConn();
}
function renderSignIn(){
  return `<form class="gate card" id="signForm" autocomplete="on">
    <h1>Planet Song Teacher</h1>
    ${auth === 'notTeacher' ? `<p><b>${esc(me)}</b> is signed in but is not a teacher yet.</p><p class="muted small">In Supabase, run <b>setup/make-teacher.sql</b> with this email, then sign in again.</p><button class="btn" type="button" data-act="signout">Sign out</button>`
    : `<p class="muted">Sign in with your teacher account. Learners never sign in: they join with their team code.</p>
    <label class="field"><span class="label">Email</span><input type="email" id="email" required autocomplete="username" inputmode="email"></label>
    <label class="field"><span class="label">Password</span><input type="password" id="password" required autocomplete="current-password"></label>
    <p id="signErr" class="small" style="color:var(--rec);margin:0" hidden></p>
    <button class="btn primary" data-act="signin" type="submit">Sign in</button>`}
  </form>`;
}
function refresh(){ if (auth !== 'ok' && auth !== 'local') return; repaintSheet(); const m = document.getElementById('main'); if (m && !document.activeElement?.closest?.('audio')) m.innerHTML = body(); else if (m && view === 'live') m.innerHTML = body(); }
function paintConn(){
  const el = document.getElementById('conn'); if (!el) return;
  el.className = 'conn' + (online ? ' on' : '');
  el.querySelector('span').textContent = online ? 'Live' : cloud ? 'Not connected' : 'Offline mode';
}
function body(){
  if (view === 'songs') return renderSongs();
  if (view === 'suno') return renderSuno();
  return renderLive();
}

function teamsOf(c, planet){ return [...teams.values()].map(teamView).filter(t => t.cls === c && t.planet === planet).sort(planetOrder); }
function songOf(t){ return songs.map(named).find(s => (t.id && s.team_id === t.id) || (!s.team_id && s.cls === t.cls && s.planet === t.planet && String(s.team).toLowerCase() === String(t.team).toLowerCase())); }
function renderLive(){
  const setup = !cloud ? `<div class="card" style="margin-bottom:14px"><b>Live updates are off.</b> <span class="muted">Teams' progress appears here once the cloud link is set up (see setup/README in the project). You can still add songs the teams AirDrop to you on the Songs tab.</span></div>`
    : !classes.length ? `<div class="card" style="margin-bottom:14px"><h2 style="font-size:24px">Add your classes</h2><p class="muted">Then add a team on each planet. Every team gets its own secret code to join with.</p><div class="chips">${CLASSES.map(c => `<button class="btn" data-act="quickClass" data-v="${c}">＋ ${c}</button>`).join('')}<button class="btn ghost" data-act="classes">Another class…</button></div></div>`
    : `<p class="muted small" style="margin:0 0 12px">Add a team on each planet, then tap its 🔑 code to show the team its own QR code. A team's code only opens that team.</p>`;
  if (cloud && !classByName(cls)) return setup;
  const evs = events.slice(0, 80);
  return setup + `<div class="live">
    <div class="board">${PLANETS.map(p => {
      const ts = teamsOf(cls, p.id);
      return `<div class="planet" data-planet="${cls}|${p.id}" style="--pc:${p.orb[0]}">
        <div class="ph">${orb(p, 40)}<h3>${p.id}</h3></div>
        ${ts.length ? ts.map(t => { const i = t.info || {}, g = GMAP[i.genre], s = songOf(t);
          const dv = devices.get(t.id) || 0;
          return `<div class="team"><div class="trow"><b>${esc(t.team)}</b>${t.join_code ? `<button class="codechip" data-act="team" data-id="${t.id}" aria-label="Show code for ${esc(t.team)}">🔑 ${esc(t.join_code)}</button>` : ''}</div>
            ${t.join_code ? `<span class="small muted">📱 ${dv} iPad${dv === 1 ? '' : 's'}${t.joining_open ? '' : ' · joining closed'}${t.members && t.members.length ? ' · ' + esc(t.members.join(', ')) : ''}</span>` : ''}
            <div class="chips">${g ? `<span class="tag genre">${g.name}</span>` : '<span class="tag">No genre yet</span>'}${i.lyricLines ? `<span class="tag">${i.lyricLines} lines</span>` : ''}${i.voices ? `<span class="tag">🎤 ${i.voices}</span>` : ''}${t.lyrics_at ? '<span class="tag song">Lyrics ✓</span>' : ''}${s ? '<span class="tag song">Song in ✓</span>' : ''}</div>
            <span class="small muted">${esc(i.last || '')} · ${ago(t.updated_at)}</span></div>`; }).join('')
        : '<span class="empty">No team yet</span>'}
        ${auth === 'ok' ? `<button class="btn sm ghost addteam" data-act="addTeam" data-v="${p.id}">＋ Team</button>` : ''}
      </div>`; }).join('')}</div>
    <aside class="card"><h2 style="font-size:22px;margin-bottom:10px">Live feed</h2>
      <div class="feed">${evs.length ? evs.map(named).map(e => `<div class="ev ${e.cls === cls ? '' : 'dim'}">${PMAP[e.planet] ? orb(PMAP[e.planet], 28) : ''}<div style="flex:1;min-width:0"><b>${esc(e.cls)} · ${esc(e.planet)}</b> <span>${esc(e.team)} ${esc(e.what)}</span></div><span class="when">${ago(e.created_at)}</span></div>`).join('') : '<span class="muted small">Nothing yet. When teams scan the QR code and start, their steps show up here.</span>'}</div>
    </aside></div>`;
}

function renderSongs(){
  const list = songs.map(named).filter(s => s.cls === cls).sort(planetOrder);
  return `<div class="card" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <h2 style="font-size:24px;flex:1">${cls} songs <span class="muted small">(${list.length})</span></h2>
      <label class="btn" for="files">➕ Add MP3s from Files</label><input type="file" id="files" accept="audio/mpeg,.mp3" multiple hidden>
    </div>
    <div class="songs">${list.length ? list.map(s => { const p = PMAP[s.planet] || PLANETS[0];
      return `<div class="card song">${orb(p, 54)}
        <div style="min-width:0"><h3 style="font-size:21px">${esc(s.planet)} · ${esc(s.title || s.team)}</h3>
          <div class="small muted">${esc(s.team)}${s.genre ? ' · ' + esc(GMAP[s.genre]?.name || s.genre) : ''} · ${ago(s.created_at)}${s.local ? ' · from Files' : ''}</div>
          <audio controls preload="none" src="${esc(s.url)}"></audio>
          ${s.lyrics ? `<details><summary>Lyrics</summary><div class="lyrics">${esc(s.lyrics)}</div></details>` : ''}</div>
        <div class="acts"><button class="btn sm" data-act="share" data-id="${esc(s.id)}">Save / share</button>${s.team_id ? `<button class="btn sm" data-act="voice" data-id="${esc(s.team_id)}">🎤 Voice only</button>` : ''}<button class="btn sm ghost" data-act="del" data-id="${esc(s.id)}">Remove</button></div>
      </div>`; }).join('') : `<div class="card muted">No songs from ${cls} yet. Teams press "Send to teacher" on their Send page.</div>`}</div>`;
}

function field(label, text, id){ return `<div class="field"><div class="lab"><span class="label">${label}</span><button class="btn sm" data-act="copy" data-for="${id}">Copy</button></div><textarea id="${id}" rows="${Math.min(12, Math.max(2, text.split('\n').length + 1))}" readonly>${esc(text)}</textarea></div>`; }
// The studio sends "title / class line / genre line / blank" and then [Part] blocks; Suno wants just the tagged parts.
function sunoLyrics(s){
  const ly = s.lyrics || '', i = ly.search(/^\[/m);
  if (i < 0) return ly.trim();
  return ly.slice(i).replace(/^\[([^\]]+)\]/gm, (m, name) => {
    const n = name.toLowerCase();
    const tag = n.includes('chorus') ? 'Chorus' : n.startsWith('verse') ? 'Verse' : n.startsWith('rap') ? 'Rap' : n.startsWith('bridge') ? 'Bridge' : n.startsWith('outro') ? 'Outro' : n.startsWith('intro') ? 'Intro' : name;
    return `[${tag}]`;
  }).trim();
}
// Each planet in order from the Sun: its newest song (MP3 + lyrics), or, before any MP3, the lyrics a team sent.
function planetLineup(c){
  return PLANETS.map(p => {
    const song = songs.map(named).filter(x => x.cls === c && x.planet === p.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const team = [...teams.values()].map(teamView).filter(t => t.cls === c && t.planet === p.id && t.lyrics).sort((a, b) => new Date(b.lyrics_at) - new Date(a.lyrics_at))[0];
    const lyrics = (team && song && new Date(team.lyrics_at) > new Date(song.created_at) ? team.lyrics : song?.lyrics) || team?.lyrics || '';
    if (!song && !lyrics) return null;
    return { planet: p.id, song, team: song?.team || team?.team, title: song?.title || team?.lyrics_title || '', genre: song?.genre || team?.info?.genre || null, lyrics };
  }).filter(Boolean);
}
function renderSuno(){
  const line = planetLineup(cls), withMp3 = line.filter(x => x.song);
  const genres = [...new Set(line.map(x => x.genre).filter(Boolean))];
  const gname = g => GMAP[g]?.name || 'Pop';
  // Full lyrics, every planet in the same order as the medley MP3, each part labelled so Suno knows whose it is.
  const fullLyrics = line.map(x => `[${x.planet} – ${gname(x.genre)}${x.song ? '' : ' (no MP3 yet)'}]\n` + (sunoLyrics({ lyrics: x.lyrics }) || '(no lyrics sent)')).join('\n\n');
  const shortLyrics = ['[Intro]\nFrom the Sun out to Neptune, here we go!',
    ...line.map(x => { const ly = x.lyrics || ''; const m = ly.match(/\[Chorus[^\]]*\]\n([\s\S]*?)(\n\n|$)/i); const part = (m ? m[1] : ly.split('\n').slice(5, 9).join('\n')).trim(); return part ? `[${x.planet} – ${gname(x.genre)}]\n${part}` : ''; }).filter(Boolean),
    `[Outro]\nEight planets spinning, one solar system! ${cls}!`].join('\n\n');
  const order = withMp3.map((x, i) => `${i + 1}. ${x.planet} – ${gname(x.genre)} (${x.team})`).join('\n');
  const medleyStyle = `genre-shifting kids medley, a new style for each planet in this order: ${line.map(x => `${x.planet} ${gname(x.genre).toLowerCase()}`).join(', ') || 'pop'}; kids choir and rap, space synths, smooth transitions, polished mix`;
  const missing = PLANETS.filter(p => !line.some(x => x.planet === p.id)).map(p => p.id);
  return `<div class="suno">
    <div class="card">
      <h2 style="font-size:26px">${cls} as one Suno project</h2>
      <p class="muted" style="margin:6px 0 12px">1. Make the class medley MP3: every planet's song joined in order from the Sun. 2. In Suno: Create › Upload audio (the medley), then Cover / Remix. 3. Paste the title, style and the full lyrics below. The lyrics follow the same planet order as the MP3, each part labelled with its planet and genre.</p>
      ${missing.length ? `<p class="small" style="margin:0 0 10px">Not in yet: ${missing.join(', ')}</p>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn primary" data-act="medley" ${withMp3.length ? '' : 'disabled'}>🎛️ Make ${cls} medley MP3 (${withMp3.length} planet${withMp3.length === 1 ? '' : 's'})</button>
        ${medley && medley.cls === cls ? `<button class="btn" data-act="shareMedley">Save / share medley</button>` : ''}</div>
      <div class="progress" id="medProg" hidden style="margin-top:10px"><i></i></div>
      ${medley && medley.cls === cls ? `<audio controls src="${medley.url}" style="width:100%;margin-top:10px"></audio>` : ''}
      ${withMp3.length ? field('Order in the medley MP3', order, 'mo') : ''}
      ${field('Title', `${cls} Solar System Medley`, 'mt')}${field('Style of music', medleyStyle, 'ms')}
      ${field(`Lyrics: full, in planet order (${fullLyrics.length} characters${fullLyrics.length > 5000 ? ', more than Suno takes: use the short version' : ''})`, fullLyrics || '(no lyrics yet)', 'ml')}
      ${field('Lyrics: short version (one chorus per planet)', shortLyrics, 'mls')}
    </div>
    ${line.map((x, i) => `<div class="card"><div style="display:flex;gap:10px;align-items:center">${orb(PMAP[x.planet], 36)}<h3 style="font-size:21px">${esc(x.planet)} · ${esc(x.team || '')}</h3><span class="tag ${x.song ? 'song' : ''}">${x.song ? 'MP3 + lyrics' : 'Lyrics only'}</span></div>
      ${field('Title', x.title || `The ${x.planet} Song`, 't' + i)}${field('Style of music', `${SUNO_STYLE[x.genre] || 'catchy kids song'}, about the planet ${x.planet}, clear kid-friendly vocals`, 's' + i)}${field('Lyrics', sunoLyrics({ lyrics: x.lyrics }) || '(this team sent no lyrics)', 'l' + i)}</div>`).join('')}
  </div>`;
}

/* ---------- medley ---------- */
async function makeMedley(){
  const list = planetLineup(cls).filter(x => x.song).map(x => x.song), prog = document.getElementById('medProg'), bar = prog.querySelector('i');
  prog.hidden = false; bar.style.width = '3%';
  try {
    const AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
    const parts = [];
    for (let i = 0; i < list.length; i++){
      const buf = await fetch(list[i].url).then(r => r.arrayBuffer()).then(b => new Promise((res, rej) => ac.decodeAudioData(b, res, rej)));
      parts.push(buf); bar.style.width = (3 + (i + 1) / list.length * 37) + '%';
    }
    const sr = 44100, gap = sr * 1, total = parts.reduce((n, b) => n + Math.ceil(b.duration * sr) + gap, 0);
    const oc = new OfflineAudioContext(1, total, sr);
    let at = 0;
    parts.forEach(b => { const s = oc.createBufferSource(); s.buffer = b; s.connect(oc.destination); s.start(at / sr); at += Math.ceil(b.duration * sr) + gap; });
    const pcm = (await oc.startRendering()).getChannelData(0);
    if (!window.lamejs) await loadScript('../shared/lame.min.js');
    const enc = new window.lamejs.Mp3Encoder(1, sr, 160), out = [], i16 = new Int16Array(pcm.length), block = 1152 * 40;
    for (let i = 0; i < pcm.length; i++){ const v = Math.max(-1, Math.min(1, pcm[i])); i16[i] = v * 32767; }
    for (let i = 0; i < i16.length; i += block){ const d = enc.encodeBuffer(i16.subarray(i, i + block)); if (d.length) out.push(new Uint8Array(d)); if (i % (block * 8) === 0){ bar.style.width = (40 + i / i16.length * 60) + '%'; await new Promise(r => setTimeout(r)); } }
    out.push(new Uint8Array(enc.flush()));
    const blob = new Blob(out, { type: 'audio/mpeg' });
    if (medley) URL.revokeObjectURL(medley.url);
    medley = { cls, blob, url: URL.createObjectURL(blob) };
    ac.close(); render(); toast('Medley ready');
  } catch (e){ console.error(e); toast('Could not make the medley'); prog.hidden = true; }
}
/* ---------- voice only: a team's recorded voices without the beat, e.g. to upload to Suno ---------- */
async function voiceOnly(teamId, btn){
  const t = teams.get(teamId); if (!t || !sb) return;
  const label = btn && btn.textContent; if (btn){ btn.disabled = true; btn.textContent = 'Getting voices…'; }
  try {
    const { data: save } = await sb.from('pss_saves').select('project').eq('team_id', teamId).maybeSingle();
    const p = save && save.project, voices = p ? (p.tracks || []).filter(tr => tr.type === 'audio' && tr.takeId && !tr.mute) : [];
    if (!voices.length){ toast('No saved voice recordings for this team'); return; }
    const folder = `${t.class_id}/${t.id}/takes`;
    const { data: files } = await sb.storage.from('pss-songs').list(folder, { limit: 1000 });
    const sr = 44100, songSecs = (p.bars || 8) * 16 * (60 / (p.bpm || 100) / 4) + 2.5;
    const takes = [];
    for (const tr of voices){
      const base = String(tr.takeId).replace(/[^\w-]/g, '_') + '-', f = (files || []).find(x => x.name.startsWith(base) && x.name.endsWith('.pcm'));
      if (!f) continue;
      const { data } = await sb.storage.from('pss-songs').download(`${folder}/${f.name}`); if (!data) continue;
      const i16 = new Int16Array(await data.arrayBuffer()), rate = +f.name.slice(base.length, -4) || sr, pcm = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) pcm[i] = i16[i] / 32767;
      takes.push({ tr, pcm, rate });
    }
    if (!takes.length){ toast('The voice recordings are not in the cloud'); return; }
    // Same placement and levels as the team's song, so the voices line up with their beat.
    const len = Math.ceil(Math.max(songSecs, ...takes.map(x => .05 + x.pcm.length / x.rate - Math.min(0, x.tr.offset || 0))) * sr);
    const oc = new OfflineAudioContext(1, len, sr);
    takes.forEach(({ tr, pcm, rate }) => {
      const b = oc.createBuffer(1, pcm.length, rate); b.getChannelData(0).set(pcm);
      const s = oc.createBufferSource(), g = oc.createGain(); s.buffer = b; g.gain.value = tr.vol ?? .8; s.connect(g).connect(oc.destination);
      const o = tr.offset || 0; if (o >= 0) s.start(.05, o); else s.start(.05 - o);
    });
    const out = (await oc.startRendering()).getChannelData(0);
    let peak = 0; for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
    const k = peak > 0 ? .9 / peak : 1;   // as loud as it can go without clipping
    saveBlob(wav(out, sr, k), `${fileBase(teamView(t))} - voice only.wav`);
  } catch (e){ console.error(e); toast('Could not get the voices'); }
  finally { if (btn){ btn.disabled = false; btn.textContent = label; } }
}
function wav(pcm, sr, gain){
  const b = new DataView(new ArrayBuffer(44 + pcm.length * 2)), str = (o, s) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); b.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); str(36, 'data'); b.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++){ const v = Math.max(-1, Math.min(1, pcm[i] * gain)); b.setInt16(44 + i * 2, v * 32767, true); }
  return new Blob([b], { type: 'audio/wav' });
}
// Saving a file: a click on a download link. In the iPad app that opens the share sheet (Save to Files, AirDrop).
async function saveBlob(blobOrUrl, name){
  const blob = typeof blobOrUrl === 'string' ? await fetch(blobOrUrl).then(r => r.blob()) : blobOrUrl;
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

/* ---------- QR ---------- */
const qrImg = (url, cell) => { const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make(); return qr.createDataURL(cell, 2); };
// The board QR only opens the studio; every team still needs its own code to join.
function showQR(){
  const url = cloud ? CONFIG.studioUrl : CONFIG.studioUrl + '?c=' + encodeURIComponent(cls);
  const o = document.createElement('div'); o.className = 'qr';
  o.innerHTML = `<h2>Scan to make your planet song</h2><div class="cls">${esc(cls)}</div><div class="code"><img alt="QR code" src="${qrImg(url, 10)}"></div><div style="font-weight:800">${esc(url)}</div>${cloud ? '<div style="font-size:22px;font-weight:800">Then type your team code</div>' : ''}<div class="small" style="color:#556">Tap anywhere to close</div>`;
  o.addEventListener('click', () => o.remove()); document.body.appendChild(o);
}
// One team's own QR: it opens the studio with the team's code filled in. Show it to that team only.
function showTeamQR(t){
  const url = CONFIG.studioUrl + '?t=' + encodeURIComponent(t.join_code);
  const o = document.createElement('div'); o.className = 'qr';
  o.innerHTML = `<h2>${esc(t.name)}</h2><div class="small" style="font-size:22px;font-weight:800;color:#556">${esc(classById(t.class_id)?.name || '')} · ${esc(t.planet)}</div><div class="code"><img alt="QR code for ${esc(t.name)}" src="${qrImg(url, 10)}"></div><div class="cls" style="letter-spacing:.15em">${esc(t.join_code)}</div><div class="small" style="color:#556">Only for this team · tap anywhere to close</div>`;
  o.addEventListener('click', () => o.remove()); document.body.appendChild(o);
}

/* ---------- pop-ups: one team, adding a team, classes ---------- */
function renderSheet(){
  let h = '';
  if (sheet.kind === 'addTeam'){
    const p = PMAP[sheet.planet];
    h = `<form id="addTeamForm" class="stack"><div class="ph">${orb(p, 44)}<h2>New ${esc(sheet.planet)} team in ${esc(cls)}</h2></div>
      <label class="field"><span class="label">Team name</span><input type="text" id="teamName" maxlength="40" placeholder="e.g. The Red Rovers" autocomplete="off" required></label>
      <p class="small muted" style="margin:0">Use a team name, not children's full names. The team gets its own code to join with.</p>
      <div class="acts"><button class="btn primary" type="submit">Add team</button><button class="btn ghost" type="button" data-act="closeSheet">Cancel</button></div></form>`;
  } else if (sheet.kind === 'team'){
    const t = teams.get(sheet.id); if (!t){ sheet = null; return ''; }
    const p = PMAP[t.planet], dv = devices.get(t.id) || 0, n = songs.filter(s => s.team_id === t.id).length;
    h = `<div class="stack"><div class="ph">${p ? orb(p, 44) : ''}<div><h2>${esc(t.name)}</h2><div class="muted small">${esc(classById(t.class_id)?.name || '')} · ${esc(t.planet)} · 📱 ${dv} iPad${dv === 1 ? '' : 's'} joined · ${n} song${n === 1 ? '' : 's'}</div></div></div>
      <div class="bigcode">${esc(t.join_code)}</div>
      <p class="small muted" style="margin:0;text-align:center">${t.joining_open ? 'The team types this code in the studio, or scans the team QR.' : 'Joining is closed: this code does not work right now. iPads already in the team carry on.'}</p>
      <div class="acts" style="justify-content:center"><button class="btn primary" data-act="teamQR" data-id="${t.id}">Show team QR</button>
        <button class="btn" data-act="joining" data-id="${t.id}">${t.joining_open ? 'Close joining' : 'Open joining'}</button>
        <button class="btn" data-act="newCode" data-id="${t.id}">New code</button><button class="btn" data-act="voice" data-id="${t.id}">🎤 Voice only</button></div>
      <p class="small muted" style="margin:0">New code: the old code stops working and the team's iPads are signed out of the team until they type the new one. Their work on the iPad is kept.</p>
      <div class="acts"><button class="btn ghost" data-act="delTeam" data-id="${t.id}">Delete team and its songs</button><button class="btn" data-act="closeSheet">Done</button></div></div>`;
  } else if (sheet.kind === 'classes'){
    h = `<div class="stack"><h2>Classes</h2>
      ${classes.map(c => { const tn = [...teams.values()].filter(t => t.class_id === c.id).length, sn = songs.filter(s => teams.get(s.team_id)?.class_id === c.id).length;
        return `<div class="crow"><b>${esc(c.name)}</b><span class="muted small" style="flex:1">${tn} team${tn === 1 ? '' : 's'} · ${sn} song${sn === 1 ? '' : 's'}</span><button class="btn sm ghost" data-act="delClass" data-id="${c.id}">Delete</button></div>`; }).join('') || '<p class="muted">No classes yet.</p>'}
      <form id="addClassForm" class="row"><input type="text" id="className" maxlength="20" placeholder="Class name, e.g. 6M" autocomplete="off" required><button class="btn primary" type="submit">Add</button></form>
      <p class="small muted" style="margin:0">Deleting a class deletes its teams, their codes and all its songs. It cannot be undone.</p>
      <div class="acts"><button class="btn" data-act="closeSheet">Done</button></div></div>`;
  }
  return `<div class="sheet-bg" data-act="closeSheetBg"><div class="sheet card" role="dialog" aria-modal="true">${h}</div></div>`;
}
function openSheet(s){ sheet = s; render(); const f = document.querySelector('.sheet input'); if (f) f.focus(); }
function closeSheet(){ sheet = null; document.querySelector('.sheet-bg')?.remove(); }
function repaintSheet(){ const bg = document.querySelector('.sheet-bg'); if (!bg || !sheet || sheet.kind !== 'team') return; const html = renderSheet(); const tmp = document.createElement('div'); tmp.innerHTML = html; bg.replaceWith(tmp.firstElementChild); }

/* ---------- events ---------- */
app.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const v = b.dataset.v;
  switch (b.dataset.act){
    case 'cls': cls = v; setPref('cls', v); render(); break;
    case 'signout': signOut(); break;
    case 'classes': openSheet({ kind: 'classes' }); break;
    case 'quickClass': await addClass(v); render(); break;
    case 'addTeam': openSheet({ kind: 'addTeam', planet: v }); break;
    case 'team': openSheet({ kind: 'team', id: b.dataset.id }); break;
    case 'teamQR': { const t = teams.get(b.dataset.id); if (t) showTeamQR(t); } break;
    case 'joining': { const t = teams.get(b.dataset.id); if (t){ await setJoining(t.id, !t.joining_open); render(); } } break;
    case 'newCode': if (b.dataset.sure !== '1'){ b.dataset.sure = '1'; b.textContent = 'Tap again for a new code'; break; } await newCode(b.dataset.id); render(); break;
    case 'delTeam': if (b.dataset.sure !== '1'){ b.dataset.sure = '1'; b.textContent = 'Tap again to delete for good'; break; } b.disabled = true; await deleteTeam(b.dataset.id); sheet = null; render(); break;
    case 'delClass': if (b.dataset.sure !== '1'){ b.dataset.sure = '1'; b.textContent = 'Tap again: deletes teams and songs'; break; } b.disabled = true; await deleteClass(b.dataset.id); render(); break;
    case 'closeSheet': closeSheet(); break;
    case 'closeSheetBg': if (e.target === b) closeSheet(); break;
    case 'view': view = v; render(); break;
    case 'qr': showQR(); break;
    case 'copy': { const t = document.getElementById(b.dataset.for); try { await navigator.clipboard.writeText(t.value); toast('Copied'); } catch (x){ t.select(); toast('Selected: tap Copy'); } } break;
    case 'share': { const s = songs.find(x => String(x.id) === b.dataset.id); if (s) saveBlob(s.local ? s.blob : s.url, fileBase(named(s)) + '.mp3'); } break;
    case 'del': {
      if (b.dataset.sure !== '1'){ b.dataset.sure = '1'; b.textContent = 'Tap again'; break; }
      const s = songs.find(x => String(x.id) === b.dataset.id); if (!s) break;
      await deleteSong(s); render();
    } break;
    case 'medley': makeMedley(); break;
    case 'voice': voiceOnly(b.dataset.id, b); break;
    case 'shareMedley': if (medley) saveBlob(medley.blob, `${cls} - Solar System Medley.mp3`); break;
  }
});
app.addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'signForm') signIn(document.getElementById('email').value, document.getElementById('password').value);
  else if (e.target.id === 'addTeamForm'){ const t = await addTeam(sheet.planet, document.getElementById('teamName').value); if (t){ sheet = { kind: 'team', id: t.id }; render(); } }
  else if (e.target.id === 'addClassForm'){ await addClass(document.getElementById('className').value); render(); }
});
app.addEventListener('change', e => { if (e.target.id === 'files' && e.target.files.length) addFiles([...e.target.files]); });
setInterval(() => { if (view === 'live' && !document.querySelector('.banner') && !sheet) refresh(); }, 30000);
// fresh play links before the old ones run out
setInterval(async () => { if (auth === 'ok'){ const fresh = await signed(songs.filter(s => !s.local)); const byId = new Map(fresh.map(r => [r.id, r.url])); songs.forEach(s => { if (!s.local && byId.get(s.id)) s.url = byId.get(s.id); }); refresh(); } }, 5 * 3600 * 1000);

// ?demo shows made-up teams so the screens can be tried before any class has started.
if (/[?&]demo/.test(location.search)){
  const now = Date.now(), ts = (m) => new Date(now - m * 60000).toISOString();
  [['6M', 'Earth', 'Blue Crew', 'rap', 12, 1, 'recorded Voice 1', 2], ['6M', 'Mars', 'Red Rappers', 'trap', 8, 2, 'is recording Voice 2', 1], ['6M', 'Saturn', 'Ring Kings', 'jazz', 4, 0, 'chose Jazz', 6], ['6M', 'Neptune', 'Deep Blue', 'amapiano', 0, 0, 'joined', 9], ['6L', 'Venus', 'Hot Stuff', 'pop', 6, 1, 'made their MP3', 3]]
    .forEach(([c, p, t, g, l, v, last, m], i) => { const id = 'demo' + i; teams.set(id, { id, class_id: c, planet: p, name: t, info: { genre: g, lyricLines: l, voices: v, last }, updated_at: ts(m) }); events.push({ cls: c, planet: p, team: t, what: last, info: { genre: g }, created_at: ts(m) }); });
  events.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  setTimeout(() => onEvent({ cls: '6M', planet: 'Jupiter', team: 'Storm Squad', what: 'chose Rap', info: { genre: 'rap' }, created_at: new Date().toISOString() }), 2500);
}
loadLocal().then(render).catch(render);
connect();
