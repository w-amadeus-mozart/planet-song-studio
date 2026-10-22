// Paints each planet's world behind the studio on a fixed canvas: Mercury's craters, Venus's clouds, Earth from orbit,
// Mars's red dunes, Jupiter's bands and storm, Saturn's rings, Uranus on its side, Neptune's winds.

let canvas = null, current = null;

function rng(seed){ let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function stars(c, w, h, r, n, maxY = 1){
  for (let i = 0; i < n; i++){
    const x = r() * w, y = r() * h * maxY, s = r() * 1.6 + .3;
    c.globalAlpha = .35 + r() * .6; c.fillStyle = '#fff';
    c.beginPath(); c.arc(x, y, s, 0, 7); c.fill();
  }
  c.globalAlpha = 1;
}
function glow(c, x, y, rad, color){
  const g = c.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, color); g.addColorStop(1, 'transparent');
  c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}
function ball(c, x, y, rad, c1, c2){
  const g = c.createRadialGradient(x - rad * .35, y - rad * .35, rad * .1, x, y, rad);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill();
}

const PAINT = {
  mercury(c, w, h, r){
    c.fillStyle = '#0b0b0e'; c.fillRect(0, 0, w, h); stars(c, w, h, r, 160, .7);
    glow(c, w * .08, h * .05, Math.max(w, h) * .55, '#ffcf7a55');
    ball(c, w * .08, h * .05, 70, '#fff6d8', '#ffb347');
    const gy = h * .78;
    const g = c.createLinearGradient(0, gy, 0, h); g.addColorStop(0, '#6d6760'); g.addColorStop(1, '#2b2926');
    c.fillStyle = g; c.beginPath(); c.moveTo(0, gy);
    for (let x = 0; x <= w; x += 40) c.lineTo(x, gy + Math.sin(x * .01) * 12 + r() * 10);
    c.lineTo(w, h); c.lineTo(0, h); c.fill();
    for (let i = 0; i < 26; i++){
      const x = r() * w, y = gy + 20 + r() * (h - gy), rx = 10 + r() * 60;
      c.fillStyle = '#00000055'; c.beginPath(); c.ellipse(x, y, rx, rx * .3, 0, 0, 7); c.fill();
      c.strokeStyle = '#ffffff22'; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y - 2, rx, rx * .3, 0, Math.PI, 0); c.stroke();
    }
  },
  venus(c, w, h, r){
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5a3a14'); g.addColorStop(1, '#22140a');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++){
      const y = r() * h, amp = 20 + r() * 50, col = ['#ffd25e', '#ff8a3d', '#e9b04f', '#fff0b0'][i % 4];
      c.strokeStyle = col; c.globalAlpha = .08 + r() * .1; c.lineWidth = 30 + r() * 70;
      c.beginPath();
      for (let x = -50; x <= w + 50; x += 30) c.lineTo(x, y + Math.sin(x * .004 + i) * amp);
      c.stroke();
    }
    c.globalAlpha = 1;
    glow(c, w * .85, h * .15, 300, '#fff3c255');
  },
  earth(c, w, h, r){
    c.fillStyle = '#061a30'; c.fillRect(0, 0, w, h); stars(c, w, h, r, 180, .8);
    const R = Math.max(w, h) * 1.1, cx = w * .5, cy = h + R * .78;
    glow(c, cx, cy, R * 1.08, '#7fd3ff33');
    ball(c, cx, cy, R, '#5fb8f0', '#0b3a75');
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, 7); c.clip();
    for (let i = 0; i < 9; i++){
      const x = r() * w, y = cy - R + r() * R * .35, s = 80 + r() * 200;
      c.fillStyle = '#3fae62'; c.globalAlpha = .9; c.beginPath();
      for (let a = 0; a < 7; a += .5) c.lineTo(x + Math.cos(a) * s * (.6 + r() * .5), y + Math.sin(a) * s * .35 * (.6 + r() * .5));
      c.fill();
    }
    c.globalAlpha = .7; c.fillStyle = '#fff';
    for (let i = 0; i < 30; i++){ const x = r() * w, y = cy - R + r() * R * .3; c.beginPath(); c.ellipse(x, y, 40 + r() * 120, 6 + r() * 10, 0, 0, 7); c.fill(); }
    c.restore(); c.globalAlpha = 1;
    ball(c, w * .86, h * .16, 34, '#f4f4f4', '#9a9a9a');
  },
  mars(c, w, h, r){
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#c8795a'); g.addColorStop(.5, '#7a2c18'); g.addColorStop(1, '#250b06');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    ball(c, w * .78, h * .12, 16, '#e6d1c0', '#7a6252'); ball(c, w * .9, h * .2, 9, '#d8c3b2', '#6d5747');
    const layers = [['#9c3a1e', .62], ['#7f2c15', .72], ['#5e1f0e', .84]];
    layers.forEach(([col, base], li) => {
      c.fillStyle = col; c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += 20) c.lineTo(x, h * base + Math.sin(x * (.004 + li * .002) + li * 2) * (30 + li * 10) + Math.sin(x * .02) * 6);
      c.lineTo(w, h); c.fill();
    });
    // a little rover
    const rx = w * .2, ry = h * .84;
    c.fillStyle = '#dcd3c8'; c.fillRect(rx, ry - 26, 46, 14); c.fillRect(rx + 30, ry - 44, 4, 18); c.fillRect(rx + 26, ry - 50, 14, 8);
    c.fillStyle = '#2a1a14'; [rx + 4, rx + 20, rx + 36].forEach(x => { c.beginPath(); c.arc(x + 4, ry - 8, 6, 0, 7); c.fill(); });
    c.globalAlpha = .12; c.fillStyle = '#ffc38a';
    for (let i = 0; i < 60; i++){ c.beginPath(); c.arc(r() * w, r() * h, r() * 3, 0, 7); c.fill(); }
    c.globalAlpha = 1;
  },
  jupiter(c, w, h, r){
    const cols = ['#e9cfa8', '#c08a5c', '#f3dcb8', '#a8653d', '#ead2ae', '#8f5636', '#f1d9b2', '#b97a4c'];
    const bh = h / 14;
    for (let i = 0; i < 15; i++){
      c.fillStyle = cols[i % cols.length]; c.beginPath(); c.moveTo(0, i * bh);
      for (let x = 0; x <= w; x += 30) c.lineTo(x, i * bh + Math.sin(x * .006 + i) * bh * .25);
      c.lineTo(w, h); c.lineTo(0, h); c.fill();
    }
    c.fillStyle = '#1c130ccc'; c.fillRect(0, 0, w, h);
    const sx = w * .72, sy = h * .62;
    c.fillStyle = '#c8553a'; c.globalAlpha = .75; c.beginPath(); c.ellipse(sx, sy, 140, 60, -.05, 0, 7); c.fill();
    c.fillStyle = '#e07a55'; c.beginPath(); c.ellipse(sx, sy, 90, 34, -.05, 0, 7); c.fill(); c.globalAlpha = 1;
  },
  saturn(c, w, h, r){
    c.fillStyle = '#17130a'; c.fillRect(0, 0, w, h); stars(c, w, h, r, 160);
    const cx = w * .78, cy = h * .3, R = Math.min(w, h) * .2;
    const ring = (front) => {
      c.save(); c.translate(cx, cy); c.rotate(-.35); c.scale(1, .28);
      [[R * 2.3, '#f3dfa988', 18], [R * 2.0, '#d9bf7a99', 26], [R * 1.65, '#f8ecc488', 14]].forEach(([rad, col, lw]) => {
        c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.arc(0, 0, rad, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); c.stroke();
      });
      c.restore();
    };
    ring(false); ball(c, cx, cy, R, '#fbeec6', '#a8823c'); ring(true);
    for (let i = 0; i < 70; i++){ c.fillStyle = '#ffe9a8'; c.globalAlpha = r() * .4; c.beginPath(); c.arc(r() * w, h * .6 + r() * h * .4, r() * 2.5, 0, 7); c.fill(); }
    c.globalAlpha = 1;
  },
  uranus(c, w, h, r){
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0f3a40'); g.addColorStop(1, '#061a1e');
    c.fillStyle = g; c.fillRect(0, 0, w, h); stars(c, w, h, r, 120);
    const cx = w * .8, cy = h * .3, R = Math.min(w, h) * .17;
    ball(c, cx, cy, R, '#d6fbf7', '#3d98a8');
    c.strokeStyle = '#c9f5f355'; c.lineWidth = 3;
    c.save(); c.translate(cx, cy); c.rotate(1.45); c.scale(1, .22); c.beginPath(); c.arc(0, 0, R * 1.9, 0, 7); c.stroke(); c.restore();
    c.strokeStyle = '#ffffff30'; c.lineWidth = 1.5;
    for (let i = 0; i < 40; i++){ // ice crystals
      const x = r() * w, y = r() * h, s = 3 + r() * 8;
      for (let a = 0; a < 3; a++){ c.beginPath(); c.moveTo(x - Math.cos(a * 1.05) * s, y - Math.sin(a * 1.05) * s); c.lineTo(x + Math.cos(a * 1.05) * s, y + Math.sin(a * 1.05) * s); c.stroke(); }
    }
  },
  neptune(c, w, h, r){
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b1446'); g.addColorStop(1, '#040824');
    c.fillStyle = g; c.fillRect(0, 0, w, h); stars(c, w, h, r, 140);
    c.lineCap = 'round';
    for (let i = 0; i < 26; i++){
      const y = r() * h, x = r() * w, len = 120 + r() * 380;
      c.strokeStyle = r() > .5 ? '#62b6ff' : '#9dffcf'; c.globalAlpha = .08 + r() * .14; c.lineWidth = 2 + r() * 5;
      c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + len * .3, y - 20, x + len * .7, y + 20, x + len, y); c.stroke();
    }
    c.globalAlpha = 1;
    const cx = w * .85, cy = h * .78, R = Math.min(w, h) * .22;
    ball(c, cx, cy, R, '#7aa3ff', '#122a80');
    c.fillStyle = '#0a1550aa'; c.beginPath(); c.ellipse(cx - R * .3, cy - R * .2, R * .25, R * .12, -.2, 0, 7); c.fill();
  },
  space(c, w, h, r){
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1d2260'); g.addColorStop(1, '#0a0d2a');
    c.fillStyle = g; c.fillRect(0, 0, w, h); stars(c, w, h, r, 260);
    glow(c, w * .1, h * .1, 400, '#ffb54733');
  }
};

export function paintBackdrop(art){
  current = art || 'space';
  if (!canvas){
    canvas = document.createElement('canvas'); canvas.id = 'backdrop'; canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);
    let t = 0; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => paintBackdrop(current), 150); });
  }
  const dpr = Math.min(2, devicePixelRatio || 1), w = innerWidth, h = innerHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  (PAINT[current] || PAINT.space)(c, w, h, rng(current.length * 977 + 13));
}
