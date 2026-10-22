// Planet Song Studio: the team's app. Join (class, planet, team) -> Genre -> Lyrics -> Studio -> Send.

import { CLASSES, PLANETS, PMAP, ORDINAL, GENRES, GMAP, SPACE_PADS, SCALES, chordNotes, STARTERS } from './data.js';
import * as E from './engine.js';
import { loadRhymes, findRhymes, rhymeKey, lineSyllables } from './rhymes.js';
import * as store from './store.js';
import { announce, sendSong, connect, linkStatus } from './link.js';
import { paintBackdrop } from './backdrop.js';

/* ---------- state ---------- */
let P = null;                 // the open project
let screen = 'join', tab = 'genre';
let sel = 'beat';             // selected track id in the Studio
let fromBar = 0;              // where Play starts
const urlClass = (() => { try { const c = new URLSearchParams(location.search).get('c'); return CLASSES.includes(c) ? c : null; } catch (e){ return null; } })();
let draft = { cls: urlClass || store.getPref('cls', null), planet: null, team: '', members: ['', '', ''] };
let lastFocus = null;         // lyrics caret {id, a, b}
let rec = null;               // the recording in progress
let mp3 = null;               // {blob, url, secs}
let saveT = 0, savedAt = null;

const app = document.getElementById('app');
let uid = 0;
const newId = p => (p || 'x') + Date.now().toString(36) + (uid++).toString(36);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const orb = (p, s) => `<span class="orb ${p.id === 'Saturn' ? 'ring' : p.id === 'Uranus' ? 'ring side' : ''}" style="--s:${s}px;--c1:${p.orb[0]};--c2:${p.orb[1]}" aria-hidden="true"></span>`;
function toast(msg, ms = 2000){ const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
const $ = s => document.querySelector(s);

/* ---------- theme ---------- */
function applyTheme(){
  const p = P && PMAP[P.planet];
  const t = p ? p.theme : { bg: '#151b42', bg2: '#0a0d2a', surface: '#1f2757', surface2: '#2a336e', line: '#3b4692', ink: '#f5f3ff', muted: '#b4b9e2', accent: '#ffb547', accent2: '#ff6f91' };
  const r = document.documentElement.style;
  Object.entries(t).forEach(([k, v]) => r.setProperty('--' + k, v));
  document.querySelector('meta[name=theme-color]').content = t.bg;
  paintBackdrop(p ? p.art : 'space');
}

/* ---------- project ---------- */
const INST_TRACKS = { piano: ['Piano', '🎹'], pads: ['Pads', '🥁'], shaker: ['Shaker', '🪇'] };
function newProject(cls, planet, team, members){
  return {
    v: 1, cls, planet, team: team.trim(), members: members.map(m => m.trim()).filter(Boolean),
    genre: null, bpm: 100, bars: 8, loop: true, title: '',
    grid: Array.from({ length: 6 }, () => Array(16).fill(false)),
    tracks: [
      { id: 'beat', type: 'beat', name: 'Beat', vol: .8 },
      { id: newId('t'), type: 'notes', inst: 'piano', sound: 'piano', name: 'Piano', vol: .7, events: [] },
      { id: newId('t'), type: 'notes', inst: 'pads', name: 'Pads', vol: .8, events: [] },
      { id: newId('t'), type: 'notes', inst: 'shaker', name: 'Shaker', vol: .6, events: [] },
      { id: newId('t'), type: 'audio', name: 'Voice 1', vol: 1, takeId: null, offset: 0 }
    ],
    sections: [
      { id: newId('s'), kind: 'verse', label: 'Verse 1', text: '' },
      { id: newId('s'), kind: 'chorus', label: 'Chorus', text: '' },
      { id: newId('s'), kind: 'verse', label: 'Verse 2', text: '' },
      { id: newId('s'), kind: 'repeat', label: 'Chorus again', text: '' },
      { id: newId('s'), kind: 'bridge', label: 'Bridge', text: '' },
      { id: newId('s'), kind: 'repeat', label: 'Chorus again', text: '' }
    ],
    created: Date.now(), updated: Date.now()
  };
}
function save(now){
  if (!P) return;
  clearTimeout(saveT);
  const go = () => { const ok = store.saveProject(P); savedAt = ok ? new Date() : null; paintSaved(); };
  if (now) go(); else { saveT = setTimeout(go, 400); paintSaved(true); }
}
function paintSaved(pending){
  const el = $('#saved'); if (!el) return;
  if (!store.storageOK){ el.className = 'saved-state warn'; el.textContent = 'Not saving on this iPad!'; return; }
  el.className = 'saved-state';
  el.textContent = pending ? 'Saving…' : savedAt ? 'Saved ✓' : 'Autosave on';
}
addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(true); if (rec) stopAll(); } });

async function loadTakes(){
  for (const tr of P.tracks){
    if (tr.type !== 'audio' || !tr.takeId || tr.buffer) continue;
    try { const t = await store.loadTake(tr.takeId); if (t){ tr.buffer = E.makeBuffer(t.pcm, t.sampleRate); tr._peaks = null; } } catch (e) {}
  }
  if (screen === 'studio' && tab === 'studio') drawLanes();
}
const track = id => P.tracks.find(t => t.id === id);
const chorusText = () => (P.sections.find(s => s.kind === 'chorus') || { text: '' }).text;
const secText = s => (s.kind === 'repeat' ? chorusText() : s.text);

function lyricsAsText(){
  const lines = [P.title || `Our ${P.planet} song`, `${P.cls} · ${P.planet} · ${P.team}${P.members.length ? ' (' + P.members.join(', ') + ')' : ''}`, `Genre: ${P.genre ? GMAP[P.genre].name : '—'} · ${P.bpm} BPM`, ''];
  P.sections.forEach(s => { const t = secText(s).trim(); if (t) lines.push('[' + s.label + ']', t, ''); });
  return lines.join('\n');
}

/* ---------- render ---------- */
function render(keepScroll){
  const y = scrollY;
  applyTheme();
  app.innerHTML = screen === 'join' ? renderJoin() : renderStudio();
  if (screen === 'studio'){ paintSaved(); paintLink(); if (tab === 'studio') afterStudioRender(); }
  if (keepScroll) scrollTo(0, y); else scrollTo(0, 0);
}

function renderJoin(){
  const list = store.listProjects();
  return `<div class="join wrap">
    <span class="label">Grade 6 · Planet song project</span>
    <h1>Planet Song Studio</h1>
    <p class="lede">Make your planet's song as a team: pick a style, write rhyming lyrics, build a beat, play the piano, record your voices and send the finished song to your teacher.</p>
    <div class="join-grid">
      <div class="glass card stack" style="gap:20px">
        <div><div class="step-h"><b>1</b><h2>Your class</h2></div>
          <div class="class-pick">${CLASSES.map(c => `<button class="class-btn" data-act="cls" data-v="${c}" aria-pressed="${draft.cls === c}">${c}</button>`).join('')}</div></div>
        <div><div class="step-h"><b>2</b><h2>Your planet</h2></div>
          <div class="planet-pick">${PLANETS.map(p => `<button class="planet-btn" data-act="planet" data-v="${p.id}" aria-pressed="${draft.planet === p.id}">${orb(p, 56)}${p.id}<small>${ORDINAL[p.n - 1]} from the Sun</small></button>`).join('')}</div></div>
        <div class="stack"><div class="step-h"><b>3</b><h2>Your team</h2></div>
          <input type="text" id="team" placeholder="Team name, e.g. The Red Rovers" value="${esc(draft.team)}" maxlength="40" autocomplete="off">
          <div class="stack" id="members" style="gap:8px">${draft.members.map((m, i) => `<input type="text" data-member="${i}" placeholder="Name ${i + 1}" value="${esc(m)}" maxlength="30" autocomplete="off">`).join('')}</div>
          <button class="btn ghost sm" data-act="addMember" style="align-self:flex-start">+ Add a name</button>
          <p id="joinErr" class="small" style="color:var(--rec);margin:0" hidden></p>
          <button class="btn primary" data-act="start" style="min-height:60px;font-size:21px">🚀 Start our song</button>
        </div>
      </div>
      <div class="stack">
        ${list.length ? `<div class="glass card stack"><h2 style="font-size:24px">Carry on</h2><p class="small muted" style="margin:0">Songs saved on this iPad.</p>
          ${list.map(x => PMAP[x.planet] ? `<button class="saved" data-act="open" data-key="${esc(x.key)}">${orb(PMAP[x.planet], 42)}<span><b>${esc(x.team)}</b><span class="small muted">${esc(x.cls)} · ${esc(x.planet)} · ${new Date(x.updated).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span></span></button>` : '').join('')}</div>` : ''}
        <div class="glass card stack small"><h3 style="font-size:20px">Tips</h3>
          <span>🎧 Headphones make your voice recordings much clearer.</span>
          <span>🔊 Turn the iPad volume up.</span>
          <span>💾 Your song saves on this iPad as you work.</span></div>
      </div>
    </div></div>`;
}

function renderStudio(){
  const p = PMAP[P.planet];
  const tabs = [['genre', 'Genre'], ['lyrics', 'Lyrics'], ['studio', 'Studio'], ['send', 'Send']];
  const body = tab === 'genre' ? renderGenre() : tab === 'lyrics' ? renderLyrics() : tab === 'studio' ? renderStudioTab() : renderSend();
  return `<header class="top"><div class="wrap">
      <div class="head-row">
        <div class="team">${orb(p, 46)}<div style="min-width:0"><h2>${esc(P.team)}</h2><div class="who">${esc(P.planet)}${P.members.length ? ' · ' + esc(P.members.join(', ')) : ''}</div></div><span class="class-tag">${esc(P.cls)}</span></div>
        <span id="link" class="link-dot"><i></i><span></span></span>
        <span id="saved" class="saved-state" aria-live="polite"></span>
        <button class="btn ghost sm" data-act="home">Switch team</button>
      </div>
      <nav class="tabs" role="tablist">${tabs.map(([id, n], i) => `<button class="tab" role="tab" data-act="tab" data-v="${id}" aria-selected="${tab === id}"><span class="n">${i + 1}</span>${n}</button>`).join('')}</nav>
    </div></header>
    <main class="panel wrap">${body}</main>`;
}
function paintLink(){
  const el = $('#link'); if (!el) return;
  const on = linkStatus() === 'online';
  el.className = 'link-dot' + (on ? ' on' : '');
  el.querySelector('span').textContent = on ? "Teacher's iPad connected" : 'Working on this iPad';
}

/* ---------- genre ---------- */
function renderGenre(){
  return `<div class="panel-title"><h2>Pick a style for ${esc(P.planet)}</h2><span class="muted">Tap ▶ to hear a beat. Is your planet fiery, icy, giant or speedy?</span></div>
    <div class="genre-grid">${GENRES.map(g => `<div class="genre" role="button" tabindex="0" data-act="genre" data-v="${g.id}" aria-pressed="${P.genre === g.id}">
      <span class="bpm">${g.bpm} BPM</span><b>${g.name}</b><p>${g.tip}</p>
      <button class="listen" data-act="listen" data-v="${g.id}" aria-label="Listen to ${g.name}">▶</button></div>`).join('')}</div>
    ${P.genre ? `<div class="glass card row" style="margin-top:18px"><span style="flex:1"><b>${GMAP[P.genre].name}</b> it is! Next, write your lyrics.</span><button class="btn primary" data-act="tab" data-v="lyrics">Lyrics →</button></div>` : ''}`;
}
let listening = null;
async function listen(id){
  E.stop();
  if (listening === id){ listening = null; paintListen(); return; }
  listening = id; paintListen();
  const g = GMAP[id];
  await E.loadGenre(id);
  if (listening !== id) return;
  const demo = { genre: id, bpm: g.bpm, bars: 2, loop: false, grid: g.beat.map(r => [...r].map(c => c === 'x')), tracks: [{ id: 'demo', type: 'beat', vol: .9 }] };
  E.play(demo, { onEnd: () => { listening = null; paintListen(); } });
}
function paintListen(){ document.querySelectorAll('.listen').forEach(b => { b.textContent = b.dataset.v === listening ? '■' : '▶'; }); }
async function chooseGenre(id){
  const g = GMAP[id]; const first = !P.genre;
  P.genre = id; P.bpm = g.bpm;
  if (P.grid.every(r => r.every(x => !x)) || first) P.grid = g.beat.map(r => [...r].map(c => c === 'x'));
  save(); render(true);
  E.loadGenre(id);
  announce(P, `chose ${g.name}`);
}

/* ---------- lyrics ---------- */
function renderLyrics(){
  const p = PMAP[P.planet], rap = P.genre === 'rap' || P.genre === 'trap';
  return `<div class="panel-title"><h2>Write your lyrics</h2><span class="muted">Tap a word on the left to add it where you are typing.</span></div>
  <div class="lyrics-grid">
    <aside class="helper">
      <div class="glass card">
        <h3>Rhyme finder</h3>
        <form class="rhyme-form" id="rhymeForm"><input type="text" id="rhymeWord" placeholder="Type a word, e.g. planet" autocomplete="off" autocapitalize="none" enterkeyhint="search"><button class="btn primary sm" type="submit">Find</button></form>
        <div class="rhymes" id="rhymeOut"><span class="small muted">Tap "Rhymes" next to a line to find rhymes for its last word.</span></div>
      </div>
      ${rap ? `<div class="glass card stack small"><h3>Rap tips</h3>
        <div class="tipbox">Each line should fit one bar of the beat: about <b>8 to 12 syllables</b>. The number next to each line counts them.</div>
        <span>Rhyme the end of each pair of lines, and try rhyming inside a line too.</span>
        <span>Split a word for a cool rhyme: "plan-et" can rhyme with "can get".</span></div>` : ''}
      <div class="glass card"><h3>${esc(P.planet)} words</h3><div class="chips">${p.words.map(w => `<button class="chip" data-act="ins" data-v="${esc(w)}">${esc(w)}</button>`).join('')}</div></div>
      <div class="glass card"><h3>${esc(P.planet)} facts</h3><ul style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:15px">${p.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
      <div class="glass card"><h3>Line starters</h3><div class="stack" style="gap:8px">${STARTERS.map(s => { const t = s.replace('{n}', ORDINAL[p.n - 1]); return `<button class="starter" data-act="insLine" data-v="${esc(t)}">${esc(t)}</button>`; }).join('')}</div></div>
    </aside>
    <div class="stack">
      ${P.sections.map((s, i) => renderSection(s, i)).join('')}
      <div class="row">${[['verse', '+ Verse'], ['chorus', '+ Chorus'], ['repeat', '+ Chorus again'], ['rap', '+ Rap'], ['bridge', '+ Bridge'], ['intro', '+ Intro / Outro']].map(([k, n]) => `<button class="btn sm" data-act="addSec" data-v="${k}">${n}</button>`).join('')}</div>
    </div>
  </div>`;
}
function renderSection(s, i){
  const hook = s.kind === 'chorus' || s.kind === 'repeat';
  const head = `<div class="sec-head"><span class="kind ${hook ? 'hook' : ''}">${s.kind === 'repeat' ? 'repeat' : s.kind}</span>
    <input type="text" data-lab="${s.id}" value="${esc(s.label)}" aria-label="Part name" maxlength="30">
    <button class="icon-btn" data-act="secUp" data-v="${s.id}" aria-label="Move up" ${i ? '' : 'disabled'}>↑</button>
    <button class="icon-btn" data-act="secDown" data-v="${s.id}" aria-label="Move down" ${i < P.sections.length - 1 ? '' : 'disabled'}>↓</button>
    <button class="icon-btn" data-act="secDel" data-v="${s.id}" aria-label="Remove part">✕</button></div>`;
  if (s.kind === 'repeat') return `<div class="glass section" data-sec="${s.id}">${head}<div class="repeat-text">${esc(chorusText()) || 'Your chorus will come back here.'}</div></div>`;
  const ph = { verse: "Tell part of your planet's story…", chorus: "The catchy part everyone sings. Use your planet's name!", bridge: 'Something different: a fun fact or a twist…', rap: 'Fast rhyming lines, one bar each…', intro: 'A short opening or ending…' }[s.kind] || '';
  return `<div class="glass section" data-sec="${s.id}">${head}
    <textarea data-txt="${s.id}" rows="${Math.max(4, s.text.split('\n').length + 1)}" placeholder="${ph}">${esc(s.text)}</textarea>
    <div class="lines" id="li_${s.id}">${lineInfo(s.text)}</div></div>`;
}
const PAIR = ['#ffb547', '#ff6f91', '#5fe0a8', '#b98cff', '#62b6ff', '#ffe680'];
function lineInfo(text){
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) return '';
  const ends = lines.map(l => (l.match(/([A-Za-z']+)[^A-Za-z']*$/) || [, ''])[1]);
  const keys = ends.map(rhymeKey), count = {}, col = {}; let ci = 0;
  keys.forEach(k => k && (count[k] = (count[k] || 0) + 1));
  return lines.map((l, i) => {
    const k = keys[i], c = count[k] > 1 ? (col[k] ||= PAIR[ci++ % PAIR.length]) : null;
    const n = lineSyllables(l);
    return `<div class="line-info"><span class="syl" title="syllables">${n}</span>${ends[i] ? `<span class="endw" ${c ? `style="border-color:${c};color:${c}"` : ''}>${esc(ends[i])}</span><button class="chip" style="min-height:32px;padding:2px 12px;font-size:13px" data-act="rhymeFor" data-v="${esc(ends[i])}">Rhymes</button>` : ''}</div>`;
  }).join('');
}
async function showRhymes(word){
  const out = $('#rhymeOut'); if (!out) return;
  out.innerHTML = '<span class="small muted">Looking…</span>';
  await loadRhymes();
  const r = findRhymes(word);
  if (!r.word){ out.innerHTML = ''; return; }
  let h = `<span class="small muted"><b>${esc(r.word)}</b> has ${r.syl} syllable${r.syl === 1 ? '' : 's'}.</span>`;
  if (r.perfect.length) h += `<span class="label">Rhymes</span><div class="chips">${r.perfect.map(w => `<button class="chip" data-act="ins" data-v="${esc(w)}">${esc(w)}</button>`).join('')}</div>`;
  if (r.near.length) h += `<span class="label">Almost rhymes</span><div class="chips">${r.near.map(w => `<button class="chip" style="border-style:dashed" data-act="ins" data-v="${esc(w)}">${esc(w)}</button>`).join('')}</div>`;
  if (!r.perfect.length && !r.near.length) h += `<span class="small muted">No rhymes found. Try a different word that means the same thing.</span>`;
  out.innerHTML = h;
}
function insertText(text, asLine){
  let id = lastFocus && lastFocus.id, ta = id && document.querySelector(`[data-txt="${id}"]`);
  if (!ta){ const s = P.sections.find(x => x.kind !== 'repeat'); if (!s) return; id = s.id; ta = document.querySelector(`[data-txt="${id}"]`); lastFocus = { id, a: ta.value.length, b: ta.value.length }; }
  const v = ta.value, a = lastFocus.a ?? v.length, b = lastFocus.b ?? a;
  let ins = text;
  if (asLine) ins = (a > 0 && v[a - 1] !== '\n' ? '\n' : '') + text;
  else { if (a > 0 && !/\s/.test(v[a - 1])) ins = ' ' + ins; ins += ' '; }
  ta.value = v.slice(0, a) + ins + v.slice(b);
  let pos = a + ins.length;
  onLyric(ta); ta.focus({ preventScroll: true });
  if (asLine && ins.includes('___')){ const i = ta.value.indexOf('___', a); ta.setSelectionRange(i, i + 3); lastFocus = { id, a: i, b: i + 3 }; }
  else { ta.setSelectionRange(pos, pos); lastFocus = { id, a: pos, b: pos }; }
}
function onLyric(ta){
  const s = P.sections.find(x => x.id === ta.dataset.txt); if (!s) return;
  s.text = ta.value;
  const rows = Math.max(4, ta.value.split('\n').length + 1); if (ta.rows < rows) ta.rows = rows;
  const li = $('#li_' + s.id); if (li) li.innerHTML = lineInfo(s.text);
  if (s.kind === 'chorus') document.querySelectorAll('.repeat-text').forEach(r => r.textContent = chorusText() || 'Your chorus will come back here.');
  save();
}

/* ---------- studio ---------- */
const ICON = { beat: '🥁', piano: '🎹', pads: '🟪', shaker: '🪇', audio: '🎤' };
const SOUNDS = [['piano', 'Piano'], ['synth', 'Space synth'], ['bass', 'Bass']];
function renderStudioTab(){
  if (!P.genre) return `<div class="glass card row"><span style="flex:1">Pick a music style first, so the studio can load the right sounds.</span><button class="btn primary" data-act="tab" data-v="genre">Choose a genre</button></div>`;
  const g = GMAP[P.genre], t = track(sel) || P.tracks[0]; sel = t.id;
  return `<div class="glass transport ${rec ? 'recording' : ''}">
      <button class="btn primary play" data-act="play">${E.isPlaying() && !rec ? '■ Stop' : '▶ Play'}</button>
      <button class="btn rec recb" data-act="record">${rec ? '■ Stop' : '● Record'}</button>
      <span class="pos" id="pos">Bar ${fromBar + 1}</span>
      <button class="btn sm" data-act="metro" aria-pressed="${!!P.metronome}">Click</button>
      <button class="btn sm" data-act="loop" aria-pressed="${P.loop}">Loop</button>
      <span class="stepper" aria-label="Speed"><button data-act="bpm" data-v="-2" aria-label="Slower">−</button><b>${P.bpm} BPM</b><button data-act="bpm" data-v="2" aria-label="Faster">+</button></span>
      <span class="stepper" aria-label="Song length"><button data-act="bars" data-v="-4" aria-label="Shorter">−</button><b>${P.bars} bars</b><button data-act="bars" data-v="4" aria-label="Longer">+</button></span>
    </div>
    <div class="glass lanes">
      <div class="ruler"><span class="label" style="align-self:end">Tracks · ${g.name}</span><div class="ruler-bars">${Array.from({ length: P.bars }, (_, i) => `<button data-act="from" data-v="${i}" class="${i === fromBar ? 'from' : ''}" aria-label="Start at bar ${i + 1}">${i + 1}</button>`).join('')}</div></div>
      ${P.tracks.map(tr => `<div class="lane" aria-selected="${tr.id === sel}" data-lane="${tr.id}">
        <div class="lane-head">
          <button class="lane-name" data-act="sel" data-v="${tr.id}"><span class="lane-icon">${ICON[tr.type === 'notes' ? tr.inst : tr.type]}</span><span>${esc(tr.name)}</span></button>
          <button class="mute" data-act="mute" data-v="${tr.id}" aria-pressed="${!!tr.mute}" aria-label="Mute ${esc(tr.name)}">M</button>
          <input type="range" min="0" max="100" value="${Math.round((tr.vol ?? .8) * 100)}" data-vol="${tr.id}" aria-label="${esc(tr.name)} volume">
        </div>
        <div class="lane-track" data-act="sel" data-v="${tr.id}"><canvas data-canvas="${tr.id}"></canvas><i class="playhead"></i></div>
      </div>`).join('')}
      <div class="row" style="padding:8px 6px 2px"><button class="btn sm" data-act="addVoice" ${P.tracks.filter(x => x.type === 'audio').length >= 4 ? 'disabled' : ''}>+ Voice track</button>
        <button class="btn sm ghost" data-act="addInst" data-v="piano">+ Piano track</button>
        <span class="small muted">Tap a track, then play its instrument below. Press Record to record onto it.</span></div>
    </div>
    <div class="glass dock" id="dock">${renderDock(t)}</div>`;
}
function renderDock(t){
  const g = GMAP[P.genre];
  const head = (title, extra = '') => `<div class="dock-head"><h3>${title}</h3>${extra}</div>`;
  if (t.type === 'beat'){
    const cols = ['#ffb547', '#ff6f91', '#5fe0a8', '#b98cff', '#62b6ff', '#ffe680'];
    return head(`Beat maker <span class="muted small">(${g.name})</span>`, `<button class="btn sm" data-act="starter">Load ${g.name} beat</button><button class="btn sm ghost" data-act="clearBeat">Clear</button>`) +
      `<div class="grid-scroll"><div class="seq">${P.grid.map((row, r) => `<button class="rowname" style="color:${cols[r]}" data-hit="pad" data-k="${r}">${esc(g.pads[r][0])}</button>${row.map((on, s) => `<button class="cell ${on ? 'on' : ''} ${s % 4 === 0 ? 'q' : ''}" style="--c:${cols[r]}" data-cell="${r}" data-s="${s}" aria-pressed="${on}" aria-label="${esc(g.pads[r][0])} step ${s + 1}"></button>`).join('')}`).join('')}</div></div>
      <p class="small muted" style="margin:10px 0 0">The beat repeats every bar for the whole song. Tap a sound's name to hear it.</p>`;
  }
  if (t.type === 'notes' && t.inst === 'pads'){
    const cols = ['#ffb547', '#ff6f91', '#5fe0a8', '#b98cff', '#62b6ff', '#ffe680', '#ff9b6a', '#7fd3ff'];
    return head(`Pads <span class="muted small">(${g.name} + space sounds)</span>`, undoBtn(t)) +
      `<div class="pads">${g.pads.map((p, i) => `<button class="pad" style="--c:${cols[i]}" data-hit="pad" data-k="${i}">${esc(p[0])}</button>`).join('')}
       ${SPACE_PADS.map((p, i) => `<button class="pad" style="--c:#9aa8ff" data-hit="pad" data-k="${i + 8}">🚀 ${esc(p[0])}</button>`).join('')}</div>`;
  }
  if (t.type === 'notes' && t.inst === 'shaker'){
    return head('Shaker', undoBtn(t)) + `<div class="shaker"><button class="shake-pad" data-hit="shaker">Tap to shake</button>
      <div class="stack"><button class="btn" data-act="motion" aria-pressed="${!!motionOn}">📳 Shake the iPad</button>
      <p class="small muted" style="margin:0">Turn this on, then shake the iPad like a real shaker. Press Record first to record your shakes into the song.</p></div></div>`;
  }
  if (t.type === 'notes'){
    const [root, scale] = g.key, sc = SCALES[scale].map(i => (root + i) % 12);
    const lo = 48 + (t.oct || 0) * 12;
    const keys = []; let wi = 0;
    for (let m = lo; m < lo + 25; m++){ const black = [1, 3, 6, 8, 10].includes(m % 12); keys.push({ m, black, wi: black ? wi : wi++ }); }
    const W = 100 / wi;
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return head(`${esc(t.name)}`, `${SOUNDS.map(([k, n]) => `<button class="btn sm" data-act="sound" data-v="${k}" aria-pressed="${(t.sound || 'piano') === k}">${n}</button>`).join('')}
        <span class="stepper"><button data-act="oct" data-v="-1" aria-label="Lower">−</button><b>Octave ${(t.oct || 0) + 3}</b><button data-act="oct" data-v="1" aria-label="Higher">+</button></span>${undoBtn(t)}`) +
      `<div class="row" style="margin-bottom:10px"><span class="label">Chords in ${g.name}</span>${g.prog.map(c => `<button class="chip" data-hit="chord" data-v="${c}">${c}</button>`).join('')}<span class="small muted">Glowing keys sound good in this style.</span></div>
       <div class="piano">${keys.map(k => `<button class="key ${k.black ? 'b' : 'w'} ${sc.includes(k.m % 12) ? 'scale' : ''}" data-hit="note" data-k="${k.m}" style="left:${k.black ? (k.wi - .32) * W : k.wi * W}%;width:${k.black ? W * .64 : W}%">${k.black ? '' : names[k.m % 12] + (k.m % 12 === 0 ? Math.floor(k.m / 12) - 1 : '')}</button>`).join('')}</div>`;
  }
  // voice
  const lyr = P.sections.map(s => { const x = secText(s).trim(); return x ? `<h4>${esc(s.label)}</h4>${esc(x)}` : ''; }).join('');
  return head(`${esc(t.name)}`, t.takeId ? `<button class="btn sm" data-act="nudge" data-v="-0.02">◀ Earlier</button><button class="btn sm" data-act="nudge" data-v="0.02">Later ▶</button><button class="btn sm ghost" data-act="delTake">Delete recording</button>` : '') +
    `<div class="voice"><div class="stack">
      ${E.recordingSupported() ? `<button class="big-rec" data-act="record">${rec ? '■ Stop' : '● Record ' + esc(t.name)}<small>${t.takeId ? 'Records over this take' : 'One bar of clicks, then sing or rap'}</small></button>
      <div class="meter" aria-hidden="true"><i id="meter"></i></div>
      <p class="small muted" style="margin:0">${t.takeId ? 'This track has a recording. Use Earlier / Later if your voice is out of time.' : 'Your voice records from the bar you picked on the ruler. Headphones stop the beat leaking into the recording.'}</p>`
      : `<div class="tipbox">Recording needs the studio to be opened from its proper web address (https). Ask your teacher for the QR code.</div>`}
    </div><div class="prompter" id="prompter">${lyr || '<span class="muted">Your lyrics show here while you record. Write them on the Lyrics tab.</span>'}</div></div>`;
}
function undoBtn(t){ return t._undo ? `<button class="btn sm ghost" data-act="undo">↶ Undo recording</button>` : (t.events && t.events.length ? `<button class="btn sm ghost" data-act="clearTrack">Clear track</button>` : ''); }

function afterStudioRender(){ drawLanes(); paintPlayhead(-1); }
function drawLanes(){
  if (!P) return;
  const steps = P.bars * 16;
  P.tracks.forEach(tr => {
    const cv = document.querySelector(`[data-canvas="${tr.id}"]`); if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ffb547';
    c.strokeStyle = '#ffffff18'; c.lineWidth = 1;
    for (let b = 1; b < P.bars; b++){ const x = b / P.bars * w; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    c.globalAlpha = tr.mute ? .3 : 1;
    if (tr.type === 'beat'){
      c.fillStyle = acc;
      for (let s = 0; s < steps; s++){ const n = P.grid.reduce((a, r) => a + (r[s % 16] ? 1 : 0), 0); if (n){ const bh = Math.min(h - 8, 6 + n * 6); c.fillRect(s / steps * w, (h - bh) / 2, Math.max(1.5, w / steps - 1), bh); } }
    } else if (tr.type === 'notes'){
      c.fillStyle = acc;
      tr.events.forEach(ev => {
        const x = ev.s / steps * w;
        const y = tr.inst === 'piano' || !tr.inst || tr.inst === 'notes' ? h - 6 - ((ev.k - 36) / 48) * (h - 12) : tr.inst === 'pads' ? 6 + (ev.k % 16) / 16 * (h - 12) : h / 2;
        const ww = tr.inst === 'piano' ? Math.max(3, (ev.d || 1) / steps * w) : 4;
        c.fillRect(x, y - 2, ww, 5);
      });
    } else if (tr.type === 'audio' && tr.buffer){
      if (!tr._peaks){
        const d = tr.buffer.getChannelData(0), n = 600, per = Math.max(1, Math.floor(d.length / n)), pk = [];
        for (let i = 0; i < n; i++){ let m = 0; for (let j = i * per; j < (i + 1) * per && j < d.length; j += 16) m = Math.max(m, Math.abs(d[j])); pk.push(m); }
        tr._peaks = pk;
      }
      const songSec = steps * 60 / P.bpm / 4, x0 = (-(tr.offset || 0)) / songSec * w, ww = tr.buffer.duration / songSec * w;
      c.fillStyle = acc;
      tr._peaks.forEach((m, i) => { const x = x0 + i / tr._peaks.length * ww, bh = Math.max(1, m * (h - 6)); if (x >= 0 && x <= w) c.fillRect(x, (h - bh) / 2, Math.max(1, ww / tr._peaks.length), bh); });
    } else if (tr.type === 'audio'){
      c.fillStyle = '#ffffff55'; c.font = '700 13px Nunito, sans-serif'; c.fillText('No recording yet', 10, h / 2 + 5);
    }
  });
}
function paintPlayhead(s){
  const steps = P.bars * 16;
  document.querySelectorAll('.playhead').forEach(el => { el.style.transform = s < 0 ? 'translateX(-10px)' : `translateX(${s / steps * el.parentElement.clientWidth}px)`; });
  const pos = $('#pos'); if (pos) pos.textContent = s < 0 ? `Bar ${fromBar + 1}` : `Bar ${Math.floor(s / 16) + 1} · ${Math.floor(s % 16 / 4) + 1}`;
  document.querySelectorAll('.cell.now').forEach(c => c.classList.remove('now'));
  if (s >= 0) document.querySelectorAll(`.cell[data-s="${s % 16}"]`).forEach(c => c.classList.add('now'));
}

/* playing and recording */
function playToggle(){
  if (rec){ stopAll(); return; }
  if (E.isPlaying()){ E.stop(); paintTransport(); return; }
  E.play(P, { from: fromBar * 16, metronome: !!P.metronome, onStep: paintPlayhead, onEnd: paintTransport });
  paintTransport();
}
function paintTransport(){
  const pb = document.querySelector('[data-act=play].play'); if (pb) pb.textContent = E.isPlaying() && !rec ? '■ Stop' : '▶ Play';
  document.querySelectorAll('[data-act=record]').forEach(b => { if (b.classList.contains('big-rec')) b.firstChild.textContent = rec ? '■ Stop' : '● Record ' + (track(sel) || {}).name; else b.textContent = rec ? '■ Stop' : '● Record'; });
  const tp = document.querySelector('.transport'); if (tp) tp.classList.toggle('recording', !!rec);
}
let confirmReplace = null;
async function recordToggle(){
  if (rec){ stopAll(); return; }
  const t = track(sel);
  if (t.type === 'beat'){ toast('Tap the Piano, Pads, Shaker or a Voice track first, then press Record.'); return; }
  E.stop();
  const from = fromBar * 16;
  if (t.type === 'audio'){
    if (t.takeId && confirmReplace !== t.id){ confirmReplace = t.id; toast(`Press Record again to record over ${t.name}`); setTimeout(() => { confirmReplace = null; }, 4000); return; }
    confirmReplace = null;
    try { await E.openMic(); } catch (e){ toast('The microphone is blocked. Allow the microphone for this website in Settings › Safari.', 4000); return; }
  } else t._undo = JSON.parse(JSON.stringify(t.events));
  rec = { track: t.id, type: t.type, from };
  const wasBuffer = t.type === 'audio' ? t.buffer : null;
  if (t.type === 'audio') t.buffer = null;      // the old take stays quiet while recording over it
  const startTime = E.play(P, { from, countIn: true, record: true, metronome: true, onStep: paintPlayhead, onEnd: () => { if (rec) stopAll(); } });
  countIn(startTime - E.now() + from * E.stepDur());
  paintTransport(); meterLoop();
  if (t.type === 'audio'){
    const barStart = startTime + from * E.stepDur();
    E.startRecording(barStart).then(async ({ pcm, sampleRate }) => {
      if (pcm.length < sampleRate * .3){ t.buffer = wasBuffer; toast('That recording was too short.'); drawLanes(); return; }
      const old = t.takeId, id = newId('take');
      t.buffer = E.makeBuffer(pcm, sampleRate); t._peaks = null; t.takeId = id; t.offset = -from * E.stepDur();
      try { await store.saveTake(id, pcm, sampleRate); if (old) store.deleteTake(old); } catch (e){ toast('Could not save the recording on this iPad.'); }
      save(); if (tab === 'studio') { $('#dock').innerHTML = renderDock(track(sel)); drawLanes(); }
      announce(P, `recorded ${t.name}`);
      toast(`${t.name} recorded!`);
    });
  }
  announce(P, `is recording ${t.name}`);
}
function stopAll(){
  const r = rec; rec = null;
  if (r && r.type === 'audio') E.stopRecording();
  E.stop();
  if (r && r.type !== 'audio'){ save(); if (tab === 'studio'){ $('#dock').innerHTML = renderDock(track(sel)); } }
  paintTransport(); if (tab === 'studio') drawLanes();
}
function countIn(secs){
  const sd = E.stepDur(), el = document.createElement('div'); el.className = 'count-in';
  document.body.appendChild(el);
  const t0 = secs - 16 * sd;
  [4, 3, 2, 1].forEach((n, i) => setTimeout(() => { el.textContent = n; }, Math.max(0, (t0 + i * 4 * sd) * 1000)));
  setTimeout(() => el.remove(), Math.max(0, secs * 1000));
}
function meterLoop(){
  const m = $('#meter');
  if (m) m.style.width = Math.min(100, E.micLevel() * 160) + '%';
  if (rec) requestAnimationFrame(meterLoop); else if (m) m.style.width = '0';
}

/* hitting instruments */
const held = new Map();     // pointerId -> {ev, track}
function hit(kind, k, t, el){
  E.audio();
  const tr = t || track(sel);
  const ac = E.audio(), dest = E.trackGain(tr), at = ac.currentTime;
  let ev = null;
  if (kind === 'pad'){
    if (tr.type === 'beat'){ const url = GMAP[P.genre].pads[k][1]; E.playSample(ac, dest, url, at); return null; }
    ev = { k: +k, v: 1 };
    E.playEvent(ac, dest, tr, ev, at, P.genre);
  } else if (kind === 'shaker'){ ev = { k: 0, v: .8 }; E.playShaker(ac, dest, at, .8); }
  else if (kind === 'note'){ ev = { k: +k, v: .85, d: 2 }; E.playNote(ac, dest, +k, at, .35, tr.sound || 'piano', .85); }
  if (el){ el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 140); }
  if (ev && rec && rec.track === tr.id){
    let s = E.songPos();
    if (s < 0) return null;
    s = Math.round(s * 2) / 2;                      // snap to the nearest half step so it sounds tight
    if (s >= P.bars * 16) return null;
    ev.s = s; tr.events.push(ev); tr.events.sort((a, b) => a.s - b.s);
    return ev;
  }
  return null;
}
function chord(name){
  const tr = track(sel); const ac = E.audio(), dest = E.trackGain(tr), at = ac.currentTime;
  chordNotes(name).map(m => m + (tr.oct || 0) * 12).forEach(m => {
    E.playNote(ac, dest, m, at, .8, tr.sound || 'piano', .55);
    if (rec && rec.track === tr.id){ let s = E.songPos(); if (s >= 0 && s < P.bars * 16){ s = Math.round(s * 2) / 2; tr.events.push({ s, k: m, v: .55, d: 4 }); } }
  });
  tr.events.sort((a, b) => a.s - b.s);
}
let motionOn = false, lastShake = 0;
async function toggleMotion(){
  if (motionOn){ motionOn = false; removeEventListener('devicemotion', onMotion); $('#dock').innerHTML = renderDock(track(sel)); return; }
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission){ const r = await DeviceMotionEvent.requestPermission(); if (r !== 'granted') throw 0; }
    motionOn = true; addEventListener('devicemotion', onMotion);
    toast('Shake the iPad!');
  } catch (e){ toast('Motion is blocked on this iPad. Tap the shaker instead.'); }
  $('#dock').innerHTML = renderDock(track(sel));
}
function onMotion(e){
  const a = e.acceleration || e.accelerationIncludingGravity; if (!a) return;
  const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0), now = performance.now();
  if (mag > 14 && now - lastShake > 110){
    lastShake = now;
    const tr = P.tracks.find(t => t.inst === 'shaker'); if (!tr) return;
    hit('shaker', 0, tr, document.querySelector('.shake-pad'));
  }
}

/* ---------- send ---------- */
function renderSend(){
  const online = linkStatus() === 'online';
  return `<div class="panel-title"><h2>Finish and send</h2><span class="muted">Make your song into an MP3 and send it to your teacher.</span></div>
  <div class="send-grid">
    <div class="glass card stack">
      <label class="label" for="title">Song title</label>
      <input type="text" id="title" value="${esc(P.title)}" placeholder="Name your song…" maxlength="60" style="font-family:var(--display);font-size:24px">
      <button class="btn primary" data-act="makeMp3" style="min-height:56px">🎛️ Make our MP3</button>
      <div class="progress" id="mp3prog" hidden><i></i></div>
      <div id="mp3out">${mp3 ? mp3Box() : '<p class="small muted" style="margin:0">This mixes your beat, instruments and voices into one song file.</p>'}</div>
    </div>
    <div class="glass card stack">
      <h3 style="font-size:22px">Send to your teacher</h3>
      <p class="small muted" style="margin:0">${online ? "Your teacher's iPad is connected. Sending gives them your MP3 and lyrics." : "Your teacher's iPad isn't connected right now. You can still save the MP3 on this iPad and send it another way."}</p>
      <button class="btn rec" data-act="send" ${mp3 && online ? '' : 'disabled'} style="min-height:56px">📤 Send to teacher</button>
      <a class="btn" id="saveMp3" ${mp3 ? `href="${mp3.url}" download="${esc(fileName())}"` : 'aria-disabled="true" style="opacity:.4;pointer-events:none"'}>💾 Save MP3 on this iPad</a>
      <details><summary class="small" style="min-height:44px;display:flex;align-items:center;font-weight:800">Our lyrics as text</summary><textarea readonly rows="10" style="font-size:14px">${esc(lyricsAsText())}</textarea></details>
    </div>
  </div>`;
}
const fileName = () => `${P.cls}-${P.planet}-${P.team}`.replace(/[^\w-]+/g, '_') + '.mp3';
function mp3Box(){ return `<audio controls src="${mp3.url}"></audio><p class="small muted" style="margin:0">${Math.round(mp3.secs)} seconds · ${(mp3.blob.size / 1048576).toFixed(1)} MB</p>`; }
async function makeMp3(){
  E.stop();
  const prog = $('#mp3prog'), bar = prog.querySelector('i'); prog.hidden = false; bar.style.width = '5%';
  try {
    await E.loadGenre(P.genre);
    const pcm = await E.renderSong(P); bar.style.width = '30%';
    const blob = await E.encodeMp3(pcm, f => { bar.style.width = (30 + f * 70) + '%'; });
    if (mp3) URL.revokeObjectURL(mp3.url);
    mp3 = { blob, url: URL.createObjectURL(blob), secs: pcm.length / 44100 };
    render(true); toast('Your MP3 is ready!');
    announce(P, 'made their MP3');
  } catch (e){ console.error(e); toast('Could not make the MP3. Try again.'); prog.hidden = true; }
}
async function send(){
  const b = document.querySelector('[data-act=send]'); b.disabled = true; b.textContent = 'Sending…';
  const ok = await sendSong(P, mp3.blob, lyricsAsText()).catch(() => false);
  b.textContent = ok ? '✓ Sent!' : '📤 Send to teacher'; b.disabled = !!ok;
  toast(ok ? 'Sent to your teacher!' : 'Could not send. Check the wifi and try again.');
}

/* ---------- opening ---------- */
async function openProject(p){
  P = p; screen = 'studio';
  P.tracks.forEach(t => { if (t.type === 'notes') t.events ||= []; });
  tab = !P.genre ? 'genre' : P.sections.some(s => s.text.trim()) ? 'studio' : 'lyrics';
  sel = 'beat'; fromBar = 0; mp3 = null;
  save(true); render();
  loadRhymes(); if (P.genre) E.loadGenre(P.genre);
  loadTakes();
  connect().then(paintLink);
}
function start(){
  const err = $('#joinErr');
  const team = draft.team.trim();
  const msg = !draft.cls ? 'Tap your class.' : !draft.planet ? 'Tap your planet.' : !team ? 'Type your team name.' : '';
  if (msg){ err.hidden = false; err.textContent = msg; return; }
  store.setPref('cls', draft.cls);
  E.audio();
  const existing = store.loadProject(store.projectKey(draft.cls, draft.planet, team));
  const names = draft.members.map(m => m.trim()).filter(Boolean);
  const p = existing || newProject(draft.cls, draft.planet, team, draft.members);
  if (existing && names.length) p.members = names;
  openProject(p);
  announce(p, existing ? 'is back' : 'joined');
}

/* ---------- events ---------- */
app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const v = b.dataset.v;
  switch (b.dataset.act){
    case 'cls': draft.cls = v; document.querySelectorAll('.class-btn').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === v)); break;
    case 'planet': draft.planet = v; document.querySelectorAll('.planet-btn').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === v)); break;
    case 'addMember': { draft.members.push(''); const i = draft.members.length - 1; $('#members').insertAdjacentHTML('beforeend', `<input type="text" data-member="${i}" placeholder="Name ${i + 1}" maxlength="30" autocomplete="off">`); document.querySelector(`[data-member="${i}"]`).focus(); } break;
    case 'start': start(); break;
    case 'open': { const p = store.loadProject(b.dataset.key); if (p) openProject(p); else toast('Could not open that song.'); } break;
    case 'home': stopAll(); E.closeMic(); save(true); P = null; screen = 'join'; draft = { cls: urlClass || store.getPref('cls', null), planet: null, team: '', members: ['', '', ''] }; render(); break;
    case 'tab': stopAll(); E.stop(); listening = null; tab = v; render(); break;
    case 'listen': e.stopPropagation(); listen(v); break;
    case 'genre': listening = null; E.stop(); chooseGenre(v); break;
    case 'ins': insertText(v, false); break;
    case 'insLine': insertText(v, true); break;
    case 'rhymeFor': $('#rhymeWord').value = v; showRhymes(v); $('#rhymeOut').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); break;
    case 'addSec': {
      const n = P.sections.filter(s => s.kind === v).length + 1;
      const label = { verse: 'Verse ' + n, chorus: n > 1 ? 'Chorus ' + n : 'Chorus', repeat: 'Chorus again', rap: n > 1 ? 'Rap ' + n : 'Rap', bridge: 'Bridge', intro: P.sections.some(s => s.kind === 'intro') ? 'Outro' : 'Intro' }[v];
      const s = { id: newId('s'), kind: v, label, text: '' };
      if (label === 'Intro') P.sections.unshift(s); else P.sections.push(s);
      save(); render(true);
      const ta = document.querySelector(`[data-txt="${s.id}"]`); if (ta){ ta.scrollIntoView({ block: 'center' }); ta.focus({ preventScroll: true }); lastFocus = { id: s.id, a: 0, b: 0 }; }
    } break;
    case 'secUp': case 'secDown': {
      const i = P.sections.findIndex(s => s.id === v), j = b.dataset.act === 'secUp' ? i - 1 : i + 1;
      if (j < 0 || j >= P.sections.length) break;
      [P.sections[i], P.sections[j]] = [P.sections[j], P.sections[i]]; save(); render(true);
    } break;
    case 'secDel': {
      const s = P.sections.find(x => x.id === v);
      if (s.text.trim() && b.dataset.sure !== '1'){ b.dataset.sure = '1'; b.textContent = '?'; toast('Tap ✕ again to remove this part'); setTimeout(() => { if (b.isConnected){ b.dataset.sure = ''; b.textContent = '✕'; } }, 3000); break; }
      P.sections = P.sections.filter(x => x.id !== v); save(); render(true);
    } break;
    case 'play': playToggle(); break;
    case 'record': recordToggle(); break;
    case 'metro': P.metronome = !P.metronome; E.setMetronome(P.metronome); b.setAttribute('aria-pressed', P.metronome); save(); break;
    case 'loop': P.loop = !P.loop; b.setAttribute('aria-pressed', P.loop); save(); break;
    case 'bpm': P.bpm = Math.max(60, Math.min(170, P.bpm + +v)); save(); if (E.isPlaying() && !rec){ E.stop(); } render(true); break;
    case 'bars': P.bars = Math.max(4, Math.min(32, P.bars + +v)); fromBar = Math.min(fromBar, P.bars - 1); E.stop(); save(); render(true); break;
    case 'from': fromBar = +v; document.querySelectorAll('.ruler-bars button').forEach(x => x.classList.toggle('from', +x.dataset.v === fromBar)); paintPlayhead(-1); break;
    case 'sel': if (sel !== v){ sel = v; document.querySelectorAll('.lane').forEach(l => l.setAttribute('aria-selected', l.dataset.lane === v)); $('#dock').innerHTML = renderDock(track(v)); } break;
    case 'mute': { const t = track(v); t.mute = !t.mute; b.setAttribute('aria-pressed', t.mute); E.trackGain(t); save(); drawLanes(); } break;
    case 'addVoice': { const n = P.tracks.filter(t => t.type === 'audio').length + 1; const t = { id: newId('t'), type: 'audio', name: 'Voice ' + n, vol: 1, takeId: null, offset: 0 }; P.tracks.push(t); sel = t.id; save(); render(true); } break;
    case 'addInst': { const n = P.tracks.filter(t => t.inst === 'piano').length + 1; const t = { id: newId('t'), type: 'notes', inst: 'piano', sound: n % 2 ? 'synth' : 'bass', name: (n % 2 ? 'Synth ' : 'Bass ') + Math.ceil(n / 2), vol: .7, events: [] }; P.tracks.splice(P.tracks.findIndex(x => x.type === 'audio'), 0, t); sel = t.id; save(); render(true); } break;
    case 'starter': P.grid = GMAP[P.genre].beat.map(r => [...r].map(c => c === 'x')); save(); $('#dock').innerHTML = renderDock(track(sel)); drawLanes(); break;
    case 'clearBeat': if (b.dataset.sure !== '1'){ b.dataset.sure = '1'; b.textContent = 'Tap again to clear'; break; } P.grid = P.grid.map(r => r.map(() => false)); save(); $('#dock').innerHTML = renderDock(track(sel)); drawLanes(); break;
    case 'sound': { const t = track(sel); t.sound = v; save(); $('#dock').innerHTML = renderDock(t); } break;
    case 'oct': { const t = track(sel); t.oct = Math.max(-2, Math.min(2, (t.oct || 0) + +v)); save(); $('#dock').innerHTML = renderDock(t); } break;
    case 'undo': { const t = track(sel); if (t._undo){ t.events = t._undo; t._undo = null; save(); $('#dock').innerHTML = renderDock(t); drawLanes(); } } break;
    case 'clearTrack': { const t = track(sel); if (b.dataset.sure !== '1'){ b.dataset.sure = '1'; b.textContent = 'Tap again to clear'; break; } t._undo = t.events; t.events = []; save(); $('#dock').innerHTML = renderDock(t); drawLanes(); } break;
    case 'nudge': { const t = track(sel); t.offset = (t.offset || 0) - +v; save(); drawLanes(); toast(+v < 0 ? 'Moved earlier' : 'Moved later', 900); } break;
    case 'delTake': { const t = track(sel); if (b.dataset.sure !== '1'){ b.dataset.sure = '1'; b.textContent = 'Tap again to delete'; break; } store.deleteTake(t.takeId); t.takeId = null; t.buffer = null; t._peaks = null; save(); $('#dock').innerHTML = renderDock(t); drawLanes(); } break;
    case 'motion': toggleMotion(); break;
    case 'makeMp3': makeMp3(); break;
    case 'send': send(); break;
  }
});
app.addEventListener('pointerdown', e => {
  const cell = e.target.closest('[data-cell]');
  if (cell){
    const r = +cell.dataset.cell, s = +cell.dataset.s; P.grid[r][s] = !P.grid[r][s];
    cell.classList.toggle('on', P.grid[r][s]); cell.setAttribute('aria-pressed', P.grid[r][s]);
    if (P.grid[r][s] && !E.isPlaying()) E.playSample(E.audio(), E.trackGain(track('beat')), GMAP[P.genre].pads[r][1], E.now());
    save(); drawLanes(); return;
  }
  const h = e.target.closest('[data-hit]'); if (!h) return;
  e.preventDefault();
  if (h.dataset.hit === 'chord'){ chord(h.dataset.v); h.classList.add('hit'); setTimeout(() => h.classList.remove('hit'), 140); return; }
  const tr = h.dataset.hit === 'pad' && h.classList.contains('rowname') ? track('beat') : track(sel);
  const ev = hit(h.dataset.hit, h.dataset.k, tr, h);
  if (ev && h.dataset.hit === 'note') held.set(e.pointerId, { ev, s0: ev.s });
  try { h.releasePointerCapture(e.pointerId); } catch (x) {}
});
const release = e => {
  const hd = held.get(e.pointerId); if (!hd) return; held.delete(e.pointerId);
  const len = E.songPos() - hd.s0; hd.ev.d = Math.max(1, Math.round(len * 2) / 2);
};
app.addEventListener('pointerup', release); app.addEventListener('pointercancel', release);
app.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'team') draft.team = t.value;
  else if (t.dataset.member != null) draft.members[+t.dataset.member] = t.value;
  else if (t.dataset.txt){ onLyric(t); lastFocus = { id: t.dataset.txt, a: t.selectionStart, b: t.selectionEnd }; }
  else if (t.dataset.lab){ const s = P.sections.find(x => x.id === t.dataset.lab); if (s){ s.label = t.value; save(); } }
  else if (t.dataset.vol){ const tr = track(t.dataset.vol); tr.vol = +t.value / 100; E.trackGain(tr); save(); }
  else if (t.id === 'title'){ P.title = t.value; save(); }
});
app.addEventListener('submit', e => { if (e.target.id === 'rhymeForm'){ e.preventDefault(); showRhymes($('#rhymeWord').value); } });
app.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.target.id === 'team' || e.target.dataset.member != null)){ e.preventDefault(); start(); }
  if (e.key === 'Enter' && e.target.classList.contains('genre')) chooseGenre(e.target.dataset.v);
});
const caret = e => { const t = e.target; if (t.dataset && t.dataset.txt){ lastFocus = { id: t.dataset.txt, a: t.selectionStart, b: t.selectionEnd }; document.querySelectorAll('.section.focus').forEach(x => x.classList.remove('focus')); t.closest('.section').classList.add('focus'); } };
app.addEventListener('focusin', caret); app.addEventListener('keyup', caret);
document.addEventListener('selectionchange', () => { const a = document.activeElement; if (a && a.dataset && a.dataset.txt) lastFocus = { id: a.dataset.txt, a: a.selectionStart, b: a.selectionEnd }; });
let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (screen === 'studio' && tab === 'studio') drawLanes(); }, 120); });

render();
