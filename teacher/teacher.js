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
let cls = pref('cls', CLASSES[0]);
let view = 'live';
let online = false, sb = null;
const teams = new Map();            // "cls|planet|team" -> {cls, planet, team, info, updated_at}
let songs = [];                     // {id, cls, planet, team, title, genre, lyrics, info, url, created_at, local?}
let events = [];                    // newest first
let medley = null;                  // {cls, url, blob}

/* ---------- cloud ---------- */
function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function connect(){
  if (CONFIG.mode !== 'supabase' || !CONFIG.url || !CONFIG.key){ render(); return; }
  try {
    await loadScript('../shared/supabase.js');
    sb = window.supabase.createClient(CONFIG.url, CONFIG.key, { auth: { persistSession: false } });
    const room = CONFIG.room;
    const [t, s, e] = await Promise.all([
      sb.from('pss_teams').select('*').eq('room', room),
      sb.from('pss_songs').select('*').eq('room', room).order('created_at', { ascending: false }),
      sb.from('pss_events').select('*').eq('room', room).order('created_at', { ascending: false }).limit(150)
    ]);
    if (t.error) throw t.error;
    t.data.forEach(addTeam); (s.data || []).forEach(r => songs.push(cloudSong(r))); events = e.data || [];
    online = true;
    sb.channel('pss-' + room)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pss_events', filter: `room=eq.${room}` }, p => onEvent(p.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pss_teams', filter: `room=eq.${room}` }, p => { if (p.new && p.new.team){ addTeam(p.new); refresh(); } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pss_songs', filter: `room=eq.${room}` }, p => { songs.unshift(cloudSong(p.new)); refresh(); })
      .subscribe(st => { const was = online; online = st === 'SUBSCRIBED' || (st !== 'CLOSED' && st !== 'CHANNEL_ERROR' && online); if (was !== online) paintConn(); });
  } catch (err){ console.error(err); online = false; }
  render();
}
function addTeam(r){ teams.set([r.cls, r.planet, r.team.toLowerCase()].join('|'), r); }
function cloudSong(r){ return { ...r, url: sb.storage.from('pss-songs').getPublicUrl(r.file).data.publicUrl }; }
function onEvent(ev){
  events.unshift(ev); events = events.slice(0, 300);
  const g = ev.info && ev.info.genre ? GMAP[ev.info.genre] : null;
  let text = `${ev.cls} · ${ev.planet} · ${ev.team} ${ev.what}`;
  if (/^chose /.test(ev.what) && g) text = `${ev.cls} · ${ev.planet} is building ${g.name}`;
  banner(text, PMAP[ev.planet]);
  refresh();
  const card = document.querySelector(`[data-planet="${ev.cls}|${ev.planet}"]`);
  if (card){ card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
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
    const c = CLASSES.find(x => x.toLowerCase() === (m[0] || '').toLowerCase()) || cls;
    const p = PLANETS.find(x => x.id.toLowerCase() === (m[1] || '').toLowerCase());
    const rec = { id: 'local-' + Date.now() + '-' + n, cls: c, planet: p ? p.id : 'Mercury', team: m.slice(2).join(' ') || f.name, title: '', genre: null, lyrics: '', created_at: new Date().toISOString(), blob: f };
    await localPut(rec); songs.unshift({ ...rec, url: URL.createObjectURL(f), local: true }); n++;
  }
  toast(`Added ${n} song${n === 1 ? '' : 's'}`); render();
}

/* ---------- render ---------- */
function render(){
  const tabs = [['live', 'Live'], ['songs', 'Songs'], ['suno', 'Suno']];
  app.innerHTML = `<div class="top">
      <h1>Planet Song Teacher</h1>
      <div class="classes" role="group" aria-label="Class">${CLASSES.map(c => `<button data-act="cls" data-v="${c}" aria-pressed="${c === cls}">${c}</button>`).join('')}</div>
      <nav class="tabs" role="tablist">${tabs.map(([id, n]) => `<button class="tab" role="tab" data-act="view" data-v="${id}" aria-selected="${view === id}">${n}</button>`).join('')}</nav>
      <span class="conn" id="conn"><i></i><span></span></span>
      <button class="btn primary" data-act="qr">Show QR for ${cls}</button>
    </div>
    <main id="main">${body()}</main>`;
  paintConn();
}
function refresh(){ const m = document.getElementById('main'); if (m && !document.activeElement?.closest?.('audio')) m.innerHTML = body(); else if (m && view === 'live') m.innerHTML = body(); }
function paintConn(){
  const el = document.getElementById('conn'); if (!el) return;
  el.className = 'conn' + (online ? ' on' : '');
  el.querySelector('span').textContent = online ? 'Live' : CONFIG.mode === 'supabase' ? 'Not connected' : 'Offline mode';
}
function body(){
  if (view === 'songs') return renderSongs();
  if (view === 'suno') return renderSuno();
  return renderLive();
}

function teamsOf(c, planet){ return [...teams.values()].filter(t => t.cls === c && t.planet === planet).sort(planetOrder); }
function songOf(t){ return songs.find(s => s.cls === t.cls && s.planet === t.planet && String(s.team).toLowerCase() === String(t.team).toLowerCase()); }
function renderLive(){
  const setup = CONFIG.mode !== 'supabase' ? `<div class="card" style="margin-bottom:14px"><b>Live updates are off.</b> <span class="muted">Teams' progress appears here once the cloud link is set up (see setup/README in the project). You can still add songs the teams AirDrop to you on the Songs tab.</span></div>` : '';
  const evs = events.slice(0, 80);
  return setup + `<div class="live">
    <div class="board">${PLANETS.map(p => {
      const ts = teamsOf(cls, p.id);
      return `<div class="planet" data-planet="${cls}|${p.id}" style="--pc:${p.orb[0]}">
        <div class="ph">${orb(p, 40)}<h3>${p.id}</h3></div>
        ${ts.length ? ts.map(t => { const i = t.info || {}, g = GMAP[i.genre], s = songOf(t);
          return `<div class="team"><b>${esc(t.team)}</b>
            <div class="chips">${g ? `<span class="tag genre">${g.name}</span>` : '<span class="tag">No genre yet</span>'}${i.lyricLines ? `<span class="tag">${i.lyricLines} lines</span>` : ''}${i.voices ? `<span class="tag">🎤 ${i.voices}</span>` : ''}${s ? '<span class="tag song">Song in ✓</span>' : ''}</div>
            <span class="small muted">${esc(i.last || '')} · ${ago(t.updated_at)}</span></div>`; }).join('')
        : '<span class="empty">No team yet</span>'}
      </div>`; }).join('')}</div>
    <aside class="card"><h2 style="font-size:22px;margin-bottom:10px">Live feed</h2>
      <div class="feed">${evs.length ? evs.map(e => `<div class="ev ${e.cls === cls ? '' : 'dim'}">${PMAP[e.planet] ? orb(PMAP[e.planet], 28) : ''}<div style="flex:1;min-width:0"><b>${esc(e.cls)} · ${esc(e.planet)}</b> <span>${esc(e.team)} ${esc(e.what)}</span></div><span class="when">${ago(e.created_at)}</span></div>`).join('') : '<span class="muted small">Nothing yet. When teams scan the QR code and start, their steps show up here.</span>'}</div>
    </aside></div>`;
}

function renderSongs(){
  const list = songs.filter(s => s.cls === cls).sort(planetOrder);
  return `<div class="card" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <h2 style="font-size:24px;flex:1">${cls} songs <span class="muted small">(${list.length})</span></h2>
      <label class="btn" for="files">➕ Add MP3s from Files</label><input type="file" id="files" accept="audio/mpeg,.mp3" multiple hidden>
    </div>
    <div class="songs">${list.length ? list.map(s => { const p = PMAP[s.planet] || PLANETS[0];
      return `<div class="card song">${orb(p, 54)}
        <div style="min-width:0"><h3 style="font-size:21px">${esc(s.planet)} · ${esc(s.title || s.team)}</h3>
          <div class="small muted">${esc(s.team)}${s.genre ? ' · ' + esc(GMAP[s.genre]?.name || s.genre) : ''} · ${ago(s.created_at)}${s.local ? ' · from Files' : ''}</div>
          <audio controls preload="none" src="${s.url}"></audio>
          ${s.lyrics ? `<details><summary>Lyrics</summary><div class="lyrics">${esc(s.lyrics)}</div></details>` : ''}</div>
        <div class="acts"><button class="btn sm" data-act="share" data-id="${esc(s.id)}">Save / share</button><button class="btn sm ghost" data-act="del" data-id="${esc(s.id)}">Remove</button></div>
      </div>`; }).join('') : `<div class="card muted">No songs from ${cls} yet. Teams press "Send to teacher" on their Send page.</div>`}</div>`;
}

function latestPerPlanet(c){
  const out = [];
  PLANETS.forEach(p => { const s = songs.filter(x => x.cls === c && x.planet === p.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]; if (s) out.push(s); });
  return out;
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
function renderSuno(){
  const list = latestPerPlanet(cls);
  const genres = [...new Set(list.map(s => s.genre).filter(Boolean))];
  const medleyLyrics = ['[Intro]\nFrom the Sun out to Neptune, here we go!',
    ...list.map(s => { const ly = s.lyrics || ''; const m = ly.match(/\[Chorus[^\]]*\]\n([\s\S]*?)(\n\n|$)/i); const part = (m ? m[1] : ly.split('\n').slice(5, 9).join('\n')).trim(); return part ? `[${s.planet} – ${GMAP[s.genre]?.name || 'Pop'}]\n${part}` : ''; }).filter(Boolean),
    `[Outro]\nEight planets spinning, one solar system! ${cls}!`].join('\n\n');
  const medleyStyle = `genre-shifting kids medley, a new style for each planet (${genres.map(g => GMAP[g]?.name.toLowerCase()).join(', ') || 'pop'}), kids choir and rap, space synths, smooth transitions, polished mix`;
  return `<div class="suno">
    <div class="card">
      <h2 style="font-size:26px">${cls} as one Suno project</h2>
      <p class="muted" style="margin:6px 0 12px">1. Make the class medley MP3: every planet's song in order from the Sun, joined into one file. 2. In Suno, upload it (Create › Upload audio) and use Cover or Remix with the style below, or paste the lyrics into Custom mode.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn primary" data-act="medley" ${list.length ? '' : 'disabled'}>🎛️ Make ${cls} medley MP3 (${list.length} planet${list.length === 1 ? '' : 's'})</button>
        ${medley && medley.cls === cls ? `<button class="btn" data-act="shareMedley">Save / share medley</button>` : ''}</div>
      <div class="progress" id="medProg" hidden style="margin-top:10px"><i></i></div>
      ${medley && medley.cls === cls ? `<audio controls src="${medley.url}" style="width:100%;margin-top:10px"></audio>` : ''}
      ${field('Title', `${cls} Solar System Medley`, 'mt')}${field('Style of music', medleyStyle, 'ms')}${field('Lyrics', medleyLyrics, 'ml')}
    </div>
    ${list.map((s, i) => `<div class="card"><div style="display:flex;gap:10px;align-items:center">${orb(PMAP[s.planet], 36)}<h3 style="font-size:21px">${esc(s.planet)} · ${esc(s.team)}</h3></div>
      ${field('Title', s.title || `The ${s.planet} Song`, 't' + i)}${field('Style of music', `${SUNO_STYLE[s.genre] || 'catchy kids song'}, about the planet ${s.planet}, clear kid-friendly vocals`, 's' + i)}${field('Lyrics', sunoLyrics(s) || '(this team sent no lyrics)', 'l' + i)}</div>`).join('')}
  </div>`;
}

/* ---------- medley ---------- */
async function makeMedley(){
  const list = latestPerPlanet(cls), prog = document.getElementById('medProg'), bar = prog.querySelector('i');
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
// Saving a file: a click on a download link. In the iPad app that opens the share sheet (Save to Files, AirDrop).
async function saveBlob(blobOrUrl, name){
  const blob = typeof blobOrUrl === 'string' ? await fetch(blobOrUrl).then(r => r.blob()) : blobOrUrl;
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

/* ---------- QR ---------- */
function showQR(){
  const url = CONFIG.studioUrl + '?c=' + encodeURIComponent(cls);
  const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
  const o = document.createElement('div'); o.className = 'qr';
  o.innerHTML = `<h2>Scan to make your planet song</h2><div class="cls">${esc(cls)}</div><div class="code"><img alt="QR code" src="${qr.createDataURL(10, 2)}"></div><div style="font-weight:800">${esc(url)}</div><div class="small" style="color:#556">Tap anywhere to close</div>`;
  o.addEventListener('click', () => o.remove()); document.body.appendChild(o);
}

/* ---------- events ---------- */
app.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const v = b.dataset.v;
  switch (b.dataset.act){
    case 'cls': cls = v; setPref('cls', v); render(); break;
    case 'view': view = v; render(); break;
    case 'qr': showQR(); break;
    case 'copy': { const t = document.getElementById(b.dataset.for); try { await navigator.clipboard.writeText(t.value); toast('Copied'); } catch (x){ t.select(); toast('Selected: tap Copy'); } } break;
    case 'share': { const s = songs.find(x => String(x.id) === b.dataset.id); if (s) saveBlob(s.local ? s.blob : s.url, fileBase(s) + '.mp3'); } break;
    case 'del': {
      if (b.dataset.sure !== '1'){ b.dataset.sure = '1'; b.textContent = 'Tap again'; break; }
      const s = songs.find(x => String(x.id) === b.dataset.id); if (!s) break;
      if (s.local) await localDel(s.id); else if (sb){ await sb.from('pss_songs').delete().eq('id', s.id); if (s.file) await sb.storage.from('pss-songs').remove([s.file]); }
      songs = songs.filter(x => x !== s); render();
    } break;
    case 'medley': makeMedley(); break;
    case 'shareMedley': if (medley) saveBlob(medley.blob, `${cls} - Solar System Medley.mp3`); break;
  }
});
app.addEventListener('change', e => { if (e.target.id === 'files' && e.target.files.length) addFiles([...e.target.files]); });
setInterval(() => { if (view === 'live' && !document.querySelector('.banner')) refresh(); }, 30000);

// ?demo shows made-up teams so the screens can be tried before any class has started.
if (/[?&]demo/.test(location.search)){
  const now = Date.now(), ts = (m) => new Date(now - m * 60000).toISOString();
  [['6M', 'Earth', 'Blue Crew', 'rap', 12, 1, 'recorded Voice 1', 2], ['6M', 'Mars', 'Red Rappers', 'trap', 8, 2, 'is recording Voice 2', 1], ['6M', 'Saturn', 'Ring Kings', 'jazz', 4, 0, 'chose Jazz', 6], ['6M', 'Neptune', 'Deep Blue', 'amapiano', 0, 0, 'joined', 9], ['6L', 'Venus', 'Hot Stuff', 'pop', 6, 1, 'made their MP3', 3]]
    .forEach(([c, p, t, g, l, v, last, m]) => { addTeam({ cls: c, planet: p, team: t, info: { genre: g, lyricLines: l, voices: v, last }, updated_at: ts(m) }); events.push({ cls: c, planet: p, team: t, what: last, info: { genre: g }, created_at: ts(m) }); });
  events.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  setTimeout(() => onEvent({ cls: '6M', planet: 'Jupiter', team: 'Storm Squad', what: 'chose Rap', info: { genre: 'rap' }, created_at: new Date().toISOString() }), 2500);
}
loadLocal().then(render).catch(render);
connect();
