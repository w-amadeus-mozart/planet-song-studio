// Rhyme finder built on the CMU Pronouncing Dictionary (data/rhymes.json, ~9,000 everyday words plus space words).
// Each word maps to [rime index, syllable count]; a rime is the sound from the last stressed vowel to the end ("planet" -> "AE N AH T").

let DATA = null, BY_RIME = null, loading = null;

export function loadRhymes(){
  if (DATA) return Promise.resolve();
  if (!loading) loading = fetch('data/rhymes.json').then(r => r.json()).then(d => {
    DATA = d; BY_RIME = new Map();
    for (const [w, [ri]] of Object.entries(d.w)){ if (!BY_RIME.has(ri)) BY_RIME.set(ri, []); BY_RIME.get(ri).push(w); }
  }).catch(() => { loading = null; });
  return loading;
}

const VOWELS = new Set(['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW']);
const clean = w => (w || '').toLowerCase().replace(/[^a-z']/g, '').replace(/^'+|'+$/g, '');

// Rough guess for words that are not in the dictionary (names, made-up words): count vowel groups.
export function syllables(word){
  const w = clean(word);
  if (!w) return 0;
  if (DATA && DATA.w[w]) return DATA.w[w][1];
  const groups = w.replace(/e$/, '').match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}
export function lineSyllables(line){ return (line.match(/[A-Za-z']+/g) || []).reduce((n, w) => n + syllables(w), 0); }

// The rhyme key used to colour matching line endings.
export function rhymeKey(word){
  const w = clean(word);
  if (!w) return '';
  if (DATA && DATA.w[w]) return 'r' + DATA.w[w][0];
  const m = w.replace(/e$/, '').match(/[aeiouy]+[^aeiouy]*$/);
  return 's' + (m ? m[0] : w.slice(-2));
}

function parts(rime){ return rime.split(' '); }
function tailOf(ph){ let i = ph.length - 1; while (i > 0 && !VOWELS.has(ph[i])) i--; return ph.slice(i).join(' '); }
// sounds that rhyme well enough for a song: same family of consonant
const CLASS = { P: 'stop', B: 'stop', T: 'stop', D: 'stop', K: 'stop', G: 'stop', M: 'nasal', N: 'nasal', NG: 'nasal', F: 'fric', V: 'fric', TH: 'fric', DH: 'fric', S: 'sib', Z: 'sib', SH: 'sib', ZH: 'sib' };

export function findRhymes(word){
  const w = clean(word.trim().split(/\s+/).pop() || '');
  const out = { word: w, perfect: [], near: [], known: false, syl: w ? syllables(w) : 0 };
  if (!w || !DATA) return out;
  const hit = DATA.w[w];
  if (hit){
    out.known = true;
    const ri = hit[0], rime = DATA.r[ri], ph = parts(rime);
    out.perfect = (BY_RIME.get(ri) || []).filter(x => x !== w);
    // Near rhymes: same stressed vowel, and the same ending from the last vowel on
    // ("planet" ~ "magnet", "jacket"); one-vowel words just need the same vowel and last sound ("star" ~ "heart").
    const v = ph[0], tail = tailOf(ph), last = ph[ph.length - 1], multi = ph.filter(x => VOWELS.has(x)).length > 1;
    const near = [];
    DATA.r.forEach((r, i) => {
      if (i === ri) return;
      const q = parts(r);
      if (q[0] !== v) return;
      const qMulti = q.filter(x => VOWELS.has(x)).length > 1;
      if (multi !== qMulti) return;
      const ok = multi ? tailOf(q) === tail : (q[q.length - 1] === last || (VOWELS.has(last) && VOWELS.has(q[q.length - 1])) || (q.length === ph.length + 1 && q.slice(0, ph.length).join(' ') === rime) || q.length === 2 && ph.length === 2 && CLASS[q[1]] && CLASS[q[1]] === CLASS[last]);
      if (ok) near.push(...(BY_RIME.get(i) || []));
    });
    out.near = near.filter(x => x !== w);
  } else {
    // Unknown word: match spelling endings.
    const end3 = w.slice(-3), end2 = w.slice(-2);
    for (const x of Object.keys(DATA.w)){
      if (x === w) continue;
      if (x.endsWith(end3)) out.perfect.push(x); else if (x.endsWith(end2)) out.near.push(x);
    }
  }
  // Short, common words first (the list is already in order of how common words are).
  const rank = (a, b) => (a.length > 9) - (b.length > 9);
  out.perfect = out.perfect.sort(rank).slice(0, 40);
  out.near = out.near.sort(rank).slice(0, 30);
  return out;
}
