// ============================================================
//  参謀（オートモード）
//  参謀と方針と期間を決めると、その方針を中心に国を自動で動かす。
//  参謀（7割）と君主（3割）の能力・性格で、方針ごとの得意・不得意（S〜D）が決まり、
//  それが方針の効き目と、しくじる確率に響く。
// ============================================================
const Staff = (() => {
  const POLICIES = {
    balanced:  { name: '均衡', icon: '⚖', desc: '参謀の得意な分野を軸に、国の様子を見て毎月の重点を選び、万遍なく進める。',
                 stat: null, pers: { '沈着': 4, '策士': 3, '仁徳': 2, '奔放': -4 },
                 effect: 'その月の重点の効き目（得意な重点ほど強い）' },
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
  const SUBS = ['expand', 'defend', 'economy', 'research', 'diplomacy', 'eclipse'];
  const GRADES = [[85, 'S'], [72, 'A'], [60, 'B'], [45, 'C'], [0, 'D']];
  const gradeOf = sc => GRADES.find(([v]) => sc >= v)[1];
  const GRADE_COL = { S: '#ffd860', A: '#7ae08a', B: '#6ad0ff', C: '#c8b8a0', D: '#ff8a7a' };

  // 方針への向き不向き（0〜100）
  function score(key, pol) {
    if (pol === 'balanced') {
      const sc = SUBS.filter(p => !POLICIES[p].needEclipse).map(p => score(key, p)).sort((a, b) => b - a);
      return clamp(Math.round((sc[0] + sc[1]) / 2 + (POLICIES.balanced.pers[OFF[key].pers] || 0)), 0, 100);
    }
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
  const curPol = () => G.staff.policy === 'balanced' ? (G.staff.cur || 'economy') : G.staff.policy;
  const curK = () => (G.staff.policy === 'balanced' ? (G.staff.curScore ?? G.staff.score) : G.staff.score) / 100;
  const q = () => active() ? curK() : 0;
  // 方針の効き目：amp × (0.3〜1.0)。均衡のときは、その月の重点に少し弱めにかかる
  function bonus(pol, amp) { return active() && curPol() === pol ? amp * (0.3 + 0.7 * q()) * (G.staff.policy === 'balanced' ? 0.85 : 1) : 0; }

  // 均衡：今月の重点を選ぶ（参謀の得意 × 国の様子）
  function chooseFocus() {
    const s = G.staff, me = G.player, f = G.facs[me];
    const mine = G.planets.filter(p => p.owner === me);
    const hostile = o => o === 'E' || (Game.isMajor(o) && o !== me && Game.rel(me, o).s === 'war');
    let threat = 0;
    for (const p of mine) for (const n of Game.ADJ[p.id]) for (const fl of G.fleets) if (fl.at === n && fl.ships.length && hostile(fl.fac)) threat += Game.fleetPower(fl) > Game.planetDefense(p) * 0.8 ? 1 : 0.3;
    const myFleet = Math.max(0, ...G.fleets.filter(x => x.fac === me).map(x => Game.fleetPower(x)));
    const targets = mine.some(p => Game.ADJ[p.id].some(n => { const q2 = G.planets[n]; return !Game.friendly(me, q2.owner) && Game.canAttack(me, q2.owner) && q2.owner !== 'E' && Game.planetDefense(q2) * 1.3 < myFleet; }));
    const stab = mine.reduce((a, p) => a + p.stab, 0) / Math.max(1, mine.length);
    const e = Game.economy(me), poor = f.funds < 150 && e.inc - e.up < 60;
    const wars = G.facs.filter(x => x.alive && x.id !== me && Game.rel(me, x.id).s === 'war').length;
    const unsigned = G.facs.filter(x => x.alive && x.id !== me && ['neutral', 'nap'].includes(Game.rel(me, x.id).s)).length;
    const why = {
      expand: targets ? '攻め取れる星がある' : '領土を広げる好機を探る',
      defend: threat ? '国境に敵の艦隊が迫っている' : '守りを固める',
      economy: poor ? '資金が乏しい' : stab < 50 ? '民心が揺らいでいる' : '国力を蓄える',
      research: '技術で先んじる',
      diplomacy: wars && f.warWeary > 3 ? '長引く戦を収める' : '味方を増やす',
      eclipse: '蝕を討つ',
    };
    const need = {
      expand: (targets ? 1.3 : 0.25) * (threat ? 0.4 : 1),
      defend: threat ? 1.2 + threat * 0.8 : 0.35,
      economy: poor || stab < 50 ? 1.7 : 1,
      research: 1,
      diplomacy: wars && f.warWeary > 3 ? 1.7 : unsigned ? 0.9 : 0.4,
      eclipse: Eclipse.active() ? 3 : 0,
    };
    let best = null, bv = -1;
    const w = {};
    for (const p of SUBS) {
      const sc = score(s.key, p) / 100;
      let v = need[p] * Math.pow(sc, 1.6);       // 得意なほど選ばれやすい
      if (p === s.cur) v *= s.curRun >= 4 ? 0.45 : 1.2;   // 続けすぎない・すぐ変えすぎない
      // しばらく手をつけていない分野にも目を配る
      s.last = s.last || {};
      const since = G.turn - (s.last[p] ?? s.from);
      if (p !== s.cur) v *= 1 + Math.min(0.9, since * 0.07);
      v *= 0.85 + Math.random() * 0.3;
      w[p] = v;
      if (v > bv) { bv = v; best = p; }
    }
    if (best !== s.cur) { s.cur = best; s.curRun = 1; } else s.curRun = (s.curRun || 0) + 1;
    s.last = s.last || {}; s.last[best] = G.turn;
    s.curScore = score(s.key, best);
    s.curWhy = why[best];
    return best;
  }

  // AI に渡す指示
  function params() {
    const s = G.staff, k = curK(), S = OFF[s.key];
    const reckless = S.pers === '猛進' ? -0.15 : S.pers === '沈着' ? 0.1 : 0;
    const base = { mistake: 0.35 * Math.pow(1 - k, 2), noForb: true };
    switch (curPol()) {
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
    // 参謀に任じられた挨拶（作戦室の最初に出る）
    const v = People.voice(key, 'staff'); if (v) WarRoom.say(key, v, 'happy');
  }
  function stop() { if (G.staff) G.staff.on = false; }

  // 呼びかけ：君主には敬称、司令には「提督」
  const HONOR = { 0: '陛下', 1: '首相閣下', 2: '総裁', 3: '聖女様', 4: '盟主', 5: '統括知性' };
  function callName(k, role) {
    if (Game.isLeader(k)) return HONOR[G.officers[k].fac] || shortName(OFF[k]);
    return shortName(OFF[k]) + (role === 'fleet' ? '提督' : role === 'gov' ? '総督' : '');
  }
  // 相手への言葉づかい：君主には最上の敬語、参謀より階級が上の士官には丁寧に、ほかは命令口調
  //  0 = 命令（〜せよ）／1 = 丁寧（〜していただけますか）／2 = 君主へ（〜をお願い申し上げます）
  function tone(k) {
    if (!k || k === G.staff.key) return 0;
    if (Game.isLeader(k)) return 2;
    return Game.rankIdx(k) > Game.rankIdx(G.staff.key) ? 1 : 0;
  }
  const T3 = (k, a, b, c) => [a, b, c][tone(k)];
  // 自国の月の動き（AI として）
  function turnPlayer() {
    const s = G.staff, me = G.player, f = G.facs[me];
    s.month = [];
    s.fundsBefore = f.funds;
    WarRoom.head(`― ${Game.dateStr()} ―`);
    // 参謀の人柄が出る、月のはじめの一言
    if (Math.random() < 0.55) { const v = People.voice(s.key, 'month'); if (v) WarRoom.say(s.key, v, 'normal'); }
    if (s.policy === 'balanced') {
      const prev = s.cur, p = chooseFocus(), P = POLICIES[p];
      s.month.push(`今月の重点は${P.icon}${P.name}（${s.curWhy}・得意${gradeOf(s.curScore)}）${prev && prev !== p ? `。${POLICIES[prev].name}から切り替えた` : ''}。`);
      WarRoom.say(s.key, prev && prev !== p ? `${s.curWhy}。今月は${P.name}に重点を移します。` : `${s.curWhy}。引き続き${P.name}を進めます。`, 'normal');
    } else {
      const P = POLICIES[s.policy];
      WarRoom.say(s.key, `今月も方針どおり、${P.name}を進めます。`, 'normal');
    }
    // 蝕が退いたら対蝕作戦はおしまい
    if (s.policy === 'eclipse' && !G.planets.some(p => p.owner === 'E' && (!p.abyss || G.facs[G.player].sealed))) { s.month.push('対蝕作戦の相手がいません。'); return; }
    // 動く前の様子
    const mine = G.planets.filter(p => p.owner === me);
    const before = new Map(mine.map(p => [p.id, { focus: p.focus, prog: p.prog, build: p.build.length }]));
    const offBefore = new Set(Game.officersOf(me));
    const resBefore = f.researching;
    const destBefore = new Map(G.fleets.filter(x => x.fac === me).map(x => [x.id, x.dest]));
    const govBefore = new Map(mine.map(p => [p.id, p.gov]));
    const cmdBefore = new Map(G.fleets.filter(x => x.fac === me).map(x => [x.id, x.cmd]));
    // 登用の試み（AI から知らされる）
    const recruits = [];
    AI.hook = (kind, k, ok) => { if (kind === 'recruit') recruits.push([k, ok]); };
    AI.turn(me, params());
    AI.hook = null;
    policyWork();
    // ---- 作戦室：命令と返事 ----
    const loud = WarRoom, reply = WarRoom.reply;
    // 艦隊
    for (const x of G.fleets.filter(x => x.fac === me && x.dest !== null && x.dest !== undefined && destBefore.get(x.id) !== x.dest)) {
      const to = G.planets[x.dest], hostile = !Game.friendly(me, to.owner);
      const hurt = x.ships.reduce((a, sh) => a + sh.hp / Game.shipMaxHp(sh), 0) / Math.max(1, x.ships.length) < 0.6;
      const kind = hostile ? 'attack' : hurt && to.yard ? 'repair' : 'move';
      const pol = tone(x.cmd) > 0;
      const intel = to.owner === null ? (pol ? '独立惑星です。衛星を落とせば、我らのものになります。' : '独立惑星だ。衛星を落とせば我らのものになる。')
        : `${Game.ownerName(to.owner)}の守りは${Math.round(Game.planetDefense(to))}ほど、こちらは${Math.round(Game.fleetPower(x))}${pol ? 'です' : ''}。`;
      if (x.cmd === s.key) {
        // 参謀が自ら艦隊を率いる
        loud.say(s.key, kind === 'attack' ? `私が自ら艦隊を率いて${to.name}を攻める。${intel}` : kind === 'repair' ? `私の艦隊は${to.name}で修理に入る。` : `私の艦隊は${to.name}へ移って備える。`, kind === 'attack' ? 'angry' : 'normal', to.id);
      } else {
        const nm = x.cmd ? callName(x.cmd, 'fleet') : '艦隊';
        const k2 = x.cmd;
        const tl = k2 ? People.staffLine(s.key, k2) : null;
        if (tl) loud.say(s.key, tl, 'normal', to.id);
        loud.say(s.key, kind === 'attack' ? `${nm}、${T3(k2, `${to.name}を攻略せよ。`, `${to.name}の攻略をお願いできますか。`, `${to.name}の攻略を、お願い申し上げます。`)}${intel}`
          : kind === 'repair' ? `${nm}、${T3(k2, `${to.name}の造船所で艦を直してくれ。`, `${to.name}の造船所で、艦を直していただけますか。`, `${to.name}の造船所にて、艦の修理をお願い申し上げます。`)}`
          : `${nm}、${T3(k2, `${to.name}へ移って備えよ。`, `${to.name}へ移って備えていただけますか。`, `${to.name}へお移りいただき、お備えくださいますよう。`)}`, 'normal', to.id);
        if (x.cmd) loud.say(x.cmd, reply(kind, x.cmd, to.name), kind === 'attack' ? 'angry' : 'normal', to.id);
      }
      loud.order(`${Game.fleetName(x)}（${x.ships.length}隻）→ ${to.name}${kind === 'attack' ? '（攻撃）' : kind === 'repair' ? '（修理）' : '（移動）'}`, to.id);
      x.lastOrder = { kind, to: to.id, t: G.turn };
    }
    // 艦隊の新設・司令の任命
    for (const x of G.fleets.filter(x => x.fac === me && x.cmd && cmdBefore.get(x.id) !== x.cmd)) {
      if (x.cmd === s.key) loud.say(s.key, `${G.planets[x.at].name}の艦${x.ships.length}隻は、私が率いる。`, 'normal', x.at);
      else { loud.say(s.key, `${callName(x.cmd)}、${G.planets[x.at].name}の艦${x.ships.length}隻を${T3(x.cmd, '率いてくれ。', '率いていただけますか。', 'お率いくださいますよう、お願い申し上げます。')}`, 'normal', x.at); loud.say(x.cmd, reply('command', x.cmd, G.planets[x.at].name), 'happy', x.at); }
      loud.order(`${OFF[x.cmd].name}を艦隊司令に（${G.planets[x.at].name}・${x.ships.length}隻）`, x.at);
    }
    // 星：重点・総督・発注
    for (const p of mine) {
      const b = before.get(p.id); if (!b || p.owner !== me) continue;
      if (p.gov && govBefore.get(p.id) !== p.gov) {
        if (p.gov === s.key) loud.say(s.key, `${p.name}の統治は、私が兼ねます。`, 'normal', p.id);
        else { loud.say(s.key, `${callName(p.gov)}、${p.name}の${T3(p.gov, '総督を任せたい。', '総督をお願いできますか。', '統治を、お願い申し上げます。')}`, 'normal', p.id); loud.say(p.gov, reply('appoint', p.gov, p.name), 'happy', p.id); }
        loud.order(`${OFF[p.gov].name}を${p.name}の総督に`, p.id);
      }
      if (p.focus !== b.focus) {
        const polite = p.gov && p.gov !== s.key && tone(p.gov) > 0;
        const why = (polite ? { ind: '産業を伸ばして、財源を厚くいたします', res: '研究所を増やしてまいります', def: '敵に備え、防衛衛星を増やします', yard: '造船所を整えます', pop: '民の暮らしを立て直します' }
          : { ind: '産業を伸ばして財源を厚くする', res: '研究所を増やす', def: '敵に備えて防衛衛星を増やす', yard: '造船所を整える', pop: '民の暮らしを立て直す' })[p.focus];
        loud.say(s.key, `${p.name}は${why}。${p.gov && p.gov !== s.key ? callName(p.gov, 'gov') + '、' + T3(p.gov, '頼む。', 'よろしくお願いします。', 'よろしくお願い申し上げます。') : ''}`, 'normal', p.id);
        if (p.gov && p.gov !== s.key) loud.say(p.gov, reply('govern', p.gov, p.name), 'normal', p.id);
        loud.order(`${p.name}：重点を${Game.FOCUS[p.focus]}へ`, p.id);
        if (p.focus !== 'pop') loud.pend(`${p.name}の${Game.FOCUS[p.focus]}が`, `${p.name}の重点を${Game.FOCUS[p.focus]}へ`, p.id);
      }
      if (p.prog - b.prog >= 59 && p.focus === b.focus) loud.order(`${p.name}の${Game.FOCUS[p.focus]}開発に資金${Game.investCost(p)}ほどを投資`, p.id);
      if (p.build.length > b.build) p.build.slice(b.build).forEach(x => {
        const dn = G.designs[x.d].name;
        loud.order(`${p.name}の造船所に「${dn}」を発注（${x.left}か月）`, p.id);
        loud.pend(`${p.name}で ${dn} が竣工`, `${p.name}に「${dn}」を発注`, p.id);
      });
    }
    if (f.researching !== resBefore) {
      const rt = Game.researchTarget(f);
      const sci = Game.officersOf(me).sort((a, b) => OFF[b].sci - OFF[a].sci)[0];
      loud.say(s.key, `研究は${rt.name}を優先させましょう。${rt.gain ? '完成すれば、' + rt.gain + 'です。' : ''}`, 'normal');
      if (sci && sci !== s.key) loud.say(sci, reply('research', sci, rt.short || rt.name), 'normal');
      loud.order(`研究：${rt.name}（${Math.floor(f.rp)} / ${rt.cost}）`);
      loud.pend(`技術 ${rt.name}`, `研究 ${rt.name}`, null);
    }
    // 登用
    for (const [k, ok] of recruits) {
      const o = G.officers[k], at = o.loc;
      const rb = People.recruitBonus(k);
      if (rb.who && rb.who.k !== s.key) loud.say(rb.who.k, rb.who.line, 'normal', at);
      else loud.say(s.key, `${OFF[k].name}${WarRoom.pickL(WarRoom.RECRUIT.ask)}`, 'normal', at);
      loud.say(k, People.voice(k, ok ? 'join' : 'refuse') || WarRoom.pickL(ok ? WarRoom.RECRUIT.yes : WarRoom.RECRUIT.no), ok ? 'happy' : 'normal', at);
      loud.result(ok ? `${OFF[k].name}（${OFF[k].epi}）が仕官した` : `${OFF[k].name}に断られた（支度金100は戻らない）`, ok, at);
    }
    diplomacy();
    // 動いた後と比べて、したことを書く
    for (const p of mine) {
      const b = before.get(p.id); if (!b || p.owner !== me) continue;
      if (p.focus !== b.focus) s.month.push(`${p.name}の重点を${Game.FOCUS[p.focus]}に切り替えた。`);
      if (p.prog - b.prog >= 59 && p.focus === b.focus) s.month.push(`${p.name}の${Game.FOCUS[p.focus]}開発に資金を投じた。`);
      if (p.build.length > b.build) p.build.slice(b.build).forEach(x => s.month.push(`${p.name}で${G.designs[x.d].name}を発注した。`));
    }
    Game.officersOf(me).filter(k => !offBefore.has(k)).forEach(k => s.month.push(`${OFF[k].name}を登用した。`));
    if (f.researching !== resBefore) s.month.push(`研究を${Game.researchTarget(f).name}に切り替えた。`);
    G.fleets.filter(x => x.fac === me && x.dest !== null && x.dest !== undefined && destBefore.get(x.id) !== x.dest).forEach(x => s.month.push(`${Game.fleetName(x)}を${G.planets[x.dest].name}へ向かわせた。`));
    // 参謀にも武功
    Game.addMerit(s.key, 0.6);
  }
  // 方針ごとの、目に見える仕事
  function policyWork() {
    const s = G.staff, me = G.player, f = G.facs[me], k = s.score / 100;
    const reserve = 300;
    if (curPol() === 'economy') {
      // 余った資金を、人口の多い星の開発に投じる（得意なほど多くの星へ）
      const n = 1 + Math.round(2 * k);
      const ps = G.planets.filter(p => p.owner === me && p.focus !== 'pop' && (p[p.focus] || 0) < Game.devCap(p, p.focus)).sort((a, b) => b.pop - a.pop);
      let done = 0;
      for (const p of ps) { if (done >= n || f.funds - Game.investCost(p) < reserve) break; if (Game.invest(p.id)) done++; }
    }
    if (curPol() === 'research') {
      // 研究の星に投資し、残りを研究費に回す
      const rp = G.planets.filter(p => p.owner === me && p.focus === 'res' && p.res < Game.devCap(p, 'res')).sort((a, b) => b.pop - a.pop)[0];
      if (rp && f.funds - Game.investCost(rp) >= reserve) Game.invest(rp.id);
      const amt = Math.floor(Math.min(f.funds - reserve, 150 + 150 * k) / 50) * 50;
      if (amt >= 50) { const v = Game.researchGrant(me, amt, 0.5 + 0.3 * k); if (v) { s.month.push(`研究費として資金${amt}を投じた（研究 +${v}）。`); WarRoom.order(`研究費として資金${amt}を投入`); WarRoom.result(`研究 +${v}`, true); } }
    }
  }
  // 月の要約（いつも出す）
  function monthLine() {
    const me = G.player, f = G.facs[me], e = Game.economy(me), rt = Game.researchTarget(f);
    const delta = G.staff && G.staff.fundsBefore !== undefined ? Math.round(f.funds - G.staff.fundsBefore) : e.inc - e.up;
    // 次に上がりそうな開発
    let next = null;
    for (const p of G.planets) {
      if (p.owner !== me || p.focus === 'pop' || (p[p.focus] || 0) >= Game.devCap(p, p.focus)) continue;
      const m = Math.max(1, Math.ceil((100 - p.prog) / Math.max(1, Game.devSpeed(p))));
      if (!next || m < next.m) next = { p, m };
    }
    return `資金 ${Math.round(f.funds).toLocaleString()}（${delta >= 0 ? '+' : ''}${delta}）・研究 ${rt.name} ${Math.min(100, Math.floor(f.rp / rt.cost * 100))}%`
      + (next ? `・次は${next.p.name}の${Game.FOCUS[next.p.focus]}Lv${(next.p[next.p.focus] || 0) + 1}（あと${next.m}か月）` : '');
  }
  function envoy() { return Game.officersOf(G.player).filter(k => G.officers[k].busy !== G.turn).sort((a, b) => OFF[b].dip - OFF[a].dip)[0]; }
  // 参謀の外交
  function diplomacy() {
    const me = G.player, s = G.staff, k = curK(), pol = curPol();
    const out = [];
    // 小勢力の依頼が果たせていれば盟約を結ぶ
    for (const M of MINORS) {
      const m = G.minors[M.id];
      if (m.ally === null && G.planets[M.planet].owner === M.id && Game.minorProgress(M.id, me) >= M.quest.need) { Game.minorJoin(M.id, me); out.push(`${M.name}と盟約を結んだ。`); WarRoom.say(s.key, `${M.name}の依頼は果たしました。盟約を結びましょう。`, 'happy', M.planet); WarRoom.result(`${M.name}と盟約を結んだ（${M.reward}）`, true, M.planet); }
    }
    const tryKinds = pol === 'diplomacy' ? ['ally', 'trade', 'nap', 'peace'] : pol === 'expand' ? ['peace'] : ['peace', 'nap', 'trade'];
    // 和平外交なら毎月、ほかの方針でもときどき
    const freq = pol === 'diplomacy' ? 1 : s.policy === 'balanced' ? 0.35 : 0.25;
    // 優れた参謀は通りそうな時だけ申し入れる
    const minP = pol === 'diplomacy' ? 0.2 + 0.25 * k : 0.45;
    for (let b = 0; b < 6; b++) {
      if (b === me || !G.facs[b].alive || Math.random() > freq) continue;
      const r = Game.rel(me, b);
      if (r.s === 'war' && pol === 'expand' && G.facs[me].warWeary < 6) continue;
      for (const kind of tryKinds) {
        if (!Diplo.KINDS[kind].need.includes(r.s)) continue;
        const ev = envoy(); if (!ev) break;
        const c = Diplo.chance(me, b, kind, ev);
        if (c.p < minP) continue;
        const pc = Math.round(c.p * 100), KN = Diplo.KINDS[kind].name;
        WarRoom.say(s.key, ev === s.key ? `私が${FACTIONS[b].name}へ使者に立ちます。${KN}を申し入れます。見込みは${pc}%です。`
          : `${callName(ev)}、${FACTIONS[b].name}へ${T3(ev, `使者に立ってくれ。${KN}を申し入れる。見込みは${pc}%だ。`, `使者に立っていただけますか。${KN}を申し入れます。見込みは${pc}%です。`, `御自ら使者にお立ちいただけますでしょうか。${KN}を申し入れます。見込みは${pc}%にございます。`)}`, 'normal', G.facs[b].capital);
        WarRoom.order(`使者${OFF[ev].name} → ${FACTIONS[b].name}：${Diplo.KINDS[kind].name}`, G.facs[b].capital);
        if (ev !== s.key) WarRoom.say(ev, reply('envoy', ev, FACTIONS[b].name), 'normal', G.facs[b].capital);
        WarRoom.say(ev, WarRoom.DIPLO.ask[kind], 'normal', G.facs[b].capital);
        const res = Diplo.propose(me, b, kind, ev);
        const lead = G.facs[b].leader;
        if (lead && G.officers[lead] && G.officers[lead].fac === b) WarRoom.say(lead, (res.ok ? WarRoom.DIPLO.yes : WarRoom.DIPLO.no)[kind], res.ok ? 'happy' : 'angry', G.facs[b].capital);
        WarRoom.result(`${FACTIONS[b].name}との${Diplo.KINDS[kind].name}：${res.ok ? '成立' : '不成立'}`, res.ok, G.facs[b].capital);
        if (res.ok && Diplo.lastRipple) Diplo.lastRipple.forEach(t => WarRoom.result(t, false));
        out.push(`${OFF[ev].name}を使者に、${FACTIONS[b].name}へ${Diplo.KINDS[kind].name}を申し入れた。${res.ok ? '――受け入れられた。' : '――断られた。'}`);
        break;
      }
    }
    // 和平外交：資金に余裕があれば、信頼の低い国へ贈り物
    if (pol === 'diplomacy' && G.facs[me].funds > 900) {
      const t = G.facs.filter(f => f.alive && f.id !== me && Game.rel(me, f.id).s !== 'ally').sort((a, b) => Game.rel(me, a.id).t - Game.rel(me, b.id).t)[0];
      if (t) { Diplo.gift(me, t.id, 200); out.push(`${FACTIONS[t.id].name}へ贈り物を届けた。`); WarRoom.order(`${FACTIONS[t.id].name}へ贈り物（資金200）`, G.facs[t.id].capital); WarRoom.result(`${FACTIONS[t.id].name}の信頼が上がった（いま ${Math.round(Game.rel(me, t.id).t)}）`, true, G.facs[t.id].capital); }
    }
    out.forEach(t => Game.log(t, 'good', me));
  }
  // 他国からの申し入れに参謀が答える
  function answer(pd) {
    const s = G.staff;
    if (curPol() === 'expand') return pd.kind === 'peace' || pd.kind === 'trade';
    return true;
  }
  // 止めるべきか
  function shouldStop(info) {
    const s = G.staff;
    if (!active()) return null;
    if (s.until !== null && G.turn >= s.until) return `方針の期間（${s.until - s.from}か月）が終わりました。`;
    if (info.eclipseArrived && s.policy !== 'balanced') return '蝕が現れました。方針を見直してください。';
    if (info.capitalLost) return '首都が陥落しました。';
    if (s.policy === 'eclipse' && !G.planets.some(p => p.owner === 'E' && (!p.abyss || G.facs[G.player].sealed))) return G.eclipse.defeated ? '蝕を根から絶ちました。対蝕作戦はここまでです。' : '蝕は退きました。いまは攻める相手がいません。';
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
    if (policy === 'balanced') {
      const top = SUBS.filter(p => !POLICIES[p].needEclipse).sort((a, b) => score(key, b) - score(key, a)).slice(0, 2).map(p => POLICIES[p].name);
      byG.S = byG.A = `${top.join('と')}を軸に、国の様子を見ながら万遍なく進めます。`;
    }
    const byP = { '猛進': '回りくどいのは嫌いだ。', '沈着': '焦らず、一手ずつ。', '策士': '盤面はもう見えています。', '仁徳': '民のためになるよう努めます。', '野心': '手柄は、いただきますよ。', '忠烈': 'この身命を賭して。', '奔放': 'ま、なんとかなるでしょ！' };
    return byP[pers] + byG[g];
  }

  return { POLICIES, SUBS, curPol, GRADE_COL, score, grades, gradeOf, active, bonus, params, start, stop, turnPlayer, answer, shouldStop, summary, line, monthLine };
})();
