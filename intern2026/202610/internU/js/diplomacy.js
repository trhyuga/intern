// ============================================================
//  外交（不可侵・通商・同盟・停戦・宣戦・贈り物・技術供与・降伏勧告）
// ============================================================
const Diplo = (() => {
  const KINDS = {
    nap:   { name: '不可侵条約', desc: '互いに攻め込まない約束。', need: ['neutral'], to: 'nap', th: 0 },
    trade: { name: '通商条約', desc: '交易で互いの収入が増える（それぞれ +5%）。', need: ['neutral', 'nap'], to: 'trade', th: 24 },
    ally:  { name: '同盟', desc: '共に戦う盟約。全勢力と同盟を結べば和平が成る。通商条約を結んでから半年たつと申し込みやすい。', need: ['trade'], to: 'ally', th: 62 },
    peace: { name: '停戦', desc: '戦争を終わらせ、中立に戻る。', need: ['war'], to: 'neutral', th: 16 },
    surrender: { name: '降伏勧告', desc: '相手を従わせ、領土と士官を引き継ぐ。圧倒的な国力の差が要る。', need: ['war', 'neutral', 'nap', 'trade'], th: 60 },
  };

  function power(fid) {
    let p = 0;
    G.fleets.forEach(fl => { if (fl.fac === fid) p += Game.fleetPower(fl); });
    G.planets.forEach(pl => { if (pl.owner === fid) p += pl.pop * 0.8 + Game.dockPower(pl) + Game.satPower(pl) * 0.5; });
    return Math.max(1, p);
  }
  // 相性
  function aff(a, b) { const e = AFFINITY.find(x => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a)); return e ? e[2] : 0; }
  function affWhy(a, b) { const e = AFFINITY.find(x => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a)); return e ? e[3] : ''; }
  // a と b が近づいた時、まわりの国の信頼が動く（相性の悪い国は疑い、良い国は少し喜ぶ）
  let lastRipple = [];
  function ripple(a, b, strength) {
    lastRipple = [];
    for (const [x, y] of [[a, b], [b, a]]) {
      for (let c = 0; c < 6; c++) {
        if (c === a || c === b || !G.facs[c].alive) continue;
        const k = aff(c, y);
        if (!k) continue;
        const d = k < 0 ? -6 * -k * strength : 3 * k * strength;
        const r = Game.rel(c, x); r.t = clamp(r.t + d, -100, 100);
        if (x === G.player && Math.abs(d) >= 4) {
          const t = d < 0 ? `${FACTIONS[y].name}と近づいたため、${FACTIONS[c].name}は不信を募らせた（信頼 ${Math.round(d)}・${affWhy(c, y)}）` : `${FACTIONS[y].name}と近づいたことを、${FACTIONS[c].name}は歓迎した（信頼 +${Math.round(d)}）`;
          lastRipple.push(t);
          Game.log(t + '。', d < 0 ? 'warn' : 'good', G.player);
        }
      }
    }
  }
  // 攻めっ気：国の気風＋主戦派の勢い（主導していればさらに）＋主戦派の要求
  function aggOf(fid) {
    const f = G.facs[fid], F = FACTIONS[fid];
    return clamp(F.agg + f.parties.war / 100 * 0.4 + (f.ruling === 'war' ? 0.15 : 0) + (f.demand && f.demand.party === 'war' ? 0.1 : 0), 0, 1.1);
  }
  // 銀河で抜きん出た国への警戒（0〜）
  function fear(b) { const share = G.planets.filter(p => p.owner === b).length / G.planets.length; return Math.max(0, share - 0.35); }
  function setRel(a, b, s) {
    { const r0 = Game.rel(a, b); if (s === 'neutral' || s === 'nap') { r0.gainA = 0; r0.gainB = 0; r0.goalAt = 0; } }
    const r = Game.rel(a, b);
    const old = r.s;
    r.s = s; r.since = G.turn;
    const lv = { war: 0, neutral: 0, nap: 1, trade: 2, ally: 3 };
    if (lv[s] > lv[old]) ripple(a, b, lv[s] === 3 ? 1.4 : lv[s] === 2 ? 0.8 : 0.5);
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
    if (from === G.player) { const sb = Math.round(Staff.bonus('diplomacy', 12)); if (sb) { sc += sb; why.push(`参謀の外交 +${sb}`); } }
    const af = aff(from, to);
    if (af) { sc += af * 7; why.push(`国の相性 ${af > 0 ? '+' : ''}${af * 7}（${affWhy(from, to)}）`); }
    const fe = fear(from);
    if (fe > 0 && kind !== 'peace' && kind !== 'surrender') { const v = Math.round(fe * 90); sc -= v; why.push(`強大さへの警戒 −${v}`); }
    if (kind === 'ally') {
      const n = G.facs.filter(x => x.alive && x.id !== from && x.id !== to && Game.rel(from, x.id).s === 'ally').length;
      if (n) { sc -= n * 8; why.push(`ほかの同盟 ${n}つ −${n * 8}`); }
    }
    if (tf.ruling === 'war' && (kind === 'ally' || kind === 'trade')) { sc -= 6; why.push(`${T.short}の主戦派の反発 −6`); }
    if (ff.ruling === 'peace') { sc += 10; why.push('融和派 +10'); }
    if (kind === 'peace') { const lostT = Game.warGain(from, to), lostF = Game.warGain(to, from); if (lostT >= 2) { sc += 12 + lostT * 4; why.push(`${T.short}は負けが込んでいる +${12 + lostT * 4}`); } if (lostF >= 3) { sc += 6; why.push('戦の目的は果たした +6'); } }
    if (tf.ruling === 'peace') { sc += 8; why.push(`${T.short}の融和派 +8`); }
    if (tf.ruling === 'war' && kind !== 'peace') { sc -= 10; why.push(`${T.short}の主戦派 −10`); }
    sc -= T.agg * 18; why.push(`${T.short}の気風 −${Math.round(T.agg * 18)}`);
    if (Eclipse.active()) { sc += 22; why.push('蝕という共通の敵 +22'); }
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
      if (envoy) { Game.addMerit(envoy, 4); if (typeof People !== 'undefined') People.addStat(envoy, 'dip', 0.12); }
    } else {
      if (envoy && typeof People !== 'undefined') People.addStat(envoy, 'dip', 0.06);
      r.t = Math.max(-100, r.t - 4);
    }
    return { ok, p: c.p };
  }
  function declareWar(a, b, reason) {
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
    Game.log(`${FACTIONS[a].name}が${reason ? reason + '、' : ''}${FACTIONS[b].name}に宣戦を布告した。${broke ? '（約束を破って）' : ''}`, b === G.player ? 'bad' : a === G.player ? 'big' : 'info', a);
  }
  function gift(from, to, amt) {
    const f = G.facs[from]; if (f.funds < amt) return false;
    f.funds -= amt; G.facs[to].funds += amt;
    Game.rel(from, to).t = Math.min(100, Game.rel(from, to).t + amt / 26 * (1.2 - FACTIONS[to].agg * 0.5));
    ripple(from, to, 0.25 + amt / 2000);
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
    G.facs[fid].alive = false; G.facs[fid].killedBy = by; G.facs[fid].diedAt = G.turn;
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
      const agg = aggOf(fid);
      const crisis = Eclipse.active();
      if (border && r.s !== 'ally') r.t -= agg * 0.6;
      r.t += (r.s === 'trade' ? 0.6 : 0) + (0 - r.t) * 0.01 + aff(fid, b) * 0.15;
      // 抜きん出た国は警戒される
      const fe = fear(b);
      if (fe > 0 && !crisis) r.t -= Math.min(2, 0.5 + fe * 6);
      // 同盟は手入れが要る（相性が悪いほど早く冷める。共通の敵や蝕の間は保たれる）
      if (r.s === 'ally' && !crisis && !commonEnemy(fid, b)) r.t -= 0.4 + Math.max(0, -aff(fid, b)) * 0.5 + (f.ruling === 'war' ? 0.3 : 0);
      r.t = clamp(r.t, -100, 100);
      if (r.s === 'ally' && r.t < -10 && Math.random() < 0.15) {
        r.s = 'trade'; r.since = G.turn;
        Game.log(`${F.name}は${FACTIONS[b].name}との同盟を解消した（信頼 ${Math.round(r.t)}）。`, b === G.player ? 'bad' : 'info', b === G.player ? G.player : fid);
        continue;
      }
      // 戦の目的を果たした戦は、毎月、手打ちを探る（新しい戦が始まる余地をつくる）
      if (r.s === 'war' && Math.max(Game.warGain(fid, b), Game.warGain(b, fid)) >= Game.warGoal(Game.warGain(fid, b) >= Game.warGain(b, fid) ? fid : b)) {
        r.goalAt = r.goalAt || G.turn;
        if (G.turn - r.goalAt >= 2) {
          if (b === G.player) { if (!G.pending.some(p => p.from === fid)) G.pending.push({ from: fid, kind: 'peace', turn: G.turn }); }
          else { const ga = Game.warGain(fid, b), gb = Game.warGain(b, fid); setRel(fid, b, 'neutral'); r.goalAt = 0; Game.log(`${F.name}と${FACTIONS[b].name}が停戦した（奪った星 ${ga}対${gb}）。`, 'info', fid); }
          continue;
        }
      }
      if (Math.random() > 0.3) continue;
      let kind = null;
      const ratio = power(fid) / power(b);
      const hawk = f.ruling === 'war';
      if (r.s === 'war') {
        const gained = fid < b ? (r.gainA || 0) : (r.gainB || 0), lost = fid < b ? (r.gainB || 0) : (r.gainA || 0);
        const goal = Game.warGoal(fid);
        if (G.turn - r.since > 4 && ((gained >= goal && Math.random() < 0.35) || (lost >= 2 && Math.random() < 0.3))) kind = 'peace';
        else if (G.turn - r.since > 5 && (ratio < (hawk ? 0.55 : 0.8) || f.warWeary > (hawk ? 9 : 5) || crisis || (G.turn - r.since > 24 && ratio < 1.4 && Math.random() < 0.2))) kind = 'peace';   // 長い戦は、決め手がなければ手打ちに
      } else if (r.s === 'neutral') {
        // 覇権を阻む：いちばん大きな国（とくにプレイヤー）を主戦派は狙う
        const biggest = G.facs.filter(x => x.alive).sort((x, y) => G.planets.filter(p => p.owner === y.id).length - G.planets.filter(p => p.owner === x.id).length)[0];
        const hegemon = biggest && biggest.id === b && fear(b) > 0;
        const small = G.planets.filter(p => p.owner === b).length <= 4 || G.facs.filter((x, i) => i !== b && x.alive && Game.rel(b, i).s === 'war').length >= 2;   // 弱った国・多方面で戦っている国には、さらに宣戦しない
        const wantWar = agg > 0.4 && G.turn > 6 && G.turn - (r.since || 0) > 6 && (!small || hegemon) && (border || hegemon) && ratio > (hawk ? 0.95 : 1.15) * (hegemon ? 0.75 : 1) * (b === G.player ? 0.85 : 1) && r.t < (hawk ? 35 : 20) && (f.ruling !== 'peace' || agg > 0.7) && !crisis;
        if (wantWar && G.turn > 8 && Math.random() < agg * (b === G.player ? 0.75 : 0.6) && !G.facs.some((x, i) => i !== fid && i !== b && x.alive && Game.rel(fid, i).s === 'war' && power(i) > power(fid) * 0.7)) { declareWar(fid, b, hegemon ? `${FACTIONS[b].name}の覇権を阻むと称して` : hawk ? '主戦派に押され' : ''); continue; }
        if (r.t > -5) kind = 'nap';
      } else if (r.s === 'nap') {
        if (r.t > 10) kind = 'trade';
        else if (agg > 0.55 && ratio > (hawk ? 1.2 : 1.6) && r.t < (hawk ? -5 : -20) && Math.random() < 0.4) { declareWar(fid, b, hawk ? '主戦派に押され、不可侵を破って' : ''); continue; }
      } else if (r.s === 'trade') {
        if ((r.t > 45 && !hawk) || (commonEnemy(fid, b) && r.t > 15)) kind = 'ally';
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

  return { KINDS, power, chance, propose, declareWar, gift, techGift, annex, aiTurn, answer, setRel, aff, aggOf, fear, get lastRipple() { return lastRipple; } };
})();
