// Audio for Planet Song Studio: samples, the piano and shaker voices, the song transport (beat grid, played-in notes,
// recorded voice takes), the microphone recorder and the MP3 export. Everything that makes sound takes a context and
// a destination, so the same code plays live and renders the MP3 in an OfflineAudioContext.

import { GMAP, SPACE_PADS } from './data.js';

let ac = null, master = null;
const buffers = new Map();          // url -> AudioBuffer
const noises = new WeakMap();       // context -> noise buffer
const trackNodes = new Map();       // track id -> GainNode (live context)

export function audio(){
  if (!ac){
    const AC = window.AudioContext || window.webkitAudioContext;
    ac = new AC({ latencyHint: 'interactive' });
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 4;
    master = ac.createGain(); master.gain.value = .9;
    master.connect(comp); comp.connect(ac.destination);
    setSession('playback');
  }
  if (ac.state !== 'running') ac.resume();
  return ac;
}
export const now = () => audio().currentTime;

// iPadOS 16.4+: "playback" ignores the silent switch; "play-and-record" while the microphone is on.
function setSession(type){ try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) {} }

export async function loadSample(url){
  if (buffers.has(url)) return buffers.get(url);
  const p = fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); })
    .then(b => new Promise((res, rej) => audio().decodeAudioData(b, res, rej)))
    .then(buf => { buffers.set(url, buf); return buf; })
    .catch(e => { buffers.delete(url); throw e; });
  buffers.set(url, p);
  return p;
}
export async function loadGenre(id){
  const g = GMAP[id]; if (!g) return;
  await Promise.allSettled([...g.pads, ...SPACE_PADS].map(([, url]) => loadSample(url)));
}
function buf(url){ const b = buffers.get(url); return b instanceof AudioBuffer ? b : null; }

function noise(c){
  if (!noises.has(c)){
    const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noises.set(c, b);
  }
  return noises.get(c);
}
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

/* ---------- voices ---------- */
export function playSample(c, dest, url, t, gain = 1){
  const b = buf(url); if (!b) return;
  const s = c.createBufferSource(), g = c.createGain();
  s.buffer = b; g.gain.value = gain;
  s.connect(g).connect(dest); s.start(t);
}
// kind: piano (bright electric piano), synth (space lead), bass (round sub bass)
export function playNote(c, dest, midi, t, dur = .5, kind = 'piano', vel = .8){
  const f = mtof(midi), g = c.createGain(), out = c.createGain();
  out.gain.value = vel; g.connect(out).connect(dest);
  const end = t + dur + (kind === 'bass' ? .25 : .9);
  if (kind === 'synth'){
    const o1 = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter();
    o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = f; o2.frequency.value = f * 1.005;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(3200, t + .08); lp.frequency.exponentialRampToValueAtTime(900, t + dur + .3);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .02); g.gain.setValueAtTime(.16, t + dur); g.gain.exponentialRampToValueAtTime(.0008, end);
    o1.connect(lp); o2.connect(lp); lp.connect(g); o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
  } else if (kind === 'bass'){
    const o = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter();
    o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.value = 700;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.55, t + .01); g.gain.setValueAtTime(.5, t + dur); g.gain.exponentialRampToValueAtTime(.0008, end);
    o.connect(g); o2.connect(lp).connect(g); o.start(t); o2.start(t); o.stop(end); o2.stop(end);
  } else {
    // two detuned sines and a bell partial that fades fast, like an electric piano
    [[1, .32, 1.6], [2.0, .1, .5], [3.98, .05, .18]].forEach(([h, a, d]) => {
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'sine'; o.frequency.value = f * h;
      og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(a, t + .006);
      og.gain.exponentialRampToValueAtTime(a * .35, t + Math.min(d, dur + .1)); og.gain.exponentialRampToValueAtTime(.0005, end);
      o.connect(og).connect(g); o.start(t); o.stop(end);
    });
    g.gain.value = 1;
  }
}
export function playShaker(c, dest, t, strength = .7){
  const s = c.createBufferSource(), bp = c.createBiquadFilter(), hp = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noise(c); s.playbackRate.value = .9 + Math.random() * .2;
  bp.type = 'bandpass'; bp.frequency.value = 6200; bp.Q.value = 1.2; hp.type = 'highpass'; hp.frequency.value = 3500;
  const a = .25 + strength * .45;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + .012); g.gain.exponentialRampToValueAtTime(.001, t + .09 + strength * .05);
  s.connect(bp).connect(hp).connect(g).connect(dest); s.start(t, Math.random() * .5); s.stop(t + .2);
}
function click(c, dest, t, accent){
  const o = c.createOscillator(), g = c.createGain();
  o.frequency.value = accent ? 1600 : 1100;
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(accent ? .5 : .3, t + .002); g.gain.exponentialRampToValueAtTime(.0001, t + .05);
  o.connect(g).connect(dest); o.start(t); o.stop(t + .06);
}

// Plays one played-in event (a note on the piano, a pad hit, a shaker tap).
export function playEvent(c, dest, track, ev, t, genre){
  if (track.inst === 'shaker') playShaker(c, dest, t, ev.v ?? .7);
  else if (track.inst === 'pads'){ const url = padUrl(genre, ev.k); if (url) playSample(c, dest, url, t, ev.v ?? 1); }
  else playNote(c, dest, ev.k, t, (ev.d || 2) * stepDur(), track.sound || 'piano', ev.v ?? .8);
}
// Pad numbers: 0-7 the genre's sounds, 8-15 the space sounds.
export function padUrl(genre, k){
  const g = GMAP[genre]; if (!g) return null;
  return k < 8 ? (g.pads[k] || [])[1] : (SPACE_PADS[k - 8] || [])[1];
}

/* ---------- tracks ---------- */
export function trackGain(track){
  audio();
  let n = trackNodes.get(track.id);
  if (!n){ n = ac.createGain(); n.connect(master); trackNodes.set(track.id, n); }
  n.gain.value = track.mute ? 0 : (track.vol ?? .8);
  return n;
}
export function refreshMix(project){ project.tracks.forEach(trackGain); }

/* ---------- transport ---------- */
let P = null;                       // the project being played
let playing = false, recordMode = null;
let startTime = 0, nextStep = 0, timer = 0, songSteps = 0, raf = 0;
let buckets = new Map(), sources = [], metronome = false, onStep = null, onEnd = null;
const visQ = [];

export const stepDur = () => 60 / (P ? P.bpm : 100) / 4;
export const isPlaying = () => playing;
export function setMetronome(v){ metronome = v; }

function swingAt(s, sw){ return (s % 2 ? sw * stepDur() : 0); }

function bucketEvents(){
  buckets = new Map();
  P.tracks.forEach(tr => {
    if (tr.type !== 'notes') return;
    tr.events.forEach(ev => {
      const s = Math.floor(ev.s);
      if (!buckets.has(s)) buckets.set(s, []);
      buckets.get(s).push([tr, ev]);
    });
  });
}
function startTakes(atTime, fromSec){
  P.tracks.forEach(tr => {
    if (tr.type !== 'audio' || !tr.buffer) return;
    const off = (tr.offset || 0) + fromSec;   // seconds into the take
    const s = ac.createBufferSource(); s.buffer = tr.buffer;
    s.connect(trackGain(tr));
    if (off >= 0){ if (off < tr.buffer.duration) s.start(atTime, off); }
    else s.start(atTime - off);
    sources.push(s);
  });
}

// Song position from the context clock, in steps (16ths) since bar 1.
export function songPos(){ return playing ? (ac.currentTime - startTime) / stepDur() : nextStep; }

export function play(project, opts = {}){
  stop();
  P = project; audio();
  songSteps = P.bars * 16;
  metronome = !!opts.metronome;
  onStep = opts.onStep || null; onEnd = opts.onEnd || null;
  recordMode = opts.record || null;
  const from = Math.max(0, Math.min(songSteps - 1, opts.from || 0));
  const countIn = opts.countIn ? 16 : 0;
  refreshMix(P); bucketEvents();
  startTime = ac.currentTime + .08 + countIn * stepDur() - from * stepDur();
  nextStep = from;
  if (countIn) for (let i = 0; i < countIn; i += 4) click(ac, master, ac.currentTime + .08 + i * stepDur(), i === 0);
  startTakes(startTime + from * stepDur(), from * stepDur());
  playing = true;
  timer = setInterval(schedule, 25); schedule();
  raf = requestAnimationFrame(draw);
  return startTime;
}
function schedule(){
  const sd = stepDur(), g = GMAP[P.genre], sw = P.swing ?? (g ? g.swing : 0);
  while (startTime + nextStep * sd < ac.currentTime + .12){
    if (nextStep >= songSteps){
      if (recordMode || !P.loop){ const endAt = startTime + songSteps * sd; setTimeout(() => { if (playing){ stop(); onEnd && onEnd(); } }, Math.max(0, (endAt - ac.currentTime) * 1000)); clearInterval(timer); return; }
      startTime += songSteps * sd; nextStep = 0; bucketEvents(); startTakes(startTime, 0);
    }
    const s = nextStep, t = startTime + s * sd + swingAt(s, sw);
    // beat grid (loops every bar)
    const beat = P.tracks.find(x => x.type === 'beat');
    if (beat && g && beat.on !== false){
      const dest = trackGain(beat);
      P.grid.forEach((row, r) => { if (row[s % 16]) playSample(ac, dest, g.pads[r][1], t, .9); });
    }
    (buckets.get(s) || []).forEach(([tr, ev]) => {
      const et = startTime + ev.s * sd + (Number.isInteger(ev.s) ? swingAt(ev.s, sw) : 0);
      playEvent(ac, trackGain(tr), tr, ev, Math.max(et, ac.currentTime), P.genre);
    });
    if (metronome && s % 4 === 0) click(ac, master, t, s % 16 === 0);
    visQ.push([s, t]);
    nextStep++;
  }
}
function draw(){
  let cur = null;
  while (visQ.length && visQ[0][1] <= ac.currentTime) cur = visQ.shift();
  if (cur && onStep) onStep(cur[0]);
  if (playing) raf = requestAnimationFrame(draw);
}
export function stop(){
  if (!playing) return;
  playing = false; clearInterval(timer); cancelAnimationFrame(raf); visQ.length = 0;
  sources.forEach(s => { try { s.stop(); } catch (e) {} }); sources = [];
  if (onStep) onStep(-1);
}

/* ---------- microphone recorder ---------- */
const WORKLET = `class PSRec extends AudioWorkletProcessor{
  constructor(){super();this.on=false;this.a=0;this.b=1e9;this.port.onmessage=e=>{const d=e.data;if(d.cmd==='arm'){this.a=d.start;this.b=d.stop||1e9;this.on=true;}else if(d.cmd==='stop'){this.b=d.at;}};}
  process(inputs){const ch=inputs[0]&&inputs[0][0];if(!ch||!this.on)return true;const n=ch.length,t0=currentTime,sr=sampleRate;
    if(t0+n/sr<=this.a)return true;if(t0>=this.b){this.on=false;this.port.postMessage({done:true});return true;}
    const i=Math.max(0,Math.ceil((this.a-t0)*sr)),j=Math.min(n,Math.floor((this.b-t0)*sr));if(j>i)this.port.postMessage({pcm:ch.slice(i,j)});return true;}}
registerProcessor('ps-rec',PSRec);`;
let mic = null, recNode = null, workletReady = null;

export async function openMic(){
  audio();
  if (mic) return true;
  setSession('play-and-record');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true } });
  if (!workletReady) workletReady = ac.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })));
  await workletReady;
  const src = ac.createMediaStreamSource(stream);
  recNode = new AudioWorkletNode(ac, 'ps-rec');
  const sink = ac.createGain(); sink.gain.value = 0;
  src.connect(recNode).connect(sink).connect(ac.destination);
  const meter = ac.createAnalyser(); meter.fftSize = 512; src.connect(meter);
  mic = { stream, src, meter };
  return true;
}
export function micLevel(){
  if (!mic) return 0;
  const a = new Float32Array(mic.meter.fftSize); mic.meter.getFloatTimeDomainData(a);
  let m = 0; for (const v of a) m = Math.max(m, Math.abs(v)); return m;
}
export function closeMic(){
  if (!mic) return;
  mic.stream.getTracks().forEach(t => t.stop()); try { mic.src.disconnect(); recNode.disconnect(); } catch (e) {}
  mic = null; recNode = null; setSession('playback');
}
// Captures the microphone from the song's bar 1 (startAt, a context time) until stopRecording().
// The capture is shifted by the device's latency so the voice lines up with the beat the child heard.
let recChunks = [], recDone = null;
export function latency(){ return (ac.outputLatency || 0) + (ac.baseLatency || 0) + .025; }
export function startRecording(startAt){
  recChunks = [];
  return new Promise(res => {
    recDone = res;
    recNode.port.onmessage = e => {
      if (e.data.pcm) recChunks.push(e.data.pcm);
      if (e.data.done){
        const len = recChunks.reduce((n, c) => n + c.length, 0), pcm = new Float32Array(len);
        let o = 0; recChunks.forEach(c => { pcm.set(c, o); o += c.length; });
        recChunks = []; recDone = null; res({ pcm, sampleRate: ac.sampleRate });
      }
    };
    recNode.port.postMessage({ cmd: 'arm', start: startAt + latency() });
  });
}
export function stopRecording(){ if (recNode) recNode.port.postMessage({ cmd: 'stop', at: ac.currentTime + latency() }); }
export function makeBuffer(pcm, sampleRate){
  const b = audio().createBuffer(1, Math.max(1, pcm.length), sampleRate); b.copyToChannel(pcm, 0); return b;
}
export const recordingSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.AudioWorkletNode && window.isSecureContext);

/* ---------- export ---------- */
// Renders the whole song (beat, played-in tracks, voices, at their mix levels) and returns mono PCM.
export async function renderSong(project){
  const sd = 60 / project.bpm / 4, steps = project.bars * 16, sr = 44100;
  const g = GMAP[project.genre], sw = project.swing ?? (g ? g.swing : 0);
  const len = Math.ceil((steps * sd + 2.5) * sr);
  const oc = new OfflineAudioContext(1, len, sr);
  const comp = oc.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
  const m = oc.createGain(); m.gain.value = .9; m.connect(comp).connect(oc.destination);
  const gainFor = tr => { const n = oc.createGain(); n.gain.value = tr.mute ? 0 : (tr.vol ?? .8); n.connect(m); return n; };
  const off = .05;
  project.tracks.forEach(tr => {
    if (tr.mute) return;
    const dest = gainFor(tr);
    if (tr.type === 'beat' && g){
      for (let s = 0; s < steps; s++){
        const t = off + s * sd + (s % 2 ? sw * sd : 0);
        project.grid.forEach((row, r) => { if (row[s % 16]) playSample(oc, dest, g.pads[r][1], t, .9); });
      }
    } else if (tr.type === 'notes'){
      tr.events.forEach(ev => { if (ev.s < steps) playEvent(oc, dest, tr, ev, off + ev.s * sd + (Number.isInteger(ev.s) && ev.s % 2 ? sw * sd : 0), project.genre); });
    } else if (tr.type === 'audio' && tr.buffer){
      const s = oc.createBufferSource(); s.buffer = tr.buffer; s.connect(dest);
      const o = tr.offset || 0;
      if (o >= 0) s.start(off, o); else s.start(off - o);
    }
  });
  const out = await oc.startRendering();
  return out.getChannelData(0);
}
export async function encodeMp3(pcm, onProgress){
  if (!window.lamejs) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = new URL('../shared/lame.min.js', import.meta.url).href; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  const enc = new window.lamejs.Mp3Encoder(1, 44100, 128), parts = [], block = 1152 * 20;
  const i16 = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++){ const v = Math.max(-1, Math.min(1, pcm[i])); i16[i] = v < 0 ? v * 32768 : v * 32767; }
  for (let i = 0; i < i16.length; i += block){
    const d = enc.encodeBuffer(i16.subarray(i, i + block)); if (d.length) parts.push(new Uint8Array(d));
    if (i % (block * 10) === 0){ onProgress && onProgress(i / i16.length); await new Promise(r => setTimeout(r, 0)); }
  }
  const end = enc.flush(); if (end.length) parts.push(new Uint8Array(end));
  onProgress && onProgress(1);
  return new Blob(parts, { type: 'audio/mpeg' });
}
