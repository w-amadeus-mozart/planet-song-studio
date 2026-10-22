# Planet Song Studio

Mr Le Roux's grade 6 planet song project (classes 6L, 6M and 6N). Each team makes a song about its planet.

- **The studio** (this folder's `index.html`, hosted on GitHub Pages) is what the teams open on their iPads by
  scanning the QR code. They join their team with the team's code from the teacher (no accounts), choose a genre (Rap, Trap, Pop, Rock, Jazz, Latin,
  Reggae, Amapiano, Electronic, Funk, Disco, Country), write lyrics with the rhyme finder and syllable counter, build a
  beat, play pads, piano and shaker, record and layer their voices, and send the finished MP3 to the teacher.
  Each planet has its own colours and backdrop. Work saves on the iPad as they go.
- **Planet Song Teacher** (`teacher/` + `ipad/`) is the teacher's native iPad app: teacher sign-in, classes and teams with a secret join code
  and QR code per team,
  a live feed and planet board ("6M · Earth is building Rap"), the songs filed by class and planet, a class medley
  MP3 (every planet in order from the Sun) and ready-to-paste Suno title, style and lyrics.
- **The link** between them is a free Supabase project (`setup/`). The database rules give each team access to
  its own team only, keep the MP3s in a private bucket, and let only teachers delete anything. Without it the studio still works and teams can
  save their MP3 and AirDrop it; the teacher app can add MP3s from Files.

## Layout

```
index.html, js/            the studio (plain ES modules, no build step)
  js/data.js               classes, planets (colours, facts, words), genres (sample packs, starter beats, chords)
  js/engine.js             audio: samples, piano/synth/bass and shaker voices, transport, mic recorder, MP3 export
  js/rhymes.js             rhyme finder over data/rhymes.json
  js/backdrop.js           each planet's painted world
  js/link.js, link-supabase.js, config.js   the connection to the teacher app
data/rhymes.json           ~9,000 common words from the CMU Pronouncing Dictionary, with rhyme sounds and syllables
samples/                   CC0 sounds: Sonic Pi's samples (sp/) and the Drum Studio rock kit (rock/); see the READMEs there
shared/                    supabase.js, qrcode.js (MIT), lame.min.js (LGPL, MP3 encoder) used by both apps
teacher/                   the teacher app's screens
ipad/                      the native iPad wrapper (SwiftUI + WKWebView, same pattern as Music Class)
setup/                     Supabase setup
```

## Try it

```
python3 -m http.server 8765        # then open http://localhost:8765/ (studio) or /teacher/?demo
```

## Install the teacher app on the iPad

```
zsh ipad/install-on-ipad.sh
```

Needs Xcode, xcodegen (`brew install xcodegen`), Lester's Apple developer team (W65625G5HH, bundle id
`za.lerouxstudio.planetsongteacher`) and the iPad paired with the Mac. Rerun it after changing `js/config.js`.
