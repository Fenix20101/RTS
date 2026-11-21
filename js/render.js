'use strict';
// ============================================================
//  Отрисовка — изометрия
//  Мир хранится «сверху» (x, y в пикселях), на экран проецируется:
//    ix = x - y,  iy = (x + y) / 2 - z
// ============================================================

function ISO(x, y, z = 0) { return [x - y, (x + y) * 0.5 - z]; }

const RGB_CACHE = {};
function rgbOf(hex) {
  if (Array.isArray(hex)) return hex;
  let c = RGB_CACHE[hex];
  if (!c) { const n = parseInt(hex.slice(1), 16); c = RGB_CACHE[hex] = [n >> 16, (n >> 8) & 255, n & 255]; }
  return c;
}
function rgbStr(c, k = 1, a = 1) {
  const r = Math.min(255, c[0] * k) | 0, g = Math.min(255, c[1] * k) | 0, b = Math.min(255, c[2] * k) | 0;
  return a < 1 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
}
const WRECK_RGB = [58, 54, 49], TRACK_RGB = [46, 45, 40], STEEL_RGB = [44, 44, 40];

const R = {
  cam: { x: 0, y: 0, z: 1 },
  markers: [], trees: [],

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    const m = G.map;
    this.terrain = document.createElement('canvas');
    this.terrain.width = m.W * TILE; this.terrain.height = m.H * TILE;
    this.tctx = this.terrain.getContext('2d');
    this.fog = document.createElement('canvas');
    this.fog.width = m.W; this.fog.height = m.H;
    this.fctx = this.fog.getContext('2d');
    this.fogImg = this.fctx.createImageData(m.W, m.H);
    this.mini = document.createElement('canvas');
    this.mini.width = m.W; this.mini.height = m.H;
    this.occ = new Uint8Array(m.W * m.H);
    this.texMode = ['grass', 'field', 'forest', 'water', 'road', 'sand'].every(n => ASSETS.has(n));
    if (this.texMode) this.buildMasks();
    this.makeTreeSprites();
    this.makeGrime();
    this.makeClouds();
    this.collectTrees();
    this.buildRoadField();
    this.paintRegion(0, 0, m.W, m.H);
    this.paintMini();
    this.resize();
  },

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.vw = window.innerWidth; this.vh = window.innerHeight;
    this.clampCam();
  },

  // ---------------- камера ----------------
  clampCam() {
    const m = G.map, c = this.cam;
    const ww = this.vw / c.z, wh = this.vh / c.z;
    const x0 = -m.H * TILE - 60, x1 = m.W * TILE + 60 - ww;
    const y0 = -80, y1 = (m.W + m.H) * TILE * 0.5 + 200 - wh;
    c.x = x1 < x0 ? (x0 + x1) / 2 : clamp(c.x, x0, x1);
    c.y = y1 < y0 ? (y0 + y1) / 2 : clamp(c.y, y0, y1);
  },
  centerOn(x, y) {
    const [ix, iy] = ISO(x, y);
    this.cam.x = ix - this.vw / this.cam.z / 2; this.cam.y = iy - this.vh / this.cam.z / 2; this.clampCam();
  },
  toWorld(sx, sy) {
    const ix = sx / this.cam.z + this.cam.x, iy = sy / this.cam.z + this.cam.y;
    return { x: iy + ix / 2, y: iy - ix / 2 };
  },
  toScreen(wx, wy, wz = 0) {
    const [ix, iy] = ISO(wx, wy, wz);
    return { x: (ix - this.cam.x) * this.cam.z, y: (iy - this.cam.y) * this.cam.z };
  },
  viewCenterWorld() { return this.toWorld(this.vw / 2, this.vh / 2); },

  // ---------------- спрайты деревьев ----------------
  makeTreeSprites() {
    this.treeSprites = [];
    const mk = (draw) => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 96;
      const g = c.getContext('2d'); g.scale(2, 2); draw(g); return c;
    };
    // лиственные
    const leafy = (seed, tint) => mk(g => {
      const rng = RNG(seed);
      g.fillStyle = '#4a3622'; g.fillRect(14.5, 30, 3, 16);
      g.fillStyle = '#2f2214'; g.fillRect(16.5, 30, 1, 16);
      const blobs = [];
      for (let i = 0; i < 9; i++) blobs.push([16 + (rng() - 0.5) * 16, 22 + (rng() - 0.5) * 14 - i * 0.6, 5 + rng() * 4]);
      blobs.sort((a, b) => a[1] - b[1]);
      for (const [x, y, r] of blobs) {
        const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.15, x, y, r);
        gr.addColorStop(0, `rgb(${120 + tint},${150 + tint},${70})`);
        gr.addColorStop(0.6, `rgb(${62 + tint},${94 + tint},${38})`);
        gr.addColorStop(1, `rgb(${34},${56},${22})`);
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
    });
    // хвойные
    const pine = (seed) => mk(g => {
      const rng = RNG(seed);
      g.fillStyle = '#3d2b1b'; g.fillRect(15, 36, 2.5, 10);
      const tiers = 4;
      for (let i = 0; i < tiers; i++) {
        const y0 = 38 - i * 8, w = 13 - i * 2.6 + rng() * 1.5, h = 13;
        g.fillStyle = `rgb(${32 + i * 6},${60 + i * 8},${34 + i * 4})`;
        g.beginPath(); g.moveTo(16 - w, y0); g.lineTo(16, y0 - h); g.lineTo(16 + w, y0); g.closePath(); g.fill();
        g.fillStyle = 'rgba(160,200,120,0.18)';
        g.beginPath(); g.moveTo(16 - w, y0); g.lineTo(16, y0 - h); g.lineTo(16 - w * 0.2, y0); g.closePath(); g.fill();
      }
    });
    const bush = (seed) => mk(g => {
      const rng = RNG(seed);
      for (let i = 0; i < 6; i++) {
        const x = 16 + (rng() - 0.5) * 12, y = 42 + (rng() - 0.5) * 5, r = 3 + rng() * 3;
        const gr = g.createRadialGradient(x - 1, y - 1.5, 0.5, x, y, r);
        gr.addColorStop(0, '#8aa257'); gr.addColorStop(1, '#3a5424');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
    });
    // пучки высокой травы, сухостоя и камыша (рисуются стоя, как кусты)
    this.tuftSprites = [];
    const tuft = (seed, pal, tall, heads) => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 56;
      const g = c.getContext('2d'); g.scale(2, 2);
      const rng = RNG(seed);
      const n = tall ? 26 : 34;
      for (let i = 0; i < n; i++) {
        const bx = 16 + (rng() - 0.5) * 20, by = 26 + (rng() - 0.5) * 3;
        const h = (tall ? 14 : 9) + rng() * (tall ? 10 : 8), lean = (rng() - 0.5) * (tall ? 7 : 9);
        const col = pal[Math.floor(rng() * pal.length)];
        g.strokeStyle = col; g.lineWidth = 0.6 + rng() * 0.7; g.lineCap = 'round';
        g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + lean * 0.2, by - h * 0.6, bx + lean, by - h); g.stroke();
        if (heads && rng() < 0.35) {
          g.fillStyle = '#6b4a2a'; g.beginPath(); g.ellipse(bx + lean, by - h, 0.9, 2.2, lean * 0.05, 0, 7); g.fill();
        }
      }
      return c;
    };
    const GREEN = ['#4a6428', '#5a7530', '#3d5422', '#6a8238', '#33481c', '#7a8c44'];
    const DRY = ['#7f7a44', '#8c8448', '#6d7238', '#9a9054', '#5d6230', '#a89c5c'];
    const REED = ['#6b7a3a', '#7d8a44', '#58662e', '#9a9a58', '#4a5a28'];
    for (let i = 0; i < 4; i++) this.tuftSprites.push(tuft(301 + i, GREEN, false, false));
    for (let i = 0; i < 2; i++) this.tuftSprites.push(tuft(311 + i, DRY, false, false));
    for (let i = 0; i < 2; i++) this.tuftSprites.push(tuft(321 + i, REED, true, true));
    for (let i = 0; i < 5; i++) this.treeSprites.push(leafy(11 + i * 7, i * 6 - 10));
    for (let i = 0; i < 3; i++) this.treeSprites.push(pine(91 + i));
    for (let i = 0; i < 2; i++) this.treeSprites.push(bush(131 + i));
  },
  collectTrees() {
    const m = G.map;
    this.trees = [];
    for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
      const t = m.get(x, y);
      if (t === T.FOREST) {
        const n = 1 + (hash2(x, y, m.seed + 1) < 0.55 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const kind = hash2(x, y, k + 40);
          this.trees.push({
            x: (x + 0.15 + hash2(x, y, k * 3 + 11) * 0.7) * TILE, y: (y + 0.15 + hash2(x, y, k * 3 + 12) * 0.7) * TILE,
            s: 1.1 + hash2(x, y, k * 3 + 13) * 0.5, v: kind < 0.35 ? 5 + Math.floor(kind / 0.35 * 3) : Math.floor((kind - 0.35) / 0.65 * 5), tx: x, ty: y,
          });
        }
      }
    }
    this.makeScrub();
    this.trees = this.trees.filter(t => {
      const rd = Math.abs(t.x / TILE - m.riverX(t.y / TILE));
      if (t.tuft === 6 || t.tuft === 7) return rd > 2.15;
      return rd > (t.tuft !== undefined ? 3.3 : 3.9);
    });
    const keep = new Set(this.trees);
    for (let k = 0; k < this.vegGrid.length; k++) { const l = this.vegGrid[k]; if (l) this.vegGrid[k] = l.filter(o => keep.has(o)); }
  },
  // ---- кустарник и трава: заросли у дорог, живые изгороди у полей, подлесок на опушках,
  //      высокая трава на лугах, камыш у воды. m.scrub: 1 — кусты, 2 — высокая трава, 3 — камыш
  makeScrub() {
    const m = G.map, W = m.W, H = m.H, sd = m.seed;
    const sc = m.scrub = new Uint8Array(W * H);
    const near = (x, y, tt, r = 1) => {
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if ((ox || oy) && m.get(x + ox, y + oy) === tt) return true;
      return false;
    };
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const t = m.get(x, y), i = y * W + x;
      if (m.deco[i]) continue;
      if (t === T.SAND || (t === T.GRASS && near(x, y, T.WATER))) {
        if (near(x, y, T.WATER, 1) && hash2(x, y, sd + 7) < 0.75) sc[i] = 3;
        continue;
      }
      if (t !== T.GRASS || near(x, y, T.HOUSE) || near(x, y, T.BRIDGE, 2)) continue;
      const h = hash2(x, y, sd + 11);
      if (near(x, y, T.ROAD)) {                       // обочины
        if (fbm(x * 0.18, y * 0.18, sd + 501) > 0.53) sc[i] = 1; else if (h < 0.85) sc[i] = 2;
      } else if (near(x, y, T.FOREST)) {              // опушка, подлесок
        if (fbm(x * 0.2, y * 0.2, sd + 502) > 0.44) sc[i] = 1; else if (h < 0.6) sc[i] = 2;
      } else if (near(x, y, T.FIELD)) {               // межи и живые изгороди
        if (fbm(x * 0.13, y * 0.13, sd + 503) > 0.56) sc[i] = 1; else if (h < 0.45) sc[i] = 2;
      } else {                                        // луг
        const f = fbm(x * 0.07, y * 0.07, sd + 504);
        if (f > 0.66 && h < 0.25) sc[i] = 1; else if (f > 0.55) sc[i] = 2;
      }
    }
    // объекты растительности: кусты кучно, разного размера, пучки травы между ними
    this.vegGrid = new Array(W * H);
    const add = (o) => { this.trees.push(o); (this.vegGrid[o.ty * W + o.tx] = this.vegGrid[o.ty * W + o.tx] || []).push(o); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = sc[y * W + x];
      if (!v) continue;
      if (v === 1) {
        const n = 6 + Math.floor(hash2(x, y, 21) * 4);
        for (let k = 0; k < n; k++) {
          add({ x: (x + hash2(x, y, k * 5 + 31)) * TILE, y: (y + hash2(x, y, k * 5 + 32)) * TILE,
                s: 0.45 + hash2(x, y, k * 5 + 33) * 0.75, v: 8 + (k & 1), tx: x, ty: y, bush: true, sq: 1.0 + hash2(x, y, k * 5 + 34) * 0.6 });
        }
        if (hash2(x, y, 23) < 0.12) add({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, s: 0.55 + hash2(x, y, 24) * 0.3, v: Math.floor(hash2(x, y, 25) * 5), tx: x, ty: y, bush: true, young: true });
      }
      // пучки кучками по 2–3 рядом, а не ровной сеткой
      const groups = v === 1 ? 1 : v === 3 ? 3 : 2;
      for (let gI = 0; gI < groups; gI++) {
        const cx = x + 0.15 + hash2(x, y, gI * 9 + 41) * 0.7, cy = y + 0.15 + hash2(x, y, gI * 9 + 42) * 0.7;
        const cnt = 2 + Math.floor(hash2(x, y, gI * 9 + 43) * 2);
        for (let k = 0; k < cnt; k++) {
          const g = v === 3 ? 6 + (k & 1) : (hash2(x, y, gI * 9 + k + 44) < 0.25 ? 4 + (k & 1) : (gI + k) % 4);
          add({ x: (cx + (hash2(x, y, gI * 9 + k + 50) - 0.5) * 0.3) * TILE, y: (cy + (hash2(x, y, gI * 9 + k + 51) - 0.5) * 0.3) * TILE,
                s: 0.7 + hash2(x, y, gI * 9 + k + 52) * 0.5, tx: x, ty: y, bush: true, tuft: g });
        }
      }
    }
  },
  paintUndergrowth(ctx, tx0, ty0, tw, th) {
    const m = G.map, W = m.W;
    for (let y = Math.max(0, ty0); y < Math.min(m.H, ty0 + th); y++) for (let x = Math.max(0, tx0); x < Math.min(W, tx0 + tw); x++) {
      const v = m.scrub[y * W + x];
      if (!v) continue;
      const rng = RNG(x * 7919 + y * 104729);
      if (v === 1) {      // тёмная масса подлеска: заросли читаются сплошными, а не шариками
        for (let k = 0; k < 7; k++) {
          const px = (x + rng()) * TILE, py = (y + rng()) * TILE, r = 6 + rng() * 9;
          const g = ctx.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0, 'rgba(26,40,14,0.55)'); g.addColorStop(0.6, 'rgba(34,50,18,0.35)'); g.addColorStop(1, 'rgba(34,50,18,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
        }
      }
      // высокая трава и камыш: густая штриховка стеблей по земле
      const n = v === 1 ? 30 : 60;
      ctx.lineWidth = 0.7;
      for (let k = 0; k < n; k++) {
        const px = (x + rng()) * TILE, py = (y + rng()) * TILE, l = 2 + rng() * 3, a = -0.8 + (rng() - 0.5) * 0.9;
        const c = v === 3 ? (rng() < 0.5 ? 'rgba(96,104,52,0.5)' : 'rgba(62,72,32,0.5)')
                : (rng() < 0.5 ? 'rgba(44,62,22,0.45)' : (rng() < 0.7 ? 'rgba(92,110,48,0.4)' : 'rgba(132,128,70,0.35)'));
        ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); ctx.stroke();
      }
    }
  },
  // техника подминает кусты и траву
  flattenVeg(x, y, r) {
    const m = G.map, g = this.vegGrid;
    if (!g) return;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const list = g[(ty + oy) * m.W + tx + ox];
      if (!list) continue;
      for (const o of list) if (!o.dead && Math.hypot(o.x - x, o.y - y) < r) o.dead = true;
    }
  },
  removeTreesIn(tx0, ty0, tw, th) {
    const m = G.map;
    this.trees = this.trees.filter(t => {
      if (t.tx < tx0 || t.ty < ty0 || t.tx >= tx0 + tw || t.ty >= ty0 + th) return true;
      const tt = m.get(t.tx, t.ty);
      return tt === T.FOREST || (t.bush && (tt === T.GRASS || tt === T.SAND));
    });
  },

  // ---------------- земля ----------------
  tileColor(t) {
    return [[96, 122, 58], [150, 136, 76], [60, 82, 42], [52, 86, 104], [140, 118, 84], [112, 84, 56], [150, 60, 45], [112, 104, 94], [168, 152, 108]][t];
  },
  paintRegion(tx0, ty0, tw, th) {
    const m = G.map, ctx = this.tctx;
    tx0 = Math.max(0, tx0); ty0 = Math.max(0, ty0);
    tw = Math.min(m.W - tx0, tw); th = Math.min(m.H - ty0, th);
    const px0 = tx0 * TILE, py0 = ty0 * TILE, pw = tw * TILE, ph = th * TILE;
    const img = ctx.createImageData(pw, ph);
    const d = img.data;
    const seed = m.seed;
    const gw = Math.ceil(pw / 4) + 1, gh = Math.ceil(ph / 4) + 1;
    const jx = new Float32Array(gw * gh), jy = new Float32Array(gw * gh), lo = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const wx = px0 + gx * 4, wy = py0 + gy * 4;
      const k = gy * gw + gx;
      jx[k] = (vnoise(wx / 9, wy / 9, seed + 31) - 0.5) * 12;
      jy[k] = (vnoise(wx / 9, wy / 9, seed + 57) - 0.5) * 12;
      lo[k] = fbm(wx / 160, wy / 160, seed + 3) * 0.6 + vnoise(wx / 23, wy / 23, seed + 5) * 0.4;
    }
    if (this.texMode) {
      const fm = new Float32Array(gw * gh), wm = new Float32Array(gw * gh);
      for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
        const k = gy * gw + gx, wx = px0 + gx * 4, wy = py0 + gy * 4;
        fm[k] = this.sampleMask(this.maskF, wx, wy);
        wm[k] = this.sampleMask(this.maskW, wx, wy);
      }
      this.paintTextured(d, pw, ph, px0, py0, gw, jx, jy, lo, fm, wm);
    } else {
    let hs = (seed * 9301 + 49297 + tx0 * 7 + ty0 * 13) >>> 0;
    for (let y = 0; y < ph; y++) {
      const wy = py0 + y;
      const gy = y >> 2;
      for (let x = 0; x < pw; x++) {
        const wx = px0 + x;
        const k = gy * gw + (x >> 2);
        const sx = Math.floor((wx + jx[k]) / TILE), sy = Math.floor((wy + jy[k]) / TILE);
        let t = m.get(sx, sy);
        const tTrue = m.terr[Math.floor(wy / TILE) * m.W + Math.floor(wx / TILE)];
        if (tTrue === T.BRIDGE || tTrue === T.HOUSE || t === T.BRIDGE || t === T.HOUSE) t = tTrue;
        if (t === T.HOUSE) t = T.GRASS;
        // дорога — по плавной оси; на срезанных углах проступает прежняя земля
        if (this.roadSegGrid && tTrue !== T.BRIDGE && tTrue !== T.HOUSE && t !== T.BRIDGE) {
          const rl = this.roadSegGrid[Math.floor(wy / TILE) * m.W + Math.floor(wx / TILE)];
          if (rl) {
            const dr = this.roadDist(wx / TILE, wy / TILE, rl) + jx[k] * 0.022 - jy[k] * 0.012;
            if (dr < 1.02) t = T.ROAD;
            else if (t === T.ROAD) { t = m.terrPre ? m.terrPre[sy * m.W + sx] : T.GRASS; if (t === T.ROAD || t === T.HOUSE) t = T.GRASS; }
          }
        }
        // река и берег — по плавной линии русла, а не по клеткам
        if (tTrue !== T.BRIDGE && t !== T.BRIDGE) {
          const rd = Math.abs(wx / TILE - m.riverX(wy / TILE)) + jx[k] * 0.03 + jy[k] * 0.015;
          if (rd < 4.4) {
            if (rd < 2.3) { if (tTrue !== T.ROAD) t = T.WATER; }
            else if (rd < 3.35) { if (tTrue !== T.ROAD) t = T.SAND; }
            else if (t === T.WATER || t === T.SAND) t = (tTrue === T.WATER || tTrue === T.SAND) ? T.GRASS : tTrue;
          }
        }
        hs = (hs * 1664525 + 1013904223) >>> 0;
        const wn = (hs >>> 24) / 255 - 0.5;
        const l = lo[k];
        let r, g, b;
        if (t === T.GRASS) {
          r = 84 + l * 40 + wn * 16; g = 110 + l * 38 + wn * 18; b = 50 + l * 18 + wn * 10;
        } else if (t === T.FIELD) {
          const dir = m.fieldDir[sy * m.W + sx] || 0;
          const st = (((dir ? wx : wy) >> 2) & 1);
          r = 150 + l * 30 + wn * 14 - st * 20; g = 134 + l * 26 + wn * 12 - st * 16; b = 72 + wn * 10 - st * 8;
        } else if (t === T.FOREST) {
          r = 58 + l * 22 + wn * 12; g = 76 + l * 22 + wn * 12; b = 38 + wn * 8;
        } else if (t === T.WATER) {
          const dd = Math.abs(wx / TILE - m.riverX(wy / TILE)) / 2.3;
          const deep = 1 - Math.min(1, dd);
          r = 70 - deep * 30 + wn * 5; g = 104 - deep * 32 + wn * 6; b = 116 - deep * 16 + wn * 6;
          const wave = Math.sin(wx * 0.11 + wy * 0.21 + l * 6);
          if (wave > 0.94) { r += 20; g += 22; b += 24; }
        } else if (t === T.ROAD) {
          r = 134 + l * 18 + wn * 18; g = 113 + l * 14 + wn * 15; b = 81 + wn * 10;
        } else if (t === T.BRIDGE) {
          r = 52; g = 86; b = 104;
        } else if (t === T.RUBBLE) {
          r = 104 + wn * 40; g = 98 + wn * 36; b = 88 + wn * 34;
        } else {
          r = 160 + l * 20 + wn * 14; g = 146 + l * 18 + wn * 12; b = 104 + wn * 10;
        }
        const i = (y * pw + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      }
    }
    }
    ctx.putImageData(img, px0, py0);
    ctx.save();
    ctx.beginPath(); ctx.rect(px0, py0, pw, ph); ctx.clip();
    this.paintOverlays(tx0 - 2, ty0 - 2, tw + 4, th + 4);
    ctx.restore();
  },

  // ---- маски на сетке клеток (размытые): близость леса и воды ----
  buildMasks() {
    const m = G.map, W = m.W, H = m.H;
    const blur = (src, r) => {
      let a = src;
      for (let pass = 0; pass < 2; pass++) {
        const b = new Float32Array(W * H), c = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          let s = 0, n = 0;
          for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W) { s += a[y * W + xx]; n++; } }
          b[y * W + x] = s / n;
        }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          let s = 0, n = 0;
          for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < H) { s += b[yy * W + x]; n++; } }
          c[y * W + x] = s / n;
        }
        a = c;
      }
      return a;
    };
    const f = new Float32Array(W * H), w = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const t = m.terr[i];
      f[i] = t === T.FOREST ? 1 : 0;
      w[i] = t === T.WATER || t === T.BRIDGE ? 1 : 0;
    }
    this.maskF = blur(f, 1);
    this.maskW = blur(w, 1);
  },
  // дороги рисуются по плавной оси (сглаженная ломаная), а не по клеткам
  buildRoadField() {
    const m = G.map, W = m.W, H = m.H;
    this.roadSegs = []; this.roadSegGrid = new Array(W * H);
    if (!m.roads) return;
    for (const r of m.roads) {
      let pts = r.map(p => [p[0], p[1]]);
      for (let it = 0; it < 4; it++) {   // сглаживание Чайкина, концы на месте
        const out = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
          out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
        }
        out.push(pts[pts.length - 1]);
        pts = out;
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const sI = this.roadSegs.length;
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        this.roadSegs.push([ax, ay, bx, by]);
        const x0 = Math.floor(Math.min(ax, bx) - 2.6), x1 = Math.floor(Math.max(ax, bx) + 2.6);
        const y0 = Math.floor(Math.min(ay, by) - 2.6), y1 = Math.floor(Math.max(ay, by) + 2.6);
        for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++)
          (this.roadSegGrid[y * W + x] = this.roadSegGrid[y * W + x] || []).push(sI);
      }
    }
  },
  roadDist(fx, fy, list) {
    let best = 99;
    for (const i of list) {
      const [ax, ay, bx, by] = this.roadSegs[i];
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((fx - ax) * dx + (fy - ay) * dy) / L));
      const d = Math.hypot(fx - ax - dx * t, fy - ay - dy * t);
      if (d < best) best = d;
    }
    return best;
  },
  sampleMask(a, wx, wy) {
    const m = G.map;
    const fx = clamp(wx / TILE - 0.5, 0, m.W - 1.001), fy = clamp(wy / TILE - 0.5, 0, m.H - 1.001);
    const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0;
    const i = y0 * m.W + x0;
    return (a[i] * (1 - ax) + a[i + 1] * ax) * (1 - ay) + (a[i + m.W] * (1 - ax) + a[i + m.W + 1] * ax) * ay;
  },

  // земля из фото-текстур: цвет приводится к палитре клетки, плюс крупные пятна, затенение у леса, мокрый берег
  paintTextured(d, pw, ph, px0, py0, gw, jx, jy, lo, fm, wm) {
    const m = G.map, A = ASSETS.tex;
    const TGT = {
      [T.GRASS]: ['grass', [92, 112, 56]], [T.FIELD]: ['field', [156, 138, 80]], [T.FOREST]: ['forest', [58, 70, 38]],
      [T.WATER]: ['water', [52, 78, 80]], [T.ROAD]: ['road', [132, 112, 84]], [T.BRIDGE]: ['water', [52, 78, 80]],
      [T.RUBBLE]: ['rubble', [112, 102, 92]], [T.SAND]: ['sand', [164, 148, 110]],
    };
    // насколько сохранять контраст фото-текстуры
    const CON = { [T.GRASS]: 0.42, [T.FIELD]: 0.75, [T.FOREST]: 0.6, [T.WATER]: 0.9, [T.ROAD]: 0.75, [T.BRIDGE]: 0.9, [T.RUBBLE]: 0.9, [T.SAND]: 0.7 };
    const L = {};
    for (const t in TGT) {
      const [n, c] = TGT[t], tx = ASSETS.has(n) ? A[n] : A.road;
      L[t] = { d: tx.d, w: tx.w, h: tx.h, kr: c[0] / tx.mean[0], kg: c[1] / tx.mean[1], kb: c[2] / tx.mean[2], c, con: CON[t],
        lum: t == T.WATER || t == T.BRIDGE, ml: (tx.mean[0] + tx.mean[1] * 2 + tx.mean[2]) * 0.25 };
    }
    for (let y = 0; y < ph; y++) {
      const wy = py0 + y, gy = y >> 2;
      const fy = (y & 3) / 4;
      for (let x = 0; x < pw; x++) {
        const wx = px0 + x;
        const k = gy * gw + (x >> 2);
        const sx = Math.floor((wx + jx[k]) / TILE), sy = Math.floor((wy + jy[k]) / TILE);
        let t = m.get(sx, sy);
        const tTrue = m.terr[Math.floor(wy / TILE) * m.W + Math.floor(wx / TILE)];
        if (tTrue === T.BRIDGE || tTrue === T.HOUSE || t === T.BRIDGE || t === T.HOUSE) t = tTrue;
        if (t === T.HOUSE) t = T.GRASS;
        // дорога — по плавной оси; на срезанных углах проступает прежняя земля
        if (this.roadSegGrid && tTrue !== T.BRIDGE && tTrue !== T.HOUSE && t !== T.BRIDGE) {
          const rl = this.roadSegGrid[Math.floor(wy / TILE) * m.W + Math.floor(wx / TILE)];
          if (rl) {
            const dr = this.roadDist(wx / TILE, wy / TILE, rl) + jx[k] * 0.022 - jy[k] * 0.012;
            if (dr < 1.02) t = T.ROAD;
            else if (t === T.ROAD) { t = m.terrPre ? m.terrPre[sy * m.W + sx] : T.GRASS; if (t === T.ROAD || t === T.HOUSE) t = T.GRASS; }
          }
        }
        // река и берег — по плавной линии русла, а не по клеткам
        if (tTrue !== T.BRIDGE && t !== T.BRIDGE) {
          const rd = Math.abs(wx / TILE - m.riverX(wy / TILE)) + jx[k] * 0.03 + jy[k] * 0.015;
          if (rd < 4.4) {
            if (rd < 2.3) { if (tTrue !== T.ROAD) t = T.WATER; }
            else if (rd < 3.35) { if (tTrue !== T.ROAD) t = T.SAND; }
            else if (t === T.WATER || t === T.SAND) t = (tTrue === T.WATER || tTrue === T.SAND) ? T.GRASS : tTrue;
          }
        }
        if (t < 0 || !L[t]) t = T.GRASS;
        // билинейно по сетке 4px
        const fx = (x & 3) / 4, k1 = k + 1, k2 = k + gw, k3 = k2 + 1;
        const lerp4 = (a) => (a[k] * (1 - fx) + a[k1] * fx) * (1 - fy) + (a[k2] * (1 - fx) + a[k3] * fx) * fy;
        const l = lerp4(lo), f = lerp4(fm), w = lerp4(wm);
        const tx = L[t];
        let u = wx, v = wy;
        const fdir = t === T.FIELD ? m.fieldDir[sy * m.W + sx] : 0;
        if (fdir) { u = wy; v = wx; }
        const ti = ((v % tx.h) * tx.w + (u % tx.w)) * 4;
        let br = 0.8 + l * 0.42;
        const cc = tx.c, cn = tx.con;
        let r, g, b;
        if (tx.lum) {
          const dl = ((tx.d[ti] + tx.d[ti + 1] * 2 + tx.d[ti + 2]) * 0.25 - tx.ml) * cn;
          r = cc[0] + dl; g = cc[1] + dl; b = cc[2] + dl;
        } else {
          r = cc[0] + (tx.d[ti] * tx.kr - cc[0]) * cn; g = cc[1] + (tx.d[ti + 1] * tx.kg - cc[1]) * cn; b = cc[2] + (tx.d[ti + 2] * tx.kb - cc[2]) * cn;
        }
        if (t === T.FIELD) {
          // разные посевы: перекрашиваем по яркости текстуры, борозды — полосы поперёк направления
          const fv = m.fieldVar ? m.fieldVar[sy * m.W + sx] : 0;
          const furrow = (((fdir ? wy : wx) % 6) < 2) ? 1 : 0;
          if (fv === 1) {        // пашня
            const lum = (r + g + b) / 3 / 120;
            r = 92 * lum; g = 72 * lum; b = 52 * lum;
            br *= 1 - furrow * 0.12;
          } else if (fv === 2) { // зелёные всходы рядами
            const lum = (r + g + b) / 3 / 120;
            r = 84 * lum; g = 104 * lum; b = 52 * lum;
            if (furrow) { r = r * 0.8 + 18; g = g * 0.75 + 12; b = b * 0.8 + 8; }
          } else if (fv === 3) { // скошенное сено
            const lum = (r + g + b) / 3 / 120;
            r = 150 * lum; g = 140 * lum; b = 92 * lum;
            br *= 1 - furrow * 0.08;
          }
        }
        if (t === T.GRASS || t === T.FIELD || t === T.ROAD) {
          br *= 1 - f * 0.28;                       // тень от опушки
          const wet = Math.max(0, w - 0.05) * 0.5;  // сырая земля у воды
          r *= 1 - wet * 0.5; g *= 1 - wet * 0.3; b *= 1 - wet * 0.35;
        } else if (t === T.FOREST) {
          br *= 0.92 - f * 0.12;
        } else if (t === T.SAND) {
          const wet = clamp((w - 0.25) * 1.6, 0, 1);
          r *= 1 - wet * 0.38; g *= 1 - wet * 0.34; b *= 1 - wet * 0.3;
        } else if (t === T.WATER || t === T.BRIDGE) {
          const deep = clamp((w - 0.55) * 2.4, 0, 1);
          r = r * (1 - deep * 0.45) + 10 * deep; g = g * (1 - deep * 0.38) + 12 * deep; b = b * (1 - deep * 0.25) + 16 * deep;
          const edge = clamp(1 - Math.abs(w - 0.5) * 8, 0, 1); // пена у берега
          r += edge * 30; g += edge * 32; b += edge * 30;
          br = 0.95 + l * 0.1;
        }
        const i = (y * pw + x) * 4;
        d[i] = r * br; d[i + 1] = g * br; d[i + 2] = b * br; d[i + 3] = 255;
      }
    }
  },

  paintOverlays(tx0, ty0, tw, th) {
    const m = G.map, ctx = this.tctx;
    const x0 = tx0 * TILE, y0 = ty0 * TILE, x1 = (tx0 + tw) * TILE, y1 = (ty0 + th) * TILE;
    if (m.scrub) this.paintUndergrowth(ctx, tx0, ty0, tw, th);
    for (const t of G.tracks || []) if (t.x > x0 - 8 && t.x < x1 + 8 && t.y > y0 - 8 && t.y < y1 + 8) this.paintTrack(ctx, t);
    if (G.craters && G.craters.length) {
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
      for (const c of G.craters) if (c[0] > x0 - 30 && c[0] < x1 + 30 && c[1] > y0 - 30 && c[1] < y1 + 30) this.paintCrater(ctx, c);
      ctx.restore();
    }
    for (const b of G.blood || []) if (b[0] > x0 && b[0] < x1 && b[1] > y0 && b[1] < y1) this.paintBlood(ctx, b[0], b[1], b[2]);
    for (const c of G.corpses || []) if (c.x > x0 && c.x < x1 && c.y > y0 && c.y < y1) this.paintCorpse(ctx, c);
    const rng = RNG(m.seed + tx0 * 31 + ty0 * 17);
    // мосты
    for (let y = ty0; y < ty0 + th; y++) for (let x = tx0; x < tx0 + tw; x++) {
      if (m.get(x, y) !== T.BRIDGE) continue;
      const px = x * TILE, py = y * TILE;
      if (ASSETS.pat.planks) {
        ctx.save(); ctx.beginPath(); ctx.rect(px, py, TILE, TILE); ctx.clip();
        ctx.translate(px, py); ctx.rotate(Math.PI / 2); ctx.scale(0.3, 0.3);
        ctx.fillStyle = ASSETS.pat.planks; ctx.fillRect(-200, -200, 400, 400);
        ctx.restore();
        ctx.fillStyle = 'rgba(70,45,25,0.2)'; ctx.fillRect(px, py, TILE, TILE);
      } else {
        ctx.fillStyle = '#6e5236'; ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = 'rgba(40,28,16,0.6)'; ctx.lineWidth = 1;
        for (let k = 0; k < TILE; k += 4) { ctx.beginPath(); ctx.moveTo(px + k + 0.5, py); ctx.lineTo(px + k + 0.5, py + TILE); ctx.stroke(); }
      }
      if (m.get(x, y - 1) !== T.BRIDGE) { ctx.fillStyle = '#4a3420'; ctx.fillRect(px, py, TILE, 2); }
      if (m.get(x, y + 1) !== T.BRIDGE) { ctx.fillStyle = '#4a3420'; ctx.fillRect(px, py + TILE - 2, TILE, 2); }
      if (m.get(x, y - 1) !== T.BRIDGE) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px, py - 4, TILE, 4); }
    }
    // тени деревьев (на земле)
    ctx.fillStyle = 'rgba(12,22,6,0.30)';
    for (const t of this.trees) {
      if (t.tx < tx0 || t.ty < ty0 || t.tx >= tx0 + tw || t.ty >= ty0 + th) continue;
      if (t.tuft !== undefined || t.dead) continue;
      const r = (t.bush ? (t.young ? 7 : 4.5 * (t.sq || 1)) : 9) * t.s;
      ctx.beginPath(); ctx.ellipse(t.x + r * 0.9, t.y - r * 0.35, r * 1.1, r * 0.6, -0.45, 0, Math.PI * 2); ctx.fill();
    }
    // тени домов
    for (const b of m.buildings) {
      if (b.destroyed) continue;
      if (b.x + b.w < tx0 || b.y + b.h < ty0 || b.x > tx0 + tw || b.y > ty0 + th) continue;
      const X0 = b.x * TILE + 2, Y0 = b.y * TILE + 2, X1 = (b.x + b.w) * TILE - 2, Y1 = (b.y + b.h) * TILE - 2;
      ctx.fillStyle = 'rgba(10,15,5,0.38)';
      ctx.beginPath(); ctx.moveTo(X1, Y0); ctx.lineTo(X1 + 26, Y0 - 14); ctx.lineTo(X1 + 26, Y1 - 14); ctx.lineTo(X1, Y1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X0 + 26, Y0 - 14); ctx.lineTo(X1 + 26, Y0 - 14); ctx.lineTo(X1, Y0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(60,55,45,0.6)'; ctx.fillRect(X0 - 1, Y0 - 1, X1 - X0 + 2, Y1 - Y0 + 2);
    }
    // мешки с песком
    for (let y = ty0; y < ty0 + th; y++) for (let x = tx0; x < tx0 + tw; x++) {
      if (!m.inb(x, y) || !m.deco[m.idx(x, y)]) continue;
      this.drawSandbags(ctx, x, y);
    }
    // руины
    for (let y = ty0; y < ty0 + th; y++) for (let x = tx0; x < tx0 + tw; x++) {
      if (m.get(x, y) !== T.RUBBLE) continue;
      for (let k = 0; k < 7; k++) {
        const px = (x + rng()) * TILE, py = (y + rng()) * TILE, s = 2 + rng() * 5;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px + 1.5, py - 1, s, s * 0.7);
        ctx.fillStyle = rng() < 0.4 ? '#8b5a46' : rng() < 0.5 ? '#7a6a5c' : '#5b4e44';
        ctx.fillRect(px, py, s, s * 0.7);
      }
    }
  },

  drawSandbags(ctx, x, y) {
    const px = x * TILE, py = y * TILE;
    for (let k = 0; k < 5; k++) {
      const bx = px + 3 + (k % 3) * 6 + (k > 2 ? 3 : 0), by = py + 7 + (k > 2 ? 6 : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx + 3, by - 1, 7, 5);
      ctx.fillStyle = '#b8a77a'; ctx.beginPath(); ctx.ellipse(bx + 3.5, by + 2.5, 3.6, 2.6, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#8a7a52'; ctx.lineWidth = 0.8; ctx.stroke();
    }
  },

  paintMini() {
    const m = G.map, c = this.mini.getContext('2d');
    const img = c.createImageData(m.W, m.H);
    for (let i = 0; i < m.W * m.H; i++) {
      const col = this.tileColor(m.terr[i]);
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  },

  processDirty() {
    const m = G.map;
    while (m.dirtyRects.length) {
      const [x, y, w, h] = m.dirtyRects.pop();
      this.removeTreesIn(x, y, w, h);
      this.paintRegion(x, y, w, h);
      this.paintMini();
    }
  },

  // ---------------- декали (на землю) ----------------
  // следы гусениц и колёс: остаются только на мягком грунте (земляная дорога, трава, поле, берег);
  // на мосту, в руинах, на мощёном — нет. Хранятся и перерисовываются, не исчезают.
  decalTrack(u) {
    const t = G.map.get(u.tileX, u.tileY);
    const soft = TRACK_SOFT[t];
    if (!soft) return;
    const tr = { x: u.x, y: u.y, a: u.angle, off: u.size[1] * 0.37, w: u.tpl.truck ? 1 : 0, t };
    const arr = (G.tracks = G.tracks || []);
    arr.push(tr);
    if (arr.length > 20000) arr.splice(0, 2000);
    this.paintTrack(this.tctx, tr);
  },
  paintTrack(ctx, tr) {
    const k = TRACK_SOFT[tr.t];
    ctx.save(); ctx.translate(tr.x, tr.y); ctx.rotate(tr.a);
    const off = tr.off;
    if (tr.w) {   // колёса грузовика: две узкие колеи
      ctx.fillStyle = `rgba(${k[0]},${k[1]},${k[2]},${k[3] * 0.9})`;
      ctx.fillRect(-2.6, -off - 0.7, 5.3, 1.4); ctx.fillRect(-2.6, off - 0.7, 5.3, 1.4);
    } else {
      for (const sy of [-off, off]) {
        ctx.fillStyle = `rgba(${k[0]},${k[1]},${k[2]},${k[3]})`;   // продавленная колея
        ctx.fillRect(-2.6, sy - 1.9, 5.3, 3.8);
        ctx.fillStyle = `rgba(${k[0] * 0.6 | 0},${k[1] * 0.6 | 0},${k[2] * 0.6 | 0},${k[3] * 1.1})`;   // отпечатки траков
        for (let i = 0; i < 3; i++) ctx.fillRect(-2.5 + i * 1.75, sy - 1.8, 0.65, 3.6);
        ctx.fillStyle = `rgba(${Math.min(255, k[0] * 1.5) | 0},${Math.min(255, k[1] * 1.45) | 0},${Math.min(255, k[2] * 1.4) | 0},${k[3] * 0.55})`;   // выдавленный край
        ctx.fillRect(-2.6, sy + 1.9, 5.3, 0.6); ctx.fillRect(-2.6, sy - 2.5, 5.3, 0.6);
      }
    }
    ctx.restore();
  },
  decalBlood(x, y, r) {
    const ctx = this.tctx;
    (G.blood = G.blood || []).push([x, y, r]);
    this.paintBlood(ctx, x, y, r);
  },
  paintBlood(ctx, x, y, r) {
    ctx.fillStyle = 'rgba(92,10,6,0.55)';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, (x * 7 + y) % 3, 0, 7); ctx.fill();
  },
  // трупы не исчезают: хранятся в списке и заново рисуются при перерисовке земли
  decalCorpse(u) {
    const c = { x: u.x, y: u.y, a: u.angle + rand(-1, 1), faction: u.faction, type: u.type, tx: u.tileX, ty: u.tileY };
    (G.corpses = G.corpses || []).push(c);
    this.paintCorpse(this.tctx, c);
  },
  paintCorpse(ctx, c) {
    const f = FACTIONS[c.faction];
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
    ctx.fillStyle = 'rgba(80,8,5,0.6)'; ctx.beginPath(); ctx.ellipse(1, 1, 7, 5, 0.3, 0, 7); ctx.fill();
    const A = ASSETS.units;
    if (A && A[c.faction + '_inf_' + c.type]) { ctx.restore(); return; }
    ctx.fillStyle = f.inf; ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = f.helmet; ctx.beginPath(); ctx.arc(4.5, 0.5, 1.8, 0, 7); ctx.fill();
    ctx.strokeStyle = '#1b1712'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-2, 2.5); ctx.lineTo(5, 4); ctx.stroke();
    ctx.restore();
  },
  decalCorpseOld(u) {
    const ctx = this.tctx, f = FACTIONS[u.faction];
    ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(u.angle + rand(-1, 1));
    ctx.fillStyle = 'rgba(70,20,15,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, 5, 3.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = f.inf; ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = f.helmet; ctx.beginPath(); ctx.arc(4.5, 0.5, 1.8, 0, 7); ctx.fill();
    ctx.restore();
  },
  // воронка: тёмная чаша, бруствер выброшенной земли, комья вокруг; хранится и перерисовывается
  decalCrater(x, y, r) {
    const tt = G.map.get(Math.floor(x / TILE), Math.floor(y / TILE));
    if (tt === T.WATER || tt === T.BRIDGE) return;
    r = Math.max(5, r);
    const c = [x, y, r, (Math.random() * 1e9) | 0];
    (G.craters = G.craters || []).push(c);
    this.paintCrater(this.tctx, c);
  },
  paintCrater(ctx, c) {
    const [x, y, r, seed] = c, rnd = RNG(seed);
    ctx.save();
    // опалённая земля
    let g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.2);
    g.addColorStop(0, 'rgba(28,22,15,0.45)'); g.addColorStop(1, 'rgba(28,22,15,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, 7); ctx.fill();
    // бруствер — неровное кольцо светлой вывороченной земли
    const N = 18, rim = [];
    for (let i = 0; i < N; i++) rim.push(r * (1.05 + rnd() * 0.35));
    ctx.beginPath();
    for (let i = 0; i <= N; i++) { const a = i / N * 6.2832, rr = rim[i % N]; i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + rr, y); }
    g = ctx.createLinearGradient(x - r * 1.4, y, x + r * 1.4, y);
    g.addColorStop(0, 'rgba(150,128,94,0.9)'); g.addColorStop(0.5, 'rgba(120,100,72,0.88)'); g.addColorStop(1, 'rgba(84,68,48,0.85)');
    ctx.filter = 'blur(1.2px)'; ctx.fillStyle = g; ctx.fill(); ctx.filter = 'none';
    // чаша: свет с северо-запада, дальний (юго-восточный) склон освещён, ближний в тени
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.78, r * 0.74, rnd() * 3, 0, 7);
    g = ctx.createLinearGradient(x - r * 0.85, y, x + r * 0.85, y);
    g.addColorStop(0, 'rgba(26,19,12,0.95)'); g.addColorStop(0.45, 'rgba(52,41,28,0.93)'); g.addColorStop(0.8, 'rgba(98,82,58,0.92)'); g.addColorStop(1, 'rgba(128,108,78,0.92)');
    ctx.fillStyle = g; ctx.fill();
    // дно
    g = ctx.createRadialGradient(x + r * 0.08, y + r * 0.08, 0, x, y, r * 0.45);
    g.addColorStop(0, 'rgba(14,10,6,0.6)'); g.addColorStop(1, 'rgba(14,10,6,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, 7); ctx.fill();
    // комья земли
    for (let i = 0, n = 6 + r * 1.2; i < n; i++) {
      const a = rnd() * 6.2832, d = r * (1.3 + rnd() * 1.1), s = 0.5 + rnd() * (r > 9 ? 1.6 : 1);
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(70,56,38,0.9)' : 'rgba(110,92,66,0.85)';
      ctx.fillRect(x + Math.cos(a) * d - s / 2, y + Math.sin(a) * d - s / 2, s, s);
    }
    ctx.restore();
  },
  inCrater(x, y) {
    for (const c of G.craters || []) { const dx = x - c[0], dy = y - c[1]; if (dx * dx + dy * dy < c[2] * c[2] * 1.3) return true; }
    return false;
  },

  updateFog() {
    const m = G.map, d = this.fogImg.data, vis = G.vis.player, gen = G.visGen.player, ex = G.explored;
    for (let i = 0; i < m.W * m.H; i++) {
      const a = vis[i] === gen ? 0 : (ex[i] ? 100 : 196);
      d[i * 4] = 22; d[i * 4 + 1] = 20; d[i * 4 + 2] = 15; d[i * 4 + 3] = a;
    }
    this.fctx.putImageData(this.fogImg, 0, 0);
  },

  // ---------------- примитивы ----------------
  poly(ctx, pts) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  },
  // призма над многоугольником pts (мировые [x,y]) от z0 до z1
  prism(ctx, pts, z0, z1, top, side, alpha = 1, outline = true) {
    const n = pts.length;
    let area = 0;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const sgn = area > 0 ? 1 : -1;
    ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    if (z1 > z0) {
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const ex = b[0] - a[0], ey = b[1] - a[1];
        const nx = sgn * ey, ny = -sgn * ex;
        if (nx + ny <= 0.001) continue;
        const len = Math.hypot(nx, ny) || 1;
        const lit = (-0.45 * nx + 0.9 * ny) / len;
        const k = 0.5 + 0.32 * (lit * 0.5 + 0.5);
        const a0 = ISO(a[0], a[1], z0), b0 = ISO(b[0], b[1], z0), b1 = ISO(b[0], b[1], z1), a1 = ISO(a[0], a[1], z1);
        if (this.fine && z1 - z0 > 2) {
          const g = ctx.createLinearGradient(0, a1[1], 0, a0[1]);
          const dust = [side[0] * 0.6 + 52, side[1] * 0.6 + 42, side[2] * 0.6 + 28];
          g.addColorStop(0, rgbStr(side, k * 1.12, alpha)); g.addColorStop(0.55, rgbStr(side, k * 0.92, alpha)); g.addColorStop(1, rgbStr(dust, k * 0.82, alpha));
          ctx.fillStyle = g;
        } else ctx.fillStyle = rgbStr(side, k, alpha);
        ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]); ctx.lineTo(a1[0], a1[1]); ctx.closePath();
        ctx.fill();
        if (this.grime) this.grimeFill(ctx);
        if (outline) ctx.stroke();
      }
    }
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const p = ISO(pts[i][0], pts[i][1], z1); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
    ctx.closePath();
    ctx.fillStyle = rgbStr(top, 1, alpha); ctx.fill();
    if (this.grime) this.grimeFill(ctx);
    if (outline) {
      ctx.stroke();
      if (this.fine) { ctx.strokeStyle = 'rgba(255,255,240,0.13)'; ctx.lineWidth = 0.5; ctx.stroke(); }
    }
  },
  // «грязь» на броне: шумовой узор поверх текущего контура
  makeGrime() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), img = g.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const n = fbm(x / 10, y / 10, 7) * 0.75 + hash2(x, y, 3) * 0.25;
      const v = 255 - Math.max(0, n - 0.32) * 200;
      const i = (y * 64 + x) * 4;
      img.data[i] = v; img.data[i + 1] = v * 0.98; img.data[i + 2] = v * 0.94; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.grimePat = this.ctx.createPattern(c, 'repeat');
  },
  grimeFill(ctx) {
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = this.grimePat; ctx.fill(); ctx.restore();
  },
  // облака: мягкий шум, тени плывут по земле
  makeClouds() {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S);
    // периодический шум: сумма синусоид с целыми частотами
    const rng = RNG(55), waves = [];
    for (let i = 0; i < 14; i++) waves.push([1 + Math.floor(rng() * 4), Math.floor(rng() * 5) - 2, rng() * 6.28, 0.5 + rng()]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let s = 0, n = 0;
      for (const [fx, fy, ph, a] of waves) { s += Math.sin((x * fx + y * fy) / S * 6.283 + ph) * a; n += a; }
      s = s / n * 2.2;
      const a = clamp((s - 0.15) * 1.3, 0, 1);
      const i = (y * S + x) * 4;
      img.data[i] = 20; img.data[i + 1] = 26; img.data[i + 2] = 34; img.data[i + 3] = a * a * 70;
    }
    g.putImageData(img, 0, 0);
    this.cloudPat = this.ctx.createPattern(c, 'repeat');
    this.cloudImg = c;
  },
  drawClouds(ctx) {
    if (!this.cloudPat || !this.wview) return;
    const v = this.wview, T2 = 128 * 14, t = G.time;
    const ox = ((t * 9) % T2 + T2) % T2, oy = ((t * 4) % T2 + T2) % T2;
    for (let y = Math.floor((v.y0 - oy) / T2) * T2 + oy; y < v.y1; y += T2)
      for (let x = Math.floor((v.x0 - ox) / T2) * T2 + ox; x < v.x1; x += T2)
        ctx.drawImage(this.cloudImg, x, y, T2, T2);
  },
  drawVignette(ctx) {
    const w = this.vw, h = this.vh;
    if (!this.vig || this.vig.w !== w || this.vig.h !== h) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.hypot(w, h) * 0.62);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,8,4,0.42)');
      this.vig = { w, h, g };
    }
    ctx.fillStyle = this.vig.g; ctx.fillRect(0, 0, w, h);
  },
  // локальные точки -> мир
  frame(cx, cy, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return (lx, ly) => [cx + lx * c - ly * s, cy + lx * s + ly * c];
  },
  rectL(f, x0, y0, x1, y1) { return [f(x0, y0), f(x1, y0), f(x1, y1), f(x0, y1)]; },
  // рисовать «сверху» на высоте z (для эмблем, лежачих фигур)
  onPlane(ctx, z, fn) { ctx.save(); ctx.transform(1, 0.5, -1, 0.5, 0, -z); fn(); ctx.restore(); },
  groundShadow(ctx, pts, h) {
    const sh = pts.map(p => ISO(p[0] + h * 0.9, p[1] - h * 0.45, 0));
    this.poly(ctx, sh);
    ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.stroke();
    ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fill();
    // контактная тень под корпусом
    const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
    this.poly(ctx, pts.map(p => ISO(c[0] + (p[0] - c[0]) * 1.08, c[1] + (p[1] - c[1]) * 1.08, 0)));
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
  },

  // ---------------- кадр ----------------
  draw() {
    this.processDirty();
    const ctx = this.ctx, c = this.cam, dpr = this.dpr, m = G.map;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e0b'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const z = c.z * dpr;
    // --- земля (аффинная проекция плоской карты) ---
    ctx.setTransform(z, 0.5 * z, -z, 0.5 * z, -c.x * z, -c.y * z);
    const cs = [this.toWorld(0, 0), this.toWorld(this.vw, 0), this.toWorld(0, this.vh), this.toWorld(this.vw, this.vh)];
    const wx0 = clamp(Math.min(...cs.map(p => p.x)) - 40, 0, m.W * TILE), wx1 = clamp(Math.max(...cs.map(p => p.x)) + 40, 0, m.W * TILE);
    const wy0 = clamp(Math.min(...cs.map(p => p.y)) - 40, 0, m.H * TILE), wy1 = clamp(Math.max(...cs.map(p => p.y)) + 40, 0, m.H * TILE);
    this.wview = { x0: wx0, y0: wy0, x1: wx1, y1: wy1 };
    ctx.imageSmoothingEnabled = true;
    if (wx1 > wx0 && wy1 > wy0) ctx.drawImage(this.terrain, wx0, wy0, wx1 - wx0, wy1 - wy0, wx0, wy0, wx1 - wx0, wy1 - wy0);
    // при сильном приближении земля мылится — мелкое зерно поверх возвращает фактуру
    if (this.cam.z > 1.9 && wx1 > wx0 && wy1 > wy0) {
      if (!this.grainPat) {
        const S = 96, c = document.createElement('canvas'); c.width = c.height = S;
        const g = c.getContext('2d'), id = g.createImageData(S, S), rng = RNG(777);
        for (let i = 0; i < S * S; i++) {
          const v = 128 + (rng() - 0.5) * 120 + (rng() < 0.04 ? (rng() - 0.6) * 160 : 0);
          id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255;
        }
        g.putImageData(id, 0, 0);
        this.grainPat = ctx.createPattern(c, 'repeat');
        this.grainPat.setTransform && this.grainPat.setTransform(new DOMMatrix().scale(0.42));
      }
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = Math.min(0.32, (this.cam.z - 1.9) * 0.16);
      ctx.fillStyle = this.grainPat;
      ctx.fillRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
      ctx.restore();
    }
    this.drawGroundMarks(ctx);

    // --- объекты (экранное изо-пространство) ---
    ctx.setTransform(z, 0, 0, z, -c.x * z, -c.y * z);
    this.view = { x0: c.x - 60, y0: c.y - 60, x1: c.x + this.vw / c.z + 60, y1: c.y + this.vh / c.z + 120 };
    const objs = this.collectObjects();
    objs.sort((a, b) => a.d - b.d);
    for (const o of objs) o.draw();
    this.drawProjectiles(ctx);
    this.drawParticles(ctx);
    // --- туман ---
    ctx.setTransform(z, 0.5 * z, -z, 0.5 * z, -c.x * z, -c.y * z);
    this.drawClouds(ctx);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fog, 0, 0, m.W * TILE, m.H * TILE);
    // --- поверх ---
    ctx.setTransform(z, 0, 0, z, -c.x * z, -c.y * z);
    this.drawOverlay(ctx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawVignette(ctx);
    UI.drawScreen(ctx);
  },
  inView(x, y, h = 0) {
    const ix = x - y, iy = (x + y) * 0.5;
    const v = this.view;
    return ix > v.x0 && ix < v.x1 && iy - h > v.y0 - 40 && iy < v.y1;
  },
  explored(x, y) {
    const m = G.map, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    return m.inb(tx, ty) && G.explored[ty * m.W + tx];
  },

  collectObjects() {
    const ctx = this.ctx, m = G.map, out = [];
    // занятость клеток видимыми юнитами — для прозрачности деревьев и домов
    const occ = this.occ; occ.fill(0);
    const units = [];
    for (const u of G.units) {
      if (!u.alive || !(u.side === 'player' || u.visibleTo.player)) continue;
      if (!this.inView(u.x, u.y, 30)) continue;
      units.push(u);
      const tx = u.tileX, ty = u.tileY;
      for (let oy = 0; oy <= 2; oy++) for (let ox = 0; ox <= 2; ox++) {
        if (m.inb(tx + ox, ty + oy)) occ[(ty + oy) * m.W + tx + ox] = 1;
      }
    }
    const grassOK = this.cam.z > 0.9;
    for (const t of this.trees) {
      if (t.dead || (t.tuft !== undefined && !grassOK)) continue;
      if (!this.inView(t.x, t.y, 50)) continue;
      if (!G.explored[t.ty * m.W + t.tx]) continue;
      out.push({ d: t.x + t.y, draw: () => this.drawTree(ctx, t, occ[t.ty * m.W + t.tx]) });
    }
    for (const b of m.buildings) {
      if (b.destroyed) continue;
      const cx = (b.x + b.w / 2) * TILE, cy = (b.y + b.h / 2) * TILE;
      if (!this.inView(cx, cy, 60)) continue;
      if (!G.explored[Math.floor(cy / TILE) * m.W + Math.floor(cx / TILE)]) continue;
      let hide = false;
      for (let y = b.y; y < b.y + b.h + 1 && !hide; y++) for (let x = b.x; x < b.x + b.w + 1; x++) if (occ[y * m.W + x]) { hide = true; break; }
      out.push({ d: (b.x + b.w * 0.5) * TILE + (b.y + b.h * 0.5) * TILE, draw: () => this.drawHouse(ctx, b, hide) });
    }
    const A = ASSETS.units;
    if (A && m.props) {
      for (const p of m.props) {
        if (!p.alive || !this.inView(p.x, p.y, 40) || !G.explored[p.ty * m.W + p.tx]) continue;
        const sp = A['prop_' + p.k];
        if (!sp) continue;
        // поваленные заборы лежат на земле — рисуем раньше всего остального в этой точке
        out.push({ d: p.x + p.y - (p.broken ? 30 : 0), draw: () => this.blit(ctx, sp.img, sp.h[0], p.x, p.y) });
      }
    }
    if (A && G.corpses) {
      for (const c of G.corpses) {
        if (!this.inView(c.x, c.y, 10) || !G.explored[c.ty * m.W + c.tx]) continue;
        const sp = A[c.faction + '_inf_' + c.type];
        if (!sp || !sp.prone) continue;
        out.push({ d: c.x + c.y - 12, draw: () => this.blit(ctx, ASSETS.corpseImg(sp), sp.prone[this.dirIdx(c.a, sp.prone.length)], c.x, c.y) });
      }
    }
    for (const w of G.wrecks) {
      if (!this.inView(w.x, w.y, 20) || !this.explored(w.x, w.y)) continue;
      out.push({ d: w.x + w.y, draw: () => this.drawWreck(ctx, w) });
    }
    for (const f of MISSION.flags) {
      const x = (f.x + 0.5) * TILE, y = (f.y + 0.5) * TILE;
      if (!this.inView(x, y, 40)) continue;
      out.push({ d: x + y, draw: () => this.drawFlag(ctx, f, x, y) });
    }
    for (const u of units) out.push({ d: u.x + u.y + 1, draw: () => this.drawUnit(ctx, u) });
    return out;
  },

  // ---------------- метки на земле ----------------
  drawGroundMarks(ctx) {
    // зоны захвата
    for (const f of MISSION.flags) {
      const x = (f.x + 0.5) * TILE, y = (f.y + 0.5) * TILE, r = f.r * TILE;
      const own = f.owner === 'player' ? '#5fd35f' : f.owner === 'enemy' ? '#e05a4a' : '#d8d8d8';
      ctx.save();
      ctx.setLineDash([6, 6]); ctx.lineDashOffset = -G.time * 8;
      ctx.strokeStyle = own; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 0.9;
      const v = f.v / 100;
      ctx.lineWidth = 4; ctx.strokeStyle = v >= 0 ? '#5fd35f' : '#e05a4a';
      ctx.beginPath(); ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.abs(v)); ctx.stroke();
      ctx.restore();
    }
    for (const u of G.selection) {
      if (!u.alive) continue;
      const r = u.cls === 'inf' ? 6 : u.radius + 5;
      ctx.strokeStyle = '#8cff6a'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(u.x, u.y, r, 0, Math.PI * 2); ctx.stroke();
      if (u.path && u.pathI < u.path.length) {
        ctx.strokeStyle = u.order && u.order.type === 'amove' ? 'rgba(255,120,90,0.45)' : 'rgba(150,255,120,0.4)';
        ctx.setLineDash([4, 5]); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(u.x, u.y);
        for (let i = u.pathI; i < u.path.length; i++) ctx.lineTo(u.path[i].x, u.path[i].y);
        ctx.stroke(); ctx.setLineDash([]);
      }
      if (u.order && u.order.type === 'fireground') {
        ctx.strokeStyle = 'rgba(255,90,60,0.7)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(u.order.x, u.order.y, 2 * TILE, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(u.order.x - 8, u.order.y); ctx.lineTo(u.order.x + 8, u.order.y); ctx.moveTo(u.order.x, u.order.y - 8); ctx.lineTo(u.order.x, u.order.y + 8); ctx.stroke();
      }
      if (u.tpl.truck) { ctx.fillStyle = 'rgba(140,255,120,0.07)'; ctx.beginPath(); ctx.arc(u.x, u.y, 3.5 * TILE, 0, 7); ctx.fill(); }
    }
    if (G.selection.size === 1) {
      const u = [...G.selection][0];
      const w = u.weapons.find(w => w.def.main) || u.weapons[0];
      if (w) {
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(u.x, u.y, w.def.range * TILE, 0, 7); ctx.stroke();
        if (w.def.minRange) { ctx.strokeStyle = 'rgba(255,90,60,0.25)'; ctx.beginPath(); ctx.arc(u.x, u.y, w.def.minRange * TILE, 0, 7); ctx.stroke(); }
      }
      ctx.strokeStyle = 'rgba(120,200,255,0.14)';
      ctx.beginPath(); ctx.arc(u.x, u.y, u.vision * TILE, 0, 7); ctx.stroke();
    }
    const h = UI.hover;
    if (h && h.alive && h.side === 'enemy' && h.visibleTo.player) {
      const r = h.cls === 'inf' ? 7 : h.radius + 6;
      ctx.strokeStyle = '#ff5a40'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, 7); ctx.stroke();
    }
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const mk = this.markers[i];
      mk.life -= 1 / 60;
      if (mk.life <= 0) { this.markers.splice(i, 1); continue; }
      ctx.strokeStyle = mk.color; ctx.globalAlpha = mk.life; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(mk.x, mk.y, 4 + (1 - mk.life) * 12, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  },

  // ---------------- деревья и дома ----------------
  drawTree(ctx, t, seeThrough) {
    const [ix, iy] = ISO(t.x, t.y);
    if (t.tuft !== undefined) {
      const spr = this.tuftSprites[t.tuft], w = 12 * t.s, h = 10.5 * t.s;
      ctx.drawImage(spr, ix - w / 2, iy - h * 0.93, w, h);
      return;
    }
    if (t.bush && !t.young && ASSETS.trees) {   // куст в зарослях: шире и ниже одиночного, разный оттенок
      const A = ASSETS.trees;
      if (!this.treeKinds) {
        this.treeKinds = {};
        for (const e of A.list) (this.treeKinds[e.k] = this.treeKinds[e.k] || []).push(e);
      }
      const list = this.treeKinds.bush;
      const e = list[Math.floor(hash2(Math.floor(t.x), Math.floor(t.y), 77) * list.length)];
      const hh = 13 * t.s, ww = e.w * (hh / e.h) * (t.sq || 1);
      const scr = hh * this.cam.z * this.dpr / e.h;
      const lv = scr < 0.25 ? 2 : scr < 0.5 ? 1 : 0, q = 1 << lv;
      if (!this.bushMips) {   // затемнённые копии атласа: кусты в тон траве, три оттенка
        this.bushMips = ['brightness(0.8) saturate(0.85)', 'brightness(0.66) saturate(0.8) hue-rotate(-6deg)', 'brightness(0.74) saturate(0.95) hue-rotate(8deg)'].map(f =>
          A.mips.map(im => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.filter = f; g.drawImage(im, 0, 0); return c; }));
      }
      const vI = Math.floor(hash2(Math.floor(t.y), Math.floor(t.x), 78) * 3);
      ctx.drawImage(this.bushMips[vI][lv], e.x / q, e.y / q, e.w / q, e.h / q, ix - ww / 2, iy - hh + 2.5, ww, hh);
      return;
    }
    if (seeThrough && !t.bush) ctx.globalAlpha = 0.38;
    const A = ASSETS.trees;
    if (A) {
      const kind = t.v < 5 ? 'leafy' : t.v < 8 ? 'pine' : 'bush';
      if (!this.treeKinds) {
        this.treeKinds = {};
        for (const e of A.list) (this.treeKinds[e.k] = this.treeKinds[e.k] || []).push(e);
      }
      const list = this.treeKinds[kind] || this.treeKinds.leafy;
      const e = list[Math.floor(hash2(t.tx * 7 + t.x, t.ty * 3 + t.y, 77) * list.length)];
      const hh = (kind === 'bush' ? 15 : kind === 'pine' ? 58 : 52) * t.s;
      const k = hh / e.h;
      const scr = hh * this.cam.z * this.dpr / e.h;
      const lv = scr < 0.25 ? 2 : scr < 0.5 ? 1 : 0, q = 1 << lv;
      ctx.drawImage(A.mips[lv], e.x / q, e.y / q, e.w / q, e.h / q, ix - e.fx * k, iy - hh + 2, e.w * k, hh);
    } else {
      const spr = this.treeSprites[t.v];
      const w = 32 * t.s, h = 48 * t.s;
      ctx.drawImage(spr, ix - w / 2, iy - h * 0.96, w, h);
    }
    ctx.globalAlpha = 1;
  },

  // текстура на грань: clip — многоугольник (экран), o — начало, du/dv — экранный вектор на единицу мира по осям текстуры
  texPoly(ctx, pat, clip, o, du, dv, density, tint, outline = true) {
    ctx.save();
    this.poly(ctx, clip); ctx.clip();
    ctx.save();
    ctx.transform(du[0] * density, du[1] * density, dv[0] * density, dv[1] * density, o[0], o[1]);
    ctx.fillStyle = pat; ctx.fillRect(-400, -400, 800, 800);
    ctx.restore();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgbStr(tint); ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
    ctx.restore();
    if (outline) { this.poly(ctx, clip); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.6; ctx.stroke(); }
  },

  drawHouseTex(ctx, b, hide) {
    const X0 = b.x * TILE + 2, Y0 = b.y * TILE + 2, X1 = (b.x + b.w) * TILE - 2, Y1 = (b.y + b.h) * TILE - 2;
    const wallH = 19, roofH = 13, top = wallH + roofH;
    const P = ASSETS.pat;
    const hv = hash2(b.x, b.y, 5);
    const logs = hv < 0.35 && !!P.logs;
    const wallPat = logs ? P.logs : P.wall;
    const dmg = b.hp / b.maxHp;
    const dk = dmg < 0.5 ? 0.7 : 1;
    const wallC = logs ? [255, 235, 210] : [250, 240, 222];
    const wc = (k) => [wallC[0] * k * dk, wallC[1] * k * dk, wallC[2] * k * dk];
    const rc = rgbOf(b.roof);
    const thatch = rc[0] < rc[1] + 30 && rc[0] < 150 && !!P.thatch; // тёмные/серые крыши — солома
    const roofPat = thatch ? P.thatch : P.roof;
    const roofT = thatch ? [235, 220, 190] : rc.map(c => Math.min(255, 90 + c * 1.5));
    const rk = (k) => [roofT[0] * k * dk, roofT[1] * k * dk, roofT[2] * k * dk];
    ctx.globalAlpha = hide ? 0.45 : 1;
    const DX = [1, 0.5], DY = [-1, 0.5], DOWN = [0, 1];
    const dens = logs ? 0.22 : 0.3;
    // южная стена (Y1) и восточная (X1)
    const sTop = ISO(X0, Y1, wallH);
    this.texPoly(ctx, wallPat, [ISO(X0, Y1, 0), ISO(X1, Y1, 0), ISO(X1, Y1, wallH), sTop], sTop, DX, DOWN, dens, wc(0.88));
    const eTop = ISO(X1, Y1, wallH);
    this.texPoly(ctx, wallPat, [ISO(X1, Y1, 0), ISO(X1, Y0, 0), ISO(X1, Y0, wallH), eTop], eTop, DY, DOWN, dens, wc(0.62));
    // затенение у земли
    const ao = (a, b2) => {
      const p0 = ISO(a[0], a[1], 0), p1 = ISO(b2[0], b2[1], 0);
      const g = ctx.createLinearGradient(0, p0[1], 0, p0[1] - 7);
      g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; this.poly(ctx, [p0, p1, [p1[0], p1[1] - 7], [p0[0], p0[1] - 7]]); ctx.fill();
    };
    ao([X0, Y1], [X1, Y1]); ao([X1, Y1], [X1, Y0]);
    // окна и дверь
    const win = (pts, glass) => {
      this.poly(ctx, pts);
      if (glass) {
        const g = ctx.createLinearGradient(pts[3][0], pts[3][1], pts[1][0], pts[1][1]);
        g.addColorStop(0, '#5d6d78'); g.addColorStop(0.5, '#1f2830'); g.addColorStop(1, '#2c3a44');
        ctx.fillStyle = dmg < 0.5 ? '#151515' : g;
      } else ctx.fillStyle = '#4a3020';
      ctx.fill();
      ctx.strokeStyle = logs ? '#d8d0b8' : '#5a4632'; ctx.lineWidth = 0.9; ctx.stroke();
    };
    for (let x = X0 + 6; x + 6 < X1 - 2; x += 14) {
      win([ISO(x, Y1, 7), ISO(x + 6, Y1, 7), ISO(x + 6, Y1, 14), ISO(x, Y1, 14)], true);
      const a = ISO(x + 3, Y1, 7), c = ISO(x + 3, Y1, 14); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...c); ctx.stroke();
    }
    for (let y = Y0 + 6; y + 6 < Y1 - 2; y += 14) {
      win([ISO(X1, y, 7), ISO(X1, y + 6, 7), ISO(X1, y + 6, 14), ISO(X1, y, 14)], true);
      const a = ISO(X1, y + 3, 7), c = ISO(X1, y + 3, 14); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...c); ctx.stroke();
    }
    const dx = X0 + (X1 - X0) * 0.5 + 2;
    win([ISO(dx, Y1, 0), ISO(dx + 6, Y1, 0), ISO(dx + 6, Y1, 11), ISO(dx, Y1, 11)], false);
    // крыша
    const o = 2;
    if (b.ridgeH) {
      const Ym = (Y0 + Y1) / 2;
      const gt = ISO(X1, Ym, top);
      this.texPoly(ctx, wallPat, [ISO(X1, Y1, wallH), ISO(X1, Y0, wallH), gt], gt, DY, DOWN, dens, wc(0.55));
      const sl = Math.hypot(Ym - Y0 + o, roofH + 1);
      const n0 = ISO(X0 - o, Y0 - o, wallH - 1), n1 = ISO(X1 + o, Y0 - o, wallH - 1), r0 = ISO(X0 - o, Ym, top), r1 = ISO(X1 + o, Ym, top);
      this.texPoly(ctx, roofPat, [n0, n1, r1, r0], r0, DX, [(n0[0] - r0[0]) / sl, (n0[1] - r0[1]) / sl], 0.3, rk(0.62));
      const s0 = ISO(X0 - o, Y1 + o, wallH - 1), s1 = ISO(X1 + o, Y1 + o, wallH - 1);
      this.texPoly(ctx, roofPat, [s0, s1, r1, r0], r0, DX, [(s0[0] - r0[0]) / sl, (s0[1] - r0[1]) / sl], 0.3, rk(0.98));
      ctx.strokeStyle = 'rgba(30,20,15,0.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(...r0); ctx.lineTo(...r1); ctx.stroke();
      // тень карниза на стене
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; this.poly(ctx, [ISO(X0, Y1, wallH), ISO(X1, Y1, wallH), ISO(X1, Y1, wallH - 3), ISO(X0, Y1, wallH - 3)]); ctx.fill();
    } else {
      const Xm = (X0 + X1) / 2;
      const gt = ISO(Xm, Y1, top);
      this.texPoly(ctx, wallPat, [ISO(X0, Y1, wallH), ISO(X1, Y1, wallH), gt], gt, DX, DOWN, dens, wc(0.85));
      const sl = Math.hypot(Xm - X0 + o, roofH + 1);
      const w0 = ISO(X0 - o, Y0 - o, wallH - 1), w1 = ISO(X0 - o, Y1 + o, wallH - 1), r0 = ISO(Xm, Y0 - o, top), r1 = ISO(Xm, Y1 + o, top);
      this.texPoly(ctx, roofPat, [w0, w1, r1, r0], r0, DY, [(w0[0] - r0[0]) / sl, (w0[1] - r0[1]) / sl], 0.3, rk(0.95));
      const e0 = ISO(X1 + o, Y0 - o, wallH - 1), e1 = ISO(X1 + o, Y1 + o, wallH - 1);
      this.texPoly(ctx, roofPat, [e0, e1, r1, r0], r0, DY, [(e0[0] - r0[0]) / sl, (e0[1] - r0[1]) / sl], 0.3, rk(0.68));
      ctx.strokeStyle = 'rgba(30,20,15,0.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(...r0); ctx.lineTo(...r1); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; this.poly(ctx, [ISO(X1, Y1, wallH), ISO(X1, Y0, wallH), ISO(X1, Y0, wallH - 3), ISO(X1, Y1, wallH - 3)]); ctx.fill();
    }
    // труба
    const cx = X0 + (X1 - X0) * 0.7, cy = Y0 + (Y1 - Y0) * 0.35;
    this.prism(ctx, [[cx, cy], [cx + 4, cy], [cx + 4, cy + 4], [cx, cy + 4]], wallH + 6, top + 4, [70, 60, 55], [120, 96, 82]);
    ctx.globalAlpha = 1;
  },

  drawHouse(ctx, b, hide) {
    if (ASSETS.pat.wall && ASSETS.pat.roof) {
      // дом рисуется один раз в отдельный холст и дальше выводится картинкой
      const dmg = b.hp / b.maxHp, key = dmg < 0.5 ? 1 : 0;
      if (!b._spr || b._sprKey !== key) {
        const X0 = b.x * TILE, Y0 = b.y * TILE, X1 = (b.x + b.w) * TILE, Y1 = (b.y + b.h) * TILE;
        const pts = [ISO(X0, Y0, 40), ISO(X1, Y0, 40), ISO(X0, Y1, 40), ISO(X1, Y1, 0), ISO(X0, Y1, 0), ISO(X1, Y0, 0)];
        const mx = Math.min(...pts.map(p => p[0])) - 4, my = Math.min(...pts.map(p => p[1])) - 4;
        const Mx = Math.max(...pts.map(p => p[0])) + 4, My = Math.max(...pts.map(p => p[1])) + 4;
        const S = Math.min(4, 2.5 * this.dpr);
        const c = b._spr || document.createElement('canvas');
        c.width = Math.ceil((Mx - mx) * S); c.height = Math.ceil((My - my) * S);
        const g = c.getContext('2d');
        g.setTransform(S, 0, 0, S, -mx * S, -my * S);
        this.drawHouseTex(g, b, false);
        b._spr = c; b._sprKey = key; b._sprBox = [mx, my, Mx - mx, My - my];
      }
      ctx.globalAlpha = hide ? 0.45 : 1;
      const [x, y, w, h] = b._sprBox;
      ctx.drawImage(b._spr, x, y, w, h);
      ctx.globalAlpha = 1;
      const X0 = b.x * TILE + 2, Y0 = b.y * TILE + 2, X1 = (b.x + b.w) * TILE - 2, Y1 = (b.y + b.h) * TILE - 2;
      if (key && Math.random() < 0.05) spawnParticle('smoke', (X0 + X1) / 2, (Y0 + Y1) / 2, { z: 32, vz: 12, size: 4, life: 2 });
      else if (hash2(b.x, b.y, 5) > 0.7 && Math.random() < 0.012) spawnParticle('smoke', X0 + (X1 - X0) * 0.7 + 2, Y0 + (Y1 - Y0) * 0.35 + 2, { z: 37, vz: 8, size: 2.5, life: 3 });
      return;
    }
    const X0 = b.x * TILE + 2, Y0 = b.y * TILE + 2, X1 = (b.x + b.w) * TILE - 2, Y1 = (b.y + b.h) * TILE - 2;
    const wallH = 19, roofH = 13, top = wallH + roofH;
    const a = hide ? 0.45 : 1;
    const dmg = b.hp / b.maxHp;
    const wall = dmg < 0.5 ? [150, 140, 120] : [204, 192, 164];
    const roof = rgbOf(b.roof);
    ctx.globalAlpha = a;
    // стены (видимые грани: юг и восток)
    this.prism(ctx, [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]], 0, wallH, wall, wall, 1, true);
    // окна
    ctx.fillStyle = 'rgba(40,48,58,0.9)';
    const win = (pA, pB, pC, pD) => { ctx.beginPath(); ctx.moveTo(...pA); ctx.lineTo(...pB); ctx.lineTo(...pC); ctx.lineTo(...pD); ctx.closePath(); ctx.fill(); };
    for (let x = X0 + 6; x + 6 < X1 - 2; x += 14) win(ISO(x, Y1, 7), ISO(x + 6, Y1, 7), ISO(x + 6, Y1, 14), ISO(x, Y1, 14));
    for (let y = Y0 + 6; y + 6 < Y1 - 2; y += 14) win(ISO(X1, y, 7), ISO(X1, y + 6, 7), ISO(X1, y + 6, 14), ISO(X1, y, 14));
    // дверь
    ctx.fillStyle = 'rgba(70,45,28,0.95)';
    const dx = X0 + (X1 - X0) * 0.5 + 2;
    win(ISO(dx, Y1, 0), ISO(dx + 6, Y1, 0), ISO(dx + 6, Y1, 11), ISO(dx, Y1, 11));
    // крыша
    const fill = (pts, k) => { ctx.fillStyle = rgbStr(roof, k); this.poly(ctx, pts); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.6; ctx.stroke(); };
    const lines = (p0, p1, q0, q1, n) => {
      ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 0.6;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        ctx.beginPath(); ctx.moveTo(p0[0] + (q0[0] - p0[0]) * t, p0[1] + (q0[1] - p0[1]) * t); ctx.lineTo(p1[0] + (q1[0] - p1[0]) * t, p1[1] + (q1[1] - p1[1]) * t); ctx.stroke();
      }
    };
    const o = 2; // свес
    if (b.ridgeH) {
      const Ym = (Y0 + Y1) / 2;
      ctx.fillStyle = rgbStr(wall, 0.72); this.poly(ctx, [ISO(X1, Y0, wallH), ISO(X1, Y1, wallH), ISO(X1, Ym, top)]); ctx.fill();
      const n0 = ISO(X0 - o, Y0 - o, wallH - 1), n1 = ISO(X1 + o, Y0 - o, wallH - 1), r0 = ISO(X0 - o, Ym, top), r1 = ISO(X1 + o, Ym, top);
      fill([n0, n1, r1, r0], 0.75);
      const s0 = ISO(X0 - o, Y1 + o, wallH - 1), s1 = ISO(X1 + o, Y1 + o, wallH - 1);
      fill([s0, s1, r1, r0], 1.05);
      lines(s0, s1, r0, r1, 5);
    } else {
      const Xm = (X0 + X1) / 2;
      ctx.fillStyle = rgbStr(wall, 0.92); this.poly(ctx, [ISO(X0, Y1, wallH), ISO(X1, Y1, wallH), ISO(Xm, Y1, top)]); ctx.fill();
      const w0 = ISO(X0 - o, Y0 - o, wallH - 1), w1 = ISO(X0 - o, Y1 + o, wallH - 1), r0 = ISO(Xm, Y0 - o, top), r1 = ISO(Xm, Y1 + o, top);
      fill([w0, w1, r1, r0], 1.0);
      const e0 = ISO(X1 + o, Y0 - o, wallH - 1), e1 = ISO(X1 + o, Y1 + o, wallH - 1);
      fill([e0, e1, r1, r0], 0.8);
      lines(e0, e1, r0, r1, 5);
    }
    // труба
    const cx = X0 + (X1 - X0) * 0.7, cy = Y0 + (Y1 - Y0) * 0.35;
    this.prism(ctx, [[cx, cy], [cx + 4, cy], [cx + 4, cy + 4], [cx, cy + 4]], wallH + 6, top + 4, [70, 60, 55], [110, 92, 80]);
    if (dmg < 0.5 && Math.random() < 0.05) spawnParticle('smoke', (X0 + X1) / 2, (Y0 + Y1) / 2, { z: top, vz: 12, size: 4, life: 2 });
    ctx.globalAlpha = 1;
  },

  drawFlag(ctx, f, x, y) {
    const fac = f.owner === 'player' ? FACTIONS[G.sides.player.faction] : f.owner === 'enemy' ? FACTIONS[G.sides.enemy.faction] : null;
    const [bx, by] = ISO(x, y);
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - 40); ctx.stroke();
    const wave = Math.sin(G.time * 4);
    ctx.fillStyle = fac ? fac.flag : '#eeeeee';
    ctx.beginPath(); ctx.moveTo(bx, by - 40); ctx.quadraticCurveTo(bx + 9, by - 42 + wave * 2, bx + 18, by - 40 + wave);
    ctx.lineTo(bx + 18, by - 29 + wave); ctx.quadraticCurveTo(bx + 9, by - 31 + wave * 2, bx, by - 29); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.5; ctx.stroke();
    if (fac) { ctx.fillStyle = fac.flag2; ctx.beginPath(); ctx.arc(bx + 9, by - 35 + wave, 2.5, 0, 7); ctx.fill(); }
    ctx.font = 'bold 13px Arial'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText(f.id, bx - 14, by - 30); ctx.fillText(f.id, bx - 14, by - 30);
  },

  // ---------------- юниты ----------------
  drawUnit(ctx, u) {
    const f = FACTIONS[u.faction];
    if (u.cls === 'inf') { this.drawInf(ctx, u, f); return; }
    const [ix, iy] = ISO(u.x, u.y);
    this.grimePat.setTransform(new DOMMatrix().translate(ix, iy).scale(0.6));
    this.fine = true; this.grime = true;
    if (u.cls === 'gun') this.drawGun(ctx, u, f);
    else if (u.tpl.truck) this.drawTruck(ctx, u, f);
    else this.drawTank(ctx, u, f);
    this.fine = false; this.grime = false;
  },

  // фигурка солдата в точке (x, y), смотрит под углом ang
  figure(ctx, x, y, ang, f, type, moving, anim, prone, aiming, u) {
    const A = ASSETS.units, sp = A && A[f.id + '_inf_' + type];
    if (sp) {
      let pose;
      const wd = u && u.walkD != null ? u.walkD : anim * 24;
      if (prone) pose = moving && sp.c0 ? 'c' + (Math.floor(wd / 7 * 4) % 4) : 'prone';   // ползком: цикл 4 кадра на ~1,6 м
      else if (u && u.throwT > 0 && sp.throw) pose = 'throw';
      else if (moving) pose = sp.w7 ? 'w' + (Math.floor(wd / 11 * 8) % 8) : 'w' + (Math.floor(wd / 11 * 6) % 6);   // шаг по пройденному пути — ноги не скользят
      else pose = aiming ? 'aim' : 'stand';
      const fr = sp[pose];
      if (fr) { this.blit(ctx, sp.img, fr[this.dirIdx(ang, fr.length)], x, y); return; }
    }
    const [sx, sy] = ISO(x, y);
    const fx = Math.cos(ang) - Math.sin(ang), fy = (Math.cos(ang) + Math.sin(ang)) * 0.5;
    const fl = Math.hypot(fx, fy) || 1;
    const dx = fx / fl, dy = fy / fl;
    const body = rgbOf(type === 'sniper' ? this.darken(f.inf) : f.inf), helmet = rgbOf(f.helmet);
    if (prone) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx + 1.5, sy + 0.5, 5, 2.4, 0, 0, 7); ctx.fill();
      this.onPlane(ctx, 1.5, () => {
        ctx.translate(x, y); ctx.rotate(ang);
        ctx.strokeStyle = '#1e1a14'; ctx.lineWidth = type === 'mg' ? 1.8 : 1.1;
        ctx.beginPath(); ctx.moveTo(1, 1.6); ctx.lineTo(9, 1.6); ctx.stroke();
        ctx.fillStyle = rgbStr(body); ctx.beginPath(); ctx.ellipse(-2, 0, 5, 2.2, 0, 0, 7); ctx.fill();
        ctx.fillStyle = rgbStr(helmet); ctx.beginPath(); ctx.arc(2.6, 0, 2.2, 0, 7); ctx.fill();
      });
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(sx + 2, sy + 0.5, 3.6, 1.8, 0, 0, 7); ctx.fill();
    const sw = moving ? Math.sin(anim * 13) * 1.6 : 0;
    // ноги
    ctx.strokeStyle = rgbStr(body, 0.6); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx - 1 + dx * sw, sy + dy * sw * 0.5); ctx.lineTo(sx - 0.8, sy - 4.5);
    ctx.moveTo(sx + 1 - dx * sw, sy - dy * sw * 0.5); ctx.lineTo(sx + 0.8, sy - 4.5); ctx.stroke();
    const weapon = () => {
      const len = type === 'sniper' ? 10 : type === 'mg' ? 9 : type === 'at' ? 8 : type === 'smg' ? 5.5 : 8;
      const hz = aiming ? 9 : 8;
      ctx.strokeStyle = '#1b1712'; ctx.lineWidth = type === 'mg' ? 1.7 : type === 'at' ? 2.3 : 1.1;
      ctx.beginPath(); ctx.moveTo(sx + dx * 0.5, sy - hz); ctx.lineTo(sx + dx * len, sy - hz + dy * len * 0.6); ctx.stroke();
    };
    const back = dy < 0;
    if (back) weapon();
    // корпус
    ctx.fillStyle = rgbStr(body);
    ctx.beginPath(); ctx.moveTo(sx - 2.4, sy - 4.5); ctx.lineTo(sx + 2.4, sy - 4.5); ctx.lineTo(sx + 2.2, sy - 10); ctx.lineTo(sx - 2.2, sy - 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgbStr(body, 1.25); ctx.fillRect(sx - 2.2, sy - 10, 1.6, 5.5);
    // голова
    ctx.fillStyle = '#c9a07a'; ctx.beginPath(); ctx.arc(sx + dx * 0.4, sy - 11.2, 1.5, 0, 7); ctx.fill();
    ctx.fillStyle = rgbStr(helmet); ctx.beginPath(); ctx.ellipse(sx, sy - 12, 2.3, 1.6, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = rgbStr(helmet, 1.3); ctx.fillRect(sx - 1.2, sy - 13.2, 1.1, 0.8);
    if (!back) weapon();
  },
  darken(hex) { const c = rgbOf(hex); return [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75]; },

  drawInf(ctx, u, f) {
    const prone = u.isProne();
    const aiming = u.weapons.some(w => w.target) && !u.moving;
    this.figure(ctx, u.x, u.y, u.angle, f, u.type, u.moving, u.anim, prone, aiming, u);
    this.drawBars(ctx, u, prone ? 5 : 13);
  },

  // ---- спрайты техники из Blender ----
  sprOf(u) { const A = ASSETS.units; return A && A[u.faction + '_' + u.type]; },
  dirIdx(a, n = UNIT_SPRITES.dirs) { return ((Math.round(a / (Math.PI * 2) * n) % n) + n) % n; },
  blit(ctx, img, fr, wx, wy) {
    if (!fr) return;
    const S = fr[6] || UNIT_SPRITES.S, [ix, iy] = ISO(wx, wy, 0);
    ctx.drawImage(img, fr[0], fr[1], fr[2], fr[3], ix - fr[4] / S, iy - fr[5] / S, fr[2] / S, fr[3] / S);
  },
  muzzleFlash(ctx, x, y, z) {
    const [mx, my] = ISO(x, y, z);
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, 7);
    g.addColorStop(0, 'rgba(255,250,210,1)'); g.addColorStop(0.35, 'rgba(255,190,80,0.85)'); g.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, 7, 0, 7); ctx.fill();
  },
  drawTankSprite(ctx, u, f, wreck, sp) {
    const [L] = u.size;
    const heavy = u.type === 'heavy', light = u.type === 'light';
    const img = wreck ? ASSETS.wreckImg(sp) : sp.img;
    this.blit(ctx, img, sp.h[this.dirIdx(u.angle)], u.x, u.y);
    const ta = wreck ? u.tAngle + 0.35 : u.tAngle;
    // ось башни из модели (смещение вперёд и вбок от центра корпуса)
    const [ox, oy] = sp.to || [0, 0];
    const ca = Math.cos(u.angle), sa = Math.sin(u.angle);
    const recoil = u.recoil || 0;
    if (u.recoil) u.recoil = Math.max(0, u.recoil - 0.08);
    const tcx = u.x + ca * ox - sa * oy - Math.cos(ta) * recoil * 1.5, tcy = u.y + sa * ox + ca * oy - Math.sin(ta) * recoil * 1.5;
    this.blit(ctx, img, sp.t[this.dirIdx(ta)], tcx, tcy);
    if (!wreck && u.flash > 0) {
      const r = (sp.mr || L) + 2, z = sp.mz || 11;
      this.muzzleFlash(ctx, tcx + Math.cos(ta) * r, tcy + Math.sin(ta) * r, z);
    }
    if (!wreck) this.drawBars(ctx, u, (heavy ? 16 : light ? 12 : 14.5) + 9);
  },

  drawTank(ctx, u, f, wreck) {
    const sp = this.sprOf(u);
    if (sp) return this.drawTankSprite(ctx, u, f, wreck, sp);
    const [L, W] = u.size;
    const heavy = u.type === 'heavy', light = u.type === 'light';
    const body = wreck ? WRECK_RGB : rgbOf(f.body), bodyTop = wreck ? [64, 60, 55] : rgbOf(f.light);
    const hT = heavy ? 6 : light ? 4.5 : 5.5;
    const hH = hT + (heavy ? 4.5 : light ? 3.5 : 4);
    const tH = hH + (heavy ? 5.5 : light ? 4 : 5);
    const F = this.frame(u.x, u.y, u.angle);
    const tw = W * 0.27;
    if (!wreck) this.groundShadow(ctx, this.rectL(F, -L / 2, -W / 2, L / 2, W / 2), tH * 0.8);
    // гусеницы
    const trA = this.rectL(F, -L / 2, -W / 2, L / 2, -W / 2 + tw), trB = this.rectL(F, -L / 2, W / 2 - tw, L / 2, W / 2);
    const dA = trA[0][0] + trA[0][1] + trA[2][0] + trA[2][1], dB = trB[0][0] + trB[0][1] + trB[2][0] + trB[2][1];
    const tr = wreck ? [30, 28, 25] : TRACK_RGB;
    for (const t of dA < dB ? [trA, trB] : [trB, trA]) this.prism(ctx, t, 0, hT, tr, tr);
    // катки на видимом борту
    const ca = Math.cos(u.angle), sa = Math.sin(u.angle);
    for (const side of [-1, 1]) {
      const nx = -sa * side, ny = ca * side;
      if (nx + ny <= 0.05) continue;
      const nWheels = heavy ? 6 : light ? 4 : 5;
      const wr = hT * 0.38;
      for (let i = 0; i < nWheels; i++) {
        const lx = -L / 2 + 3 + (L - 6) * (i / (nWheels - 1));
        const p = F(lx, side * (W / 2 + 0.3));
        const [ex, ey] = ISO(p[0], p[1], hT * 0.45);
        ctx.fillStyle = wreck ? '#24221f' : '#3c3b35'; ctx.beginPath(); ctx.ellipse(ex, ey, wr * 1.05, wr, 0, 0, 7); ctx.fill();
        ctx.fillStyle = wreck ? '#2e2b27' : '#5d5b52'; ctx.beginPath(); ctx.ellipse(ex, ey, wr * 0.45, wr * 0.42, 0, 0, 7); ctx.fill();
      }
    }
    // корпус
    let hull;
    if (u.faction === 'ussr' && !light) hull = [F(-L / 2 + 1, -W / 2), F(L / 2 - 5, -W / 2), F(L / 2, -W / 4), F(L / 2, W / 4), F(L / 2 - 5, W / 2), F(-L / 2 + 1, W / 2)];
    else if (u.faction === 'usa') hull = [F(-L / 2 + 1, -W / 2), F(L / 2 - 3, -W / 2), F(L / 2, -W / 2 + 3), F(L / 2, W / 2 - 3), F(L / 2 - 3, W / 2), F(-L / 2 + 1, W / 2)];
    else hull = this.rectL(F, -L / 2 + 1, -W / 2, L / 2 - 1, W / 2);
    this.prism(ctx, hull, hT - 1.5, hH, bodyTop, body);
    // детали корпуса сверху
    this.onPlane(ctx, hH, () => {
      ctx.translate(u.x, u.y); ctx.rotate(u.angle);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.6;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(-L / 2 + 2.5 + k * 1.8, -W * 0.28); ctx.lineTo(-L / 2 + 2.5 + k * 1.8, W * 0.28); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(L * 0.32, -W * 0.22, 1.4, 0, 7); ctx.fill();
      if (u.faction === 'usa' && !wreck) this.drawMark(ctx, 'star_white', -L * 0.12, 0, W * 0.16);
    });
    // башня
    const ta = wreck ? u.tAngle + 0.35 : u.tAngle;
    const toff = u.faction === 'ussr' && !light ? L * 0.08 : (u.faction === 'ger' && u.type === 'medium' ? -L * 0.02 : 0);
    const tcx = u.x + Math.cos(u.angle) * toff, tcy = u.y + Math.sin(u.angle) * toff;
    const TF = this.frame(tcx, tcy, ta);
    const tl = L * (heavy ? 0.5 : 0.44), tW = W * (heavy ? 0.66 : 0.6);
    let tur = [];
    if (u.faction === 'ger') {
      tur = [TF(-tl / 2, -tW / 2), TF(tl * 0.32, -tW / 2), TF(tl / 2, -tW * 0.3), TF(tl / 2, tW * 0.3), TF(tl * 0.32, tW / 2), TF(-tl / 2, tW / 2)];
    } else {
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; tur.push(TF(Math.cos(a) * tl / 2 * (Math.cos(a) > 0 ? 1.05 : 0.95), Math.sin(a) * tW / 2)); }
    }
    const recoil = u.recoil || 0;
    if (u.recoil) u.recoil = Math.max(0, u.recoil - 0.08);
    const barrel = L * (heavy ? 0.8 : light ? 0.52 : 0.72);
    const bw = heavy ? 2.8 : light ? 1.8 : 2.3;
    const bz = (hH + tH) / 2;
    const bx0 = tl * 0.35 - recoil * 3;
    const brl = this.rectL(TF, bx0, -bw / 2, bx0 + barrel, bw / 2);
    const steel = wreck ? [30, 28, 26] : STEEL_RGB;
    const toward = Math.cos(ta) + Math.sin(ta) > 0;
    const drawBarrel = () => {
      this.prism(ctx, brl, bz - bw / 2, bz + bw / 2, [70, 70, 64], steel);
      if ((heavy || u.type === 'medium') && !wreck) {
        const mb = this.rectL(TF, bx0 + barrel - 3, -bw * 0.8, bx0 + barrel, bw * 0.8);
        this.prism(ctx, mb, bz - bw * 0.8, bz + bw * 0.8, [70, 70, 64], steel);
      }
    };
    if (!toward) drawBarrel();
    this.prism(ctx, tur, hH, tH, bodyTop, body);
    this.onPlane(ctx, tH, () => {
      ctx.translate(tcx, tcy); ctx.rotate(ta);
      ctx.fillStyle = wreck ? 'rgba(0,0,0,0.4)' : rgbStr(body, 0.8); ctx.beginPath(); ctx.arc(-tl * 0.18, -tW * 0.15, tW * 0.16, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.5; ctx.stroke();
      if (!wreck && u.faction === 'ger') this.drawMark(ctx, 'cross', -tl * 0.05, tW * 0.24, 2.4);
      if (!wreck && u.faction === 'ussr') this.drawMark(ctx, 'star_red', -tl * 0.05, tW * 0.22, 2.4);
    });
    if (toward) drawBarrel();
    if (!wreck && u.flash > 0) {
      const [mx, my] = ISO(tcx + Math.cos(ta) * (bx0 + barrel + 3), tcy + Math.sin(ta) * (bx0 + barrel + 3), bz);
      ctx.fillStyle = 'rgba(255,220,120,0.9)'; ctx.beginPath(); ctx.arc(mx, my, 4.5, 0, 7); ctx.fill();
    }
    if (!wreck) this.drawBars(ctx, u, tH + 9);
  },

  drawTruck(ctx, u, f, wreck) {
    const sp = this.sprOf({ faction: u.faction, type: 'truck' });
    if (sp) {
      this.blit(ctx, wreck ? ASSETS.wreckImg(sp) : sp.img, sp.h[this.dirIdx(u.angle)], u.x, u.y);
      if (!wreck) this.drawBars(ctx, u, 18);
      return;
    }
    const [L, W] = u.size;
    const F = this.frame(u.x, u.y, u.angle);
    const body = wreck ? WRECK_RGB : rgbOf(f.body), light = wreck ? [64, 60, 55] : rgbOf(f.light);
    if (!wreck) this.groundShadow(ctx, this.rectL(F, -L / 2, -W / 2, L / 2, W / 2), 10);
    const wheel = [26, 26, 24];
    const wheels = [];
    for (const wx of [-L * 0.33, -L * 0.12, L * 0.32]) { wheels.push(this.rectL(F, wx - 2.5, -W / 2, wx + 2.5, -W / 2 + 2.5)); wheels.push(this.rectL(F, wx - 2.5, W / 2 - 2.5, wx + 2.5, W / 2)); }
    wheels.sort((a, b) => (a[0][0] + a[0][1]) - (b[0][0] + b[0][1]));
    for (const w of wheels) this.prism(ctx, w, 0, 4.5, wheel, wheel);
    this.prism(ctx, this.rectL(F, -L / 2, -W / 2 + 1.5, L / 2, W / 2 - 1.5), 2.5, 4.5, [40, 38, 34], [40, 38, 34]);
    // кузов и тент
    this.prism(ctx, this.rectL(F, -L / 2, -W / 2, L * 0.16, W / 2), 4.5, 7, [92, 74, 52], [92, 74, 52]);
    const canvasC = wreck ? [50, 46, 42] : [light[0] * 1.05, light[1] * 1.05, light[2] * 0.95];
    this.prism(ctx, this.rectL(F, -L / 2 + 0.5, -W / 2 + 0.5, L * 0.15, W / 2 - 0.5), 7, 13, canvasC, canvasC);
    // капот и кабина
    const toward = Math.cos(u.angle) + Math.sin(u.angle) > 0;
    const hood = () => this.prism(ctx, this.rectL(F, L * 0.36, -W * 0.36, L / 2, W * 0.36), 4.5, 8.5, light, body);
    const cab = () => this.prism(ctx, this.rectL(F, L * 0.18, -W / 2 + 0.5, L * 0.37, W / 2 - 0.5), 4.5, 12, light, body);
    if (toward) { cab(); hood(); } else { hood(); cab(); }
    if (!wreck) this.drawBars(ctx, u, 18);
  },

  drawGun(ctx, u, f, wreck) {
    const [L, W] = u.size;
    const how = u.type === 'howitzer';
    const F = this.frame(u.x, u.y, u.angle);
    const body = wreck ? WRECK_RGB : rgbOf(f.body), light = wreck ? [64, 60, 55] : rgbOf(f.light);
    const steel = wreck ? [30, 28, 26] : STEEL_RGB;
    const crew = wreck ? 0 : Math.max(1, Math.ceil(3 * u.hp / u.maxHp));
    const cpos = [[-8, -5], [-9, 5], [-13, 0]].slice(0, crew).map(([lx, ly]) => ({ p: F(lx, ly) }));
    const gd = u.x + u.y;
    const drawCrew = (front) => {
      for (const c of cpos) {
        if ((c.p[0] + c.p[1] > gd) !== front) continue;
        this.figure(ctx, c.p[0], c.p[1], u.angle, f, 'rifle', false, u.anim, false, true);
      }
    };
    drawCrew(false);
    const sp = this.sprOf(u);
    if (sp) {
      if (u.recoil) u.recoil = Math.max(0, u.recoil - 0.05);
      const rc = u.recoil || 0;
      this.blit(ctx, wreck ? ASSETS.wreckImg(sp) : sp.img, sp.h[this.dirIdx(u.angle)], u.x - Math.cos(u.angle) * rc * 1.2, u.y - Math.sin(u.angle) * rc * 1.2);
      if (!wreck && u.flash > 0) {
        const p = F((sp.mr || L) + 1.5, 0);
        this.muzzleFlash(ctx, p[0], p[1], sp.mz || 6);
      }
      drawCrew(true);
      if (!wreck) this.drawBars(ctx, u, 18);
      return;
    }
    // станины
    this.onPlane(ctx, 1, () => {
      ctx.translate(u.x, u.y); ctx.rotate(u.angle);
      ctx.strokeStyle = wreck ? '#1d1b18' : '#3a3a32'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(-L * 0.7, -W * 0.38); ctx.moveTo(0, 2); ctx.lineTo(-L * 0.7, W * 0.38); ctx.stroke();
    });
    const wh = [24, 24, 22];
    const wA = this.rectL(F, -3, -W / 2, 3, -W / 2 + 2), wB = this.rectL(F, -3, W / 2 - 2, 3, W / 2);
    for (const w of (wA[0][0] + wA[0][1] < wB[0][0] + wB[0][1] ? [wA, wB] : [wB, wA])) this.prism(ctx, w, 0, 6, wh, wh);
    this.prism(ctx, this.rectL(F, -4, -3, 4, 3), 3, 6.5, light, body);
    const recoil = u.recoil || 0; if (u.recoil) u.recoil = Math.max(0, u.recoil - 0.05);
    const bl = how ? L * 0.72 : L * 0.95, bw = how ? 3.4 : 2.2, bz = how ? 8 : 6;
    const brl = this.rectL(F, -3 - recoil * 4, -bw / 2, bl - recoil * 4, bw / 2);
    const shield = this.rectL(F, 2.5, -W * 0.44, 3.8, W * 0.44);
    const toward = Math.cos(u.angle) + Math.sin(u.angle) > 0;
    const drawShield = () => this.prism(ctx, shield, 2.5, how ? 10 : 9, light, body);
    const drawBarrel = () => this.prism(ctx, brl, bz - bw / 2, bz + bw / 2, [70, 70, 64], steel);
    if (toward) { drawShield(); drawBarrel(); } else { drawBarrel(); drawShield(); }
    if (!wreck && u.flash > 0) {
      const p = F(bl + 2, 0); const [mx, my] = ISO(p[0], p[1], bz);
      ctx.fillStyle = 'rgba(255,220,120,0.9)'; ctx.beginPath(); ctx.arc(mx, my, 4.5, 0, 7); ctx.fill();
    }
    drawCrew(true);
    if (!wreck) this.drawBars(ctx, u, 18);
  },

  drawWreck(ctx, w) {
    const fake = { x: w.x, y: w.y, angle: w.angle, tAngle: w.tAngle, size: w.size, type: w.type, faction: w.faction, hp: 0, maxHp: 1, anim: 0 };
    const f = FACTIONS[w.faction];
    this.fine = true;
    if (w.cls === 'gun') this.drawGun(ctx, fake, f, true);
    else if (w.type === 'truck') this.drawTruck(ctx, fake, f, true);
    else this.drawTank(ctx, fake, f, true);
    this.fine = false;
  },

  drawMark(ctx, mark, x, y, s) {
    ctx.save(); ctx.translate(x, y);
    if (mark === 'cross') {
      ctx.fillStyle = '#f0f0f0'; ctx.fillRect(-s, -s * 0.35, s * 2, s * 0.7); ctx.fillRect(-s * 0.35, -s, s * 0.7, s * 2);
      ctx.fillStyle = '#111'; ctx.fillRect(-s * 0.8, -s * 0.18, s * 1.6, s * 0.36); ctx.fillRect(-s * 0.18, -s * 0.8, s * 0.36, s * 1.6);
    } else {
      ctx.fillStyle = mark === 'star_red' ? '#c4231c' : '#f2f2f2';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.42 : s; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
      if (mark === 'star_white') { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(0, 0, s * 1.15, 0, 7); ctx.stroke(); }
    }
    ctx.restore();
  },

  drawBars(ctx, u, h) {
    const show = G.selection.has(u) || u.hp < u.maxHp || UI.hover === u || UI.altDown;
    if (!show) return;
    const w = u.cls === 'inf' ? 12 : 24;
    const [ix, iy] = ISO(u.x, u.y, h);
    const x = ix - w / 2, y = iy - 4;
    const k = u.hp / u.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
    ctx.fillStyle = k > 0.6 ? '#62d14a' : k > 0.3 ? '#e5c43a' : '#e0442e';
    if (u.side === 'enemy') ctx.fillStyle = k > 0.3 ? '#e0603e' : '#a82c1c';
    ctx.fillRect(x, y, w * k, 2);
    if (u.side === 'player' && u.ammo !== null && G.selection.has(u)) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - 1, y + 3, w + 2, 3);
      ctx.fillStyle = '#e8b04a'; ctx.fillRect(x, y + 3.5, w * (u.ammo / u.maxAmmo), 1.6);
    }
    if (u.side === 'player' && u.group && G.selection.has(u)) {
      ctx.font = 'bold 8px Arial'; ctx.fillStyle = '#fff'; ctx.fillText(u.group, x + w + 2, y + 3);
    }
    if (u.suppression > 50 && u.cls === 'inf') { ctx.fillStyle = '#ffcf4a'; ctx.font = 'bold 9px Arial'; ctx.fillText('!', x - 5, y + 3); }
  },

  // ---------------- снаряды и частицы ----------------
  drawProjectiles(ctx) {
    for (const p of G.projectiles) {
      if (!this.inView(p.x, p.y, 120)) continue;
      if (!VIS.pxVisible('player', p.x, p.y) && !VIS.pxVisible('player', p.sx, p.sy) && !VIS.pxVisible('player', p.tx, p.ty)) continue;
      const k = Math.min(1, p.t / p.T);
      if (p.kind === 'arty' || p.kind === 'grenade') {
        const z0 = p.kind === 'arty' ? 8 : 6;
        const [gx, gy] = ISO(p.x, p.y, 0);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(gx, gy, 2.5, 1.3, 0, 0, 7); ctx.fill();
        const [ax, ay] = ISO(p.x, p.y, (p.z || 0) + z0 * (1 - k));
        ctx.fillStyle = '#1c1c1c'; ctx.beginPath(); ctx.arc(ax, ay, p.kind === 'arty' ? 2.6 : 1.8, 0, 7); ctx.fill();
        continue;
      }
      const z0 = p.z0 || 8, z1 = 5;
      const z = z0 + (z1 - z0) * k;
      const dx = p.tx - p.sx, dy = p.ty - p.sy, l = Math.hypot(dx, dy) || 1;
      const tail = p.kind === 'bullet' ? 12 : 18;
      const [hx, hy] = ISO(p.x, p.y, z);
      const [tx, ty] = ISO(p.x - dx / l * tail, p.y - dy / l * tail, z);
      p.zc = z;
      ctx.strokeStyle = p.kind === 'bullet' ? 'rgba(255,230,150,0.75)' : p.kind === 'rocket' ? 'rgba(255,170,80,0.95)' : 'rgba(255,240,190,0.95)';
      ctx.lineWidth = p.kind === 'bullet' ? 0.9 : 2;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
    }
  },

  // мягкие спрайты дыма/огня с шумными краями (генерируются один раз)
  makeFx() {
    const blob = (rgb, seed, core) => {
      const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d'), img = g.createImageData(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2), r = Math.hypot(dx, dy);
        const n = fbm(x / 9 + seed, y / 9 - seed, seed) * 0.7 + 0.3;
        let a = Math.max(0, 1 - r * (1.15 - n * 0.35));
        a = a * a * (3 - 2 * a);
        const i = (y * S + x) * 4;
        const cc = core ? core(1 - r, n) : rgb;
        img.data[i] = cc[0]; img.data[i + 1] = cc[1]; img.data[i + 2] = cc[2]; img.data[i + 3] = a * 255 * (core ? 1 : (0.65 + n * 0.35));
      }
      g.putImageData(img, 0, 0); return c;
    };
    this.fx = {
      black: [0, 1, 2].map(i => blob([34, 31, 28], 3 + i * 7)),
      grey: [0, 1, 2].map(i => blob([118, 114, 106], 11 + i * 5)),
      dust: [0, 1].map(i => blob([128, 112, 82], 21 + i * 3)),
      fire: [0, 1].map(i => blob(null, 31 + i * 9, (t, n) => [255, 140 + t * 115 * n, 40 + t * t * 160])),
    };
  },
  drawParticles(ctx) {
    if (!this.fx) this.makeFx();
    const FX = this.fx;
    for (const p of G.particles) {
      if (!this.inView(p.x, p.y, 80)) continue;
      const k = p.life / p.max;
      const [x, y] = ISO(p.x, p.y, p.z);
      const v = (p.rot * 10) | 0;
      if (p.type === 'smoke') {
        const set = p.color === 'black' || p.color === '#1e1e1e' ? FX.black : FX.grey;
        const fadeIn = Math.min(1, (1 - k) * 6);
        ctx.globalAlpha = (set === FX.black ? 0.7 : 0.45) * k * fadeIn;
        const sz = p.size * (2.2 + (1 - k) * 1.6);
        ctx.drawImage(set[v % set.length], x - sz / 2, y - sz / 2, sz, sz);
      } else if (p.type === 'fire') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, k * 1.6);
        const sz = p.size * (1.4 + k * 1.2);
        ctx.drawImage(FX.fire[v % 2], x - sz / 2, y - sz * 0.62, sz, sz * 1.2);
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.type === 'flash') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k;
        const g = ctx.createRadialGradient(x, y, 0, x, y, p.size * 1.6);
        g.addColorStop(0, 'rgba(255,245,200,1)'); g.addColorStop(0.4, 'rgba(255,190,90,0.7)'); g.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, p.size * 1.6, 0, 7); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.type === 'spark') {
        ctx.globalAlpha = k; ctx.fillStyle = p.color || '#ffd070';
        ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
      } else if (p.type === 'dust') {
        ctx.globalAlpha = 0.55 * k;
        const sz = p.size * (2.4 + (1 - k) * 1.5);
        ctx.drawImage(FX.dust[v % 2], x - sz / 2, y - sz / 2, sz, sz);
      } else if (p.type === 'debris') {
        ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = '#2a2420';
        ctx.fillRect(x, y, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  },

  drawOverlay(ctx) {
    ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
    for (const f of G.floats) {
      if (!VIS.pxVisible('player', f.x, f.y)) continue;
      const [x, y] = ISO(f.x, f.y, f.z || 20);
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2.5; ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  },
};
