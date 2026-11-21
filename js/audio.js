'use strict';
// ============================================================
//  Синтезированный звук (WebAudio)
// ============================================================

const AUDIO = {
  ctx: null, master: null, muted: false, last: {}, noise: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.45; return this.muted; },

  vol(x, y, global) {
    if (global) return 0.6;
    const c = R.viewCenterWorld();
    const d = Math.hypot(x - c.x, y - c.y);
    const lim = Math.max(R.vw, R.vh) / R.cam.z * 0.8;
    return clamp(1 - d / lim, 0, 1);
  },

  noiseShot(dur, type, freq, q, gain, sweepTo) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  },
  tone(f0, f1, dur, gain, type = 'sine') {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },

  play(name, x, y, global) {
    if (!this.ctx || this.muted || name === 'none' || !name) return;
    const now = performance.now();
    const gap = { rifle: 35, smg: 50, mg: 45, sniper: 60, cannon: 60, autocannon: 60, howitzer: 80, explode: 70, explode_small: 50, ricochet: 120, rocket: 80, whistle: 150, radio: 500 }[name] || 50;
    if (this.last[name] && now - this.last[name] < gap) return;
    const v = this.vol(x, y, global);
    if (v <= 0.02) return;
    this.last[name] = now;
    switch (name) {
      case 'rifle': this.noiseShot(0.14, 'bandpass', 1700, 0.8, 0.5 * v); this.tone(160, 60, 0.06, 0.25 * v); break;
      case 'sniper': this.noiseShot(0.25, 'bandpass', 1300, 0.6, 0.7 * v); this.tone(140, 50, 0.1, 0.35 * v); break;
      case 'smg': this.noiseShot(0.07, 'bandpass', 2000, 0.9, 0.35 * v); break;
      case 'mg': this.noiseShot(0.07, 'bandpass', 1500, 0.8, 0.4 * v); this.tone(120, 60, 0.04, 0.15 * v); break;
      case 'autocannon': this.noiseShot(0.18, 'lowpass', 1400, 0.7, 0.6 * v); this.tone(110, 50, 0.1, 0.3 * v); break;
      case 'cannon': this.noiseShot(0.7, 'lowpass', 900, 0.7, 1.0 * v, 200); this.tone(85, 35, 0.35, 0.7 * v); break;
      case 'howitzer': this.noiseShot(1.0, 'lowpass', 600, 0.7, 1.0 * v, 120); this.tone(60, 28, 0.5, 0.8 * v); break;
      case 'rocket': this.noiseShot(0.5, 'bandpass', 600, 1.2, 0.6 * v, 2400); break;
      case 'explode': this.noiseShot(1.3, 'lowpass', 700, 0.6, 1.1 * v, 90); this.tone(55, 25, 0.6, 0.8 * v); break;
      case 'explode_small': this.noiseShot(0.5, 'lowpass', 1100, 0.6, 0.6 * v, 200); this.tone(90, 40, 0.2, 0.3 * v); break;
      case 'ricochet': this.tone(1800 + Math.random() * 800, 3400, 0.18, 0.08 * v, 'triangle'); break;
      case 'whistle': this.tone(1700, 500, 0.9, 0.05 * v); break;
      case 'radio': this.noiseShot(0.25, 'bandpass', 2500, 2, 0.15); this.tone(900, 900, 0.12, 0.06, 'square'); break;
    }
  },
};
