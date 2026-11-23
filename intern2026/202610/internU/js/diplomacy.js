// ============================================================
//  外交（不可侵・通商・同盟・停戦・宣戦・贈り物・技術供与・降伏勧告）
// ============================================================
const Diplo = (() => {
  const KINDS = {
    nap:   { name: '不可侵条約', desc: '互いに攻め込まない約束。', need: ['neutral'], to: 'nap', th: 0 },
    trade: { name: '通商条約', desc: '交易で互いの収入が増える（それぞれ +5%）。', need: ['neutral', 'nap'], to: 'trade', th: 18 },
    ally:  { name: '同盟', desc: '共に戦う盟約。全勢力と同盟を結べば和平が成る。通商条約を結んでから半年たつと申し込みやすい。', need: ['trade'], to: 'ally', th: 50 },
    peace: { name: '停戦', desc: '戦争を終わらせ、中立に戻る。', need: ['war'], to: 'neutral', th: 16 },
    surrender: { name: '降伏勧告', desc: '相手を従わせ、領土と士官を引き継ぐ。圧倒的な国力の差が要る。', need: ['war', 'neutral', 'nap', 'trade'], th: 60 },
  };

  function power(fid) {
    let p = 0;
    G.fleets.forEach(fl => { if (fl.fac === fid) p += Game.fleetPower(fl); });
    G.planets.forEach(pl => { if (pl.owner === fid) p += pl.pop * 0.8 + Game.dockPower(pl) + Game.satPower(pl) * 0.5; });
    return Math.max(1, p);
  }
  function setRel(a, b, s) {
    const r = Game.rel(a, b);
    const old = r.s;
    r.s = s; r.since = G.turn;
    if (['nap', 'trade', 'ally'].includes(s) && s !== old) {
      G.facs[a].stats.treaties++; G.facs[b].stats.treaties++;
      Game.shiftParty(a, s === 'trade' ? 'trade' : 'peace', 5); Game.shiftParty(b, s === 'trade' ? 'trade' : 'peace', 5);
    }
    if (s === 'ally') { G.rec && (a === G.player || b === G.player) && (G.rec.allies++); }
  }
  // 共通の敵がいるか
  function commonEnemy(a, b) {
    for (let c = 0; c < 6; c++) {
      if (c === a || c === b || !G.facs[c].alive) continue;
      if (Game.rel(a, c).s === 'war' && Game.rel(b, c).s === 'war') return true;
    }
    return false;
  }
  // 受け入れられやすさ（0〜1）と理由
  function chance(from, to, kind, envoy) {
    const K = KINDS[kind], r = Game.rel(from, to), F = FACTIONS[from], T = FACTIONS[to];
    const ff = G.facs[from], tf = G.facs[to];
    const why = [];
    if (!K.need.includes(r.s)) return { p: 0, why: ['今の関係では申し込めない'] };
    let sc = r.t;
    why.push(`信頼 ${Math.round(r.t)}`);
    if (envoy) { const v = (OFF[envoy].dip - 50) * 0.5; sc += v; why.push(`使者の交渉 ${v >= 0 ? '+' : ''}${Math.round(v)}`); }
    if (F.bonus.dip) { sc += 12; why.push('国の外交 +12'); }
    if (from === G.player) { const sb = Math.round(Staff.bonus('diplomacy', 18)); if (sb) { sc += sb; why.push(`参謀の外交 +${sb}`); } }
    if (ff.ruling === 'peace') { sc += 15; why.push('融和派 +15'); }
    if (tf.ruling === 'peace') { sc += 8; why.push(`${T.short}の融和派 +8`); }
    if (tf.ruling === 'war' && kind !== 'peace') { sc -= 10; why.push(`${T.short}の主戦派 −10`); }
    sc -= T.agg * 18; why.push(`${T.short}の気風 −${Math.round(T.agg * 18)}`);
    if (G.eclipse.arrived && !G.eclipse.defeated) { sc += 22; why.push('蝕という共通の敵 +22'); }
    if (commonEnemy(from, to)) { sc += 12; why.push('共通の敵 +12'); }
    const pf = power(from), pt = power(to), ratio = pf / pt;
    if (kind === 'peace') {
      const w = (G.turn - r.since);
      if (w < 3) { sc -= 30; why.push('開戦したばかり −30'); }
      const v = clamp((ratio - 1) * 22, -25, 30) + tf.warWeary * 3;
      sc += v; why.push(`戦況と厭戦 ${v >= 0 ? '+' : ''}${Math.round(v)}`);
    } else if (kind === 'surrender') {
      const pl = G.planets.filter(p => p.owner === to).length;
      const v = (ratio - 3) * 18 - pl * 5;
      sc += v; why.push(`国力の差 ${v >= 0 ? '+' : ''}${Math.round(v)}`);
      if (to === tf.id && G.facs[to].capital !== undefined && ratio < 3) { sc -= 40; }
    }
    if ((kind === 'ally' || kind === 'trade') && G.turn - r.since < 6) { sc -= 20; why.push('約束を結んでまだ日が浅い −20'); }
    if (kind === 'ally') {
      const v = clamp((ratio - 0.6) * 14, -10, 14); sc += v; why.push(`国力 ${v >= 0 ? '+' : ''}${Math.round(v)}`);
    }
    if (G.facs[to].leader && OFF[G.facs[to].leader]) {
      const pers = OFF[G.facs[to].leader].pers;
      if (pers === '仁徳') { sc += 6; why.push('相手の君主は仁徳の人 +6'); }
      if (pers === '野心' && kind !== 'peace') { sc -= 6; why.push('相手の君主は野心家 −6'); }
    }
    const p = 1 / (1 + Math.exp(-(sc - K.th) / 10));
    return { p: kind === 'surrender' && ratio < 2.5 ? 0 : p, why, sc };
  }
  function propose(from, to, kind, envoy) {
    const c = chance(from, to, kind, envoy);
    if (envoy) G.officers[envoy].busy = G.turn;
    const ok = Math.random() < c.p;
    const r = Game.rel(from, to);
    if (ok) {
      if (kind === 'surrender') { annex(from, to); }
      else setRel(from, to, KINDS[kind].to);
      r.t = Math.min(100, r.t + 8);
      if (envoy) Game.addMerit(envoy, 4);
    } else {
      r.t = Math.max(-100, r.t - 4);
    }
    return { ok, p: c.p };
  }
  function declareWar(a, b) {
    const r = Game.rel(a, b);
    const broke = ['nap', 'trade', 'ally'].includes(r.s);
    r.s = 'war'; r.since = G.turn; r.t = Math.max(-100, r.t - 45);
    Game.shiftParty(a, 'war', 4); Game.shiftParty(b, 'war', 6);
    if (broke) {
      // 約束を破ると、ほかの国の信頼を失う
      for (let c = 0; c < 6; c++) if (c !== a && c !== b && G.facs[c].alive) Game.rel(a, c).t -= 10;
      G.planets.forEach(p => { if (p.owner === a) p.stab = clamp(p.stab - (G.facs[a].ruling === 'war' ? 2 : 7), 0, 100); });
    }
    // 同盟国は加勢する
    for (let c = 0; c < 6; c++) {
      if (c === a || c === b || !G.facs[c].alive) continue;
      if (Game.rel(b, c).s === 'ally' && Game.rel(a, c).s !== 'ally' && c !== G.player && Math.random() < 0.6) {
        Game.rel(a, c).s = 'war'; Game.rel(a, c).since = G.turn; Game.rel(a, c).t -= 30;
        Game.log(`${FACTIONS[c].name}は盟約に従い、${FACTIONS[a].name}に宣戦した。`, a === G.player ? 'bad' : 'info', c);
      }
    }
    Game.log(`${FACTIONS[a].name}が${FACTIONS[b].name}に宣戦を布告した。${broke ? '（約束を破って）' : ''}`, b === G.player ? 'bad' : a === G.player ? 'big' : 'info', a);
  }
  function gift(from, to, amt) {
    const f = G.facs[from]; if (f.funds < amt) return false;
    f.funds -= amt; G.facs[to].funds += amt;
    Game.rel(from, to).t = Math.min(100, Game.rel(from, to).t + amt / 22 * (1.2 - FACTIONS[to].agg * 0.5));
    return true;
  }
  function techGift(from, to) {
    const f = G.facs[from]; if (f.rp < 150) return false;
    f.rp -= 150; G.facs[to].rp += 200;
    Game.rel(from, to).t = Math.min(100, Game.rel(from, to).t + 12);
    return true;
  }
  // 降伏：領土・艦隊・士官を引き継ぐ
  function annex(by, fid) {
    G.planets.forEach(p => { if (p.owner === fid) { p.owner = by; p.stab = Math.min(p.stab, 45); if (p.gov && G.officers[p.gov].fac !== fid) p.gov = null; } });
    G.fleets.forEach(fl => { if (fl.fac === fid) fl.fac = by; });
    Object.keys(G.officers).forEach(k => { const o = G.officers[k]; if (o.fac === fid && o.st === 'act') { o.fac = by; o.loyal = 55; } });
    // 設計も引き継ぐ
    G.facs[fid].designs.forEach(d => { G.designs[d].fac = by; G.facs[by].designs.push(d); });
    G.facs[fid].designs = [];
    G.facs[fid].alive = false;
    G.facs[by].stats.captured += 3;
    for (const m of Object.values(G.minors)) if (m.ally === fid) m.ally = null;
    for (let b = 0; b < 6; b++) if (b !== fid) Game.rel(fid, b).s = 'neutral';
    G.flags['fell_' + fid] = G.turn;
    Game.log(`${FACTIONS[fid].name}は${FACTIONS[by].name}に降伏した。`, 'big', by);
  }

  // ---------- AI の外交 ----------
  function aiTurn(fid) {
    const f = G.facs[fid], F = FACTIONS[fid];
    if (!f.alive) return;
    for (let b = 0; b < 6; b++) {
      if (b === fid || !G.facs[b].alive) continue;
      const r = Game.rel(fid, b);
      // 信頼のゆらぎ
      const border = G.planets.some(p => p.owner === fid && Game.ADJ[p.id].some(n => G.planets[n].owner === b));
      if (border && r.s !== 'ally') r.t -= F.agg * 0.6;
      r.t += (r.s === 'trade' ? 0.8 : r.s === 'ally' ? 1 : 0) + (0 - r.t) * 0.01;
      r.t = clamp(r.t, -100, 100);
      if (Math.random() > 0.22) continue;
      let kind = null;
      const ratio = power(fid) / power(b);
      if (r.s === 'war') {
        if (G.turn - r.since > 5 && (ratio < 0.8 || f.warWeary > 5 || (G.eclipse.arrived && !G.eclipse.defeated))) kind = 'peace';
      } else if (r.s === 'neutral') {
        const wantWar = F.agg > 0.45 && G.turn > 6 && border && ratio > 1.35 && r.t < 10 && f.ruling !== 'peace' && !(G.eclipse.arrived && !G.eclipse.defeated);
        if (wantWar && Math.random() < F.agg * 0.5 && !G.facs.some((x, i) => i !== fid && i !== b && x.alive && Game.rel(fid, i).s === 'war' && power(i) > power(fid) * 0.7)) { declareWar(fid, b); continue; }
        if (r.t > -5) kind = 'nap';
      } else if (r.s === 'nap') {
        if (r.t > 10) kind = 'trade';
        else if (F.agg > 0.6 && ratio > 1.8 && r.t < -30 && Math.random() < 0.3) { declareWar(fid, b); continue; }
      } else if (r.s === 'trade') {
        if (r.t > 35 || commonEnemy(fid, b)) kind = 'ally';
      }
      if (!kind) continue;
      if (b === G.player) {
        if (!G.pending.some(p => p.from === fid)) G.pending.push({ from: fid, kind, turn: G.turn });
      } else {
        const res = propose(fid, b, kind, null);
        if (res.ok && (kind === 'ally' || kind === 'peace')) Game.log(`${F.name}と${FACTIONS[b].name}が${KINDS[kind].name}を結んだ。`, 'info', fid);
      }
    }
    // 降伏勧告（圧倒的に強いとき）
    if (Math.random() < 0.08) {
      for (let b = 0; b < 6; b++) {
        if (b === fid || b === G.player || !G.facs[b].alive) continue;
        if (power(fid) / power(b) > 4 && G.planets.filter(p => p.owner === b).length <= 2) {
          const c = chance(fid, b, 'surrender', null);
          if (Math.random() < c.p) { annex(fid, b); break; }
        }
      }
    }
  }
  // プレイヤーへの申し入れに答える
  function answer(pend, yes) {
    const r = Game.rel(pend.from, G.player);
    if (yes) {
      setRel(pend.from, G.player, KINDS[pend.kind].to);
      r.t = Math.min(100, r.t + 10);
      Game.log(`${FACTIONS[pend.from].name}と${KINDS[pend.kind].name}を結んだ。`, 'good', G.player);
    } else r.t = Math.max(-100, r.t - 8);
  }

  return { KINDS, power, chance, propose, declareWar, gift, techGift, annex, aiTurn, answer, setRel };
})();
