'use strict';
// ============================================================
//  Движок: поиск пути, обзор, юниты, бой, снаряды
// ============================================================

const G = {
  map: null, units: [], projectiles: [], particles: [], wrecks: [], floats: [],
  time: 0, speed: 1, paused: false, nextId: 1,
  sides: { player: { faction: 'ussr' }, enemy: { faction: 'ger' } },
  vis: {}, visGen: { player: 0, enemy: 0 }, explored: null,
  selection: new Set(), stats: { player: { kills: 0, lost: 0 }, enemy: { kills: 0, lost: 0 } },
  over: false,
};

function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function normAng(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 0.75; }
function other(side) { return side === 'player' ? 'enemy' : 'player'; }

// ------------------------------------------------------------
//  Поиск пути A*
// ------------------------------------------------------------
const PF = {
  init(map) {
    const N = map.W * map.H;
    this.map = map; this.N = N;
    this.g = new Float32Array(N); this.parent = new Int32Array(N);
    this.seen = new Uint32Array(N); this.closed = new Uint32Array(N); this.stamp = 0;
    this.heap = new Int32Array(N * 4); this.heapF = new Float32Array(N * 4); this.hn = 0;
    this.nearObs = new Uint8Array(N);
    this.rebuildObs();
  },
  rebuildObs() {
    const m = this.map;
    this.nearObs.fill(0);
    for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
      let n = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const t = m.get(x + ox, y + oy);
        if (t === T.HOUSE || t === T.WATER) n++;
      }
      this.nearObs[m.idx(x, y)] = n > 0 && m.get(x, y) !== T.BRIDGE ? 1 : 0;
    }
  },
  push(n, f) {
    let i = this.hn++;
    const h = this.heap, hf = this.heapF;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hf[p] <= f) break;
      h[i] = h[p]; hf[i] = hf[p]; i = p;
    }
    h[i] = n; hf[i] = f;
  },
  pop() {
    const h = this.heap, hf = this.heapF;
    const top = h[0];
    const n = h[--this.hn], f = hf[this.hn];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.hn) break;
      if (c + 1 < this.hn && hf[c + 1] < hf[c]) c++;
      if (hf[c] >= f) break;
      h[i] = h[c]; hf[i] = hf[c]; i = c;
    }
    h[i] = n; hf[i] = f;
    return top;
  },
  find(sx, sy, tx, ty, cls) {
    const m = this.map, W = m.W;
    const costs = m.costCls(cls);
    const veh = cls !== 'inf';
    const tgt = m.nearestPassable(tx, ty, cls, 20);
    if (!tgt) return null;
    [tx, ty] = tgt;
    if (!m.passable(sx, sy, cls)) {
      const s = m.nearestPassable(sx, sy, cls, 4);
      if (!s) return null;
      [sx, sy] = s;
    }
    const st = ++this.stamp;
    this.hn = 0;
    const s = sy * W + sx, t = ty * W + tx;
    const hW = veh ? 0.7 : 0.95;
    const heur = (x, y) => {
      const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
      return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)) * hW;
    };
    this.g[s] = 0; this.seen[s] = st; this.parent[s] = -1;
    this.push(s, heur(sx, sy));
    let best = s, bestH = heur(sx, sy), iter = 0;
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
    while (this.hn > 0) {
      const cur = this.pop();
      if (this.closed[cur] === st) continue;
      this.closed[cur] = st;
      if (cur === t) { best = t; break; }
      if (++iter > 30000) break;
      const cx = cur % W, cy = (cur / W) | 0;
      const hc = heur(cx, cy);
      if (hc < bestH) { bestH = hc; best = cur; }
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], ny = cy + DY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= m.H) continue;
        const n = ny * W + nx;
        const c = costs[m.terr[n]];
        if (!c) continue;
        if (!veh && (m.wireT[n] || !m.infStepOK(cx, cy, nx, ny))) continue;
        if (k >= 4) {
          if (!costs[m.terr[cy * W + nx]] || !costs[m.terr[ny * W + cx]]) continue;
        }
        const extra = veh && this.nearObs[n] ? 1.0 : 0;
        const ng = this.g[cur] + (k >= 4 ? 1.4142 : 1) * (c + extra);
        if (this.seen[n] !== st || ng < this.g[n]) {
          this.seen[n] = st; this.g[n] = ng; this.parent[n] = cur;
          this.push(n, ng + heur(nx, ny));
        }
      }
    }
    // восстановление
    const tiles = [];
    let c = best;
    while (c !== -1 && tiles.length < 4000) { tiles.push(c); c = this.parent[c]; if (c === s) { tiles.push(s); break; } }
    tiles.reverse();
    return this.smooth(tiles, cls);
  },
  lineOK(a, b, cls) {
    const m = this.map, W = m.W;
    const ax = a % W + 0.5, ay = ((a / W) | 0) + 0.5, bx = b % W + 0.5, by = ((b / W) | 0) + 0.5;
    const costs = m.costCls(cls);
    const maxC = Math.max(costs[m.terr[a]], costs[m.terr[b]]) + 0.05;
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(len * 3);
    const nx = -(by - ay) / (len || 1), ny = (bx - ax) / (len || 1);
    const off = cls === 'inf' ? 0.2 : 0.42;
    const veh = cls !== 'inf';
    const obsEnds = this.nearObs[a] || this.nearObs[b];
    let ptx = Math.floor(ax), pty = Math.floor(ay);
    for (let i = 0; i <= steps; i++) {
      if (!veh) {
        const t = i / steps;
        const cx = Math.floor(ax + (bx - ax) * t), cy = Math.floor(ay + (by - ay) * t);
        if (cx !== ptx || cy !== pty) {
          if (!m.infStepOK(ptx, pty, cx, cy) || (m.inb(cx, cy) && m.wireT[cy * W + cx])) return false;
          ptx = cx; pty = cy;
        }
      }
      const t = i / steps;
      const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      for (const o of [-off, 0, off]) {
        const qx = Math.floor(px + nx * o), qy = Math.floor(py + ny * o);
        if (!m.inb(qx, qy)) return false;
        const qi = qy * W + qx;
        const c = costs[m.terr[qi]];
        if (!c || c > maxC) return false;
        if (veh && !obsEnds && this.nearObs[qi] && o === 0) return false;
      }
    }
    return true;
  },
  smooth(tiles, cls) {
    const W = this.map.W;
    if (tiles.length === 0) return [];
    const out = [];
    let i = 0;
    while (i < tiles.length - 1) {
      let j = Math.min(tiles.length - 1, i + 30);
      while (j > i + 1 && !this.lineOK(tiles[i], tiles[j], cls)) j--;
      out.push(tiles[j]);
      i = j;
    }
    return out.map(n => ({ x: (n % W + 0.5) * TILE, y: (((n / W) | 0) + 0.5) * TILE }));
  },
};

// ------------------------------------------------------------
//  Обзор / туман войны
// ------------------------------------------------------------
const VIS = {
  R: 15,
  init(map) {
    const N = map.W * map.H;
    G.vis.player = new Uint32Array(N); G.vis.enemy = new Uint32Array(N);
    G.explored = new Uint8Array(N);
    const offs = [];
    const R = this.R;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > R * R) continue;
      const ray = [];
      const n = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
      let lx = 0, ly = 0;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const rx = Math.round(dx * t), ry = Math.round(dy * t);
        if ((rx === 0 && ry === 0) || (rx === dx && ry === dy)) continue;
        if (rx === lx && ry === ly) continue;
        lx = rx; ly = ry;
        ray.push(rx, ry);
      }
      offs.push({ dx, dy, d2, ray });
    }
    offs.sort((a, b) => a.d2 - b.d2);
    this.offs = offs;
  },
  compute(side) {
    const m = G.map, W = m.W, H = m.H;
    const gen = ++G.visGen[side];
    const vis = G.vis[side];
    const isPlayer = side === 'player';
    for (const u of G.units) {
      if (!u.alive || u.side !== side) continue;
      const ux = Math.floor(u.x / TILE), uy = Math.floor(u.y / TILE);
      const r = u.vision * (u.cls === 'inf' && u.suppression > 50 ? 0.7 : 1);
      const r2 = r * r;
      for (const o of this.offs) {
        if (o.d2 > r2) break;
        const tx = ux + o.dx, ty = uy + o.dy;
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
        const ti = ty * W + tx;
        if (vis[ti] === gen) continue;
        let op = 0, blocked = false;
        const ray = o.ray;
        for (let k = 0; k < ray.length; k += 2) {
          const qx = ux + ray[k], qy = uy + ray[k + 1];
          op += OPACITY[m.terr[qy * W + qx]];
          if (op >= 3) { blocked = true; break; }
        }
        if (!blocked) {
          vis[ti] = gen;
          if (isPlayer) G.explored[ti] = 1;
        }
      }
    }
    // обнаружение юнитов противника
    const obs = G.units.filter(u => u.alive && u.side === side);
    for (const e of G.units) {
      if (!e.alive || e.side === side) continue;
      const ti = Math.floor(e.y / TILE) * W + Math.floor(e.x / TILE);
      let seen = vis[ti] === gen;
      if (seen) {
        const sr = e.stealthRange();
        if (sr) {
          seen = false;
          const lim = sr * TILE;
          for (const o of obs) if (Math.abs(o.x - e.x) < lim && Math.abs(o.y - e.y) < lim && dist(o, e) < lim) { seen = true; break; }
        }
      }
      if (seen) e.lastSeen[side] = G.time;
      e.visibleTo[side] = seen;
    }
  },
  tileVisible(side, tx, ty) {
    if (!G.map.inb(tx, ty)) return false;
    return G.vis[side][ty * G.map.W + tx] === G.visGen[side];
  },
  pxVisible(side, x, y) { return this.tileVisible(side, Math.floor(x / TILE), Math.floor(y / TILE)); },
};

// ------------------------------------------------------------
//  Юнит
// ------------------------------------------------------------
class Unit {
  constructor(type, side, x, y, angle = 0) {
    const faction = G.sides[side].faction;
    const tpl = unitTemplate(type, faction);
    this.tpl = tpl; this.id = G.nextId++;
    this.type = type; this.faction = faction; this.side = side; this.cls = tpl.cls;
    this.name = tpl.name; this.short = tpl.short;
    this.hp = this.maxHp = tpl.hp;
    this.x = x; this.y = y; this.angle = angle; this.tAngle = angle;
    this.armor = tpl.armor;
    this.size = tpl.size || [8, 8];
    this.radius = this.cls === 'inf' ? 4 : Math.max(this.size[0], this.size[1]) * 0.45;
    this.speed = tpl.speed * TILE;
    this.vision = tpl.vision;
    this.hasTurret = this.cls === 'veh' && !tpl.truck;
    this.weapons = tpl.weaponDefs.map(w => ({ def: w, cd: Math.random() * w.reload, burst: 0, ammo: w.ammo != null ? w.ammo : null, target: null, point: null }));
    this.ammo = tpl.ammo != null ? tpl.ammo : null; this.maxAmmo = this.ammo;
    this.supply = tpl.supply || 0; this.maxSupply = this.supply;
    this.path = null; this.pathI = 0; this.order = null;
    this.holdFire = false; this.suppression = 0; this.lastFire = -99;
    this.visibleTo = { player: side === 'player', enemy: side === 'enemy' };
    this.lastSeen = { player: -99, enemy: -99 };
    this.alive = true; this.moving = false; this.ai = null;
    this.scanT = Math.random() * 0.4; this.stuckT = 0; this.stuckRef = { x, y }; this.repathN = 0;
    this.trackD = 0; this.kills = 0; this.group = 0; this.lastHitT = -99; this.lastAttacker = null;
    this.supplyT = 0; this.flash = 0; this.anim = Math.random() * 10; this.curSpd = 0;
    this.proneT = 0; this.crawl = false; this.brainT = Math.random() * 0.5; this.coverCD = 0;
    this.stance = null;   // приказ игрока: 'prone' — лежать (и ползти), 'stand' — не залегать самим; null — по обстановке
  }
  // лежит: по приказу, подавлен, ползёт или залёг в бою (стоя на месте)
  isProne() {
    if (this.cls !== 'inf') return false;
    if (this.stance === 'prone') return true;
    if (this.suppression > 50 || this.crawl) return true;   // прижатый огнём лежит при любом приказе
    return this.stance !== 'stand' && this.proneT > 0 && !this.moving;
  }
  orderFace(x, y) {
    this.order = { type: 'face', a: Math.atan2(y - this.y, x - this.x) };
    this.path = null;
  }

  muzzleZ() {
    if (this.cls === 'inf') return this.isProne() ? 1.5 : 6.5;
    const sp = typeof ASSETS !== 'undefined' && ASSETS.units && ASSETS.units[this.faction + '_' + this.type];
    if (sp && sp.mz) return sp.mz;
    if (this.cls === 'gun') return this.type === 'howitzer' ? 8 : 6;
    return { light: 9, medium: 11, heavy: 13 }[this.type] || 8;
  }
  get tileX() { return Math.floor(this.x / TILE); }
  get tileY() { return Math.floor(this.y / TILE); }
  get isTank() { return this.hasTurret; }
  mainWeapon() { return this.weapons[0]; }
  maxRange() { let r = 0; for (const w of this.weapons) if (this.canUse(w)) r = Math.max(r, w.def.range); return r * TILE; }
  canUse(w) {
    if (w.def.usesAmmo && this.ammo !== null && this.ammo <= 0) return false;
    if (w.ammo !== null && w.ammo <= 0) return false;
    return true;
  }

  terrainHere() { return G.map.get(this.tileX, this.tileY); }
  inCover() {
    const m = G.map, tx = this.tileX, ty = this.tileY;
    const t = m.get(tx, ty);
    if (t === T.FOREST || t === T.RUBBLE) return true;
    if (typeof R !== 'undefined' && R.inCrater && R.inCrater(this.x, this.y)) return true;   // воронка — укрытие
    if (m.deco[m.idx(tx, ty)]) return true;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (m.get(tx + ox, ty + oy) === T.HOUSE) return true;
    return false;
  }
  stealthRange() {
    if (G.time - this.lastFire < 2.5) return null;
    if (this.tpl.stealth && !this.moving) return this.tpl.stealth;
    if (this.cls === 'inf' && this.terrainHere() === T.FOREST) return this.moving ? 7 : 5;
    const sc = G.map.scrub && G.map.scrub[this.tileY * G.map.W + this.tileX];
    if (this.cls === 'inf' && sc === 1) return this.moving ? 8 : 5;          // в кустах
    if (this.cls === 'inf' && sc && !this.moving) return 7;                   // залёг в высокой траве / камыше
    return null;
  }

  // ---------- приказы ----------
  setPath(x, y) {
    const m = G.map;
    const p = PF.find(this.tileX, this.tileY, Math.floor(x / TILE), Math.floor(y / TILE), this.cls);
    this.path = p && p.length ? p : null;
    if (this.path) {
      // точная точка назначения, если она проходима
      const last = this.path[this.path.length - 1];
      if (m.passablePx(x, y, this.cls) && Math.hypot(last.x - x, last.y - y) < TILE * 1.5) { last.x = x; last.y = y; }
    }
    this.pathI = 0; this.stuckT = 0; this.stuckRef = { x: this.x, y: this.y };
    return !!this.path;
  }
  orderMove(x, y, amove = false) {
    this.order = { type: amove ? 'amove' : 'move', x, y };
    for (const w of this.weapons) { w.target = null; w.point = null; }
    this.repathN = 0;
    this.setPath(x, y);
  }
  orderAttack(target) {
    this.order = { type: 'attack', target, repathT: 0, lx: target.x, ly: target.y };
    this.path = null;
  }
  orderFireGround(x, y) {
    this.order = { type: 'fireground', x, y };
    this.path = null;
  }
  stop() {
    this.order = null; this.path = null; this.moving = false;
    for (const w of this.weapons) { w.target = null; w.point = null; }
  }

  // ---------- обновление ----------
  update(dt) {
    if (!this.alive) return;
    this.suppression = Math.max(0, this.suppression - 18 * dt);
    if (this.cls === 'inf') { if (this.proneT > 0) this.proneT -= dt; this.coverCD -= dt; this.brain(dt); }
    if (this.flash > 0) this.flash -= dt;
    this.anim += dt;
    this.handleOrder(dt);
    this.moveStep(dt);
    this.combat(dt);
    if (this.tpl.truck) this.supplyStep(dt);
    if (this.cls === 'veh' && this.hp < this.maxHp * 0.3 && Math.random() < dt * 6) {
      spawnParticle('smoke', this.x + rand(-4, 4), this.y + rand(-4, 4), { size: rand(4, 7), life: rand(1.5, 3), z: 8, vz: 12, vx: 3 });
    }
  }

  handleOrder(dt) {
    const o = this.order;
    if (!o) return;
    if (o.type === 'attack') {
      const t = o.target;
      if (!t.alive) { this.order = null; this.path = null; return; }
      const visible = t.visibleTo[this.side];
      if (visible) { o.lx = t.x; o.ly = t.y; }
      const d = Math.hypot(o.lx - this.x, o.ly - this.y);
      const mw = this.bestWeaponFor(t);
      const range = mw ? mw.def.range * TILE * 0.92 : 3 * TILE;
      if (visible && d <= range && (!mw || !mw.def.minRange || d >= mw.def.minRange * TILE)) {
        this.path = null; // стоим и стреляем
      } else {
        if (!visible && d < TILE * 1.5) { this.order = null; this.path = null; return; }
        o.repathT -= dt;
        if (o.repathT <= 0 || !this.path) {
          o.repathT = 1.5;
          this.setPath(o.lx, o.ly);
        }
      }
    } else if (o.type === 'face') {
      // разворот на месте в сторону точки
      this.path = null; this.moving = false; this.curSpd = 0;
      if (this.cls === 'inf') { this.angle = o.a; this.order = null; return; }
      const diff = normAng(o.a - this.angle);
      const tt = (this.tpl.turn || 1) * dt * (this.cls === 'gun' ? 0.8 : 1);
      this.angle = normAng(this.angle + clamp(diff, -tt, tt));
      if (!this.hasTurret) this.tAngle = this.angle;
      if (Math.abs(diff) < 0.02) this.order = null;
    } else if (o.type === 'assault') {
      // подобраться к технике на бросок гранаты; последние метры — ползком
      const t = o.target;
      if (!t.alive || !t.visibleTo[this.side]) { this.order = null; this.path = null; this.crawl = false; return; }
      const w = this.weapons.find(w => w.def.antitank && this.canUse(w));
      if (!w) { this.order = null; this.path = null; this.crawl = false; return; }
      const d = dist(t, this);
      this.crawl = d < 4 * TILE;
      if (d <= w.def.range * TILE * 0.85) { this.path = null; }
      else {
        o.repathT -= dt;
        if (o.repathT <= 0 || !this.path) { o.repathT = 1.2; this.setPath(t.x, t.y); }
      }
    } else if (o.type === 'fireground') {
      const w = this.weapons.find(w => w.def.main && this.canUse(w)) || this.weapons[0];
      if (!w) { this.order = null; return; }
      const d = Math.hypot(o.x - this.x, o.y - this.y);
      if (d > w.def.range * TILE * 0.97) {
        if (!this.path) this.setPath(o.x, o.y);
      } else if (w.def.minRange && d < w.def.minRange * TILE) {
        this.order = null; this.path = null;
        if (this.side === 'player') UI.msg(this.name + ': цель слишком близко', 'warn');
      } else {
        this.path = null;
      }
      if (!this.weapons.some(w => w.def.main && this.canUse(w))) { this.order = null; if (this.side === 'player') UI.msg(this.name + ': нет снарядов', 'warn'); }
    }
  }

  onArrive() {
    if (this.order && (this.order.type === 'move' || this.order.type === 'amove')) this.order = null;
    else if (this.order && this.order.type === 'cover') {
      // добежал до укрытия: залечь; атака с ходу продолжится, когда стрелять станет не в кого
      const r = this.order.resume;
      this.proneT = 4;
      this.order = r || null;
      if (r) this.setPath(r.x, r.y);
    }
  }

  // ---------- поведение пехоты в бою (своё и противника) ----------
  brain(dt) {
    this.brainT -= dt;
    if (this.brainT > 0) return;
    this.brainT = 0.45 + Math.random() * 0.3;
    const o = this.order;
    const underFire = G.time - this.lastHitT < 3 || this.suppression > 20;
    if (underFire) this.proneT = Math.max(this.proneT, 3);
    if (o && (o.type === 'move' || o.type === 'attack' || o.type === 'fireground' || o.type === 'face')) { this.crawl = false; return; }   // прямой приказ важнее
    // 1. танк рядом и есть ПТ-граната — подползти и подорвать
    const atw = this.weapons.find(w => w.def.antitank && w.def.thrown && this.canUse(w));
    if (atw && !(o && o.type === 'assault')) {
      const reach = (this.side === 'player' ? 5 : 6.5) * TILE;
      let best = null, bd = reach;
      for (const e of G.units) {
        if (!e.alive || e.cls !== 'veh' || e.side === this.side || !e.visibleTo[this.side]) continue;
        if (Math.abs(e.x - this.x) > reach || Math.abs(e.y - this.y) > reach) continue;
        if (this.effectiveness(atw, e) < 0.5) continue;
        if (this.ai && this.ai.home && Math.hypot(e.x - this.ai.home.x, e.y - this.ai.home.y) > this.ai.leash + 5 * TILE) continue;
        const d = dist(e, this);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) { this.order = { type: 'assault', target: best, repathT: 0, resume: o && o.type === 'amove' ? o : null }; return; }
    }
    if (o && o.type === 'assault') return;
    // 2. под огнём на открытом месте — перебежать в ближайшее укрытие
    if (underFire && !this.stance && !this.inCover() && this.coverCD <= 0 && (!o || o.type === 'amove')) {
      const c = this.findCover(3);
      this.coverCD = c ? 9 : 4;
      if (c) { this.order = { type: 'cover', resume: o }; this.setPath(c.x, c.y); }
    }
  }
  findCover(r) {
    const m = G.map, W = m.W;
    let best = null, bs = 1e9;
    const att = this.lastAttacker && this.lastAttacker.alive ? this.lastAttacker : null;
    const dAtt0 = att ? dist(this, att) : 0;
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      const x = this.tileX + ox, y = this.tileY + oy;
      if (!m.inb(x, y) || !m.passable(x, y, 'inf')) continue;
      const t = m.get(x, y), i = y * W + x;
      const cx = (x + 0.5) * TILE, cy = (y + 0.5) * TILE;
      let q = 0;   // качество укрытия
      if (t === T.FOREST || t === T.RUBBLE || m.deco[i]) q = 3;
      else if (typeof R !== 'undefined' && R.inCrater && R.inCrater(cx, cy)) q = 3;
      else if (m.get(x + 1, y) === T.HOUSE || m.get(x - 1, y) === T.HOUSE || m.get(x, y + 1) === T.HOUSE || m.get(x, y - 1) === T.HOUSE) q = 2.5;
      else if (m.scrub && m.scrub[i] === 1) q = 1.5;
      if (!q) continue;
      let crowd = 0;
      for (const u of G.units) if (u !== this && u.alive && u.cls === 'inf' && u.tileX === x && u.tileY === y) crowd++;
      if (crowd >= 3) continue;
      let sc = Math.hypot(ox, oy) - q * 1.2 + crowd * 0.8;
      if (att && Math.hypot(cx - att.x, cy - att.y) < dAtt0 - 2 * TILE) sc += 3;   // не бежать навстречу огню
      if (sc < bs) { bs = sc; best = { x: cx + rand(-5, 5), y: cy + rand(-5, 5) }; }
    }
    return best;
  }

  moveStep(dt) {
    if (!this.path || this.pathI >= this.path.length) { this.moving = false; this.curSpd = 0; this.idleTurret(dt); return; }
    // пехота в режиме атаки с ходу останавливается при наличии цели
    if (this.order && this.order.type === 'amove' && this.weapons.some(w => w.target && w.target.alive)) {
      this.moving = false; this.curSpd = Math.max(0, (this.curSpd || 0) - (this.tpl.accel || 0.5) * TILE * 2 * dt); return;
    }
    const m = G.map;
    const wp = this.path[this.pathI];
    const dx = wp.x - this.x, dy = wp.y - this.y;
    const d = Math.hypot(dx, dy);
    const last = this.pathI === this.path.length - 1;
    const arrive = last ? 3 : (this.cls === 'inf' ? 7 : 12);
    if (d < arrive) {
      this.pathI++;
      if (this.pathI >= this.path.length) { this.path = null; this.moving = false; this.onArrive(); }
      return;
    }
    const c = m.cost(this.tileX, this.tileY, this.cls) || 1;
    let spd = this.speed / c;
    if (this.cls === 'inf' && (this.suppression > 50 || this.crawl || this.stance === 'prone')) spd *= 0.45;   // ползком
    if (this.cls === 'veh' && this.hp < this.maxHp * 0.3) spd *= 0.6;
    if (this.cls === 'gun' && this.weapons[0] && this.weapons[0].cd > 0 && G.time - this.lastFire < 1) spd = 0;
    let nx = this.x, ny = this.y;
    const desired = Math.atan2(dy, dx);
    if (this.cls === 'inf') {
      this.angle = desired;
      const step = Math.min(d, spd * dt);
      nx += Math.cos(desired) * step; ny += Math.sin(desired) * step;
    } else {
      // техника: разгон, торможение перед поворотом и в конце пути, разворот на месте медленный
      const diff = normAng(desired - this.angle);
      const acc = (this.tpl.accel || 0.5) * TILE;
      const cur = this.curSpd || 0;
      // на скорости поворачивает хуже, чем на малом ходу
      const turn = this.tpl.turn * dt * (1 - 0.35 * Math.min(1, cur / Math.max(1, this.speed)));
      this.angle = normAng(this.angle + clamp(diff, -turn, turn));
      let target = Math.abs(diff) < 1.0 ? spd * Math.max(0.15, Math.cos(diff) ** 2) : 0;
      // дистанция до конца пути — успеть затормозить
      let rem = d;
      for (let i = this.pathI + 1; i < this.path.length && rem < 400; i++) rem += Math.hypot(this.path[i].x - this.path[i - 1].x, this.path[i].y - this.path[i - 1].y);
      target = Math.min(target, Math.sqrt(2 * acc * 1.5 * Math.max(0, rem - 2)) + 4);
      this.curSpd = cur < target ? Math.min(target, cur + acc * dt) : Math.max(target, cur - acc * 2.2 * dt);
      if (Math.abs(diff) >= 1.0) this.stuckT = 0;   // разворот на месте — это не застревание
      const step = Math.min(d, this.curSpd * dt);
      nx += Math.cos(this.angle) * step; ny += Math.sin(this.angle) * step;
    }
    const inf = this.cls === 'inf', ox = Math.floor(this.x / TILE), oy = Math.floor(this.y / TILE);
    const can = (px, py) => m.passablePx(px, py, this.cls) && (!inf || m.infStepOK(ox, oy, Math.floor(px / TILE), Math.floor(py / TILE)));
    if (can(nx, ny)) { this.x = nx; this.y = ny; }
    else if (can(nx, this.y)) { this.x = nx; this.curSpd *= 0.7; }
    else if (can(this.x, ny)) { this.y = ny; this.curSpd *= 0.7; }
    else this.curSpd = 0;
    this.moving = true;

    // следы гусениц
    if (this.cls === 'veh') {
      this.trackD += (this.curSpd || 0) * dt;
      if (this.trackD > 5) { this.trackD = 0; if (typeof R !== 'undefined') R.decalTrack(this); }
      this.crush();
    }
    if (!this.hasTurret) this.tAngle = this.angle;
    // застревание
    this.stuckT += dt;
    if (this.stuckT > 1.6) {
      const moved = Math.hypot(this.x - this.stuckRef.x, this.y - this.stuckRef.y);
      this.stuckT = 0; this.stuckRef = { x: this.x, y: this.y };
      if (moved < 5) {
        const fin = this.path[this.path.length - 1];
        if (Math.hypot(fin.x - this.x, fin.y - this.y) < TILE * 2.2 || this.repathN > 3) {
          this.path = null; this.moving = false; this.onArrive(); this.repathN = 0;
        } else {
          this.repathN++;
          const fx = fin.x, fy = fin.y;
          this.setPath(fx + rand(-6, 6), fy + rand(-6, 6));
        }
      }
    }
  }

  idleTurret(dt) {
    if (!this.hasTurret) return;
    const busy = this.weapons.some(w => w.target || w.point);
    if (!busy) {
      const diff = normAng(this.angle - this.tAngle);
      this.tAngle = normAng(this.tAngle + clamp(diff, -this.tpl.turretTurn * dt * 0.5, this.tpl.turretTurn * dt * 0.5));
    }
  }

  crush() {
    if (this.speed < 1 || this.tpl.truck && false) return;
    // заборы, стога, телеги, проволока под гусеницами
    const m = G.map;
    if (m.propGrid) {
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const list = m.propGrid[(this.tileY + oy) * m.W + this.tileX + ox];
        if (!list) continue;
        for (const p of list) {
          if (!p.alive || !p.crush || p.broken) continue;
          if (Math.hypot(p.x - this.x, p.y - this.y) > this.radius + 5) continue;
          if (p.k.startsWith('fence')) { p.broken = true; p.k = p.k.replace('fence_', 'fencebr_'); }
          else p.alive = false;
          m.blocksDirty = true;
          for (let i = 0; i < 5; i++) spawnParticle('debris', p.x, p.y, { z: 2, vz: rand(10, 30), size: 1.5, life: 0.8 });
        }
      }
    }
    if (m.blocksDirty) { m.blocksDirty = false; m.rebuildBlocks(); }
    if (typeof R !== 'undefined' && R.flattenVeg) R.flattenVeg(this.x, this.y, this.radius + 3);
    for (const e of G.units) {
      if (!e.alive || e.cls !== 'inf' || e.side === this.side) continue;
      if (Math.abs(e.x - this.x) > 16 || Math.abs(e.y - this.y) > 16) continue;
      if (dist(e, this) < this.radius * 0.9) {
        e.hp = 0; killUnit(e, this, 'crush');
        addFloat(e.x, e.y, 'Раздавлен', '#ff9a6b');
      }
    }
  }

  // ---------- бой ----------
  effectiveness(w, e) {
    const d = w.def;
    if (d.type === 'bullet') {
      if (e.cls === 'inf') return 1;
      if (e.cls === 'gun') return 0.5;
      return d.pen >= Math.min(e.armor.r, e.armor.s) ? 0.35 : 0;
    }
    if (d.type === 'ap') {
      if (e.cls === 'veh') {
        if (d.pen >= e.armor.s * 0.95) return 1.3;
        if (d.pen >= e.armor.r * 0.9) return 0.7;
        return 0.05;
      }
      if (e.cls === 'gun') return 0.9;
      if (d.rocket || d.thrown) return 0;
      return d.softDmg ? 0.55 : 0;
    }
    if (d.type === 'he') return e.cls === 'veh' ? 0.8 : 1;
    if (d.type === 'frag') {
      if (e.cls === 'inf') return (e.inCover() || e.isProne()) ? 1.4 : 0.5;   // гранатой — тех, кого пуля не достаёт
      if (e.cls === 'gun') return 1.1;
      return e.tpl && e.tpl.truck ? 0.6 : 0;
    }
    return 0;
  }
  bestWeaponFor(t) {
    let best = null, be = 0;
    for (const w of this.weapons) {
      if (!this.canUse(w)) continue;
      const e = this.effectiveness(w, t);
      if (e > be) { be = e; best = w; }
    }
    return best;
  }

  combat(dt) {
    const o = this.order;
    const moveOnly = o && o.type === 'move';
    const canFireNow = !(this.cls === 'inf' && this.moving) && !(this.cls === 'gun' && this.moving);
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.35 + Math.random() * 0.1;
      this.scanTargets(moveOnly);
    }
    for (const w of this.weapons) {
      if (w.cd > 0) w.cd -= dt;
      const tgt = w.target;
      let px, py;
      if (tgt) {
        if (!tgt.alive || !tgt.visibleTo[this.side]) { w.target = null; continue; }
        px = tgt.x; py = tgt.y;
        const d = Math.hypot(px - this.x, py - this.y);
        if (d > w.def.range * TILE) { w.target = null; continue; }
      } else if (w.point) {
        px = w.point.x; py = w.point.y;
      } else continue;
      if (!this.canUse(w)) { w.target = null; w.point = null; continue; }
      // наводка
      const want = Math.atan2(py - this.y, px - this.x);
      let aligned = true;
      if (this.hasTurret) {
        if (w.def.main || !this.weapons[0].target) {
          const diff = normAng(want - this.tAngle);
          const tt = this.tpl.turretTurn * dt;
          if (w.def.main || !this.weapons[0].target) this.tAngle = normAng(this.tAngle + clamp(diff, -tt, tt));
          aligned = Math.abs(diff) < (w.def.main ? 0.06 : 0.35);
        } else {
          aligned = Math.abs(normAng(want - this.tAngle)) < 0.5;
        }
      } else if (this.cls === 'gun') {
        if (this.moving) continue;
        const diff = normAng(want - this.angle);
        const tt = this.tpl.turn * dt;
        this.angle = normAng(this.angle + clamp(diff, -tt, tt));
        this.tAngle = this.angle;
        aligned = Math.abs(diff) < 0.08;
      } else if (this.cls === 'inf') {
        if (!canFireNow) continue;
        this.angle = want;
      } else if (this.tpl.truck) continue;
      if (!aligned || w.cd > 0) continue;
      if (this.holdFire && !(o && (o.type === 'attack' || o.type === 'fireground'))) continue;
      if (this.cls === 'inf') this.proneT = Math.max(this.proneT, 3);   // в перестрелке — лёжа
      this.fire(w, tgt, px, py);
    }
  }

  scanTargets(moveOnly) {
    const o = this.order;
    const forced = o && o.type === 'attack' ? o.target : null;
    const groundPt = o && o.type === 'fireground' ? o : null;
    if (moveOnly && this.cls !== 'veh') { for (const w of this.weapons) { w.target = null; w.point = null; } return; }
    const enemySide = other(this.side);
    const maxR = this.maxRange();
    const cands = [];
    for (const e of G.units) {
      if (!e.alive || e.side !== enemySide || !e.visibleTo[this.side]) continue;
      if (Math.abs(e.x - this.x) > maxR || Math.abs(e.y - this.y) > maxR) continue;
      const d = dist(e, this);
      if (d <= maxR) cands.push([e, d]);
    }
    for (const w of this.weapons) {
      w.point = null;
      if (!this.canUse(w)) { w.target = null; continue; }
      if (groundPt && w.def.main) {
        const d = Math.hypot(groundPt.x - this.x, groundPt.y - this.y);
        if (d <= w.def.range * TILE) { w.target = null; w.point = { x: groundPt.x, y: groundPt.y }; continue; }
      }
      if (forced && forced.visibleTo[this.side] && this.effectiveness(w, forced) > 0) {
        const d = dist(forced, this);
        if (d <= w.def.range * TILE && !(w.def.minRange && d < w.def.minRange * TILE)) { w.target = forced; continue; }
      }
      // текущая цель ещё годна?
      if (w.target && w.target.alive && w.target.visibleTo[this.side] && dist(w.target, this) <= w.def.range * TILE && Math.random() < 0.7) continue;
      let best = null, bs = 1e9;
      for (const [e, d] of cands) {
        if (d > w.def.range * TILE) continue;
        if (w.def.minRange && d < w.def.minRange * TILE) continue;
        const eff = this.effectiveness(w, e);
        if (eff <= 0) continue;
        if (w.def.indirect && e.cls === 'inf') {
          // артиллерия по одиночной пехоте не стреляет
          let n = 0;
          for (const [e2] of cands) if (e2.cls === 'inf' && Math.abs(e2.x - e.x) < 60 && Math.abs(e2.y - e.y) < 60) n++;
          if (n < 3) continue;
        }
        const score = d / TILE - eff * 8 - (e === this.lastAttacker ? 3 : 0);
        if (score < bs) { bs = score; best = e; }
      }
      w.target = best;
    }
  }

  hitChance(w, tgt) {
    const d = w.def;
    const dd = dist(this, tgt) / TILE;
    let p = d.acc * (1 - 0.45 * dd / d.range);
    if (tgt.cls === 'inf') p *= tgt.isProne() ? 0.55 : 0.75;
    else if (tgt.cls === 'gun') p *= 0.85;
    else p *= tgt.type === 'heavy' ? 1.1 : 1;
    if (tgt.cls === 'inf' && tgt.inCover()) p *= 0.55;
    if (tgt.moving) p *= 0.8;
    if (this.moving) p *= 0.55;
    if (this.suppression > 50) p *= 0.5;
    return clamp(p, 0.03, 0.95);
  }

  fire(w, tgt, px, py) {
    const d = w.def;
    if (d.usesAmmo && this.ammo !== null) this.ammo--;
    else if (w.ammo !== null) w.ammo--;
    if (d.burst) {
      if (w.burst <= 0) w.burst = d.burst;
      w.burst--;
      w.cd = w.burst > 0 ? d.gap : d.reload * rand(0.9, 1.1);
    } else w.cd = d.reload * rand(0.92, 1.08);
    this.lastFire = G.time;
    // точка вылета
    let ang = this.hasTurret ? this.tAngle : this.angle;
    const muzzleLen = this.cls === 'inf' ? 7 : (this.size[0] * (this.hasTurret ? 0.75 : 0.7));
    const mx = this.x + Math.cos(ang) * muzzleLen, my = this.y + Math.sin(ang) * muzzleLen;
    const mz = this.muzzleZ();
    if (d.type === 'bullet') {
      spawnParticle('flash', mx, my, { size: this.cls === 'inf' ? 2.5 : 3, life: 0.06, z: mz });
    } else {
      spawnParticle('flash', mx, my, { size: d.rocket ? 5 : 8, life: 0.1, z: mz });
      for (let i = 0; i < 4; i++) spawnParticle('smoke', mx, my, { size: rand(3, 6), life: rand(0.6, 1.4), vx: Math.cos(ang) * 20 + rand(-8, 8), vy: Math.sin(ang) * 20 + rand(-8, 8), z: mz, vz: 4 });
      this.flash = 0.12;
      if (this.cls === 'veh' || this.cls === 'gun') this.recoil = 1;
    }
    AUDIO.play(d.snd, this.x, this.y);

    if (d.type === 'he') {
      const dd = Math.hypot(px - this.x, py - this.y) / TILE;
      const spread = (0.6 + dd * 0.035) * TILE;
      const tx = px + gauss() * spread, ty = py + gauss() * spread;
      const time = 1.4 + dd * TILE / 420;
      G.projectiles.push({ kind: 'arty', sx: mx, sy: my, x: mx, y: my, tx, ty, t: 0, T: time, h: dd * TILE * 0.3, w: d, owner: this, whistle: false });
      return;
    }
    if (d.type === 'frag') {
      const dd = Math.hypot(px - this.x, py - this.y);
      const sp = (0.25 + dd / TILE * 0.08) * TILE;
      const gx = px + gauss() * sp, gy = py + gauss() * sp;
      G.projectiles.push({ kind: 'grenade', x: this.x, y: this.y, sx: this.x, sy: this.y, tx: gx, ty: gy, t: 0, T: Math.max(0.5, Math.hypot(gx - this.x, gy - this.y) / d.speed), w: d, owner: this, z0: 4 });
      if (this.side === 'player' && Math.random() < 0.3) addFloat(this.x, this.y, 'Граната!', '#ffd27a');
      return;
    }
    let hit = false, tx = px, ty = py;
    if (tgt) {
      hit = Math.random() < this.hitChance(w, tgt);
      if (!hit) {
        const off = (tgt.cls === 'inf' ? 10 : 18) + Math.random() * 18;
        const a = Math.random() * Math.PI * 2;
        tx += Math.cos(a) * off; ty += Math.sin(a) * off;
        if (d.type === 'ap' && !d.thrown) { tx += Math.cos(ang) * 20; ty += Math.sin(ang) * 20; }
      }
      // подавление
      if (d.type === 'bullet' && tgt.cls === 'inf') tgt.suppression = Math.min(100, tgt.suppression + (d.suppress || 1) * 7);
    }
    const spd = d.type === 'bullet' ? 1300 : (d.speed || 700);
    const len = Math.hypot(tx - mx, ty - my);
    const soft = tgt && tgt.cls === 'inf' && d.type === 'ap' && !d.rocket && !d.thrown && d.softSplash;
    G.projectiles.push({
      kind: d.type === 'bullet' ? 'bullet' : (d.thrown ? 'grenade' : (d.rocket ? 'rocket' : 'shell')),
      x: mx, y: my, sx: mx, sy: my, tx, ty, t: 0, T: Math.max(0.03, len / spd), w: d, owner: this, target: tgt, hit,
      soft, ox: this.x, oy: this.y, z0: mz, shotDist: dist(this, tgt || { x: px, y: py }),
    });
  }

  supplyStep(dt) {
    this.supplyT -= dt;
    if (this.supplyT > 0 || this.supply <= 0) return;
    this.supplyT = 1;
    for (const u of G.units) {
      if (!u.alive || u.side !== this.side || u === this) continue;
      if (Math.abs(u.x - this.x) > 3.5 * TILE || Math.abs(u.y - this.y) > 3.5 * TILE) continue;
      if (dist(u, this) > 3.5 * TILE) continue;
      let used = false;
      if (u.ammo !== null && u.ammo < u.maxAmmo && this.supply >= 4) { u.ammo = Math.min(u.maxAmmo, u.ammo + 4); this.supply -= 4; used = true; }
      for (const w of u.weapons) {
        if (w.ammo !== null && w.ammo < w.def.ammo && this.supply >= 3) { w.ammo++; this.supply -= 3; used = true; }
      }
      if ((u.cls === 'veh' || u.cls === 'gun') && u.hp < u.maxHp && this.supply >= 2) {
        u.hp = Math.min(u.maxHp, u.hp + 10); this.supply -= 2; used = true;
      }
      if (used && Math.random() < 0.5) spawnParticle('spark', u.x + rand(-5, 5), u.y + rand(-5, 5), { life: 0.6, color: '#9fe08a', size: 2, z: 6, vz: 20 });
    }
  }
}

// ------------------------------------------------------------
//  Урон
// ------------------------------------------------------------
function applyDamage(u, dmg, attacker) {
  if (!u.alive || dmg <= 0) return;
  u.hp -= dmg;
  u.lastHitT = G.time;
  if (attacker && attacker.alive) u.lastAttacker = attacker;
  if (u.side === 'enemy' && typeof AI !== 'undefined') AI.onHit(u, attacker);
  if (u.hp <= 0) killUnit(u, attacker);
}

function killUnit(u, attacker, how) {
  if (!u.alive) return;
  u.alive = false; u.hp = 0;
  G.selection.delete(u);
  G.stats[u.side].lost++;
  if (attacker) { attacker.kills++; G.stats[attacker.side].kills++; }
  if (u.cls === 'inf') {
    R.decalCorpse(u);
  } else {
    G.wrecks.push({ x: u.x, y: u.y, angle: u.angle, tAngle: u.tAngle, type: u.type, faction: u.faction, size: u.size, burn: u.cls === 'veh' ? rand(45, 75) : 6, cls: u.cls, smokeT: 0 });
    explosionFX(u.x, u.y, u.cls === 'veh' ? 1.4 : 0.9, true);
    AUDIO.play('explode', u.x, u.y);
  }
  if (u.side === 'player' && u.cls !== 'inf') UI.msg('Потерян: ' + u.name, 'bad', u.x, u.y);
  if (u.side === 'enemy' && u.cls !== 'inf' && u.visibleTo.player) UI.msg('Уничтожен: ' + u.name, 'good', u.x, u.y);
}

// пуля по пехоте: стоящий в полный рост почти всегда выбывает, залёгший защищён
function infBulletK(u) {
  let k = u.isProne() ? 1.4 : 3.5;
  if (u.inCover()) k *= 0.7;
  return k;
}

function bulletLine(p) {
  const d = p.w, ax = p.sx, ay = p.sy;
  let dx = p.tx - ax, dy = p.ty - ay;
  const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const reach = L + 4 * TILE;   // пролёт за точку прицеливания
  for (const u of G.units) {
    if (!u.alive || u.cls !== 'inf' || u === p.target || !p.owner || u.side === p.owner.side) continue;
    const rx = u.x - ax, ry = u.y - ay;
    const along = rx * dx + ry * dy;
    if (along < 8 || along > reach) continue;
    if (Math.abs(rx * dy - ry * dx) > 3.2) continue;
    let ch = u.isProne() ? 0.07 : 0.4;      // залёгший почти неуязвим, стоящий — открыт
    if (u.inCover()) ch *= 0.5;
    if (Math.random() > ch) continue;
    applyDamage(u, d.dmg * rand(0.8, 1.2) * infBulletK(u), p.owner);
    bloodFX(u.x, u.y, ax, ay);
    u.suppression = Math.min(100, u.suppression + 10);
  }
}

// кровь: брызги в сторону полёта пули и пятно на земле
function bloodFX(x, y, fx, fy) {
  const a = Math.atan2(y - fy, x - fx);
  for (let i = 0; i < 6; i++) {
    const b = a + rand(-0.7, 0.7), v = rand(15, 45);
    spawnParticle('spark', x, y, { color: i % 2 ? '#7a0d08' : '#a0140c', size: rand(1, 1.8), life: rand(0.3, 0.6), z: rand(4, 7), vz: rand(5, 30), vx: Math.cos(b) * v, vy: Math.sin(b) * v });
  }
  if (typeof R !== 'undefined' && R.decalBlood) R.decalBlood(x + Math.cos(a) * rand(2, 6), y + Math.sin(a) * rand(2, 6), rand(1.5, 3));
}

function resolveAP(p) {
  const t = p.target, d = p.w;
  if (!t || !t.alive) return;
  if (t.cls === 'inf') {
    applyDamage(t, d.softDmg || d.dmg * 0.4, p.owner);
    return;
  }
  const a = Math.atan2(p.oy - t.y, p.ox - t.x);
  const rel = Math.abs(normAng(a - t.angle));
  const facet = rel < Math.PI / 4 ? 'f' : rel > Math.PI * 3 / 4 ? 'r' : 's';
  const armor = t.armor[facet] || 0;
  const penEff = d.pen * (1 - 0.2 * (p.shotDist / TILE) / d.range) * rand(0.88, 1.12);
  const vis = t.visibleTo.player || t.side === 'player';
  if (penEff >= armor) {
    const dmg = d.dmg * rand(0.85, 1.15) * (facet === 'r' ? 1.25 : 1);
    applyDamage(t, dmg, p.owner);
    for (let i = 0; i < 6; i++) spawnParticle('spark', t.x, t.y, { vx: rand(-60, 60), vy: rand(-60, 60), life: rand(0.2, 0.5), size: 2, color: '#ffcc55', z: 7, vz: rand(10, 60) });
    if (vis && armor > 0) addFloat(t.x, t.y, 'Пробитие', '#ff6a4d');
  } else {
    if (penEff > armor * 0.8) applyDamage(t, d.dmg * 0.08, p.owner);
    for (let i = 0; i < 5; i++) spawnParticle('spark', t.x, t.y, { vx: rand(-90, 90), vy: rand(-90, 90), life: rand(0.15, 0.35), size: 1.6, color: '#fff2b0', z: 7, vz: rand(20, 70) });
    if (vis) addFloat(t.x, t.y, 'Рикошет', '#d8d8d8');
    AUDIO.play('ricochet', t.x, t.y);
  }
}

function explode(x, y, radius, dmg, pen, attacker, big) {
  const m = G.map;
  for (const u of G.units) {
    if (!u.alive) continue;
    const rr = radius + u.radius;
    if (Math.abs(u.x - x) > rr * 2 || Math.abs(u.y - y) > rr * 2) continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (u.cls === 'inf' && d < rr * 2) u.suppression = Math.min(100, u.suppression + 70 * (1 - d / (rr * 2)));
    if (d > rr) continue;
    const f = 1 - (d / rr) * 0.75;
    let dmgU = 0;
    if (u.cls === 'inf') dmgU = dmg * f * (u.inCover() ? 0.6 : 1) * (u.isProne() ? 0.75 : 1);
    else if (u.cls === 'gun') dmgU = dmg * f * 0.85;
    else {
      const top = (u.armor.r || 0) * 0.6;
      dmgU = (pen * f > top) ? dmg * f * 0.65 : dmg * f * 0.08;
    }
    applyDamage(u, dmgU, attacker);
  }
  // здания
  const tr = Math.ceil(radius / TILE);
  const tx0 = Math.floor(x / TILE), ty0 = Math.floor(y / TILE);
  const hitB = new Set();
  for (let oy = -tr; oy <= tr; oy++) for (let ox = -tr; ox <= tr; ox++) {
    const tx = tx0 + ox, ty = ty0 + oy;
    if (!m.inb(tx, ty)) continue;
    const b = m.bld[m.idx(tx, ty)];
    if (b >= 0 && !hitB.has(b)) {
      hitB.add(b);
      if (m.damageBuilding(b, dmg * 0.8)) {
        explosionFX((m.buildings[b].x + m.buildings[b].w / 2) * TILE, (m.buildings[b].y + m.buildings[b].h / 2) * TILE, 1.2, false);
        PF.rebuildObs();
      }
    }
  }
  explosionFX(x, y, big ? 1.2 : 0.8, false);
  R.decalCrater(x, y, radius * (big ? 0.55 : 0.4));
  if (R.flattenVeg) R.flattenVeg(x, y, radius * 0.6);
}

// ------------------------------------------------------------
//  Снаряды
// ------------------------------------------------------------
function updateProjectiles(dt) {
  const arr = G.projectiles;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.t += dt;
    const k = Math.min(1, p.t / p.T);
    p.x = p.sx + (p.tx - p.sx) * k;
    p.y = p.sy + (p.ty - p.sy) * k;
    if (p.kind === 'arty') {
      p.z = 4 * p.h * k * (1 - k);
      if (!p.whistle && p.T - p.t < 0.9) { p.whistle = true; AUDIO.play('whistle', p.tx, p.ty); }
    } else if (p.kind === 'grenade') {
      p.z = 4 * 18 * k * (1 - k);
    } else if (p.kind === 'rocket' && Math.random() < 0.6) {
      spawnParticle('smoke', p.x, p.y, { size: rand(2, 4), life: rand(0.4, 0.8), z: p.zc || 6 });
    }
    if (k >= 1) {
      arr.splice(i, 1);
      impact(p);
    }
  }
}

function impact(p) {
  const d = p.w;
  if (p.kind === 'arty') {
    explode(p.tx, p.ty, d.splash * TILE, d.dmg, d.pen, p.owner, true);
    AUDIO.play('explode', p.tx, p.ty);
    return;
  }
  if (p.kind === 'bullet') {
    if (p.hit && p.target && p.target.alive) {
      const t = p.target;
      let dmg = d.dmg * rand(0.8, 1.2);
      if (t.cls === 'inf') dmg *= infBulletK(t);
      if (t.cls === 'gun') dmg *= 0.45;
      if (t.cls === 'veh') { if (d.pen < (t.armor.s || 0)) dmg = 0; else dmg *= 0.5; }
      applyDamage(t, dmg, p.owner);
      if (t.cls === 'inf') bloodFX(t.x, t.y, p.sx, p.sy);
    } else if (Math.random() < 0.35) {
      spawnParticle('dust', p.tx, p.ty, { size: 2, life: 0.35, vz: 12 });
    }
    // пуля летит дальше и задевает всех на линии огня: стоящую пехоту очередь косит рядами
    bulletLine(p);
    return;
  }
  if (d.type === 'frag') {   // осколочная граната: взрыв с запалом, осколки по площади
    explode(p.tx, p.ty, d.splash * TILE, d.dmg, d.pen, p.owner, false);
    AUDIO.play('explode_small', p.tx, p.ty);
    return;
  }
  // снаряд / ракета / граната
  if (p.soft) {
    explode(p.tx, p.ty, d.softSplash * TILE, d.softDmg, 10, p.owner, false);
    AUDIO.play('explode_small', p.tx, p.ty);
    return;
  }
  if (p.hit && p.target && p.target.alive) {
    resolveAP(p);
    if (d.splash) explode(p.tx, p.ty, d.splash * TILE, d.softDmg || 20, 5, p.owner, false);
    explosionFX(p.tx, p.ty, 0.5, false);
  } else {
    // промах — разрыв на земле
    if (d.softSplash || d.splash) explode(p.tx, p.ty, (d.softSplash || d.splash) * TILE * 0.8, (d.softDmg || 20) * 0.7, 5, p.owner, false);
    else { for (let i = 0; i < 5; i++) spawnParticle('dust', p.tx, p.ty, { size: rand(3, 6), life: rand(0.5, 1), vx: rand(-15, 15), vy: rand(-15, 15), vz: rand(5, 20) }); }
  }
  AUDIO.play('explode_small', p.tx, p.ty);
}

// ------------------------------------------------------------
//  Частицы и эффекты
// ------------------------------------------------------------
function spawnParticle(type, x, y, o = {}) {
  if (G.particles.length > 1800) return;
  G.particles.push({ type, x, y, z: o.z || 0, vz: o.vz || 0, vx: o.vx || 0, vy: o.vy || 0, life: o.life || 1, max: o.life || 1, size: o.size || 3, color: o.color, rot: Math.random() * 6 });
}
function explosionFX(x, y, scale, fire) {
  spawnParticle('flash', x, y, { size: 16 * scale, life: 0.15, z: 5 });
  for (let i = 0; i < 10 * scale; i++) {   // пылевое кольцо по земле
    const a = Math.random() * 6.283, v = rand(40, 70) * scale;
    spawnParticle('dust', x, y, { size: rand(4, 7) * scale, life: rand(0.8, 1.6), vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: 1, vz: rand(2, 8) });
  }
  for (let i = 0; i < 10 * scale; i++) spawnParticle('fire', x + rand(-6, 6) * scale, y + rand(-6, 6) * scale, { size: rand(5, 10) * scale, life: rand(0.3, 0.7), vx: rand(-30, 30) * scale, vy: rand(-30, 30) * scale, z: 3, vz: rand(10, 40) * scale });
  for (let i = 0; i < 12 * scale; i++) spawnParticle('smoke', x + rand(-8, 8) * scale, y + rand(-8, 8) * scale, { size: rand(6, 12) * scale, life: rand(1.2, 3), vx: rand(-15, 15) + 4, vy: rand(-15, 15), z: rand(2, 10), vz: rand(6, 18) });
  for (let i = 0; i < 8 * scale; i++) spawnParticle('debris', x, y, { size: rand(1.5, 3), life: rand(0.6, 1.2), vx: rand(-80, 80) * scale, vy: rand(-80, 80) * scale, z: 3, vz: rand(60, 150) * scale });
}
function updateParticles(dt) {
  const arr = G.particles;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.life -= dt;
    if (p.life <= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const damp = p.type === 'debris' ? 0.9 : 0.96;
    p.vx *= Math.pow(damp, dt * 60); p.vy *= Math.pow(damp, dt * 60);
    p.z += p.vz * dt;
    if (p.type === 'debris' || p.type === 'spark') { p.vz -= 260 * dt; if (p.z < 0) { p.z = 0; p.vz = 0; p.vx *= 0.3; p.vy *= 0.3; } }
    else p.vz *= Math.pow(0.97, dt * 60);
    if (p.type === 'smoke') { p.size += dt * 4; p.vz += dt * 2; }
  }
  for (const w of G.wrecks) {
    if (w.burn > 0) {
      w.burn -= dt; w.smokeT -= dt;
      if (w.smokeT <= 0) {
        const hot = w.burn > 20;
        w.smokeT = hot ? 0.09 : 0.25;
        // ветер сносит столб на восток
        spawnParticle('smoke', w.x + rand(-4, 4), w.y + rand(-4, 4), { size: hot ? rand(6, 10) : rand(4, 6), life: hot ? rand(4, 6.5) : rand(2.5, 4), vx: rand(-2, 2) + 7, vy: rand(-2, 2) - 2, z: 9, vz: rand(14, 22), color: hot ? 'black' : 'grey' });
        if (hot) spawnParticle('fire', w.x + rand(-6, 6), w.y + rand(-6, 6), { size: rand(4, 7), life: rand(0.3, 0.6), z: rand(4, 9), vz: rand(10, 20) });
        if (hot && Math.random() < 0.08) spawnParticle('spark', w.x, w.y, { size: 1.2, life: 0.8, z: 10, vz: rand(30, 60), vx: rand(-15, 15), vy: rand(-15, 15) });
      }
    }
  }
  for (let i = G.floats.length - 1; i >= 0; i--) {
    const f = G.floats[i];
    f.life -= dt; f.z += dt * 14;
    if (f.life <= 0) G.floats.splice(i, 1);
  }
}
function addFloat(x, y, text, color) {
  if (G.floats.length > 40) return;
  G.floats.push({ x, y, z: 22, text, color, life: 1.3 });
}

// ------------------------------------------------------------
//  Разделение юнитов (простая физика столкновений)
// ------------------------------------------------------------
function separate(dt) {
  const cell = 48;
  const grid = new Map();
  const units = G.units;
  for (const u of units) {
    if (!u.alive) continue;
    const k = ((u.x / cell) | 0) * 1000 + ((u.y / cell) | 0);
    let a = grid.get(k); if (!a) grid.set(k, a = []);
    a.push(u);
  }
  const m = G.map;
  for (const u of units) {
    if (!u.alive) continue;
    const cx = (u.x / cell) | 0, cy = (u.y / cell) | 0;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const a = grid.get((cx + ox) * 1000 + cy + oy);
      if (!a) continue;
      for (const v of a) {
        if (v.id <= u.id) continue;
        const dx = v.x - u.x, dy = v.y - u.y;
        const rr = u.radius + v.radius + (u.cls === 'inf' && v.cls === 'inf' ? 1.5 : 1);
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 0.01;
        const ov = (rr - d);
        let wu, wv;
        const uHeavy = u.cls !== 'inf', vHeavy = v.cls !== 'inf';
        if (uHeavy && !vHeavy) { wu = 0; wv = 1; }
        else if (!uHeavy && vHeavy) { wu = 1; wv = 0; }
        else {
          // движущийся уступает меньше
          wu = u.moving && !v.moving ? 0.3 : (!u.moving && v.moving ? 0.7 : 0.5); wv = 1 - wu;
        }
        const push = Math.min(ov, 40 * dt + ov * 0.25);
        const nx = dx / d, ny = dy / d;
        const ux = u.x - nx * push * wu, uy = u.y - ny * push * wu;
        const vx = v.x + nx * push * wv, vy = v.y + ny * push * wv;
        if (wu && m.passablePx(ux, uy, u.cls)) { u.x = ux; u.y = uy; }
        if (wv && m.passablePx(vx, vy, v.cls)) { v.x = vx; v.y = vy; }
      }
    }
  }
}

// ------------------------------------------------------------
//  Групповые приказы
// ------------------------------------------------------------
function formationTargets(units, x, y) {
  const m = G.map;
  const taken = new Set();
  const res = new Map();
  const tx0 = Math.floor(x / TILE), ty0 = Math.floor(y / TILE);
  const sorted = [...units].sort((a, b) => (b.cls !== 'inf') - (a.cls !== 'inf'));
  // кольца клеток
  const ring = [];
  for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) ring.push([dx, dy, dx * dx + dy * dy]);
  ring.sort((a, b) => a[2] - b[2]);
  const single = units.length === 1;
  for (const u of sorted) {
    const big = u.cls !== 'inf';
    let found = null;
    for (const [dx, dy] of ring) {
      const tx = tx0 + dx, ty = ty0 + dy;
      if (!m.passable(tx, ty, u.cls)) continue;
      let ok = true;
      if (big) { for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1; b++) if (taken.has((tx + a) * 1000 + ty + b)) { ok = false; break; } }
      else if (taken.has(tx * 1000 + ty)) ok = false;
      if (!ok) continue;
      found = [tx, ty]; break;
    }
    if (!found) found = [tx0, ty0];
    const [fx, fy] = found;
    if (big) { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) taken.add((fx + a) * 1000 + fy + b); }
    else taken.add(fx * 1000 + fy);
    const px = single ? x : (fx + 0.5) * TILE + rand(-3, 3);
    const py = single ? y : (fy + 0.5) * TILE + rand(-3, 3);
    res.set(u, { x: px, y: py });
  }
  return res;
}
function commandMove(units, x, y, amove) {
  if (!units.length) return;
  const t = formationTargets(units, x, y);
  for (const u of units) { const p = t.get(u); u.orderMove(p.x, p.y, amove); }
}

function spawnUnit(type, side, tx, ty, angle) {
  const cls = BASE[type].cls;
  const p = G.map.nearestPassable(Math.floor(tx), Math.floor(ty), cls, 10) || [tx, ty];
  const u = new Unit(type, side, (p[0] + 0.5) * TILE + rand(-3, 3), (p[1] + 0.5) * TILE + rand(-3, 3), angle);
  G.units.push(u);
  return u;
}
