// The connection from a team's iPad to the teacher's app. The studio only calls these four functions;
// which transport carries them (cloud or school wifi) is set in config.js.

import { CONFIG } from './config.js';

let transport = null;

export async function connect(){
  if (transport) return transport.ready;
  if (CONFIG.mode === 'supabase' && CONFIG.url && CONFIG.key){
    const m = await import('./link-supabase.js');
    transport = m.create(CONFIG);
  } else transport = { ready: Promise.resolve(false), status: () => 'offline', send: async () => false, upload: async () => false };
  return transport.ready;
}
export const linkStatus = () => (transport ? transport.status() : 'offline');

// A small progress update for the teacher's live feed ("6M · Earth chose Rap").
export async function announce(project, what){
  await connect();
  return transport.send({ kind: 'update', what, ...summary(project) });
}
// The finished song: MP3 plus the lyrics and details.
export async function sendSong(project, mp3, lyricsText){
  await connect();
  return transport.upload({ ...summary(project), lyrics: lyricsText }, mp3);
}

export function summary(p){
  return {
    cls: p.cls, planet: p.planet, team: p.team, members: p.members, genre: p.genre, bpm: p.bpm, title: p.title || '',
    lyricLines: p.sections.reduce((n, s) => n + (s.kind === 'repeat' ? 0 : s.text.split('\n').filter(l => l.trim()).length), 0),
    tracks: p.tracks.length, voices: p.tracks.filter(t => t.type === 'audio' && t.takeId).length, updated: p.updated
  };
}
