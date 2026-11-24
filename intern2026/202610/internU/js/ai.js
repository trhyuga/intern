// ============================================================
//  AI 勢力：研究・開発・造艦・人事・艦隊の動き
// ============================================================
const AI = (() => {
  // pol：参謀の方針で動かすときの指示（AI の国では使わない）
  //  { agg 攻めっ気, need 攻める時に求める戦力の倍率, focus 開発の好み, research 研究の重み, build 造艦の多さ,
  //    onlyE 蝕だけを攻める, noMajors 大国を攻めない, mistake しくじる確率, noForb 禁忌に手を出さない }
  function turn(fid, pol = {}) {
    const f = G.facs[fid], F = FACTIONS[fid];
    if (!f.alive) return;
    const slip = () => pol.mistake && Math.random() < pol.mistake;
    Designer.autoDesign(fid);
    if (!slip()) research(fid, pol);
    if (!slip()) planets(fid, pol);
    officers(fid);
    if (!slip()) build(fid, pol);
    fleets(fid);
    if (!slip()) military(fid, pol);
  }

  function research(fid, pol = {}) {
    const f = G.facs[fid], F = FACTIONS[fid];
    if (FORBIDDEN[f.researching]) return;
    // 核の欠片がそろったら、蝕の根を断つ研究を急ぐ
    if (f.researching === 'seal' && !f.sealed) return;
    if (Eclipse.canSeal(fid) && Math.random() < 0.3 + 0.4 * [0.75, 0.6, 0.4, 1.0, 0.55, 0.85][fid]) { f.researching = 'seal'; return; }
    // 禁忌に手を出すか
    if (!pol.noForb) for (const k of Object.keys(FORBIDDEN)) {
      if (Game.forbAvailable(f, k) && Math.random() < (F.agg > 0.6 || f.ruling === 'tech' ? 0.04 : 0.01)) { f.researching = k; return; }
    }
    const w = { wep: 1, eng: 0.85, def: 0.95, eco: 1.1 };
    if (f.ruling === 'war') w.wep *= 1.3; if (f.ruling === 'trade') w.eco *= 1.3; if (f.ruling === 'tech') w.eng *= 1.2;
    if (pol.research) for (const k in pol.research) w[k] *= pol.research[k];
    let best = 'wep', bs = -1e9;
    for (const k of ['wep', 'eng', 'def', 'eco']) { if (f.tech[k] >= 8) continue; const s = w[k] * 10 - f.tech[k] * 6 + Math.random() * 3; if (s > bs) { bs = s; best = k; } }
    f.researching = best;
  }

  function threatened(pid, fid) {
    return Game.ADJ[pid].some(n => { const o = G.planets[n].owner; return o !== fid && !Game.friendly(fid, o) && (o === 'E' || (Game.isMajor(o) && Game.rel(fid, o).s === 'war')); });
  }
  function border(pid, fid) { return Game.ADJ[pid].some(n => G.planets[n].owner !== fid); }

  function planets(fid, pol = {}) {
    for (const p of G.planets) {
      if (p.owner !== fid) continue;
      let focus = 'ind';
      if (p.stab < (pol.focus === 'pop' ? 55 : 35)) focus = 'pop';
      else if (threatened(p.id, fid) && p.def < Game.devCap(p, 'def') - 2) focus = 'def';
      else if (pol.focus === 'def' && border(p.id, fid) && p.def < Game.devCap(p, 'def')) focus = 'def';
      else if (pol.focus === 'res' && p.res < Game.devCap(p, 'res') && (p.ind >= 3 || p.type !== 'barren')) focus = 'res';
      else if (!p.yard && p.pop >= 30 && G.planets.filter(x => x.owner === fid && x.yard).length < 3) focus = 'yard';
      else if (p.type === 'ice' || p.type === 'ruin') focus = p.res < Game.devCap(p, 'res') ? 'res' : 'ind';
      else if (p.ind >= Game.devCap(p, 'ind')) focus = p.res < Game.devCap(p, 'res') ? 'res' : 'def';
      if (focus !== p.focus) { p.focus = focus; p.prog = Math.min(p.prog, 50); }
    }
  }

  function officers(fid) {
    const f = G.facs[fid];
    // 在野の人材を登用
    for (const k in G.officers) {
      const o = G.officers[k];
      if (o.st === 'free' && o.loc !== null && G.planets[o.loc] && G.planets[o.loc].owner === fid && Math.random() < 0.25) {
        if (fid === G.player) { if (G.facs[fid].funds < 100) continue; G.facs[fid].funds -= 100; }
        const okR = Math.random() < recruitChance(k, fid);
        if (fid === G.player && api.hook) api.hook('recruit', k, okR);
        if (okR) { o.st = 'act'; o.fac = fid; o.loyal = 60 + Math.random() * 20; o.ever = o.ever ?? fid; Game.log(`${OFF[k].name}が${FACTIONS[fid].name}に仕官した。`, 'info', fid); }
      }
      if (o.st === 'cap' && o.capBy === fid && Math.random() < 0.15) {
        if (Math.random() < recruitChance(k, fid) * 0.6) { o.st = 'act'; o.fac = fid; o.loyal = 50; }
        else if (Math.random() < 0.2) { o.st = 'free'; o.fac = null; o.loc = R.pick(G.planets.filter(p => p.owner !== 'E')).id; }
      }
    }
    // 総督のいない星に置く
    const idle = Game.officersOf(fid).filter(k => !G.officers[k].role).sort((a, b) => OFF[b].pol - OFF[a].pol);
    for (const p of G.planets.filter(p => p.owner === fid && !p.gov).sort((a, b) => b.pop - a.pop)) {
      const k = idle.find(x => OFF[x].pol >= OFF[x].ldr - 5 || idle.length > 4);
      if (!k) break;
      Game.setGov(p.id, k); idle.splice(idle.indexOf(k), 1);
    }
  }
  function recruitChance(k, fid) {
    const S = OFF[k];
    const lead = OFF[G.facs[fid].leader] || { dip: 60 };
    let p = 0.35 + (lead.dip - 50) / 200;
    if (S.pers === '忠烈' && G.officers[k].ever !== null && G.officers[k].ever !== fid && Game.isMajor(G.officers[k].ever) && G.facs[G.officers[k].ever].alive) p -= 0.3;
    if (S.pers === '野心') p += 0.1;
    if (fid === G.player && typeof People !== 'undefined') p += People.recruitBonus(k).v;   // 縁のある人がいれば通りやすい
    return clamp(p, 0.05, 0.9);
  }

  function build(fid, pol = {}) {
    const f = G.facs[fid];
    const e = Game.economy(fid);
    const bm = pol.build || (f.ruling === 'war' ? 1.3 : 1) * (Diplo.aggOf(fid) > 0.8 ? 1.15 : 1);
    // 維持費が収入の 6 割を超えたら造らない（ただし資金が余っていれば造る）
    if (e.up > e.inc * (f.funds > 1200 ? 0.95 : 0.62) * bm) { invest(fid); return; }
    const yards = G.planets.filter(p => p.owner === fid && p.yard).sort((a, b) => (threatened(b.id, fid) ? 1 : 0) - (threatened(a.id, fid) ? 1 : 0) || b.yard - a.yard);
    for (const p of yards) {
      if (p.build.length >= p.yard) continue;
      if (f.funds < 160) break;
      const d = Designer.pickBuild(fid, p);
      if (d) Game.queueBuild(p.id, d.id);
    }
  }

  // 余った資金を星の開発に回す
  function invest(fid) {
    const f = G.facs[fid];
    const ps = G.planets.filter(p => p.owner === fid && p.focus !== 'pop').sort((a, b) => b.pop - a.pop);
    for (const p of ps) { if (f.funds < 700) break; Game.invest(p.id); }
  }
  function fleets(fid) {
    // 駐留艦を艦隊にまとめる
    const idle = () => Game.officersOf(fid).filter(k => !G.officers[k].role).sort((a, b) => (OFF[b].ldr + OFF[b].tac) - (OFF[a].ldr + OFF[a].tac));
    for (const p of G.planets.filter(p => p.owner === fid && p.dock.length)) {
      const keep = p.cap ? 2 : 0;
      if (p.dock.length - keep < 3) continue;
      let fl = G.fleets.find(x => x.fac === fid && x.at === p.id && x.cmd && x.ships.length < Game.fleetCap(x) && !x.dest);
      if (!fl) {
        const cmd = idle()[0];
        // 司令官が足りなければ、司令のいない分艦隊（12隻まで）でも出す。港に眠らせない
        if (!cmd && p.dock.length - keep < 4) continue;
        fl = Game.newFleet(fid, cmd || null, p.id);
        fl.form = ['spindle', 'crane', 'circle', 'line'][Math.floor(Math.random() * 4)];
      }
      while (p.dock.length > keep && fl.ships.length < Game.fleetCap(fl)) fl.ships.push(p.dock.pop());
    }
    // 司令官のいない艦隊に司令を
    for (const fl of G.fleets.filter(x => x.fac === fid && !x.cmd)) { const k = idle()[0]; if (k) Game.setCmd(fl, k); }
    // 副官
    for (const fl of G.fleets.filter(x => x.fac === fid && x.cmd && !x.sub && x.ships.length >= 12)) { const k = idle().find(x => OFF[x].tac >= 65); if (k) Game.setCmd(fl, k, 'sub'); }
    // 同じ星にいる小さな艦隊はまとめる
    const byP = new Map();
    for (const fl of G.fleets.filter(x => x.fac === fid && x.ships.length && (x.dest === null || x.dest === undefined))) { if (!byP.has(fl.at)) byP.set(fl.at, []); byP.get(fl.at).push(fl); }
    for (const list of byP.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => b.ships.length - a.ships.length);
      const main = list[0];
      for (const o of list.slice(1)) { if (main.ships.length + o.ships.length <= Game.fleetCap(main) && o.ships.length < 8) { main.ships.push(...o.ships); o.ships = []; } }
    }
    // 空の艦隊を解く
    G.fleets.filter(x => x.fac === fid && !x.ships.length).forEach(x => Game.removeFleet(x));
  }

  function military(fid, pol = {}) {
    const f = G.facs[fid], F = { agg: pol.agg ?? Diplo.aggOf(fid) };
    const my = G.fleets.filter(x => x.fac === fid && x.ships.length && (x.cmd || x.ships.length >= 4));
    const busy = new Set();
    // 1. 守り：脅かされている星へ
    for (const p of G.planets.filter(p => p.owner === fid)) {
      let threat = 0;
      for (const n of Game.ADJ[p.id]) for (const fl of G.fleets) if (fl.at === n && fl.fac !== fid && !Game.friendly(fid, fl.fac) && (fl.fac === 'E' || (Game.isMajor(fl.fac) && Game.rel(fid, fl.fac).s === 'war'))) threat += Game.fleetPower(fl);
      if (!threat) continue;
      const def = Game.planetDefense(p);
      if (def > threat * 1.1) continue;
      // 近い艦隊を呼ぶ
      const cand = my.filter(fl => !busy.has(fl) && fl.at !== p.id && Game.hops(fl.at, p.id) <= 2).sort((a, b) => Game.hops(a.at, p.id) - Game.hops(b.at, p.id));
      if (cand.length && (p.cap || p.pop > 30)) { const fl = cand[0]; const path = Game.path(fl.at, p.id, n => Game.friendly(fid, G.planets[n].owner)); if (path) { fl.dest = path[1]; busy.add(fl); } }
      else { const here = my.find(fl => fl.at === p.id); if (here) busy.add(here); }
    }
    // 1.5 蝕との戦い：近くに裂け目（封印の理論があれば深淵）があれば、隣の自国の星に艦隊を集め、そろったら一斉に攻める
    if (G.eclipse && G.eclipse.arrived && G.eclipse.phase !== 'solved') {
      const mine = G.planets.filter(p => p.owner === fid);
      const targets = G.planets.filter(p => p.owner === 'E' && p.type === 'rift' && (!p.abyss || G.facs[fid].sealed));
      let plan = null;
      // 蝕への熱意：国の気風（預言の聖教国・古の勅書の帝国・記録を継ぐ機巧院は熱心、企業連合は損得次第）と、主導する派閥で変わる
      const ZEAL = [0.75, 0.6, 0.4, 1.0, 0.55, 0.85];
      const zeal = clamp(ZEAL[fid] + (f.ruling === 'war' ? 0.2 : f.ruling === 'peace' ? 0.1 : f.ruling === 'trade' ? -0.15 : 0.05) + (G.flags.e0_oath && fid === 0 ? 0.15 : 0) + (G.eclipse.phase === 'ret' ? 0.15 : 0), 0.2, 1.2);
      const reach = zeal >= 0.8 ? 6 : zeal >= 0.55 ? 4 : 2;
      for (const t0 of targets) {
        // いちばん近い自国の星を集結地に。隣でなければ、間にある星（蝕の星・独立惑星）から攻め取る
        const stage = mine.slice().sort((a, b) => Game.hops(a.id, t0.id) - Game.hops(b.id, t0.id))[0];
        if (!stage) continue;
        const d = Game.hops(stage.id, t0.id);
        if (d > (t0.abyss ? reach + 2 : reach)) continue;
        let t = t0;
        if (d > 1) { const path = Game.path(stage.id, t0.id, () => true); if (!path || path.length < 2) continue; t = G.planets[path[1]]; if (Game.friendly(fid, t.owner) || !Game.canAttack(fid, t.owner)) continue; }
        const sc = (t0.abyss ? 50 : 0) - d * 3 - Game.hops(f.capital, t0.id);
        if (!plan || sc > plan.sc) plan = { t, stage, sc };
      }
      if (plan) {
        const { t, stage } = plan;
        const need = (Game.planetDefense(t) + G.fleets.filter(x => x.at === t.id && x.fac === 'E').reduce((a, x) => a + Game.fleetPower(x), 0)) * 1.15;
        const ready = my.filter(x => !busy.has(x) && x.at === stage.id && x.ships.length >= 3);
        const readyP = ready.reduce((a, x) => a + Game.fleetPower(x), 0);
        if (readyP >= need) { ready.forEach(x => { x.dest = t.id; busy.add(x); }); }
        else {
          // 集結：半分ほどの艦隊を集結地へ（自国の守りは残す）
          const free = my.filter(x => !busy.has(x) && x.at !== stage.id && x.ships.length >= 3).sort((a, b) => Game.hops(a.at, stage.id) - Game.hops(b.at, stage.id));
          free.slice(0, Math.max(1, Math.ceil(free.length * (0.3 + 0.55 * zeal)))).forEach(x => { const path = Game.path(x.at, stage.id, n => Game.friendly(fid, G.planets[n].owner)); if (path && path.length > 1) { x.dest = path[1]; busy.add(x); } });
          ready.forEach(x => busy.add(x));
        }
      }
    }
    // 2. 攻め：勝てそうな隣の星へ
    const D = api.dbg && fid !== 'E' ? api.dbg : null;
    for (const fl of my) {
      if (D) D.fleets = (D.fleets || 0) + 1;
      if (busy.has(fl)) { if (D) D.busy = (D.busy || 0) + 1; continue; }
      const hp = fl.ships.reduce((a, s) => a + s.hp / Game.shipMaxHp(s), 0) / fl.ships.length;
      if (hp < 0.55) { if (D) D.repair = (D.repair || 0) + 1; // 傷ついたら造船所へ
        const yard = G.planets.filter(p => p.owner === fid && p.yard).sort((a, b) => Game.hops(fl.at, a.id) - Game.hops(fl.at, b.id))[0];
        if (yard && yard.id !== fl.at) { const path = Game.path(fl.at, yard.id, n => Game.friendly(fid, G.planets[n].owner)); if (path) fl.dest = path[1]; }
        continue;
      }
      if (fl.ships.length < 3) continue;
      const mates = my.filter(x => x !== fl && x.at === fl.at && !busy.has(x) && x.ships.length >= 3);
      const myP = Game.fleetPower(fl) + mates.reduce((a, x) => a + Game.fleetPower(x), 0) * 0.9;
      let best = null, bs = -1e9;
      for (const n of Game.ADJ[fl.at]) {
        const p = G.planets[n];
        if (Game.friendly(fid, p.owner) || !Game.canAttack(fid, p.owner)) continue;
        if (p.owner === null && G.turn < 3) continue;
        // 小勢力（頼まれごとの相手）は、しばらく攻めない
        if (typeof p.owner === 'string' && p.owner !== 'E' && (G.turn < 36 || F.agg < 0.55 || Math.random() < 0.7)) continue;
        const def = Game.planetDefense(p) + G.fleets.filter(x => x.at === n && Game.friendly(x.fac, p.owner)).reduce((a, x) => a + Game.fleetPower(x), 0);   // そこにいる艦隊も数える
        if (pol.onlyE && p.owner !== 'E') continue;
        if (D && Game.isMajor(p.owner)) D.adjMajor = (D.adjMajor || 0) + 1;
        if (Game.isMajor(p.owner) && Game.warGain(fid, p.owner) >= Game.warGoal(fid)) { if (D) D.goal = (D.goal || 0) + 1; continue; }
        if (pol.noMajors && Game.isMajor(p.owner)) continue;
        if (pol.noIndep && p.owner === null) continue;
        const need = def * (pol.need || (0.95 + (1 - F.agg) * 0.3)) * (G.turn < 14 && Game.isMajor(p.owner) ? 1.5 : 1) * (p.cap && Game.isMajor(p.owner) ? 1.5 : 1);   // 首都は落としにくい
        // 足りなくても、ときに攻勢をかける（押し返されることも多い）
        const probe = myP < need && myP >= need * 0.5 && (Game.isMajor(p.owner) || p.owner === null) && Math.random() < 0.3 + F.agg * 0.3;
        if (D && Game.isMajor(p.owner)) { if (myP >= need) D.strong = (D.strong || 0) + 1; else if (probe) D.probe = (D.probe || 0) + 1; else D.weak = (D.weak || 0) + 1; }
        if (myP < need && !probe) continue;
        let sc = (p.prev === fid ? 80 : 0) + p.pop * 1.2 + (p.cap ? 40 : 0) - def * 0.3 + (p.owner === null ? 15 : 0) + (p.owner === 'E' ? 25 : 0) + (p.type === 'rift' ? 200 : 0);
        if (Game.isMajor(p.owner) && p.owner === G.player) sc += 5;
        if (sc > bs) { bs = sc; best = p; }
      }
      // 自分の星を空けすぎない
      const home = G.planets[fl.at];
      if (best && home.owner === fid && threatened(home.id, fid) && my.filter(x => x.at === home.id).length <= 1 && !home.cap && Game.planetDefense(home) - myP < 40) { if (Math.random() < 0.6) best = null; }
      if (best && Math.random() < 0.75 + F.agg * 0.25) {
        if (D) D.attack = (D.attack || 0) + 1;
        fl.dest = best.id; busy.add(fl);
        // 一緒にいる艦隊も続く（守りに一つ残す）
        const keepOne = home.owner === fid && threatened(home.id, fid);
        mates.slice(keepOne ? 1 : 0).forEach(x => { x.dest = best.id; busy.add(x); });
        continue;
      }
      // 3. 戦争中なのに隣に敵の星がなければ、敵の国へ向かう道を切り開く（間の独立惑星を取り、前へ進む）
      if (!best && !pol.onlyE && !pol.noMajors) {
        const foes = G.facs.filter(x => x.alive && x.id !== fid && Game.rel(fid, x.id).s === 'war' && Game.warGain(fid, x.id) < Game.warGoal(fid)).map(x => x.id);
        if (foes.length && Math.random() < 0.5 + F.agg * 0.4) {
          const tgt = G.planets.filter(p => foes.includes(p.owner)).sort((a, b) => Game.hops(fl.at, a.id) - Game.hops(fl.at, b.id))[0];
          if (tgt) {
            const path = Game.path(fl.at, tgt.id, () => true);
            if (path && path.length > 1) {
              const nx = G.planets[path[1]];
              if (Game.friendly(fid, nx.owner)) { fl.dest = nx.id; busy.add(fl); continue; }
              if (Game.canAttack(fid, nx.owner) && !(Game.isMajor(nx.owner) && Game.warGain(fid, nx.owner) >= Game.warGoal(fid))) {
                const d2 = Game.planetDefense(nx) + G.fleets.filter(x => x.at === nx.id && Game.friendly(x.fac, nx.owner)).reduce((a, x) => a + Game.fleetPower(x), 0);
                if (myP >= d2 * 0.95) { fl.dest = nx.id; busy.add(fl); mates.slice(1).forEach(x => { x.dest = nx.id; busy.add(x); }); continue; }
              }
            }
          }
        }
      }
      // 4. 前線へ寄せる
      if (!best && Math.random() < 0.5) {
        const front = G.planets.filter(p => p.owner === fid && Game.ADJ[p.id].some(n => { const o = G.planets[n].owner; return !Game.friendly(fid, o) && Game.canAttack(fid, o); }));
        if (front.length && !front.some(p => p.id === fl.at)) {
          const t = front.sort((a, b) => Game.hops(fl.at, a.id) - Game.hops(fl.at, b.id))[0];
          const path = Game.path(fl.at, t.id, n => Game.friendly(fid, G.planets[n].owner));
          if (path && path.length > 1) fl.dest = path[1];
        }
      }
    }
  }

  const api = { turn, recruitChance, hook: null, dbg: null };
  return api;
})();
