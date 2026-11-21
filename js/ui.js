'use strict';
// ============================================================
//  Интерфейс и управление
// ============================================================

const UI = {
  mouse: { x: 0, y: 0, inside: false }, keys: {}, drag: null, mode: null, hover: null,
  altDown: false, groups: {}, lastClick: { t: 0, type: null }, lastEvent: null, lastGroupKey: { k: null, t: 0 },
  panT: 0, infoT: 0, miniT: 0, midDrag: null,

  $(id) { return document.getElementById(id); },

  initGame() {
    const cv = this.$('game');
    cv.addEventListener('mousedown', e => this.onDown(e));
    window.addEventListener('mousemove', e => this.onMove(e));
    window.addEventListener('mouseup', e => this.onUp(e));
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    cv.addEventListener('mouseenter', () => this.mouse.inside = true);
    document.addEventListener('mouseleave', () => this.mouse.inside = false);
    window.addEventListener('keydown', e => this.onKey(e, true));
    window.addEventListener('keyup', e => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys = {}; this.altDown = false; });
    window.addEventListener('resize', () => R.resize());
    const mini = this.$('minimap');
    mini.addEventListener('mousedown', e => this.onMini(e, true));
    mini.addEventListener('mousemove', e => { if (e.buttons & 1) this.onMini(e, false); });
    mini.addEventListener('contextmenu', e => { e.preventDefault(); this.onMini(e, true); });
    this.$('btn-amove').onclick = () => this.setMode('amove');
    this.$('btn-stop').onclick = () => this.cmdStop();
    this.$('btn-hold').onclick = () => this.cmdHold();
    this.$('btn-fire').onclick = () => this.setMode('fire');
    this.$('btn-prone').onclick = () => this.cmdStance('prone');
    this.$('btn-stand').onclick = () => this.cmdStance('stand');
    this.$('btn-face').onclick = () => this.setMode('face');
    this.$('btn-pause').onclick = () => this.togglePause();
    this.$('btn-sound').onclick = () => { const m = AUDIO.toggle(); this.$('btn-sound').textContent = m ? '🔇' : '🔊'; };
    this.$('btn-speed').onclick = () => this.cycleSpeed();
    this.$('btn-help').onclick = () => this.toggleHelp();
    this.$('btn-help-close').onclick = () => this.toggleHelp();
    this.$('btn-resume').onclick = () => this.togglePause();
    this.$('btn-menu').onclick = () => location.reload();
    this.$('btn-restart').onclick = () => location.reload();
    this.$('hud').classList.remove('hidden');
    this.renderObjectives();
    this.$('mission-title').textContent = MISSION.title;
  },

  // ---------------- сообщения ----------------
  msg(text, type = 'info', x, y) {
    const log = this.$('log');
    if (!log) return;
    const d = document.createElement('div');
    d.className = 'msg ' + type;
    const t = Math.floor(G.time);
    d.innerHTML = `<span class="mt">${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}</span> ${text}`;
    log.appendChild(d);
    while (log.children.length > 7) log.removeChild(log.firstChild);
    setTimeout(() => d.classList.add('fade'), 9000);
    setTimeout(() => d.remove(), 10000);
    if (x !== undefined) this.lastEvent = { x, y };
  },
  renderObjectives() {
    const el = this.$('objectives');
    el.innerHTML = MISSION.objectives.map(o => `<div class="obj ${o.done ? 'done' : ''}">${o.done ? '☑' : '☐'} ${o.text}</div>`).join('');
  },

  // ---------------- мышь ----------------
  unitHeight(u) { return u.cls === 'inf' ? 6 : u.cls === 'gun' ? 5 : 7; },
  unitAt(sx, sy) {
    let best = null, bd = 1e9;
    for (const u of G.units) {
      if (!u.alive) continue;
      if (u.side === 'enemy' && !u.visibleTo.player) continue;
      const p = R.toScreen(u.x, u.y, this.unitHeight(u));
      const r = ((u.cls === 'inf' ? 8 : u.radius * 1.1 + 6)) * R.cam.z + 3;
      const d = Math.hypot(p.x - sx, (p.y - sy) * 1.2);
      if (d < r && d < bd) { bd = d; best = u; }
    }
    return best;
  },
  onDown(e) {
    AUDIO.init();
    const w = R.toWorld(e.clientX, e.clientY);
    if (e.button === 1) { e.preventDefault(); this.midDrag = { x: e.clientX, y: e.clientY, cx: R.cam.x, cy: R.cam.y }; return; }
    if (G.over) return;
    if (e.button === 0) {
      if (this.mode) { this.execMode(w.x, w.y, e.shiftKey, this.unitAt(e.clientX, e.clientY)); return; }
      this.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, shift: e.shiftKey, ctrl: e.ctrlKey };
    } else if (e.button === 2) {
      if (this.mode) { this.setMode(null); return; }
      this.rightClick(w.x, w.y, e.ctrlKey, this.unitAt(e.clientX, e.clientY));
    }
  },
  onMove(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    this.mouse.inside = e.target && e.target.id === 'game';
    if (this.midDrag) {
      R.cam.x = this.midDrag.cx - (e.clientX - this.midDrag.x) / R.cam.z;
      R.cam.y = this.midDrag.cy - (e.clientY - this.midDrag.y) / R.cam.z;
      R.clampCam();
    }
    if (this.drag) { this.drag.x1 = e.clientX; this.drag.y1 = e.clientY; }
    if (G.map) {
      this.hover = this.mouse.inside ? this.unitAt(e.clientX, e.clientY) : null;
      this.updateCursor();
    }
  },
  onUp(e) {
    if (e.button === 1) { this.midDrag = null; return; }
    if (e.button !== 0 || !this.drag) return;
    const d = this.drag; this.drag = null;
    const dx = Math.abs(d.x1 - d.x0), dy = Math.abs(d.y1 - d.y0);
    if (!d.shift) G.selection.clear();
    if (dx > 5 || dy > 5) {
      const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
      const inBox = G.units.filter(u => {
        if (!u.alive || u.side !== 'player') return false;
        const p = R.toScreen(u.x, u.y, this.unitHeight(u));
        return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
      });
      // если в рамке есть боевые — грузовики не выбираем
      const combat = inBox.filter(u => !u.tpl.truck);
      for (const u of (combat.length ? combat : inBox)) G.selection.add(u);
    } else {
      const u = this.unitAt(d.x0, d.y0);
      if (u && u.side === 'player') {
        const now = performance.now();
        if (now - this.lastClick.t < 320 && this.lastClick.type === u.type) {
          // двойной клик — все такие же на экране
          for (const v of G.units) {
            if (!v.alive || v.side !== 'player' || v.type !== u.type) continue;
            const p = R.toScreen(v.x, v.y);
            if (p.x > 0 && p.x < R.vw && p.y > 0 && p.y < R.vh) G.selection.add(v);
          }
        } else if (d.shift && G.selection.has(u)) G.selection.delete(u);
        else G.selection.add(u);
        this.lastClick = { t: now, type: u.type };
      } else if (u) {
        this.inspect = u;
      }
    }
    if (G.selection.size) this.inspect = null;
    this.refreshInfo(true);
  },
  onWheel(e) {
    e.preventDefault();
    const ix = e.clientX / R.cam.z + R.cam.x, iy = e.clientY / R.cam.z + R.cam.y;
    const z = clamp(R.cam.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.4, 2.5);
    R.cam.z = z;
    R.cam.x = ix - e.clientX / z; R.cam.y = iy - e.clientY / z;
    R.clampCam();
  },
  // мини-карта в той же изометрии, что и основной вид: карта — ромб, вид камеры — прямоугольник
  miniGeom() {
    const cv = this.$('minimap'), m = G.map;
    const k = Math.min(cv.width / (m.W + m.H), cv.height / ((m.W + m.H) / 2));
    const ox = (cv.width - (m.W + m.H) * k) / 2 + m.H * k, oy = (cv.height - (m.W + m.H) / 2 * k) / 2;
    return { k, ox, oy };
  },
  miniPt(tx, ty) { const g = this.miniGeom(); return [g.ox + (tx - ty) * g.k, g.oy + (tx + ty) / 2 * g.k]; },
  onMini(e, click) {
    const cv = e.currentTarget, rect = cv.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width * cv.width, py = (e.clientY - rect.top) / rect.height * cv.height;
    const g = this.miniGeom();
    const u = (px - g.ox) / g.k, v = (py - g.oy) / g.k * 2;
    const wx = clamp((u + v) / 2, 0, G.map.W) * TILE, wy = clamp((v - u) / 2, 0, G.map.H) * TILE;
    if (e.button === 2 && click) { this.rightClick(wx, wy, false, null); return; }
    R.centerOn(wx, wy);
  },
  updateCursor() {
    const cv = this.$('game');
    let c = 'default';
    if (this.mode === 'amove' || this.mode === 'face') c = 'crosshair';
    else if (this.mode === 'fire') c = 'cell';
    else if (this.hover && this.hover.side === 'enemy' && G.selection.size) c = 'crosshair';
    else if (this.hover && this.hover.side === 'player') c = 'pointer';
    if (cv.style.cursor !== c) cv.style.cursor = c;
  },

  selected() { return [...G.selection].filter(u => u.alive); },

  rightClick(wx, wy, ctrl, target) {
    const sel = this.selected();
    if (!sel.length) return;
    if (ctrl) { this.fireAt(sel, wx, wy); return; }
    if (target && target.side === 'enemy') {
      let any = false;
      for (const u of sel) if (u.bestWeaponFor(target)) { u.orderAttack(target); any = true; }
      if (any) { R.markers.push({ x: target.x, y: target.y, life: 1, color: '#ff5a40' }); AUDIO.play('radio', 0, 0, true); }
      return;
    }
    commandMove(sel, wx, wy, false);
    R.markers.push({ x: wx, y: wy, life: 1, color: '#8cff6a' });
  },
  fireAt(sel, wx, wy) {
    let n = 0;
    for (const u of sel) {
      const w = u.weapons.find(w => w.def.main);
      if (!w || !u.canUse(w)) continue;
      u.orderFireGround(wx, wy); n++;
    }
    if (n) R.markers.push({ x: wx, y: wy, life: 1.2, color: '#ff8a40' });
    else this.msg('Выбранные юниты не могут вести огонь по площади', 'warn');
  },
  execMode(wx, wy, shift, target) {
    const sel = this.selected();
    if (this.mode === 'amove' && sel.length) {
      if (target && target.side === 'enemy') { for (const u of sel) if (u.bestWeaponFor(target)) u.orderAttack(target); }
      else { commandMove(sel, wx, wy, true); R.markers.push({ x: wx, y: wy, life: 1, color: '#ff7a5a' }); }
    } else if (this.mode === 'fire' && sel.length) {
      this.fireAt(sel, wx, wy);
    } else if (this.mode === 'face' && sel.length) {
      let n = 0;
      for (const u of sel) if (u.cls !== 'inf' || sel.every(v => v.cls === 'inf')) { u.orderFace(wx, wy); n++; }
      if (n) R.markers.push({ x: wx, y: wy, life: 1, color: '#7ad0ff' });
    }
    if (!shift) this.setMode(null);
  },
  setMode(m) {
    if (m && !this.selected().length) return;
    this.mode = m;
    this.$('btn-amove').classList.toggle('active', m === 'amove');
    this.$('btn-fire').classList.toggle('active', m === 'fire');
    this.$('btn-face').classList.toggle('active', m === 'face');
    this.updateCursor();
  },
  cmdStop() { for (const u of this.selected()) u.stop(); },
  // лечь / встать: повторный приказ снимает его, пехота снова действует по обстановке
  cmdStance(st) {
    const inf = this.selected().filter(u => u.cls === 'inf');
    if (!inf.length) return;
    const off = inf.every(u => u.stance === st);
    for (const u of inf) { u.stance = off ? null : st; if (!off && u.order && u.order.type === 'cover') u.order = null; }
    this.msg(off ? 'Пехота: действовать по обстановке' : (st === 'prone' ? 'Пехота: лечь, передвигаться ползком' : 'Пехота: встать'), 'info');
    this.refreshInfo(true);
  },
  cmdHold() {
    const sel = this.selected();
    if (!sel.length) return;
    const v = !sel.every(u => u.holdFire);
    for (const u of sel) u.holdFire = v;
    this.msg(v ? 'Приказ: не открывать огонь' : 'Приказ: огонь по готовности', 'info');
    this.refreshInfo(true);
  },
  cycleSpeed() {
    const s = [1, 1.5, 2, 0.5];
    G.speed = s[(s.indexOf(G.speed) + 1) % s.length];
    this.$('btn-speed').textContent = '×' + G.speed;
  },
  togglePause() {
    if (G.over) return;
    G.paused = !G.paused;
    this.$('pause').classList.toggle('hidden', !G.paused);
  },
  toggleHelp() { this.$('help').classList.toggle('hidden'); },

  onKey(e, down) {
    if (!G.map) return;
    const k = e.code;
    this.keys[k] = down;
    this.altDown = e.altKey;
    if (!down) return;
    if (k === 'AltLeft' || k === 'AltRight' || k === 'F1' || k === 'Tab') e.preventDefault();
    if (k === 'F1') { this.toggleHelp(); return; }
    if (k === 'F11') { e.preventDefault(); toggleFullscreen(); return; }
    if (k === 'Escape') {
      if (this.mode) this.setMode(null);
      else if (!this.$('help').classList.contains('hidden')) this.toggleHelp();
      else this.togglePause();
      return;
    }
    if (k === 'KeyP' || k === 'Pause') { this.togglePause(); return; }
    if (G.over) return;
    if (k === 'KeyA') this.setMode('amove');
    else if (k === 'KeyF') this.setMode('fire');
    else if (k === 'KeyS' && !e.ctrlKey) this.cmdStop();
    else if (k === 'KeyH') this.cmdHold();
    else if (k === 'KeyZ') this.cmdStance('prone');
    else if (k === 'KeyX') this.cmdStance('stand');
    else if (k === 'KeyR') this.setMode('face');
    else if (k === 'KeyM') this.$('btn-sound').click();
    else if (k === 'Equal' || k === 'NumpadAdd') this.cycleSpeed();
    else if (k === 'Space') { e.preventDefault(); if (this.lastEvent) R.centerOn(this.lastEvent.x, this.lastEvent.y); }
    else if (k === 'KeyQ' && e.ctrlKey) { e.preventDefault(); }
    else if (/^Digit[1-9]$/.test(k)) {
      const n = +k.slice(5);
      if (e.ctrlKey || e.altKey) {
        e.preventDefault();
        for (const u of G.units) if (u.group === n) u.group = 0;
        for (const u of this.selected()) u.group = n;
        this.msg('Группа ' + n + ' назначена', 'info');
      } else {
        const g = G.units.filter(u => u.alive && u.side === 'player' && u.group === n);
        if (!g.length) return;
        const now = performance.now();
        if (this.lastGroupKey.k === n && now - this.lastGroupKey.t < 400) {
          const cx = g.reduce((s, u) => s + u.x, 0) / g.length, cy = g.reduce((s, u) => s + u.y, 0) / g.length;
          R.centerOn(cx, cy);
        }
        this.lastGroupKey = { k: n, t: now };
        if (!e.shiftKey) G.selection.clear();
        for (const u of g) G.selection.add(u);
        this.refreshInfo(true);
      }
    }
  },

  // ---------------- кадр ----------------
  update(dt) {
    // камера
    const sp = 900 * dt / R.cam.z;
    let mx = 0, my = 0;
    if (this.keys.ArrowUp) my -= 1;
    if (this.keys.ArrowDown) my += 1;
    if (this.keys.ArrowRight) mx += 1;
    if (this.keys.ArrowLeft) mx -= 1;
    if (document.hasFocus() && !this.drag && !this.midDrag) {
      const m = this.mouse, e = 6;
      if (m.x <= e) mx -= 1; if (m.x >= R.vw - e) mx += 1;
      if (m.y <= e) my -= 1; if (m.y >= R.vh - e) my += 1;
    }
    if (mx || my) { R.cam.x += mx * sp; R.cam.y += my * sp; R.clampCam(); }
    // таймер
    const t = Math.floor(G.time);
    this.$('timer').textContent = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
    this.infoT -= dt;
    if (this.infoT <= 0) { this.infoT = 0.25; this.refreshInfo(false); }
    this.miniT -= dt;
    if (this.miniT <= 0) { this.miniT = 0.15; this.drawMinimap(); }
  },

  drawScreen(ctx) {
    if (this.drag) {
      const d = this.drag;
      const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
      if (w > 5 || h > 5) {
        ctx.fillStyle = 'rgba(140,255,110,0.08)'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(140,255,110,0.8)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      }
    }
    if (this.mode) {
      ctx.font = 'bold 13px Arial'; ctx.fillStyle = '#ffd27a';
      ctx.fillText(this.mode === 'amove' ? 'Атака с ходу: ЛКМ — точка, ПКМ — отмена' : this.mode === 'face' ? 'Развернуться: ЛКМ — направление, ПКМ — отмена' : 'Огонь по площади: ЛКМ — цель, ПКМ — отмена', this.mouse.x + 16, this.mouse.y + 28);
    }
  },

  drawMinimap() {
    const cv = this.$('minimap'), ctx = cv.getContext('2d'), m = G.map;
    const g = this.miniGeom();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e0b'; ctx.fillRect(0, 0, cv.width, cv.height);
    // земля и туман — той же аффинной проекцией, что и основной вид
    ctx.setTransform(g.k, g.k / 2, -g.k, g.k / 2, g.ox, g.oy);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(R.mini, 0, 0, m.W, m.H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(R.fog, 0, 0, m.W, m.H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = 'rgba(160,170,120,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath();
    [[0, 0], [m.W, 0], [m.W, m.H], [0, m.H]].forEach(([tx, ty], i) => { const [x, y] = this.miniPt(tx, ty); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath(); ctx.stroke();
    for (const f of MISSION.flags) {
      const [x, y] = this.miniPt(f.x + 0.5, f.y + 0.5);
      ctx.fillStyle = f.owner === 'player' ? '#5fd35f' : f.owner === 'enemy' ? '#e05a4a' : '#ddd';
      ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.fillStyle = '#000'; ctx.font = 'bold 8px Arial'; ctx.fillText(f.id, x - 2.5, y + 3);
    }
    for (const u of G.units) {
      if (!u.alive) continue;
      if (u.side === 'enemy' && !u.visibleTo.player) continue;
      ctx.fillStyle = u.side === 'player' ? (G.selection.has(u) ? '#ffffff' : '#7dff5a') : '#ff4a3a';
      const s = u.cls === 'inf' ? 2 : 3;
      const [x, y] = this.miniPt(u.x / TILE, u.y / TILE);
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    // рамка видимой области — теперь прямоугольник, как экран
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    const cs = [R.toWorld(0, 0), R.toWorld(R.vw, 0), R.toWorld(R.vw, R.vh), R.toWorld(0, R.vh)];
    ctx.beginPath();
    cs.forEach((p, i) => { const [x, y] = this.miniPt(p.x / TILE, p.y / TILE); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath(); ctx.stroke();
  },

  // ---------------- панель информации ----------------
  refreshInfo(force) {
    const el = this.$('info');
    const sel = this.selected();
    const key = sel.map(u => u.id).join(',') + '|' + (this.inspect ? this.inspect.id : '');
    if (!force && key !== this.lastInfoKey && !sel.length && !this.inspect) { /* nothing */ }
    this.lastInfoKey = key;
    const anyFire = sel.some(u => u.weapons.some(w => w.def.main));
    this.$('btn-fire').disabled = !anyFire;
    this.$('btn-amove').disabled = !sel.length;
    this.$('btn-stop').disabled = !sel.length;
    this.$('btn-hold').disabled = !sel.length;
    this.$('btn-hold').classList.toggle('active', sel.length > 0 && sel.every(u => u.holdFire));
    const inf = sel.filter(u => u.cls === 'inf');
    this.$('btn-prone').disabled = this.$('btn-stand').disabled = !inf.length;
    this.$('btn-prone').classList.toggle('active', inf.length > 0 && inf.every(u => u.stance === 'prone'));
    this.$('btn-stand').classList.toggle('active', inf.length > 0 && inf.every(u => u.stance === 'stand'));
    this.$('btn-face').disabled = !sel.some(u => u.cls !== 'inf');
    if (!sel.length) {
      const u = this.inspect && this.inspect.alive && this.inspect.visibleTo.player ? this.inspect : null;
      el.innerHTML = u ? this.unitCard(u) : `<div class="hint">ЛКМ — выбрать / рамка, ПКМ — идти или атаковать.<br>A — атака с ходу, F — огонь по площади, S — стоп, H — не стрелять.<br>Ctrl/Alt+1…9 — назначить группу. F1 — справка.</div>`;
      if (u) this.drawPortraits(el);
      return;
    }
    if (sel.length === 1) { el.innerHTML = this.unitCard(sel[0]); this.drawPortraits(el); return; }
    const groups = new Map();
    for (const u of sel) { const g = groups.get(u.type) || []; g.push(u); groups.set(u.type, g); }
    let html = `<div class="multi-h">Выбрано: ${sel.length}</div><div class="multi">`;
    for (const [type, us] of groups) {
      const hp = us.reduce((s, u) => s + u.hp / u.maxHp, 0) / us.length;
      html += `<button class="ubtn" data-type="${type}" title="ЛКМ — выбрать только этих, Shift — убрать"><span class="ut">${us[0].short}</span><span class="un">${us[0].name}</span><span class="uc">×${us.length}</span><canvas class="pt" width="88" height="72" data-uid="${us[0].id}"></canvas><span class="uhp" style="width:${Math.round(hp * 100)}%"></span></button>`;
    }
    html += '</div>';
    el.innerHTML = html;
    this.drawPortraits(el);
    el.querySelectorAll('.ubtn').forEach(b => b.onclick = ev => {
      const t = b.dataset.type;
      for (const u of [...G.selection]) if (ev.shiftKey ? u.type === t : u.type !== t) G.selection.delete(u);
      this.refreshInfo(true);
    });
  },
  // портрет: кадр 3D-спрайта юнита, повёрнутого три четверти к зрителю
  drawPortraits(el) {
    const A = ASSETS.units;
    if (!A) return;
    el.querySelectorAll('canvas.pt').forEach(cv => {
      const u = G.units.find(x => x.id === +cv.dataset.uid);
      if (!u) return;
      const g = cv.getContext('2d');
      g.clearRect(0, 0, cv.width, cv.height);
      const ang = Math.PI * 0.62;   // нос влево-вниз, виден борт
      const parts = [];
      if (u.cls === 'inf') {
        const sp = A[u.faction + '_inf_' + u.type];
        if (sp && sp.stand) parts.push([sp.img, sp.stand[R.dirIdx(ang, sp.stand.length)], 0, 0]);
      } else {
        const sp = A[u.faction + '_' + u.type];
        if (sp) {
          parts.push([sp.img, sp.h[R.dirIdx(ang)], 0, 0]);
          if (sp.t) {
            const [ox, oy] = sp.to || [0, 0];
            const c = Math.cos(ang), s2 = Math.sin(ang);
            const tx = c * ox - s2 * oy, ty = s2 * ox + c * oy;
            parts.push([sp.img, sp.t[R.dirIdx(ang)], (tx - ty) * 3, (tx + ty) * 0.5 * 3]);
          }
        }
      }
      if (!parts.length) return;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const [, f, dx, dy] of parts) {
        if (!f) continue;
        x0 = Math.min(x0, dx - f[4]); y0 = Math.min(y0, dy - f[5]);
        x1 = Math.max(x1, dx - f[4] + f[2]); y1 = Math.max(y1, dy - f[5] + f[3]);
      }
      const k = Math.min(cv.width * 0.9 / (x1 - x0), cv.height * 0.9 / (y1 - y0), u.cls === 'inf' ? 3 : 1.6);
      const ox = cv.width / 2 - (x0 + x1) / 2 * k, oy = cv.height / 2 - (y0 + y1) / 2 * k;
      g.imageSmoothingQuality = 'high';
      for (const [img, f, dx, dy] of parts) if (f) g.drawImage(img, f[0], f[1], f[2], f[3], ox + (dx - f[4]) * k, oy + (dy - f[5]) * k, f[2] * k, f[3] * k);
    });
  },
  unitCard(u) {
    const clsName = { inf: 'Пехота', veh: u.tpl.truck ? 'Грузовик' : 'Танк', gun: u.type === 'howitzer' ? 'Гаубица' : 'Противотанковая пушка' }[u.cls];
    const hpk = u.hp / u.maxHp;
    let status = 'Ожидание';
    if (u.order) status = { move: 'Движение', amove: 'Атака с ходу', attack: 'Атака цели', fireground: 'Огонь по площади', assault: 'Подбирается к технике', cover: 'Перебегает в укрытие', face: 'Разворот' }[u.order.type];
    if (u.weapons.some(w => w.target)) status = 'Ведёт бой';
    if (u.suppression > 50) status += ', <span class="warn">подавлен</span>';
    if (u.holdFire) status += ', <span class="warn">не стреляет</span>';
    if (u.stance === 'prone') status += ', лежит';
    else if (u.stance === 'stand') status += ', стоит';
    let html = `<div class="card"><canvas class="pt" width="224" height="192" data-uid="${u.id}"></canvas><div class="cbody"><div class="cn ${u.side}">${u.name}</div><div class="cc">${clsName} · ${FACTIONS[u.faction].name}${u.side === 'enemy' ? ' · противник' : ''}</div>`;
    html += `<div class="bar"><span style="width:${Math.round(hpk * 100)}%;background:${hpk > 0.6 ? '#62d14a' : hpk > 0.3 ? '#e5c43a' : '#e0442e'}"></span><em>${Math.ceil(u.hp)} / ${u.maxHp}</em></div>`;
    if (u.cls !== 'inf' && !u.tpl.truck) html += `<div class="row">Броня: лоб <b>${u.armor.f}</b> · борт <b>${u.armor.s}</b> · корма <b>${u.armor.r}</b> мм</div>`;
    if (u.ammo !== null) html += `<div class="row">Снаряды: <b>${u.ammo}</b> / ${u.maxAmmo}</div>`;
    if (u.tpl.truck) html += `<div class="row">Запас снабжения: <b>${Math.round(u.supply)}</b> / ${u.maxSupply} · пополняет и чинит в радиусе 3,5 клетки</div>`;
    for (const w of u.weapons) {
      const d = w.def;
      html += `<div class="row w">• ${d.name}: дальн. ${d.range}${d.minRange ? ' (мин. ' + d.minRange + ')' : ''}, ${d.type === 'bullet' ? 'урон ' + d.dmg : 'пробитие ' + d.pen + ' мм'}${w.ammo !== null ? ', боезапас ' + w.ammo : ''}</div>`;
    }
    if (u.side === 'player') html += `<div class="row">Состояние: ${status} · Уничтожено: ${u.kills}</div>`;
    html += '</div></div>';
    return html;
  },

  // ---------------- конец игры ----------------
  endGame(win) {
    if (G.over) return;
    G.over = true;
    const el = this.$('end');
    const t = Math.floor(G.time);
    el.querySelector('h1').textContent = win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
    el.querySelector('h1').className = win ? 'win' : 'lose';
    el.querySelector('.stats').innerHTML = `
      <div>Время операции: <b>${Math.floor(t / 60)} мин ${t % 60} с</b></div>
      <div>Уничтожено противника: <b>${G.stats.player.kills}</b></div>
      <div>Наши потери: <b>${G.stats.player.lost}</b></div>
      <div>Захвачено точек: <b>${MISSION.flags.filter(f => f.owner === 'player').length} / ${MISSION.flags.length}</b></div>
      <p>${win ? 'Штаб противника захвачен, переправа в наших руках. Демо-миссия пройдена!' : 'Наступление захлебнулось. Попробуйте другой путь — например, через северный мост — и используйте разведку.'}</p>`;
    el.classList.remove('hidden');
  },
};
