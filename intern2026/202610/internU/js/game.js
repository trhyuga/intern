// ============================================================
//  ゲームの状態と進行（内政・技術・人事・艦隊・ターン・セーブ）
// ============================================================
var G = null;

// ---------- 乱数 ----------
const R = {
  f: () => Math.random(),
  i: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
  pick: a => a[Math.floor(Math.random() * a.length)],
  chance: p => Math.random() < p,
};
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ---------- 士官（変わらない情報） ----------
const OFFICERS = OFFICER_SRC.trim().split('\n').map(l => {
  const p = l.split('|');
  const fac = p[3] === '-' ? null : (/^m\d$/.test(p[3]) ? p[3] : +p[3]);
  return {
    key: p[0], name: p[1], epi: p[2], fac0: fac,
    ldr: +p[4], tac: +p[5], pol: +p[6], dip: +p[7], sci: +p[8],
    pers: p[9], female: p[10] === 'f', age: +p[11], tags: p[12] ? p[12].split(' ') : [],
    loc: p[13] === '' ? null : +p[13], appear: p[14] ? +p[14] : 1,
  };
});
const OFF = Object.fromEntries(OFFICERS.map(o => [o.key, o]));
const shortName = o => (o.name.split('・')[0]);

// ---------- 階級（少尉〜元帥。武功で上がる） ----------
const OFFRANKS = ['少尉', '中尉', '大尉', '少佐', '中佐', '大佐', '准将', '少将', '中将', '大将', '元帥'];
const RANK_MERIT = [0, 6, 14, 24, 36, 50, 68, 90, 116, 146, 180];
const RANK_CAP = [8, 8, 10, 12, 14, 16, 20, 22, 26, 30, 30];   // 率いられる艦の数
// 最初の武功：能力と年齢（経験）から
function initMerit(o) {
  const age = o.age || 35;
  let m = Math.max(0, (o.ldr + o.tac - 100) * 0.8) + (age >= 55 ? 25 : age >= 40 ? 15 : age >= 30 ? 6 : 0);
  if (o.tags.includes('cyber') && !o.age) m += 10;
  return Math.min(120, Math.round(m));
}

const Game = (() => {
  // ---------- 小道具 ----------
  const facOf = id => (typeof id === 'number' ? G.facs[id] : null);
  const isMajor = o => typeof o === 'number';
  const ownerName = o => o === null || o === undefined ? '独立惑星' : o === 'E' ? '蝕' : isMajor(o) ? FACTIONS[o].name : MINORS.find(m => m.id === o).name;
  const ownerShort = o => o === null || o === undefined ? '独立' : o === 'E' ? '蝕' : isMajor(o) ? FACTIONS[o].short : MINORS.find(m => m.id === o).short;
  const ownerCol = o => o === null || o === undefined ? '#8a93a6' : o === 'E' ? '#ff2a6a' : isMajor(o) ? FACTIONS[o].col : MINORS.find(m => m.id === o).col;
  const relKey = (a, b) => a < b ? a + '|' + b : b + '|' + a;
  const rel = (a, b) => G.rel[relKey(a, b)];
  const dateStr = (t = G.turn) => { const m = (t - 1) % 12 + 1, y = CONFIG.startYear + Math.floor((t - 1) / 12); return `宇宙暦${y}年 ${m}月`; };
  const off = k => G.officers[k];

  function log(text, kind = 'info', fac = null) {
    G.log.unshift({ t: G.turn, text, kind, fac });
    if (G.log.length > 300) G.log.length = 300;
  }

  // ---------- 航路 ----------
  let LANES = [];   // [[a,b], ...]
  let ADJ = [];     // ADJ[id] = [ids]
  function buildLanes() {
    const P = G.planets;
    const set = new Set(), lanes = [];
    const add = (a, b) => { const k = a < b ? a + '-' + b : b + '-' + a; if (!set.has(k) && a !== b) { set.add(k); lanes.push([a, b]); } };
    for (const s of SYSTEMS) {
      const ids = P.filter(p => p.sys === s.id && !p.abyss).map(p => p.id);
      // 最小全域木
      const inT = [ids[0]];
      while (inT.length < ids.length) {
        let best = null;
        for (const a of inT) for (const b of ids) if (!inT.includes(b)) { const d = dist(P[a], P[b]); if (!best || d < best[2]) best = [a, b, d]; }
        add(best[0], best[1]); inT.push(best[1]);
      }
      // 近いもの同士を少し足す
      for (const a of ids) {
        const near = ids.filter(b => b !== a).sort((x, y) => dist(P[a], P[x]) - dist(P[a], P[y]));
        if (dist(P[a], P[near[1]]) < 175) add(a, near[1]);
      }
    }
    GATE_LANES.forEach(([a, b]) => add(a, b));
    Eclipse.lanes(add);
    LANES = lanes;
    ADJ = P.map(() => []);
    lanes.forEach(([a, b]) => { ADJ[a].push(b); ADJ[b].push(a); });
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // 最短の道（通れるかどうかは pass(id) で判断）
  function path(from, to, pass) {
    if (from === to) return [from];
    const prev = new Map([[from, -1]]), q = [from];
    while (q.length) {
      const c = q.shift();
      for (const n of ADJ[c]) {
        if (prev.has(n)) continue;
        if (n !== to && pass && !pass(n)) continue;
        prev.set(n, c);
        if (n === to) { const r = [to]; let x = c; while (x !== -1) { r.unshift(x); x = prev.get(x); } return r; }
        q.push(n);
      }
    }
    return null;
  }
  function hops(from, to) { const p = path(from, to); return p ? p.length - 1 : 99; }

  // ---------- 関係 ----------
  // a（勢力）が、持ち主 o の惑星を攻めてよいか
  function canAttack(a, o) {
    if (o === a) return false;
    if (o === null || o === undefined || o === 'E') return true;
    if (a === 'E') return true;
    if (isMajor(o)) { if (!isMajor(a)) return true; return rel(a, o).s === 'war'; }
    // 小勢力
    const m = G.minors[o];
    if (m.ally === a) return false;
    if (m.ally !== null && isMajor(a)) return rel(a, m.ally).s === 'war';
    return true;
  }
  // a と b が味方同士か（同じ勢力・同盟・小勢力の盟約）
  function friendly(a, b) {
    if (a === b) return true;
    if (a === null || b === null || a === 'E' || b === 'E') return false;
    if (isMajor(a) && isMajor(b)) return rel(a, b).s === 'ally';
    if (isMajor(a) && !isMajor(b)) return G.minors[b].ally === a;
    if (!isMajor(a) && isMajor(b)) return G.minors[a].ally === b;
    return false;
  }
  // a の艦隊が惑星 id に入れるか（攻めるか、味方の星か）
  function canEnter(a, id) {
    if (G.planets[id].abyss && !Eclipse.canEnterAbyss(a)) return false;   // 深淵には封印の理論が要る
    const o = G.planets[id].owner;
    return friendly(a, o) || canAttack(a, o);
  }

  // ---------- 艦 ----------
  function designStats(d, fid) {
    const h = HULLS[d.hull], f = facOf(fid);
    const t = f ? f.tech : { wep: 0, eng: 0, def: 0, eco: 0 };
    const fb = f ? FACTIONS[fid].bonus : {};
    let hp = h.hp, armor = 1, shield = 0, regen = 0, pd = 0, ecm = 0, speed = h.speed, repair = 0, command = 0, cost = h.cost;
    const weapons = [];
    for (const k of d.mods) {
      const m = MODULES[k]; cost += m.cost;
      if (m.kind === 'weapon') {
        if (m.type === 'ftr') { weapons.push({ type: 'ftr', dmg: m.dmg, range: m.range, cd: m.cd, n: 2 }); }
        else weapons.push({ type: m.type, dmg: m.dmg, range: m.range, cd: m.cd });
      }
      if (m.armor) { armor += m.armor; hp += m.hp; }
      if (m.shield) { shield += m.shield; regen += m.regen; }
      if (m.pd) pd = 1 - (1 - pd) * (1 - m.pd);
      if (m.ecm) ecm += m.ecm;
      if (m.speed) speed *= 1 + m.speed;
      if (m.repair) repair += m.repair;
      if (m.command) command += m.command;
    }
    const hpMul = 1 + t.def * 0.08 + (f && f.forb.includes('f2') ? 0.1 : 0);
    const dmgMul = 1 + t.wep * 0.07 + (fb.dmg || 0);
    hp = Math.round(hp * hpMul); shield = Math.round(shield * (1 + t.def * 0.08));
    speed = speed * (1 + t.eng * 0.04 + (fb.speed || 0) + (typeof People !== 'undefined' && G && f ? People.buff(fid, 'speed') : 0) + (G.minors && G.minors.m4 && G.minors.m4.ally === fid ? 0.1 + ((G.minors.m4.guideUntil || 0) >= G.turn ? 0.15 : 0) : 0));
    weapons.forEach(w => w.dmg *= dmgMul);
    const dps = weapons.reduce((s, w) => s + w.dmg / w.cd * (w.n || 1), 0);
    return { hp, armor, shield, regen, pd, ecm: Math.min(0.4, ecm), speed, repair, command, weapons, cost, turns: h.turns, size: h.size, dps, hull: d.hull };
  }
  function designCost(d, fid) {
    let c = designStats(d, fid).cost;
    const f = facOf(fid);
    if (f && f.ruling === 'war') c *= 0.8;
    if (f && typeof People !== 'undefined' && G) c *= 1 - Math.min(0.4, People.buff(fid, 'build'));
    return Math.round(c);
  }
  function designUnlocked(d, fid) {
    const f = facOf(fid);
    const ok = req => Object.entries(req).every(([k, v]) => k === 'forb' ? f.forb.includes(v) : f.tech[k] >= v);
    if (!ok(HULLS[d.hull].req)) return false;
    return d.mods.every(m => ok(MODULES[m].req));
  }
  function newDesign(fid, name, hull, mods, auto = false) {
    const id = 'd' + (G.nextId++);
    G.designs[id] = { id, fac: fid, name, hull, mods: mods.slice(), auto };
    if (isMajor(fid)) G.facs[fid].designs.push(id);
    return id;
  }
  function newShip(did) {
    const d = G.designs[did];
    return { d: did, hp: designStats(d, d.fac).hp, xp: 0 };
  }
  function shipMaxHp(s) { if (s.ecl) return ECLIPSE_SHIPS[s.ecl].hp * (s.m || 1); const d = G.designs[s.d]; return designStats(d, d.fac).hp; }
  function shipPower(s) {
    if (s.ecl) { const E = ECLIPSE_SHIPS[s.ecl]; return s.hp * 0.04 * (1 + E.armor * 0.03) + E.weapons.reduce((a, w) => a + w.dmg / w.cd, 0) * 1.6 * (s.m || 1); }
    const d = G.designs[s.d]; const st = designStats(d, d.fac);
    return (s.hp + st.shield * 0.6) * (1 + st.armor * 0.03) * 0.04 + st.dps * 1.6 * (1 + s.xp * 0.05);
  }
  function fleetPower(fl) {
    let p = fl.ships.reduce((a, s) => a + shipPower(s), 0);
    if (fl.cmd) { const o = OFF[fl.cmd]; p *= 1 + (o.ldr + o.tac - 100) / 250; }
    return p;
  }
  function dockPower(pl) { return pl.dock.reduce((a, s) => a + shipPower(s), 0); }
  function satPower(pl) {
    if (!pl.def) return 0;
    const f = facOf(pl.owner); const t = f ? f.tech.def : 1;
    return pl.def * (18 + t * 3) * (pl.owner === 'E' && pl.type === 'rift' ? 4 : 1) * (pl.cap ? 2.2 : 1) * (isMajor(pl.owner) && G.facs[pl.owner].nPl !== undefined && G.facs[pl.owner].nPl <= 3 ? 2 : 1);   // 追い詰められた国の最後の抵抗
  }
  function planetDefense(pl) {
    let p = satPower(pl) + dockPower(pl);
    for (const fl of G.fleets) if (fl.at === pl.id && friendly(fl.fac, pl.owner) && !fl.dest) p += fleetPower(fl);
    return p;
  }
  const RANKS = ['新兵', '熟練', '精鋭', '歴戦'];
  const rankOf = xp => RANKS[Math.min(3, Math.floor(xp / 2))];

  // ---------- 新しいゲーム ----------
  function newGame(playerFid) {
    G = {
      v: 1, turn: 1, player: playerFid, nextId: 1, over: null,
      facs: [], designs: {}, rel: {}, planets: [], minors: {}, officers: {}, fleets: [],
      eclipse: { eta: CONFIG.eclipseBase + R.i(-6, 8), arrived: false, rift: null, site: null, defeated: false, wave: 0, omen: 0, phase: 'none', cycle: 1, rifts: [], hintN: 0, hintAt: 0, eaten: 0, etaFixed: true },
      log: [], flags: {}, evDone: {}, pending: [], demands: {},
      rec: { battles: 0, won: 0, lost: 0, sunk: 0, lostShips: 0, big: [], captured: 0, allies: 0 },
    };
    // 惑星
    PLANET_SRC.forEach(([id, name, sys, dx, dy, type, pop, owner, desc]) => {
      const S = SYSTEMS[sys], pt = PTYPES[type];
      const cap = FACTIONS.some(f => f.capital === id);
      G.planets.push({
        id, name, sys, x: S.x + dx, y: S.y + dy, type, desc, owner,
        pop, maxPop: Math.round(pop * 1.45 * pt.pop + 6),
        ind: cap ? 4 : owner === null ? 1 : 2 + (type === 'barren' || type === 'desert' ? 1 : 0),
        res: cap ? 3 : owner === null ? 1 : 1 + (type === 'ice' || type === 'ruin' ? 1 : 0),
        def: cap ? 6 : owner === null ? 2 : typeof owner === 'string' ? 4 : 3,
        yard: cap ? 2 : (owner !== null && pop >= 35 ? 1 : 0),
        stab: owner === null ? 55 : 70, focus: 'ind', prog: 0, gov: null, build: [], dock: [], cap,
        seed: (id * 7919) % 1000,
      });
    });
    // 勢力
    FACTIONS.forEach(F => {
      G.facs.push({
        id: F.id, alive: true, funds: 400, rp: 0, tech: { wep: 0, eng: 0, def: 0, eco: 0 }, forb: [], researching: 'wep',
        capital: F.capital, leader: F.leader, parties: { ...F.parties }, ruling: null, demand: null, designs: [],
        stats: { wins: 0, losses: 0, captured: 0, treaties: 0, techs: 0 }, warWeary: 0,
      });
    });
    G.facs.forEach(f => { f.ruling = rulingOf(f); });
    // 関係
    for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) G.rel[relKey(a, b)] = { s: 'neutral', t: 0, since: 0 };
    START_RELATIONS.forEach(([a, b, s, t]) => { G.rel[relKey(a, b)] = { s, t, since: 0 }; });
    // 小勢力
    MINORS.forEach(m => { G.minors[m.id] = { id: m.id, ally: null, paid: false, wins: {} }; });
    // 士官
    OFFICERS.forEach(o => {
      let st = 'act', loc = null;
      if (o.fac0 === null) { st = o.appear <= 1 ? 'free' : 'hidden'; loc = o.loc; }
      G.officers[o.key] = { fac: o.fac0, st, loc, loyal: o.fac0 === null ? 0 : (FACTIONS.some(f => f.leader === o.key) ? 100 : R.i(70, 92)), merit: initMerit(o), battles: 0, wins: 0, kills: 0, busy: 0, role: null, ever: o.fac0 };
    });
    // 設計
    for (const F of FACTIONS) {
      START_DESIGNS.common.forEach(d => newDesign(F.id, d.name, d.hull, d.mods));
    }
    buildLanes();
    // 総督（政治の高い順に、人口の多い星から）
    for (const F of FACTIONS) {
      const offs = officersOf(F.id).sort((a, b) => OFF[b].pol - OFF[a].pol);
      const pls = G.planets.filter(p => p.owner === F.id).sort((a, b) => b.pop - a.pop);
      pls.forEach((p, i) => { if (offs[i] && !(OFF[offs[i]].ldr >= 80 && i > 0)) setGov(p.id, offs[i]); });
      // 最初の艦隊（統率の高い順に2つ）
      const cmds = officersOf(F.id).filter(k => off(k).role === null).sort((a, b) => (OFF[b].ldr + OFF[b].tac) - (OFF[a].ldr + OFF[a].tac));
      const ds = G.facs[F.id].designs;
      const mk = (cmd, at, list) => { const fl = newFleet(F.id, cmd, at); list.forEach(([i, n]) => { for (let k = 0; k < n; k++) fl.ships.push(newShip(ds[i])); }); };
      mk(cmds[0], F.capital, [[2, 3], [0, 3], [1, 2]]);
      const second = pls.find(p => p.id !== F.capital && ADJ[p.id].some(n => G.planets[n].owner !== F.id)) || pls[1];
      mk(cmds[1], second.id, [[2, 2], [3, 1], [0, 2]]);
      // 首都の守備艦
      for (let k = 0; k < 2; k++) G.planets[F.capital].dock.push(newShip(ds[1]));
      // 小さな国への手当て
      if (F.start) {
        const f = G.facs[F.id];
        f.funds = F.start.funds;
        Object.assign(f.tech, F.start.tech);
        for (let k = 0; k < F.start.ships; k++) G.planets[F.capital].dock.push(newShip(ds[2]));
      }
    }
    // 小勢力の守り
    MINORS.forEach(m => { const p = G.planets[m.planet]; p.yard = 1; });
    for (const k in G.officers) G.officers[k].rk = rankIdx(k);
    log(`${dateStr()}、${FACTIONS[playerFid].name}の歴史が動き出す。`, 'big', playerFid);
    if (typeof People !== 'undefined') People.init();
    return G;
  }

  function officersOf(fid, filter = 'act') {
    return Object.keys(G.officers).filter(k => G.officers[k].fac === fid && G.officers[k].st === filter);
  }
  function setGov(pid, key) {
    const p = G.planets[pid];
    if (p.gov && G.officers[p.gov] && G.officers[p.gov].role === 'gov:' + pid) G.officers[p.gov].role = null;
    p.gov = key || null;
    if (key) {
      const o = G.officers[key];
      if (o.role && o.role.startsWith('gov:')) { const old = G.planets[+o.role.slice(4)]; if (old) old.gov = null; }
      if (o.role && o.role.startsWith('cmd:')) { const fl = G.fleets.find(f => f.id === +o.role.slice(4)); if (fl) { if (fl.cmd === key) fl.cmd = null; if (fl.sub === key) fl.sub = null; } }
      o.role = 'gov:' + pid;
    }
  }
  function newFleet(fid, cmd, at) {
    const fl = { id: G.nextId++, fac: fid, cmd: null, sub: null, at, dest: null, from: at, ships: [], form: 'spindle', moved: false };
    G.fleets.push(fl);
    if (cmd) setCmd(fl, cmd);
    return fl;
  }
  function setCmd(fl, key, slot = 'cmd') {
    if (fl[slot] && G.officers[fl[slot]]) G.officers[fl[slot]].role = null;
    fl[slot] = key || null;
    if (key) {
      const o = G.officers[key];
      if (o.role && o.role.startsWith('gov:')) { const p = G.planets[+o.role.slice(4)]; if (p && p.gov === key) p.gov = null; }
      if (o.role && o.role.startsWith('cmd:')) { const f2 = G.fleets.find(f => f.id === +o.role.slice(4)); if (f2 && f2 !== fl) { if (f2.cmd === key) f2.cmd = null; if (f2.sub === key) f2.sub = null; } }
      o.role = 'cmd:' + fl.id;
    }
  }
  function fleetName(fl) {
    if (fl.cmd) return `${shortName(OFF[fl.cmd])}艦隊`;
    return '無名の艦隊';
  }
  function removeFleet(fl) {
    if (fl.cmd && G.officers[fl.cmd]) G.officers[fl.cmd].role = null;
    if (fl.sub && G.officers[fl.sub]) G.officers[fl.sub].role = null;
    G.fleets = G.fleets.filter(f => f !== fl);
  }
  function freeOfficer(key) {
    const o = G.officers[key];
    if (!o) return;
    if (o.role && o.role.startsWith('gov:')) { const p = G.planets[+o.role.slice(4)]; if (p && p.gov === key) p.gov = null; }
    if (o.role && o.role.startsWith('cmd:')) { const fl = G.fleets.find(f => f.id === +o.role.slice(4)); if (fl) { if (fl.cmd === key) fl.cmd = null; if (fl.sub === key) fl.sub = null; } }
    o.role = null;
  }

  // ---------- 派閥 ----------
  function rulingOf(f) { return Object.entries(f.parties).sort((a, b) => b[1] - a[1])[0][0]; }
  function shiftParty(fid, party, amt) {
    const f = facOf(fid); if (!f) return;
    f.parties[party] = Math.max(2, f.parties[party] + amt);
    const sum = Object.values(f.parties).reduce((a, b) => a + b, 0);
    for (const k in f.parties) f.parties[k] = f.parties[k] * 100 / sum;
  }

  // ---------- 収入・研究 ----------
  function planetIncome(p) {
    if (!isMajor(p.owner)) return 0;
    const f = G.facs[p.owner], F = FACTIONS[p.owner];
    let v = p.pop * (0.32 + p.ind * 0.075) * PTYPES[p.type].ind;
    v *= (0.55 + p.stab / 220);
    v *= 1 + f.tech.eco * 0.07 + (F.bonus.income || 0) + (f.ruling === 'trade' ? 0.12 : 0);
    if (G.minors.m0.ally === p.owner) v *= 1.1;
    let tr = 0; for (let b = 0; b < 6; b++) if (b !== p.owner && G.facs[b].alive && ['trade', 'ally'].includes(rel(p.owner, b).s)) tr++;
    v *= 1 + Math.min(0.25, tr * 0.05);
    if (p.gov) v *= 1 + (OFF[p.gov].pol - 50) / 300;
    if (p.owner === G.player) v *= 1 + Staff.bonus('economy', 0.15);
    v *= 1 + People.buff(p.owner, 'income');
    return v;
  }
  function planetResearch(p) {
    if (!isMajor(p.owner)) return 0;
    const f = G.facs[p.owner], F = FACTIONS[p.owner];
    let v = p.pop * (0.09 + p.res * 0.045) * PTYPES[p.type].res;
    v *= 1 + (F.bonus.research || 0) + (f.ruling === 'tech' ? 0.2 : 0);
    if (G.minors.m1.ally === p.owner) v *= 1.15;
    if (G.minors.m3 && G.minors.m3.ally === p.owner) v *= 1.05;
    if (p.gov) v *= 1 + (OFF[p.gov].sci - 50) / 300;
    if (p.owner === G.player) v *= 1 + Staff.bonus('research', 0.25);
    v *= 1 + People.buff(p.owner, 'research');
    return v;
  }
  function upkeep(fid) {
    let c = 0;
    const add = s => { if (s.ecl) return; const d = G.designs[s.d]; c += HULLS[d.hull].cost * 0.035; };
    G.fleets.forEach(fl => { if (fl.fac === fid) fl.ships.forEach(add); });
    G.planets.forEach(p => { if (p.owner === fid) p.dock.forEach(add); });
    return c;
  }
  function economy(fid) {
    let inc = 0, rp = 0;
    G.planets.forEach(p => { if (p.owner === fid) { inc += planetIncome(p); rp += planetResearch(p); } });
    return { inc: Math.round(inc), rp: Math.round(rp), up: Math.round(upkeep(fid)) };
  }
  function devCap(p, k) {
    const f = facOf(p.owner); const extra = f && f.tech.eco >= 5 ? 2 : 0;
    if (k === 'ind' || k === 'res') return 8 + extra;
    if (k === 'def') return 8 + (f ? Math.floor(f.tech.def / 3) : 0);
    if (k === 'yard') return f && f.tech.eco >= 3 ? 3 : 2;
    return 0;
  }
  const FOCUS = { ind: '産業', res: '研究', def: '防衛衛星', yard: '造船所', pop: '民生' };
  function devSpeed(p) {
    const f = facOf(p.owner);
    let s = 9 + (p.gov ? OFF[p.gov].pol * 0.14 : 2) + (f ? f.tech.eco * 1.5 : 0);
    if (p.owner === G.player) s *= 1 + Staff.bonus('economy', 0.4) + (p.focus === 'def' ? Staff.bonus('defend', 0.5) : 0);
    const lv = p.focus === 'pop' ? 0 : p[p.focus] || 0;
    return s * (p.focus === 'def' ? 1.6 : 1) / (1 + lv * 0.18);
  }
  function invest(pid) {
    const p = G.planets[pid], f = facOf(p.owner);
    const cost = investCost(p);
    if (f.funds < cost) return false;
    f.funds -= cost; p.prog += 60;
    return true;
  }
  const investCost = p => Math.round(60 + (p[p.focus] || 0) * 30);
  // 研究費：資金を研究に回す（rate は資金1あたりの研究点）
  function researchGrant(fid, amt, rate = 0.5) {
    const f = facOf(fid); if (!f || f.funds < amt) return 0;
    f.funds -= amt; const v = Math.round(amt * rate); f.rp += v;
    return v;
  }

  // ---------- 技術 ----------
  function researchTarget(f) {
    if (f.researching === 'seal') return { name: Eclipse.SEAL.name, short: Eclipse.SEAL.name, cost: Eclipse.SEAL.cost, seal: true, gain: '蝕の源「深淵」への道が開く' };
    if (FORBIDDEN[f.researching]) return { name: FORBIDDEN[f.researching].name, cost: FORBIDDEN[f.researching].cost, forb: true };
    const lv = f.tech[f.researching] + 1;
    const b = f.researching;
    return { name: `${TECH_BRANCH[b].name}Lv${lv}「${Gloss.techName(b, lv)}」`, short: Gloss.techName(b, lv), gain: Gloss.techGain(b, lv), cost: techCost(lv), lv };
  }
  function forbAvailable(f, k) {
    const F = FORBIDDEN[k];
    return !f.forb.includes(k) && Object.entries(F.req).every(([b, v]) => f.tech[b] >= v);
  }
  function advanceResearch(fid) {
    const f = G.facs[fid];
    const done = [];
    let guard = 0;
    while (guard++ < 4) {
      if (f.researching === 'seal' && (f.sealed || !Eclipse.canSeal(fid))) f.researching = 'wep';
      if (!FORBIDDEN[f.researching] && f.researching !== 'seal' && f.tech[f.researching] >= 8) { f.researching = ['wep', 'eng', 'def', 'eco'].find(k => f.tech[k] < 8) || 'wep'; if (f.tech[f.researching] >= 8) break; }
      const t = researchTarget(f);
      if (f.rp < t.cost) break;
      f.rp -= t.cost;
      if (t.seal) {
        f.researching = ['wep', 'eng', 'def', 'eco'].find(k => f.tech[k] < 8) || 'wep';
        done.push(t.name);
        Eclipse.sealDone(fid);
      } else if (t.forb) {
        f.forb.push(f.researching);
        Eclipse.forbHit();
        done.push(t.name);
        log(`${FACTIONS[fid].name}が禁忌の技術「${t.name}」に手を染めた。`, 'warn', fid);
        f.researching = 'wep';
      } else {
        f.tech[f.researching]++;
        done.push(t.name);
        const un = TECH_UNLOCK[f.researching][f.tech[f.researching]];
        if (fid === G.player) log(`技術 ${t.name}を修めた。${t.gain ? '（' + t.gain + '）' : un ? '（' + un + '）' : ''}`, 'good', fid);
      }
      f.stats.techs++;
      shiftParty(fid, 'tech', 1);
    }
    return done;
  }

  // ---------- 造艦 ----------
  function queueBuild(pid, did) {
    const p = G.planets[pid], f = facOf(p.owner), d = G.designs[did];
    const c = designCost(d, p.owner);
    if (!p.yard || f.funds < c) return false;
    if (HULLS[d.hull].size >= 15 && p.yard < 2) return false;
    if (d.hull === 'dn' && p.yard < 3) return false;
    if (p.build.length >= p.yard * 2) return false;
    f.funds -= c;
    p.build.push({ d: did, left: designStats(d, p.owner).turns });
    return true;
  }
  const canBuildHull = (p, hull) => p.yard >= (hull === 'dn' ? 3 : HULLS[hull].size >= 15 ? 2 : 1);

  // ---------- ターンの経済処理（全勢力） ----------
  function resistance() {
    for (const p of G.planets) {
      if (!isMajor(p.owner) || !isMajor(p.prev) || p.prev === p.owner || !p.captT || G.turn - p.captT > 30 || p.stab > 38 || p.cap) continue;
      const pf = G.facs[p.prev]; if (!pf.alive) continue;
      if (!ADJ[p.id].some(n => G.planets[n].owner === p.prev)) continue;
      if (G.fleets.some(x => x.at === p.id && x.fac === p.owner && x.ships.length)) continue;   // 艦隊が駐留していれば抑えられる
      if (Math.random() > 0.05) continue;
      const was = p.owner;
      if (p.gov) freeOfficer(p.gov);
      p.owner = p.prev; p.prev = was; p.captT = G.turn; p.stab = 45; p.gov = null; p.build = []; p.dock = []; p.prog = 0;
      log(`${p.name}の民が蜂起し、${FACTIONS[was].name}の支配を拒んで${FACTIONS[p.owner].name}へ戻った。`, was === G.player ? 'bad' : p.owner === G.player ? 'good' : 'info', p.owner);
    }
  }
  function economyTurn() {
    resistance();
    for (const f of G.facs) {
      if (!f.alive) continue;
      const e = economy(f.id);
      f.funds = Math.round(f.funds + e.inc - e.up);
      f.rp += e.rp;
      if (f.funds < 0) {
        // 払えないと艦が去る
        const fl = G.fleets.filter(x => x.fac === f.id && x.ships.length);
        if (fl.length) { const x = R.pick(fl); x.ships.pop(); if (f.id === G.player) log('資金が尽き、艦が一隻、整備されないまま退役した。', 'bad', f.id); }
        f.funds = Math.max(f.funds, -200);
      }
      advanceResearch(f.id);
    }
    // 惑星
    for (const p of G.planets) {
      const f = facOf(p.owner);
      // 人口
      const grow = p.focus === 'pop' ? 0.06 : 0.03;
      if (p.owner === 'E') p.pop = Math.max(1, p.pop * 0.93);
      else p.pop = Math.min(p.maxPop, p.pop + (p.maxPop - p.pop) * grow * (p.stab / 100));
      // 民心
      if (f) {
        let target = 62 + (FACTIONS[p.owner].bonus.stab || 0) + (f.ruling === 'peace' ? 3 : 0) + (p.gov ? (OFF[p.gov].pol - 50) / 5 : -8) + (p.focus === 'pop' ? 12 : 0);
        if (f.demandFail) target -= 10;
        if (f.warWeary > 6) target -= Math.min(15, f.warWeary - 6);
        if (f._nT !== G.turn) { f._nT = G.turn; f.nPl = G.planets.filter(x => x.owner === f.id).length; }
        target -= Math.min(18, Math.max(0, f.nPl - 12) * 1.2);   // 広がりすぎ
        p.stab += clamp(target - p.stab, -3, 4);
        p.stab = clamp(p.stab, 0, 100);
      } else if (p.owner !== 'E') p.stab += clamp(55 - p.stab, -2, 2);
      // 開発
      if (f && p.focus !== 'pop') {
        const cap = devCap(p, p.focus);
        if ((p[p.focus] || 0) < cap) {
          p.prog += devSpeed(p);
          if (p.prog >= 100) {
            p.prog -= 100; p[p.focus]++;
            if (p.owner === G.player) log(`${p.name}の${FOCUS[p.focus]}が ${p[p.focus]} に上がった。`, 'good', p.owner);
          }
        } else p.prog = 0;
      } else if (!f && p.owner !== 'E' && p.def < 2 && R.chance(0.2)) p.def++;
      // 造艦
      if (p.build.length && f) {
        const b = p.build[0];
        b.left--;
        if (b.left <= 0) {
          p.build.shift();
          const s = newShip(b.d);
          // 同じ星にいる自軍の艦隊（命令なし）に入れる。なければ駐留
          const fl = G.fleets.find(x => x.fac === p.owner && x.at === p.id && !x.dest && x.cmd && x.ships.length < fleetCap(x));
          if (fl && p.owner !== G.player) fl.ships.push(s); else p.dock.push(s);
          if (p.owner === G.player) log(`${p.name}で ${G.designs[b.d].name} が竣工した。`, 'good', p.owner);
        }
      }
      // 修理
      const rep = (s, k) => { const m = shipMaxHp(s); s.hp = Math.min(m, s.hp + m * k); };
      p.dock.forEach(s => rep(s, 0.15 + p.yard * 0.1));
      // 民心が低いと反乱
      if (f && p.stab < 18 && !p.cap && R.chance(0.12)) {
        const own = p.owner;
        if (p.gov) freeOfficer(p.gov);
        if (p.gov) freeOfficer(p.gov);
        p.owner = null; p.dock = []; p.build = []; p.stab = 50; p.gov = null;
        log(`${p.name}で民衆が蜂起し、${FACTIONS[own].name}の支配を離れた。`, own === G.player ? 'bad' : 'info', own);
      }
    }
    // 艦隊の修理
    for (const fl of G.fleets) {
      const p = G.planets[fl.at];
      let k = 0;
      if (friendly(fl.fac, p.owner)) k = p.yard ? 0.12 + p.yard * 0.08 : 0.06;
      if (fl.fac === 'E') continue;
      const hasRep = fl.ships.some(s => G.designs[s.d].mods.includes('rep'));
      if (hasRep) k += 0.06;
      if (k) fl.ships.forEach(s => { const m = shipMaxHp(s); s.hp = Math.min(m, s.hp + m * k); });
    }
    // 士官の忠誠と、在野の登場
    for (const k in G.officers) {
      const o = G.officers[k], S = OFF[k];
      if (o.st === 'hidden' && G.turn >= S.appear) { o.st = 'free'; }
      if (o.st === 'act' && isMajor(o.fac) && G.facs[o.fac].leader !== k) {
        let d = 0;
        if (S.pers === '野心') d -= 0.6; if (S.pers === '忠烈') d += 0.5;
        if (o.role) d += 0.3; else d -= 0.2;
        o.loyal = clamp(o.loyal + d + (R.f() - 0.5), 0, 100);
        // 忠誠が低いと出奔
        if (o.loyal < 25 && R.chance(0.06)) {
          freeOfficer(k);
          o.st = 'free'; o.fac = null;
          const pls = G.planets.filter(p => p.owner !== 'E');
          o.loc = R.pick(pls).id;
          log(`${S.name}が${FACTIONS[o.ever !== null && isMajor(o.ever) ? o.ever : 0].short}を去った。`, o.ever === G.player ? 'bad' : 'info', o.ever);
        }
      }
      if (o.st === 'cap' && (!isMajor(o.capBy) || !G.facs[o.capBy] || !G.facs[o.capBy].alive)) {
        const back = o.ever;
        if (isMajor(back) && G.facs[back] && G.facs[back].alive) { o.st = 'act'; o.fac = back; o.capBy = null; }
        else { o.st = 'free'; o.fac = null; o.capBy = null; const pl = G.planets.filter(p => p.owner !== 'E'); o.loc = pl.length ? R.pick(pl).id : null; }
        continue;
      }
      if (o.st === 'cap' && R.chance(0.03)) {
        // 捕虜が逃げ出す
        const back = o.ever;
        if (isMajor(back) && G.facs[back] && G.facs[back].alive) { o.st = 'act'; o.fac = back; o.capBy = null; }
      }
    }
    // 総督の働きも武功になる
    G.planets.forEach(p => { if (p.gov && isMajor(p.owner)) addMerit(p.gov, 0.35); });
    checkPromotions();
    // 派閥の評議（12か月ごと）
    for (const f of G.facs) {
      if (!f.alive) continue;
      if (G.turn % 12 === 1 && G.turn > 1) {
        const r = rulingOf(f);
        if (r !== f.ruling) {
          if (f.id === G.player) log(`評議会の改選。${PARTIES[r].name}が${PARTIES[f.ruling].name}に代わって主導権を握った。`, 'big', f.id);
          f.ruling = r;
        }
      }
      f.warWeary = Math.max(0, f.warWeary - 0.3);
    }
  }

  // ---------- 派閥の要求 ----------
  const DEMANDS = {
    war: { text: '惑星を1つ奪え', check: (f, d) => f.stats.captured > d.base },
    trade: { text: '通商条約を新たに結べ（または資金を 800 以上ためよ）', check: (f, d) => f.stats.treaties > d.base || f.funds >= 800 },
    tech: { text: '技術を2つ修めよ', check: (f, d) => f.stats.techs >= d.base + 2 },
    peace: { text: 'どこかの勢力と、不可侵以上の約束を新たに結べ', check: (f, d) => f.stats.treaties > d.base },
  };
  function demandTurn(fid) {
    const f = G.facs[fid];
    const res = [];
    if (f.demand) {
      const D = DEMANDS[f.demand.party];
      if (D.check(f, f.demand)) {
        res.push({ ok: true, party: f.demand.party });
        shiftParty(fid, f.demand.party, 6);
        G.planets.forEach(p => { if (p.owner === fid) p.stab = clamp(p.stab + 8, 0, 100); });
        f.demand = null; f.demandFail = false;
      } else if (G.turn >= f.demand.until) {
        res.push({ ok: false, party: f.demand.party });
        shiftParty(fid, f.demand.party, -4);
        G.planets.forEach(p => { if (p.owner === fid) p.stab = clamp(p.stab - 8, 0, 100); });
        f.demand = null; f.demandFail = true;
      }
    } else if (G.turn % 10 === 4) {
      const party = f.ruling;
      const base = party === 'war' ? f.stats.captured : party === 'tech' ? f.stats.techs : f.stats.treaties;
      f.demand = { party, base, until: G.turn + 8 };
      res.push({ new: true, party });
    }
    return res;
  }

  // ---------- 小勢力 ----------
  function minorProgress(mid, fid) {
    const M = MINORS.find(m => m.id === mid), m = G.minors[mid], f = G.facs[fid];
    if (M.quest.kind === 'trade') return Object.keys(G.rel).filter(k => { const [a, b] = k.split('|').map(Number); return (a === fid || b === fid) && ['trade', 'ally'].includes(G.rel[k].s); }).length;
    if (M.quest.kind === 'tech') return Object.values(f.tech).reduce((a, b) => a + b, 0);
    if (M.quest.kind === 'victory') return m.paid ? 99 : (m.wins[fid] || 0);
    if (M.quest.kind === 'ruin') return G.planets.filter(p => p.owner === fid && p.type === 'ruin' && p.res >= 4).length;
    if (M.quest.kind === 'reach') return new Set(G.planets.filter(p => p.owner === fid).map(p => p.sys)).size;
    return 0;
  }
  function minorJoin(mid, fid) {
    const m = G.minors[mid], M = MINORS.find(x => x.id === mid);
    m.ally = fid;
    // 小勢力の士官は盟約の証として加わる
    Object.keys(G.officers).forEach(k => { const o = G.officers[k]; if (o.fac === mid && o.st === 'act') { o.fac = fid; o.loyal = 70; } });
    if (mid === 'm2') {
      const did = newDesign(fid, '黒鴉級強襲艦', 'cl', ['rail', 'las', 'thr'].filter(x => designUnlocked({ hull: 'cl', mods: [x] }, fid)).concat(['msl']).slice(0, 3));
      const fl = newFleet(fid, officersOf(fid).find(k => k === 'crow') || null, G.planets[M.planet].id);
      for (let i = 0; i < 6; i++) fl.ships.push(newShip(did));
      if (OFF.raven && G.officers.raven.fac === fid) setCmd(fl, 'raven', 'sub');
    }
    if (mid === 'm3' && G.eclipse.arrived) { G.facs[fid].ekeys = (G.facs[fid].ekeys || 0) + 1; G.flags.towerKey = G.turn; }
    G.facs[fid].stats.treaties++;
    shiftParty(fid, 'peace', 4);
    log(`${M.name}が${FACTIONS[fid].name}と盟約を結んだ。`, fid === G.player ? 'big' : 'info', fid);
  }

  // ---------- 惑星を奪う ----------
  function capture(pid, newOwner, cause = 'battle') {
    const p = G.planets[pid], old = p.owner;
    // 総督は捕虜か逃亡
    if (p.gov) {
      const k = p.gov; freeOfficer(k);
      if (isMajor(newOwner) && R.chance(0.45)) { captureOfficer(k, newOwner); }
      else if (isMajor(old)) { const home = G.planets.filter(x => x.owner === old && x.id !== pid); if (!home.length) captureOfficer(k, newOwner); }
    }
    if (isMajor(old) && isMajor(newOwner)) { const r = rel(newOwner, old); r.gainA = (r.gainA || 0) + (newOwner < old ? 1 : 0); r.gainB = (r.gainB || 0) + (newOwner < old ? 0 : 1); p.captT = G.turn; }
    p.prev = old; p.owner = newOwner; p.gov = null; p.build = []; p.dock = []; p.prog = 0;
    if (typeof old === 'string' && old !== 'E' && G.minors[old]) G.minors[old].ally = null;
    p.stab = newOwner === 'E' ? 0 : 32;
    p.def = Math.max(0, Math.min(p.def, 1));
    if (isMajor(newOwner)) {
      G.facs[newOwner].stats.captured++; shiftParty(newOwner, 'war', 3);
      if (isMajor(old) || old === null || old === 'E') {
        const nf = G.facs[newOwner], k = (nf.ruling === 'war' ? 1.5 : 1) * (old === null ? 0.5 : 1);
        const fu = Math.round((40 + p.pop * 2) * k), rp = Math.round((15 + p.pop * 0.8) * k);
        nf.funds += fu; nf.rp += rp;
        if (newOwner === G.player) log(`${p.name}を手に入れ、戦利品として資金 ${fu}・研究 ${rp} を得た。`, 'good', newOwner);
      }
    }
    // 小勢力の本拠を落とした
    const M = MINORS.find(m => m.planet === pid);
    if (M && old === M.id) {
      Object.keys(G.officers).forEach(k => { const o = G.officers[k]; if (o.fac === M.id) { o.fac = null; o.st = 'free'; o.loc = pid; } });
      log(`${M.name}は${ownerName(newOwner)}の手に落ちた。`, 'info', newOwner);
    }
    // 首都が落ちた
    if (isMajor(old)) {
      const f = G.facs[old];
      const rest = G.planets.filter(x => x.owner === old);
      if (!rest.length) destroyFaction(old, newOwner);
      else if (f.capital === pid) {
        const nc = rest.slice().sort((a, b) => (a.type === 'rift') - (b.type === 'rift') || b.pop - a.pop)[0];
        f.capital = nc.id; nc.cap = true; p.cap = false;
        rest.forEach(x => x.stab = clamp(x.stab - 15, 0, 100));
        log(`${FACTIONS[old].name}の首都${p.name}が陥落。${nc.name}へ遷都した。`, old === G.player ? 'bad' : 'big', old);
      }
      f.warWeary += 2;
    }
    if (old === 'E' && p.type === 'rift') Eclipse.onRiftTaken(newOwner, p.id);
  }
  function captureOfficer(k, by) {
    const o = G.officers[k];
    freeOfficer(k);
    if (isMajor(by)) { o.st = 'cap'; o.capBy = by; o.fac = by; o.capAt = G.turn; }
    else { o.st = 'free'; o.fac = null; o.loc = R.pick(G.planets).id; }
  }
  function destroyFaction(fid, by) {
    const f = G.facs[fid];
    f.alive = false; f.killedBy = by; f.diedAt = G.turn;
    G.fleets.filter(fl => fl.fac === fid).forEach(fl => removeFleet(fl));
    Object.keys(G.officers).forEach(k => {
      const o = G.officers[k];
      if (o.fac === fid && o.st === 'act') {
        freeOfficer(k);
        if (isMajor(by) && R.chance(0.5)) { o.st = 'cap'; o.capBy = by; o.fac = by; o.capAt = G.turn; }
        else { o.st = 'free'; o.fac = null; const pl = G.planets.filter(p => p.owner !== 'E'); o.loc = pl.length ? R.pick(pl).id : null; }
      }
    });
    for (const m of Object.values(G.minors)) if (m.ally === fid) m.ally = null;
    for (let b = 0; b < 6; b++) if (b !== fid) G.rel[relKey(fid, b)].s = 'neutral';
    log(`${FACTIONS[fid].name}は滅びた。`, 'big', fid);
    G.flags['fell_' + fid] = G.turn;
  }

  // ---------- 勝ち負け ----------
  // この戦で a が b から奪った星の数
  function warGain(a, b) { const r = rel(a, b); return a < b ? (r.gainA || 0) : (r.gainB || 0); }
  // 戦の目的：この戦で奪う星の数（主戦派の強い国ほど欲張る。2〜3）
  function warGoal(a) { return isMajor(a) && Diplo.aggOf(a) > 0.8 ? 3 : 2; }
  function checkVictory() {
    const me = G.player;
    if (!G.facs[me].alive || !G.planets.some(p => p.owner === me)) return { type: 'defeat' };
    const otherMajors = G.facs.filter(f => f.alive && f.id !== me);
    const eclipseOk = G.eclipse.defeated;
    const minorsOk = MINORS.every(M => { const p = G.planets[M.planet]; return p.owner !== M.id || G.minors[M.id].ally === me; });
    const peace = otherMajors.length && minorsOk && otherMajors.every(f => rel(me, f.id).s === 'ally');
    const allMine = G.planets.every(p => p.owner === me || friendly(me, p.owner) || (p.type === 'rift' && p.owner !== 'E'));
    if (!eclipseOk) { if ((peace || allMine) && !G.eclipse.arrived) Eclipse.hasten(); return null; }
    if (peace) return { type: 'peace' };
    if (allMine) return { type: otherMajors.length ? 'peace' : 'conquest' };
    return null;
  }

  // ---------- 士官の手柄と階級 ----------
  function addMerit(k, v) { if (k && G.officers[k]) G.officers[k].merit += v; }
  function isLeader(k) { const o = G && G.officers[k]; return !!o && isMajor(o.fac) && o.st === 'act' && G.facs[o.fac].leader === k; }
  // 元帥はその国でいちばん武功の大きい一人だけ
  function marshalOf(fac) {
    let best = null, bm = RANK_MERIT[10] - 0.01;
    for (const k in G.officers) { const o = G.officers[k]; if (o.fac === fac && o.st === 'act' && !isLeader(k) && o.merit > bm) { bm = o.merit; best = k; } }
    return best;
  }
  function rankIdx(k) {
    const m = G && G.officers[k] ? G.officers[k].merit : initMerit(OFF[k]);
    let i = 0; while (i < 9 && m >= RANK_MERIT[i + 1]) i++;
    if (i === 9 && G && G.officers[k] && m >= RANK_MERIT[10] && marshalOf(G.officers[k].fac) === k) i = 10;
    return i;
  }
  function rankName(k) {
    if (G && isLeader(k)) return FACTIONS[G.officers[k].fac].title;
    return OFFRANKS[rankIdx(k)];
  }
  function fleetCap(fl) {
    if (!fl.cmd) return 12;
    return isLeader(fl.cmd) ? 30 : RANK_CAP[rankIdx(fl.cmd)];
  }
  // 昇進の知らせ（自国の士官）
  function checkPromotions() {
    for (const k in G.officers) {
      const o = G.officers[k];
      if (o.st !== 'act' || isLeader(k)) continue;
      const r = rankIdx(k);
      if (o.rk !== undefined && r > o.rk && o.fac === G.player) {
        const v = typeof People !== 'undefined' ? People.voice(k, 'promote') : null;
        log(`${OFF[k].name}が${OFFRANKS[r]}に昇進した。${v ? '「' + v + '」' : ''}`, r >= 6 ? 'big' : 'good', G.player);
      }
      o.rk = r;
    }
  }

  // ---------- セーブ ----------
  //  枠 0 は毎月の自動セーブ、1〜3 は手動セーブ
  const SLOTS = 3;
  const slotKey = slot => slot ? `${CONFIG.saveKey}_s${slot}` : CONFIG.saveKey;
  const infoKey = CONFIG.saveKey.replace('save', 'slots');
  function readInfo() { try { return JSON.parse(localStorage.getItem(infoKey) || '{}') || {}; } catch (e) { return {}; } }
  function summary() {
    const me = G.player;
    return {
      fac: me, name: FACTIONS[me].name, date: dateStr(), turn: G.turn,
      planets: G.planets.filter(p => p.owner === me).length,
      staff: G.staff && G.staff.on && OFF[G.staff.key] ? OFF[G.staff.key].name : null,
      at: Date.now(), over: G.over || null,
    };
  }
  function save(slot = 0) {
    try {
      // 作戦室の記録は直近6か月分だけ残して保存する（容量のため）
      const war = G.war;
      const data = JSON.stringify(Object.assign({}, G, { war: (war || []).filter(e => e.t >= G.turn - 6) }));
      localStorage.setItem(slotKey(slot), data);
      const info = readInfo(); info[slot] = summary();
      localStorage.setItem(infoKey, JSON.stringify(info));
      return true;
    } catch (e) { return false; }
  }
  function hasSave(slot) {
    try {
      if (slot === undefined) { for (let s = 0; s <= SLOTS; s++) if (localStorage.getItem(slotKey(s))) return true; return false; }
      return !!localStorage.getItem(slotKey(slot));
    } catch (e) { return false; }
  }
  // 枠の見出し（見出しがない古いセーブは、中身を読んで作る）
  function slotInfo() {
    const info = readInfo(), out = [];
    for (let s = 0; s <= SLOTS; s++) {
      let i = null;
      try {
        if (localStorage.getItem(slotKey(s))) {
          i = info[s] || null;
          if (!i) { const d = JSON.parse(localStorage.getItem(slotKey(s))); i = { fac: d.player, name: FACTIONS[d.player].name, date: dateStr(d.turn), turn: d.turn, planets: d.planets.filter(p => p.owner === d.player).length, staff: null, at: null, over: d.over || null }; }
        }
      } catch (e) { i = null; }
      out.push({ slot: s, auto: s === 0, info: i });
    }
    return out;
  }
  function load(slot = 0) {
    try {
      const s = localStorage.getItem(slotKey(slot));
      if (!s) return false;
      G = JSON.parse(s);
      MINORS.forEach(m => { if (!G.minors[m.id]) G.minors[m.id] = { id: m.id, ally: null, paid: false, wins: {} }; });
      OFFICERS.forEach(o => { if (!G.officers[o.key]) { const M = MINORS.find(m => m.id === o.fac0); G.officers[o.key] = { fac: null, st: 'free', loc: M ? M.planet : o.loc, loyal: 0, merit: initMerit(o), battles: 0, wins: 0, kills: 0, busy: 0, role: null, ever: null }; } });
      buildLanes();
      if (typeof People !== 'undefined') People.init();
      return true;
    } catch (e) { return false; }
  }
  function clearSave(slot = 0) {
    try { localStorage.removeItem(slotKey(slot)); const info = readInfo(); delete info[slot]; localStorage.setItem(infoKey, JSON.stringify(info)); } catch (e) { }
  }

  return {
    isLeader, rankIdx, rankName, fleetCap, checkPromotions, marshalOf,
    warGain, warGoal, newGame, save, load, hasSave, clearSave, slotInfo, SLOTS, buildLanes, log, dateStr,
    facOf, isMajor, ownerName, ownerShort, ownerCol, rel, relKey, off, canAttack, canEnter, friendly,
    get LANES() { return LANES; }, get ADJ() { return ADJ; }, path, hops, dist,
    designStats, designCost, designUnlocked, newDesign, newShip, shipMaxHp, shipPower, fleetPower, dockPower, satPower, planetDefense, rankOf,
    officersOf, setGov, newFleet, setCmd, fleetName, removeFleet, freeOfficer,
    rulingOf, shiftParty, economy, planetIncome, planetResearch, devCap, devSpeed, FOCUS, invest, investCost,
    researchTarget, forbAvailable, researchGrant, queueBuild, canBuildHull, economyTurn, DEMANDS, demandTurn,
    minorProgress, minorJoin, capture, captureOfficer, destroyFaction, checkVictory, addMerit,
  };
})();
