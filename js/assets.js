'use strict';
// ============================================================
//  Загрузка текстур и спрайтов (сгенерированы ComfyUI, см. tools/)
// ============================================================

const ASSETS = {
  tex: {},      // name -> { img, w, h, d: Uint8ClampedArray } (пиксели для запекания земли)
  pat: {},      // name -> CanvasPattern (для домов и т.п.)
  trees: null,  // атлас деревьев
  ok: false,
  TEX: ['grass', 'field', 'forest', 'water', 'road', 'sand', 'rubble', 'planks', 'roof', 'wall', 'thatch', 'logs'],

  loadImg(src) {
    return new Promise(res => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
  },

  async load() {
    if (this.ok) return;
    const tmp = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    await Promise.all(this.TEX.map(async n => {
      const im = await this.loadImg('assets/' + n + '.jpg');
      if (!im) return;
      tmp.canvas.width = im.width; tmp.canvas.height = im.height;
      tmp.drawImage(im, 0, 0);
      let d = null;
      try { d = tmp.getImageData(0, 0, im.width, im.height).data; } catch (e) { /* file:// — без пиксельного доступа */ }
      let mean = [128, 128, 128];
      if (d) {
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        const n4 = d.length / 4; mean = [r / n4, g / n4, b / n4];
      }
      this.tex[n] = { img: im, w: im.width, h: im.height, d, mean };
      this.pat[n] = tmp.createPattern(im, 'repeat');
    }));
    if (typeof TREE_ATLAS !== 'undefined') {
      const im = await this.loadImg('assets/trees.png');
      if (im) {
        // уменьшенные копии для мелкого масштаба (быстрее и без мерцания)
        const half = (src) => {
          const c = document.createElement('canvas');
          c.width = Math.ceil(src.width / 2); c.height = Math.ceil(src.height / 2);
          const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
          g.drawImage(src, 0, 0, c.width, c.height); return c;
        };
        const h1 = half(im), h2 = half(h1);
        this.trees = { img: im, mips: [im, h1, h2], list: TREE_ATLAS };
      }
    }
    // техника, отрендеренная в Blender (tools/blender_units.py)
    if (typeof UNIT_SPRITES !== 'undefined') {
      this.units = {};
      await Promise.all(Object.entries(UNIT_SPRITES.m).map(async ([k, m]) => {
        const im = await this.loadImg(m.f);
        if (im) this.units[k] = Object.assign({ img: im }, m);
      }));
    }
    this.ok = true;
  },

  // обгоревшая копия атласа для подбитой техники
  // поблёкшая копия атласа пехоты для павших (чтобы не путать с живыми залёгшими)
  corpseImg(u) {
    if (!u.cimg) {
      const c = document.createElement('canvas'); c.width = u.img.width; c.height = u.img.height;
      const g = c.getContext('2d');
      g.filter = 'brightness(0.62) saturate(0.55) sepia(0.2)';
      g.drawImage(u.img, 0, 0);
      u.cimg = c;
    }
    return u.cimg;
  },
  wreckImg(u) {
    if (!u.wimg) {
      const c = document.createElement('canvas'); c.width = u.img.width; c.height = u.img.height;
      const g = c.getContext('2d');
      g.filter = 'brightness(0.36) saturate(0.2) contrast(1.15) sepia(0.25)';
      g.drawImage(u.img, 0, 0);
      u.wimg = c;
    }
    return u.wimg;
  },

  has(n) { return !!(this.tex[n] && this.tex[n].d); },
};
