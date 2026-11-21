'use strict';
// ============================================================
//  Запуск и главный цикл
// ============================================================

const MENU = {
  player: 'ussr', enemy: 'ger',
  init() {
    this.render();
    document.getElementById('btn-start').onclick = () => this.toBriefing();
    document.getElementById('btn-go').onclick = () => startGame();
  },
  render() {
    const mk = (side) => Object.values(FACTIONS).map(f => {
      const sel = this[side] === f.id;
      const dis = side === 'enemy' && f.id === this.player;
      return `<button class="fac ${sel ? 'sel' : ''}" ${dis ? 'disabled' : ''} data-side="${side}" data-f="${f.id}">
        <span class="fflag" style="background:${f.flag}"><i style="background:${f.flag2}"></i></span>${f.name}</button>`;
    }).join('');
    document.getElementById('fac-player').innerHTML = mk('player');
    document.getElementById('fac-enemy').innerHTML = mk('enemy');
    document.querySelectorAll('.fac').forEach(b => b.onclick = () => {
      this[b.dataset.side] = b.dataset.f;
      if (this.player === this.enemy) this.enemy = Object.keys(FACTIONS).find(k => k !== this.player);
      this.render();
    });
    const roster = Object.keys(BASE).map(t => {
      const p = FACTION_UNITS[this.player][t], e = FACTION_UNITS[this.enemy][t];
      return `<tr><td>${{ rifle: 'Стрелок', smg: 'Автоматчик', mg: 'Пулемётчик', at: 'Противотанкист', sniper: 'Снайпер', light: 'Лёгкий танк', medium: 'Средний танк', heavy: 'Тяжёлый танк', atgun: 'ПТ-пушка', howitzer: 'Гаубица', truck: 'Снабжение' }[t]}</td><td>${p.name}</td><td>${e.name}</td></tr>`;
    }).join('');
    document.getElementById('roster').innerHTML = `<tr><th></th><th>${FACTIONS[this.player].name}</th><th>${FACTIONS[this.enemy].name}</th></tr>` + roster;
  },
  toBriefing() {
    G.sides.player.faction = this.player;
    G.sides.enemy.faction = this.enemy;
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('briefing').classList.remove('hidden');
    document.getElementById('brief-title').textContent = MISSION.title;
    document.getElementById('brief-text').innerHTML = MISSION.briefing();
  },
};

function startGame() {
  AUDIO.init();
  const br = document.getElementById('briefing');
  br.querySelector('#btn-go').textContent = 'Загрузка карты…';
  setTimeout(async () => {
    await ASSETS.load();
    const map = new GameMap(128, 96, 1944);
    map.generate();
    G.map = map;
    PF.init(map);
    VIS.init(map);
    MISSION.setup();
    PF.rebuildObs();
    R.init(document.getElementById('game'));
    UI.initGame();
    R.cam.z = 1.6;
    R.centerOn(22 * TILE, 76 * TILE);
    VIS.compute('player'); VIS.compute('enemy'); R.updateFog();
    br.classList.add('hidden');
    UI.msg('Командование: захватите переправу у Вербовки. Удачи!', 'info', 16 * TILE, 80 * TILE);
    lastT = performance.now();
    requestAnimationFrame(frame);
  }, 30);
}

let lastT = 0, visT = 0, cleanT = 0;
function step(dt) {
  G.time += dt;
  for (const u of G.units) u.update(dt);
  separate(dt);
  updateProjectiles(dt);
  updateParticles(dt);
  visT -= dt;
  if (visT <= 0) {
    visT = 0.25;
    VIS.compute('player'); VIS.compute('enemy');
    R.updateFog();
  }
  AI.update(dt);
  MISSION.update(dt);
  cleanT -= dt;
  if (cleanT <= 0) { cleanT = 1; G.units = G.units.filter(u => u.alive); }
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (!G.paused) {
    const total = dt * G.speed;
    const n = Math.ceil(total / 0.034);
    for (let i = 0; i < n; i++) step(total / n);
  }
  UI.update(dt);
  R.draw();
  requestAnimationFrame(frame);
}

// полный экран: в приложении — через pywebview, в браузере — Fullscreen API
function toggleFullscreen() {
  if (window.pywebview && window.pywebview.api) { window.pywebview.api.toggle_fullscreen(); return; }
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}
window.addEventListener('keydown', e => {
  if (e.code === 'F11' && !G.map) { e.preventDefault(); toggleFullscreen(); }
});
window.addEventListener('pywebviewready', () => {
  const b = document.getElementById('btn-quit');
  if (b) { b.classList.remove('hidden'); b.onclick = () => window.pywebview.api.quit(); }
});

window.addEventListener('load', () => MENU.init());
