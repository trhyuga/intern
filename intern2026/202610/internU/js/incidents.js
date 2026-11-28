// ============================================================
//  小さな出来事（インシデント）
//  静かな月にも何かが起きるよう、数か月に一度、自国の星に出来事を起こす。
//  悪い出来事は、参謀の得意（S〜D）と総督の政治で小さく抑えられることがある。
// ============================================================
const Incidents = (() => {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  // 悪い出来事を抑えられたか
  function softened(p) {
    let c = 0;
    if (p.gov) c += (OFF[p.gov].pol - 40) / 120;
    if (Staff.active()) c += 0.2 + 0.4 * G.staff.score / 100;
    return Math.random() < clamp(c, 0, 0.8);
  }
  const helper = p => Staff.active() ? `参謀${shortName(OFF[G.staff.key])}` : p.gov ? `総督${shortName(OFF[p.gov])}` : '現地の者たち';

  const LIST = [
    { w: 3, good: true, cond: p => ['barren', 'desert', 'gas'].includes(p.type),
      run: p => { const v = rnd(110, 230); G.facs[G.player].funds += v; return `${p.name}で新しい鉱脈が見つかった。資金 +${v}`; } },
    { w: 3, good: true, cond: p => p.res >= 2 || ['ice', 'ruin'].includes(p.type),
      run: p => { const v = rnd(80, 180); G.facs[G.player].rp += v; return `${p.name}の研究所が新しい理論を発表した。研究 +${v}`; } },
    { w: 2, good: true, cond: p => p.pop >= 30,
      run: p => { const v = Math.round(Game.planetIncome(p) * 1.5) + 40; G.facs[G.player].funds += v; return `${p.name}が好景気に沸いている。資金 +${v}`; } },
    { w: 2, good: true, cond: p => p.pop < p.maxPop - 4,
      run: p => { const v = rnd(3, 7); p.pop = Math.min(p.maxPop, p.pop + v); p.stab = clamp(p.stab + 3, 0, 100); return `${p.name}に移民船団が到着した。人口 +${v}億`; } },
    { w: 2, good: true, cond: p => Object.values(G.officers).some(o => o.st === 'hidden' || o.st === 'free'),
      run: p => {
        const ks = Object.keys(G.officers).filter(k => G.officers[k].st === 'hidden' || (G.officers[k].st === 'free' && G.planets[G.officers[k].loc] && G.planets[G.officers[k].loc].owner !== G.player));
        if (!ks.length) return null;
        const k = pick(ks); const o = G.officers[k]; o.st = 'free'; o.loc = p.id;
        return `${OFF[k].name}（${OFF[k].epi}）が${p.name}に流れ着いた。人事から登用できる`;
      } },
    { w: 2, good: true, cond: p => p.type === 'ruin' || p.type === 'ice',
      run: p => { const v = rnd(150, 260); G.facs[G.player].rp += v; return `${p.name}の地下から古代の遺構が掘り出された。研究 +${v}`; } },
    { w: 2, good: true, cond: p => ['terra', 'ocean'].includes(p.type),
      run: p => { p.stab = clamp(p.stab + 7, 0, 100); G.facs[G.player].funds += 60; return `${p.name}は豊作に恵まれた。民心 +7・資金 +60`; } },
    { w: 1, good: true, cond: p => p.cap,
      run: p => { G.planets.forEach(x => { if (x.owner === G.player) x.stab = clamp(x.stab + 4, 0, 100); }); return `${p.name}で建国の祝祭が開かれ、国中が賑わった。すべての星の民心 +4`; } },
    { w: 2, good: false, cond: p => p.pop >= 15,
      run: p => { const s = softened(p); const v = s ? rnd(1, 2) : rnd(3, 6); p.pop = Math.max(5, p.pop - v); p.stab = clamp(p.stab - (s ? 2 : 6), 0, 100); return `${p.name}で疫病が流行した。人口 −${v}億${s ? `（${helper(p)}の手配で被害は小さく済んだ）` : '・民心 −6'}`; } },
    { w: 2, good: false, cond: p => true, run: p => pirates(p) },
    { w: 1, good: false, cond: p => p.yard > 0,
      run: p => { const s = softened(p); p.prog = Math.max(0, p.prog - (s ? 10 : 35)); return `${p.name}の造船所で事故が起きた。開発が遅れた${s ? `（${helper(p)}がすぐに立て直した）` : ''}`; } },
    { w: 1, good: false, cond: p => Game.officersOf(G.player).length >= 4,
      run: p => {
        const mine = Game.officersOf(G.player).filter(k => !Game.isLeader(k));
        const tie = OFFICER_TIES.find(t => t[2] === 'rival' && isMine(t[0]) && isMine(t[1]));
        const [a, b] = tie ? [tie[0], tie[1]] : [pick(mine), pick(mine)];
        if (!a || !b || a === b) return null;
        const s = softened(p);
        if (!s) { FX.loyal(a, -5); FX.loyal(b, -5); }
        return `${OFF[a].name}と${OFF[b].name}が軍議の席で激しく言い争った。${s ? `${helper(p)}がとりなした` : '二人の忠誠 −5'}`;
      } },
  ];

  // 宙賊の襲撃（小さな艦隊戦。自動で解決する）
  function pirateDesigns() {
    if (!G.pirateD) G.pirateD = [Game.newDesign(null, '宙賊の快速艇', 'dd', ['las', 'thr']), Game.newDesign(null, '宙賊の武装商船', 'cl', ['las', 'msl', 'arm'])];
    return G.pirateD;
  }
  function pirates(p) {
    const ds = pirateDesigns();
    const n = 2 + Math.floor(G.turn / 18) + rnd(0, 2);
    const fl = { id: -1, fac: null, cmd: null, sub: null, at: p.id, dest: null, from: p.id, ships: [], form: 'spindle' };
    for (let i = 0; i < n; i++) fl.ships.push(Game.newShip(ds[i % 3 === 2 ? 1 : 0]));
    const defF = G.fleets.filter(x => x.at === p.id && x.ships.length && Game.friendly(x.fac, p.owner));
    if (!defF.length && !p.def && !p.dock.length) {
      const v = Math.min(G.facs[G.player].funds, rnd(80, 180)); G.facs[G.player].funds -= v; p.stab = clamp(p.stab - 5, 0, 100);
      return `宙賊が守りの無い${p.name}を荒らした。資金 −${v}・民心 −5`;
    }
    const res = Battle.simulate({ pid: p.id, att: { fac: null, fleets: [fl] }, def: { fac: p.owner, fleets: defF, dock: true } });
    defF.filter(x => !x.ships.length).forEach(x => Game.removeFleet(x));
    if (res.winner === 'D') return `宙賊の船団（${n}隻）が${p.name}を襲ったが、撃退した。撃沈 ${res.lostA}隻・喪失 ${res.lostD}隻`;
    const v = Math.min(G.facs[G.player].funds, rnd(120, 240)); G.facs[G.player].funds -= v; p.stab = clamp(p.stab - 6, 0, 100);
    return `宙賊の船団（${n}隻）に${p.name}の守りを破られた。資金 −${v}・民心 −6`;
  }

  // 毎月の判定：前の出来事から2か月以上たっていれば、4割ほどで起きる
  function roll() {
    if (!G || G.over || G.turn - (G.lastInc || 0) < 2 || Math.random() > 0.4) return null;
    const mine = G.planets.filter(p => p.owner === G.player && p.type !== 'rift');
    if (!mine.length) return null;
    const p = pick(mine);
    const cands = LIST.filter(x => x.cond(p));
    let tot = cands.reduce((a, x) => a + x.w, 0), r = Math.random() * tot, inc = cands[0];
    for (const x of cands) { r -= x.w; if (r <= 0) { inc = x; break; } }
    const text = inc.run(p);
    if (!text) return null;
    G.lastInc = G.turn;
    Game.log('【出来事】' + text, inc.good ? 'good' : 'bad', G.player);
    return text;
  }
  return { roll };
})();
