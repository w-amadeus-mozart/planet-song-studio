// Content for Planet Song Studio: classes, planets (with their look), genres (with their sample packs and starter beats).

export const CLASSES = ['6L', '6M', '6N'];

// theme: colours for the planet's screens. art: which backdrop painter draws its world (see backdrop.js).
export const PLANETS = [
  { id: 'Mercury', n: 1, art: 'mercury',
    theme: { bg: '#17161a', bg2: '#0b0b0e', surface: '#26252b', surface2: '#34323a', line: '#4a4752', ink: '#f2efe9', muted: '#b5afa6', accent: '#ffb347', accent2: '#e8e1d6' },
    orb: ['#d8cfc4', '#776b62'],
    facts: ['Closest planet to the Sun', 'A year lasts only 88 Earth days', 'No moons at all', 'Days reach 430°C, nights drop to −180°C'],
    words: ['speedy', 'swift', 'craters', 'closest', 'scorching', 'freezing', 'tiny', 'quick', 'messenger', 'sunburn'] },
  { id: 'Venus', n: 2, art: 'venus',
    theme: { bg: '#3a2410', bg2: '#22140a', surface: '#4d3218', surface2: '#634222', line: '#86592c', ink: '#fff4dc', muted: '#e6c99a', accent: '#ffd25e', accent2: '#ff8a3d' },
    orb: ['#ffe6b0', '#c48d3a'],
    facts: ['Hottest planet, about 465°C', 'Spins backwards compared to most planets', 'One day there is longer than its whole year', 'Wrapped in thick yellow clouds'],
    words: ['hottest', 'clouds', 'backwards', 'bright', 'evening star', 'sister', 'yellow', 'glowing', 'shining', 'pressure'] },
  { id: 'Earth', n: 3, art: 'earth',
    theme: { bg: '#0b2a4a', bg2: '#061a30', surface: '#123a63', surface2: '#1a4b7c', line: '#2c6aa3', ink: '#f0f8ff', muted: '#a9cbe8', accent: '#5fd98a', accent2: '#7fd3ff' },
    orb: ['#7fcfff', '#1a5aa3'],
    facts: ['The only planet we know has life', 'About 71% is covered in water', 'One Moon', 'A year is 365 days'],
    words: ['home', 'ocean', 'blue', 'green', 'life', 'Moon', 'clouds', 'people', 'animals', 'breathe'] },
  { id: 'Mars', n: 4, art: 'mars',
    theme: { bg: '#3d140c', bg2: '#250b06', surface: '#541d12', surface2: '#6d2818', line: '#943a22', ink: '#fff0e8', muted: '#f0b8a0', accent: '#ff7a45', accent2: '#ffc38a' },
    orb: ['#ff9367', '#a3391a'],
    facts: ['Red because of rusty iron in its dust', 'Two tiny moons: Phobos and Deimos', 'Olympus Mons is the tallest volcano in the solar system', 'Rovers like Perseverance explore it today'],
    words: ['red', 'rust', 'dust', 'rover', 'volcano', 'two moons', 'desert', 'cold', 'explore', 'Olympus'] },
  { id: 'Jupiter', n: 5, art: 'jupiter',
    theme: { bg: '#2e1f15', bg2: '#1c130c', surface: '#402c1e', surface2: '#553b28', line: '#7a5537', ink: '#fff6ea', muted: '#e3c8a8', accent: '#ff8f5a', accent2: '#f3d6ad' },
    orb: ['#f3d6ad', '#a9714a'],
    facts: ['Biggest planet: over 1,300 Earths could fit inside', 'The Great Red Spot is a storm bigger than Earth', 'A day lasts only about 10 hours', 'Has more than 90 moons'],
    words: ['giant', 'king', 'storm', 'Great Red Spot', 'stripes', 'gas', 'huge', 'moons', 'swirl', 'mighty'] },
  { id: 'Saturn', n: 6, art: 'saturn',
    theme: { bg: '#2a2312', bg2: '#17130a', surface: '#3a311a', surface2: '#4d4123', line: '#706033', ink: '#fffaea', muted: '#e6d9a8', accent: '#ffd76a', accent2: '#c9b2ff' },
    orb: ['#f8e6b4', '#c09a52'],
    facts: ['Famous for its rings of ice and rock', 'So light it could float in a giant bathtub', 'Has more than 140 moons', 'A year lasts about 29 Earth years'],
    words: ['rings', 'ice', 'float', 'golden', 'spinning', 'halo', 'crown', 'beautiful', 'gas', 'Titan'] },
  { id: 'Uranus', n: 7, art: 'uranus',
    theme: { bg: '#0f3338', bg2: '#082226', surface: '#164249', surface2: '#1f555d', line: '#2f7a84', ink: '#effffd', muted: '#a9e2dc', accent: '#7ff5e6', accent2: '#b9c8ff' },
    orb: ['#c4f6f2', '#4aa3b3'],
    facts: ['Spins on its side like a rolling ball', 'An ice giant, blue-green from methane gas', 'One of the coldest planets: about −224°C', 'A year lasts 84 Earth years'],
    words: ['sideways', 'tilted', 'ice giant', 'rolling', 'teal', 'cold', 'frozen', 'faint rings', 'windy', 'mystery'] },
  { id: 'Neptune', n: 8, art: 'neptune',
    theme: { bg: '#0b1446', bg2: '#060b2c', surface: '#13205e', surface2: '#1c2c78', line: '#2f44a6', ink: '#eef2ff', muted: '#aab8f0', accent: '#62b6ff', accent2: '#9dffcf' },
    orb: ['#7aa3ff', '#1c3a9e'],
    facts: ['Farthest planet from the Sun', 'Strongest winds in the solar system', 'A year lasts 165 Earth years', 'Deep blue from methane gas'],
    words: ['farthest', 'blue', 'wind', 'deep', 'dark', 'ocean', 'trident', 'frozen', 'distant', 'storm'] }
];
export const PMAP = Object.fromEntries(PLANETS.map(p => [p.id, p]));
export const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

const sp = n => 'samples/sp/' + n + '.mp3';
const rk = n => 'samples/rock/' + n + '.mp3';

// Space sounds every genre gets on the pads, for intros and effects.
export const SPACE_PADS = [
  ['Lift-off', sp('misc_cineboom')], ['Landing', sp('ambi_lunar_land')], ['Robot', sp('mehackit_robot3')], ['Signal', sp('mehackit_phone1')],
  ['Glass', sp('ambi_glass_hum')], ['Hum', sp('ambi_haunted_hum')], ['Ping', sp('elec_ping')], ['Choir', sp('ambi_choir')]
];

// pads: 8 genre sounds [label, file]. beat: one starter pattern per pad row (16 steps), x = hit.
// key: root note (MIDI) and scale for the piano's highlighted keys. prog: chord roots for the "chord" buttons.
export const GENRES = [
  { id: 'rap', name: 'Rap', bpm: 88, swing: .14, key: [57, 'minor'], prog: ['Am', 'F', 'G', 'Em'],
    tip: 'Rap your verses over a big boom-bap beat. Rhymes and rhythm are everything.',
    pads: [['Kick', sp('bd_boom')], ['Snare', sp('sn_dolf')], ['Hi-hat', sp('hat_tap')], ['Clap', sp('perc_snap')], ['808', sp('bd_808')], ['Scratch', sp('vinyl_scratch')], ['Rewind', sp('vinyl_rewind')], ['Bass hit', sp('bass_voxy_c')]],
    beat: ['x......x.x......', '....x.......x...', 'x.x.x.x.x.x.x.x.', '............x...', '................', '................'] },
  { id: 'trap', name: 'Trap', bpm: 140, swing: 0, key: [53, 'minor'], prog: ['Fm', 'Db', 'Eb', 'Cm'],
    tip: 'Slow heavy rap with booming 808s and super-fast hi-hats.',
    pads: [['808 kick', sp('bd_808')], ['Snare', sp('sn_generic')], ['Hi-hat', sp('hat_snap')], ['Clap', sp('perc_snap2')], ['Tick', sp('elec_tick')], ['Robot', sp('glitch_robot1')], ['Spin back', sp('vinyl_backspin')], ['Bass drop', sp('bass_drop_c')]],
    beat: ['x.........x.....', '........x.......', 'x.x.x.x.xxx.x.xx', '........x.......', '...x.......x....', '................'] },
  { id: 'pop', name: 'Pop', bpm: 110, swing: 0, key: [60, 'major'], prog: ['C', 'G', 'Am', 'F'],
    tip: 'Catchy and happy, with a chorus everyone sings along to.',
    pads: [['Kick', sp('bd_klub')], ['Snare', sp('elec_snare')], ['Hi-hat', sp('hat_zild')], ['Clap', sp('perc_snap')], ['Triangle', sp('elec_triangle')], ['Chime', sp('elec_chime')], ['Choir', sp('ambi_choir')], ['Bass hit', sp('bass_hit_c')]],
    beat: ['x...x...x...x...', '....x.......x...', 'x.x.x.x.x.x.x.x.', '............x...', '..............x.', '................'] },
  { id: 'rock', name: 'Rock', bpm: 122, swing: 0, key: [52, 'minor'], prog: ['Em', 'C', 'G', 'D'],
    tip: 'Loud, strong and full of energy. Shout the chorus!',
    pads: [['Kick', rk('kick')], ['Snare', rk('snare')], ['Hi-hat', rk('hatClosed')], ['Open hat', rk('hatOpen')], ['Crash', rk('crash')], ['Tom', rk('tomHigh')], ['Floor tom', rk('tomFloor')], ['Power chord', sp('guit_e_fifths')]],
    beat: ['x.....x.x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.', '..............x.', 'x...............', '................'] },
  { id: 'jazz', name: 'Jazz', bpm: 120, swing: .33, key: [50, 'dorian'], prog: ['Dm7', 'G7', 'Cmaj7', 'A7'],
    tip: 'Smooth and swingy. Try a cool, sneaky voice.',
    pads: [['Kick', sp('drum_bass_soft')], ['Snare', sp('drum_snare_soft')], ['Hi-hat', sp('drum_cymbal_pedal')], ['Ride', rk('ride')], ['Splash', sp('drum_splash_soft')], ['Bell', sp('perc_bell')], ['Guitar', sp('guit_em9')], ['Bass', sp('bass_woodsy_c')]],
    beat: ['x.......x.......', '.......x.......x', '....x.......x...', 'x...x.xx..x.x.xx', '................', '................'] },
  { id: 'latin', name: 'Latin', bpm: 100, swing: 0, key: [57, 'minor'], prog: ['Am', 'Dm', 'G', 'C'],
    tip: 'Dance rhythm with cowbell and congas. Add a "¡Vamos!"',
    pads: [['Kick', sp('bd_pure')], ['Clave', sp('elec_wood')], ['Shaker', sp('hat_cab')], ['Cowbell', sp('drum_cowbell')], ['Conga', sp('tabla_na')], ['Bongo', sp('tabla_te1')], ['Tambourine', sp('perc_till')], ['Bass', sp('bass_woodsy_c')]],
    beat: ['x...x...x...x...', 'x..x..x...x.x...', 'xxxxxxxxxxxxxxxx', '..x...x...x...x.', '...x..x....x..x.', '.x.......x......'] },
  { id: 'reggae', name: 'Reggae', bpm: 76, swing: .1, key: [48, 'major'], prog: ['C', 'G', 'Am', 'F'],
    tip: 'Slow and relaxed, with the beat bouncing on the off-beat.',
    pads: [['Kick', sp('bd_fat')], ['Snare', sp('sn_dub')], ['Hi-hat', sp('hat_raw')], ['Rimshot', sp('elec_wood')], ['Bong', sp('elec_bong')], ['Dub boom', sp('misc_cineboom')], ['Snap', sp('perc_snap')], ['Bass', sp('bass_dnb_f')]],
    beat: ['........x.......', '........x.......', '..x...x...x...x.', '....x.......x...', '................', '................'] },
  { id: 'amapiano', name: 'Amapiano', bpm: 112, swing: .08, key: [53, 'minor'], prog: ['Fm', 'Bbm', 'Db', 'C'],
    tip: 'South African house groove with a deep log drum and shakers.',
    pads: [['Kick', sp('bd_haus')], ['Clap', sp('perc_snap2')], ['Hi-hat', sp('hat_gnu')], ['Shaker', sp('hat_cab')], ['Wood', sp('elec_wood')], ['Log drum', sp('bass_dnb_f')], ['Ping', sp('elec_ping')], ['Piano', sp('ambi_piano')]],
    beat: ['x...x...x...x...', '....x.......x...', '..x...x...x...x.', 'x.xxx.xxx.xxx.xx', '...x.....x....x.', 'x......x..x.....'] },
  { id: 'electronic', name: 'Electronic', bpm: 126, swing: 0, key: [53, 'minor'], prog: ['Fm', 'Db', 'Ab', 'Eb'],
    tip: 'Robot sounds and a big drop. Perfect for space.',
    pads: [['Kick', sp('bd_tek')], ['Snare', sp('elec_hi_snare')], ['Hi-hat', sp('hat_metal')], ['Blip', sp('elec_blip')], ['Beep', sp('elec_beep')], ['Glitch', sp('glitch_perc1')], ['Robot', sp('mehackit_robot1')], ['Bass', sp('glitch_bass_g')]],
    beat: ['x...x...x...x...', '....x.......x...', '..x...x...x...x.', 'x..x..x..x..x.x.', '.......x.......x', '................'] },
  { id: 'funk', name: 'Funk', bpm: 104, swing: .08, key: [52, 'dorian'], prog: ['E7', 'E7', 'A7', 'A7'],
    tip: 'Groovy bass, tight drums. Make people move.',
    pads: [['Kick', sp('bd_zum')], ['Snare', sp('sn_generic')], ['Hi-hat', sp('hat_hier')], ['Swish', sp('perc_swash')], ['Cowbell', sp('drum_cowbell')], ['Guitar', sp('guit_harmonics')], ['Flip', sp('elec_flip')], ['Bass hit', sp('bass_hit_c')]],
    beat: ['x..x..x...x.....', '....x..x.x..x...', 'xxxxxxxxxxxxxxxx', '................', '..x.......x.....', '................'] },
  { id: 'disco', name: 'Disco', bpm: 118, swing: 0, key: [57, 'minor'], prog: ['Am7', 'Dm7', 'G', 'C'],
    tip: 'Sparkly dance party under a disco ball.',
    pads: [['Kick', sp('bd_klub')], ['Snare', sp('sn_dolf')], ['Hi-hat', sp('hat_bdu')], ['Open hat', rk('hatOpen')], ['Clap', sp('perc_snap')], ['Sparkle', sp('elec_cymbal')], ['Choir', sp('ambi_choir')], ['Bass hit', sp('bass_hit_c')]],
    beat: ['x...x...x...x...', '....x.......x...', 'x.x.x.x.x.x.x.x.', '..x...x...x...x.', '....x.......x...', '................'] },
  { id: 'country', name: 'Country', bpm: 106, swing: 0, key: [55, 'major'], prog: ['G', 'C', 'D', 'G'],
    tip: 'Tell a story, like a cowboy in space.',
    pads: [['Kick', rk('kick')], ['Snare', sp('drum_snare_soft')], ['Hi-hat', rk('hatClosed')], ['Wood', sp('elec_wood')], ['Tambourine', sp('perc_till')], ['Guitar', sp('guit_e_fifths')], ['Drum roll', sp('drum_roll')], ['Bass', sp('bass_woodsy_c')]],
    beat: ['x.......x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.', '..x...x...x...x.', '................', '................'] }
];
export const GMAP = Object.fromEntries(GENRES.map(g => [g.id, g]));

export const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };
const NOTE = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
// "Am7" -> MIDI notes around middle C
export function chordNotes(name){
  const m = name.match(/^([A-G]b?)(maj7|m7|m|7)?$/);
  if (!m) return [60, 64, 67];
  const root = 48 + NOTE[m[1]] + (NOTE[m[1]] < 5 ? 12 : 0);
  const iv = { undefined: [0, 4, 7], m: [0, 3, 7], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11] }[m[2]];
  return iv.map(i => root + i);
}

export const STARTERS = [
  "Yo, they call me ___",
  "Hey, look up in the sky, I'm ___",
  'Spinning round the Sun, ___',
  'Out in space where ___',
  'Ten, nine, eight… blast off to ___',
  'If you came to visit me, ___',
  "I'm the {n} planet from the Sun, ___",
  'Day and night, ___'
];

export const SUNO_STYLE = {
  rap: 'kids rap, boom bap beat, confident rap verses, catchy sung hook',
  trap: 'kid-friendly trap, booming 808s, rolling hi-hats, rap verses',
  pop: 'upbeat catchy pop, bright synths, kids choir vocals',
  rock: 'energetic rock, electric guitars, big drums, shout-along chorus',
  jazz: 'swing jazz, upright bass, brushed drums, playful brass',
  latin: 'latin pop, salsa rhythm, congas, cowbell, brass stabs',
  reggae: 'laid-back reggae, off-beat guitar skank, warm bass',
  amapiano: 'amapiano, log drum bass, shakers, soulful piano, South African house',
  electronic: 'electronic dance, space synths, robotic vocal effects, big drop',
  funk: 'funky groove, slap bass, wah guitar, horn section',
  disco: 'disco, four-on-the-floor, strings, sparkly dance vibe',
  country: 'country, acoustic guitar, banjo, foot-stomping storytelling'
};
