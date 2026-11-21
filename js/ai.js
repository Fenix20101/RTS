'use strict';
// ============================================================
//  ИИ противника
// ============================================================

const AI = {
  t: 0,
  setDefend(u, leash, home) {
    u.ai = { role: 'defend', home: home || { x: u.x, y: u.y }, leash: leash * TILE, alert: null, think: Math.random() };
  },
  setWave(u, tx, ty) {
    u.ai = { role: 'wave', target: { x: tx * TILE, y: ty * TILE }, leash: 9 * TILE, alert: null, think: Math.random() };
    u.orderMove(tx * TILE + rand(-30, 30), ty * TILE + rand(-30, 30), true);
  },
  clampLeash(ai, x, y) {
    const dx = x - ai.home.x, dy = y - ai.home.y, d = Math.hypot(dx, dy);
    if (d <= ai.leash) return { x, y };
    return { x: ai.home.x + dx / d * ai.leash, y: ai.home.y + dy / d * ai.leash };
  },
  onHit(u, attacker) {
    if (!attacker || !u.ai) return;
    const ax = attacker.x, ay = attacker.y;
    for (const v of G.units) {
      if (!v.alive || v.side !== 'enemy' || !v.ai) continue;
      if (Math.abs(v.x - u.x) > 10 * TILE || Math.abs(v.y - u.y) > 10 * TILE) continue;
      v.ai.alert = { x: ax + rand(-20, 20), y: ay + rand(-20, 20), t: G.time };
    }
  },
  update(dt) {
    for (const u of G.units) {
      if (!u.alive || u.side !== 'enemy' || !u.ai) continue;
      const ai = u.ai;
      ai.think -= dt;
      if (ai.think > 0) continue;
      ai.think = 0.8 + Math.random() * 0.5;
      this.think(u, ai);
    }
  },
  think(u, ai) {
    if (ai.role === 'wave') {
      if (!u.order) {
        // волна дошла — переходим к обороне
        ai.role = 'defend'; ai.home = { x: u.x, y: u.y };
      }
      return;
    }
    const busy = u.weapons.some(w => w.target && w.target.alive);
    if (busy) return;
    if (u.order && (u.order.type === 'attack' || u.order.type === 'assault' || u.order.type === 'cover' || u.order.type === 'face')) return;
    if (ai.leash <= 0) return; // стационарный юнит
    if (u.tpl.truck) {
      // грузовик держится у ближайшего раненого союзника
      return;
    }
    // ищем видимую цель в зоне ответственности
    let best = null, bd = 1e9;
    const reach = ai.leash + u.maxRange();
    for (const e of G.units) {
      if (!e.alive || e.side !== 'player' || !e.visibleTo.enemy) continue;
      const dh = Math.hypot(e.x - ai.home.x, e.y - ai.home.y);
      if (dh > reach) continue;
      if (!u.bestWeaponFor(e)) continue;
      const d = dist(e, u);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      const p = this.clampLeash(ai, best.x, best.y);
      if (Math.hypot(p.x - u.x, p.y - u.y) > TILE * 1.5) u.orderMove(p.x, p.y, true);
      return;
    }
    if (ai.alert && G.time - ai.alert.t < 12) {
      const p = this.clampLeash(ai, ai.alert.x, ai.alert.y);
      if (Math.hypot(p.x - u.x, p.y - u.y) > TILE * 2 && !u.order) u.orderMove(p.x, p.y, true);
      return;
    }
    // возвращение домой
    if (!u.order && Math.hypot(u.x - ai.home.x, u.y - ai.home.y) > TILE * 2.5) {
      u.orderMove(ai.home.x, ai.home.y, true);
    }
  },
};
