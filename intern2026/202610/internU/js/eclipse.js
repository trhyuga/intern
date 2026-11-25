// ============================================================
//  蝕（エクリプス）：銀河の外から来る、星を喰らう異形
//  何年もの匂わせ → 予兆 → 先触れ（裂け目1つ・近くの国だけが苦しむ）
//  → 大侵攻（裂け目3つ・銀河じゅうが襲われる）→ 裂け目をすべて閉じても「退いた」だけ
//  → 数年後に、もっと強くなって再来 …… 根を断つまで終わらない
//  根を断つには：裂け目の核を砕いて「核の欠片」を3つ集め（同盟国の分も合わせてよい）、
//  「封印の理論」を研究すると、蝕の源「深淵」への道が開く。深淵の核を砕けば、蝕は二度と来ない
// ============================================================
const Eclipse = (() => {
  const E = () => G.eclipse;
  const KEYS_NEEDED = 3;
  const SEAL = { name: '封印の理論', cost: 900, desc: '核の欠片から、蝕の源への道を割り出す。研究を終えた国だけが「深淵」へ進める。' };
  const PHASE_NAME = { none: '', omen: '予兆', first: '先触れ', lull: '小康', great: '大侵攻', receded: '退潮', ret: '再来', solved: '根絶' };

  // 何年も前から、少しずつ匂わせる（正体には触れない）
  const HINTS = [
    '辺境の輸送船団が、星図にない宙域で消息を絶った。',
    '観測所の計器が、数秒だけ「何もない場所」の重力を拾った。原因は不明。',
    '聖教国の巡礼者たちの間で、「星が泣く夢」を見たという噂が広がっている。',
    '古代遺跡の演算塔が、誰も触れていないのに一晩だけ光った。',
    '星図の端で、昨年まで見えていた小さな星がひとつ見当たらない、と学者が書いた。',
    '辺境の漁師たちが、「黒い雪」が降ったと口々に話している。',
    '学術都市の天文台が、遠い銀河の光が「欠けて」届いていると発表し、すぐに撤回した。',
    '密輸船の船乗りが、「外の宙域から、何かがこちらを見ている」と酒場で震えていた。',
  ];

  // ---------- 古いセーブを新しい形にそろえる ----------
  function norm() {
    const e = E();
    if (!e.phase) {
      e.phase = e.defeated ? 'solved' : e.arrived ? 'first' : (e.omen ? 'omen' : 'none');
      e.cycle = e.cycle || 1; e.rifts = e.rifts || [];
      if (e.rift !== null && e.rift !== undefined && !e.rifts.length) e.rifts.push({ id: e.rift, site: e.site, open: !e.defeated });
      e.hintN = e.hintN || 0; e.hintAt = e.hintAt || 0; e.eaten = e.eaten || 0;
      if (e.arrived && !e.greatAt) e.greatAt = (e.arrivedAt || G.turn) + 20;
    }
    if (e.eta < 90 && !e.arrived && !e.etaFixed) { e.eta += 36; e.etaFixed = true; }   // 古いセーブ：前より遅く来る
    return e;
  }
  // いま蝕が攻めてきているか（先触れ・大侵攻・再来の間）
  const active = () => { const e = G.eclipse; return !!e && ['first', 'great', 'ret', 'lull'].includes(e.phase); };
  const openRifts = () => (E().rifts || []).filter(r => r.open);
  // 核の欠片：自国と同盟国の分を合わせる
  function keysOf(fid) {
    if (!Game.isMajor(fid)) return 0;
    let n = G.facs[fid].ekeys || 0;
    G.facs.forEach(f => { if (f.id !== fid && f.alive && Game.rel(fid, f.id).s === 'ally') n += f.ekeys || 0; });
    return n;
  }
  const canSeal = fid => Game.isMajor(fid) && !G.facs[fid].sealed && keysOf(fid) >= KEYS_NEEDED && E().phase !== 'solved';

  // ---------- 毎月 ----------
  function turn() {
    const e = norm(), out = [];
    if (e.phase === 'solved') return out;
    // 1) 来る前：匂わせ → 予兆
    if (!e.arrived) {
      if (G.turn >= 30 && G.turn < e.eta - 30 && G.turn - e.hintAt >= 9 + Math.floor(Math.random() * 5) && e.hintN < HINTS.length) {
        Game.log('【噂】' + HINTS[e.hintN], 'info'); e.hintN++; e.hintAt = G.turn; G.flags['hint' + e.hintN] = G.turn;
      }
      if (e.omen < 1 && G.turn >= e.eta - 30) { e.omen = 1; e.phase = 'omen'; G.flags.omen1 = G.turn; Game.log('遠い星がひとつ、音もなく消えた。天文台は観測の誤りだと発表した。', 'warn'); }
      if (e.omen < 2 && G.turn >= e.eta - 12) { e.omen = 2; G.flags.omen2 = G.turn; Game.log('辺境の観測所が「星を覆う影」を報告したのち、通信を絶った。', 'warn'); }
      if (e.omen < 3 && G.turn >= e.eta - 4) { e.omen = 3; G.flags.omen3 = G.turn; Game.log('夜空の一角から、星がまとめて消えた。人々は空を見上げ、口をつぐんだ。', 'warn'); }
      triggers();
      if (G.turn >= e.eta) { arrive(); out.push('first'); }
      return out;
    }
    // 2) 先触れから大侵攻へ
    if ((e.phase === 'first' || e.phase === 'lull') && G.turn >= e.greatAt) { great(); out.push('great'); }
    // 3) 退いた後の再来
    if (e.phase === 'receded') {
      if (!e.retWarn && G.turn >= e.returnAt - 8) { e.retWarn = true; G.flags['retomen' + e.cycle] = G.turn; Game.log('観測所が、閉じたはずの裂け目の跡で、ふたたび重力の揺らぎを捉えた。', 'warn'); }
      if (G.turn >= e.returnAt) { comeBack(); out.push('ret'); }
    }
    // 4) 群れを送り出す（開いている裂け目ごと）
    if (['first', 'great', 'ret'].includes(e.phase)) {
      const every = e.phase === 'first' ? 3 : 2;
      for (const r of openRifts()) { garrison(r); if ((G.turn - (r.openedAt || 0)) % every === 0) spawn(r); }
    }
    // 深淵の守り
    if (e.abyss !== undefined && e.abyss !== null && G.planets[e.abyss].owner === 'E') guard();
    // 5) 群れの動き：いちばん近い、蝕でない星へ
    for (const fl of G.fleets.filter(f => f.fac === 'E')) {
      if (fl.guard || (fl.dest !== null && fl.dest !== undefined)) continue;
      const targets = G.planets.filter(p => p.owner !== 'E' && !p.abyss);
      let best = null, bd = 1e9;
      for (const p of targets) { const h = Game.hops(fl.at, p.id); const sc = h * 10 - p.pop * 0.05; if (h < 99 && sc < bd) { bd = sc; best = p; } }
      if (!best) continue;
      const path = Game.path(fl.at, best.id, n => G.planets[n].owner === 'E');
      if (path && path.length > 1) fl.dest = path[1];
    }
    // 6) 喰われた星は、民を失い、死んでいく
    G.planets.forEach(p => {
      if (p.owner !== 'E' || p.type === 'rift') return;
      const loss = Math.min(p.pop, Math.max(0.5, p.pop * 0.12));
      p.pop -= loss; e.eaten += loss; p.stab = 0;
      if (p.pop < 1 && !p.dead) { p.dead = true; p.maxPop = Math.max(5, Math.round(p.maxPop * 0.5)); Game.log(`${p.name}の民は、ひとり残らず消えた。星は死んだ。`, 'bad'); }
      p.def = Math.min(3, p.def + (R.chance(0.3) ? 1 : 0));
    });
    return out;
  }

  // ---------- 裂け目 ----------
  function openRift(site) {
    const e = E();
    let r = e.rifts.find(x => x.site === site);
    if (!r) {
      const S = RIFT_SITES[site], id = G.planets.length;
      G.planets.push({ id, name: ['虚無の裂け目', '黒き裂け目', '喰らう裂け目', '嘆きの裂け目'][site], sys: G.planets[S.links[0]].sys, x: S.x, y: S.y, type: 'rift', desc: '宇宙に穿たれた傷口。ここから蝕が這い出してくる。', owner: 'E', pop: 0, maxPop: 0, ind: 0, res: 0, def: 8, yard: 0, stab: 0, focus: 'def', prog: 0, gov: null, build: [], dock: [], cap: false, seed: 666 + site });
      r = { id, site, open: true, openedAt: G.turn };
      garrison(r);
      e.rifts.push(r);
    } else {
      const p = G.planets[r.id];
      p.owner = 'E'; p.def = 8 + e.cycle * 2; p.closed = false; p.gov = null; p.build = []; p.dock = [];
      r.open = true; r.openedAt = G.turn;
      garrison(r);
    }
    e.rift = r.id; e.site = site;
    Game.buildLanes();
    return r;
  }
  function freeSites() { const used = new Set(openRifts().map(r => r.site)); return RIFT_SITES.map((_, i) => i).filter(i => !used.has(i)); }

  // 先触れ：裂け目が1つ開く。近くの国だけが襲われる
  function arrive() {
    const e = E();
    e.arrived = true; e.arrivedAt = G.turn; e.phase = 'first'; e.cycle = 1;
    e.greatAt = G.turn + 18 + R.i(0, 6);
    const r = openRift(Math.floor(Math.random() * RIFT_SITES.length));
    for (const k in G.rel) G.rel[k].t = Math.min(100, G.rel[k].t + 8);
    G.flags.eclipse = G.turn;
    const near = nearFacs(r.id);
    Game.log(`虚空が裂けた。「蝕」が来た――星を喰らう異形の群れが、${near.length ? near.map(f => FACTIONS[f].short).join('・') + 'の星々へ' : '辺境へ'}溢れ出す。`, 'big');
    spawn(r, true);
  }
  // 大侵攻：裂け目が3つに。群れは何倍にもなる
  function great() {
    const e = E();
    e.phase = 'great'; e.greatStarted = G.turn;
    const want = 3 - openRifts().length;
    const sites = freeSites().sort(() => Math.random() - 0.5);
    for (let i = 0; i < want && i < sites.length; i++) { const r = openRift(sites[i]); G.planets[r.id].def = 10; spawn(r, true); }
    openRifts().forEach(r => { G.planets[r.id].def = Math.max(G.planets[r.id].def, 10); garrison(r); });
    for (const k in G.rel) G.rel[k].t = Math.min(100, G.rel[k].t + 25);
    G.flags.eclipseGreat = G.turn;
    Game.log(`銀河の三方で、同時に虚空が裂けた。蝕の大侵攻――もはや、どの国も他人事ではない。`, 'big');
  }
  // 再来：退いた数年後、もっと強くなって
  function comeBack() {
    const e = E();
    e.phase = 'ret'; e.cycle++; e.retWarn = false;
    const n = Math.min(4, 1 + e.cycle);
    const sites = freeSites().sort(() => Math.random() - 0.5);
    for (let i = 0; i < n && i < sites.length; i++) { const r = openRift(sites[i]); spawn(r, true); }
    for (const k in G.rel) G.rel[k].t = Math.min(100, G.rel[k].t + 20);
    G.flags['eclipseRet' + e.cycle] = G.turn; G.flags.eclipseRet = G.turn;
    Game.log(`閉じたはずの裂け目が、ふたたび開いた。蝕の再来（${e.cycle}度目）――前よりも、大きく。`, 'big');
  }
  function nearFacs(rid) {
    const s = new Set();
    G.planets.forEach(p => { if (Game.isMajor(p.owner) && Game.hops(rid, p.id) <= 3) s.add(p.owner); });
    return [...s];
  }

  // 群れ：大侵攻・再来では何倍にもなる
  // ---------- 群れの強さ ----------
  //  銀河でいちばん強い国の艦隊（P）を目安に、群れ1つの強さを決める
  //  先触れ：3か月ごとに P の 12%（裂け目1つ）→ 近くの国には重いが、銀河全体には軽い
  //  大侵攻：2か月ごとに 裂け目ごと P の 9%（3つで月あたり約 14%）→ 強国も本気で戦わねばならない
  //  再来：回を重ねるほど、裂け目も群れも増える
  function topPower() {
    let P = 0;
    G.facs.forEach(f => { if (f.alive) P = Math.max(P, G.fleets.filter(x => x.fac === f.id).reduce((a, x) => a + Game.fleetPower(x), 0)); });
    return Math.max(1500, P);
  }
  // 銀河の国々を合わせた艦隊の力（蝕の群れ全体の上限に使う）
  function allPower() { let S = 0; G.facs.forEach(f => { if (f.alive) S += G.fleets.filter(x => x.fac === f.id).reduce((a, x) => a + Game.fleetPower(x), 0); }); return Math.max(2000, S); }
  function capShare() { const e = E(); return e.phase === 'first' ? 0.25 : e.phase === 'great' ? 0.55 : 0.45 + 0.1 * e.cycle; }
  function share() { const e = E(); return e.phase === 'first' ? 0.12 : e.phase === 'great' ? 0.09 : 0.07 + 0.02 * e.cycle; }
  const ship = k => ({ ecl: k, hp: ECLIPSE_SHIPS[k].hp, xp: 0, m: 1 });
  // 群れの艦の数はそのままに、一体ごとの強さ m を合わせて、狙った強さにする
  function scaleTo(fl, target) {
    const p0 = Game.fleetPower(fl) || 1;
    const m = clamp(target / p0, 0.6, 40);
    fl.ships.forEach(s => { s.m = m; s.hp = ECLIPSE_SHIPS[s.ecl].hp * m; });
  }
  function mkFleet(at, guard, form) { return { id: G.nextId++, fac: 'E', cmd: null, sub: null, at, dest: null, from: at, ships: [], form, moved: false, guard }; }
  function spawn(r, first) {
    const e = E();
    // 群れ全体が、国々の力に対して大きくなりすぎたら、しばらく送り出さない
    const roaming = G.fleets.filter(f => f.fac === 'E' && !f.guard).reduce((a, f) => a + Game.fleetPower(f), 0);
    if (!first && roaming > allPower() * capShare()) return;
    e.wave++;
    const fl = mkFleet(r.id, false, 'spindle');
    const big = e.phase !== 'first';
    for (let i = 0; i < (big ? 12 : 7); i++) fl.ships.push(ship('spore'));
    for (let i = 0; i < (big ? 4 : 2); i++) fl.ships.push(ship('maw'));
    if (big && Math.random() < 0.5 + 0.15 * e.cycle) fl.ships.push(ship('crown'));
    scaleTo(fl, topPower() * share() * (first ? 1.2 : 1));
    G.fleets.push(fl);
  }
  // 裂け目の守り：核のまわりに群れが居座る（減ると毎月補う）
  function garrison(r) {
    const e = E(), cap = topPower() * (e.phase === 'first' ? 0.12 : 0.15 + 0.03 * e.cycle);
    if ((G.turn - (r.openedAt || 0)) % 3 !== 0 && G.turn !== r.openedAt) return;   // 守りは3か月ごとに補う
    const here = G.fleets.filter(f => f.fac === 'E' && f.at === r.id && f.guard).reduce((a, f) => a + Game.fleetPower(f), 0);
    if (here >= cap * 0.9) return;
    const fl = mkFleet(r.id, true, 'circle');
    for (let i = 0; i < 6; i++) fl.ships.push(ship(i % 3 === 2 ? 'maw' : 'spore'));
    if (e.phase !== 'first') fl.ships.push(ship('crown'));
    scaleTo(fl, Math.min(cap - here, cap * 0.5));
    G.fleets.push(fl);
  }
  // 深淵の守り：最後の砦
  function guard() {
    // 深淵の守りは、封印の理論を修めた国々の力に合わせる（いちばん強い国でなくても、届くように）
    const sp = Math.max(0, ...G.facs.filter(f => f.alive && f.sealed).map(f => G.fleets.filter(x => x.fac === f.id).reduce((a, x) => a + Game.fleetPower(x), 0)));
    const e = E(), cap = (sp ? Math.max(1500, sp) : topPower()) * 0.55;
    const here = G.fleets.filter(f => f.fac === 'E' && f.at === e.abyss).reduce((a, f) => a + Game.fleetPower(f), 0);
    if (here >= cap * 0.9) return;
    const fl = mkFleet(e.abyss, true, 'circle');
    for (let i = 0; i < 6; i++) fl.ships.push(ship('maw'));
    for (let i = 0; i < 4; i++) fl.ships.push(ship('spore'));
    fl.ships.push(ship('crown'), ship('crown'));
    scaleTo(fl, Math.min(cap - here, cap * 0.4));
    G.fleets.push(fl);
  }

  // ---------- 裂け目の核を砕いた ----------
  function onRiftTaken(by, pid) {
    const e = E();
    const p = G.planets[pid];
    // 深淵：蝕の根を断った
    if (p && p.abyss) { solve(by); return; }
    const r = e.rifts.find(x => x.id === pid);
    if (r) r.open = false;
    if (p) { p.closed = true; p.def = 0; }
    if (Game.isMajor(by)) {
      G.facs[by].ekeys = (G.facs[by].ekeys || 0) + 1;
      Object.keys(G.officers).forEach(k => { if (G.officers[k].fac === by && G.officers[k].role && G.officers[k].role.startsWith('cmd:')) Game.addMerit(k, 6); });
      G.flags.keyGot = G.turn;
      if (by === G.player) G.flags.myKey = G.turn;
    }
    Game.log(`${Game.ownerName(by)}が${p ? p.name : '裂け目'}の核を砕き、裂け目を閉じた。（核の欠片を手に入れた）`, 'big');
    if (!openRifts().length) recede(by);
    else Game.buildLanes();
  }
  // すべての裂け目が閉じた：蝕は退く。だが、根は残っている
  function recede(by) {
    const e = E();
    const wasFirst = e.phase === 'first';
    G.planets.forEach(p => { if (p.owner === 'E' && !p.abyss) { p.owner = null; p.stab = 40; p.def = 1; } });
    G.fleets = G.fleets.filter(f => f.fac !== 'E' || f.guard);
    Game.buildLanes();
    if (wasFirst) {
      // 先触れを退けても、大侵攻は来る
      e.phase = 'lull'; G.flags.eclipseLull = G.turn;
      Game.log('蝕の群れが消えた。人々は歓声を上げた――だが観測所は、裂け目の向こうで「もっと大きな何か」が動くのを見ていた。', 'warn');
      return;
    }
    e.phase = 'receded'; e.recededAt = G.turn;
    const forb = G.facs.reduce((a, f) => a + (f.forb ? f.forb.length : 0), 0);
    e.returnAt = G.turn + 40 + R.i(0, 14) - Math.min(12, forb * 3);
    G.flags.eclipseRecede = G.turn; G.flags['recede' + e.cycle] = G.turn;
    Game.log(`最後の裂け目が閉じ、蝕は退いた。……だが、これで終わりではない。根を断たねば、蝕はまた来る。`, 'big');
  }
  // 封印の理論を修めた国：深淵への道が開く
  function sealDone(fid) {
    const e = E();
    G.facs[fid].sealed = true;
    if (e.abyss === undefined || e.abyss === null) {
      const id = G.planets.length;
      G.planets.push({ id, name: '深淵', sys: 2, x: 500, y: 1020, type: 'rift', abyss: true, desc: '蝕の源。銀河の底に口を開けた、すべての裂け目の根。', owner: 'E', pop: 0, maxPop: 0, ind: 0, res: 0, def: 16, yard: 0, stab: 0, focus: 'def', prog: 0, gov: null, build: [], dock: [], cap: false, seed: 999 });
      e.abyss = id;
      Game.buildLanes();
      guard(); guard(); guard();
    }
    G.flags.abyss = G.turn;
    Game.log(`${FACTIONS[fid].name}が「封印の理論」を修め、蝕の源――「深淵」の場所を突き止めた。`, 'big');
  }
  // 根絶
  function solve(by) {
    const e = E();
    e.phase = 'solved'; e.defeated = true; e.defeatedAt = G.turn; e.defeatedBy = by;
    e.rifts.forEach(r => { r.open = false; const p = G.planets[r.id]; if (p) { p.closed = true; p.def = 0; if (p.owner === 'E') p.owner = null; } });
    G.planets.forEach(p => { if (p.owner === 'E') { p.owner = null; p.stab = 40; p.def = 1; } });
    G.fleets = G.fleets.filter(f => f.fac !== 'E');
    Game.buildLanes();
    G.flags.eclipseDown = G.turn;
    Game.log(`${Game.ownerName(by)}が深淵の核を砕いた。すべての裂け目が、二度と開かぬように閉じていく――蝕は、根から絶たれた。`, 'big');
    if (Game.isMajor(by)) Object.keys(G.officers).forEach(k => { if (G.officers[k].fac === by && G.officers[k].role && G.officers[k].role.startsWith('cmd:')) Game.addMerit(k, 15); });
  }
  // 道：開いている裂け目と深淵をつなぐ（Game.buildLanes から呼ばれる）
  function lanes(add) {
    const e = G.eclipse; if (!e || !e.rifts) return;
    for (const r of e.rifts) if (r.open && G.planets[r.id]) RIFT_SITES[r.site].links.forEach(b => add(r.id, b));
    if (e.abyss !== undefined && e.abyss !== null && G.planets[e.abyss] && e.phase !== 'solved') {
      const A = G.planets[e.abyss];
      G.planets.filter(p => p.id < 40).sort((a, b) => Math.hypot(a.x - A.x, a.y - A.y) - Math.hypot(b.x - A.x, b.y - A.y)).slice(0, 3).forEach(p => add(A.id, p.id));
    }
  }
  // 封印の理論を修めた国だけが深淵に入れる
  const canEnterAbyss = fid => Game.isMajor(fid) && !!G.facs[fid].sealed;
  // 画面に出す一言
  function status() {
    const e = E();
    if (!e.arrived) return e.omen ? '異変あり' : '';
    if (e.phase === 'solved') return '';
    if (e.phase === 'receded') return '蝕・退潮';
    if (e.phase === 'lull') return '蝕・小康';
    return `蝕・${PHASE_NAME[e.phase]}${e.cycle > 1 ? e.cycle : ''}`;
  }
  // 誰かが銀河を一つにしかけた：蝕が早まる（統一も和平も、蝕を断たないかぎり終わらない）
  function hasten() { early('unite', 14, '銀河が一つにまとまろうとしたその時、観測所という観測所が、同じ方角に「影」を捉えた。'); }
  // 先触れを早める：理由ごとに一度だけ。早まるだけで、遅くはならない（正体には触れない文で知らせる）
  function early(why, months, text) {
    const e = E(); e.early = e.early || {};
    if (e.arrived || e.early[why]) return false;
    e.early[why] = G.turn;
    if (why === 'unite') e.hastened = true;
    const before = e.eta;
    // 出来事ひとつで、先触れが months か月早まる（ただし、どんなに早まっても6年目より前・知らせから1年より前には来ない）
    e.eta = why === 'unite' ? Math.min(e.eta, G.turn + months) : Math.max(72, G.turn + 12, e.eta - months);
    G.flags['early_' + why] = G.turn;
    Game.log(text, 'warn');
    return e.eta < before;
  }
  // 早める出来事
  //  ・大国が二つ滅んだ（銀河に血が流れすぎた）
  //  ・どこかの国の技術が高みに達した（4系統の合計が24段、またはどれかが8段）
  //  ・古代遺跡の研究が深まった（研究8段の遺跡の星が2つ・54か月目以降）
  //  どんなに早まっても、先触れは72か月目（6年目）より前には来ない
  //  ・禁忌の技術が銀河で4つ修められた（一つごとの前倒しとは別に）
  //  ひとつにつき12か月早まる（銀河の統一だけは、14か月以内に来る）
  function triggers() {
    const e = E();
    if (G.turn < 24) return;
    const dead = G.facs.filter(f => !f.alive).length;
    if (dead >= 2) early('fall', 12, '二つ目の国が滅んだ夜、辺境の観測所が、銀河の外から届く奇妙な重力の揺らぎを捉えた。まるで、流れた血の匂いを嗅ぎつけたかのように。');
    const hi = G.facs.find(f => f.alive && (['wep', 'eng', 'def', 'eco'].reduce((a, k) => a + f.tech[k], 0) >= 24 || ['wep', 'eng', 'def', 'eco'].some(k => f.tech[k] >= 8)));
    if (hi) early('tech', 12, `${FACTIONS[hi.id].name}の新しい観測網が、これまで誰にも見えなかった「銀河の外の何か」を捉えた。高みに達した技術は、見てはならないものまで見てしまったのかもしれない。`);
    const ruins = G.planets.filter(p => p.type === 'ruin' && Game.isMajor(p.owner) && p.res >= 8), ruin = G.turn >= 54 && ruins.length >= 2 && ruins[0];
    if (ruin) early('ruin', 12, `${ruin.name}の古代遺跡を調べていた学者たちが、演算塔の奥で「警告」とおぼしき記録を見つけた。そして、塔はその夜から止まらなくなった。`);
    const forb = G.facs.reduce((a, f) => a + (f.forb ? f.forb.length : 0), 0);
    if (forb >= 4) early('forb', 12, '禁じられた技術がまた一つ目を覚ました。観測所の計器が、一斉に同じ方角を指して震えている。');
  }
  const mainRift = () => { const r = openRifts()[0] || E().rifts[0]; return r ? r.id : 0; };
  // 禁忌：先触れを早めるだけ（遅らせない）
  const forbHit = () => { const e = E(); if (!e.arrived) { if (e.eta - G.turn > 14) e.eta = Math.max(Math.min(e.eta, 104), G.turn + 14, e.eta - 4); } else if (e.phase === 'receded') e.returnAt = Math.max(G.turn + 12, e.returnAt - 4); };

  return { turn, arrive, hasten, early, spawn, onRiftTaken, sealDone, lanes, canEnterAbyss, keysOf, canSeal, active, openRifts, status, mainRift, forbHit, norm, SEAL, KEYS_NEEDED, PHASE_NAME, get RIFT_ID() { return mainRift(); } };
})();
