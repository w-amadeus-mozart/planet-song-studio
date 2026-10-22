// Saving on this iPad: projects as JSON in localStorage, recorded voice takes as 16-bit audio in IndexedDB.

const PREFIX = 'pss:v1:';
export let storageOK = true;

function lsGet(k){ try { return localStorage.getItem(k); } catch (e){ storageOK = false; return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); return true; } catch (e){ storageOK = false; return false; } }

export const projectKey = (cls, planet, team) => [cls, planet, team.trim().toLowerCase()].join('|');

export function listProjects(){
  try { return JSON.parse(lsGet(PREFIX + 'index') || '[]'); } catch (e){ return []; }
}
export function loadProject(key){
  try { return JSON.parse(lsGet(PREFIX + 'p:' + key)); } catch (e){ return null; }
}
export function saveProject(p){
  p.updated = Date.now();
  const key = projectKey(p.cls, p.planet, p.team);
  // audio buffers live in IndexedDB, never in the JSON
  const json = JSON.stringify(p, (k, v) => (k === 'buffer' || k[0] === '_' ? undefined : v));
  const ok = lsSet(PREFIX + 'p:' + key, json);
  const idx = listProjects().filter(x => x.key !== key);
  idx.unshift({ key, cls: p.cls, planet: p.planet, team: p.team, updated: p.updated });
  lsSet(PREFIX + 'index', JSON.stringify(idx.slice(0, 40)));
  return ok;
}
export function getPref(k, d){ const v = lsGet(PREFIX + 'pref:' + k); return v == null ? d : JSON.parse(v); }
export function setPref(k, v){ lsSet(PREFIX + 'pref:' + k, JSON.stringify(v)); }

let dbp = null;
function db(){
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('planet-song-studio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('takes');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn){
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction('takes', mode); const out = fn(t.objectStore('takes')); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); });
}
export async function saveTake(id, pcm, sampleRate){
  const i16 = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++){ const v = Math.max(-1, Math.min(1, pcm[i])); i16[i] = v * 32767; }
  return tx('readwrite', s => s.put({ sampleRate, data: new Blob([i16.buffer]) }, id));
}
export async function loadTake(id){
  const rec = await tx('readonly', s => s.get(id));
  if (!rec) return null;
  const i16 = new Int16Array(await rec.data.arrayBuffer()), pcm = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) pcm[i] = i16[i] / 32767;
  return { pcm, sampleRate: rec.sampleRate };
}
export async function deleteTake(id){ return tx('readwrite', s => s.delete(id)); }
// The stored take as it is (16-bit audio), for the cloud backup.
export async function getTakeRaw(id){ const rec = await tx('readonly', s => s.get(id)); return rec || null; }
export async function putTakeRaw(id, sampleRate, blob){ return tx('readwrite', s => s.put({ sampleRate, data: blob }, id)); }
export async function hasTake(id){ return !!(await tx('readonly', s => s.getKey(id))); }
// The project as saved (no audio buffers), for the cloud backup.
export const projectJSON = p => JSON.parse(JSON.stringify(p, (k, v) => (k === 'buffer' || k[0] === '_' ? undefined : v)));
