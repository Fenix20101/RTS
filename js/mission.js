'use strict';
// ============================================================
//  Демо-миссия «Переправа»
// ============================================================

const W_ANG = Math.PI;          // смотрит на запад
const SW_ANG = Math.PI * 0.78;  // на юго-запад

const MISSION = {
  title: 'Демо-миссия «Переправа у Вербовки»',
  flags: [],
  objectives: [],
  timers: [],
  reinforcementsPending: 0,

  briefing() {
    const pf = FACTIONS[G.sides.player.faction], ef = FACTIONS[G.sides.enemy.faction];
    return `<p><b>Обстановка.</b> ${ef.adj[0].toUpperCase() + ef.adj.slice(1)} части закрепились за рекой. Южный мост прикрыт опорным пунктом, в деревне Вербовка — основные силы противника с противотанковыми пушками и танками. На высоте к северо-востоку стоит гаубичная батарея и штаб.</p>
    <p><b>Задачи:</b></p>
    <ol>
      <li>Захватить южную переправу (точка <b>А</b>). За это прибудет танковое подкрепление.</li>
      <li>Выбить противника из деревни (точка <b>Б</b>). Подойдёт тяжёлая техника и артиллерия.</li>
      <li>Захватить штаб на высоте (точка <b>В</b>).</li>
    </ol>
    <p><b>Советы.</b> Пехота в лесу и за мешками с песком получает укрытие и труднее обнаруживается. Снайпер видит дальше всех — используйте его для разведки. Танки уязвимы с бортов и кормы. Грузовик снабжения пополняет боезапас и чинит технику рядом с собой. Северный мост — обходной путь, его охраняет небольшой пост.</p>
    <p>Ваши силы: ${pf.adj} войска. Противник: ${ef.adj} войска.</p>`;
  },

  setup() {
    const m = G.map;
    const rS = m.riverX(70), rN = m.riverX(28);
    const ax = Math.round(rS + 7), ay = 70;
    this.flags = [
      { id: 'A', name: 'Переправа', x: ax, y: ay, r: 3, v: -100, owner: 'enemy', captured: false },
      { id: 'B', name: 'Вербовка', x: 78, y: 50, r: 3.5, v: -100, owner: 'enemy', captured: false },
      { id: 'C', name: 'Штаб', x: 112, y: 22, r: 3, v: -100, owner: 'enemy', captured: false },
    ];
    this.objectives = [
      { id: 'A', text: 'Захватить переправу (А)', done: false },
      { id: 'B', text: 'Захватить деревню (Б)', done: false },
      { id: 'C', text: 'Захватить штаб (В)', done: false },
    ];
    this.timers = [];
    this.reinforcementsPending = 2;

    // --- игрок ---
    const P = (type, x, y, a = 0) => spawnUnit(type, 'player', x, y, a);
    const E0 = -0.15;
    [[14, 78], [15, 79], [16, 78], [14, 81], [16, 81], [15, 83]].forEach(([x, y]) => P('rifle', x, y, E0));
    P('smg', 17, 80, E0); P('smg', 17, 83, E0);
    P('mg', 18, 78, E0); P('mg', 18, 82, E0);
    P('at', 13, 80, E0); P('at', 13, 83, E0);
    P('sniper', 19, 80, E0);
    P('light', 10, 76, E0); P('light', 10, 79, E0);
    P('medium', 8, 77.5, E0);
    P('atgun', 11, 83, E0);
    P('truck', 6, 81, E0);

    // --- противник ---
    const E = (type, x, y, a, leash) => { const u = spawnUnit(type, 'enemy', x, y, a); AI.setDefend(u, leash); u.tAngle = a; return u; };
    // опорный пункт у моста
    m.sandbagArc(ax - 1, ay - 3, 1.6, Math.PI * 0.55, Math.PI * 1.45);
    m.sandbagArc(ax - 1, ay + 3, 1.6, Math.PI * 0.55, Math.PI * 1.45);
    m.sandbagArc(ax + 2, ay, 1.7, Math.PI * 0.6, Math.PI * 1.4);
    E('mg', ax - 1, ay - 3, W_ANG, 0);
    E('mg', ax - 1, ay + 3, W_ANG, 0);
    E('atgun', ax + 2, ay, W_ANG, 0);
    E('rifle', ax + 1, ay - 2, W_ANG, 4); E('rifle', ax + 1, ay + 2, W_ANG, 4);
    E('rifle', ax + 3, ay - 4, W_ANG, 4); E('rifle', ax + 3, ay + 4, W_ANG, 4);
    E('at', ax + 1, ay + 1, W_ANG, 3);

    // северный пост
    const nx = Math.round(rN + 6), ny = 28;
    m.sandbagArc(nx - 1, ny, 1.6, Math.PI * 0.55, Math.PI * 1.45);
    E('mg', nx - 1, ny, W_ANG, 0);
    E('rifle', nx, ny - 2, W_ANG, 4); E('rifle', nx, ny + 2, W_ANG, 4); E('rifle', nx + 1, ny, W_ANG, 4);

    // деревня
    m.sandbagArc(72, 53, 1.6, Math.PI * 0.4, Math.PI * 1.2);
    m.sandbagArc(73, 45, 1.6, Math.PI * 0.6, Math.PI * 1.4);
    E('atgun', 70, 56, SW_ANG, 0);
    E('atgun', 71, 44, W_ANG - 0.3, 0);
    E('mg', 72, 53, SW_ANG, 0);
    E('mg', 73, 45, W_ANG, 0);
    E('medium', 81, 47, SW_ANG, 12);
    E('medium', 83, 54, SW_ANG, 12);
    E('light', 77, 59, SW_ANG, 14);
    E('sniper', 69, 49, W_ANG, 2);
    const vill = [[74, 48], [76, 52], [79, 55], [75, 56], [80, 44], [77, 46], [82, 50], [74, 58]];
    vill.forEach(([x, y]) => E('rifle', x, y, SW_ANG, 6));
    E('smg', 78, 52, SW_ANG, 7); E('smg', 79, 48, SW_ANG, 7);
    E('at', 75, 54, SW_ANG, 5); E('at', 77, 45, W_ANG, 5);
    E('truck', 86, 51, SW_ANG, 0);

    // штаб и батарея
    E('howitzer', 115, 18, SW_ANG, 0);
    E('howitzer', 117, 21, SW_ANG, 0);
    E('howitzer', 114, 24, SW_ANG, 0);
    E('truck', 119, 17, SW_ANG, 0);
    E('heavy', 106, 28, SW_ANG, 10);
    E('atgun', 107, 24, SW_ANG, 0);
    m.sandbagArc(108, 27, 1.6, Math.PI * 0.4, Math.PI * 1.2);
    m.sandbagArc(110, 20, 1.6, Math.PI * 0.6, Math.PI * 1.4);
    E('mg', 108, 27, SW_ANG, 0); E('mg', 110, 20, W_ANG, 0);
    [[111, 25], [113, 21], [109, 23], [114, 27], [116, 24], [110, 18]].forEach(([x, y]) => E('rifle', x, y, SW_ANG, 6));
  },

  later(sec, fn) { this.timers.push({ t: G.time + sec, fn }); },

  reinforce(list, msg) {
    const units = [];
    list.forEach(([type, n]) => { for (let i = 0; i < n; i++) units.push(spawnUnit(type, 'player', 1 + (units.length % 3), 74 + Math.floor(units.length / 3) * 1.2, 0)); });
    commandMove(units, 20 * TILE, 74 * TILE, false);
    UI.msg(msg, 'good', 10 * TILE, 75 * TILE);
    AUDIO.play('radio', 0, 0, true);
    this.reinforcementsPending--;
  },

  enemyWave(list, from, to, msg) {
    list.forEach(([type, n]) => {
      for (let i = 0; i < n; i++) {
        const u = spawnUnit(type, 'enemy', from[0] - Math.floor(i / 3), from[1] + (i % 3) - 1, Math.PI);
        AI.setWave(u, to[0], to[1]);
      }
    });
    if (msg) UI.msg(msg, 'warn');
  },

  onCapture(f) {
    const obj = this.objectives.find(o => o.id === f.id);
    if (obj && !obj.done) { obj.done = true; UI.renderObjectives(); }
    if (f.captured) return;
    f.captured = true;
    UI.msg('Захвачена точка ' + f.id + ' — «' + f.name + '»', 'good', f.x * TILE, f.y * TILE);
    if (f.id === 'A') {
      this.later(6, () => this.reinforce([['medium', 2], ['rifle', 4], ['truck', 1]], 'Подкрепление: 2 средних танка, стрелки и грузовик снабжения у западной дороги'));
      this.later(45, () => this.enemyWave([['rifle', 4], ['smg', 1], ['mg', 1], ['light', 1]], [126, 54], [f.x, f.y], 'Разведка докладывает: противник контратакует переправу с востока!'));
    }
    if (f.id === 'B') {
      this.later(8, () => this.reinforce([['heavy', 1], ['medium', 1], ['howitzer', 2], ['truck', 1], ['rifle', 3], ['at', 1]], 'Подкрепление: тяжёлый танк и гаубицы. Гаубицы бьют на 40 клеток — нужна разведка цели (F — огонь по площади)'));
      this.later(35, () => this.enemyWave([['medium', 2], ['rifle', 4], ['smg', 2], ['at', 1]], [126, 54], [78, 50], 'Противник перебрасывает танки к деревне!'));
      this.later(40, () => this.enemyWave([['rifle', 3], ['mg', 1]], [126, 84], [80, 56], null));
    }
    if (f.id === 'C') {
      this.later(2, () => UI.endGame(true));
    }
  },

  update(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (G.time >= this.timers[i].t) { const t = this.timers[i]; this.timers.splice(i, 1); t.fn(); }
    }
    for (const f of this.flags) {
      let p = 0, e = 0;
      const cx = (f.x + 0.5) * TILE, cy = (f.y + 0.5) * TILE, r = f.r * TILE;
      for (const u of G.units) {
        if (!u.alive || u.tpl.truck) continue;
        if (Math.abs(u.x - cx) > r || Math.abs(u.y - cy) > r) continue;
        if (Math.hypot(u.x - cx, u.y - cy) > r) continue;
        if (u.side === 'player') p++; else e++;
      }
      f.contested = p > 0 && e > 0;
      f.pc = p; f.ec = e;
      if (p && !e) f.v = Math.min(100, f.v + (10 + Math.min(p, 6) * 3) * dt);
      else if (e && !p) f.v = Math.max(-100, f.v - (10 + Math.min(e, 6) * 3) * dt);
      if (f.v >= 100 && f.owner !== 'player') { f.owner = 'player'; this.onCapture(f); }
      else if (f.v <= -100 && f.owner !== 'enemy') {
        f.owner = 'enemy';
        UI.msg('Противник отбил точку ' + f.id + '!', 'bad', cx, cy);
        const obj = this.objectives.find(o => o.id === f.id); if (obj) { obj.done = false; UI.renderObjectives(); }
      } else if (f.owner === 'player' && f.v < 0) f.owner = null;
      else if (f.owner === 'enemy' && f.v > 0) f.owner = null;
    }
    // поражение
    if (!G.over) {
      const alive = G.units.some(u => u.alive && u.side === 'player' && !u.tpl.truck);
      if (!alive && !this.timers.length) UI.endGame(false);
    }
  },
};
