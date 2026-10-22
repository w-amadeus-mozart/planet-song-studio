// The connection from a team's iPad to the teacher's app. The studio only calls the functions below;
// which transport carries them is set in config.js.

import { CONFIG } from './config.js';

let transport = null;

// true when the studio is set up to talk to the teacher's app (teams then join with a team code)
export const cloudOn = () => CONFIG.mode === 'supabase' && !!CONFIG.url && !!CONFIG.key;

export async function connect(){
  if (transport) return transport.ready;
  if (cloudOn()){
    const m = await import('./link-supabase.js');
    transport = m.create(CONFIG);
  } else transport = { ready: Promise.resolve(false), status: () => 'offline', team: () => null, join: async () => ({ error: 'offline' }), leave: async () => {}, send: async () => false, upload: async () => false };
  return transport.ready;
}
export const linkStatus = () => (transport ? transport.status() : 'offline');

// The team this iPad has joined: {id, class_id, cls, planet, name, members} or null.
export async function myTeam(){ await connect(); return transport.team(); }
// Join with the code from the teacher. Returns {team} or {error}.
export async function joinTeam(code, members){ await connect(); return transport.join(code, members); }
export async function leaveTeam(){ await connect(); return transport.leave(); }

// Only a project that belongs to the joined team may send, so nothing ends up in another team's folder.
const mine = p => { const t = transport && transport.team(); return !!(t && p.teamId && p.teamId === t.id); };
export const canSend = p => linkStatus() === 'online' && mine(p);

// Cloud backup of this team's song. Returns true when saved.
export async function cloudSave(project, json){ await connect(); if (!mine(project)) return false; return transport.saveProject(json); }
// The team's song from the cloud: {project, updated_at} or null.
export async function cloudLoad(){ await connect(); return transport.loadProject ? transport.loadProject() : null; }
export async function cloudPutTake(project, id, sr, blob){ await connect(); if (!mine(project)) return false; return transport.uploadTake(id, sr, blob); }
export async function cloudGetTake(id){ await connect(); return transport.downloadTake ? transport.downloadTake(id) : null; }

// A small progress update for the teacher's live feed ("6M · Earth chose Rap").
export async function announce(project, what){
  await connect();
  if (!mine(project)) return false;
  return transport.send({ what, ...summary(project) });
}
// The lyrics on their own, so the teacher has them even before the MP3.
export async function sendLyrics(project, text){
  await connect();
  if (!mine(project) || !transport.sendLyrics) return false;
  return transport.sendLyrics(text, project.title || '', project.genre || '');
}
// The finished song: MP3 plus the lyrics and details.
export async function sendSong(project, mp3, lyricsText){
  await connect();
  if (!mine(project)) return false;
  return transport.upload({ ...summary(project), lyrics: lyricsText }, mp3);
}

export function summary(p){
  return {
    members: p.members, genre: p.genre, bpm: p.bpm, title: p.title || '',
    lyricLines: p.sections.reduce((n, s) => n + (s.kind === 'repeat' ? 0 : s.text.split('\n').filter(l => l.trim()).length), 0),
    tracks: p.tracks.length, voices: p.tracks.filter(t => t.type === 'audio' && t.takeId).length, updated: p.updated
  };
}
