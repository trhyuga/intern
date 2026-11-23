// ============================================================
//  参謀（オートモード）
//  参謀と方針と期間を決めると、その方針を中心に国を自動で動かす。
//  参謀（7割）と君主（3割）の能力・性格で、方針ごとの得意・不得意（S〜D）が決まり、
//  それが方針の効き目と、しくじる確率に響く。
// ============================================================
const Staff = (() => {
  const POLICIES = {
    expand:    { name: '拡張', icon: '⚔', desc: '独立惑星や弱った敵の星を攻め、領土を広げる。造艦を増やす。',
                 stat: o => o.tac * 0.55 + o.ldr * 0.45, pers: { '猛進': 12, '野心': 10, '策士': 5, '仁徳': -6, '沈着': -3 },
                 effect: '艦の火力が上がる。攻める見極めが良くなる' },
    defend:    { name: '専守防衛', icon: '🛡', desc: '国境の星に防衛衛星を築き、攻められたら迎え撃つ。自分からは攻めない。',
                 stat: o => o.ldr * 0.6 + o.pol * 0.4, pers: { '沈着': 12, '忠烈': 10, '仁徳': 3, '猛進': -10, '奔放': -6 },
                 effect: '守りの戦いで受ける被害が減る。防衛衛星が早く増える' },
    economy:   { name: '富国', icon: '💰', desc: '産業と民生を育て、余った資金を星に投じる。戦は守りだけ。',
                 stat: o => o.pol * 0.8 + o.dip * 0.2, pers: { '仁徳': 8, '沈着': 5, '策士': 3, '猛進': -8, '奔放': -4 },
                 effect: '収入と開発の速さが上がる' },
    research:  { name: '技術振興', icon: '🔬', desc: '研究の星を育て、技術を伸ばす。禁忌には手を出さない。',
                 stat: o => o.sci * 0.8 + o.pol * 0.2, pers: { '沈着': 6, '奔放': 4, '策士': 3, '猛進': -6 },
                 effect: '研究が速くなる' },
    diplomacy: { name: '和平外交', icon: '🕊', desc: '毎月使者を送り、不可侵・通商・同盟を結んでいく。大国は攻めない。',
                 stat: o => o.dip * 0.8 + o.pol * 0.2, pers: { '仁徳': 12, '策士': 8, '猛進': -12, '野心': -8 },
                 effect: '申し入れが通りやすくなる' },
    eclipse:   { name: '対蝕作戦', icon: '☄', desc: '蝕の星と裂け目の核だけを狙い、全力で攻める。',
                 stat: o => o.ldr * 0.4 + o.tac * 0.4 + o.sci * 0.2, pers: { '忠烈': 8, '沈着': 5, '猛進': 4 },
                 effect: '蝕への火力が上がる', needEclipse: true },
  };
  const GRADES = [[85, 'S'], [72, 'A'], [60, 'B'], [45, 'C'], [0, 'D']];
  const gradeOf = sc => GRADES.find(([v]) => sc >= v)[1];
  const GRADE_COL = { S: '#ffd860', A: '#7ae08a', B: '#6ad0ff', C: '#c8b8a0', D: '#ff8a7a' };

  // 方針への向き不向き（0〜100）
  function score(key, pol) {
    const P = POLICIES[pol], S = OFF[key];
    const lead = G.facs[G.player].leader;
    const L = lead && isMine(lead) ? OFF[lead] : S;
    let sc = P.stat(S) * 0.7 + P.stat(L) * 0.3;
    sc += (P.pers[S.pers] || 0) + (P.pers[L.pers] || 0) * 0.5;
    // 奔放な者は、日によって得意が変わる（名前で決まる）
    if (S.pers === '奔放') { let h = 0; for (const ch of key + pol) h = (h * 31 + ch.charCodeAt(0)) % 997; sc += (h % 21) - 10; }
    return clamp(Math.round(sc), 0, 100);
  }
  function grades(key) { const o = {}; for (const p in POLICIES) o[p] = gradeOf(score(key, p)); return o; }

  const active = () => !!(G && G.staff && G.staff.on);
  const q = () => active() ? G.staff.score / 100 : 0;
  // 方針の効き目：amp × (0.3〜1.0)
  function bonus(pol, amp) { return active() && G.staff.policy === pol ? amp * (0.3 + 0.7 * q()) : 0; }

  // AI に渡す指示
  function params() {
    const s = G.staff, k = s.score / 100, S = OFF[s.key];
    const reckless = S.pers === '猛進' ? -0.15 : S.pers === '沈着' ? 0.1 : 0;
    const base = { mistake: 0.35 * Math.pow(1 - k, 2), noForb: true };
    switch (s.policy) {
      case 'expand': return { ...base, agg: 0.92, need: 1.15 + (1 - k) * 0.5 + reckless, build: 1.25 };
      case 'defend': return { ...base, agg: 0.05, noMajors: true, noIndep: true, focus: 'def', build: 1.1, research: { def: 1.6 } };
      case 'economy': return { ...base, agg: 0.2, noMajors: true, focus: 'pop', build: 0.6, research: { eco: 1.7 } };
      case 'research': return { ...base, agg: 0.2, noMajors: true, focus: 'res', build: 0.6, research: { eng: 1.2, def: 1.1 } };
      case 'diplomacy': return { ...base, agg: 0.15, noMajors: true, build: 0.7, research: { eco: 1.3 } };
      case 'eclipse': return { ...base, agg: 0.95, onlyE: true, need: 1.1 + (1 - k) * 0.4, build: 1.4, research: { wep: 1.5, def: 1.3 } };
    }
    return base;
  }

  function start(key, policy, months, bigManual) {
    const me = G.player;
    G.staff = {
      on: true, key, policy, score: score(key, policy), from: G.turn, until: months ? G.turn + months : null, bigManual: !!bigManual,
      base: { planets: G.planets.filter(p => p.owner === me).length, funds: G.facs[me].funds, techs: G.facs[me].stats.techs, wins: G.facs[me].stats.wins, losses: G.facs[me].stats.losses, treaties: G.facs[me].stats.treaties },
      lines: [],
    };
    // 自分で出した行き先は取り消し、参謀に任せる
    G.fleets.forEach(f => { if (f.fac === me) { f.route = null; f.dest = null; } });
    Game.log(`参謀${OFF[key].name}に「${POLICIES[policy].name}」の方針を任せた。`, 'big', me);
  }
  function stop() { if (G.staff) G.staff.on = false; }

  // 自国の月の動き（AI として）
  function turnPlayer() {
    const s = G.staff;
    // 蝕が退いたら対蝕作戦はおしまい
    if (s.policy === 'eclipse' && (!G.eclipse.arrived || G.eclipse.defeated)) return;
    AI.turn(G.player, params());
    diplomacy();
    // 参謀にも武功
    Game.addMerit(s.key, 0.6);
  }
  function envoy() { return Game.officersOf(G.player).filter(k => G.officers[k].busy !== G.turn).sort((a, b) => OFF[b].dip - OFF[a].dip)[0]; }
  // 参謀の外交
  function diplomacy() {
    const me = G.player, s = G.staff, k = s.score / 100;
    const out = [];
    // 小勢力の依頼が果たせていれば盟約を結ぶ
    for (const M of MINORS) {
      const m = G.minors[M.id];
      if (m.ally === null && G.planets[M.planet].owner === M.id && Game.minorProgress(M.id, me) >= M.quest.need) { Game.minorJoin(M.id, me); out.push(`${M.name}と盟約を結んだ。`); }
    }
    const tryKinds = s.policy === 'diplomacy' ? ['ally', 'trade', 'nap', 'peace'] : s.policy === 'expand' ? ['peace'] : ['peace', 'nap', 'trade'];
    // 和平外交なら毎月、ほかの方針でもときどき
    const freq = s.policy === 'diplomacy' ? 1 : 0.25;
    // 優れた参謀は通りそうな時だけ申し入れる
    const minP = s.policy === 'diplomacy' ? 0.2 + 0.25 * k : 0.45;
    for (let b = 0; b < 6; b++) {
      if (b === me || !G.facs[b].alive || Math.random() > freq) continue;
      const r = Game.rel(me, b);
      if (r.s === 'war' && s.policy === 'expand' && G.facs[me].warWeary < 6) continue;
      for (const kind of tryKinds) {
        if (!Diplo.KINDS[kind].need.includes(r.s)) continue;
        const ev = envoy(); if (!ev) break;
        const c = Diplo.chance(me, b, kind, ev);
        if (c.p < minP) continue;
        const res = Diplo.propose(me, b, kind, ev);
        out.push(`${OFF[ev].name}を使者に、${FACTIONS[b].name}へ${Diplo.KINDS[kind].name}を申し入れた。${res.ok ? '――受け入れられた。' : '――断られた。'}`);
        break;
      }
    }
    // 和平外交：資金に余裕があれば、信頼の低い国へ贈り物
    if (s.policy === 'diplomacy' && G.facs[me].funds > 900) {
      const t = G.facs.filter(f => f.alive && f.id !== me && Game.rel(me, f.id).s !== 'ally').sort((a, b) => Game.rel(me, a.id).t - Game.rel(me, b.id).t)[0];
      if (t) { Diplo.gift(me, t.id, 200); out.push(`${FACTIONS[t.id].name}へ贈り物を届けた。`); }
    }
    out.forEach(t => Game.log(t, 'good', me));
  }
  // 他国からの申し入れに参謀が答える
  function answer(pd) {
    const s = G.staff;
    if (s.policy === 'expand') return pd.kind === 'peace' || pd.kind === 'trade';
    return true;
  }
  // 止めるべきか
  function shouldStop(info) {
    const s = G.staff;
    if (!active()) return null;
    if (s.until !== null && G.turn >= s.until) return `方針の期間（${s.until - s.from}か月）が終わりました。`;
    if (info.eclipseArrived) return '蝕が現れました。方針を見直してください。';
    if (info.capitalLost) return '首都が陥落しました。';
    if (s.policy === 'eclipse' && G.eclipse.defeated) return '蝕を退けました。対蝕作戦はここまでです。';
    const lost = s.base.planets - G.planets.filter(p => p.owner === G.player).length;
    if (lost >= 3) return `星を ${lost} つ失いました。ご判断を。`;
    return null;
  }
  // 報告のまとめ
  function summary() {
    const s = G.staff, me = G.player, f = G.facs[me];
    const pl = G.planets.filter(p => p.owner === me).length;
    const d = (a, b) => (a - b >= 0 ? '+' : '') + Math.round(a - b);
    return [
      ['経過', `${G.turn - s.from}か月`],
      ['惑星', `${pl}（${d(pl, s.base.planets)}）`],
      ['資金', `${Math.round(f.funds)}（${d(f.funds, s.base.funds)}）`],
      ['修めた技術', `${f.stats.techs - s.base.techs}`],
      ['戦い', `勝${f.stats.wins - s.base.wins}・敗${f.stats.losses - s.base.losses}`],
      ['新しい約束', `${f.stats.treaties - s.base.treaties}`],
    ];
  }
  // 参謀の一言（方針を任せた時）
  function line(key, policy) {
    const g = gradeOf(score(key, policy)), pers = OFF[key].pers;
    const byG = {
      S: '心得ました。この方針こそ、私の本領です。必ずや成果をお見せします。',
      A: 'お任せください。期待に応えてみせましょう。',
      B: '承知しました。堅実に進めます。',
      C: 'やってはみますが……あまり得意な分野ではありません。',
      D: '……正直に申し上げて、私向きの仕事ではありません。失敗しても恨まないでくださいよ。',
    };
    const byP = { '猛進': '回りくどいのは嫌いだ。', '沈着': '焦らず、一手ずつ。', '策士': '盤面はもう見えています。', '仁徳': '民のためになるよう努めます。', '野心': '手柄は、いただきますよ。', '忠烈': 'この身命を賭して。', '奔放': 'ま、なんとかなるでしょ！' };
    return byP[pers] + byG[g];
  }

  return { POLICIES, GRADE_COL, score, grades, gradeOf, active, bonus, params, start, stop, turnPlayer, answer, shouldStop, summary, line };
})();
