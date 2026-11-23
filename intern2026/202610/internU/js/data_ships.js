// ============================================================
//  艦：船体・モジュール・技術
// ============================================================
// slots: 載せられるモジュールの数 / req: 必要な技術 {系統: レベル}
const HULLS = {
  dd: { name: '駆逐艦', slots: 2, hp: 130, speed: 78, cost: 60, turns: 1, size: 7, req: {} },
  cl: { name: '巡洋艦', slots: 3, hp: 280, speed: 60, cost: 115, turns: 2, size: 10, req: {} },
  bb: { name: '戦艦', slots: 5, hp: 620, speed: 44, cost: 250, turns: 3, size: 15, req: { eng: 2 } },
  cv: { name: '空母', slots: 4, hp: 420, speed: 48, cost: 220, turns: 3, size: 14, req: { eng: 3 } },
  dn: { name: '弩級旗艦', slots: 7, hp: 1250, speed: 34, cost: 520, turns: 4, size: 20, req: { eng: 5 } },
};

// kind: weapon / def / eng / special
//  武器 type: beam 光線（シールドに弱い）/ kin 実体弾（装甲に弱い）/ msl ミサイル（迎撃される）/ ftr 艦載機
const MODULES = {
  las:  { name: 'レーザー砲', kind: 'weapon', type: 'beam', dmg: 11, range: 230, cd: 0.9, cost: 10, req: {}, desc: '標準の光線砲。' },
  pls:  { name: 'パルスレーザー', kind: 'weapon', type: 'beam', dmg: 6, range: 170, cd: 0.35, cost: 14, req: { wep: 1 }, desc: '近距離で速く撃つ。' },
  rail: { name: '電磁投射砲', kind: 'weapon', type: 'kin', dmg: 34, range: 320, cd: 2.2, cost: 18, req: { wep: 2 }, desc: '遠くまで届く実体弾。シールドを半分すり抜ける。' },
  msl:  { name: 'ミサイル', kind: 'weapon', type: 'msl', dmg: 44, range: 440, cd: 4.2, cost: 14, req: {}, desc: '最も遠くから撃てるが、迎撃されることがある。' },
  pc:   { name: '荷電粒子砲', kind: 'weapon', type: 'beam', dmg: 80, range: 370, cd: 4.6, cost: 30, req: { wep: 4 }, desc: '大型艦向けの主砲。' },
  hg:   { name: '艦載機格納庫', kind: 'weapon', type: 'ftr', dmg: 4, range: 520, cd: 0.6, cost: 24, req: { eng: 2 }, desc: '艦載機を2機。どこまでも追いかける。' },
  void: { name: '虚数崩壊砲', kind: 'weapon', type: 'beam', dmg: 230, range: 400, cd: 7.5, cost: 60, req: { forb: 'f1' }, desc: '【禁忌】空間ごと艦を崩す。' },
  arm:  { name: '複合装甲', kind: 'def', armor: 4, hp: 70, cost: 10, req: {}, desc: '一発ごとの被害を減らし、耐久も上がる。' },
  shd:  { name: 'シールド発生器', kind: 'def', shield: 90, regen: 7, cost: 16, req: { def: 1 }, desc: '光線をよく防ぎ、時間で回復する。' },
  pd:   { name: '迎撃砲', kind: 'def', pd: 0.35, cost: 12, req: {}, desc: 'ミサイルと艦載機を撃ち落とす。' },
  ecm:  { name: '電子戦装置', kind: 'def', ecm: 0.15, cost: 18, req: { def: 3 }, desc: '敵の命中を下げる。' },
  thr:  { name: '追加推進器', kind: 'eng', speed: 0.22, cost: 8, req: {}, desc: '艦を速くする。' },
  rep:  { name: '修理ドローン', kind: 'special', repair: 3, cost: 20, req: { def: 2 }, desc: '戦闘中に分隊の艦を直す。戦いの後の修理も早い。' },
  cmd:  { name: '指揮中枢', kind: 'special', command: 0.2, cost: 22, req: { eco: 2 }, desc: '司令官の力をさらに引き出す。' },
  soul: { name: '意識転写核', kind: 'special', command: 0.5, repair: 6, cost: 50, req: { forb: 'f3' }, desc: '【禁忌】乗員の意識を艦に写す。' },
};

// 技術の系統（各 0〜8）
const TECH_BRANCH = {
  wep: { name: '兵器', col: '#ff7a5a', desc: '艦の火力 +7%／段。新しい武器。' },
  eng: { name: '機関', col: '#60c8ff', desc: '艦の速さ +4%／段。新しい船体。航路を速く進む。' },
  def: { name: '防御', col: '#9ae070', desc: '耐久・シールド +8%／段。防衛衛星が強くなる。' },
  eco: { name: '経済', col: '#f0d060', desc: '収入 +7%／段。開発が早くなる。' },
};
// 各段で解放されるもの（表示用）
const TECH_UNLOCK = {
  wep: { 1: 'パルスレーザー', 2: '電磁投射砲', 4: '荷電粒子砲' },
  eng: { 2: '戦艦・艦載機格納庫', 3: '空母', 4: '航路を2つ進める（自領内）', 5: '弩級旗艦' },
  def: { 1: 'シールド発生器', 2: '修理ドローン', 3: '電子戦装置' },
  eco: { 2: '指揮中枢', 3: '造船所の拡張', 5: '惑星開発の上限 +2' },
};
const techCost = lv => Math.round(70 * Math.pow(lv, 1.55));

// 禁忌技術：強いが、研究すると「蝕」が早まる
const FORBIDDEN = {
  f1: { name: '虚数炉', req: { wep: 4 }, cost: 520, desc: '虚数崩壊砲を作れるようになる。', warn: '蝕が早まる' },
  f2: { name: '星喰らいの解析', req: { def: 4 }, cost: 480, desc: '蝕の艦への被害 +35%。全艦の耐久 +10%。', warn: '蝕が早まる' },
  f3: { name: '意識転写', req: { eco: 4 }, cost: 560, desc: '意識転写核を作れるようになる。士官が戦死しにくくなる。', warn: '蝕が早まる' },
};

// 最初から持っている設計（勢力ごとに少し違う）
const START_DESIGNS = {
  common: [
    { name: '突撃駆逐艦', hull: 'dd', mods: ['las', 'thr'] },
    { name: '護衛駆逐艦', hull: 'dd', mods: ['las', 'pd'] },
    { name: '標準巡洋艦', hull: 'cl', mods: ['las', 'msl', 'arm'] },
    { name: '誘導巡洋艦', hull: 'cl', mods: ['msl', 'msl', 'arm'] },
  ],
};

// 蝕の艦（勢力の設計とは別）
const ECLIPSE_SHIPS = {
  spore: { name: '蝕の胞子', hp: 90, speed: 95, size: 6, weapons: [{ type: 'beam', dmg: 9, range: 150, cd: 0.6 }], armor: 1, shield: 0 },
  maw:   { name: '喰らう顎', hp: 520, speed: 50, size: 14, weapons: [{ type: 'kin', dmg: 40, range: 260, cd: 2.0 }, { type: 'beam', dmg: 12, range: 200, cd: 0.8 }], armor: 5, shield: 0 },
  crown: { name: '黒冠', hp: 1800, speed: 30, size: 22, weapons: [{ type: 'beam', dmg: 90, range: 380, cd: 4.0 }, { type: 'msl', dmg: 40, range: 420, cd: 3.0 }], armor: 7, shield: 150, regen: 6 },
};
