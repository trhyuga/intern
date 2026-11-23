// ============================================================
//  月（ターン）を進める：AI の手番 → 艦隊の移動 → 艦隊戦 → 経済 → 外交 → 出来事
// ============================================================
const Turn = (() => {
  let running = false;

  // プレイヤーの艦隊の行き先（route）から、次に進む星を決める
  function planRoute(fl) {
    if (fl.route === null || fl.route === undefined) return;
    if (fl.route === fl.at) { fl.route = null; return; }
    const path = Game.path(fl.at, fl.route, n => Game.friendly(fl.fac, G.planets[n].owner));
    if (!path || !Game.canEnter(fl.fac, fl.route)) { fl.route = null; Game.log(`${Game.fleetName(fl)}は${G.planets[fl.at].name}で進めなくなった。`, 'warn', fl.fac); return; }
    fl.dest = path[1];
  }

  function moveAll() {
    for (const fl of G.fleets) {
      if (fl.dest === null || fl.dest === undefined) continue;
      if (!fl.ships.length) { fl.dest = null; continue; }
      const to = fl.dest;
      fl.dest = null;
      if (!Game.ADJ[fl.at].includes(to) || !Game.canEnter(fl.fac, to)) continue;
      fl.from = fl.at; fl.at = to;
      // 機関が進んでいれば、自軍の星を通ってもう一歩
      const f = Game.facOf(fl.fac);
      if (fl.fac === G.player && fl.route !== null && fl.route !== undefined && fl.route !== fl.at && f && f.tech.eng >= 4 && Game.friendly(fl.fac, G.planets[fl.at].owner) && !hostileHere(fl)) {
        const path = Game.path(fl.at, fl.route, n => Game.friendly(fl.fac, G.planets[n].owner));
        if (path && path.length > 1 && Game.canEnter(fl.fac, path[1])) { fl.from = fl.at; fl.at = path[1]; }
      }
      if (fl.route === fl.at) fl.route = null;
    }
  }
  function hostileHere(fl) { return G.fleets.some(o => o !== fl && o.at === fl.at && o.ships.length && !Game.friendly(o.fac, fl.fac) && (o.fac === 'E' || Game.canAttack(o.fac, fl.fac))); }

  function retreat(fl, from) {
    const back = [fl.from, ...Game.ADJ[from]].find(n => n !== from && n !== undefined && Game.friendly(fl.fac, G.planets[n].owner));
    if (back !== undefined) { fl.at = back; fl.route = null; return true; }
    return false;
  }

  async function battles(report) {
    for (const p of G.planets) {
      let guard = 0;
      while (guard++ < 4) {
        const here = G.fleets.filter(fl => fl.at === p.id && fl.ships.length);
        const att = here.filter(fl => !Game.friendly(fl.fac, p.owner) && Game.canAttack(fl.fac, p.owner));
        if (!att.length) break;
        const facs = [...new Set(att.map(f => f.fac))].sort((a, b) => att.filter(f => f.fac === b).reduce((s, f) => s + Game.fleetPower(f), 0) - att.filter(f => f.fac === a).reduce((s, f) => s + Game.fleetPower(f), 0));
        const af = facs[0];
        const attF = att.filter(f => f.fac === af);
        const defF = here.filter(fl => Game.friendly(fl.fac, p.owner) && fl.fac !== af);
        const oldOwner = p.owner;
        if (!defF.length && !p.def && !p.dock.length) {
          Game.capture(p.id, af);
          report.push({ kind: af === G.player ? 'good' : oldOwner === G.player ? 'bad' : 'info', text: `${Game.ownerName(af)}が${p.name}を無血で制圧した。`, fac: af });
          continue;
        }
        const setup = { pid: p.id, att: { fac: af, fleets: attF }, def: { fac: p.owner, fleets: defF, dock: true } };
        const mine = attF.some(f => f.fac === G.player) ? 'A' : (defF.some(f => f.fac === G.player) || p.owner === G.player) ? 'D' : null;
        let res;
        const shipsIn = [...attF, ...defF].reduce((a, f) => a + f.ships.length, 0) + p.dock.length;
        const watchMode = Staff.active() ? (G.staff.watch || (G.staff.bigManual ? 'bigcmd' : 'watch')) : null;
        if (mine && watchMode === 'none') res = Battle.simulate(setup);
        else if (mine && watchMode && !(watchMode === 'bigcmd' && shipsIn >= 20)) res = await UI.watchBattle(setup, mine);
        else if (mine) res = await UI.battlePrompt(setup, mine);
        else res = Battle.simulate(setup);
        // 後始末
        const emptied = [...attF, ...defF].filter(f => !f.ships.length);
        emptied.forEach(f => Game.removeFleet(f));
        const sideTxt = `${Game.ownerShort(af)}（攻）対 ${Game.ownerShort(oldOwner)}（守）`;
        if (res.winner === 'A') {
          defF.filter(f => f.ships.length).forEach(f => { if (!retreat(f, p.id)) { f.ships = []; Game.removeFleet(f); } });
          Game.capture(p.id, af);
          report.push({ kind: af === G.player ? 'good' : oldOwner === G.player ? 'bad' : 'info', text: `${p.name}の戦い：${sideTxt}。${Game.ownerName(af)}が勝ち、${p.name}を制圧した。`, fac: af, big: res.big });
        } else {
          attF.filter(f => f.ships.length).forEach(f => { if (!retreat(f, p.id)) { f.ships = []; Game.removeFleet(f); } });
          report.push({ kind: oldOwner === G.player ? 'good' : af === G.player ? 'bad' : 'info', text: `${p.name}の戦い：${sideTxt}。${Game.ownerName(oldOwner)}が守り抜いた。`, fac: oldOwner, big: res.big });
        }
        res.dead.forEach(k => report.push({ kind: G.officers[k].ever === G.player ? 'bad' : 'info', text: `${OFF[k].name}、${p.name}にて戦死。`, fac: null }));
        res.caught.forEach(k => report.push({ kind: 'info', text: `${OFF[k].name}が捕らえられた。`, fac: null }));
        if (res.big) report.push({ kind: 'big', text: `――後に「${res.big}」と呼ばれる大会戦であった。`, fac: null });
        G.fleets = G.fleets.filter(f => f.ships.length || f.fac === G.player && f.cmd);
      }
    }
    // 空の艦隊（プレイヤー以外）を消す
    G.fleets.filter(f => !f.ships.length).forEach(f => Game.removeFleet(f));
  }

  async function end() {
    if (running || G.over) return;
    running = true;
    const report = [];
    const logStart = G.log.length ? G.log[0] : null;
    try {
      UI.busy('各勢力が動いている…');
      await UI.wait(30);
      const capBefore = G.facs[G.player].capital, eclBefore = G.eclipse.arrived;
      // 0. 参謀に任せているなら、自国も参謀が動かす
      if (Staff.active()) Staff.turnPlayer();
      // 1. AI
      for (const f of G.facs) if (f.alive && f.id !== G.player) AI.turn(f.id);
      Eclipse.turn();
      // 2. 移動
      for (const fl of G.fleets) if (fl.fac === G.player) planRoute(fl);
      moveAll();
      UI.busy(false);
      // 3. 戦い
      await battles(report);
      UI.busy('月が変わる…');
      await UI.wait(20);
      // 4. 経済
      Game.economyTurn();
      // 小さな出来事
      Incidents.roll();
      // 5. 外交
      for (const f of G.facs) if (f.alive && f.id !== G.player) Diplo.aiTurn(f.id);
      // 6. 派閥の要求
      const dem = Game.demandTurn(G.player);
      for (const f of G.facs) if (f.alive && f.id !== G.player) Game.demandTurn(f.id);
      dem.forEach(d => {
        const P = PARTIES[d.party];
        if (d.new) report.push({ kind: 'big', text: `【${P.name}の要求】${Game.DEMANDS[d.party].text}（8か月以内）` });
        else if (d.ok) report.push({ kind: 'good', text: `${P.name}の要求に応えた。民心が上がった。` });
        else report.push({ kind: 'bad', text: `${P.name}の要求に応えられなかった。民心が下がった。` });
      });
      // 7. 月を進める
      G.turn++;
      G.officersBusyReset = true;
      UI.busy(false);
      // 8. この月の出来事（ログから）
      const newLogs = [];
      for (const l of G.log) { if (l === logStart) break; newLogs.push(l); }
      newLogs.reverse().forEach(l => {
        if (l.fac === G.player || l.kind === 'big' || l.kind === 'warn' || l.kind === 'bad') report.push({ kind: l.kind, text: l.text });
        else if (l.kind === 'info') report.push({ kind: 'news', text: l.text });   // ほかの国どうしの出来事
      });
      // 9. 勝ち負け
      const v = Game.checkVictory();
      Game.save();
      if (Staff.active() && !v) UI.autoReport(report); else await UI.monthReport(report);
      if (v) { if (G.staff) G.staff.on = false; G.over = v.type; Game.save(); await UI.gameOver(v.type); running = false; return; }
      // 10. 蝕の襲来（初めて現れた月だけ、特別な演出）
      if (!eclBefore && G.eclipse.arrived) {
        await Cinema.eclipseArrival();
        UI.show('main');
        StarMap.focus(Eclipse.RIFT_ID, 0.7); StarMap.selPlanet = Eclipse.RIFT_ID;
        Sound.bgm('crisis');
      }
      // 会話イベント
      await Story.run();
      // 11. 申し入れ
      await UI.pendingProposals();
      // 12. 参謀に任せている間は、次の月へ
      if (Staff.active()) {
        const why = Staff.shouldStop({ capitalLost: G.facs[G.player].capital !== capBefore, eclipseArrived: !eclBefore && G.eclipse.arrived });
        if (why) { running = false; await UI.staffStop(why); }
        else UI.autoNext();
      }
      Game.save();
    } catch (e) {
      console.error(e);
      UI.busy(false);
      UI.toast('エラーが起きました：' + e.message);
    }
    UI.refresh();
    running = false;
  }

  // 自動で回す（確かめ用：全勢力を AI にする）
  function autoplay(n) {
    const out = [];
    for (let i = 0; i < n && !G.over; i++) {
      for (const f of G.facs) if (f.alive) AI.turn(f.id);
      Eclipse.turn();
      moveAll();
      for (const p of G.planets) {
        let guard = 0;
        while (guard++ < 4) {
          const here = G.fleets.filter(fl => fl.at === p.id && fl.ships.length);
          const att = here.filter(fl => !Game.friendly(fl.fac, p.owner) && Game.canAttack(fl.fac, p.owner));
          if (!att.length) break;
          const af = att[0].fac, attF = att.filter(f => f.fac === af), defF = here.filter(fl => Game.friendly(fl.fac, p.owner) && fl.fac !== af);
          if (!defF.length && !p.def && !p.dock.length) { Game.capture(p.id, af); continue; }
          const res = Battle.simulate({ pid: p.id, att: { fac: af, fleets: attF }, def: { fac: p.owner, fleets: defF, dock: true } });
          [...attF, ...defF].filter(f => !f.ships.length).forEach(f => Game.removeFleet(f));
          if (res.winner === 'A') { defF.filter(f => f.ships.length).forEach(f => { if (!retreat(f, p.id)) Game.removeFleet(f); }); Game.capture(p.id, af); }
          else attF.filter(f => f.ships.length).forEach(f => { if (!retreat(f, p.id)) Game.removeFleet(f); });
        }
      }
      G.fleets.filter(f => !f.ships.length).forEach(f => Game.removeFleet(f));
      Game.economyTurn();
      for (const f of G.facs) if (f.alive) { Diplo.aiTurn(f.id); Game.demandTurn(f.id); }
      G.turn++;
      const v = Game.checkVictory();
      if (v) { G.over = v.type; out.push(v.type); }
    }
    return out;
  }

  return { end, autoplay, planRoute, get running() { return running; } };
})();
