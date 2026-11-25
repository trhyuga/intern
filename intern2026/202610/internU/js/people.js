// ============================================================
//  人物・関係・物語のエンジン
//  データは js/people/*.js が PEOPLE.add / PEOPLE.ties / PEOPLE.events / NATIONS.add で登録する
//  - 人物：一人称・経歴・場面ごとの返事（voice）・個人の物語（arc）
//  - 関係：同じ国の時の会話（3段階）、敵・戦場・参謀・捕縛・死・追憶の一言、能力への効き目
//  - 国の幕間・国家間の出来事
// ============================================================
const PEOPLE = (() => {
  const P = {}, TIES = [], EVS = [], MAIN = [];
  return {
    P, TIES, EVS, MAIN,
    // メインストーリー：連なる出来事の列（chain ごと）。前の出来事を終えると次が起こる
    main: (chain, list) => list.forEach((ev, i) => MAIN.push(Object.assign({ chain, idx: i }, ev))),
    add: o => Object.assign(P, o),
    ties: a => TIES.push(...a),
    events: a => EVS.push(...a),
  };
})();
const NATIONS = (() => { const L = []; return { L, add: a => L.push(...a) }; })();

const People = (() => {
  const HONOR = { 0: '陛下', 1: '首相閣下', 2: '総裁', 3: '聖女様', 4: '盟主', 5: '統括知性' };
  const STATS = ['ldr', 'tac', 'pol', 'dip', 'sci'];
  const KIND_NAME = { bond: '絆', love: '想い人', family: '家族', mentor: '師弟', rival: '好敵手', grudge: '遺恨' };
  const WARM = new Set(['bond', 'love', 'family', 'mentor']);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const pk = (a, b) => [a, b].sort().join('|');
  const st = k => G.officers[k] ? G.officers[k].st : null;
  const mine = k => typeof isMine === 'function' && isMine(k);
  const foe = k => { const o = G.officers[k]; return !!o && o.st === 'act' && Game.isMajor(o.fac) && o.fac !== G.player; };

  // ---------- 関係の一覧（PEOPLE の関係に、昔の OFFICER_TIES のうち書かれていない組を足す） ----------
  let ALL = null;
  function all() {
    if (ALL) return ALL;
    const seen = new Set();
    ALL = [];
    for (const t of PEOPLE.TIES) { if (!OFF[t.a] || !OFF[t.b]) continue; const k = pk(t.a, t.b); if (seen.has(k)) continue; seen.add(k); ALL.push(t); }
    for (const [a, b, kind, desc] of OFFICER_TIES) {
      if (seen.has(pk(a, b))) continue; seen.add(pk(a, b));
      ALL.push({ a, b, kind, label: kind === 'bond' ? '絆' : '宿敵', desc, talk: null, lines: null });
    }
    return ALL;
  }
  const tiesOf = k => all().filter(t => t.a === k || t.b === k);
  const tie = (a, b) => all().find(t => (t.a === a && t.b === b) || (t.a === b && t.b === a)) || null;
  const other = (t, k) => t.a === k ? t.b : t.a;
  const side = (t, k) => t.a === k ? 'a' : 'b';
  function state(t) {
    G.ties = G.ties || {};
    const k = pk(t.a, t.b);
    return G.ties[k] || (G.ties[k] = { stage: 0, last: -99, met: false, mem: 0, memT: 0, mourned: false, cap: 0 });
  }
  // 場面ごとの一言（無ければ、関係の種類ごとの言葉）
  const GEN = {
    enemy: { warm: '{o}が、敵の旗の下に……。できれば、戦いたくはない。', rival: '{o}が出てきたか。……面白い。', grudge: '{o}……。あいつだけは、許さない。' },
    battle: { warm: '{o}、すまない。ここは退けないんだ。', rival: '来い、{o}！ 決着をつけよう！', grudge: '{o}！ 今日こそ、借りを返す！' },
    ally: { warm: '{o}が一緒なら、心強い。', rival: '{o}に後れを取るわけにはいかないな。', grudge: '{o}と肩を並べるとはな。……足を引っ張るなよ。' },
    staff: { warm: '{o}、頼りにしている。', rival: '{o}、お前の腕を見せてもらおう。', grudge: '{o}、私情は挟まない。命令だ。' },
    order: { warm: '任せて。あなたの頼みなら。', rival: 'ふん、言われなくてもやってやる。', grudge: '……命令なら、従う。' },
    capture: { warm: '{o}が捕らわれた……！ 必ず、取り戻す。', rival: '{o}が捕まっただと？ 決着もつけずに……。', grudge: '{o}が捕らわれたか。……知ったことではない。' },
    death: { warm: '{o}……。どうして、あなたが。', rival: '{o}が死んだ……？ 勝ち逃げは許さないと言ったはずだ。', grudge: '{o}が死んだか。……これで、何もかも終わったのか。' },
    recruit: { warm: '{o}、こちらへ来てくれないか。また一緒に。', rival: '{o}、敵として戦うより、同じ旗の下で競わないか。', grudge: '{o}。過去はともかく、今はお前の力が要る。' },
    reunion: { warm: 'また会えたね、{o}。', rival: '{o}と同じ旗の下か。悪くない。', grudge: '……{o}か。' },
    memory: { warm: '{o}がいれば、何と言っただろう。', rival: '{o}なら、ここでどう攻めたか……。', grudge: '{o}のことを、時々思い出す。妙なものだ。' },
  };
  function line(t, kind, speaker) {
    const s = side(t, speaker), o = OFF[other(t, speaker)];
    const L = t.lines && t.lines[kind] && t.lines[kind][s];
    const g = GEN[kind] && GEN[kind][WARM.has(t.kind) ? 'warm' : t.kind];
    return sub(L || g || '', { o: o ? shortName(o) : '' });
  }

  // ---------- 文の置き換え ----------
  function sub(text, x = {}) {
    if (!text) return text;
    const me = G.player, lead = G.facs && G.facs[me] ? G.facs[me].leader : null;
    return text.replace(/\{honor\}/g, HONOR[me] || '閣下').replace(/\{faction\}/g, FACTIONS[me] ? FACTIONS[me].name : '')
      .replace(/\{leader\}/g, lead && OFF[lead] ? shortName(OFF[lead]) : '')
      .replace(/\{target\}/g, x.target !== undefined && x.target !== null ? x.target : 'そこ').replace(/\{o\}/g, x.o || '');
  }

  // ---------- 人物の言葉（コマンドへの返事など） ----------
  const prof = k => PEOPLE.P[k] || null;
  function voice(k, kind, target) {
    const p = prof(k);
    const list = p && p.voice && p.voice[kind];
    return list && list.length ? sub(pick(list), { target }) : null;
  }
  // 命令への返事：忠誠が低いとしぶしぶ、絆や遺恨のある参謀からの命令には関係の言葉
  function reply(kind, k, target) {
    const o = G.officers[k];
    if (o && o.loyal < 35 && !Game.isLeader(k)) { const v = voice(k, 'lowloyal', target); if (v) return v; }
    const s = G.staff && G.staff.on ? G.staff.key : null;
    if (s && s !== k && Math.random() < 0.35) { const t = tie(s, k); if (t) return line(t, 'order', k); }
    if (Math.random() < 0.8) { const v = voice(k, kind, target); if (v) return v; }
    return null;
  }
  // 参謀が命令を出す時の、関係を踏まえた呼びかけ（無ければ null）
  function staffLine(staff, k) {
    if (!staff || staff === k || Math.random() > 0.5) return null;
    const t = tie(staff, k); return t ? line(t, 'staff', staff) : null;
  }

  // ---------- 能力の上乗せ（出来事で変わった分） ----------
  function applyStats() {
    for (const k in OFF) {
      const S = OFF[k];
      if (!S._base) S._base = Object.fromEntries(STATS.map(s => [s, S[s]]));
      const b = (G && G.officers[k] && G.officers[k].bonus) || {};
      STATS.forEach(s => { S[s] = clamp(Math.round(S._base[s] + (b[s] || 0)), 1, 120); });
    }
  }
  function addStat(k, s, n) {
    const o = G.officers[k]; if (!o || !STATS.includes(s)) return;
    o.bonus = o.bonus || {}; o.bonus[s] = (o.bonus[s] || 0) + n;
    applyStats();
  }
  // 新しいゲーム・読み込みの後
  function init() {
    applyStats();
    G.ties = G.ties || {};
    // 最初から同じ国にいる組は「もう知り合い」
    for (const t of all()) { const s = state(t); if (G.turn <= 1 && mine(t.a) && mine(t.b)) { s.met = true; s.last = 0; } }
    G.natSnap = G.natSnap || null;
    G.natDone = G.natDone || {};
  }

  // ---------- 条件と効果（宣言的なデータを読む） ----------
  function cond(c, ctx = {}) {
    if (!c) return true;
    const me = G.player, f = G.facs[me];
    if (c.fac !== undefined && c.fac !== me) return false;
    if (c.turn !== undefined && G.turn < c.turn) return false;
    if (c.with && !c.with.every(mine)) return false;
    if (c.notWith && c.notWith.some(mine)) return false;
    if (c.foe && !c.foe.every(foe)) return false;
    if (c.dead && !c.dead.every(k => st(k) === 'dead')) return false;
    if (c.alive && !c.alive.every(k => st(k) && st(k) !== 'dead')) return false;
    if (c.rank && !Object.entries(c.rank).every(([k, n]) => G.officers[k] && Game.rankIdx(k) >= n)) return false;
    if (c.wins !== undefined && f.stats.wins < c.wins) return false;
    if (c.planets !== undefined && G.planets.filter(p => p.owner === me).length < c.planets) return false;
    if (c.flag && !G.flags[c.flag]) return false;
    if (c.noFlag && G.flags[c.noFlag]) return false;
    if (c.after && !G.evDone[c.after]) return false;
    const relS = x => (x === me || !G.facs[x] || !G.facs[x].alive) ? null : Game.rel(me, x).s;
    if (c.war !== undefined && relS(c.war) !== 'war') return false;
    if (c.ally !== undefined && relS(c.ally) !== 'ally') return false;
    if (c.peace !== undefined && (relS(c.peace) === null || relS(c.peace) === 'war')) return false;
    if (c.omen !== undefined && !((G.eclipse.omen || 0) >= c.omen || G.eclipse.arrived)) return false;
    if (c.eclipse === true && !G.eclipse.arrived) return false;
    if (c.eclipse === false && G.eclipse.arrived) return false;
    // 国内の派閥：主導する派閥・支持の強さ
    if (c.ruling && f.ruling !== c.ruling) return false;
    if (c.notRuling && f.ruling === c.notRuling) return false;
    if (c.partyMin && !Object.entries(c.partyMin).every(([p, n]) => (f.parties[p] || 0) >= n)) return false;
    if (c.partyMax && !Object.entries(c.partyMax).every(([p, n]) => (f.parties[p] || 0) <= n)) return false;
    // 蝕の段階（そこまで進んだら）
    if (c.ecl) { const ok = { omen1: G.flags.omen1, omen2: G.flags.omen2, first: G.flags.eclipse, lull: G.flags.eclipseLull, great: G.flags.eclipseGreat, recede: G.flags.eclipseRecede, ret: G.flags.eclipseRet, key: G.flags.myKey || G.flags.towerKey, seal: f.sealed, abyss: G.flags.abyss, solved: G.flags.eclipseDown }[c.ecl]; if (!ok) return false; }
    // 小勢力
    if (c.minorAlly && !(G.minors[c.minorAlly] && G.minors[c.minorAlly].ally === me)) return false;
    if (c.minorOther && !(G.minors[c.minorOther] && G.minors[c.minorOther].ally !== null && G.minors[c.minorOther].ally !== me)) return false;
    if (c.minorFree && !(G.minors[c.minorFree] && G.minors[c.minorFree].ally === null && G.planets[MINORS.find(m => m.id === c.minorFree).planet].owner === c.minorFree)) return false;
    if (c.minorGone && G.planets[MINORS.find(m => m.id === c.minorGone).planet].owner === c.minorGone) return false;
    if (c.anyFlag && !c.anyFlag.some(x => G.flags[x])) return false;
    if (c.chance !== undefined && Math.random() > c.chance) return false;
    return true;
  }
  function fx(x, ctx = {}) {
    if (!x) return;
    if (x.loyal) Object.entries(x.loyal).forEach(([k, n]) => FX.loyal(k, n));
    if (x.stat) Object.entries(x.stat).forEach(([k, v]) => Object.entries(v).forEach(([s, n]) => addStat(k, s, n)));
    if (x.merit) Object.entries(x.merit).forEach(([k, n]) => G.officers[k] && Game.addMerit(k, n));
    if (x.stab) FX.stab(x.stab);
    if (x.funds) FX.funds(x.funds);
    if (x.rp) FX.rp(x.rp);
    if (x.party) Object.entries(x.party).forEach(([p, n]) => FX.party(p, n));
    if (x.trust) Object.entries(x.trust).forEach(([f, n]) => { const fid = f === 'other' ? ctx.other : +f; if (fid !== undefined && fid !== null && !isNaN(fid)) FX.trust(fid, n); });
    if (x.flag) [].concat(x.flag).forEach(f => FX.flag(f));
  }
  // 宣言的な出来事を、Story.play が読める形にする
  function wrap(ev, ctx = {}, extra = {}) {
    const lines = sc => (sc || []).map(([w, e, t]) => [w, e, sub(t, ctx)]);
    return {
      id: ev.id, title: sub(ev.title, ctx), bg: ev.bg || 'space', pr: extra.pr || 0,
      scenes: () => lines(ctx.win && ev[ctx.win] ? ev[ctx.win] : ctx.useB && ev.sceneB ? ev.sceneB : (ev.scenesBy && ev.scenesBy[G.facs[G.player].ruling]) || ev.scenes),
      choices: (ev.choicesBy && ev.choicesBy[G.facs[G.player].ruling] || ev.choices) ? (ev.choicesBy && ev.choicesBy[G.facs[G.player].ruling] || ev.choices).map(c => ({ t: sub(c.t, ctx), fx: () => { fx(c.fx, ctx); if (extra.onChoice) extra.onChoice(c); }, after: c.after ? () => lines(c.after) : null })) : undefined,
      fx: () => { fx(ev.fx, ctx); if (extra.onPlay) extra.onPlay(); },
    };
  }

  // ---------- 関係の会話の効き目 ----------
  function stageUp(t) {
    const s = state(t); s.stage = Math.min(3, s.stage + 1); s.last = G.turn;
    const a = t.a, b = t.b;
    if (WARM.has(t.kind)) { FX.loyal(a, 4); FX.loyal(b, 4); if (s.stage === 3) { addStat(a, 'ldr', 1); addStat(b, 'ldr', 1); } }
    else if (t.kind === 'rival') { Game.addMerit(a, 2); Game.addMerit(b, 2); addStat(s.stage % 2 ? a : b, 'tac', 1); if (s.stage === 3) addStat(s.stage % 2 ? b : a, 'tac', 1); }
    else if (t.kind === 'grudge') { if (s.stage < 3) { FX.loyal(a, -3); FX.loyal(b, -3); } }
  }
  const STAGE_TITLE = { bond: ['語らい', '絆', '誓い'], love: ['ひそかな想い', '近づく心', '告白'], family: ['家族の時間', 'すれ違い', '家族の絆'], mentor: ['師の教え', '弟子の成長', '受け継ぐもの'], rival: ['張り合い', '認め合い', '決着'], grudge: ['衝突', '過去', '和解か決裂か'] };

  // ---------- 今月起こせる出来事（Story から呼ばれる） ----------
  function pending() {
    if (!G || G.over) return [];
    const out = [];
    const me = G.player;
    // 0) メインストーリー（自国の章の列・小勢力の列）：前の出来事を終えたものだけ。分岐（group）は一つ選ばれたら他は消える
    const chains = {};
    for (const ev of PEOPLE.MAIN) {
      if (ev.finale || G.evDone[ev.id]) continue;
      if (ev.fac !== undefined && ev.fac !== me) continue;
      if (ev.group && PEOPLE.MAIN.some(x => x.group === ev.group && G.evDone[x.id])) continue;
      const prev = ev.after !== undefined ? [].concat(ev.after) : (ev.idx > 0 ? [PEOPLE.MAIN.find(x => x.chain === ev.chain && x.idx === ev.idx - 1 && !x.finale)].filter(Boolean).map(x => x.group ? '@' + x.group : x.id) : []);
      const done = id => id.startsWith('@') ? PEOPLE.MAIN.some(x => x.group === id.slice(1) && G.evDone[x.id]) : !!G.evDone[id];
      if (!prev.every(done)) continue;
      const lastT = Math.max(0, ...prev.map(id => id.startsWith('@') ? Math.max(0, ...PEOPLE.MAIN.filter(x => x.group === id.slice(1)).map(x => G.evDone[x.id] || 0)) : G.evDone[id] || 0));
      if (prev.length && G.turn - lastT < (ev.gap ?? 4)) continue;   // 前の出来事から間をあける
      if (chains[ev.chain] || !cond(ev.cond)) continue;
      chains[ev.chain] = 1;
      out.push(wrap(ev, {}, { pr: ev.pr ?? 7 }));
    }
    // 1) 国の幕間
    for (const ev of PEOPLE.EVS) {
      if (G.evDone[ev.id] || !ev.cond || ev.cond.fac !== me) continue;
      if (cond(ev.cond)) out.push(wrap(ev, {}, { pr: 3 }));
    }
    // 2) 国家間の出来事（月の変わり目に積んだもの）
    (G.natQueue || []).forEach(q => { const ev = NATIONS.L.find(e => e.id === q.id); if (ev && !G.evDone[ev.id]) out.push(wrap(ev, { other: q.other, useB: q.useB }, { pr: 4, onPlay: () => { G.natQueue = G.natQueue.filter(x => x.id !== q.id); } })); });
    // 3) 個人の物語（自国の士官、順に1話ずつ）
    let arcs = 0;
    for (const k of Game.officersOf(me)) {
      const p = prof(k); if (!p || !p.arc || arcs >= 1) continue;
      const i = p.arc.findIndex(ev => !G.evDone[ev.id]);
      if (i < 0) continue;
      const ev = p.arc[i];
      if (i > 0 && G.turn - (G.evDone[p.arc[i - 1].id] || 0) < 6) continue;   // 前の話から半年はあける
      if (!cond(ev.cond) || Math.random() > 0.55) continue;
      out.push(wrap(ev, {}, { pr: 2 })); arcs++;
    }
    // 4) 関係
    let talks = 0;
    for (const t of all()) {
      const s = state(t), A = mine(t.a), B = mine(t.b);
      // 初めて同じ国に仕えた
      if (A && B && !s.met) {
        if (G.turn <= 1) { s.met = true; continue; }
        out.push({ fx: () => { s.met = true; s.last = G.turn; }, id: `meet_${pk(t.a, t.b)}_${G.turn}`, title: `${KIND_NAME[t.kind] || '因縁'}：${shortName(OFF[t.a])}と${shortName(OFF[t.b])}`, bg: 'bridge', pr: 1,
          scenes: () => [['narr', '', t.desc], [t.a, WARM.has(t.kind) ? 'happy' : 'normal', line(t, 'reunion', t.a)], [t.b, WARM.has(t.kind) ? 'happy' : 'normal', line(t, 'reunion', t.b)]] });
        continue;
      }
      // 同じ国での会話（3段階）
      if (A && B && t.talk && s.stage < 3 && talks < 1 && G.turn - s.last >= 8 && Math.random() < 0.3) {
        const n = s.stage, sc = t.talk[n];
        if (!sc || !sc.length) continue;
        const fin = n === 2 && t.final && t.final.choices;
        out.push({ id: `talk_${pk(t.a, t.b)}_${n}`, title: `${t.label}：${STAGE_TITLE[t.kind] ? STAGE_TITLE[t.kind][n] : '語らい'}`, bg: n === 2 ? 'space' : 'bridge', pr: 1,
          scenes: () => sc.map(([w, e, x]) => [w, e, sub(x)]),
          choices: fin ? t.final.choices.map(c => ({ t: sub(c.t), fx: () => fx(c.fx), after: c.after ? () => c.after.map(([w, e, x]) => [w, e, sub(x)]) : null })) : undefined,
          fx: () => stageUp(t) });
        talks++;
      }
      // 死と追憶
      for (const [d, sv] of [[t.a, t.b], [t.b, t.a]]) {
        const od = G.officers[d];
        if (!od || od.st !== 'dead' || !mine(sv)) continue;
        if (!s.mourned && od.diedAt >= G.turn - 3) {
          out.push({ id: `mourn_${d}_${sv}`, title: '星になった者', bg: 'crisis', pr: 5,
            scenes: () => [['narr', '', `${OFF[d].name}、${od.diedWhere || '宇宙'}にて没す。${t.label}であった${OFF[sv].name}のもとに、その報せが届いた。`],
              [sv, WARM.has(t.kind) ? 'sad' : t.kind === 'rival' ? 'shock' : 'normal', line(t, 'death', sv)],
              ...(voice(d, 'death') ? [['narr', '', `――最期の言葉は「${voice(d, 'death')}」だったという。`]] : [])],
            fx: () => {
              s.mourned = true;
              if (WARM.has(t.kind)) { addStat(sv, 'tac', 2); FX.loyal(sv, 10); G.officers[sv].avenge = { fac: od.killedBy, until: G.turn + 36 }; }
              else if (t.kind === 'rival') { Game.addMerit(sv, 3); addStat(sv, 'tac', 1); }
            } });
        } else if (s.mourned && s.mem < 3 && G.turn - (od.diedAt || 0) >= 10 && G.turn - s.memT >= 14 && Math.random() < 0.12) {
          out.push({ id: `mem_${d}_${sv}_${G.turn}`, title: '追憶', bg: 'space', pr: 0,
            scenes: () => [[sv, 'sad', line(t, 'memory', sv)], ['narr', '', `（${OFF[d].name}が逝ってから、${G.turn - od.diedAt}か月が過ぎた）`]],
            fx: () => { s.mem++; s.memT = G.turn; FX.loyal(sv, 3); } });
        }
      }
    }
    // 捕らわれた人物：一人につき一つの出来事にまとめる（縁のある者が何人いても、身代金は一度だけ）
    G.capDone = G.capDone || {};
    const captives = new Map();
    for (const t of all()) {
      if (!WARM.has(t.kind) && t.kind !== 'rival') continue;
      for (const [c, sv] of [[t.a, t.b], [t.b, t.a]]) {
        const oc = G.officers[c];
        if (!oc || oc.st !== 'cap' || oc.capBy === me || !mine(sv) || !Game.isMajor(oc.capBy)) continue;
        if (G.capDone[c] === (oc.capAt || 0)) continue;
        if (!captives.has(c)) captives.set(c, []);
        captives.get(c).push({ sv, t });
      }
    }
    for (const [c, list] of captives) {
      const oc = G.officers[c], by = oc.capBy, capAt = oc.capAt || 0;
      list.sort((x, y) => (WARM.has(y.t.kind) ? 1 : 0) - (WARM.has(x.t.kind) ? 1 : 0));
      const main = list[0].sv;
      const still = () => G.officers[c].st === 'cap' && G.officers[c].capBy === by;
      out.push({ id: `cap_${c}_${capAt}`, title: '囚われの身', bg: 'crisis', pr: 4,
        valid: still,
        fx: () => { G.capDone[c] = capAt; },
        scenes: () => [['narr', '', `${OFF[c].name}が、${FACTIONS[by].name}に捕らわれている。`], ...list.slice(0, 3).map(({ sv, t }, i) => [sv, i ? 'sad' : 'angry', line(t, 'capture', sv)])],
        choices: [
          { t: `身代金を払って取り戻す（資金 −400・${FACTIONS[by].short}の信頼 +5）`, fx: () => { if (still() && G.facs[me].funds >= 400) { G.facs[me].funds -= 400; free(c); FX.trust(by, 5); } },
            after: () => G.officers[c].st === 'act' ? [[c, 'happy', voice(c, 'join') || '……迎えに来てくれたのか。']] : [[main, 'sad', '……資金が足りない。すまない。']] },
          { t: `救い出す作戦を許す（成功は五分。失敗すると${OFF[main].name}の忠誠が下がる）`, fx: () => { if (!still()) return; if (Math.random() < 0.5 + (OFF[main].tac - 60) / 200) { free(c); G.flags.rescued = G.turn; } else FX.loyal(main, -6); },
            after: () => G.officers[c].st === 'act' ? [[main, 'happy', '取り戻したぞ！'], [c, 'happy', voice(c, 'join') || '……ありがとう。']] : [[main, 'sad', '……失敗した。すまない。']] },
          { t: '今は動けない（何もしない）', fx: () => list.forEach(({ sv }) => FX.loyal(sv, -3)), after: () => [[main, 'sad', '……わかった。今は、待つ。']] },
        ] });
    }
    return out;
  }
  function free(k) { const o = G.officers[k]; o.st = 'act'; o.fac = G.player; o.capBy = null; o.loyal = Math.max(o.loyal, 70); o.loc = G.facs[G.player].capital; }

  // ---------- 月の変わり目 ----------
  function monthTick() {
    if (!G) return;
    // 関係による忠誠の揺れ
    for (const t of all()) {
      if (!mine(t.a) || !mine(t.b)) continue;
      const s = state(t);
      if (WARM.has(t.kind)) { FX.loyal(t.a, 0.3); FX.loyal(t.b, 0.3); }
      if (t.kind === 'grudge' && s.stage < 3) { FX.loyal(t.a, -0.4); FX.loyal(t.b, -0.4); }
    }
    for (const p of G.planets) if (p.gov && Game.isMajor(p.owner)) addStat(p.gov, p.focus === 'res' ? 'sci' : 'pol', p.focus === 'res' ? 0.03 : 0.02);
    nations();
  }
  // 国家間の出来事：関係・星・首都の変化を見て積む
  function nations() {
    const snap = { rel: {}, own: G.planets.map(p => p.owner), cap: G.facs.map(f => f.capital) };
    for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) snap.rel[a + '-' + b] = G.facs[a].alive && G.facs[b].alive ? Game.rel(a, b).s : null;
    const prev = G.natSnap; G.natSnap = snap;
    if (!prev) return;
    const fire = [];
    for (const ev of NATIONS.L) {
      if (G.natDone[ev.id]) continue;
      const [a, b] = ev.pair; if (!G.facs[a] || !G.facs[b] || !G.facs[a].alive || !G.facs[b].alive) continue;
      if (ev.turn && G.turn < ev.turn) continue;
      const key = Math.min(a, b) + '-' + Math.max(a, b), now = snap.rel[key], was = prev.rel[key];
      let ok = false;
      if (ev.on === 'war') ok = now === 'war' && was !== 'war';
      else if (ev.on === 'peace') ok = was === 'war' && now && now !== 'war';
      else if (ev.on === 'ally') ok = now === 'ally' && was !== 'ally';
      else if (ev.on === 'trade') ok = now === 'trade' && was !== 'trade' && was !== 'ally';
      else if (ev.on === 'capture') ok = snap.own.some((o, i) => o === a && prev.own[i] === b);
      else if (ev.on === 'capital') ok = G.planets[FACTIONS[b].capital].owner === a && prev.own[FACTIONS[b].capital] !== a;
      else if (ev.on === 'time') ok = G.turn >= (ev.turn || 0);
      if (!ok) continue;
      const c = Object.assign({}, ev.cond || {}); delete c.fac;
      // 当事者でない時は、条件の「自国」の部分は見ない（eclipse・omen・turn だけ）
      const me = G.player, inv = me === a || me === b;
      const cc = inv ? c : { eclipse: c.eclipse, omen: c.omen, turn: c.turn };
      if (!cond(cc)) continue;
      fire.push(ev);
    }
    // ひと月に、当事者の出来事は1つ・銀河の報は2つまで
    let mineN = 0, newsN = 0;
    for (const ev of fire) {
      const [a, b] = ev.pair, me = G.player;
      if (me === a || me === b) {
        if (mineN++ >= 1) continue;
        G.natDone[ev.id] = G.turn;
        G.natQueue = (G.natQueue || []).concat([{ id: ev.id, other: me === a ? b : a, useB: me === b }]);
      } else {
        if (newsN++ >= 2) continue;
        G.natDone[ev.id] = G.turn;
        Game.log(`【${FACTIONS[a].short}と${FACTIONS[b].short}】${ev.news}`, 'info', null);
      }
    }
  }

  // ---------- 戦場：司令どうしの関係 ----------
  function battleTie(ka, kb) {
    if (!ka || !kb) return null;
    const t = tie(ka, kb); if (!t) return null;
    const mul = t.kind === 'rival' ? 1.08 : t.kind === 'grudge' ? 1.12 : 0.93;   // 宿敵には燃え、遺恨には怒り、絆のある相手にはためらう
    return { t, mul, la: line(t, 'battle', ka), lb: line(t, 'battle', kb) };
  }
  // 同じ艦隊の司令と副官の関係：絆が深いほど強い
  function fleetMul(fl) {
    if (!fl || !fl.cmd || !fl.sub) return 1;
    const t = tie(fl.cmd, fl.sub); if (!t) return 1;
    const s = state(t).stage;
    if (WARM.has(t.kind)) return 1 + 0.03 * (1 + s);
    if (t.kind === 'rival') return 1.03;
    if (t.kind === 'grudge') return s >= 3 ? 1.04 : 0.95;
    return 1;
  }
  // 仇討ち：絆のある人を殺した国の艦隊には、火力が上がる
  function avengeMul(k, foeFac) {
    const o = k && G.officers[k]; const a = o && o.avenge;
    return a && a.until >= G.turn && a.fac === foeFac ? 1.1 : 1;
  }

  // ---------- 登用：関係のある人が自国にいると、誘いが通りやすい ----------
  function recruitBonus(k) {
    let v = 0, who = null;
    for (const t of tiesOf(k)) {
      const o = other(t, k); if (!mine(o)) continue;
      const d = WARM.has(t.kind) ? 0.2 : t.kind === 'rival' ? 0.05 : -0.15;
      if (Math.abs(d) > Math.abs(v)) { v = d; who = { k: o, line: line(t, 'recruit', o) }; }
    }
    return { v, who };
  }
  // 自国の士官のうち、敵将 k と関係のある者（作戦室で一言）
  function enemyComment(k) {
    for (const t of tiesOf(k)) { const o = other(t, k); if (mine(o)) return { who: o, text: line(t, 'enemy', o) }; }
    return null;
  }
  // 同じ戦場にいる味方どうしの一言
  function allyComment(list) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const t = tie(list[i], list[j]); if (t) return { who: list[i], text: line(t, 'ally', list[i]) }; }
    return null;
  }

  // 自国のメインストーリーの進み（見た話の題）
  function mainProgress() {
    const me = G.player, list = PEOPLE.MAIN.filter(x => x.fac === me && !x.finale);
    return { done: list.filter(x => G.evDone[x.id]).sort((a, b) => G.evDone[a.id] - G.evDone[b.id]).map(x => ({ title: x.title, t: G.evDone[x.id] })), total: new Set(list.map(x => x.group || x.id)).size };
  }
  function finale(win) {
    const me = G.player;
    const ev = PEOPLE.MAIN.find(x => x.finale && (x.fac === undefined || x.fac === me) && (!x.win || x.win === win) && cond(Object.assign({}, x.cond || {}, { chance: undefined })));
    return ev ? wrap(ev, { win }, { pr: 99 }) : null;
  }
  return { init, finale, mainProgress, applyStats, addStat, voice, reply, staffLine, cond, fx, wrap, pending, monthTick, battleTie, fleetMul, avengeMul, recruitBonus, enemyComment, allyComment, tiesOf, tie, state, line, other, prof, KIND_NAME, WARM, HONOR, sub, all: () => all() };
})();
