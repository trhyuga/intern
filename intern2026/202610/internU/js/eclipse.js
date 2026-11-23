// ============================================================
//  蝕（エクリプス）：銀河の外から来る、星を喰らう異形
//  予兆 → 裂け目が開く → 群れが押し寄せる → 裂け目の核を落とせば退く
// ============================================================
const Eclipse = (() => {
  const E = () => G.eclipse;
  const RIFT_ID = 40;

  function turn() {
    const e = E(), out = [];
    if (e.defeated) return out;
    if (!e.arrived) {
      if (e.omen < 1 && G.turn >= e.eta - 26) { e.omen = 1; G.flags.omen1 = G.turn; Game.log('遠い星がひとつ、音もなく消えた。天文台は観測の誤りだと発表した。', 'warn'); }
      if (e.omen < 2 && G.turn >= e.eta - 10) { e.omen = 2; G.flags.omen2 = G.turn; Game.log('辺境の観測所が「星を覆う影」を報告したのち、通信を絶った。', 'warn'); }
      if (G.turn >= e.eta) { arrive(); out.push('arrive'); }
      return out;
    }
    // 群れを送り出す
    if ((G.turn - e.arrivedAt) % 3 === 0) spawn();
    // 群れの動き
    for (const fl of G.fleets.filter(f => f.fac === 'E')) {
      if (fl.dest !== null && fl.dest !== undefined) continue;
      const targets = G.planets.filter(p => p.owner !== 'E');
      if (!targets.length) continue;
      // いちばん近い、蝕でない星へ
      let best = null, bd = 1e9;
      for (const p of targets) { const h = Game.hops(fl.at, p.id); const sc = h * 10 - p.pop * 0.05; if (h < 99 && sc < bd) { bd = sc; best = p; } }
      if (!best) continue;
      const path = Game.path(fl.at, best.id, n => G.planets[n].owner === 'E');
      if (path && path.length > 1) fl.dest = path[1];
    }
    // 喰われた星は痩せていく
    G.planets.forEach(p => { if (p.owner === 'E' && p.type !== 'rift') { p.def = Math.min(3, p.def + (R.chance(0.3) ? 1 : 0)); } });
    return out;
  }

  function arrive() {
    const e = E();
    e.arrived = true; e.arrivedAt = G.turn;
    e.site = Math.floor(Math.random() * RIFT_SITES.length);
    const site = RIFT_SITES[e.site];
    const sys = G.planets[site.links[0]].sys;
    G.planets.push({ id: RIFT_ID, name: '虚無の裂け目', sys, x: site.x, y: site.y, type: 'rift', desc: '宇宙に穿たれた傷口。ここから蝕が這い出してくる。', owner: 'E', pop: 0, maxPop: 0, ind: 0, res: 0, def: 6, yard: 0, stab: 0, focus: 'def', prog: 0, gov: null, build: [], dock: [], cap: false, seed: 666 });
    e.rift = RIFT_ID;
    Game.buildLanes();
    // 勢力同士の信頼が上がる（共通の敵）
    for (const k in G.rel) { G.rel[k].t = Math.min(100, G.rel[k].t + 25); }
    G.flags.eclipse = G.turn;
    Game.log('虚空が裂けた。「蝕」が来た――星を喰らう異形の群れが、銀河に溢れ出す。', 'big');
    spawn(true);
  }

  function spawn(first) {
    const e = E();
    e.wave++;
    const w = e.wave;
    const fl = { id: G.nextId++, fac: 'E', cmd: null, sub: null, at: RIFT_ID, dest: null, from: RIFT_ID, ships: [], form: 'spindle', moved: false };
    const add = (k, n) => { for (let i = 0; i < n; i++) fl.ships.push({ ecl: k, hp: ECLIPSE_SHIPS[k].hp, xp: 0 }); };
    add('spore', Math.min(12, 4 + w));
    add('maw', Math.min(8, 1 + Math.floor(w / 2)));
    if (w >= 4 && w % 2 === 0) add('crown', 1 + Math.floor(w / 8));
    if (first) add('maw', 1);
    G.fleets.push(fl);
  }

  function onRiftTaken(by) {
    const e = E();
    e.defeated = true; e.defeatedAt = G.turn; e.defeatedBy = by;
    G.planets.forEach(p => { if (p.owner === 'E') { p.owner = null; p.stab = 40; p.def = 1; } });
    G.fleets = G.fleets.filter(f => f.fac !== 'E');
    G.flags.eclipseDown = G.turn;
    Game.log(`${Game.ownerName(by)}が裂け目の核を砕いた。蝕の群れは塵となって消えていく――。`, 'big');
    if (Game.isMajor(by)) Object.keys(G.officers).forEach(k => { if (G.officers[k].fac === by && G.officers[k].role && G.officers[k].role.startsWith('cmd:')) Game.addMerit(k, 10); });
  }

  return { turn, arrive, spawn, onRiftTaken, RIFT_ID };
})();
