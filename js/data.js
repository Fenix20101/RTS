'use strict';
// ============================================================
//  Стальной рубеж — данные: фракции, оружие, юниты
// ============================================================

const TILE = 24;

const FACTIONS = {
  ger: {
    id: 'ger', name: 'Германия', adj: 'немецкие',
    body: '#62655c', dark: '#41433c', light: '#7e8276', inf: '#5d6152', helmet: '#4a4e44',
    mark: 'cross', flag: '#2b2b2b', flag2: '#e8e8e8',
  },
  usa: {
    id: 'usa', name: 'США', adj: 'американские',
    body: '#615d3a', dark: '#423f26', light: '#7a7550', inf: '#7a7148', helmet: '#5b5634',
    mark: 'star_white', flag: '#2c3f7a', flag2: '#ffffff',
  },
  ussr: {
    id: 'ussr', name: 'СССР', adj: 'советские',
    body: '#4b5733', dark: '#323a22', light: '#64714a', inf: '#6b7046', helmet: '#46562d',
    mark: 'star_red', flag: '#b3201b', flag2: '#f2d24b',
  },
};

// type: bullet — стрелковое, ap — бронебойный снаряд/граната, he — фугас по площади
const WEAPONS = {
  rifle:   { name: 'Винтовка',       type: 'bullet', range: 7,   reload: 1.8, dmg: 15, pen: 3,  acc: 0.55, snd: 'rifle' },
  smg:     { name: 'Пист.-пулемёт',  type: 'bullet', range: 4.5, reload: 1.4, dmg: 7,  pen: 2,  acc: 0.45, burst: 4, gap: 0.09, snd: 'smg' },
  mg:      { name: 'Пулемёт',        type: 'bullet', range: 9,   reload: 1.5, dmg: 12, pen: 6,  acc: 0.35, burst: 7, gap: 0.08, snd: 'mg', suppress: 1.8 },
  coax:    { name: 'Спарка',         type: 'bullet', range: 8,   reload: 2.2, dmg: 10, pen: 6,  acc: 0.3,  burst: 5, gap: 0.09, snd: 'mg', suppress: 1.4 },
  sniper:  { name: 'Снайп. винтовка',type: 'bullet', range: 13,  reload: 4,   dmg: 60, pen: 4,  acc: 0.85, snd: 'sniper' },
  schreck: { name: 'Панцершрек',     type: 'ap', range: 5.5, reload: 6,   dmg: 160, pen: 150, acc: 0.65, ammo: 6, speed: 260, rocket: true, softDmg: 30, splash: 0.7, snd: 'rocket' },
  bazooka: { name: 'Базука M9',      type: 'ap', range: 5,   reload: 5,   dmg: 140, pen: 110, acc: 0.62, ammo: 6, speed: 240, rocket: true, softDmg: 30, splash: 0.7, snd: 'rocket' },
  ptrd:    { name: 'ПТРД',           type: 'ap', range: 8,   reload: 3.2, dmg: 45,  pen: 40,  acc: 0.7,  ammo: 30, speed: 900, softDmg: 30, snd: 'sniper' },
  atgren:  { name: 'Граната РПГ-43', type: 'ap', range: 2.2, reload: 7,   dmg: 150, pen: 75,  acc: 0.75, ammo: 3, speed: 120, softDmg: 30, splash: 0.8, snd: 'none', thrown: true, antitank: true },
  // ручные гранаты: осколочная — по пехоте в укрытии и залёгшей; противотанковая — вплотную к технике
  frag:    { name: 'Ручная граната',  type: 'frag', range: 3.2, minRange: 0.7, reload: 9, dmg: 65, pen: 4, splash: 0.7, acc: 0.6, ammo: 2, speed: 110, snd: 'none', thrown: true },
  atbundle:{ name: 'Противотанковая граната', type: 'ap', range: 1.7, reload: 8, dmg: 140, pen: 70, acc: 0.8, ammo: 1, speed: 100, softDmg: 30, splash: 0.8, snd: 'none', thrown: true, antitank: true },
};

// базовые классы юнитов
const BASE = {
  rifle:  { cls: 'inf', hp: 40, speed: 1.0, vision: 9,  radius: 4, weapons: ['rifle', 'frag', 'atbundle'], short: 'Стр' },
  smg:    { cls: 'inf', hp: 40, speed: 1.1,  vision: 8,  radius: 4, weapons: ['smg', 'frag', 'atbundle'], short: 'Авт' },
  mg:     { cls: 'inf', hp: 45, speed: 0.75, vision: 9,  radius: 4, weapons: ['mg', 'frag'], short: 'Пул' },
  at:     { cls: 'inf', hp: 40, speed: 0.9,  vision: 8,  radius: 4, weapons: [], short: 'ПТ' },
  sniper: { cls: 'inf', hp: 35, speed: 0.95, vision: 13, radius: 4, weapons: ['sniper', 'frag'], short: 'Снп', stealth: 4 },
  light:  { cls: 'veh', hp: 190, speed: 3.4, vision: 9,  turn: 2.6, turretTurn: 2.4, size: [22, 13], ammo: 70, short: 'ЛТ' },
  medium: { cls: 'veh', hp: 330, speed: 2.5, vision: 9,  turn: 1.8, turretTurn: 1.5, size: [27, 16], ammo: 55, short: 'СТ' },
  heavy:  { cls: 'veh', hp: 500, speed: 1.7, vision: 9,  turn: 1.2, turretTurn: 0.9, size: [31, 19], ammo: 45, short: 'ТТ' },
  atgun:  { cls: 'gun', hp: 100, speed: 0.35, vision: 9, turn: 0.9, size: [20, 14], ammo: 60, short: 'ПТО', stealth: 7 },
  howitzer:{cls: 'gun', hp: 120, speed: 0.25, vision: 7, turn: 0.6, size: [24, 16], ammo: 30, short: 'Габ' },
  truck:  { cls: 'veh', hp: 120, speed: 3.6, vision: 7,  turn: 2.2, size: [26, 12], short: 'Снб', supply: 600, truck: true },
};

// пушки техники: генерируются в makeGun
function makeGun(name, o) {
  return Object.assign({
    name, type: 'ap', range: 10, reload: 3.5, dmg: 100, pen: 90, acc: 0.6, speed: 700,
    softDmg: 45, softSplash: 1.0, snd: 'cannon', main: true, usesAmmo: true,
  }, o);
}
function makeHowitzer(name, o) {
  return Object.assign({
    name, type: 'he', range: 40, minRange: 8, reload: 7, dmg: 140, pen: 45, splash: 2.1,
    acc: 1, snd: 'howitzer', main: true, usesAmmo: true, indirect: true,
  }, o);
}

const FACTION_UNITS = {
  ger: {
    rifle:  { name: 'Стрелок (Kar98k)' },
    smg:    { name: 'Автоматчик (MP 40)' },
    mg:     { name: 'Пулемётчик (MG 42)', wmod: { mg: { reload: 1.3, burst: 9, gap: 0.06 } } },
    at:     { name: 'Гранатомётчик (Панцершрек)', weapons: ['schreck', 'frag'] },
    sniper: { name: 'Снайпер' },
    light:  { name: 'Pz.II «Luchs»', speed: 1.5, turn: 1.1, accel: 0.55, turretTurn: 0.35, armor: { f: 30, s: 20, r: 15 }, gun: makeGun('20-мм KwK 38', { range: 8, reload: 1.6, dmg: 16, pen: 28, burst: 4, gap: 0.22, softDmg: 14, softSplash: 0.4, snd: 'autocannon' }) },
    medium: { name: 'Pz.IV Ausf.H', speed: 1.0, turn: 0.7, accel: 0.35, turretTurn: 0.45, armor: { f: 80, s: 30, r: 20 }, gun: makeGun('75-мм KwK 40', { range: 10.5, reload: 3.8, dmg: 110, pen: 105 }) },
    heavy:  { name: 'Tiger I', speed: 0.85, turn: 0.5, accel: 0.22, turretTurn: 0.3, hp: 520, armor: { f: 100, s: 80, r: 80 }, gun: makeGun('88-мм KwK 36', { range: 11.5, reload: 5.5, dmg: 170, pen: 140, acc: 0.68 }) },
    atgun:  { name: 'PaK 40', armor: { f: 10, s: 0, r: 0 }, gun: makeGun('75-мм PaK 40', { range: 11, reload: 3.5, dmg: 120, pen: 115, acc: 0.65 }) },
    howitzer:{name: 'leFH 18', armor: { f: 6, s: 0, r: 0 }, gun: makeHowitzer('105-мм leFH 18', { dmg: 130, splash: 2.0 }) },
    truck:  { name: 'Opel Blitz', speed: 1.45, turn: 1.0, accel: 0.45, armor: { f: 5, s: 5, r: 5 } },
  },
  usa: {
    rifle:  { name: 'Стрелок (M1 Garand)', wmod: { rifle: { reload: 1.4, dmg: 14 } } },
    smg:    { name: 'Автоматчик (Томпсон)' },
    mg:     { name: 'Пулемётчик (M1919)' },
    at:     { name: 'Гранатомётчик (Базука)', weapons: ['bazooka', 'frag'] },
    sniper: { name: 'Снайпер' },
    light:  { name: 'M5A1 «Стюарт»', speed: 1.8, turn: 1.2, accel: 0.6, turretTurn: 0.6, armor: { f: 45, s: 28, r: 25 }, gun: makeGun('37-мм M6', { range: 9, reload: 2, dmg: 55, pen: 50, softDmg: 25, softSplash: 0.6 }) },
    medium: { name: 'M4A3 «Шерман»', speed: 1.25, turn: 0.65, accel: 0.38, turretTurn: 0.42, armor: { f: 75, s: 38, r: 38 }, gun: makeGun('75-мм M3', { range: 10, reload: 3.2, dmg: 105, pen: 88 }) },
    heavy:  { name: 'M26 «Першинг»', speed: 1.0, turn: 0.6, accel: 0.28, turretTurn: 0.4, armor: { f: 100, s: 76, r: 50 }, gun: makeGun('90-мм M3', { range: 11.5, reload: 5, dmg: 160, pen: 135, acc: 0.66 }) },
    atgun:  { name: '57-мм M1', armor: { f: 10, s: 0, r: 0 }, gun: makeGun('57-мм M1', { range: 10.5, reload: 2.8, dmg: 95, pen: 95, acc: 0.65 }) },
    howitzer:{name: 'M2A1 105-мм', armor: { f: 6, s: 0, r: 0 }, gun: makeHowitzer('105-мм M2A1', { dmg: 130, splash: 2.0, reload: 6.5 }) },
    truck:  { name: 'GMC CCKW', speed: 1.45, turn: 0.9, accel: 0.42, armor: { f: 5, s: 5, r: 5 } },
  },
  ussr: {
    rifle:  { name: 'Стрелок (Мосинка)' },
    smg:    { name: 'Автоматчик (ППШ)', wmod: { smg: { burst: 6, gap: 0.06 } } },
    mg:     { name: 'Пулемётчик (ДП-27)' },
    at:     { name: 'Бронебойщик (ПТРД)', weapons: ['ptrd', 'atgren', 'frag'] },
    sniper: { name: 'Снайпер' },
    light:  { name: 'Т-70', speed: 1.25, turn: 1.0, accel: 0.5, turretTurn: 0.35, armor: { f: 45, s: 15, r: 25 }, gun: makeGun('45-мм 20-К', { range: 9, reload: 2.3, dmg: 55, pen: 50, softDmg: 28, softSplash: 0.6 }) },
    medium: { name: 'Т-34-85', speed: 1.5, turn: 0.75, accel: 0.42, turretTurn: 0.5, armor: { f: 75, s: 45, r: 45 }, gun: makeGun('85-мм ЗИС-С-53', { range: 10.5, reload: 4, dmg: 115, pen: 102 }) },
    heavy:  { name: 'ИС-2', speed: 0.9, turn: 0.45, accel: 0.22, turretTurn: 0.3, hp: 540, armor: { f: 120, s: 90, r: 60 }, gun: makeGun('122-мм Д-25Т', { range: 11.5, reload: 8, dmg: 210, pen: 145, acc: 0.6, softDmg: 70, softSplash: 1.5 }) },
    atgun:  { name: 'ЗиС-3', armor: { f: 10, s: 0, r: 0 }, gun: makeGun('76-мм ЗиС-3', { range: 10.5, reload: 2.8, dmg: 100, pen: 88, acc: 0.65 }) },
    howitzer:{name: 'М-30 122-мм', armor: { f: 6, s: 0, r: 0 }, gun: makeHowitzer('122-мм М-30', { dmg: 165, splash: 2.4, reload: 8 }) },
    truck:  { name: 'ЗиС-5', speed: 1.35, turn: 0.9, accel: 0.4, armor: { f: 5, s: 5, r: 5 } },
  },
};

// названия гранат по армиям
const GREN_NAMES = {
  ger:  { frag: 'Граната M24 «колотушка»', atbundle: 'Связка гранат (Geballte Ladung)' },
  usa:  { frag: 'Граната Mk 2', atbundle: 'Ружейная ПТ-граната M9A1' },
  ussr: { frag: 'Граната Ф-1', atbundle: 'Граната РПГ-43' },
};
function weaponCopy(key, faction) {
  const w = Object.assign({ key }, WEAPONS[key]);
  const nm = GREN_NAMES[faction] && GREN_NAMES[faction][key];
  if (nm) w.name = nm;
  if (key === 'atbundle' && faction === 'usa') Object.assign(w, { range: 3.2, pen: 55, dmg: 100 });   // ружейная граната летит дальше, но слабее
  return w;
}

// Собрать полный шаблон юнита
function unitTemplate(type, faction) {
  const b = BASE[type];
  const f = FACTION_UNITS[faction][type] || {};
  const t = Object.assign({ type, faction }, b, f);
  t.armor = f.armor || { f: 0, s: 0, r: 0 };
  const ws = [];
  if (t.gun) ws.push(Object.assign({}, t.gun));
  const wkeys = f.weapons || b.weapons || [];
  for (const k of wkeys) {
    const w = weaponCopy(k, faction);
    if (f.wmod && f.wmod[k]) Object.assign(w, f.wmod[k]);
    ws.push(w);
  }
  if ((type === 'light' || type === 'medium' || type === 'heavy')) {
    ws.push(Object.assign({ key: 'coax' }, WEAPONS.coax));
  }
  t.weaponDefs = ws;
  return t;
}

// Терраин
const T = { GRASS: 0, FIELD: 1, FOREST: 2, WATER: 3, ROAD: 4, BRIDGE: 5, HOUSE: 6, RUBBLE: 7, SAND: 8 };
const TERR_NAME = ['Трава', 'Поле', 'Лес', 'Вода', 'Дорога', 'Мост', 'Здание', 'Руины', 'Берег'];
// стоимость движения [пехота, техника]
// следы техники: цвет и сила продавленной колеи по типу местности; null — следа нет (мост, руины, мощёное)
const TRACK_SOFT = [
  [46, 44, 20, 0.2],    // трава — примятая, с грязью
  [72, 52, 28, 0.24],   // поле — вспаханная земля
  [40, 42, 22, 0.16],   // лес
  null,                 // вода
  [58, 40, 22, 0.3],    // земляная дорога — глубокая колея
  null,                 // мост
  null,                 // здание
  null,                 // руины
  [84, 66, 40, 0.24],   // песчаный берег
];
const MOVE_COST = {
  inf: [1, 1.1, 1.35, 0, 0.9, 0.9, 0, 1.5, 1.1],
  veh: [1, 1.25, 2.6, 0, 0.62, 0.62, 0, 2.2, 1.35],
};
// непрозрачность для обзора
const OPACITY = [0, 0, 1, 0, 0, 0, 3, 0, 0];
