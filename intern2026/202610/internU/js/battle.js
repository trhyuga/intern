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

  let S = null;         // 戦いの状態
  let view = null;      // 表示（UI のとき）

  // ---------- 準備 ----------
  // setup: { pid, att: {fac, fleets:[]}, def: {fac, fleets:[], dock:true} }
  function build(setup) {
    const pl = setup.pid !== null && setup.pid !== undefined ? G.planets[setup.pid] : null;
    S = {
      t: 0, units: [], shots: [], fx: [], ftr: [], over: null, setup, planet: pl, uid: 1,
      side: { A: mkSide(setup.att, 'A'), D: mkSide(setup.def, 'D') },
      terrain: [], log: [],
    };
    // 地形
    const r = Art.srand((pl ? pl.seed : 77) + G.turn * 13);
    const nT = 1 + Math.floor(r() * 3);
    for (let i = 0; i < nT; i++) {
      const type = ['ast', 'neb', 'deb'][Math.floor(r() * 3)];
      S.terrain.push({ type, x: 80 + r() * 440, y: 330 + r() * 340, r: 60 + r() * 70, seed: Math.floor(r() * 1e6) });
    }
    deploy('A'); deploy('D');
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
    return S;
  }
  function mkSide(sd, key) {
    const fleets = sd.fleets || [];
    const lead = fleets.find(f => f.cmd) || null;
    return { key, fac: sd.fac, fleets, dock: !!sd.dock, cmd: lead ? lead.cmd : null, form: lead ? lead.form : 'line', skillUsed: false, buff: null, buffUntil: 0, ctrl: 'ai', lost: 0, sunk: 0 };
  }
  function mkUnit(side, fac, fleet, cmd) {
    return { id: S.uid++, side, fac, fleet, cmd, ships: [], x: 0, y: 0, ang: side === 'A' ? 0 : Math.PI, vx: 0, vy: 0, order: null, stance: 'fire', alive: true, out: false, sat: false, label: '', sel: false, aiT: Math.random() * 0.5, engaged: false };
  }
  function shipEntry(s, fac) {
    let st, hull;
    if (s.ecl) { const E = ECLIPSE_SHIPS[s.ecl]; st = { hp: E.hp, armor: E.armor, shield: E.shield, regen: E.regen || 0, pd: 0.1, ecm: 0, speed: E.speed, repair: 0, command: 0, weapons: E.weapons.map(w => ({ ...w })), size: E.size }; hull = s.ecl; }
    else { const d = G.designs[s.d]; st = Game.designStats(d, d.fac); hull = d.hull; }
    return { ref: s, hull, hp: s.hp, max: st.hp, shield: st.shield, smax: st.shield, regen: st.regen, armor: st.armor, pd: st.pd, ecm: st.ecm, size: st.size, speed: st.speed, repair: st.repair, command: st.command,
      weapons: st.weapons.map(w => ({ ...w, t: Math.random() * w.cd })), xp: s.xp || 0, dead: s.hp <= 0, hit: 0, ftrUp: 0 };
  }
  // 艦を設計ごとにまとめて分隊にする（1分隊 6隻、1艦隊 5分隊まで）
  function squads(ships) {
    const by = new Map();
    ships.filter(s => s.hp > 0).forEach(s => { const k = s.ecl || s.d; if (!by.has(k)) by.set(k, []); by.get(k).push(s); });
    const out = [];
    for (const list of by.values()) for (let i = 0; i < list.length; i += 6) out.push(list.slice(i, i + 6));
    return out.sort((a, b) => b.length - a.length);
  }
  function deploy(side) {
    const sd = S.side[side];
    const groups = [];
    sd.fleets.forEach(fl => squads(fl.ships).slice(0, 5).forEach(g => groups.push({ fl, g })));
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
      S.units.push(u);
    });
  }
  function labelOf(u) {
    const s = u.ships[0];
    if (s.ref && s.ref.ecl) return ECLIPSE_SHIPS[s.ref.ecl].name;
    if (s.ref && s.ref.d) return G.designs[s.ref.d].name;
    return '分隊';
  }

  // ---------- 計算 ----------
  const alive = u => u.alive && !u.out;
  const enemiesOf = side => S.units.filter(u => u.side !== side && alive(u));
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
    // 派閥・禁忌
    const f2 = Game.facOf(sd.fac);
    if (f2 && f2.ruling === 'war') m.dmg *= 1.05;
    return m;
  }
  function unitMods(u) {
    const sd = S.side[u.side], m = sideMods(sd);
    const cmd = u.cmd || sd.cmd;
    let cmdK = 1 + Math.max(0, ...u.ships.map(s => s.command || 0));
    if (cmd) {
      const o = OFF[cmd];
      m.dmg *= 1 + (o.tac - 50) / 220 * cmdK;
      m.taken *= 1 - (o.ldr - 50) / 320 * cmdK;
      if (o.pers === '猛進' && u.stance === 'assault') m.dmg *= 1.1;
      if (o.pers === '沈着' && u.stance === 'guard') m.taken *= 0.9;
      if (o.pers === '策士') m.flank += 0.12;
      if (o.pers === '野心') m.dmg *= 1.05;
    }
    // 副官
    const fl = u.fleet;
    if (fl && fl.sub) m.dmg *= 1 + (OFF[fl.sub].tac - 50) / 500;
    if (u.stance === 'assault') { m.dmg *= 1.15; m.taken *= 1.1; }
    if (u.stance === 'fire') m.acc *= 1.1;
    if (u.stance === 'guard') { m.dmg *= 0.85; m.taken *= 0.75; }
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
    let d = dmg * tm.taken;
    if (inTerrain(target.x, target.y, 'deb')) d *= 0.75;
    if (inTerrain(target.x, target.y, 'ast') && (type === 'kin' || type === 'msl')) d *= 0.85;
    // 禁忌「星喰らいの解析」は蝕に強い
    const sf = Game.facOf(S.side[srcSide].fac);
    if (sf && sf.forb.includes('f2') && target.fac === 'E') d *= 1.35;
    const live = target.ships.filter(s => !s.dead);
    if (!live.length) return;
    const s = Math.random() < 0.7 ? live[0] : live[Math.floor(Math.random() * live.length)];
    const sAbs = type === 'beam' ? 1 : type === 'kin' ? 0.5 : type === 'msl' ? 0.3 : 0.6;
    if (s.shield > 0) { const take = Math.min(s.shield, d * sAbs); s.shield -= take; d -= take; }
    const arm = s.armor * (type === 'beam' ? 0.5 : 1);
    d = Math.max(d * 0.15, d - arm);
    s.hp -= d; s.hit = 0.08;
    if (s.hp <= 0 && !s.dead) {
      s.dead = true; s.hp = 0;
      S.side[target.side].lost++; S.side[srcSide].sunk++;
      if (view) { boom(target, s, true); if (Sound) Sound.se(s.size >= 15 ? 'bigboom' : 'boom'); }
      if (!target.ships.some(x => !x.dead)) { target.alive = false; if (view) say(`${target.label}が全滅`, target.side === 'A' ? '#ff8a7a' : '#9ad0ff'); }
    }
  }
  function shipPos(u, i) {
    const n = u.ships.length, cols = Math.min(3, n);
    const row = Math.floor(i / cols), col = i % cols;
    const sp = 19;
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
          const dmg = w.dmg * m.dmg * flankMul(u, t, m.flank, sideMods(S.side[t.side]).circle) * (1 + s.xp * 0.04);
          const [sx, sy] = shipPos(u, u.ships.indexOf(s));
          if (w.type === 'beam') {
            if (Math.random() < acc) hit(t, dmg, 'beam', u.side);
            if (view) { const [tx, ty] = randomShipPos(t); S.fx.push({ k: 'beam', x1: sx, y1: sy, x2: tx + (Math.random() - 0.5) * 6, y2: ty + (Math.random() - 0.5) * 6, life: 0.14, max: 0.14, side: u.side, big: w.dmg > 60, fac: u.fac }); if (Math.random() < 0.35) Sound.se(w.dmg > 60 ? 'bigbeam' : 'beam'); }
          } else if (w.type === 'kin') {
            S.shots.push({ k: 'kin', x: sx, y: sy, t, dmg, acc, side: u.side, sp: 620, life: 2 });
            if (view && Math.random() < 0.3) Sound.se('rail');
          } else if (w.type === 'msl') {
            S.shots.push({ k: 'msl', x: sx, y: sy, t, dmg, acc: Math.min(1, acc + 0.1), side: u.side, sp: 170, life: 6, ang: u.ang - Math.PI / 2 + (Math.random() - 0.5) });
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
      const dx = tx - sh.x, dy = ty - sh.y, d = Math.hypot(dx, dy);
      if (sh.k === 'msl') {
        const want = Math.atan2(dy, dx);
        sh.ang = turnTo(sh.ang + Math.PI / 2, want + Math.PI / 2, dt * 3) - Math.PI / 2;
        sh.x += Math.cos(sh.ang) * sh.sp * dt; sh.y += Math.sin(sh.ang) * sh.sp * dt;
        if (view && Math.random() < 0.6) S.fx.push({ k: 'smoke', x: sh.x, y: sh.y, life: 0.5, max: 0.5 });
      } else { const v = Math.min(d, sh.sp * dt); sh.x += dx / d * v; sh.y += dy / d * v; }
      if (d < unitR(sh.t) * 0.6) {
        sh.life = 0;
        if (sh.k === 'msl') {
          const pd = Math.min(0.75, sh.t.ships.filter(x => !x.dead).reduce((a, x) => a + x.pd, 0) / Math.max(1, sh.t.ships.filter(x => !x.dead).length) * 1.3);
          if (Math.random() < pd) { if (view) S.fx.push({ k: 'pop', x: sh.x, y: sh.y, life: 0.25, max: 0.25 }); continue; }
        }
        if (Math.random() < sh.acc) { hit(sh.t, sh.dmg, sh.k, sh.side); if (view) S.fx.push({ k: 'spark', x: sh.x, y: sh.y, life: 0.3, max: 0.3, big: sh.k === 'msl' }); }
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
          if (view) S.fx.push({ k: 'beam', x1: f.x, y1: f.y, x2: f.t.x, y2: f.t.y, life: 0.08, max: 0.08, side: f.side, fac: f.fac });
          const pd = f.t.ships.filter(x => !x.dead).reduce((a, x) => a + x.pd, 0) / Math.max(1, f.t.ships.filter(x => !x.dead).length);
          if (Math.random() < pd * 0.35) { f.dead = true; if (view) S.fx.push({ k: 'pop', x: f.x, y: f.y, life: 0.25, max: 0.25 }); }
        }
      }
    }
    S.ftr = S.ftr.filter(f => !f.dead);
    // 効果
    for (const e of S.fx) e.life -= dt;
    S.fx = S.fx.filter(e => e.life > 0);
    // 終わり
    const aLeft = S.units.some(u => u.side === 'A' && alive(u)), dLeft = S.units.some(u => u.side === 'D' && alive(u));
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
  function ai(u) {
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
      if (sc > best) { best = sc; t = e; }
    }
    u.order = { type: 'attack', target: t };
    if (pers === '猛進' || u.fac === 'E') u.stance = 'assault';
    else if (pers === '沈着' && hpRatio < 0.5) u.stance = 'guard';
    else if (minRange(u) > 300) u.stance = 'fire';
    else u.stance = hpRatio > 0.6 && (pers === '奔放' ? Math.random() < 0.5 : pers === '野心') ? 'assault' : 'fire';
    if (u.side === 'D' && S.planet && S.t < 6 && pers !== '猛進') { u.order = null; u.stance = 'fire'; }
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
    if (sd.skillUsed || !sd.cmd || S.t < 8) return;
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
    if (s === 'repair') {
      S.units.filter(u => u.side === sk && alive(u)).forEach(u => u.ships.forEach(x => { if (!x.dead) x.hp = Math.min(x.max, x.hp + x.max * 0.25); }));
    } else { sd.buff = s; sd.buffUntil = S.t + (s === 'hold' ? 12 : 10); }
    if (s === 'charge') S.units.filter(u => u.side === sk && alive(u) && !u.sat).forEach(u => { if (u.stance !== 'retreat') u.stance = 'assault'; });
    if (view) cutin(sk, s);
    return true;
  }

  // ---------- 結果を世界に戻す ----------
  function apply() {
    const res = { winner: S.over, timeout: S.timeout, lostA: S.side.A.lost, lostD: S.side.D.lost, satLost: 0, dead: [], caught: [], sunkBy: {} };
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
          if (S.over === sk) { o.wins++; Game.addMerit(k, 3 + S.side[sk].sunk * 0.3); }
          else Game.addMerit(k, 1);
          if (fl.ships.length === 0) {
            const f = Game.facOf(fl.fac);
            const deathP = f && f.forb.includes('f3') ? 0.04 : 0.13;
            const r = Math.random();
            if (r < deathP) { Game.freeOfficer(k); o.st = 'dead'; o.diedAt = G.turn; o.diedWhere = S.planet ? S.planet.name : '宇宙'; res.dead.push(k); }
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
  function run(setup, playerSide) {
    return new Promise(res => {
      resolveFn = res;
      build(setup);
      mySide = playerSide;
      S.side[playerSide].ctrl = 'player';
      S.side[playerSide === 'A' ? 'D' : 'A'].ctrl = 'ai';
      view = true; paused = true; hold = 0; speed = 1; sel = []; msgs = []; cut = null; endShown = false;
      openView();
      intro();
    });
  }
  function openView() {
    const el = document.getElementById('battle');
    el.innerHTML = `
      <canvas id="bcv"></canvas>
      <div class="b-top">
        <div class="b-side b-me"><b></b><div class="bar"><i></i></div></div>
        <div class="b-time"></div>
        <div class="b-side b-en"><b></b><div class="bar"><i></i></div></div>
      </div>
      <div class="b-msgs"></div>
      <div class="b-cut"></div>
      <div class="b-ctrl">
        <div class="b-row b-sel"></div>
        <div class="b-row b-st">
          ${Object.entries(STANCES).map(([k, v]) => `<button data-st="${k}">${v.name}</button>`).join('')}
        </div>
        <div class="b-row b-fm">
          ${Object.entries(FORMS).map(([k, v]) => `<button data-fm="${k}">${v.name.replace('陣', '')}</button>`).join('')}
          <button data-a="skill" class="b-skill">奥の手</button>
        </div>
        <div class="b-row b-main">
          <button data-a="all">全隊</button>
          <button data-a="pause" class="b-play">▶ 開始</button>
          <button data-a="speed">×1</button>
          <button data-a="auto">自動</button>
          <button data-a="flee" class="b-flee">撤退</button>
        </div>
      </div>
      <div class="b-help">分隊をタップで選ぶ → 宇宙をタップで移動、敵をタップで攻撃。止めている間も命令できます。</div>`;
    UI.show('battle');
    cv = el.querySelector('#bcv'); ctx = cv.getContext('2d');
    resize();
    const sd = S.side[mySide], ed = S.side[mySide === 'A' ? 'D' : 'A'];
    el.querySelector('.b-me b').textContent = sideName(sd);
    el.querySelector('.b-en b').textContent = sideName(ed);
    el.querySelector('.b-me .bar i').style.background = Game.ownerCol(sd.fac);
    el.querySelector('.b-en .bar i').style.background = Game.ownerCol(ed.fac);
    const hues = S.planet ? [SYSTEMS[S.planet.sys].hue, SYSTEMS[S.planet.sys].hue + 40, 230] : [230, 280];
    bg = Art.nebulaCanvas(300, 500, (S.planet ? S.planet.seed : 5) + 99, hues, { alpha: 0.07, stars: 260 });
    cv.addEventListener('pointerdown', onTap);
    el.querySelector('.b-ctrl').addEventListener('click', onCtrl);
    window.addEventListener('resize', resize);
    last = performance.now();
    raf = requestAnimationFrame(loop);
    updateCtrl();
    Sound.bgm(S.side.A.fac === 'E' || S.side.D.fac === 'E' ? 'crisis' : 'battle');
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
  }
  function toWorld(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - ox) / scale, (e.clientY - r.top - oy) / scale]; }
  function onTap(e) {
    if (S.over) return;
    const [x, y] = toWorld(e);
    let hitU = null, bd = 40;
    for (const u of S.units) { if (!alive(u)) continue; const d = Math.hypot(u.x - x, u.y - y) - unitR(u) * 0.5; if (d < bd) { bd = d; hitU = u; } }
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
    if (b.dataset.st) { const list = sel.length ? sel : S.units.filter(u => u.side === mySide && alive(u) && !u.sat); list.forEach(u => { u.stance = b.dataset.st; if (b.dataset.st === 'retreat' || b.dataset.st === 'guard') u.order = null; }); }
    if (b.dataset.fm) { S.side[mySide].form = b.dataset.fm; say(`陣形を${FORMS[b.dataset.fm].name}に`, '#bfe0ff'); }
    const a = b.dataset.a;
    if (a === 'pause') { paused = !paused; if (!paused) { last = performance.now(); } }
    if (a === 'speed') speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
    if (a === 'all') sel = sel.length ? [] : S.units.filter(u => u.side === mySide && alive(u) && !u.sat);
    if (a === 'skill') { if (useSkill(mySide)) { paused = false; } }
    if (a === 'auto') { S.side[mySide].ctrl = S.side[mySide].ctrl === 'ai' ? 'player' : 'ai'; }
    if (a === 'flee') { UI.confirm('全軍を撤退させますか？（自陣の端まで下がった分隊は戦場を離れます）', () => { S.units.filter(u => u.side === mySide && alive(u) && !u.sat).forEach(u => { u.stance = 'retreat'; u.order = null; }); paused = false; updateCtrl(); }); }
    updateCtrl();
  }
  function updateCtrl() {
    const el = document.getElementById('battle'); if (!el || !S) return;
    const sd = S.side[mySide];
    el.querySelectorAll('[data-fm]').forEach(b => b.classList.toggle('on', sd.form === b.dataset.fm));
    const ref = sel[0];
    el.querySelectorAll('[data-st]').forEach(b => b.classList.toggle('on', !!ref && sel.every(u => u.stance === b.dataset.st)));
    const pb = el.querySelector('[data-a=pause]'); pb.textContent = paused ? '▶ 再開' : '❚❚ 停止'; pb.classList.toggle('hot', paused);
    if (S.t === 0 && paused) pb.textContent = '▶ 開始';
    el.querySelector('[data-a=speed]').textContent = '×' + speed;
    el.querySelector('[data-a=auto]').classList.toggle('on', sd.ctrl === 'ai');
    el.querySelector('[data-a=all]').classList.toggle('on', sel.length > 1);
    const skb = el.querySelector('[data-a=skill]');
    if (sd.cmd) { skb.textContent = sd.skillUsed ? '奥の手（済）' : SKILLS[skillOf(sd.cmd)].name; skb.disabled = sd.skillUsed; }
    else { skb.textContent = '奥の手なし'; skb.disabled = true; }
    const info = el.querySelector('.b-sel');
    if (ref) {
      const live = ref.ships.filter(s => !s.dead);
      const hp = live.reduce((a, s) => a + s.hp, 0), mx = ref.ships.reduce((a, s) => a + s.max, 0);
      info.innerHTML = `<b>${sel.length > 1 ? `全${sel.length}分隊` : ref.label}</b><span>${sel.length > 1 ? '' : `${live.length}/${ref.ships.length}隻・耐久${Math.round(hp / mx * 100)}%・${STANCES[ref.stance].name}`}</span>`;
    } else info.innerHTML = `<span class="dim">陣形：${FORMS[sd.form].name} ― ${FORMS[sd.form].desc}</span>`;
  }
  function say(t, col = '#fff') { msgs.push({ t, col, life: 3 }); if (msgs.length > 4) msgs.shift(); }
  function boom(u, s, big) {
    const i = u.ships.indexOf(s); const [x, y] = shipPos(u, i);
    const n = big ? 22 + s.size : 8;
    for (let k = 0; k < n; k++) { const a = Math.random() * 7, v = 20 + Math.random() * 90 * (s.size / 10); S.fx.push({ k: 'deb', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.9, max: 1.5, col: Math.random() < 0.5 ? '#ffd27a' : '#ff7a3a' }); }
    S.fx.push({ k: 'flash', x, y, r: s.size * 3.2, life: 0.5, max: 0.5 });
    S.fx.push({ k: 'ring', x, y, r: s.size * 4, life: 0.7, max: 0.7 });
  }
  function intro() {
    const a = S.side[mySide], e = S.side[mySide === 'A' ? 'D' : 'A'];
    const el = document.querySelector('#battle .b-cut');
    const lineOf = (sd) => sd.fac === 'E' ? ECL_LINE.start : sd.cmd ? R.pick(LINES[OFF[sd.cmd].pers].start) : '迎え撃て！';
    const card = (sd, cls) => `<div class="vs-card ${cls}" style="--c:${Game.ownerCol(sd.fac)}">${sd.cmd ? `<img src="${Portrait.url(sd.cmd, 'angry')}">` : `<div class="vs-em"></div>`}<div><b>${sd.cmd ? OFF[sd.cmd].name : sideName(sd)}</b><p>「${lineOf(sd)}」</p></div></div>`;
    el.innerHTML = `<div class="vs">${card(e, 'en')}<div class="vs-x">VS</div>${card(a, 'me')}<div class="vs-where">${S.planet ? S.planet.name + ' 宙域' : '星間宙域'}${S.terrain.length ? ' ― ' + S.terrain.map(t => ({ ast: '小惑星帯', neb: '星雲', deb: '残骸' })[t.type]).join('・') : ''}</div></div>`;
    el.classList.add('show');
    Sound.se('alarm');
    const close = () => { el.removeEventListener('click', close); if (!el.querySelector('.vs')) return; el.classList.remove('show'); el.innerHTML = ''; };
    el.addEventListener('click', close);
    setTimeout(close, 3200);
  }
  function cutin(sk, s) {
    const sd = S.side[sk];
    const el = document.querySelector('#battle .b-cut');
    if (!el || !sd.cmd) return;
    const line = sd.fac === 'E' ? ECL_LINE.skill : LINES[OFF[sd.cmd].pers].skill;
    el.innerHTML = `<div class="cutin ${sk === mySide ? 'me' : 'en'}" style="--c:${Game.ownerCol(sd.fac)}"><img src="${Portrait.url(sd.cmd, 'angry')}"><div><small>${SKILLS[s].name}</small><b>「${line}」</b><span>${OFF[sd.cmd].name}</span></div></div>`;
    el.classList.add('show');
    Sound.se('skill');
    // カットインの間だけ時間を止める（一時停止ボタンの状態とは別に数える）
    hold++;
    setTimeout(() => { hold--; if (!hold && !endShown) { el.classList.remove('show'); el.innerHTML = ''; } last = performance.now(); }, 1600);
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
    const line = sd.cmd ? LINES[OFF[sd.cmd].pers][won ? 'win' : 'lose'] : '';
    el.innerHTML = `<div class="b-result ${won ? 'win' : 'lose'}"><h2>${won ? '勝利' : S.timeout ? '時間切れ' : '敗北'}</h2>
      ${sd.cmd ? `<img src="${Portrait.url(sd.cmd, won ? 'happy' : 'sad')}"><p>「${line}」</p>` : ''}
      <div class="b-stat">撃沈 ${S.side[mySide].sunk}隻 ／ 喪失 ${S.side[mySide].lost}隻</div>
      <button class="btn primary">戦いを終える</button></div>`;
    el.classList.add('show');
    Sound.se(won ? 'fanfare' : 'lose');
    el.querySelector('button').onclick = () => {
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
    c.fillStyle = '#02030a'; c.fillRect(0, 0, r.width, r.height);
    c.drawImage(bg, 0, 0, r.width, r.height);
    c.save(); c.translate(ox, oy); c.scale(scale, scale);
    // 惑星
    if (S.planet) Art.planet(c, W / 2, -150, 260, S.planet.type, S.planet.seed, { t: S.t });
    // 地形
    for (const t of S.terrain) drawTerrain(c, t);
    // 自陣・敵陣の線
    c.strokeStyle = 'rgba(120,180,255,.12)'; c.setLineDash([6, 10]); c.beginPath(); c.moveTo(0, H - 40); c.lineTo(W, H - 40); c.stroke(); c.setLineDash([]);
    // 命令の線
    for (const u of S.units) {
      if (!alive(u) || u.side !== mySide || !u.order) continue;
      c.strokeStyle = u.order.type === 'attack' ? 'rgba(255,110,90,.45)' : 'rgba(120,200,255,.4)';
      c.lineWidth = 1.5; c.setLineDash([5, 6]); c.beginPath(); c.moveTo(u.x, u.y);
      const t = u.order.type === 'attack' ? u.order.target : u.order; c.lineTo(t.x, t.y); c.stroke(); c.setLineDash([]);
    }
    // 艦
    for (const u of S.units) {
      if (!alive(u)) continue;
      const col = Game.ownerCol(u.fac);
      const isSel = sel.includes(u);
      // 足元の輪
      c.beginPath(); c.arc(u.x, u.y, unitR(u), 0, 7);
      c.fillStyle = Art.hexA(col, isSel ? 0.18 : 0.07); c.fill();
      c.strokeStyle = isSel ? '#ffffff' : Art.hexA(col, 0.5); c.lineWidth = isSel ? 2 : 1; c.stroke();
      u.ships.forEach((s, i) => {
        if (s.dead) return;
        const [x, y] = shipPos(u, i);
        Art.ship(c, s.hull, x, y, u.ang, s.size * 1.9, col, { hit: s.hit > 0 });
        if (s.shield > 0 && s.hit > 0) { c.strokeStyle = 'rgba(120,200,255,.7)'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, s.size * 1.2, 0, 7); c.stroke(); }
      });
      // 耐久
      const hp = u.ships.reduce((a, s) => a + Math.max(0, s.hp), 0), mx = u.ships.reduce((a, s) => a + s.max, 0);
      const bw = 44, by = u.y + unitR(u) + 4;
      c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(u.x - bw / 2, by, bw, 4);
      c.fillStyle = hp / mx > 0.5 ? '#7ae08a' : hp / mx > 0.25 ? '#f0c050' : '#ff5a4a'; c.fillRect(u.x - bw / 2, by, bw * hp / mx, 4);
      if (u.side === mySide && !u.sat) {
        c.fillStyle = '#dfefff'; c.font = '13px sans-serif'; c.textAlign = 'center';
        c.fillText(STANCES[u.stance].name, u.x, by + 17);
      }
    }
    // 艦載機
    for (const f of S.ftr) { c.fillStyle = Game.ownerCol(f.fac); c.save(); c.translate(f.x, f.y); c.rotate(f.ang); c.beginPath(); c.moveTo(4, 0); c.lineTo(-3, 2.5); c.lineTo(-3, -2.5); c.closePath(); c.fill(); c.restore(); }
    // 弾
    for (const sh of S.shots) {
      if (sh.k === 'msl') { c.fillStyle = '#ffe0a0'; c.beginPath(); c.arc(sh.x, sh.y, 2.2, 0, 7); c.fill(); }
      else { c.strokeStyle = '#fff3c0'; c.lineWidth = 2; c.beginPath(); c.moveTo(sh.x, sh.y); const d = Math.hypot(sh.t.x - sh.x, sh.t.y - sh.y) || 1; c.lineTo(sh.x - (sh.t.x - sh.x) / d * 14, sh.y - (sh.t.y - sh.y) / d * 14); c.stroke(); }
    }
    // 効果
    c.globalCompositeOperation = 'lighter';
    for (const e of S.fx) {
      const k = e.life / e.max;
      if (e.k === 'beam') {
        const col = e.fac === 'E' ? '255,50,120' : e.side === 'A' ? '120,220,255' : '255,140,110';
        c.strokeStyle = `rgba(${col},${k})`; c.lineWidth = e.big ? 4 : 1.6;
        c.beginPath(); c.moveTo(e.x1, e.y1); c.lineTo(e.x2, e.y2); c.stroke();
        if (e.big) { c.strokeStyle = `rgba(255,255,255,${k})`; c.lineWidth = 1.2; c.stroke(); }
      } else if (e.k === 'smoke') { c.fillStyle = `rgba(255,190,120,${k * 0.4})`; c.beginPath(); c.arc(e.x, e.y, 2 + (1 - k) * 3, 0, 7); c.fill(); }
      else if (e.k === 'spark' || e.k === 'pop') { c.fillStyle = `rgba(255,230,170,${k})`; c.beginPath(); c.arc(e.x, e.y, (e.big ? 8 : 4) * (1.5 - k), 0, 7); c.fill(); }
      else if (e.k === 'deb') { e.x += e.vx * 0.016; e.y += e.vy * 0.016; e.vx *= 0.97; e.vy *= 0.97; c.fillStyle = e.col; c.globalAlpha = k; c.fillRect(e.x, e.y, 2, 2); c.globalAlpha = 1; }
      else if (e.k === 'flash') { const g = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * (1.6 - k)); g.addColorStop(0, `rgba(255,250,220,${k})`); g.addColorStop(0.4, `rgba(255,160,80,${k * 0.6})`); g.addColorStop(1, 'rgba(255,80,40,0)'); c.fillStyle = g; c.beginPath(); c.arc(e.x, e.y, e.r * (1.6 - k), 0, 7); c.fill(); }
      else if (e.k === 'ring') { c.strokeStyle = `rgba(255,200,140,${k * 0.7})`; c.lineWidth = 2; c.beginPath(); c.arc(e.x, e.y, e.r * (1.4 - k), 0, 7); c.stroke(); }
      else if (e.k === 'mark') { c.strokeStyle = e.col; c.globalAlpha = k; c.lineWidth = 2; c.beginPath(); c.arc(e.x, e.y, 18 * (1.3 - k * 0.5), 0, 7); c.stroke(); c.globalAlpha = 1; }
    }
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
      el.querySelector('.b-time').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}${paused ? ' ❚❚' : ''}`;
      el.querySelector('.b-msgs').innerHTML = msgs.map(m => `<div style="color:${m.col};opacity:${Math.min(1, m.life)}">${m.t}</div>`).join('');
    }
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

  return { simulate, run, FORMS, STANCES, LINES, get state() { return S; }, power: (fl) => Game.fleetPower(fl) };
})();
