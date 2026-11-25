// ============================================================
//  艦隊戦（リアルタイム・一時停止で命令）
//  同じ仕組みで「自動で解決」も行う（描かずに早回し）
// ============================================================
const Battle = (() => {
  const W = 600, H = 1000, DT = 1 / 30, TLIMIT = 180;
  const FORMS = {
    spindle: { name: '紡錘陣', desc: '火力 +10%・速さ +10%／受ける被害 +8%' },
    crane:   { name: '鶴翼陣', desc: '側面・背面への攻撃 +15%／受ける被害 +4%' },
    circle:  { name: '方円陣', desc: '受ける被害 −12%・回り込まれにくい／速さ −15%' },
    line:    { name: '横列陣', desc: '射程 +10%・命中 +6%' },
  };
  const STANCES = {
    assault: { name: '突撃', desc: '近づいて撃つ。火力 +15%・受ける被害 +10%' },
    fire:    { name: '砲撃', desc: '射程いっぱいで撃つ。命中 +10%' },
    guard:   { name: '防御', desc: 'その場で守る。受ける被害 −25%・火力 −15%' },
    retreat: { name: '後退', desc: '自陣へ下がり、戦場を離れる' },
  };
  const LINES = {
    '猛進': { start: ['前へ出ろ！ 撃ちまくれ！', '敵が見えたら、それが進む方角だ！'], skill: '全艦、続け！ 突っ込むぞ！', win: '見たか、これが俺たちの戦だ！', lose: 'くそっ……ここまでか！' },
    '沈着': { start: ['焦るな。一隻ずつ、確実に沈めろ。', '陣形を保て。勝機は向こうから来る。'], skill: '全艦、防御を固めろ。持ちこたえれば勝てる。', win: '予定どおりだ。', lose: '……退くぞ。次に備える。' },
    '策士': { start: ['敵の動きは読めている。', 'さて、どこから崩してやろうか。'], skill: '囮を出せ。敵の目を逸らす。', win: '計算どおりね。', lose: '読み違えたか……！' },
    '仁徳': { start: ['皆、必ず生きて帰ろう。', '無理はするな。私が責任を持つ。'], skill: '傷ついた艦を下げて！ すぐに直すわ！', win: '皆、よく戦ってくれた。', lose: '……すまない。皆を退かせる。' },
    '野心': { start: ['この勝利で、私の名を星々に刻む。', '手柄は私のものだ。'], skill: '全砲門、一点に集めろ！', win: 'ふふ、また一つ武功が増えたな。', lose: 'こんなところで……！' },
    '忠烈': { start: ['この身に代えても、ここは通さぬ。', '主命を果たす。それだけだ。'], skill: '一歩も退くな！ ここが死に場所と思え！', win: '主の御名のもとに。', lose: '……無念。' },
    '奔放': { start: ['さあて、派手にいこうか！', '面白くなってきたじゃない。'], skill: 'ちょっと面白いこと、思いついた！', win: 'はっはー！ 楽勝！', lose: 'あちゃー、今日はツイてないな。' },
  };
  const ECL_LINE = { start: '……ヒカリ……クラウ……', skill: '……', win: '……', lose: '……' };

  // ---------- 策（司令官が戦いの中で仕掛ける作戦） ----------
  const TACTICS = {
    pincer:       { name: '挟撃', desc: '艦隊を左右に分け、敵を両側から挟む', min: 2 },
    breakthrough: { name: '中央突破', desc: '紡錘陣で敵の中央を突き抜け、反転して背後を撃つ', min: 1 },
    ambush:       { name: '偽装撤退', desc: '退くと見せて敵を誘い、隠した伏兵で包む', min: 2 },
    rapid:        { name: '高速機動', desc: '足の速い分隊で大きく回り込み、敵の背後を突く', min: 1 },
  };
  // 性格ごとの好み（策士は伏兵、猛進は突破、奔放は機動…）
  const PREF = {
    '猛進': { breakthrough: 3, rapid: 2, pincer: 1, ambush: 0.3 }, '沈着': { pincer: 2, ambush: 1.5, breakthrough: 0.7, rapid: 1 },
    '策士': { ambush: 3, pincer: 2.5, rapid: 1.5, breakthrough: 0.8 }, '仁徳': { pincer: 2, ambush: 1.5, rapid: 1, breakthrough: 0.6 },
    '野心': { breakthrough: 2.5, pincer: 2, rapid: 1.5, ambush: 1 }, '忠烈': { breakthrough: 3, pincer: 1, rapid: 1, ambush: 0.3 },
    '奔放': { rapid: 3, ambush: 2, breakthrough: 1.5, pincer: 1 },
  };
  // 戦い方の型：万能の天才／○○の名手／堅実／鉄壁／凡将
  //  天才はどの策も上手く、二度目の策も打てる。名手は得意の一手だけが冴える。鉄壁は策に頼らず、ひたすら崩れない。凡将は策をほとんど使わない
  const STYLE = {
    genius:     { name: '万能の天才', desc: 'どの策も巧みに使いこなし、一度の戦いで二度、策を打てる。敵の策もよく見抜く' },
    specialist: { name: '名手', desc: '得意の策だけが冴える。ほかの策は並以下' },
    regular:    { name: '堅実', desc: '好みの策を、手堅く使う' },
    shield:     { name: '鉄壁', desc: '攻めの策は使わない。そのかわり守りが硬く、崩れにくい。敵の策も見抜きやすい' },
    plain:      { name: '凡将', desc: '策はほとんど使わない。正面から撃ち合うだけ' },
  };
  const hashK = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function styleOf(k) {
    const o = OFF[k]; if (!o) return null;
    const l = o.ldr, t = o.tac;
    const prefs = Object.entries(PREF[o.pers] || PREF['沈着']).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    let type;
    if (l + t >= 170 && Math.min(l, t) >= 82) type = 'genius';
    else if (l >= 74 && l - t >= 10) type = 'shield';
    else if (t >= 78) type = 'specialist';
    else if (t < 60 && l < 68) type = 'plain';
    else type = 'regular';
    const fav = type === 'specialist' ? prefs[hashK(k) % 2] : null;
    const S0 = STYLE[type];
    return { type, fav, top: prefs.slice(0, 2), name: fav ? TACTICS[fav].name + 'の名手' : S0.name, desc: fav ? `「${TACTICS[fav].name}」だけが冴える。ほかの策は並以下` : S0.desc };
  }
  const styleSd = sd => sd.cmd && !sd.cmdLost ? styleOf(sd.cmd) : null;
  const TL = {
    pincer: { start: ['両翼、開け。敵を挟み込む。', '左右から包め。逃げ場をなくせ。'], done: ['包囲完成だ！ 撃て！', '挟み込んだ！ 一隻も逃すな！'] },
    breakthrough: { start: ['紡錘陣！ 敵の中央を食い破る！', '一点を貫け！ 突き抜けたら反転だ！'], done: ['突き抜けた！ 全艦反転、背中を撃て！', '背後を取った！ 撃ちまくれ！'], fail: ['突破できん……！ 押し返されたか。', 'くっ、厚い……！ 一度下がれ！'] },
    ambush: { start: ['全艦、後退。……ゆっくりとだ。', '退け。敵に、勝ったと思わせろ。'], done: ['今だ、伏兵、出ろ！', 'かかったな！ 包め！'] },
    rapid: { start: ['快速部隊、続け！ 大きく回り込む！', '足で勝負だ。背中をもらうぞ。'], done: ['背後に回った！ 食らいつけ！', 'もらった！ 後ろはがら空きだ！'] },
    detect: { pincer: ['両側から来るぞ。方円陣に組み替えろ！'], breakthrough: ['中央突破か。両翼を広げて迎え撃て！'], ambush: ['……退き方が整いすぎている。伏兵がいるぞ、深追いするな！'], rapid: ['回り込む気だな。後ろに備えろ！'] },
    surprised: ['なにっ、伏兵だと！？', '側面から！？ 隊列を立て直せ！', 'しまった……誘われたか！'],
    reinf: ['待たせたな！ 加勢する！', '間に合ったか！ 全艦、突っ込め！'],
    reserve: ['後詰め、出るぞ！ ここが勝負どころだ！', '温存していた艦を出せ！ 押し返す！'],
    flag: ['旗艦が……！ 指揮を、引き継げ……！', 'ここまで、か……。皆、退け……！'],
    rout: ['だめだ、もう持たない……！', '退け、退けぇっ！'],
    low: ['持ちこたえろ！ ここが踏ん張りどころだ！', '怯むな！ 隊列を崩すな！'],
    upset: ['数ではない。戦は、ここで決まる。', 'この差を覆した……！ 皆、よくやった！'],
  };

  let S = null;         // 戦いの状態
  let view = null;      // 表示（UI のとき）

  // ---------- 準備 ----------
  // setup: { pid, att: {fac, fleets:[]}, def: {fac, fleets:[], dock:true} }
  function build(setup) {
    const pl = setup.pid !== null && setup.pid !== undefined ? G.planets[setup.pid] : null;
    S = {
      t: 0, units: [], shots: [], fx: [], ftr: [], over: null, setup, planet: pl, uid: 1,
      side: { A: mkSide(setup.att, 'A'), D: mkSide(setup.def, 'D') },
      terrain: [], log: [], story: [], cuts: 0,
    };
    // 地形
    const r = Art.srand((pl ? pl.seed : 77) + G.turn * 13);
    const nT = 1 + Math.floor(r() * 3);
    for (let i = 0; i < nT; i++) {
      const type = ['ast', 'neb', 'deb'][Math.floor(r() * 3)];
      S.terrain.push({ type, x: 80 + r() * 440, y: 330 + r() * 340, r: 60 + r() * 70, seed: Math.floor(r() * 1e6) });
    }
    deploy('A'); deploy('D');
    for (const sk of ['A', 'D']) setupReserve(sk);
    // 防衛衛星
    if (pl && pl.def > 0) {
      const isRift = pl.type === 'rift';
      const ft = Game.facOf(pl.owner);
      const lv = ft ? ft.tech.def : 2;
      for (let i = 0; i < pl.def; i++) {
        const a = Math.PI * (0.15 + 0.7 * (i + 0.5) / pl.def);
        const hp = isRift ? 1400 : Math.round(240 * (1 + lv * 0.12));
        const u = mkUnit('D', pl.owner, null, null);
        u.sat = true; u.x = W / 2 + Math.cos(a) * 250 * (pl.def > 4 ? 1 : 0.7); u.y = 40 + Math.sin(a) * 120; u.ang = Math.PI;
        u.ships.push({ ref: null, hull: isRift ? 'crown' : 'sat', hp, max: hp, shield: 40 + lv * 8, smax: 40 + lv * 8, regen: 3, armor: 4 + lv, pd: 0.3, ecm: 0, size: isRift ? 18 : 9,
          weapons: [{ type: 'beam', dmg: 12 * (1 + lv * 0.07) * (isRift ? 3 : 1), range: 260, cd: 1.1, t: Math.random() }, { type: 'msl', dmg: 36 * (1 + lv * 0.07), range: 420, cd: 5, t: Math.random() * 3 }],
          speed: 0, repair: 0, xp: 1, dead: false, hit: 0 });
        u.label = isRift ? '裂け目の核' : '防衛衛星';
        S.units.push(u);
      }
    }
    // 士気と、始まりの戦力（逆転の判定に使う）
    for (const sk of ['A', 'D']) {
      const sd = S.side[sk];
      const o = sd.cmd ? OFF[sd.cmd] : null;
      sd.mMax = sd.fac === 'E' ? 9999 : Math.min(110, 85 + (o ? (o.ldr - 50) * 0.3 : 0));
      sd.morale = sd.mMax;
      sd.ships0 = Math.max(4, S.units.filter(u => u.side === sk).reduce((a, u) => a + u.ships.length, 0));
      sd.p0 = S.units.filter(u => u.side === sk).reduce((a, u) => a + power(u), 0);
    }
    // 司令どうしの因縁（宿敵には燃え、絆のある相手にはためらう）
    S.tie = typeof People !== 'undefined' ? People.battleTie(S.side.A.cmd, S.side.D.cmd) : null;
    if (S.tie) S.story.push({ t: 0, side: 'A', text: `因縁の対決：${OFF[S.side.A.cmd].name}と${OFF[S.side.D.cmd].name}（${S.tie.t.label}）` });
    return S;
  }
  function mkSide(sd, key) {
    const fleets = sd.fleets || [];
    const lead = fleets.find(f => f.cmd) || null;
    return { key, fac: sd.fac, fleets, dock: !!sd.dock, cmd: lead ? lead.cmd : null, form: lead ? lead.form : 'line', skillUsed: false, buff: null, buffUntil: 0, ctrl: 'ai', lost: 0, sunk: 0, plan: null, planUsed: false, cmdLost: false, routed: false, cautious: false, lowSaid: false };
  }
  function mkUnit(side, fac, fleet, cmd) {
    return { id: S.uid++, side, fac, fleet, cmd, ships: [], x: 0, y: 0, ang: side === 'A' ? 0 : Math.PI, vx: 0, vy: 0, order: null, stance: 'fire', alive: true, out: false, sat: false, label: '', sel: false, aiT: Math.random() * 0.5, engaged: false, role: null, hidden: false, wait: false, flag: false };
  }
  function shipEntry(s, fac) {
    let st, hull;
    if (s.ecl) { const E = ECLIPSE_SHIPS[s.ecl]; st = { hp: E.hp * (s.m || 1), armor: E.armor, shield: E.shield * (s.m || 1), regen: E.regen || 0, pd: 0.1, ecm: 0, speed: E.speed, repair: 0, command: 0, weapons: E.weapons.map(w => ({ ...w, dmg: w.dmg * Math.sqrt(s.m || 1) })), size: E.size }; hull = s.ecl; }
    else { const d = G.designs[s.d]; st = Game.designStats(d, d.fac); hull = d.hull; }
    return { ref: s, hull, hp: s.hp, max: st.hp, shield: st.shield, smax: st.shield, regen: st.regen, armor: st.armor, pd: st.pd, ecm: st.ecm, size: st.size, speed: st.speed, repair: st.repair, command: st.command,
      weapons: st.weapons.map(w => ({ ...w, t: Math.random() * w.cd })), xp: s.xp || 0, dead: s.hp <= 0, hit: 0, ftrUp: 0 };
  }
  // 艦を設計ごとにまとめて分隊にする（1分隊 6隻、1艦隊 5分隊まで）
  function squads(ships) {
    const by = new Map();
    ships.filter(s => s.hp > 0).forEach(s => { const k = s.ecl || s.d; if (!by.has(k)) by.set(k, []); by.get(k).push(s); });
    const out = [];
    for (const list of by.values()) for (let i = 0; i < list.length; i += 4) out.push(list.slice(i, i + 4));
    return out.sort((a, b) => b.length - a.length);
  }
  function deploy(side) {
    const sd = S.side[side];
    const groups = [];
    // 2つ目以降の艦隊は、遅れて戦場に着くことがある（援軍：横から現れる）
    const late = new Map();
    sd.fleets.forEach((fl, i) => { if (i > 0 && fl.fac !== 'E' && Math.random() < 0.42) late.set(fl, 10 + Math.random() * 20); });
    const lead = sd.fleets.find(f => f.cmd) || null;
    sd.fleets.forEach(fl => squads(fl.ships).slice(0, 6).forEach(g => { if (!late.has(fl)) groups.push({ fl, g }); }));
    if (sd.dock && S.planet) squads(S.planet.dock).slice(0, 3).forEach(g => groups.push({ fl: null, g }));
    const n = groups.length;
    const baseY = side === 'A' ? H - 110 : 230;
    const dir = side === 'A' ? -1 : 1;
    groups.forEach(({ fl, g }, i) => {
      const u = mkUnit(side, fl ? fl.fac : sd.fac, fl, fl ? (fl.cmd || null) : null);
      g.forEach(s => u.ships.push(shipEntry(s, sd.fac)));
      const k = n === 1 ? 0 : i / (n - 1) - 0.5;   // -0.5〜0.5
      const spread = Math.min(480, 110 * n);
      let x = W / 2 + k * spread, y = baseY;
      const form = sd.form;
      if (form === 'spindle') y -= dir * (0.5 - Math.abs(k)) * 140;
      else if (form === 'crane') y -= dir * Math.abs(k) * 150;
      else if (form === 'circle') { const a = (i / n) * Math.PI * 2; x = W / 2 + Math.cos(a) * 85 * Math.min(1, n / 3); y = baseY + Math.sin(a) * 60 * Math.min(1, n / 3); }
      u.x = x; u.y = y;
      u.label = labelOf(u);
      if (fl && fl === lead && !S.units.some(x => x.side === side && x.flag)) u.flag = true;
      S.units.push(u);
    });
    // 援軍：敵の側面の外で待たせておく
    for (const [fl, at] of late) {
      const s = Math.random() < 0.5 ? -1 : 1;
      squads(fl.ships).slice(0, 6).forEach((g, i) => {
        const u = mkUnit(side, fl.fac, fl, fl.cmd || null);
        g.forEach(sh => u.ships.push(shipEntry(sh, sd.fac)));
        u.wait = true; u.arriveAt = at; u.reinf = true; u.enter = s;
        u.x = s < 0 ? 14 : W - 14; u.y = H / 2 + fwd(side) * (60 + i * 46);
        u.ang = s < 0 ? Math.PI / 2 : -Math.PI / 2;
        u.label = labelOf(u);
        S.units.push(u);
      });
    }
  }
  // 後詰め：統率の高い司令官や、沈着・仁徳の司令官は、一隊を後ろに残しておく
  function setupReserve(sk) {
    const sd = S.side[sk];
    if (!sd.cmd || sd.fac === 'E') return;
    const o = OFF[sd.cmd];
    const list = S.units.filter(u => u.side === sk && !u.sat && !u.wait && !u.flag);
    if (S.units.filter(u => u.side === sk && !u.sat && !u.wait).length < 3 || !list.length) return;
    if (!(o.ldr >= 66 || o.pers === '沈着' || o.pers === '仁徳') || Math.random() > 0.75) return;
    const u = list.sort((a, b) => power(b) - power(a))[Math.min(1, list.length - 1)];
    u.wait = true; u.reserve = true; u.arriveAt = 26 + Math.random() * 18;
    u.x = W / 2 + (Math.random() - 0.5) * 120; u.y = sk === 'A' ? H - 24 : 24;
  }
  function labelOf(u) {
    const s = u.ships[0];
    if (s.ref && s.ref.ecl) return ECLIPSE_SHIPS[s.ref.ecl].name;
    if (s.ref && s.ref.d) return G.designs[s.ref.d].name;
    return '分隊';
  }

  // ---------- 計算 ----------
  const alive = u => u.alive && !u.out && !u.wait;
  // 狙える敵（隠れている伏兵は見えない）
  const enemiesOf = side => S.units.filter(u => u.side !== side && alive(u) && !u.hidden);
  const fwd = sk => sk === 'A' ? -1 : 1;           // 前へ進む向き（A は上へ、D は下へ）
  const foeOf = sk => sk === 'A' ? 'D' : 'A';
  const mob = (sk, incHidden) => S.units.filter(u => u.side === sk && alive(u) && !u.sat && (incHidden || !u.hidden));
  const center = list => list.length ? [list.reduce((a, u) => a + u.x, 0) / list.length, list.reduce((a, u) => a + u.y, 0) / list.length] : null;
  const cmdTac = sd => sd.cmd && !sd.cmdLost ? OFF[sd.cmd].tac : 30;
  const pickL = a => a[Math.floor(Math.random() * a.length)];
  const unitR = u => 18 + Math.sqrt(u.ships.filter(s => !s.dead).length) * 10;
  function inTerrain(x, y, type) { return S.terrain.some(t => t.type === type && Math.hypot(t.x - x, t.y - y) < t.r); }
  function sideMods(sd) {
    const f = sd.form;
    const m = { dmg: 1, taken: 1, speed: 1, range: 1, acc: 1, flank: 0, circle: false };
    if (f === 'spindle') { m.dmg *= 1.1; m.speed *= 1.1; m.taken *= 1.08; }
    if (f === 'crane') { m.flank += 0.15; m.taken *= 1.04; }
    if (f === 'circle') { m.taken *= 0.88; m.speed *= 0.85; m.circle = true; }
    if (f === 'line') { m.range *= 1.1; m.acc *= 1.06; }
    if (sd.buff && S.t < sd.buffUntil) {
      const b = sd.buff;
      if (b === 'charge') { m.dmg *= 1.35; m.speed *= 1.3; }
      if (b === 'wall') m.taken *= 0.55;
      if (b === 'focus') { m.dmg *= 1.25; m.range *= 1.15; }
      if (b === 'hold') { m.taken *= 0.75; m.dmg *= 1.15; }
    }
    // 士気：下がるほど、撃つ力も狙いも鈍る
    if (sd.fac !== 'E' && !DBG.noMorale) { const mo = clamp(sd.morale / 80, 0.35, 1.1); m.dmg *= 0.84 + 0.16 * mo; m.acc *= 0.9 + 0.1 * mo; }
    if (sd.confusedUntil > S.t) { m.acc *= 0.7; m.dmg *= 0.9; }   // 伏兵に驚いた
    if (sd.rearUntil > S.t) m.taken *= 1.15;
    if (S.tie) m.dmg *= S.tie.mul;
    if (typeof People !== 'undefined' && sd.cmd) m.dmg *= People.avengeMul(sd.cmd, S.side[sd.key === 'A' ? 'D' : 'A'].fac);   // 仇討ち                          // 背後を取られた
    // 出来事で選んだ国の力
    if (Game.isMajor(sd.fac)) { const foeF = S.side[sd.key === 'A' ? 'D' : 'A'].fac; m.dmg *= 1 + People.buff(sd.fac, 'dmg') + (foeF === 'E' ? People.buff(sd.fac, 'eclDmg') : 0); m.taken *= 1 - Math.min(0.4, People.buff(sd.fac, 'def')); }
    // 派閥・禁忌
    const f2 = Game.facOf(sd.fac);
    if (f2 && f2.ruling === 'war') m.dmg *= 1.10;
    // 参謀の方針
    if (sd.fac === G.player) {
      const foe = S.side[sd.key === 'A' ? 'D' : 'A'].fac;
      m.dmg *= 1 + Staff.bonus('expand', 0.08) + (foe === 'E' ? Staff.bonus('eclipse', 0.2) : 0);
      if (sd.key === 'D') m.taken *= 1 - Staff.bonus('defend', 0.15);
    }
    return m;
  }
  function unitMods(u) {
    const sd = S.side[u.side], m = sideMods(sd);
    const cmd = sd.cmdLost && (!u.cmd || u.cmd === sd.cmd) ? null : (u.cmd || sd.cmd);
    let cmdK = 1 + Math.max(0, ...u.ships.map(s => s.command || 0));
    if (cmd) {
      const o = OFF[cmd];
      m.dmg *= 1 + Game.rankIdx(cmd) * 0.008;   // 階級（経験）
      m.dmg *= 1 + (o.tac - 50) / 400 * cmdK;
      m.taken *= 1 - (o.ldr - 50) / 420 * cmdK;
      if (o.pers === '猛進' && u.stance === 'assault') m.dmg *= 1.1;
      if (o.pers === '沈着' && u.stance === 'guard') m.taken *= 0.9;
      if (o.pers === '策士') m.flank += 0.12;
      const st = styleOf(cmd);
      if (st.type === 'shield') { m.taken *= sd.key === 'D' || u.stance === 'guard' ? 0.78 : 0.92; m.dmg *= 0.95; }
      if (st.type === 'plain') m.dmg *= 0.97;
      if (o.pers === '野心') m.dmg *= 1.05;
    }
    // 副官
    const fl = u.fleet;
    if (fl && fl.sub) m.dmg *= (1 + (OFF[fl.sub].tac - 50) / 500) * (typeof People !== 'undefined' ? People.fleetMul(fl) : 1);
    if (u.stance === 'assault') { m.dmg *= 1.15; m.taken *= 1.1; }
    if (u.stance === 'fire') m.acc *= 1.1;
    if (u.stance === 'guard') { m.dmg *= 0.85; m.taken *= 0.75; }
    // 策の役目
    const P = sd.plan;
    if (P && !P.done && u.role) {
      if (u.role === 'spear' && P.phase === 1) { m.speed *= 1.18; m.dmg *= 1.02 + 0.16 * P.q; m.taken *= P.detected ? 1.2 : 1.1 - 0.22 * P.q; }   // 巧い突破ほど、撃たれる前に抜ける
      if (u.role === 'rapid' && P.phase === 1) m.speed *= 1.5;
      if (u.hidden) m.speed *= 1.2;
    }
    if (inTerrain(u.x, u.y, 'neb')) m.range *= 0.72;
    if (inTerrain(u.x, u.y, 'ast')) m.speed *= 0.6;
    return m;
  }
  function unitSpeed(u) {
    const sp = Math.min(...u.ships.filter(s => !s.dead).map(s => s.speed));
    return sp * 0.95 * unitMods(u).speed;
  }
  function mainRange(u) {
    const rs = []; u.ships.forEach(s => !s.dead && s.weapons.forEach(w => { if (w.type !== 'ftr') rs.push(w.range); }));
    if (!rs.length) return 300;
    rs.sort((a, b) => a - b);
    return rs[Math.floor(rs.length / 2)];
  }
  function minRange(u) { let r = 999; u.ships.forEach(s => !s.dead && s.weapons.forEach(w => { if (w.type !== 'ftr') r = Math.min(r, w.range); })); return r === 999 ? 200 : r; }
  function flankMul(shooter, target, extra, circle) {
    const a = Math.atan2(shooter.y - target.y, shooter.x - target.x);
    const facing = target.ang - Math.PI / 2;   // ang=0 は上向き
    let d = Math.abs(((a - facing) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    if (d < Math.PI / 3) return 1;
    if (d < Math.PI * 2 / 3) return (circle ? 1.08 : 1.25) + extra;
    return (circle ? 1.15 : 1.5) + extra;
  }
  function nearestEnemy(u, maxD = 9999) {
    let best = null, bd = maxD;
    for (const e of enemiesOf(u.side)) { const d = Math.hypot(e.x - u.x, e.y - u.y); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  // ---------- 被害 ----------
  function hit(target, dmg, type, srcSide) {
    const tm = unitMods(target);
    let d = dmg * tm.taken * 0.62;   // 戦いが早く終わりすぎないように（策が動く時間を作る）
    if (target.flag) d *= 0.72;      // 旗艦は護衛に守られている
    if (inTerrain(target.x, target.y, 'deb')) d *= 0.75;
    if (inTerrain(target.x, target.y, 'ast') && (type === 'kin' || type === 'msl')) d *= 0.85;
    // 禁忌「星喰らいの解析」は蝕に強い
    const sf = Game.facOf(S.side[srcSide].fac);
    if (sf && sf.forb.includes('f2') && target.fac === 'E') d *= 1.35;
    const live = target.ships.filter(s => !s.dead);
    if (!live.length) return;
    const s = Math.random() < 0.7 ? live[0] : live[Math.floor(Math.random() * live.length)];
    const sAbs = type === 'beam' ? 1 : type === 'kin' ? 0.5 : type === 'msl' ? 0.3 : 0.6;
    if (s.shield > 0) { const take = Math.min(s.shield, d * sAbs); s.shield -= take; d -= take; if (view && take > 2 && Math.random() < 0.5) { const [x, y] = shipPos(target, target.ships.indexOf(s)); fx({ k: 'shield', x, y, r: s.size * 1.6 + 4, life: 0.35, max: 0.35, a: Math.random() * 7 }); } }
    const arm = s.armor * (type === 'beam' ? 0.5 : 1);
    d = Math.max(d * 0.15, d - arm);
    s.hp -= d; s.hit = 0.08;
    if (s.hp <= 0 && !s.dead) {
      s.dead = true; s.hp = 0;
      S.side[target.side].lost++; S.side[srcSide].sunk++;
      const td = S.side[target.side], sd2 = S.side[srcSide];
      td.morale -= 58 / td.ships0 * (target.sat ? 0.5 : 1) * (styleSd(td) && styleSd(td).type === 'shield' ? 0.7 : 1);
      sd2.morale = Math.min(sd2.mMax, sd2.morale + 14 / td.ships0);
      if (view) { boom(target, s, true); if (Sound) Sound.se(s.size >= 15 ? 'bigboom' : 'boom'); }
      if (!target.ships.some(x => !x.dead)) {
        target.alive = false; if (view) say(`${target.label}が全滅`, target.side === 'A' ? '#ff8a7a' : '#9ad0ff');
        // 旗艦が沈んだ：指揮が途絶え、士気が大きく下がる
        if (target.flag && td.cmd && !td.cmdLost && td.fac !== 'E' && mob(target.side).length) {
          td.cmdLost = true; td.flagSunk = true; td.morale -= 22;
          event(target.side, `${OFF[td.cmd].name}の旗艦が沈んだ`, { who: td.cmd, line: pickL(TL.flag), title: '旗艦、轟沈', expr: 'sad', cut: true });
          if (td.plan && !td.plan.done) endPlan(target.side);
        }
      }
    }
  }
  function shipPos(u, i) {
    const n = u.ships.length, cols = Math.min(3, n);
    const row = Math.floor(i / cols), col = i % cols;
    const sp = 31;
    const ox = (col - (cols - 1) / 2) * sp, oy = row * sp * 0.9 - (Math.ceil(n / cols) - 1) * sp * 0.45;
    const a = u.ang, ca = Math.cos(a), sa = Math.sin(a);
    return [u.x + ox * ca - oy * sa, u.y + ox * sa + oy * ca];
  }

  // ---------- 1コマ進める ----------
  function step(dt) {
    if (S.over) return;
    S.t += dt;
    for (const sk of ['A', 'D']) { const sd = S.side[sk]; if (sd.buff && S.t > sd.buffUntil) sd.buff = null; }
    // AI
    for (const u of S.units) {
      if (!alive(u) || u.sat) continue;
      const sd = S.side[u.side];
      u.aiT -= dt;
      if (sd.ctrl === 'ai' && u.aiT <= 0) { u.aiT = 0.6; ai(u); }
      if (sd.ctrl === 'player' && u.aiT <= 0) { u.aiT = 0.5; autoTarget(u); }
    }
    for (const sk of ['A', 'D']) if (S.side[sk].ctrl === 'ai') aiSkill(sk);
    tactics(dt);
    // 動き
    for (const u of S.units) {
      if (!alive(u) || u.sat) continue;
      let tx = null, ty = null;
      const sp = unitSpeed(u);
      if (u.stance === 'retreat') {
        tx = u.x; ty = u.side === 'A' ? H + 80 : -80;
      } else if (u.order && u.order.type === 'move') {
        tx = u.order.x; ty = u.order.y;
        if (Math.hypot(tx - u.x, ty - u.y) < 8) { u.order = null; tx = null; }
      } else if (u.order && u.order.type === 'attack') {
        const e = u.order.target;
        if (!alive(e)) u.order = null;
        else {
          const want = u.stance === 'assault' ? minRange(u) * 0.55 : mainRange(u) * unitMods(u).range * 0.85;
          const d = Math.hypot(e.x - u.x, e.y - u.y);
          if (d > want) { tx = e.x; ty = e.y; }
          else u.ang = turnTo(u.ang, Math.atan2(e.y - u.y, e.x - u.x) + Math.PI / 2, dt * 2);
        }
      }
      if (tx !== null) {
        const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy) || 1;
        u.ang = turnTo(u.ang, Math.atan2(dy, dx) + Math.PI / 2, dt * 2.5);
        const v = Math.min(sp * dt, d);
        u.x += dx / d * v; u.y += dy / d * v;
      } else if (u.order === null && u.stance !== 'guard') {
        const e = nearestEnemy(u, 2000);
        if (e) u.ang = turnTo(u.ang, Math.atan2(e.y - u.y, e.x - u.x) + Math.PI / 2, dt * 1.5);
      }
      // 押し合い
      for (const o of S.units) {
        if (o === u || !alive(o)) continue;
        const dx = u.x - o.x, dy = u.y - o.y, d = Math.hypot(dx, dy), m = (unitR(u) + unitR(o)) * 0.75;
        if (d < m && d > 0.01) { const k = (m - d) / m * 30 * dt; u.x += dx / d * k; u.y += dy / d * k; }
      }
      u.x = Math.max(10, Math.min(W - 10, u.x));
      if (u.stance === 'retreat') { if (u.y > H + 40 || u.y < -40) { u.out = true; if (view) say(`${u.label}が戦場を離れた`, '#c8d0e0'); } }
      else u.y = Math.max(20, Math.min(H - 20, u.y));
    }
    // 射撃
    for (const u of S.units) {
      if (!alive(u)) continue;
      const m = unitMods(u);
      const live = u.ships.filter(s => !s.dead);
      if (u.hidden) { live.forEach(s => { if (s.smax) s.shield = Math.min(s.smax, s.shield + s.regen * dt); }); continue; }   // 伏兵は撃たずに潜む
      // 修理
      live.forEach(s => {
        if (s.repair) s.hp = Math.min(s.max, s.hp + s.repair * dt);
        if (s.smax && !inTerrain(u.x, u.y, 'neb')) s.shield = Math.min(s.smax, s.shield + s.regen * dt);
        if (s.hit > 0) s.hit -= dt;
      });
      const tgt0 = u.order && u.order.type === 'attack' && alive(u.order.target) ? u.order.target : null;
      let engaged = false;
      live.forEach((s, si) => {
        for (const w of s.weapons) {
          w.t -= dt;
          if (w.t > 0) continue;
          const range = w.range * m.range;
          let t = tgt0 && Math.hypot(tgt0.x - u.x, tgt0.y - u.y) - unitR(tgt0) < range ? tgt0 : null;
          if (!t) {
            let bd = range + 1;
            for (const e of enemiesOf(u.side)) { const d = Math.hypot(e.x - u.x, e.y - u.y) - unitR(e); if (d < bd) { bd = d; t = e; } }
          }
          if (!t) { w.t = 0.2; continue; }
          engaged = true;
          w.t = w.cd * (0.9 + Math.random() * 0.2);
          if (u.stance === 'retreat' && Math.random() < 0.5) continue;
          const tm = unitMods(t);
          let acc = 0.82 * m.acc * (1 + s.xp * 0.03);
          const ecm = Math.max(...t.ships.filter(x => !x.dead).map(x => x.ecm || 0), 0) + (inTerrain(t.x, t.y, 'neb') ? 0.15 : 0);
          acc *= 1 - ecm;
          const enemySide = S.side[t.side];
          if (enemySide.buff === 'feint' && S.t < enemySide.buffUntil) acc *= 0.65;
          const fm = flankMul(u, t, m.flank, sideMods(S.side[t.side]).circle);
          const dmg = w.dmg * m.dmg * fm * (1 + s.xp * 0.04);
          if (fm >= 1.4) S.side[t.side].morale -= 0.05;   // 背後から撃たれると、浮き足立つ
          const [sx, sy] = shipPos(u, u.ships.indexOf(s));
          if (w.type === 'beam') {
            if (Math.random() < acc) hit(t, dmg, 'beam', u.side);
            if (view) {
              const [tx, ty] = randomShipPos(t), big = w.dmg > 60, ex = tx + (Math.random() - 0.5) * 8, ey = ty + (Math.random() - 0.5) * 8;
              fx({ k: 'beam', x1: sx, y1: sy, x2: ex, y2: ey, life: big ? 0.45 : 0.2, max: big ? 0.45 : 0.2, side: u.side, big, fac: u.fac, w: big ? 7 : w.dmg < 8 ? 1.6 : 2.6 });
              fx({ k: 'muzzle', x: sx, y: sy, r: big ? 14 : 6, life: 0.12, max: 0.12, fac: u.fac });
              fx({ k: 'impact', x: ex, y: ey, r: big ? 22 : 9, life: big ? 0.4 : 0.2, max: big ? 0.4 : 0.2, fac: u.fac });
              if (big) { S.shake = Math.min(10, (S.shake || 0) + 3); for (let i = 0; i < 6; i++) sparkAt(ex, ey, '#fff0c0', 90); }
              else if (Math.random() < 0.3) sparkAt(ex, ey, '#ffe0a0', 60);
              if (Math.random() < 0.35) Sound.se(big ? 'bigbeam' : 'beam');
            }
          } else if (w.type === 'kin') {
            S.shots.push({ k: 'kin', x: sx, y: sy, px: sx, py: sy, t, dmg, acc, side: u.side, sp: 620, life: 2, fac: u.fac });
            if (view) { fx({ k: 'muzzle', x: sx, y: sy, r: 10, life: 0.1, max: 0.1, fac: u.fac, white: true }); if (Math.random() < 0.3) Sound.se('rail'); }
          } else if (w.type === 'msl') {
            S.shots.push({ k: 'msl', x: sx, y: sy, t, dmg, acc: Math.min(1, acc + 0.1), side: u.side, sp: 170, life: 6, ang: u.ang - Math.PI / 2 + (Math.random() - 0.5), fac: u.fac });
            if (view && Math.random() < 0.3) Sound.se('missile');
          } else if (w.type === 'ftr') {
            s.ftrUp = s.ftrUp || 0;
            const mine = S.ftr.filter(f => f.owner === s).length;
            if (mine < (w.n || 2)) S.ftr.push({ owner: s, side: u.side, x: sx, y: sy, t, dmg: w.dmg * m.dmg, cd: 0.6, ang: u.ang - Math.PI / 2, fac: u.fac });
            w.t = 3;
          }
        }
      });
      u.engaged = engaged || u.engaged;
    }
    // 弾
    for (const sh of S.shots) {
      sh.life -= dt;
      if (!alive(sh.t)) { sh.life = 0; continue; }
      const [tx, ty] = [sh.t.x, sh.t.y];
      sh.px = sh.x; sh.py = sh.y;
      const dx = tx - sh.x, dy = ty - sh.y, d = Math.hypot(dx, dy);
      if (sh.k === 'msl') {
        const want = Math.atan2(dy, dx);
        sh.ang = turnTo(sh.ang + Math.PI / 2, want + Math.PI / 2, dt * 3) - Math.PI / 2;
        sh.x += Math.cos(sh.ang) * sh.sp * dt; sh.y += Math.sin(sh.ang) * sh.sp * dt;
        if (view && Math.random() < 0.8) fx({ k: 'trail', x: sh.x, y: sh.y, r: 2.5 + Math.random() * 2, life: 0.9, max: 0.9 });
      } else if (d > 0.001) { const v = Math.min(d, sh.sp * dt); sh.x += dx / d * v; sh.y += dy / d * v; }
      if (d < unitR(sh.t) * 0.6) {
        sh.life = 0;
        if (sh.k === 'msl') {
          const pd = Math.min(0.75, sh.t.ships.filter(x => !x.dead).reduce((a, x) => a + x.pd, 0) / Math.max(1, sh.t.ships.filter(x => !x.dead).length) * 1.3);
          if (Math.random() < pd) { if (view) { fx({ k: 'pop', x: sh.x, y: sh.y, life: 0.3, max: 0.3 }); sparkAt(sh.x, sh.y, '#ffd890', 70); } continue; }
        }
        if (Math.random() < sh.acc) { hit(sh.t, sh.dmg, sh.k, sh.side); if (view) { if (sh.k === 'msl') { fx({ k: 'fire', x: sh.x, y: sh.y, r: 16, life: 0.5, max: 0.5 }); for (let i = 0; i < 5; i++) sparkAt(sh.x, sh.y, '#ffb060', 80); } else { fx({ k: 'impact', x: sh.x, y: sh.y, r: 10, life: 0.2, max: 0.2, white: true }); for (let i = 0; i < 3; i++) sparkAt(sh.x, sh.y, '#fff0d0', 110); } } }
      }
    }
    S.shots = S.shots.filter(s => s.life > 0);
    // 艦載機
    for (const f of S.ftr) {
      if (f.owner.dead) { f.dead = true; continue; }
      if (!alive(f.t)) { const own = S.units.find(u => u.ships.includes(f.owner)); f.t = own ? nearestEnemy(own) : null; if (!f.t) { f.dead = true; continue; } }
      const ox = f.t.x + Math.cos(S.t * 3 + f.dmg) * 26, oy = f.t.y + Math.sin(S.t * 3 + f.dmg) * 26;
      const dx = ox - f.x, dy = oy - f.y, d = Math.hypot(dx, dy) || 1;
      f.ang = Math.atan2(dy, dx);
      const v = Math.min(d, 150 * dt); f.x += dx / d * v; f.y += dy / d * v;
      if (Math.hypot(f.t.x - f.x, f.t.y - f.y) < 40) {
        f.cd -= dt;
        if (f.cd <= 0) {
          f.cd = 0.6; hit(f.t, f.dmg, 'ftr', f.side);
          if (view) fx({ k: 'beam', x1: f.x, y1: f.y, x2: f.t.x + (Math.random() - 0.5) * 10, y2: f.t.y + (Math.random() - 0.5) * 10, life: 0.1, max: 0.1, side: f.side, fac: f.fac, w: 1.2 });
          const pd = f.t.ships.filter(x => !x.dead).reduce((a, x) => a + x.pd, 0) / Math.max(1, f.t.ships.filter(x => !x.dead).length);
          if (Math.random() < pd * 0.35) { f.dead = true; if (view) { fx({ k: 'pop', x: f.x, y: f.y, life: 0.3, max: 0.3 }); sparkAt(f.x, f.y, '#ffd890', 60); } }
        }
      }
    }
    S.ftr = S.ftr.filter(f => !f.dead);
    // 効果
    for (const e of S.fx) e.life -= dt;
    S.fx = S.fx.filter(e => e.life > 0);
    // 終わり（前線が尽きても、援軍・後詰めが残っていれば、すぐに呼ぶ）
    for (const sk of ['A', 'D']) if (!S.units.some(u => u.side === sk && alive(u)) && S.units.some(u => u.side === sk && u.wait && u.alive)) S.units.filter(u => u.side === sk && u.wait).forEach(u => u.arriveAt = 0);
    const aLeft = S.units.some(u => u.side === 'A' && (alive(u) || u.wait && u.alive)), dLeft = S.units.some(u => u.side === 'D' && (alive(u) || u.wait && u.alive));
    if (!aLeft || !dLeft || S.t >= TLIMIT) {
      S.over = !dLeft && aLeft ? 'A' : 'D';
      if (!aLeft && !dLeft) S.over = 'D';
      S.timeout = S.t >= TLIMIT && aLeft && dLeft;
    }
  }
  function randomShipPos(u) { const live = u.ships.map((s, i) => [s, i]).filter(([s]) => !s.dead); if (!live.length) return [u.x, u.y]; const [, i] = live[Math.floor(Math.random() * live.length)]; return shipPos(u, i); }
  function turnTo(a, b, k) {
    let d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    return a + Math.max(-k, Math.min(k, d));
  }

  // ---------- AI ----------
  // 観戦中の指示（撤退・構え・集中攻撃）を守りつつ、残りは参謀（AI）に任せる
  function ai(u) {
    const sd = S.side[u.side];
    if (sd.routed) { u.stance = 'retreat'; u.order = null; return; }
    if (u.role && sd.plan && !sd.plan.done && !sd.force) return;   // 策の最中は、策の指図に従う
    if (sd.force === 'retreat') { u.stance = 'retreat'; u.order = null; return; }
    if (sd.focus && !alive(sd.focus)) sd.focus = null;
    if (sd.force === 'guard') { u.stance = 'guard'; u.order = null; return; }
    aiBase(u);
    if (u.stance === 'retreat' && sd.force) u.stance = sd.force;
    if (sd.force) u.stance = sd.force;
    if (sd.focus && u.stance !== 'retreat') u.order = { type: 'attack', target: sd.focus };
  }
  function aiBase(u) {
    const sd = S.side[u.side];
    const cmd = u.cmd || sd.cmd;
    const pers = cmd ? OFF[cmd].pers : (u.fac === 'E' ? '猛進' : '沈着');
    const mine = S.units.filter(x => x.side === u.side && alive(x));
    const hpRatio = u.ships.reduce((a, s) => a + Math.max(0, s.hp), 0) / u.ships.reduce((a, s) => a + s.max, 0);
    // 劣勢なら下がる（忠烈と蝕は退かない）
    const myP = mine.reduce((a, x) => a + power(x), 0), enP = enemiesOf(u.side).reduce((a, x) => a + power(x), 0);
    if (pers !== '忠烈' && u.fac !== 'E' && !(u.side === 'D' && S.planet) && myP < enP * 0.28 && S.t > 25) { u.stance = 'retreat'; u.order = null; return; }
    // 守る側は衛星の近くで迎え撃つ
    let t = null;
    const ens = enemiesOf(u.side);
    if (!ens.length) return;
    // 狙い：近くて弱っている相手
    let best = -1e9;
    for (const e of ens) {
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      const eh = e.ships.reduce((a, s) => a + Math.max(0, s.hp), 0);
      let sc = -d * 0.8 - eh * 0.05 + (e.sat ? -80 : 0);
      if (pers === '策士') sc += (flankMul(u, e, 0, false) - 1) * 300;
      if (pers === '野心') sc += power(e) * 0.5;
      if (e.flag && (pers === '野心' || pers === '猛進' || pers === '策士')) sc += 90;   // 敵の旗艦を狙う
      if (sc > best) { best = sc; t = e; }
    }
    u.order = { type: 'attack', target: t };
    if (pers === '猛進' || u.fac === 'E') u.stance = 'assault';
    else if (pers === '沈着' && hpRatio < 0.5) u.stance = 'guard';
    else if (minRange(u) > 300) u.stance = 'fire';
    else u.stance = hpRatio > 0.6 && (pers === '奔放' ? Math.random() < 0.5 : pers === '野心') ? 'assault' : 'fire';
    if (u.side === 'D' && S.planet && S.t < 6 && pers !== '猛進') { u.order = null; u.stance = 'fire'; }
    // 旗艦は前に出すぎない（猛進・忠烈の司令官は別）
    if (u.flag && pers !== '猛進' && pers !== '忠烈' && u.stance === 'assault') u.stance = 'fire';
        // 伏兵を疑っている間は、深追いしない
    if (sd.cautious) { const d = t ? Math.hypot(t.x - u.x, t.y - u.y) : 0; if (d > mainRange(u) * 0.95) { u.order = null; u.stance = 'fire'; } }
  }
  function autoTarget(u) {
    // プレイヤーの分隊：命令がないときは、いちばん近い敵へ向かう（防御・後退の構えでは動かない）
    if (u.stance === 'retreat' || u.stance === 'guard') return;
    if (u.order && !(u.order.auto && !alive(u.order.target))) return;
    const e = nearestEnemy(u);
    u.order = e ? { type: 'attack', target: e, auto: true } : null;
  }
  function aiSkill(sk) {
    const sd = S.side[sk];
    if (sd.skillUsed || !sd.cmd || sd.cmdLost || S.t < 8) return;
    const engaged = S.units.some(u => u.side === sk && alive(u) && u.engaged);
    if (!engaged) return;
    const hp = S.units.filter(u => u.side === sk).reduce((a, u) => a + u.ships.reduce((b, s) => b + Math.max(0, s.hp), 0), 0);
    const mx = S.units.filter(u => u.side === sk).reduce((a, u) => a + u.ships.reduce((b, s) => b + s.max, 0), 0);
    const sk2 = skillOf(sd.cmd);
    if (sk2 === 'repair' && hp / mx > 0.6) return;
    if (Math.random() < 0.02) useSkill(sk);
  }
  function power(u) { return u.ships.reduce((a, s) => a + (s.dead ? 0 : s.hp * 0.04 + s.weapons.reduce((b, w) => b + w.dmg / w.cd * (w.n || 1), 0) * 1.6), 0); }
  function skillOf(cmd) {
    const p = OFF[cmd].pers;
    let s = PERSONALITY[p].skill;
    if (s === 'random') s = ['charge', 'wall', 'feint', 'repair', 'focus', 'hold'][(cmd.length * 7 + G.turn) % 6];
    return s;
  }
  function useSkill(sk) {
    const sd = S.side[sk];
    if (sd.skillUsed || !sd.cmd) return false;
    sd.skillUsed = true;
    const s = skillOf(sd.cmd);
    sd.morale = Math.min(sd.mMax, sd.morale + 8);
    S.story.push({ t: S.t, side: sk, text: `${OFF[sd.cmd].name}が奥の手「${SKILLS[s].name}」を使った` });
    if (s === 'repair') {
      S.units.filter(u => u.side === sk && alive(u)).forEach(u => u.ships.forEach(x => { if (!x.dead) x.hp = Math.min(x.max, x.hp + x.max * 0.25); }));
    } else { sd.buff = s; sd.buffUntil = S.t + (s === 'hold' ? 12 : 10); }
    if (s === 'charge') S.units.filter(u => u.side === sk && alive(u) && !u.sat).forEach(u => { if (u.stance !== 'retreat') u.stance = 'assault'; });
    if (view) cutin(sk, s);
    return true;
  }


  // ---------- 戦いの流れ（策・援軍・後詰め・士気） ----------
  // 出来事を記録し、表示中なら台詞のカットインや字幕を出す
  function event(sk, text, o = {}) {
    S.story.push({ t: S.t, side: sk, text });
    if (!view) return;
    const sd = S.side[sk];
    const col = sk === mySide ? '#9ad0ff' : '#ffb0a0';
    if (o.cut && S.cuts < 9 && o.who && OFF[o.who]) { S.cuts++; dramaCut(sk, o.who, o.title || '', o.line || '', o.expr || 'angry'); }
    else if (o.line && o.who && OFF[o.who]) say(`${shortName(OFF[o.who])}「${o.line}」`, col);
    say(text, o.good === undefined ? col : o.good ? '#a0f0b0' : '#ffb0a0');
    void sd;
  }
  // 士気への一撃
  function shock(sk, v) { const sd = S.side[sk]; if (sd.fac !== 'E') sd.morale -= v; }

  function tactics(dt) {
    for (const sk of ['A', 'D']) {
      const sd = S.side[sk], fd = S.side[foeOf(sk)];
      // 援軍・後詰めの到着
      for (const u of S.units) {
        if (u.side !== sk || !u.wait || !u.alive) continue;
        let go = S.t >= u.arriveAt;
        if (u.reserve && !go) go = S.t > 8 && (sd.morale < sd.mMax * 0.62 || mob(sk, true).length <= 1);
        if (!go) continue;
        u.wait = false;
        if (u.reserve) {
          u.y = sk === 'A' ? H - 30 : 30; u.stance = 'assault'; u.order = null;
          if (!sd.reserveSaid) {
            sd.reserveSaid = true; sd.morale = Math.min(sd.mMax, sd.morale + 12);
            event(sk, `${sd.cmd && !sd.cmdLost ? OFF[sd.cmd].name + 'が' : ''}後詰めを投入した`, { who: sd.cmdLost ? null : sd.cmd, line: pickL(TL.reserve), title: '後詰め投入', cut: true });
          }
        } else if (u.reinf) {
          u.stance = 'assault'; u.order = null;
          if (view) S.fx.push({ k: 'ring', x: u.x, y: u.y, r: 40, life: 0.9, max: 0.9 });
          const key = 'r' + (u.fleet ? u.fleet.id : u.id);
          if (!sd['said' + key]) {
            sd['said' + key] = true;
            sd.morale = Math.min(sd.mMax, sd.morale + 12); shock(foeOf(sk), 12);
            const k = u.fleet && u.fleet.cmd ? u.fleet.cmd : null;
            event(sk, `援軍到着！ ${u.fleet && u.fleet.cmd ? Game.fleetName(u.fleet) : '分艦隊'}が${u.enter < 0 ? '左' : '右'}から現れた`, { who: k, line: pickL(TL.reinf), title: '援軍到着', cut: true, expr: 'happy' });
          }
        }
      }
      if (sd.fac === 'E') continue;
      // 士気：少しずつ持ち直す。落ち込みきると潰走する
      if (sd.morale < sd.mMax * 0.55) sd.morale += 0.35 * dt;
      if (!sd.lowSaid && sd.morale < 40 && S.t > 6 && sd.cmd && !sd.cmdLost && !sd.routed) { sd.lowSaid = true; event(sk, `${sideName(sd)}の士気が揺らいでいる`, { who: sd.cmd, line: pickL(TL.low), expr: 'angry' }); }
      const loyal = sd.cmd && !sd.cmdLost && OFF[sd.cmd].pers === '忠烈';
      if (!DBG.noMorale && !sd.routed && sd.morale < (loyal ? 6 : 16) && S.t > 10 && mob(sk).length) {
        sd.routed = true;
        if (sd.plan && !sd.plan.done) endPlan(sk);
        S.units.filter(u => u.side === sk && alive(u) && !u.sat).forEach(u => { u.stance = 'retreat'; u.order = null; u.hidden = false; });
        event(sk, `${sideName(sd)}、潰走！ 隊列が崩れた`, { who: sd.cmdLost ? null : sd.cmd, line: pickL(TL.rout), title: '潰走', expr: 'sad', cut: true, good: sk !== mySide });
        S.units.filter(u => u.side === sk && u.wait).forEach(u => { u.alive = false; });   // 来るはずだった艦も引き返す
      }
      // 策
      sd.planT = (sd.planT || 0) - dt;
      if (sd.planT > 0) continue;
      sd.planT = 0.4;
      if (sd.plan && !sd.plan.done) planTick(sk);
      else if (!sd.planUsed && sd.ctrl === 'ai' && !sd.force && !sd.routed && S.t > 2.5 && S.t > (sd.planAt || 0)) choosePlan(sk);
      void fd;
    }
  }
  // AI の司令官が策を選ぶ（戦術が高いほど策を使い、成功しやすい）
  const DBG = {};   // 確かめ用（策・士気を切る）
  function choosePlan(sk) {
    const sd = S.side[sk];
    sd.planUsed = true;
    if (DBG.noPlan) return;
    if (!sd.cmd || sd.cmdLost) return;
    const o = OFF[sd.cmd], n = mob(sk).length;
    const st = styleOf(sd.cmd);
    const chance = st.type === 'plain' ? 0.12 : st.type === 'shield' ? 0.3 : st.type === 'genius' ? 0.95 : st.type === 'specialist' ? 0.4 + (o.tac - 50) / 60 : 0.25 + (o.tac - 50) / 60;
    if (Math.random() > chance) return;   // 凡将はまず使わない。名手・天才はほぼ必ず
    const my = mob(sk).reduce((a, u) => a + power(u), 0), en = mob(foeOf(sk)).reduce((a, u) => a + power(u), 0) || 1;
    const r = my / en;
    const mySp = Math.max(...mob(sk).map(unitSpeed)), enSp = Math.max(...mob(foeOf(sk)).map(unitSpeed), 1);
    const w = Object.assign({}, PREF[o.pers]);
    if (r < 0.85) { w.ambush *= 1.8; w.rapid *= 1.4; w.breakthrough *= 0.6; }   // 劣勢なら、奇策
    if (r > 1.3) { w.pincer *= 1.6; }                                           // 優勢なら、包んで潰す
    if (mySp < enSp * 1.05) w.rapid *= 0.3;
    if (S.terrain.some(t => t.type !== 'deb')) w.ambush *= 1.4;                  // 隠れる場所がある
    // 相手がもう策を始めていれば、それに合わせる（退く敵には追い討ち、突っ込む敵には包み込み）
    const fp = S.side[foeOf(sk)].plan;
    if (fp && !fp.done) {
      if (fp.type === 'ambush') { w.ambush = 0; w.rapid *= 1.5; }
      if (fp.type === 'breakthrough') { w.pincer *= 2; w.breakthrough *= 0.4; }
      if (fp.type === 'pincer') { w.breakthrough *= 1.8; }
    }
    if (sk === 'D' && S.planet && S.planet.def > 0) w.ambush *= 1.3;
    // 型：名手は得意の一手ばかり、堅実は好みの二つ、鉄壁は待ち伏せだけ（攻めの策は使わない）
    // 天才は戦況を読む：互角以下で正面突破はしない。数で勝てば包み、劣れば誘う
    if (st.type === 'genius') {   // 好みでなく、戦況で選ぶ
      Object.assign(w, { ambush: fp && !fp.done && fp.type === 'ambush' ? 0 : 2.5, pincer: r > 1.2 ? 3 : 0.8, breakthrough: r > 1.3 || S.side[foeOf(sk)].morale < 45 ? 2.5 : 0.2, rapid: mySp > enSp * 1.25 ? 2 : 0.2 });
      if (S.terrain.some(t => t.type !== 'deb')) w.ambush *= 1.3;
    }
    if (st.type === 'specialist') Object.keys(w).forEach(k => w[k] *= k === st.fav ? 5 : 0.25);
    if (st.type === 'regular' || st.type === 'plain') Object.keys(w).forEach(k => { if (!st.top.includes(k)) w[k] *= 0.15; });
    if (st.type === 'shield') Object.keys(w).forEach(k => { if (k !== 'ambush' && k !== 'pincer') w[k] = 0; });
    Object.keys(w).forEach(k => { if (n < TACTICS[k].min) w[k] = 0; });
    const tot = Object.values(w).reduce((a, b) => a + b, 0); if (!tot) return;
    let x = Math.random() * tot, pick = null;
    for (const [k, v] of Object.entries(w)) { x -= v; if (x <= 0) { pick = k; break; } }
    if (pick) startPlan(sk, pick);
  }
  function startPlan(sk, type) {
    const sd = S.side[sk], fd = S.side[foeOf(sk)];
    const units = mob(sk);
    if (sd.routed || units.length < TACTICS[type].min || !mob(foeOf(sk)).length) return false;
    sd.planUsed = true;
    const ms = styleSd(sd), fs = styleSd(fd);
    // 策の出来：名手の得意技は冴え、不得手は鈍る。凡将はそもそも粗い
    const qAdd = !ms ? 0 : ms.type === 'genius' ? 0.12 : ms.type === 'plain' ? -0.15 : ms.type === 'shield' ? -0.1 : ms.type === 'specialist' ? (ms.fav === type ? 0.22 : -0.12) : ms.top.includes(type) ? 0.04 : -0.06;
    const q = clamp(cmdTac(sd) / 100 + qAdd + (Math.random() - 0.5) * 0.15, 0.2, 1.25);
    const detAdd = !fs ? 0 : fs.type === 'genius' ? 0.12 : fs.type === 'shield' ? 0.14 : fs.type === 'plain' ? -0.04 : 0;
    const detSub = !ms ? 0 : ms.type === 'genius' ? 0.06 : ms.type === 'specialist' && ms.fav === type ? 0.1 : 0;
    const det = fd.cmd && !fd.cmdLost ? clamp(0.06 + (cmdTac(fd) - cmdTac(sd)) * 0.012 + detAdd - detSub, 0.03, 0.6) : 0;
    const P = sd.plan = { type, phase: 1, t0: S.t, q, detected: Math.random() < det };
    units.forEach(u => { u.role = null; u.wpi = 0; });
    units.sort((a, b) => a.x - b.x);
    const n = units.length;
    if (type === 'pincer') {
      const k = n === 2 ? 1 : Math.max(1, Math.floor(n / 3));
      units.forEach((u, i) => u.role = i < k ? 'wingL' : i >= n - k ? 'wingR' : 'center');
    } else if (type === 'ambush') {
      let k = n === 2 ? 1 : Math.max(1, Math.floor(n / 3)); if (n > 2 && 2 * k >= n) k = Math.floor((n - 1) / 2);
      units.forEach((u, i) => {
        const amb = n === 2 ? i === 0 : (i < k || i >= n - k);
        u.role = amb ? 'ambush' : 'bait';
        if (amb) {
          u.hidden = true;
          const left = u.x < W / 2;
          const tr = S.terrain.find(t => t.type !== 'deb' && (t.x < W / 2) === left && Math.abs(t.y - H / 2) < 260);
          u.spot = tr ? [tr.x, tr.y] : [left ? 34 : W - 34, H / 2 - fwd(sk) * 70];
        }
      });
    } else if (type === 'breakthrough') {
      units.forEach(u => u.role = 'spear'); sd.form = 'spindle';
    } else if (type === 'rapid') {
      const bySp = [...units].sort((a, b) => unitSpeed(b) - unitSpeed(a));
      const k = Math.max(1, Math.ceil(n / 2));
      const ec = center(mob(foeOf(sk)));
      const side = ec[0] < W / 2 ? 1 : -1;   // 広く空いている側から回る
      bySp.forEach((u, i) => {
        u.role = i < k ? 'rapid' : 'center';
        if (u.role === 'rapid') {
          const ex = side > 0 ? W - 28 : 28;
          u.wp = [[ex, clamp(ec[1] - fwd(sk) * 40, 40, H - 40)], [ex, clamp(ec[1] + fwd(sk) * 90, 40, H - 40)], [clamp(ec[0] + side * 40, 40, W - 40), clamp(ec[1] + fwd(sk) * 150, 40, H - 40)]];
        }
      });
    }
    const T = TACTICS[type];
    // 敵の偽装撤退は、始まった時には見せない（伏兵の驚きのため）
    if (type === 'ambush' && sk !== mySide && view) { say('敵艦隊が、退いていく……？', '#ffd8a0'); S.story.push({ t: S.t, side: sk, text: `${OFF[sd.cmd].name}は退くふりをした（偽装撤退）` }); }
    else event(sk, `${OFF[sd.cmd].name}の策：${T.name} ― ${T.desc}`, { who: sd.cmd, line: pickL(TL[type].start), title: '策・' + T.name, cut: true });
    return true;
  }
  // 敵が策を見破った
  function counter(fk, type) {
    const fd = S.side[fk];
    if (type === 'pincer') fd.form = 'circle';
    if (type === 'breakthrough') fd.form = 'crane';
    if (type === 'ambush') fd.cautious = true;
    if (type === 'rapid') {
      const rp = S.units.filter(u => u.side === foeOf(fk) && alive(u) && u.role === 'rapid');
      const g = mob(fk).sort((a, b) => power(b) - power(a))[0];
      if (g && rp.length) { g.order = { type: 'attack', target: rp[0] }; g.aiT = 6; }
    }
    event(fk, `${OFF[fd.cmd].name}が策を見破った！`, { who: fd.cmd, line: pickL(TL.detect[type]), title: '看破', cut: true, expr: 'happy' });
  }
  function endPlan(sk) {
    const sd = S.side[sk], P = sd.plan; if (!P) return;
    P.done = true; sd.cautious = false; S.side[foeOf(sk)].cautious = false;
    const st = styleSd(sd);
    if (st && st.type === 'genius' && !sd.second && !sd.routed) { sd.first = P.type + (P.detected ? 'D' : ''); sd.second = true; sd.planUsed = false; sd.planAt = S.t + 3; }
    S.units.filter(u => u.side === sk).forEach(u => { u.role = null; u.wp = null; if (u.hidden) { u.hidden = false; } u.aiT = 0; });
  }
  function planTick(sk) {
    const sd = S.side[sk], P = sd.plan, fk = foeOf(sk);
    if (sd.force || sd.routed || sd.cmdLost) { endPlan(sk); return; }
    const es = mob(fk), ec = center(es);
    if (!ec) { endPlan(sk); return; }
    const all = S.units.filter(u => u.side === sk && alive(u) && u.role);
    if (!all.length) { endPlan(sk); return; }   // 策の分隊がすべて沈んだ
    const T = S.t - P.t0, f = fwd(sk);
    if (P.detected && !P.detShown && T >= 2.5 + Math.random() * 2) { P.detShown = true; counter(fk, P.type); }
    const near = u => nearestEnemy(u) || es[0];
    const allAttack = (list, st = 'assault') => list.forEach(u => { u.stance = st; u.order = { type: 'attack', target: near(u) }; });
    if (P.phase === 2) { if (T > P.t2 + 12) endPlan(sk); else allAttack(all.filter(u => !u.order || u.order.type !== 'attack' || !alive(u.order.target))); return; }

    if (P.type === 'pincer') {
      const wings = all.filter(u => u.role === 'wingL' || u.role === 'wingR'), mid = all.filter(u => u.role === 'center');
      const spot = u => [clamp(ec[0] + (u.role === 'wingL' ? -1 : 1) * 230, 26, W - 26), clamp(ec[1] - f * 20, 40, H - 40)];
      wings.forEach(u => { const [x, y] = spot(u); u.order = { type: 'move', x, y }; u.stance = 'fire'; });
      mid.forEach(u => { u.stance = 'fire'; u.order = { type: 'attack', target: near(u) }; });
      const ready = wings.every(u => { const [x, y] = spot(u); return Math.hypot(u.x - x, u.y - y) < 70; });
      if (ready || T > 17 || !wings.length) {
        P.phase = 2; P.t2 = T; allAttack(all);
        if (!P.detected) { shock(fk, 10 * P.q); S.side[fk].rearUntil = S.t + 4; }
        event(sk, P.detected ? '挟撃は読まれていた。正面からの撃ち合いになる' : `包囲完成！ ${sideName(S.side[fk])}を両側から挟んだ`, { who: sd.cmd, line: P.detected ? null : pickL(TL.pincer.done), title: '包囲完成', cut: !P.detected, good: sk === mySide });
      }
    } else if (P.type === 'breakthrough') {
      const my = center(all);
      all.forEach(u => { u.stance = 'assault'; u.order = { type: 'move', x: clamp(ec[0] + (u.x - my[0]) * 0.3, 30, W - 30), y: clamp(ec[1] + f * 170, 30, H - 30) }; });
      const passed = f < 0 ? my[1] < ec[1] - 40 : my[1] > ec[1] + 40;
      if (passed) {
        P.phase = 2; P.t2 = T; allAttack(all);
        shock(fk, 10 * P.q); S.side[fk].rearUntil = S.t + 5;
        event(sk, `中央突破！ ${sideName(sd)}は敵陣を貫き、反転して背後を撃つ`, { who: sd.cmd, line: pickL(TL.breakthrough.done), title: '背面展開', cut: true, good: sk === mySide });
      } else if (T > 24 || sd.morale < sd.mMax * 0.4) {
        shock(sk, 8); endPlan(sk); sd.form = 'line';
        event(sk, '中央突破は押し返された', { who: sd.cmd, line: pickL(TL.breakthrough.fail), expr: 'sad', good: sk !== mySide });
      }
    } else if (P.type === 'ambush') {
      const bait = all.filter(u => u.role === 'bait'), amb = all.filter(u => u.role === 'ambush');
      bait.forEach(u => { u.stance = 'fire'; u.order = { type: 'move', x: u.x, y: sk === 'A' ? H - 80 : 80 }; });
      amb.forEach(u => { u.stance = 'fire'; u.order = { type: 'move', x: u.spot[0], y: u.spot[1] }; });
      const lured = f < 0 ? ec[1] > H * 0.47 : ec[1] < H * 0.53;
      if ((lured && T > 5) || T > 21 || !bait.length) {
        P.phase = 2; P.t2 = T;
        amb.forEach(u => { u.hidden = false; if (view) S.fx.push({ k: 'ring', x: u.x, y: u.y, r: 50, life: 0.9, max: 0.9 }); });
        allAttack(all);
        S.side[fk].cautious = false;
        if (!P.detected && lured) {
          shock(fk, 14 * P.q); S.side[fk].confusedUntil = S.t + 4; S.side[fk].rearUntil = S.t + 4;
          event(sk, `伏兵！ ${sideName(sd)}の隠れていた艦が、側面から襲いかかった`, { who: sd.cmd, line: pickL(TL.ambush.done), title: '伏兵', cut: true, good: sk === mySide });
          const fc = S.side[fk];
          if (fc.cmd && !fc.cmdLost) event(fk, `${sideName(fc)}は混乱している`, { who: fc.cmd, line: pickL(TL.surprised), expr: 'sad' });
        } else event(sk, P.detected ? '伏兵は見破られていた。敵は誘いに乗らなかった' : '敵は誘いに乗らなかった。伏兵が姿を現す', { who: sd.cmd, good: false });
      }
    } else if (P.type === 'rapid') {
      const rp = all.filter(u => u.role === 'rapid'), mid = all.filter(u => u.role === 'center');
      mid.forEach(u => { u.stance = 'fire'; u.order = { type: 'attack', target: near(u) }; });
      let arrived = true;
      rp.forEach(u => {
        const w = u.wp[Math.min(u.wpi, u.wp.length - 1)];
        if (Math.hypot(u.x - w[0], u.y - w[1]) < 40 && u.wpi < u.wp.length - 1) u.wpi++;
        const w2 = u.wp[u.wpi];
        if (u.wpi < u.wp.length - 1 || Math.hypot(u.x - w2[0], u.y - w2[1]) > 40) arrived = false;
        u.stance = 'fire'; u.order = { type: 'move', x: w2[0], y: w2[1] };
      });
      if (arrived || T > 20 || !rp.length) {
        P.phase = 2; P.t2 = T; allAttack(all);
        if (rp.length && arrived) { shock(fk, (P.detected ? 3 : 9) * P.q); if (!P.detected) S.side[fk].rearUntil = S.t + 6; }
        event(sk, rp.length && arrived ? `高速機動！ ${sideName(sd)}の快速部隊が背後に回り込んだ` : '回り込みは間に合わなかった', { who: sd.cmd, line: rp.length && arrived ? pickL(TL.rapid.done) : null, title: '背後強襲', cut: !!(rp.length && arrived && !P.detected), good: sk === mySide });
      }
    }
  }

  // ---------- 結果を世界に戻す ----------
  function apply() {
    const res = { winner: S.over, timeout: S.timeout, lostA: S.side.A.lost, lostD: S.side.D.lost, satLost: 0, dead: [], caught: [], sunkBy: {} };
    // 戦いの流れ（後で作戦室や報告に出す）と、逆転
    res.story = S.story.map(e => ({ side: e.side, text: e.text }));
    const W0 = S.side[S.over], L0 = S.side[foeOf(S.over)];
    res.upset = !!(W0 && L0 && W0.fac !== 'E' && W0.p0 < L0.p0 * 0.8);
    res.routed = S.side.A.routed ? 'A' : S.side.D.routed ? 'D' : null;
    if (res.upset) res.story.push({ side: S.over, text: `${sideName(W0)}は、${Math.round(L0.p0 / Math.max(1, W0.p0) * 10) / 10}倍の敵を破った` });
    // 艦の耐久を書き戻す
    for (const u of S.units) {
      for (const s of u.ships) {
        if (s.ref) { s.ref.hp = Math.max(0, Math.round(s.hp)); if (!s.dead && u.engaged) s.ref.xp = Math.min(8, (s.ref.xp || 0) + 1); }
      }
      if (u.sat) { if (!u.alive) res.satLost++; }
    }
    // 沈んだ艦を取り除く
    const prune = list => list.filter(s => s.hp > 0);
    for (const sk of ['A', 'D']) {
      for (const fl of S.side[sk].fleets) fl.ships = prune(fl.ships);
    }
    if (S.planet) {
      S.planet.dock = prune(S.planet.dock);
      S.planet.def = Math.max(0, S.planet.def - res.satLost);
    }
    // 司令官の運命
    for (const sk of ['A', 'D']) {
      const other = sk === 'A' ? 'D' : 'A';
      for (const fl of S.side[sk].fleets) {
        for (const slot of ['cmd', 'sub']) {
          const k = fl[slot]; if (!k) continue;
          const o = G.officers[k];
          o.battles++;
          const wf = Game.isMajor(S.side[sk].fac) && G.facs[S.side[sk].fac].ruling === 'war' ? 1.5 : 1;
          if (S.over === sk) { o.wins++; Game.addMerit(k, (5 + S.side[sk].sunk * 0.5 + (S.side[sk].p0 < S.side[other].p0 * 0.8 ? 6 : 0)) * wf); }
          else Game.addMerit(k, 1.5 * wf);
          if (typeof People !== 'undefined') { const w = S.over === sk; People.addStat(k, 'tac', w ? 0.5 : 0.2); People.addStat(k, 'ldr', w ? 0.35 : 0.15); }
          // 旗艦が沈んだ司令官は、艦隊が残っていても命を落とすことがある
          if (slot === 'cmd' && fl.ships.length > 0 && S.side[sk].flagSunk && k === S.side[sk].cmd) {
            const r = Math.random();
            if (r < 0.18) { Game.freeOfficer(k); o.st = 'dead'; o.diedAt = G.turn; o.diedWhere = S.planet ? S.planet.name : '宇宙'; o.killedBy = S.side[other].fac; res.dead.push(k); }
            else if (S.over !== sk && r < 0.36 && Game.isMajor(S.side[other].fac)) { Game.captureOfficer(k, S.side[other].fac); res.caught.push(k); }
            continue;
          }
          if (fl.ships.length === 0) {
            const f = Game.facOf(fl.fac);
            const deathP = f && f.forb.includes('f3') ? 0.04 : 0.13;
            const r = Math.random();
            if (r < deathP) { Game.freeOfficer(k); o.st = 'dead'; o.diedAt = G.turn; o.diedWhere = S.planet ? S.planet.name : '宇宙'; o.killedBy = S.side[other].fac; res.dead.push(k); }
            else if (r < deathP + 0.32 && Game.isMajor(S.side[other].fac)) { Game.captureOfficer(k, S.side[other].fac); res.caught.push(k); }
          }
        }
      }
    }
    G.rec && (S.side.A.fac === G.player || S.side.D.fac === G.player) && (() => {
      const me = S.side.A.fac === G.player ? 'A' : 'D';
      G.rec.battles++; if (S.over === me) G.rec.won++; else G.rec.lost++;
      G.rec.sunk += S.side[me === 'A' ? 'D' : 'A'].lost; G.rec.lostShips += S.side[me].lost;
      const total = S.units.reduce((a, u) => a + (u.sat ? 0 : u.ships.length), 0);
      if (total >= 24) {
        const nm = `${S.planet ? S.planet.name : '星間'}会戦`;
        const cnt = G.rec.big.filter(b => b.base === nm).length;
        const name = (cnt ? ['第二次', '第三次', '第四次', '第五次'][Math.min(3, cnt - 1)] : '') + nm;
        G.rec.big.push({ base: nm, name, turn: G.turn, won: S.over === me, ships: total, vs: S.side[me === 'A' ? 'D' : 'A'].fac });
        res.big = name;
        G.flags['bigbattle'] = (G.flags['bigbattle'] || 0) + 1;
        G.flags[S.over === me ? 'bigwin' : 'bigloss'] = G.turn;
      }
    })();
    // 小勢力（傭兵団）の依頼：勝利を数える
    for (const sk of ['A', 'D']) if (S.over === sk && Game.isMajor(S.side[sk].fac)) {
      const m = G.minors.m2; m.wins[S.side[sk].fac] = (m.wins[S.side[sk].fac] || 0) + 1;
      const f = G.facs[S.side[sk].fac]; f.stats.wins++; Game.shiftParty(f.id, 'war', 2);
    }
    for (const sk of ['A', 'D']) if (S.over !== sk && Game.isMajor(S.side[sk].fac)) { G.facs[S.side[sk].fac].warWeary += 1; G.facs[S.side[sk].fac].stats.losses++; }
    res.withdrawn = S.units.filter(u => u.out).length;
    return res;
  }

  // ---------- 自動で解決 ----------
  function simulate(setup) {
    view = null;
    build(setup);
    S.side.A.ctrl = 'ai'; S.side.D.ctrl = 'ai';
    let n = 0;
    while (!S.over && n++ < TLIMIT / DT + 10) step(DT);
    if (!S.over) S.over = 'D';
    return apply();
  }

  // ---------- 表示つきで戦う ----------
  let raf = null, last = 0, paused = false, hold = 0, speed = 1, resolveFn = null, mySide = 'A', cv = null, ctx = null, bg = null, sel = [], dpr = 1, scale = 1, ox = 0, oy = 0, msgs = [], cut = null, endShown = false;
  // opt.watch：観戦（参謀＝AI が指揮し、プレイヤーは簡単な指示だけ出す）
  let watch = false, autoClose = null, fast = false;
  function run(setup, playerSide, opt = {}) {
    return new Promise(res => {
      resolveFn = res;
      build(setup);
      mySide = playerSide;
      watch = !!opt.watch;
      S.side[playerSide].ctrl = watch ? 'ai' : 'player';
      // 自分で指揮するときは、後詰めを残さず全部を最初から並べる（援軍は遅れて来る）
      if (!watch) S.units.forEach(u => { if (u.side === playerSide && u.reserve) { u.wait = false; u.reserve = false; u.y = playerSide === 'A' ? H - 110 : 230; } });
      S.side[playerSide === 'A' ? 'D' : 'A'].ctrl = 'ai';
      S.side[playerSide].force = null; S.side[playerSide].focus = null;
      view = true; paused = !watch; hold = 0; speed = watch ? (opt.fast ? 4 : 2) : 1; fast = !!opt.fast; sel = []; msgs = []; cut = null; endShown = false;
      openView();
      intro();
    });
  }
  // 結果まで一気に進める
  function skipToEnd() {
    let n = 0;
    const v = view; view = null;   // 描かずに計算だけ
    while (!S.over && n++ < TLIMIT / DT + 10) step(DT);
    if (!S.over) S.over = 'D';
    view = v; hold = 0;
  }
  function openView() {
    const el = document.getElementById('battle');
    el.innerHTML = `
      <canvas id="bcv"></canvas>
      <div class="b-top">
        <div class="b-side b-me"><b></b><div class="bar"><i></i></div><div class="mo"><i></i></div><small class="b-plan"></small></div>
        <div class="b-time"></div>
        <div class="b-side b-en"><b></b><div class="bar"><i></i></div><div class="mo"><i></i></div><small class="b-plan"></small></div>
      </div>
      <div class="b-msgs"></div>
      <div class="b-cut"></div>
      ${watch ? `<div class="b-ctrl watch">
        <div class="b-row b-sel"></div>
        <div class="b-row b-force">
          <button data-force="assault">⚔ 全軍突撃</button><button data-force="fire">🎯 砲撃戦</button><button data-force="guard">🛡 守りを固める</button><button data-force="">↩ 参謀に任せる</button>
        </div>
        <div class="b-row b-main">
          <button data-a="skill" class="b-skill">奥の手</button>
          <button data-a="speed">×2</button>
          <button data-a="flee" class="b-flee">撤退</button>
          <button data-a="skip">結果へ ⏭</button>
        </div>
      </div>
      <div class="b-help">${S.side[mySide].cmd ? shortName(OFF[S.side[mySide].cmd]) + 'が' : '参謀が'}指揮しています。敵をタップすると、そこへ攻撃を集めます。</div>` : `<div class="b-ctrl">
        <div class="b-row b-sel"></div>
        <div class="b-row b-st">
          ${Object.entries(STANCES).map(([k, v]) => `<button data-st="${k}">${v.name}</button>`).join('')}
        </div>
        <div class="b-row b-fm">
          ${Object.entries(FORMS).map(([k, v]) => `<button data-fm="${k}">${v.name.replace('陣', '')}</button>`).join('')}
          <button data-a="skill" class="b-skill">奥の手</button>
        </div>
        <div class="b-row b-tac">
          ${Object.entries(TACTICS).map(([k, v]) => `<button data-tac="${k}">策・${v.name}</button>`).join('')}
        </div>
        <div class="b-row b-main">
          <button data-a="all">全隊</button>
          <button data-a="pause" class="b-play">▶ 開始</button>
          <button data-a="speed">×1</button>
          <button data-a="auto">自動</button>
          <button data-a="flee" class="b-flee">撤退</button>
        </div>
      </div>
      <div class="b-help">分隊をタップで選ぶ → 宇宙をタップで移動、敵をタップで攻撃。止めている間も命令できます。</div>`}`;
    UI.show('battle');
    cv = el.querySelector('#bcv'); ctx = cv.getContext('2d');
    resize();
    const sd = S.side[mySide], ed = S.side[mySide === 'A' ? 'D' : 'A'];
    el.querySelector('.b-me b').textContent = sideName(sd);
    el.querySelector('.b-en b').textContent = sideName(ed);
    el.querySelector('.b-me .bar i').style.background = Game.ownerCol(sd.fac);
    el.querySelector('.b-en .bar i').style.background = Game.ownerCol(ed.fac);
    const hues = S.planet ? [SYSTEMS[S.planet.sys].hue, SYSTEMS[S.planet.sys].hue + 40, 230] : [230, 280];
    bg = Art.nebulaCanvas(300, 500, (S.planet ? S.planet.seed : 5) + 99, hues, { alpha: 0.09, stars: 200 });
    // 奥と手前の星（ゆっくり流れ、瞬く）
    const rs = Art.srand((S.planet ? S.planet.seed : 5) + 7);
    S.stars = Array.from({ length: 180 }, (_, i) => ({ x: -200 + rs() * (W + 400), y: rs() * H, z: i < 100 ? 0.3 : 1, r: i < 100 ? 0.6 + rs() * 0.8 : 1 + rs() * 1.4, tw: rs() * 7 }));
    S.dust = Array.from({ length: 34 }, () => ({ x: -200 + rs() * (W + 400), y: -300 + rs() * (H + 500), r: 20 + rs() * 60, a: 0.02 + rs() * 0.04 }));
    cv.addEventListener('pointerdown', onTap);
    el.querySelector('.b-ctrl').addEventListener('click', onCtrl);
    window.addEventListener('resize', resize);
    last = performance.now();
    raf = requestAnimationFrame(loop);
    updateCtrl();
    Sound.bgm(S.side.A.fac === 'E' || S.side.D.fac === 'E' ? 'crisis' : 'battle');
  }
  // 司令官のいない側の顔：一般の将兵（側ごとに決まった顔）
  const GEN_T = ['艦長', '分艦隊長', '守備隊長', '先任士官', '戦隊長', '艦長代理'];
  function genName(sd) { const s = (S.planet ? S.planet.id : 0) * 7 + (sd.key === 'A' ? 1 : 2) + String(sd.fac).length; return GEN_T[s % GEN_T.length]; }
  function faceOf(sd, expr) {
    if (sd.cmd) return `<img src="${Portrait.url(sd.cmd, expr)}">`;
    if (sd.fac === 'E') return `<div class="vs-em ecl"></div>`;
    return `<img src="${Portrait.generic('g' + (S.planet ? S.planet.id : 0) + sd.key + sd.fac, sd.fac, expr)}">`;
  }
  function sideName(sd) {
    if (sd.fac === 'E') return '蝕の群れ';
    const n = Game.ownerShort(sd.fac);
    return sd.cmd ? `${n}・${shortName(OFF[sd.cmd])}` : n;
  }
  function resize() {
    if (!cv) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect();
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    scale = Math.min(r.width / W, r.height / H);
    ox = (r.width - W * scale) / 2; oy = (r.height - H * scale) / 2;
    baseScale = scale; cam = null;
  }
  // 戦いの場面へ寄るカメラ：生きている艦の広がりに合わせて、なめらかに寄ったり引いたりする
  let baseScale = 1, cam = null;
  function camera(r) {
    const vis = S.units.filter(u => alive(u) && !(u.hidden && u.side !== mySide));
    if (!vis.length) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    vis.forEach(u => { const m = unitR(u) + 50; x0 = Math.min(x0, u.x - m); y0 = Math.min(y0, u.y - m); x1 = Math.max(x1, u.x + m); y1 = Math.max(y1, u.y + m); });
    // 上の帯・下の操作盤に隠れる分をあける（実際の高さを測る）
    const el = document.getElementById('battle');
    const tb = el && el.querySelector('.b-top'), cb = el && el.querySelector('.b-ctrl');
    const top = (tb ? tb.getBoundingClientRect().bottom - r.top : 60) + 8;
    const bot = (cb ? r.bottom - cb.getBoundingClientRect().top : 160) + 6;
    const vh = Math.max(160, r.height - top - bot);
    const fit = Math.min(r.width / W, vh / H);   // 戦場ぜんぶが見える倍率（これより引かない）
    const want = clamp(Math.min(r.width / (x1 - x0), vh / (y1 - y0)), fit, fit * 2.4);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (!cam) cam = { s: fit, x: W / 2, y: H / 2 };
    const k = 0.04;
    cam.s += (want - cam.s) * k; cam.x += (cx - cam.x) * k; cam.y += (cy - cam.y) * k;
    scale = cam.s;
    ox = r.width / 2 - cam.x * scale; oy = top + vh / 2 - cam.y * scale;
  }
  function toWorld(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - ox) / scale, (e.clientY - r.top - oy) / scale]; }
  function onTap(e) {
    if (S.over) return;
    const [x, y] = toWorld(e);
    let hitU = null, bd = 40;
    for (const u of S.units) { if (!alive(u)) continue; const d = Math.hypot(u.x - x, u.y - y) - unitR(u) * 0.5; if (d < bd) { bd = d; hitU = u; } }
    if (watch) {
      if (hitU && hitU.side !== mySide) {
        S.side[mySide].focus = hitU;
        S.units.filter(u => u.side === mySide && alive(u) && !u.sat && u.stance !== 'retreat').forEach(u => { u.order = { type: 'attack', target: hitU }; u.aiT = 2.5; });
        S.fx.push({ k: 'mark', x: hitU.x, y: hitU.y, life: 0.8, max: 0.8, col: '#ff6a5a' });
        say(`${hitU.label}に攻撃を集めろ！`, '#ffb0a0'); Sound.se('order');
      }
      return;
    }
    if (hitU && hitU.side === mySide && !hitU.sat) {
      if (sel.length === 1 && sel[0] === hitU) sel = []; else sel = [hitU];
      Sound.se('click');
    } else if (hitU && hitU.side !== mySide && sel.length) {
      sel.forEach(u => { u.order = { type: 'attack', target: hitU }; if (u.stance === 'retreat' || u.stance === 'guard') u.stance = 'fire'; });
      S.fx.push({ k: 'mark', x: hitU.x, y: hitU.y, life: 0.6, max: 0.6, col: '#ff6a5a' });
      Sound.se('order');
    } else if (sel.length) {
      sel.forEach((u, i) => { const k = sel.length > 1 ? (i - (sel.length - 1) / 2) * 50 : 0; u.order = { type: 'move', x: x + k, y }; if (u.stance === 'retreat') u.stance = 'fire'; });
      S.fx.push({ k: 'mark', x, y, life: 0.6, max: 0.6, col: '#7ad0ff' });
      Sound.se('order');
    }
    updateCtrl();
  }
  function onCtrl(e) {
    const b = e.target.closest('button'); if (!b || S.over) return;
    Sound.se('click');
    if (b.dataset.force !== undefined) {
      const f = b.dataset.force || null, sd = S.side[mySide];
      sd.force = f; if (!f) sd.focus = null;
      S.units.filter(u => u.side === mySide && alive(u) && !u.sat).forEach(u => { u.aiT = 0; if (f) { u.stance = f; if (f === 'guard') u.order = null; } });
      say(f ? `全軍、${({ assault: '突撃せよ', fire: '砲撃戦に移れ', guard: '守りを固めろ' })[f]}！` : '指揮を任せる。', '#bfe0ff');
    }
    if (b.dataset.a === 'skip') { skipToEnd(); updateCtrl(); return; }
    if (b.dataset.tac) {
      const sd = S.side[mySide];
      if (!sd.cmd || sd.cmdLost) say('司令官がいないと、策は使えない', '#ffb0a0');
      else if (sd.planUsed) say(sd.second || !styleSd(sd) || styleSd(sd).type !== 'genius' ? '策は一度だけ' : 'いまの策が終わるまで待て', '#ffb0a0');
      else if (!startPlan(mySide, b.dataset.tac)) say(`分隊が足りない（${TACTICS[b.dataset.tac].min}隊以上）`, '#ffb0a0');
      else { paused = false; sel = []; }
    }
    if (b.dataset.st) { const list = sel.length ? sel : S.units.filter(u => u.side === mySide && alive(u) && !u.sat); list.forEach(u => { u.stance = b.dataset.st; if (b.dataset.st === 'retreat' || b.dataset.st === 'guard') u.order = null; }); }
    if (b.dataset.fm) { S.side[mySide].form = b.dataset.fm; say(`陣形を${FORMS[b.dataset.fm].name}に`, '#bfe0ff'); }
    const a = b.dataset.a;
    if (a === 'pause') { paused = !paused; if (!paused) { last = performance.now(); } }
    if (a === 'speed') speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
    if (a === 'all') sel = sel.length ? [] : S.units.filter(u => u.side === mySide && alive(u) && !u.sat);
    if (a === 'skill') { if (useSkill(mySide)) { paused = false; } }
    if (a === 'auto') { S.side[mySide].ctrl = S.side[mySide].ctrl === 'ai' ? 'player' : 'ai'; }
    if (a === 'flee') { UI.confirm('全軍を撤退させますか？（自陣の端まで下がった分隊は戦場を離れます）', () => { S.side[mySide].force = 'retreat'; S.units.filter(u => u.side === mySide && alive(u) && !u.sat).forEach(u => { u.stance = 'retreat'; u.order = null; }); paused = false; updateCtrl(); }); }
    updateCtrl();
  }
  function updateCtrl() {
    const el = document.getElementById('battle'); if (!el || !S) return;
    const sd = S.side[mySide];
    el.querySelectorAll('[data-fm]').forEach(b => b.classList.toggle('on', sd.form === b.dataset.fm));
    const ref = sel[0];
    el.querySelectorAll('[data-st]').forEach(b => b.classList.toggle('on', !!ref && sel.every(u => u.stance === b.dataset.st)));
    const pb = el.querySelector('[data-a=pause]');
    if (pb) { pb.textContent = paused ? '▶ 再開' : '❚❚ 停止'; pb.classList.toggle('hot', paused); if (S.t === 0 && paused) pb.textContent = '▶ 開始'; }
    el.querySelector('[data-a=speed]').textContent = '×' + speed;
    const ab = el.querySelector('[data-a=auto]'); if (ab) ab.classList.toggle('on', sd.ctrl === 'ai');
    const al = el.querySelector('[data-a=all]'); if (al) al.classList.toggle('on', sel.length > 1);
    el.querySelectorAll('[data-force]').forEach(b => b.classList.toggle('on', (sd.force || '') === b.dataset.force));
    el.querySelectorAll('[data-tac]').forEach(b => { b.disabled = !sd.cmd || sd.cmdLost || sd.planUsed || mob(mySide).length < TACTICS[b.dataset.tac].min; b.classList.toggle('on', !!(sd.plan && sd.plan.type === b.dataset.tac && !sd.plan.done)); });
    const skb = el.querySelector('[data-a=skill]');
    if (sd.cmd) { skb.textContent = sd.skillUsed ? '奥の手（済）' : SKILLS[skillOf(sd.cmd)].name; skb.disabled = sd.skillUsed; }
    else { skb.textContent = '奥の手なし'; skb.disabled = true; }
    const info = el.querySelector('.b-sel');
    if (watch) {
      const lead = sd.cmd ? OFF[sd.cmd] : null;
      info.innerHTML = `<span class="dim">${lead && !sd.cmdLost ? `${lead.name}（${lead.pers}・戦術${lead.tac}）が指揮中` : '参謀が指揮中'}・${FORMS[sd.form].name}${sd.plan && !sd.plan.done ? `・策：${TACTICS[sd.plan.type].name}` : ''}${sd.force ? `・指示：${({ assault: '全軍突撃', fire: '砲撃戦', guard: '守りを固める', retreat: '撤退' })[sd.force]}` : ''}${sd.focus && alive(sd.focus) ? `・集中攻撃：${sd.focus.label}` : ''}</span>`;
    } else if (ref) {
      const live = ref.ships.filter(s => !s.dead);
      const hp = live.reduce((a, s) => a + s.hp, 0), mx = ref.ships.reduce((a, s) => a + s.max, 0);
      info.innerHTML = `<b>${sel.length > 1 ? `全${sel.length}分隊` : ref.label}</b><span>${sel.length > 1 ? '' : `${live.length}/${ref.ships.length}隻・耐久${Math.round(hp / mx * 100)}%・${STANCES[ref.stance].name}`}</span>`;
    } else info.innerHTML = `<span class="dim">陣形：${FORMS[sd.form].name} ― ${FORMS[sd.form].desc}</span>`;
  }
  function say(t, col = '#fff') { msgs.push({ t, col, life: 3 }); if (msgs.length > 4) msgs.shift(); }
  // ---------- 見た目の効果 ----------
  function fx(e) { if (S.fx.length < 1400) S.fx.push(e); }
  function sparkAt(x, y, col, v) { const a = Math.random() * 7, sp = v * (0.4 + Math.random()); fx({ k: 'spark2', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.25 + Math.random() * 0.35, max: 0.6, col }); }
  // 艦の最期：火の玉・衝撃波・燃える破片・煙。大きな艦は何度も爆ぜ、画面が揺れる
  function boom(u, s, big) {
    const i = u.ships.indexOf(s); const [x, y] = shipPos(u, i);
    const sz = s.size, ecl = u.fac === 'E';
    blast(x, y, sz, ecl);
    if (sz >= 13) { for (let k = 1; k <= Math.min(5, Math.floor(sz / 4)); k++) fx({ k: 'delay', at: S.t + k * 0.18 + Math.random() * 0.1, x: x + (Math.random() - 0.5) * sz * 2.2, y: y + (Math.random() - 0.5) * sz * 2.2, sz: sz * 0.6, ecl, life: 3, max: 3 }); }
    S.shake = Math.min(14, (S.shake || 0) + sz * 0.45);
  }
  function blast(x, y, sz, ecl) {
    fx({ k: 'flash', x, y, r: sz * 4.2, life: 0.45, max: 0.45, ecl });
    fx({ k: 'fire', x, y, r: sz * 2.6, life: 0.9, max: 0.9, ecl });
    fx({ k: 'shock', x, y, r: sz * 6, life: 0.6, max: 0.6, ecl });
    const n = 10 + Math.round(sz * 1.6);
    for (let k = 0; k < n; k++) { const a = Math.random() * 7, v = 30 + Math.random() * 120 * (sz / 10); fx({ k: 'ember', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 1.1, max: 1.7, col: ecl ? (Math.random() < 0.5 ? '#ff4a8a' : '#c020ff') : (Math.random() < 0.5 ? '#ffd27a' : '#ff7a3a') }); }
    for (let k = 0; k < 3 + sz / 4; k++) { const a = Math.random() * 7, v = 8 + Math.random() * 20; fx({ k: 'puff', x: x + Math.cos(a) * sz * 0.6, y: y + Math.sin(a) * sz * 0.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: sz * (0.8 + Math.random() * 0.7), life: 1.6 + Math.random(), max: 2.6, ecl }); }
    // 破片（回りながら飛ぶ）
    for (let k = 0; k < Math.min(8, 2 + sz / 3); k++) { const a = Math.random() * 7, v = 20 + Math.random() * 60; fx({ k: 'chunk', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 7, vr: (Math.random() - 0.5) * 8, s: 1.5 + Math.random() * sz * 0.25, life: 1.2 + Math.random() * 1.2, max: 2.4 }); }
  }
  function intro() {
    const a = S.side[mySide], e = S.side[mySide === 'A' ? 'D' : 'A'];
    const el = document.querySelector('#battle .b-cut');
    const lineOf = (sd) => sd.fac === 'E' ? ECL_LINE.start : !sd.cmd ? '迎え撃て！'
      : S.tie ? (sd.key === 'A' ? S.tie.la : S.tie.lb) : (People.voice(sd.cmd, 'bstart') || R.pick(LINES[OFF[sd.cmd].pers].start));
    const card = (sd, cls) => { const st = styleSd(sd); return `<div class="vs-card ${cls}" style="--c:${Game.ownerCol(sd.fac)}">${faceOf(sd, 'angry')}<div><b>${sd.cmd ? OFF[sd.cmd].name : sd.fac === 'E' ? sideName(sd) : sideName(sd) + '・' + genName(sd)}</b>${st ? `<em class="vs-style s-${st.type}">${st.name}</em>` : ''}<p>「${lineOf(sd)}」</p></div></div>`; };
    el.innerHTML = `<div class="vs">${card(e, 'en')}<div class="vs-x">VS</div>${card(a, 'me')}${S.tie ? `<div class="vs-tie">因縁の対決 ― ${S.tie.t.label}：${S.tie.t.desc}</div>` : ''}<div class="vs-where">${S.planet ? S.planet.name + ' 宙域' : '星間宙域'}${S.terrain.length ? ' ― ' + S.terrain.map(t => ({ ast: '小惑星帯', neb: '星雲', deb: '残骸' })[t.type]).join('・') : ''}</div></div>`;
    el.classList.add('show');
    Sound.se('alarm');
    if (watch) hold++;
    let closed = false;
    const close = () => { if (closed) return; closed = true; if (watch) { hold = Math.max(0, hold - 1); last = performance.now(); } el.removeEventListener('click', close); if (!el.querySelector('.vs')) return; el.classList.remove('show'); el.innerHTML = ''; };
    el.addEventListener('click', close);
    setTimeout(close, fast ? 1000 : 3200);
  }
  function cutin(sk, s) {
    const sd = S.side[sk];
    const el = document.querySelector('#battle .b-cut');
    if (!el || !sd.cmd) return;
    const line = sd.fac === 'E' ? ECL_LINE.skill : (People.voice(sd.cmd, 'bskill') || LINES[OFF[sd.cmd].pers].skill);
    el.innerHTML = `<div class="cutin ${sk === mySide ? 'me' : 'en'}" style="--c:${Game.ownerCol(sd.fac)}"><img src="${Portrait.url(sd.cmd, 'angry')}"><div><small>${SKILLS[s].name}</small><b>「${line}」</b><span>${OFF[sd.cmd].name}</span></div></div>`;
    el.classList.add('show');
    Sound.se('skill');
    // カットインの間だけ時間を止める（一時停止ボタンの状態とは別に数える）
    hold++;
    setTimeout(() => { hold--; if (!hold && !endShown) { el.classList.remove('show'); el.innerHTML = ''; } last = performance.now(); }, 1600);
  }
  // 戦いの山場：司令官の顔と台詞を短く出す（その間、時間を止める）
  function dramaCut(sk, who, title, line, expr) {
    const el = document.querySelector('#battle .b-cut');
    if (!el || endShown) return;
    const sd = S.side[sk];
    el.innerHTML = `<div class="cutin drama ${sk === mySide ? 'me' : 'en'}" style="--c:${Game.ownerCol(sd.fac)}"><img src="${Portrait.url(who, expr)}"><div><small>${title}</small><b>${line ? '「' + line + '」' : ''}</b><span>${OFF[who].name}（${sk === mySide ? '味方' : '敵'}）</span></div></div>`;
    el.classList.add('show');
    Sound.se(title === '潰走' || title === '旗艦、轟沈' ? 'bigboom' : 'skill');
    hold++;
    setTimeout(() => { hold = Math.max(0, hold - 1); if (!hold && !endShown) { el.classList.remove('show'); el.innerHTML = ''; } last = performance.now(); }, fast ? 800 : 1700);
  }
  function loop(now) {
    if (!S) return;
    let dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!paused && !hold && !S.over) {
      let k = dt * speed;
      while (k > 0) { const d = Math.min(DT, k); step(d); k -= d; if (S.over) break; }
    }
    msgs.forEach(m => { if (!paused) m.life -= dt; }); msgs = msgs.filter(m => m.life > 0);
    draw();
    if (S.over && !endShown) { endShown = true; setTimeout(finish, 900 + (hold ? 1600 : 0)); }
    raf = requestAnimationFrame(loop);
    if (Math.floor(now / 250) !== Math.floor((now - dt * 1000) / 250)) updateCtrl();
  }
  function finish() {
    if (hold) { setTimeout(finish, 300); return; }
    const won = S.over === mySide;
    const sd = S.side[mySide];
    const el = document.querySelector('#battle .b-cut');
    const up = S.side[S.over] && S.side[S.over].p0 < S.side[foeOf(S.over)].p0 * 0.8 && S.side[S.over].fac !== 'E';
    const line = sd.cmd ? (won && up ? pickL(TL.upset) : (People.voice(sd.cmd, won ? 'win' : 'lose') || LINES[OFF[sd.cmd].pers][won ? 'win' : 'lose'])) : '';
    const flow = S.story.slice(-5).map(e => `<li class="${e.side === mySide ? 'me' : 'en'}">${e.text}</li>`).join('');
    el.innerHTML = `<div class="b-result ${won ? 'win' : 'lose'}"><h2>${won ? (up ? '大逆転' : '勝利') : S.timeout ? '時間切れ' : '敗北'}</h2>
      ${flow ? `<ul class="b-flow">${flow}</ul>` : ''}
      ${sd.cmd ? `<img src="${Portrait.url(sd.cmd, won ? 'happy' : 'sad')}"><p>「${line}」</p>` : sd.fac !== 'E' ? `${faceOf(sd, won ? 'happy' : 'sad')}<p>「${won ? '……勝った。生きて帰れるぞ。' : '……ここまでか。退くぞ。'}」<br><small>${genName(sd)}</small></p>` : ''}
      <div class="b-stat">撃沈 ${S.side[mySide].sunk}隻 ／ 喪失 ${S.side[mySide].lost}隻</div>
      <button class="btn primary">戦いを終える</button></div>`;
    el.classList.add('show');
    Sound.se(won ? 'fanfare' : 'lose');
    clearTimeout(autoClose);
    if (watch) autoClose = setTimeout(() => { const b = el.querySelector('.b-result button'); if (b) b.click(); }, fast ? 2200 : 8000);
    el.querySelector('button').onclick = () => {
      clearTimeout(autoClose);
      cancelAnimationFrame(raf); raf = null;
      cv.removeEventListener('pointerdown', onTap);
      window.removeEventListener('resize', resize);
      view = null;
      const res = apply();
      el.classList.remove('show');
      const fn = resolveFn; resolveFn = null;
      fn(res);
    };
  }

  // ---------- 描く ----------
  function draw() {
    const c = ctx, r = cv.getBoundingClientRect();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 背景：深い宇宙のグラデーション → 星雲 → 流れる星
    const bgG = c.createLinearGradient(0, 0, 0, r.height);
    bgG.addColorStop(0, '#060a1c'); bgG.addColorStop(0.55, '#02030c'); bgG.addColorStop(1, '#05030a');
    c.fillStyle = bgG; c.fillRect(0, 0, r.width, r.height);
    c.globalAlpha = 0.95; c.drawImage(bg, 0, 0, r.width, r.height); c.globalAlpha = 1;
    camera(r);
    // 画面の揺れ
    S.shake = Math.max(0, (S.shake || 0) - 0.5);
    const sh = S.shake > 0.2 ? S.shake : 0;
    c.save(); c.translate(ox + (Math.random() - 0.5) * sh, oy + (Math.random() - 0.5) * sh); c.scale(scale, scale);
    const T = performance.now() / 1000;
    for (const st of S.stars || []) {
      const y = (st.y + T * 6 * st.z) % H, a = 0.45 + 0.4 * Math.sin(T * 2 + st.tw);
      c.fillStyle = `rgba(220,232,255,${a * (st.z === 1 ? 0.9 : 0.55)})`; c.fillRect(st.x, y, st.r, st.r);
    }
    // 惑星と漂う塵は、戦いごとに一度だけ描いて貼る（毎フレームのグラデーションを減らす）
    if (!S.bgLayer) {
      const L = document.createElement('canvas'), k = 1, mx = 260, my = 460; L.width = (W + mx * 2) * k; L.height = (H + my + 260) * k;
      const g2 = L.getContext('2d'); g2.scale(k, k); g2.translate(mx, my); S.bgOff = [mx, my];
      if (S.planet) {
        const px = W / 2, py = -210, pr = 330;
        const ag = g2.createRadialGradient(px, py, pr * 0.9, px, py, pr * 1.18);
        ag.addColorStop(0, 'rgba(120,190,255,.35)'); ag.addColorStop(1, 'rgba(120,190,255,0)');
        g2.fillStyle = ag; g2.beginPath(); g2.arc(px, py, pr * 1.18, 0, 7); g2.fill();
        Art.planet(g2, px, py, pr, S.planet.type, S.planet.seed, { t: 0 });
      }
      g2.globalCompositeOperation = 'lighter';
      for (const d of S.dust || []) { const g = g2.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r); g.addColorStop(0, `rgba(140,160,255,${d.a})`); g.addColorStop(1, 'rgba(140,160,255,0)'); g2.fillStyle = g; g2.beginPath(); g2.arc(d.x, d.y, d.r, 0, 7); g2.fill(); }
      S.bgLayer = L;
    }
    c.drawImage(S.bgLayer, -S.bgOff[0], -S.bgOff[1], S.bgLayer.width, S.bgLayer.height);
    // 地形
    for (const t of S.terrain) drawTerrain(c, t);
    // 自陣の線
    c.strokeStyle = 'rgba(120,180,255,.12)'; c.setLineDash([6, 10]); c.beginPath(); c.moveTo(0, H - 40); c.lineTo(W, H - 40); c.stroke(); c.setLineDash([]);
    // 命令の線
    for (const u of S.units) {
      if (!alive(u) || u.side !== mySide || !u.order) continue;
      c.strokeStyle = u.order.type === 'attack' ? 'rgba(255,110,90,.45)' : 'rgba(120,200,255,.4)';
      c.lineWidth = 1.5; c.setLineDash([5, 6]); c.beginPath(); c.moveTo(u.x, u.y);
      const t = u.order.type === 'attack' ? u.order.target : u.order; c.lineTo(t.x, t.y); c.stroke(); c.setLineDash([]);
    }
    // 策の動き（味方の分隊の行き先を、太い矢印で）
    for (const u of S.units) {
      if (!alive(u) || u.side !== mySide || !u.role || !u.order || u.order.type !== 'move') continue;
      c.strokeStyle = u.hidden ? 'rgba(200,170,255,.45)' : 'rgba(255,220,120,.5)'; c.lineWidth = 3; c.setLineDash([10, 8]); c.lineDashOffset = -S.t * 40;
      c.beginPath(); c.moveTo(u.x, u.y); c.lineTo(u.order.x, u.order.y); c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
    }
    // 足元の輪（分隊のまとまり）
    for (const u of S.units) {
      if (!alive(u) || (u.hidden && u.side !== mySide)) continue;
      const col = Game.ownerCol(u.fac), isSel = sel.includes(u);
      const g = c.createRadialGradient(u.x, u.y, 0, u.x, u.y, unitR(u) * 1.3);
      g.addColorStop(0, Art.hexA(col, isSel ? 0.2 : 0.09)); g.addColorStop(1, Art.hexA(col, 0));
      c.fillStyle = g; c.beginPath(); c.arc(u.x, u.y, unitR(u) * 1.3, 0, 7); c.fill();
      c.strokeStyle = isSel ? '#ffffff' : Art.hexA(col, 0.35); c.lineWidth = isSel ? 2 : 1; c.setLineDash(isSel ? [] : [3, 5]);
      c.beginPath(); c.arc(u.x, u.y, unitR(u) * 1.15, 0, 7); c.stroke(); c.setLineDash([]);
    }
    // 艦
    for (const u of S.units) {
      if (!alive(u)) continue;
      if (u.hidden && u.side !== mySide) continue;   // 敵の伏兵は見えない
      const col = Game.ownerCol(u.fac);
      c.save(); if (u.hidden) c.globalAlpha = 0.38;
      const moving = u.order && (u.order.type === 'move' || (u.order.type === 'attack' && u.stance === 'assault'));
      u.ships.forEach((s, i) => {
        if (s.dead) return;
        const [x, y] = shipPos(u, i);
        Art.ship(c, s.hull, x, y, u.ang, s.size * 3.3, col, { t: S.t, thrust: u.stance === 'retreat' || moving ? 1 : 0.35, hit: s.hit > 0, hitK: 0.65 * s.hit / 0.08 });
        // 傷ついた艦は煙を吐き、火を噴く
        const hr = s.hp / s.max;
        if (hr < 0.55 && !paused && Math.random() < (hr < 0.3 ? 0.35 : 0.15)) fx({ k: 'puff', x: x + (Math.random() - 0.5) * s.size, y: y + (Math.random() - 0.5) * s.size, vx: (Math.random() - 0.5) * 6, vy: 6 + Math.random() * 8, r: s.size * 0.35, life: 1.2, max: 1.2, dim: true });
        if (hr < 0.3 && !paused && Math.random() < 0.25) fx({ k: 'spark2', x: x + (Math.random() - 0.5) * s.size, y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0.4, max: 0.4, col: '#ff9a3a' });
      });
      // 耐久
      const hp = u.ships.reduce((a, s) => a + Math.max(0, s.hp), 0), mx = u.ships.reduce((a, s) => a + s.max, 0);
      const bw = 44, by = u.y + unitR(u) + 6;
      c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(u.x - bw / 2, by, bw, 4);
      c.fillStyle = hp / mx > 0.5 ? '#7ae08a' : hp / mx > 0.25 ? '#f0c050' : '#ff5a4a'; c.fillRect(u.x - bw / 2, by, bw * hp / mx, 4);
      if (u.side === mySide && !u.sat) {
        c.fillStyle = '#dfefff'; c.font = '13px sans-serif'; c.textAlign = 'center';
        c.fillText(u.hidden ? '伏兵（潜伏中）' : u.role === 'bait' ? '囮' : u.role === 'rapid' ? '快速部隊' : u.role === 'spear' ? '突撃' : STANCES[u.stance].name, u.x, by + 17);
      }
      // 旗艦の印
      if (u.flag) {
        const sd = S.side[u.side];
        c.fillStyle = sd.cmdLost ? '#888' : '#ffd86a'; c.font = '700 13px sans-serif'; c.textAlign = 'center';
        c.fillText(`⚑ ${sd.cmd ? shortName(OFF[sd.cmd]) : '旗艦'}`, u.x, u.y - unitR(u) - 8);
      }
      c.restore();
    }
    // 艦載機（光の尾を引く）
    c.globalCompositeOperation = 'lighter';
    for (const f of S.ftr) {
      const col = Game.ownerCol(f.fac);
      c.strokeStyle = Art.hexA(col, 0.5); c.lineWidth = 1.4; c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x - Math.cos(f.ang) * 12, f.y - Math.sin(f.ang) * 12); c.stroke();
      c.save(); c.translate(f.x, f.y); c.rotate(f.ang); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(5, 0); c.lineTo(-3, 3); c.lineTo(-1.5, 0); c.lineTo(-3, -3); c.closePath(); c.fill(); c.restore();
    }
    // 弾：電磁投射砲は光る曳光弾、ミサイルは炎を噴く
    for (const s2 of S.shots) {
      if (s2.k === 'msl') {
        const ca = Math.cos(s2.ang), sa = Math.sin(s2.ang);
        const g = c.createLinearGradient(s2.x, s2.y, s2.x - ca * 14, s2.y - sa * 14);
        g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.3, 'rgba(255,150,60,.8)'); g.addColorStop(1, 'rgba(255,80,20,0)');
        c.strokeStyle = g; c.lineWidth = 3; c.beginPath(); c.moveTo(s2.x, s2.y); c.lineTo(s2.x - ca * 14, s2.y - sa * 14); c.stroke();
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(s2.x, s2.y, 1.8, 0, 7); c.fill();
      } else {
        const d = Math.hypot(s2.t.x - s2.x, s2.t.y - s2.y) || 1, dx = (s2.t.x - s2.x) / d, dy = (s2.t.y - s2.y) / d;
        const col = Game.ownerCol(s2.fac);
        c.strokeStyle = Art.hexA(col, 0.55); c.lineWidth = 5; c.beginPath(); c.moveTo(s2.x, s2.y); c.lineTo(s2.x - dx * 26, s2.y - dy * 26); c.stroke();
        c.strokeStyle = '#fffbe8'; c.lineWidth = 2; c.beginPath(); c.moveTo(s2.x, s2.y); c.lineTo(s2.x - dx * 18, s2.y - dy * 18); c.stroke();
      }
    }
    // 効果
    const dt = paused || hold || S.over ? 0 : speed / 60;   // 止めている間は、破片も止まる
    for (const e of S.fx) drawFx(c, e, e.life / e.max, dt);
    c.globalCompositeOperation = 'source-over';
    // 奥の手の光
    for (const sk of ['A', 'D']) {
      const sd = S.side[sk];
      if (sd.buff && S.t < sd.buffUntil) for (const u of S.units) if (u.side === sk && alive(u)) { c.strokeStyle = `rgba(255,220,120,${0.4 + Math.sin(S.t * 8) * 0.2})`; c.lineWidth = 2; c.beginPath(); c.arc(u.x, u.y, unitR(u) + 5, 0, 7); c.stroke(); }
    }
    c.restore();
    // 上の表示
    const el = document.getElementById('battle');
    if (el) {
      const pw = side => S.units.filter(u => u.side === side && alive(u)).reduce((a, u) => a + u.ships.reduce((b, s) => b + Math.max(0, s.hp), 0), 0);
      const p0 = side => S.units.filter(u => u.side === side).reduce((a, u) => a + u.ships.reduce((b, s) => b + s.max, 0), 0);
      const me = mySide, en = me === 'A' ? 'D' : 'A';
      el.querySelector('.b-me .bar i').style.width = (pw(me) / p0(me) * 100) + '%';
      el.querySelector('.b-en .bar i').style.width = (pw(en) / p0(en) * 100) + '%';
      const left = Math.max(0, TLIMIT - S.t);
      const moW = sk => { const sd = S.side[sk]; return sd.fac === 'E' ? 100 : clamp(sd.morale / 100, 0, 1) * 100; };
      [['.b-me', me], ['.b-en', en]].forEach(([q, sk]) => {
        const sd = S.side[sk], mo = el.querySelector(q + ' .mo i'), pl = el.querySelector(q + ' .b-plan');
        mo.style.width = moW(sk) + '%'; mo.style.background = sd.morale > 55 ? '#e8d070' : sd.morale > 30 ? '#f09040' : '#ff4a3a';
        // 策の表示（敵の偽装撤退は、伏兵が出るまで隠す）
        const P = sd.plan, hide = P && P.type === 'ambush' && P.phase === 1 && sk !== mySide;
        pl.textContent = sd.routed ? '潰走' : sd.cmdLost ? '旗艦喪失' : P && !P.done && !hide ? '策：' + TACTICS[P.type].name + (P.phase === 2 ? '（決行）' : '') : sd.fac === 'E' ? '' : `士気 ${Math.max(0, Math.round(sd.morale))}`;
      });
      el.querySelector('.b-time').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}${paused ? ' ❚❚' : ''}`;
      el.querySelector('.b-msgs').innerHTML = msgs.map(m => `<div style="color:${m.col};opacity:${Math.min(1, m.life)}">${m.t}</div>`).join('');
    }
  }
  // ---------- 効果を描く（重ねて光らせる） ----------
  function fcol(fac) { return fac === 'E' ? '#ff3070' : Game.ownerCol(fac); }
  function drawFx(c, e, k, dt) {
    k = Math.max(0, Math.min(1, k));
    if (!Number.isFinite(e.x ?? e.x1) || !Number.isFinite(e.y ?? e.y1)) { if (!drawFx.warned) { drawFx.warned = 1; console.warn('fx NaN', e.k); } e.life = 0; return; }
    if (e.k === 'delay') { if (S.t >= e.at && !e.done) { e.done = true; e.life = 0; blast(e.x, e.y, e.sz, e.ecl); S.shake = Math.min(14, (S.shake || 0) + e.sz * 0.3); if (Sound) Sound.se('boom'); } return; }
    if (e.k === 'beam') {
      const col = fcol(e.fac), w = (e.w || 2) * (0.6 + 0.4 * k);
      // 外の光 → 色の芯 → 白い芯
      c.strokeStyle = Art.hexA(col, 0.22 * k); c.lineWidth = w * 4.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(e.x1, e.y1); c.lineTo(e.x2, e.y2); c.stroke();
      c.strokeStyle = Art.hexA(col, 0.85 * k); c.lineWidth = w * 1.6; c.stroke();
      c.strokeStyle = `rgba(255,255,255,${0.95 * k})`; c.lineWidth = Math.max(0.8, w * 0.55); c.stroke();
      c.lineCap = 'butt';
      if (e.big) { const g = c.createRadialGradient(e.x2, e.y2, 0, e.x2, e.y2, 26 * k + 6); g.addColorStop(0, `rgba(255,255,255,${k})`); g.addColorStop(1, Art.hexA(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(e.x2, e.y2, 26 * k + 6, 0, 7); c.fill(); }
    } else if (e.k === 'muzzle' || e.k === 'impact') {
      const col = e.white ? '#fff0c8' : fcol(e.fac), rr = e.r * (e.k === 'impact' ? 1.4 - k * 0.5 : 0.6 + k * 0.6);
      const g = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, rr);
      g.addColorStop(0, `rgba(255,255,255,${k})`); g.addColorStop(0.35, Art.hexA(col, 0.7 * k)); g.addColorStop(1, Art.hexA(col, 0));
      c.fillStyle = g; c.beginPath(); c.arc(e.x, e.y, rr, 0, 7); c.fill();
    } else if (e.k === 'shield') {
      // 盾の波紋（六角の網目が一瞬見える）
      c.strokeStyle = `rgba(130,210,255,${0.75 * k})`; c.lineWidth = 1.6;
      c.beginPath(); c.arc(e.x, e.y, e.r, e.a, e.a + 2.2); c.stroke();
      c.strokeStyle = `rgba(200,240,255,${0.35 * k})`; c.lineWidth = 0.8;
      for (let i = 0; i < 6; i++) { const a = e.a + i * 0.37; c.beginPath(); c.moveTo(e.x + Math.cos(a) * e.r * 0.82, e.y + Math.sin(a) * e.r * 0.82); c.lineTo(e.x + Math.cos(a + 0.18) * e.r, e.y + Math.sin(a + 0.18) * e.r); c.stroke(); }
      const g = c.createRadialGradient(e.x, e.y, e.r * 0.6, e.x, e.y, e.r * 1.05); g.addColorStop(0, 'rgba(120,200,255,0)'); g.addColorStop(1, `rgba(120,200,255,${0.25 * k})`); c.fillStyle = g; c.beginPath(); c.arc(e.x, e.y, e.r * 1.05, 0, 7); c.fill();
    } else if (e.k === 'spark2') {
      e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= 0.94; e.vy *= 0.94;
      c.strokeStyle = e.col; c.globalAlpha = Math.min(1, k * 1.5); c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.x - e.vx * 0.05, e.y - e.vy * 0.05); c.stroke(); c.globalAlpha = 1;
    } else if (e.k === 'trail') {
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = `rgba(200,200,210,${k * 0.22})`; c.beginPath(); c.arc(e.x, e.y, e.r * (2 - k), 0, 7); c.fill();
      c.globalCompositeOperation = 'lighter';
      if (k > 0.75) { c.fillStyle = `rgba(255,170,80,${(k - 0.75) * 2})`; c.beginPath(); c.arc(e.x, e.y, e.r * 0.8, 0, 7); c.fill(); }
    } else if (e.k === 'pop') {
      c.strokeStyle = `rgba(255,230,170,${k})`; c.lineWidth = 1.5; c.beginPath(); c.arc(e.x, e.y, 10 * (1.3 - k), 0, 7); c.stroke();
      c.fillStyle = `rgba(255,240,200,${k})`; c.beginPath(); c.arc(e.x, e.y, 3 * k + 1, 0, 7); c.fill();
    } else if (e.k === 'flash') {
      const rr = e.r * (1.7 - k * 0.7), g = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, rr);
      g.addColorStop(0, `rgba(255,255,255,${k})`); g.addColorStop(0.3, e.ecl ? `rgba(255,120,190,${k * 0.8})` : `rgba(255,230,160,${k * 0.8})`); g.addColorStop(1, 'rgba(255,120,60,0)');
      c.fillStyle = g; c.beginPath(); c.arc(e.x, e.y, rr, 0, 7); c.fill();
    } else if (e.k === 'fire') {
      // 火の玉：白 → 黄 → 橙 → 赤 → 闇へ（蝕は桃 → 紫）
      const rr = e.r * (0.5 + (1 - k) * 0.9), g = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, rr);
      if (e.ecl) { g.addColorStop(0, `rgba(255,220,240,${k})`); g.addColorStop(0.35, `rgba(255,60,140,${k * 0.9})`); g.addColorStop(0.7, `rgba(140,20,160,${k * 0.6})`); }
      else { g.addColorStop(0, `rgba(255,255,230,${k})`); g.addColorStop(0.25, `rgba(255,220,110,${k * 0.95})`); g.addColorStop(0.55, `rgba(255,110,40,${k * 0.75})`); g.addColorStop(0.8, `rgba(160,30,20,${k * 0.4})`); }
      g.addColorStop(1, 'rgba(60,10,10,0)');
      c.fillStyle = g; c.beginPath(); c.arc(e.x, e.y, rr, 0, 7); c.fill();
    } else if (e.k === 'shock') {
      const rr = e.r * (1.1 - k);
      c.strokeStyle = e.ecl ? `rgba(255,90,160,${k * 0.8})` : `rgba(255,220,170,${k * 0.8})`; c.lineWidth = 3 * k + 0.5;
      c.beginPath(); c.arc(e.x, e.y, rr, 0, 7); c.stroke();
      c.strokeStyle = `rgba(255,255,255,${k * 0.4})`; c.lineWidth = 1; c.beginPath(); c.arc(e.x, e.y, rr * 0.92, 0, 7); c.stroke();
    } else if (e.k === 'ember') {
      e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= 0.965; e.vy *= 0.965;
      c.fillStyle = e.col; c.globalAlpha = Math.min(1, k * 1.4);
      c.beginPath(); c.arc(e.x, e.y, 1.1 + k * 1.3, 0, 7); c.fill();
      c.strokeStyle = e.col; c.lineWidth = 1; c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.x - e.vx * 0.06, e.y - e.vy * 0.06); c.stroke(); c.globalAlpha = 1;
    } else if (e.k === 'puff') {
      e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= 0.98; e.vy *= 0.98;
      c.globalCompositeOperation = 'source-over';
      const rr = e.r * (1.6 - k * 0.6), g = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, rr);
      const base = e.ecl ? '60,10,40' : e.dim ? '70,70,80' : '90,80,80';
      g.addColorStop(0, `rgba(${base},${k * (e.dim ? 0.35 : 0.45)})`); g.addColorStop(1, `rgba(${base},0)`);
      c.fillStyle = g; c.beginPath(); c.arc(e.x, e.y, rr, 0, 7); c.fill();
      c.globalCompositeOperation = 'lighter';
    } else if (e.k === 'chunk') {
      e.x += e.vx * dt; e.y += e.vy * dt; e.rot += e.vr * dt;
      c.globalCompositeOperation = 'source-over';
      c.save(); c.translate(e.x, e.y); c.rotate(e.rot); c.globalAlpha = Math.min(1, k * 1.5);
      c.fillStyle = '#3a4050'; c.fillRect(-e.s, -e.s * 0.5, e.s * 2, e.s); c.fillStyle = `rgba(255,140,60,${k})`; c.fillRect(-e.s, -e.s * 0.5, e.s * 0.6, e.s);
      c.restore(); c.globalCompositeOperation = 'lighter';
    } else if (e.k === 'deb') {
      e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= 0.97; e.vy *= 0.97; c.fillStyle = e.col; c.globalAlpha = k; c.fillRect(e.x, e.y, 2, 2); c.globalAlpha = 1;
    } else if (e.k === 'ring') { c.strokeStyle = `rgba(255,200,140,${k * 0.7})`; c.lineWidth = 2; c.beginPath(); c.arc(e.x, e.y, e.r * (1.4 - k), 0, 7); c.stroke(); }
    else if (e.k === 'spark' || e.k === 'smoke') { c.fillStyle = `rgba(255,230,170,${k})`; c.beginPath(); c.arc(e.x, e.y, 3 * (1.5 - k), 0, 7); c.fill(); }
    else if (e.k === 'mark') { c.strokeStyle = e.col; c.globalAlpha = k; c.lineWidth = 2; c.beginPath(); c.arc(e.x, e.y, 18 * (1.3 - k * 0.5), 0, 7); c.stroke(); c.globalAlpha = 1; }
  }
  function drawTerrain(c, t) {
    const r = Art.srand(t.seed);
    if (t.type === 'neb') {
      const g = c.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r);
      g.addColorStop(0, 'rgba(150,90,220,.32)'); g.addColorStop(1, 'rgba(90,60,200,0)');
      c.fillStyle = g; c.beginPath(); c.arc(t.x, t.y, t.r, 0, 7); c.fill();
    } else if (t.type === 'ast') {
      c.fillStyle = 'rgba(80,70,60,.18)'; c.beginPath(); c.arc(t.x, t.y, t.r, 0, 7); c.fill();
      for (let i = 0; i < 26; i++) {
        const a = r() * 7, d = Math.sqrt(r()) * t.r, s = 2 + r() * 6;
        c.fillStyle = `hsl(30,10%,${25 + r() * 25}%)`;
        c.beginPath(); c.ellipse(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, s, s * 0.7, r() * 3, 0, 7); c.fill();
      }
    } else {
      c.strokeStyle = 'rgba(160,170,190,.18)'; c.setLineDash([3, 5]); c.beginPath(); c.arc(t.x, t.y, t.r, 0, 7); c.stroke(); c.setLineDash([]);
      for (let i = 0; i < 9; i++) {
        const a = r() * 7, d = Math.sqrt(r()) * t.r * 0.9;
        c.save(); c.translate(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d); c.rotate(r() * 6);
        c.fillStyle = 'rgba(120,125,140,.7)'; c.fillRect(-8 - r() * 10, -2, 16 + r() * 14, 3 + r() * 3); c.restore();
      }
    }
  }

  return { simulate, run, FORMS, STANCES, LINES, TACTICS, DBG, styleOf, get state() { return S; }, power: (fl) => Game.fleetPower(fl) };
})();
