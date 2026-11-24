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
      // 敵の星へ入ったなら、侵攻として記録する（マップに矢印を描く）
      const P = G.planets[fl.at];
      if (!Game.friendly(fl.fac, P.owner) && (fl.fac === 'E' || Game.canAttack(fl.fac, P.owner))) addRaid(fl.from, fl.at, fl.fac, P.owner, fl);
    }
  }
  function addRaid(from, to, fac, def, fl) {
    if (from === undefined || from === null || from === to) return null;
    G.raids = (G.raids || []).filter(r => r.t >= G.turn - 2);
    let r = G.raids.find(x => x.t === G.turn && x.from === from && x.to === to && x.fac === fac);
    if (!r) { r = { t: G.turn, from, to, fac, def, n: 0, fleets: [] }; G.raids.push(r); }
    if (fl) { r.n += fl.ships.length; r.fleets.push(Game.fleetName(fl)); }
    return r;
  }
  // その星を攻めた侵攻の記録（なければ、艦隊の来た星から作る）
  function raidFor(pid, fac, attF, def) {
    const list = (G.raids || []).filter(r => r.t === G.turn && r.to === pid && r.fac === fac);
    if (list.length) return list;
    const f = attF[0], from = f && f.from !== undefined && f.from !== pid ? f.from : (Game.ADJ[pid] || []).find(n => G.planets[n].owner === fac);
    const r = addRaid(from, pid, fac, def, null);
    if (r) attF.forEach(fl => { r.n += fl.ships.length; r.fleets.push(Game.fleetName(fl)); });
    return r ? [r] : [];
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
        const raids = raidFor(p.id, af, attF, oldOwner);
        const mineAny = attF.some(f => f.fac === G.player) || defF.some(f => f.fac === G.player) || oldOwner === G.player;
        if (!defF.length && !p.def && !p.dock.length) {
          if (mineAny) await UI.raidAlert({ raids, pid: p.id, af, def: oldOwner, attF, defF: [], free: true });
          raids.forEach(r => r.res = 'free');
          Game.capture(p.id, af);
          report.push({ kind: af === G.player ? 'good' : oldOwner === G.player ? 'bad' : 'info', text: `${Game.ownerName(af)}が${p.name}を無血で制圧した。`, fac: af });
          if (af === G.player) { const fl = attF[0]; if (fl.cmd) WarRoom.say(fl.cmd, '守りはいない。このまま押さえるぞ。', 'happy', p.id); WarRoom.result(`${p.name}を戦わずに制圧した`, true, p.id); }
          else if (oldOwner === G.player) WarRoom.result(`守りのない${p.name}を${Game.ownerName(af)}に奪われた`, false, p.id);
          else WarRoom.news(`${Game.ownerName(af)}が${p.name}を無血で制圧した。`);
          continue;
        }
        const setup = { pid: p.id, att: { fac: af, fleets: attF }, def: { fac: p.owner, fleets: defF, dock: true } };
        const mine = attF.some(f => f.fac === G.player) ? 'A' : (defF.some(f => f.fac === G.player) || p.owner === G.player) ? 'D' : null;
        let res;
        const shipsIn = [...attF, ...defF].reduce((a, f) => a + f.ships.length, 0) + p.dock.length;
        const watchMode = Staff.active() ? (G.staff.watch || (G.staff.bigManual ? 'bigcmd' : 'watch')) : null;
        // 自国が関わる戦いは、どこからどこへ攻め込んだかを、まず地図と帯で知らせる
        if (mine) {
          // 敵将と因縁のある自国の士官が、ひと言
          const ec = (mine === 'A' ? defF : attF).find(f => f.cmd), cm = ec ? People.enemyComment(ec.cmd) : null;
          if (cm) WarRoom.say(cm.who, cm.text, 'angry', p.id);
          const allies = (mine === 'A' ? attF : defF).map(f => f.cmd).filter(Boolean), ac = allies.length > 1 ? People.allyComment(allies) : null;
          if (ac) WarRoom.say(ac.who, ac.text, 'happy', p.id);
          await UI.raidAlert({ raids, pid: p.id, af, def: oldOwner, attF, defF, mine });
        }
        if (mine && watchMode === 'none') { res = Battle.simulate(setup); await UI.raidResult(res, mine, p.id); }
        else if (mine && watchMode && !(watchMode === 'bigcmd' && shipsIn >= 20)) res = await UI.watchBattle(setup, mine);
        else if (mine) res = await UI.battlePrompt(setup, mine);
        else res = Battle.simulate(setup);
        // 後始末
        const emptied = [...attF, ...defF].filter(f => !f.ships.length);
        emptied.forEach(f => Game.removeFleet(f));
        const sideTxt = `${Game.ownerShort(af)}（攻）対 ${Game.ownerShort(oldOwner)}（守）`;
        raids.forEach(r => r.res = res.winner === 'A' ? 'take' : 'repel');
        if (res.winner === 'A') {
          defF.filter(f => f.ships.length).forEach(f => { if (!retreat(f, p.id)) { f.ships = []; Game.removeFleet(f); } });
          Game.capture(p.id, af);
          report.push({ kind: af === G.player ? 'good' : oldOwner === G.player ? 'bad' : 'info', text: `${p.name}の戦い：${sideTxt}。${Game.ownerName(af)}が勝ち、${p.name}を制圧した。`, fac: af, big: res.big });
        } else {
          attF.filter(f => f.ships.length).forEach(f => { if (!retreat(f, p.id)) { f.ships = []; Game.removeFleet(f); } });
          report.push({ kind: oldOwner === G.player ? 'good' : af === G.player ? 'bad' : 'info', text: `${p.name}の戦い：${sideTxt}。${Game.ownerName(oldOwner)}が守り抜いた。`, fac: oldOwner, big: res.big });
        }
        // 作戦室：司令の言葉と結果
        if (mine) {
          const myF = mine === 'A' ? attF : defF, won = res.winner === mine;
          const lead = myF.find(f => f.cmd);
          const k = lead && lead.cmd && G.officers[lead.cmd] && G.officers[lead.cmd].st !== 'dead' ? lead.cmd : null;
          const sunk = mine === 'A' ? res.lostD : res.lostA, lost = mine === 'A' ? res.lostA : res.lostD;
          (res.story || []).slice(0, 5).forEach(e => WarRoom.flow(e.text));
          if (k) WarRoom.say(k, People.voice(k, won ? 'win' : 'lose') || Battle.LINES[OFF[k].pers][won ? 'win' : 'lose'], won ? 'happy' : 'sad', p.id);
          const what = mine === 'A' ? (won ? `${p.name}を制圧した` : `${p.name}の攻略に失敗し、退いた`) : (won ? `${p.name}を守り抜いた` : `${p.name}を奪われた`);
          const ord = mine === 'A' && lead && lead.lastOrder && lead.lastOrder.to === p.id ? `命令「${p.name}攻略」→ ` : '';
          WarRoom.result(`${ord}${what}（撃沈 ${sunk}隻・喪失 ${lost}隻）`, won, p.id);
        } else WarRoom.news(`${p.name}の戦い：${Game.ownerName(af)}が攻め、${res.winner === 'A' ? '制圧した' : `${Game.ownerName(oldOwner)}が守り抜いた`}。${res.upset ? '寡兵による逆転だった。' : ''}`);
        res.dead.forEach(k => {
          const last = People.voice(k, 'death');
          if (G.officers[k].ever === G.player || G.officers[k].fac === G.player) WarRoom.result(`${OFF[k].name}、${p.name}にて戦死${last ? `――「${last}」` : ''}`, false, p.id);
          // 関係のある自国の士官のひと言（敵将でも）
          for (const t of People.tiesOf(k)) { const o = People.other(t, k); if (isMine(o)) { WarRoom.say(o, People.line(t, 'death', o), 'sad', p.id); break; } }
        });
        res.caught.forEach(k => {
          if (G.officers[k].ever === G.player) { WarRoom.say(k, People.voice(k, 'captured') || '……不覚。', 'sad', p.id); WarRoom.result(`${OFF[k].name}が捕らえられた`, false, p.id); }
          else if (G.officers[k].capBy === G.player) { WarRoom.result(`敵将${OFF[k].name}を捕らえた`, true, p.id); const v = People.voice(k, 'captured'); if (v) WarRoom.say(k, v, 'angry', p.id); }
        });
        if (mine && res.story && res.story.length) report.push({ kind: 'flow', text: `　戦況：${res.story.slice(0, 3).map(e => e.text).join('／')}`, fac: null });
        if (res.big && mine) WarRoom.result(`――後に「${res.big}」と呼ばれる大会戦であった`, res.winner === mine, p.id);
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
      const capBefore = G.facs[G.player].capital, eclBefore = G.eclipse.arrived, phBefore = (Eclipse.norm(), G.eclipse.phase);
      // 0. 参謀に任せているなら、自国も参謀が動かす
      if (Staff.active()) Staff.turnPlayer();
      // 1. AI
      for (const f of G.facs) if (f.alive && f.id !== G.player) AI.turn(f.id);
      Eclipse.turn();
      // 2. 移動
      for (const fl of G.fleets) if (fl.fac === G.player) planRoute(fl);
      moveAll();
      UI.busy(false);
      if (Staff.active()) await WarRoom.play();
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
      // 人物の関係・国家間の出来事
      People.monthTick();
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
      if (Staff.active()) {
        dem.forEach(d => { const P = PARTIES[d.party]; WarRoom.result(d.new ? `${P.name}が要求を出した：${Game.DEMANDS[d.party].text}（8か月以内）` : d.ok ? `${P.name}の要求に応えた。民心が上がった` : `${P.name}の要求に応えられなかった。民心が下がった`, !!(d.new || d.ok)); });
        let nn = 0;
        for (const l of newLogs) {
          if (l.text.startsWith('参謀') && l.text.includes('方針を任せた')) continue;
          if (l.fac === G.player || l.kind === 'big' || l.kind === 'bad' || l.kind === 'warn') {
            if (/を申し入れた|と盟約を結んだ|贈り物|が仕官した/.test(l.text)) continue;   // 外交は作戦室で別に出している
            const pd = WarRoom.link(l.text);
            const inc = l.text.startsWith('【出来事】');
            if (inc) { const p = G.planets.find(x => l.text.includes(x.name) && x.owner === G.player); WarRoom.result(l.text.replace('【出来事】', '出来事：'), l.kind !== 'bad', p ? p.id : null); if (p && p.gov) WarRoom.say(p.gov, Game.isLeader(p.gov) ? (l.kind === 'bad' ? 'うむ、手を打とう。' : '喜ばしいことだ。') : l.kind === 'bad' ? '手を尽くします。' : '良い知らせです。', l.kind === 'bad' ? 'sad' : 'happy', p.id); continue; }
            WarRoom.result((pd ? `命令「${pd.text}」→ ` : '') + l.text.replace(/。$/, ''), l.kind !== 'bad' && l.kind !== 'warn', pd ? pd.pid : null);
          } else if (l.kind === 'info' && nn++ < 4) WarRoom.news(l.text);
        }
      }
      // 9. 勝ち負け
      const v = Game.checkVictory();
      Game.save();
      if (Staff.active() && !v) { UI.autoReport(report); WarRoom.say(G.staff.key, '今月の報告は以上です。', 'normal'); await WarRoom.play(); } else await UI.monthReport(report);
      if (v) { if (G.staff) G.staff.on = false; G.over = v.type; Game.save(); await UI.gameOver(v.type); running = false; return; }
      // 10. 蝕の襲来（初めて現れた月だけ、特別な演出）
      // 先触れ・大侵攻・再来は、それぞれの演出で（その時まで、プレイヤーには知らせない）
      const ph = G.eclipse.phase;
      if (ph !== phBefore && ['first', 'great', 'ret'].includes(ph)) {
        await Cinema.eclipseArrival(ph, G.eclipse.cycle);
        UI.show('main');
        StarMap.focus(Eclipse.mainRift(), ph === 'first' ? 0.7 : 0.4); StarMap.selPlanet = Eclipse.mainRift();
        Sound.bgm('crisis');
      } else if (ph !== phBefore && (ph === 'receded' || ph === 'solved')) Sound.bgm('strategy');
      // 会話イベント
      await Story.run();
      // 11. 申し入れ
      await UI.pendingProposals();
      // 12. 参謀に任せている間は、次の月へ
      if (Staff.active()) {
        const why = Staff.shouldStop({ capitalLost: G.facs[G.player].capital !== capBefore, eclipseArrived: G.eclipse.phase !== phBefore && ['first', 'great', 'ret'].includes(G.eclipse.phase) });
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
