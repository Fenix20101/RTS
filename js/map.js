'use strict';
// ============================================================
//  Карта: генерация местности демо-миссии
// ============================================================

function RNG(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * xf) + ((c + (d - c) * xf) - (a + (b - a) * xf)) * yf;
}
function fbm(x, y, seed) {
  return vnoise(x, y, seed) * 0.55 + vnoise(x * 2.1, y * 2.1, seed + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, seed + 13) * 0.15;
}

class GameMap {
  constructor(W, H, seed) {
    this.W = W; this.H = H; this.seed = seed;
    this.terr = new Uint8Array(W * H);
    this.bld = new Int16Array(W * H).fill(-1);
    this.deco = new Uint8Array(W * H);   // 1 = мешки с песком
    this.fieldDir = new Uint8Array(W * H);
    this.buildings = [];
    this.rng = RNG(seed);
    this.dirtyRects = [];
  }
  idx(x, y) { return y * this.W + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  get(x, y) { return this.inb(x, y) ? this.terr[y * this.W + x] : T.WATER; }
  set(x, y, t) { if (this.inb(x, y)) this.terr[y * this.W + x] = t; }
  costCls(cls) { return cls === 'inf' ? MOVE_COST.inf : MOVE_COST.veh; }
  cost(x, y, cls) {
    if (!this.inb(x, y)) return 0;
    return this.costCls(cls)[this.terr[y * this.W + x]];
  }
  passable(x, y, cls) {
    if (cls === 'inf' && this.wireT && this.inb(x, y) && this.wireT[y * this.W + x]) return false;   // колючая проволока
    return this.cost(x, y, cls) > 0;
  }
  // забор между соседними клетками a и b (по стороне)
  fenceBetween(ax, ay, bx, by) {
    if (!this.fenceH) return false;
    const W = this.W;
    if (ax === bx) {
      if (by === ay + 1) return this.fenceH[by * W + bx] === 1;
      if (by === ay - 1) return this.fenceH[ay * W + ax] === 1;
    } else if (ay === by) {
      if (bx === ax + 1) return this.fenceV[ay * W + bx] === 1;
      if (bx === ax - 1) return this.fenceV[ay * W + ax] === 1;
    }
    return false;
  }
  // может ли пехотинец перейти из клетки a в соседнюю b (заборы стоят по границам клеток)
  infStepOK(ax, ay, bx, by) {
    if (ax === bx && ay === by) return true;
    if (Math.abs(bx - ax) > 1 || Math.abs(by - ay) > 1) return true;
    if (ax === bx || ay === by) return !this.fenceBetween(ax, ay, bx, by);
    return (!this.fenceBetween(ax, ay, bx, ay) && !this.fenceBetween(bx, ay, bx, by)) ||
           (!this.fenceBetween(ax, ay, ax, by) && !this.fenceBetween(ax, by, bx, by));
  }
  // заграждения для пехоты: целые заборы и проволока; сломанные танком — уже не мешают
  rebuildBlocks() {
    const N = this.W * this.H;
    this.fenceH = new Uint8Array(N); this.fenceV = new Uint8Array(N); this.wireT = new Uint8Array(N);
    for (const p of this.props || []) {
      if (!p.alive || p.broken) continue;
      const i = p.ty * this.W + p.tx;
      if (p.k === 'fence_x') this.fenceH[Math.round(p.y / TILE) * this.W + p.tx] = 1;
      else if (p.k === 'fence_y') this.fenceV[p.ty * this.W + Math.round(p.x / TILE)] = 1;
      else if (p.k === 'wire_x' || p.k === 'wire_y') this.wireT[i] = 1;
    }
  }
  passablePx(px, py, cls) { return this.passable(Math.floor(px / TILE), Math.floor(py / TILE), cls); }

  riverX(y) { return 44 + 5 * Math.sin(y / 13) + 2.5 * Math.sin(y / 5.7 + 1); }

  generate() {
    const W = this.W, H = this.H, seed = this.seed;
    // 1. базовая трава
    this.terr.fill(T.GRASS);

    // 2. поля
    this.fields = [
      [58, 34, 12, 9, 0], [85, 56, 12, 11, 1], [87, 39, 12, 8, 0], [20, 80, 13, 11, 1],
      [26, 8, 14, 9, 0], [96, 84, 16, 9, 1], [60, 80, 12, 10, 0],
      // мелкие наделы — «лоскутное одеяло» полей
      [72, 34, 7, 6, 1], [100, 46, 8, 6, 0], [8, 70, 8, 7, 0], [16, 30, 9, 6, 1], [104, 60, 7, 8, 1], [74, 88, 9, 6, 1],
    ];
    // вид посева: 0 — спелая пшеница, 1 — пашня, 2 — зелёные всходы, 3 — скошенное сено
    this.fieldVar = new Uint8Array(W * H);
    this.fields.forEach(([fx, fy, fw, fh, dir], k) => {
      const v = [0, 1, 2, 0, 3, 1, 2, 3, 0, 1, 2, 3, 0][k % 13];
      for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) {
        if (this.inb(x, y)) { this.set(x, y, T.FIELD); this.fieldDir[this.idx(x, y)] = dir; this.fieldVar[this.idx(x, y)] = v; }
      }
    });

    // 3. лес
    const blobs = [
      [28, 50, 10, 0.35], [60, 16, 11, 0.35], [112, 70, 12, 0.35], [8, 50, 8, 0.25],
      [96, 22, 6, 0.2], [52, 90, 9, 0.3], [120, 40, 7, 0.25], [70, 70, 6, 0.2], [36, 16, 6, 0.2],
    ];
    const clear = [
      [78, 50, 14], [112, 22, 10], [16, 80, 10], [this.riverX(70) + 7, 70, 7], [this.riverX(28) + 6, 28, 5],
    ];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let bias = 0;
      for (const [bx, by, br, bs] of blobs) {
        const d2 = ((x - bx) ** 2 + (y - by) ** 2) / (br * br);
        bias += bs * Math.exp(-d2);
      }
      let n = fbm(x / 9, y / 9, seed) + bias;
      for (const [cx, cy, cr] of clear) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < cr) n -= (1 - d / cr) * 0.8;
      }
      if (n > 0.66 && this.get(x, y) === T.GRASS) this.set(x, y, T.FOREST);
    }

    // 4. река
    for (let y = 0; y < H; y++) {
      const rx = this.riverX(y);
      for (let x = Math.floor(rx - 5); x <= Math.ceil(rx + 5); x++) {
        const d = Math.abs(x + 0.5 - rx);
        if (d < 2.3) this.set(x, y, T.WATER);
        else if (d < 3.4) this.set(x, y, T.SAND);
      }
    }

    // 5. дороги
    const rS = this.riverX(70), rN = this.riverX(28);
    this.roads = [
      [[-2, 75], [14, 76], [28, 72], [rS - 9, 70], [rS + 9, 70], [58, 64], [68, 56], [78, 50]],
      [[78, 50], [88, 44], [98, 36], [106, 28], [112, 22], [120, 15], [129, 10]],
      [[-2, 20], [16, 22], [rN - 9, 28], [rN + 9, 28], [60, 32], [70, 41], [78, 50]],
      [[78, 50], [95, 52], [129, 54]],
      [[78, 50], [84, 62], [96, 76], [129, 85]],
      [[14, 76], [12, 56], [14, 36], [16, 22]],
    ];
    this.terrPre = this.terr.slice();   // земля до дорог — видна по краям сглаженной дороги
    for (const r of this.roads) this.drawRoad(r);

    // 6. постройки
    this.placeHouses(78, 50, 12, 26, [2, 3]);
    this.placeHouses(rS + 8, 69, 5, 3, [2, 2]);
    this.placeHouses(112, 22, 8, 5, [2, 3]);
    this.placeHouses(rN + 7, 27, 4, 2, [2, 2]);
    this.placeHouses(18, 84, 6, 3, [2, 2]);
    this.placeHouses(96, 76, 5, 3, [2, 2]);

    // 7. мелкие объекты: заборы, стога, столбы, колодцы, сараи, заграждения
    this.placeProps([[78, 50], [rS + 8, 69], [112, 22], [rN + 7, 27], [18, 84], [96, 76]], rS, rN);
    this.rebuildBlocks();
  }

  // ---------- мелкие объекты (декор). Не мешают проходу; техника давит заборы, стога, телеги, проволоку ----------
  addProp(k, x, y, crush) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!this.inb(tx, ty)) return null;
    const p = { k, x, y, tx, ty, crush: !!crush, broken: false, alive: true };
    this.props.push(p);
    (this.propGrid[ty * this.W + tx] = this.propGrid[ty * this.W + tx] || []).push(p);
    return p;
  }
  freeTile(x, y, ok = [T.GRASS, T.FIELD]) {
    return this.inb(x, y) && ok.includes(this.get(x, y)) && !this.deco[this.idx(x, y)];
  }
  placeProps(villages, rS, rN) {
    this.props = []; this.propGrid = [];
    const rng = RNG(this.seed + 404);
    const near = (b, f) => { for (let yy = b.y - 1; yy <= b.y + b.h; yy++) for (let xx = b.x - 1; xx <= b.x + b.w; xx++) f(xx, yy); };
    // заборы вокруг дворов: две-три стороны, с калитками-пропусками
    for (const b of this.buildings) {
      const x0 = b.x - 2, x1 = b.x + b.w + 1, y0 = b.y - 2, y1 = b.y + b.h + 1;
      const sides = [0, 1, 2, 3].filter(() => rng() < 0.65);
      for (const sd of sides) {
        if (sd < 2) {
          const yy = sd === 0 ? y0 : y1 + 1;
          for (let x = x0; x <= x1; x++) if (rng() > 0.18 && this.freeTile(x, sd === 0 ? yy : yy - 1)) this.addProp('fence_x', (x + 0.5) * TILE, yy * TILE, true);
        } else {
          const xx = sd === 2 ? x0 : x1 + 1;
          for (let y = y0; y <= y1; y++) if (rng() > 0.18 && this.freeTile(sd === 2 ? xx : xx - 1, y)) this.addProp('fence_y', xx * TILE, (y + 0.5) * TILE, true);
        }
      }
      // хозяйство во дворе
      const spots = [];
      near(b, (x, y) => { if (this.freeTile(x, y)) spots.push([x, y]); });
      const pick = () => spots.length ? spots.splice(Math.floor(rng() * spots.length), 1)[0] : null;
      const items = [['shed', 0.3], ['woodpile', 0.5], ['cart', 0.25], ['barrels', 0.25], ['crates', 0.15]];
      for (const [k, pr] of items) {
        if (rng() > pr) continue;
        const sp = pick(); if (!sp) break;
        this.addProp(k, (sp[0] + 0.3 + rng() * 0.4) * TILE, (sp[1] + 0.3 + rng() * 0.4) * TILE, k !== 'shed');
      }
    }
    // колодцы-журавли в центрах сёл
    for (const [vx, vy] of villages) {
      for (let a = 0; a < 30; a++) {
        const x = Math.floor(vx + (rng() - 0.5) * 8), y = Math.floor(vy + (rng() - 0.5) * 8);
        if (this.freeTile(x, y)) { this.addProp('well', (x + 0.5) * TILE, (y + 0.5) * TILE, false); break; }
      }
    }
    // поля: стога, кое-где изгородь по краю
    this.fields.forEach(([fx, fy, fw, fh], k) => {
      const v = this.fieldVar[this.idx(fx, fy)];
      const n = v === 3 ? 5 : v === 0 ? 2 : 0;
      for (let i = 0; i < n; i++) {
        const x = fx + 1 + Math.floor(rng() * (fw - 2)), y = fy + 1 + Math.floor(rng() * (fh - 2));
        if (this.get(x, y) === T.FIELD) this.addProp('hay', (x + rng()) * TILE, (y + rng()) * TILE, true);
      }
      if (k % 2 === 0) for (let x = fx; x < fx + fw; x++) if (this.freeTile(x, fy - 1, [T.GRASS]) && rng() > 0.25) this.addProp('fence_x', (x + 0.5) * TILE, fy * TILE, true);
    });
    // телеграфные столбы вдоль главных дорог, отступив от полотна
    for (const r of [this.roads[0], this.roads[2], this.roads[1]]) {
      let acc = 0;
      for (let i = 0; i < r.length - 1; i++) {
        const [x0, y0] = r[i], [x1, y1] = r[i + 1];
        const len = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / len, dy = (y1 - y0) / len;
        for (let d = 0; d < len; d += 0.5) {
          acc += 0.5;
          if (acc < 4.5) continue;
          const px = x0 + dx * d - dy * 2.4, py = y0 + dy * d + dx * 2.4;
          if (this.freeTile(Math.floor(px), Math.floor(py))) { acc = 0; this.addProp(Math.abs(dx) >= Math.abs(dy) ? 'pole_x' : 'pole_y', px * TILE, py * TILE, false); }
        }
      }
    }
    // фронтовые заграждения у переправы, деревни и штаба: проволока и «ежи»
    const lines = [[rS + 6, 70, 7], [78, 50, 15], [112, 22, 9]];
    for (const [cx, cy, R] of lines) {
      for (let a = 0; a < Math.PI * 2; a += 0.09) {
        if (rng() < 0.3) continue;
        const x = Math.floor(cx + Math.cos(a) * R), y = Math.floor(cy + Math.sin(a) * R);
        if (!this.inb(x, y)) continue;
        const t = this.get(x, y);
        if (t === T.ROAD) { if (rng() < 0.5) this.addProp('hedgehog', (x + 0.5) * TILE, (y + 0.5) * TILE, false); continue; }
        if (!this.freeTile(x, y)) continue;
        this.addProp(Math.abs(Math.cos(a)) < 0.7 ? 'wire_x' : 'wire_y', (x + 0.5) * TILE, (y + 0.5) * TILE, true);
      }
    }
    // пни и камни на открытых местах и опушках
    for (let i = 0; i < 140; i++) {
      const x = Math.floor(rng() * this.W), y = Math.floor(rng() * this.H);
      if (this.freeTile(x, y, [T.GRASS, T.FOREST])) this.addProp(rng() < 0.6 ? 'stump' : 'rock', (x + rng()) * TILE, (y + rng()) * TILE, false);
    }
  }

  drawRoad(pts) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.ceil(len * 3);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
        for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
          const tx = Math.floor(cx + ox), ty = Math.floor(cy + oy);
          if (!this.inb(tx, ty)) continue;
          const d = Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy);
          if (d > 1.15) continue;
          const cur = this.get(tx, ty);
          if (cur === T.WATER || cur === T.BRIDGE) this.set(tx, ty, T.BRIDGE);
          else if (cur !== T.HOUSE) this.set(tx, ty, T.ROAD);
        }
      }
    }
  }

  placeHouses(cx, cy, radius, count, sizes) {
    const rng = this.rng;
    let placed = 0;
    for (let attempt = 0; attempt < count * 40 && placed < count; attempt++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * radius;
      const x = Math.floor(cx + Math.cos(a) * r), y = Math.floor(cy + Math.sin(a) * r);
      const w = sizes[Math.floor(rng() * sizes.length)], h = 2;
      const rot = rng() < 0.5;
      const bw = rot ? h : w, bh = rot ? w : h;
      if (!this.canBuild(x, y, bw, bh)) continue;
      // рядом должна быть дорога
      let nearRoad = false;
      for (let yy = y - 3; yy < y + bh + 3 && !nearRoad; yy++)
        for (let xx = x - 3; xx < x + bw + 3; xx++) if (this.get(xx, yy) === T.ROAD) { nearRoad = true; break; }
      if (!nearRoad && rng() < 0.75) continue;
      const id = this.buildings.length;
      const palette = ['#8c3b2e', '#7a4a32', '#6e6e6e', '#94523a', '#5f4636', '#7d2f25'];
      this.buildings.push({ id, x, y, w: bw, h: bh, hp: 260 + bw * bh * 30, maxHp: 260 + bw * bh * 30, destroyed: false,
        roof: palette[Math.floor(rng() * palette.length)], ridgeH: bw >= bh });
      for (let yy = y; yy < y + bh; yy++) for (let xx = x; xx < x + bw; xx++) {
        this.set(xx, yy, T.HOUSE); this.bld[this.idx(xx, yy)] = id;
      }
      placed++;
    }
  }
  canBuild(x, y, w, h) {
    for (let yy = y - 1; yy < y + h + 1; yy++) for (let xx = x - 1; xx < x + w + 1; xx++) {
      if (!this.inb(xx, yy)) return false;
      const t = this.get(xx, yy);
      const inner = xx >= x && yy >= y && xx < x + w && yy < y + h;
      if (inner && !(t === T.GRASS || t === T.FIELD || t === T.FOREST)) return false;
      if (!inner && (t === T.HOUSE || t === T.WATER || t === T.BRIDGE)) return false;
    }
    return true;
  }

  sandbagArc(cx, cy, r, a0, a1) {
    for (let a = a0; a <= a1; a += 0.12) {
      const x = Math.floor(cx + Math.cos(a) * r), y = Math.floor(cy + Math.sin(a) * r);
      if (this.inb(x, y) && this.passable(x, y, 'inf') && this.get(x, y) !== T.BRIDGE) this.deco[this.idx(x, y)] = 1;
    }
  }

  // ближайшая проходимая клетка
  nearestPassable(tx, ty, cls, maxR = 12) {
    tx = Math.max(0, Math.min(this.W - 1, tx)); ty = Math.max(0, Math.min(this.H - 1, ty));
    if (this.passable(tx, ty, cls)) return [tx, ty];
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = 1e9;
      for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
        if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r) continue;
        if (this.passable(x, y, cls)) {
          const d = (x - tx) ** 2 + (y - ty) ** 2;
          if (d < bd) { bd = d; best = [x, y]; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  damageBuilding(id, dmg) {
    const b = this.buildings[id];
    if (!b || b.destroyed) return false;
    b.hp -= dmg;
    if (b.hp <= 0) {
      b.destroyed = true;
      for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) {
        this.set(xx, yy, T.RUBBLE); this.bld[this.idx(xx, yy)] = -1;
      }
      this.dirtyRects.push([b.x - 1, b.y - 1, b.w + 2, b.h + 2]);
      return true;
    }
    return false;
  }
}
