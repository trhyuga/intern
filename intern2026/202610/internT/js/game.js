// ============================================================
//  ゲームの中核（状態・内政・外交・計略・AI・季節の進行）
// ============================================================
const CONFIG = {
  SAVE_KEY: 'internT_gunyu_save_v1',
  CMD_COST: 50,           // 内政1回の金
  RECRUIT_COST: 100,      // 徴兵1回の金
  TROOP_CAP_BASE: 2500,   // 武将1人が率いる兵の上限 = BASE + 統率 × 90（統率80で約1万。5人で4〜5万）
  TROOP_CAP_PER_LEAD: 90,
  ALLY_TURNS: 8,          // 同盟の期間（季節）
  BATTLE_DAYS: 30,
};
const SEASONS = ['春', '夏', '秋', '冬'];

const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

let G = null; // 現在のゲーム状態

const Game = {
  // ---------------- 初期化 ----------------
  newGame(scenId, lordName, opts) {
    const sc = SCENARIOS.find(s => s.id === scenId);
    const cityIndex = {};
    const cities = CITY_DATA.map((d, i) => {
      cityIndex[d[0]] = i;
      return { i, id: d[0], name: d[1], x: d[2], y: d[3], terrain: d[4], pop: d[5], farmMax: d[6], commMax: d[7], defMax: d[8],
        owner: null, gold: 300, food: 6000, farm: Math.round(d[6] * 0.35), comm: Math.round(d[7] * 0.35), def: Math.round(d[8] * 0.5),
        troops: irnd(1500, 3500), train: 40, loyal: 50, delegate: false, adj: [] };
    });
    ROADS.forEach(([a, b]) => { cities[cityIndex[a]].adj.push(cityIndex[b]); cities[cityIndex[b]].adj.push(cityIndex[a]); });

    const gens = GENERAL_SRC.trim().split('\n').map((line, i) => {
      const p = line.split(',');
      return { i, name: p[0], lead: +p[1], war: +p[2], int: +p[3], pol: +p[4], cha: +p[5],
        traits: p[6] === '-' ? [] : p[6].split(' '), home: cityIndex[p[7]], appear: +p[8], die: +p[9], female: p[10] === 'F',
        city: -1, faction: -1, state: 'future', loyalty: 80, acted: false, isLord: false, wins: 0, duels: 0, kills: 0, joined: 0 };
    });
    const byName = {}; gens.forEach(g => byName[g.name] = g);

    const factions = sc.lords.map((L, fi) => {
      const lord = byName[L[0]];
      return { i: fi, name: L[0], color: L[1], lord: lord.i, alive: true, capital: cityIndex[L[2][0]], allies: {}, isPlayer: L[0] === lordName, hostility: {} };
    });
    // 都市の所有と初期値
    sc.lords.forEach((L, fi) => {
      L[2].forEach((cid, k) => {
        const c = cities[cityIndex[cid]];
        c.owner = fi;
        const big = k === 0 ? 1.5 : 1;
        c.gold = Math.round(irnd(600, 1200) * big); c.food = Math.round(irnd(15000, 30000) * big);
        c.troops = Math.round(irnd(8000, 15000) * big * (sc.dream ? 1.3 : 1));
        c.farm = Math.round(c.farmMax * rnd(0.4, 0.6)); c.comm = Math.round(c.commMax * rnd(0.4, 0.6));
        c.def = Math.round(c.defMax * rnd(0.5, 0.75)); c.train = irnd(50, 70); c.loyal = irnd(55, 75);
      });
    });
    // 武将の配置
    sc.lords.forEach((L, fi) => {
      const f = factions[fi];
      const owned = L[2].map(id => cityIndex[id]);
      const lord = byName[L[0]];
      lord.faction = fi; lord.city = owned[0]; lord.state = 'serve'; lord.isLord = true; lord.loyalty = 100;
      L[3].forEach((nm, k) => {
        const g = byName[nm];
        if (!g) { console.warn('unknown general', nm); return; }
        g.faction = fi; g.state = 'serve'; g.loyalty = irnd(70, 95);
        if (g.traits.includes('忠義')) g.loyalty = 100;
        // 出身都市が自領ならそこ、なければ順番に
        g.city = owned.includes(g.home) ? g.home : owned[k % owned.length];
      });
      // 本拠に最低1人。1人もいない都市には近い武将を回す
      owned.forEach(ci => {
        if (!gens.some(g => g.state === 'serve' && g.city === ci)) {
          const cand = gens.filter(g => g.state === 'serve' && g.faction === fi && !g.isLord && gens.filter(h => h.state === 'serve' && h.city === g.city).length > 1);
          if (cand.length) cand[0].city = ci;
        }
      });
    });
    const year = sc.year;
    gens.forEach(g => {
      if (g.state !== 'future') return;
      if (sc.dream) { g.state = 'ronin'; g.city = g.home; return; }
      if (g.die <= year) g.state = 'dead';
      else if (g.appear <= year) { g.state = 'ronin'; g.city = g.home; }
    });
    if (sc.dream) gens.forEach(g => g.die = 9999);

    const pf = factions.findIndex(f => f.isPlayer);
    G = { v: 1, scen: scenId, year, season: 0, turn: 0, player: pf, cities, gens, factions,
      opts: Object.assign({ lifespan: !sc.dream, aiSpeed: 1 }, opts || {}),
      log: [], stats: { battles: 0, wins: 0, captured: 0, recruited: 0, duelsWon: 0 }, events: {}, gameOver: false };
    gens.forEach(g => { if (g.state === 'serve') g.joined = year; });
    Game.log(`${year}年 春、${factions[pf].name}軍、天下に名乗りを上げる。`);
    return G;
  },

  log(msg) { G.log.unshift({ t: `${G.year}年${SEASONS[G.season]}`, msg }); if (G.log.length > 120) G.log.length = 120; },

  // ---------------- 参照 ----------------
  fac(i) { return G.factions[i]; },
  lordOf(fi) { return G.gens[G.factions[fi].lord]; },
  gensIn(ci, fi) { return G.gens.filter(g => g.state === 'serve' && g.city === ci && (fi === undefined || g.faction === fi)); },
  roninIn(ci) { return G.gens.filter(g => g.state === 'ronin' && g.city === ci); },
  citiesOf(fi) { return G.cities.filter(c => c.owner === fi); },
  gensOf(fi) { return G.gens.filter(g => g.state === 'serve' && g.faction === fi); },
  // 城攻めの難しさ：攻める側の勢力が小さいうち（序盤）は城壁と援軍の効き目を弱める。
  // 都市3以下で0.35、12以上で1（今の強さ）。合戦・自動戦闘・軍師オートの見積もりで共通に使う
  siegeK(atkFi) { const n = atkFi == null || !G.factions[atkFi] ? 12 : Game.citiesOf(atkFi).length; return 0.35 + 0.65 * clamp((n - 3) / 9, 0, 1); },
  troopCap(g) { return CONFIG.TROOP_CAP_BASE + g.lead * CONFIG.TROOP_CAP_PER_LEAD; },
  isAlly(a, b) { return a === b || (G.factions[a].allies[b] > 0); },
  power(fi) { return G.cities.filter(c => c.owner === fi).reduce((s, c) => s + c.troops, 0); },
  bondOf(names) { return BONDS.filter(b => b.members.filter(m => names.includes(m)).length >= 2); },
  has(g, t) { return g && g.traits && g.traits.includes(t); },

  // 次の秋の収穫までに必要な兵糧（兵の食べる量＋予備）。前線は予備を厚く
  isFront(c) { return c.adj.some(a => { const o = G.cities[a]; return o.owner !== c.owner && (o.owner === null || c.owner === null || !Game.isAlly(c.owner, o.owner)); }); },
  foodReserve(c, troops) {
    const t = troops == null ? c.troops : troops;
    const n = G.season <= 2 ? 3 - G.season : 4;
    return Math.round(t * 0.12 * n + 1500 + (Game.isFront(c) ? 2500 : 0));
  },

  // ---------------- 能力の上位者（称号） ----------------
  // 各能力で天下の上位5人（現役の武将・在野を含む）。季節ごとに計算し直す
  TOP_N: 5,
  TITLE: { lead: ['名将', '天下一の名将'], war: ['豪傑', '天下無双の豪傑'], int: ['智者', '天下一の智者'], pol: ['名臣', '天下一の名宰相'], cha: ['人望', '天下一の人望'] },
  ranks() {
    if (G._rank && G._rank.turn === G.turn && G._rank.n === G.gens.length) return G._rank.map;
    const alive = G.gens.filter(g => g.state === 'serve' || g.state === 'ronin');
    const map = {};
    ['lead', 'war', 'int', 'pol', 'cha'].forEach(k => {
      alive.slice().sort((a, b) => b[k] - a[k]).slice(0, Game.TOP_N).forEach((g, i) => { (map[g.i] = map[g.i] || {})[k] = i + 1; });
    });
    G._rank = { turn: G.turn, n: G.gens.length, map };
    return map;
  },
  top(g, k) { if (!g || g.i == null) return 0; const m = Game.ranks()[g.i]; return m && m[k] ? m[k] : 0; },
  // 上位者の効き目（1位はさらに強い）
  topK(g, k, mul = 1.4, first = 1.7) { const r = Game.top(g, k); return r === 1 ? first : r ? mul : 1; },
  titles(g) { const m = Game.ranks()[g.i] || {}; return Object.keys(m).map(k => ({ k, rank: m[k], name: Game.TITLE[k][m[k] === 1 ? 1 : 0] })); },
  topNote(g, k) { const r = Game.top(g, k); return r ? `（${Game.TITLE[k][r === 1 ? 1 : 0]}の手腕）` : ''; },

  // ---------------- 当たり・はずれ ----------------
  // 能力が高いほど当たり（大成功）が出やすく、はずれ（いまひとつ）が出にくい。上位者はさらに当たりやすい
  roll(g, stat, topKey) {
    const k = (stat - 60) / 200;
    const pg = clamp(0.15 + k + (Game.top(g, topKey || '') ? 0.12 : 0), 0.05, 0.5);
    const pp = clamp(0.2 - k, 0.03, 0.35);
    const r = Math.random();
    if (r < pg) return { grade: 'great', mult: rnd(1.6, 1.9), tag: '【大成功】' };
    if (r < pg + pp) return { grade: 'poor', mult: rnd(0.35, 0.6), tag: '' };   // はずれは札を出さない（台詞と表情で伝える）
    return { grade: 'normal', mult: rnd(0.9, 1.1), tag: '' };
  },
  gradeExpr(gr) { return gr === 'great' ? 'happy' : gr === 'poor' ? 'sad' : 'normal'; },

  // ---------------- 内政コマンド ----------------
  // 戻り値 { ok, msg, expr }
  doCommand(cmd, g, c, arg) {
    const cost = CONFIG.CMD_COST;
    const H = Game.has;
    const bonusPol = H(g, '治世') ? 1.3 : 1;
    const needGold = n => { if (c.gold < n) return { ok: false, msg: `金が足りない（${n}必要）`, expr: 'sad' }; return null; };
    let r;
    switch (cmd) {
      case 'farm': {
        if ((r = needGold(cost))) return r;
        if (c.farm >= c.farmMax) return { ok: false, msg: 'これ以上は開墾できない', expr: 'sad' };
        c.gold -= cost;
        const R = Game.roll(g, g.pol, 'pol');
        const v = Math.max(1, Math.round((g.pol * 0.35 + 6) * bonusPol * Game.topK(g, 'pol') * R.mult));
        c.farm = Math.min(c.farmMax, c.farm + v);
        return { ok: true, grade: R.grade, msg: `${R.tag}田畑を開いた。農業 +${v}${Game.topNote(g, 'pol')}`, expr: Game.gradeExpr(R.grade) };
      }
      case 'comm': {
        if ((r = needGold(cost))) return r;
        if (c.comm >= c.commMax) return { ok: false, msg: 'これ以上は伸ばせない', expr: 'sad' };
        c.gold -= cost;
        const R = Game.roll(g, g.pol, 'pol');
        const v = Math.max(1, Math.round((g.pol * 0.35 + 6) * bonusPol * Game.topK(g, 'pol') * R.mult));
        c.comm = Math.min(c.commMax, c.comm + v);
        return { ok: true, grade: R.grade, msg: `${R.tag}市を整えた。商業 +${v}${Game.topNote(g, 'pol')}`, expr: Game.gradeExpr(R.grade) };
      }
      case 'wall': {
        if ((r = needGold(cost))) return r;
        if (c.def >= c.defMax) return { ok: false, msg: '城壁はすでに万全だ', expr: 'normal' };
        c.gold -= cost;
        const R = Game.roll(g, (g.lead + g.pol) / 2, 'lead');
        const v = Math.max(1, Math.round((g.lead * 0.3 + g.pol * 0.15 + 5) * Math.max(Game.topK(g, 'lead', 1.35, 1.6), Game.topK(g, 'pol', 1.25, 1.4)) * R.mult));
        c.def = Math.min(c.defMax, c.def + v);
        return { ok: true, grade: R.grade, msg: `${R.tag}城壁を修築した。防御 +${v}${Game.topNote(g, 'lead') || Game.topNote(g, 'pol')}`, expr: Game.gradeExpr(R.grade) };
      }
      case 'alms': {
        const food = 1500;
        if (c.food < food) return { ok: false, msg: `兵糧が足りない（${food}必要）`, expr: 'sad' };
        c.food -= food;
        const R = Game.roll(g, g.cha, 'cha');
        const v = Math.max(1, Math.round((g.cha * 0.12 + 3) * (H(g, '仁徳') ? 1.5 : 1) * Game.topK(g, 'cha') * R.mult));
        c.loyal = Math.min(100, c.loyal + v);
        return { ok: true, grade: R.grade, msg: `${R.tag}民に施しを行った。民忠 +${v}${Game.topNote(g, 'cha')}`, expr: Game.gradeExpr(R.grade) };
      }
      case 'draft': {
        if ((r = needGold(CONFIG.RECRUIT_COST))) return r;
        if (c.loyal < 20) return { ok: false, msg: '民の心が離れていて兵が集まらない', expr: 'sad' };
        c.gold -= CONFIG.RECRUIT_COST;
        const R = Game.roll(g, g.cha, 'cha');
        const v = Math.max(100, Math.round((g.cha * 25 + 800) * (c.pop / 400000 + 0.5) * Game.topK(g, 'cha', 1.35, 1.6) * R.mult / 10) * 10);
        c.troops += v; c.pop = Math.max(50000, c.pop - v);
        c.loyal = Math.max(0, c.loyal - irnd(3, 6));
        c.train = Math.max(10, Math.round((c.train * (c.troops - v) + 20 * v) / c.troops));
        return { ok: true, grade: R.grade, msg: `${R.tag}兵を募った。兵 +${v}${Game.topNote(g, 'cha')}`, expr: Game.gradeExpr(R.grade) };
      }
      case 'train': {
        if (c.train >= 100) return { ok: false, msg: '兵はすでに精強だ', expr: 'normal' };
        const R = Game.roll(g, g.lead, 'lead');
        const v = Math.max(1, Math.round((g.lead * 0.18 + 4) * Game.topK(g, 'lead', 1.5, 1.8) * R.mult * Math.max(0.4, 1 - c.troops / 80000)));
        c.train = Math.min(100, c.train + v);
        return { ok: true, grade: R.grade, msg: `${R.tag}兵を鍛えた。訓練 +${v}${Game.topNote(g, 'lead')}`, expr: Game.gradeExpr(R.grade) };
      }
      case 'search': {
        const ronin = Game.roninIn(c.i);
        // 武将の少ない都市ほど、人を求めて熱心に探す（1人の都市 +35%、2人の都市 +20%）
        const few = Game.gensIn(c.i, g.faction).length;
        const fewK = few <= 1 ? 0.35 : few === 2 ? 0.2 : 0;
        if (ronin.length && Math.random() < 0.45 + g.cha / 250 + (Game.top(g, 'cha') ? 0.2 : 0) + fewK) {
          const t = pick(ronin);
          return { ok: true, found: t, msg: `在野の人物「${t.name}」を見つけた！`, expr: 'happy' };
        }
        // さらに、隣の都市にいる在野の人物まで探しに行き、この都市へ招く（1人の都市 65%、2人の都市 40%）
        if (fewK) {
          const near = G.gens.filter(x => x.state === 'ronin' && c.adj.includes(x.city) && x.name !== '諸葛亮');
          if (near.length && Math.random() < (few <= 1 ? 0.65 : 0.4) + g.cha / 400) {
            const t = pick(near), from = G.cities[t.city];
            t.city = c.i;
            return { ok: true, found: t, msg: `人手の足りぬ${c.name}のため、隣の${from.name}まで足を延ばし、在野の人物「${t.name}」を見つけて招いた！`, expr: 'happy' };
          }
        }
        if (Math.random() < 0.35) {
          const gold = irnd(50, 200); c.gold += gold;
          return { ok: true, msg: `人材は見つからなかったが、金${gold}を得た`, expr: 'normal' };
        }
        return { ok: false, msg: 'めぼしい人材は見つからなかった', expr: 'sad' };
      }
    }
    return { ok: false, msg: '?' };
  },

  // 修行：武将の1回の行動を使って、能力を1つ伸ばす。低い値ほど伸びやすく、高い値ほど伸びにくい
  //  〜49: +3〜5 / 50〜69: +2〜3 / 70〜79: +1〜2 / 80〜89: +1 / 90〜94: 50%で+1 / 95〜98: 10%で+1 / 99〜: 上がらない
  studyHint(v) { return v >= 99 ? '上限' : v >= 95 ? 'まれに+1' : v >= 90 ? '50%で+1' : v >= 80 ? '+1' : v >= 70 ? '+1〜2' : v >= 50 ? '+2〜3' : '+3〜5'; },
  study(g, k) {
    const v = g[k];
    const gain = v >= 99 ? 0 : v >= 95 ? (Math.random() < 0.1 ? 1 : 0) : v >= 90 ? (Math.random() < 0.5 ? 1 : 0) : v >= 80 ? 1 : v >= 70 ? irnd(1, 2) : v >= 50 ? irnd(2, 3) : irnd(3, 5);
    g[k] = Math.min(99, v + gain);
    G._rank = null;   // 称号（能力の上位者）を計算し直す
    return gain;
  },

  // 登用（在野 or 捕虜）。g=使者, t=対象
  tryRecruit(g, t, captive) {
    const lord = Game.lordOf(G.factions[g.faction].i);
    let ch = 0.25 + (g.cha - 50) / 150 + (lord.cha - 60) / 200;
    if (Game.has(g, '仁徳') || Game.has(lord, '仁徳')) ch += 0.15;
    if (Game.top(g, 'cha')) ch += Game.top(g, 'cha') === 1 ? 0.25 : 0.15;   // 人望の上位者
    if (captive) {
      if (Game.has(t, '忠義') && t.faction >= 0 && G.factions[t.faction].alive) ch -= 0.6;
      if (t.respect && G.gens.some(x => x.name === t.respect && x.state === 'serve' && x.faction === g.faction)) ch += 0.6;   // 一騎打ちで認め合った相手
      ch += (70 - t.loyalty) / 120;
    }
    // 三顧の礼：諸葛亮は君主自身が3回訪ねないと応じない
    if (t.name === '諸葛亮' && !captive) {
      G.events.kongming = G.events.kongming || {};
      const k = G.events.kongming[g.faction] = (G.events.kongming[g.faction] || 0) + (g.isLord ? 1 : 0);
      if (!g.isLord) return { ok: false, special: 'kongming0' };
      if (k < 3) return { ok: false, special: 'kongming' + k };
      ch = 1;
    }
    if (Math.random() < clamp(ch, 0.05, 0.95)) {
      Game.joinFaction(t, g.faction, g.city);
      return { ok: true };
    }
    return { ok: false };
  },
  // 負け戦で将を失う確率の倍率（プレイヤーだけ。武将が少ないほど小さい）
  //  3人まで0.25 / 6人まで0.4 / 10人まで0.65 / 14人まで0.85 / それより多いと1（今まで通り）
  lossK(fi) {
    if (fi !== G.player) return 1;
    const n = Game.gensOf(fi).length;
    return n <= 3 ? 0.25 : n <= 6 ? 0.4 : n <= 10 ? 0.65 : n <= 14 ? 0.85 : 1;
  },
  // 敵（コンピュータ）の在野登用の倍率。プレイヤーはいつも1
  //  都市の武将：2人まで1倍、3人0.6倍、4人0.45倍、5人以上0.3倍
  //  勢力の総武将数：8人まで1倍、それより多いと 8÷人数（16人0.5倍、32人0.25倍、下限0.2倍）
  aiRecruitK(fi, ci) {
    if (fi === G.player) return 1;
    const n = Game.gensIn(ci, fi).length;
    const cityK = n <= 2 ? 1 : n === 3 ? 0.6 : n === 4 ? 0.45 : 0.3;
    const tot = Game.gensOf(fi).length;
    const facK = tot <= 8 ? 1 : Math.max(0.2, 8 / tot);
    return cityK * facK;
  },
  joinFaction(t, fi, ci) {
    t.faction = fi; t.state = 'serve'; t.city = ci; t.isLord = false; t.loyalty = Game.has(t, '忠義') ? 90 : irnd(60, 80); t.joined = G.year;
    if (fi === G.player) G.stats.recruited++;
  },

  reward(g, c) {
    const cost = 100;
    if (c.gold < cost) return { ok: false, msg: '金が足りない（100必要）', expr: 'sad' };
    if (g.loyalty >= 100) return { ok: false, msg: 'すでに忠誠は万全だ', expr: 'normal' };
    c.gold -= cost;
    const v = Game.has(g, '野心') ? irnd(3, 7) : irnd(6, 12);
    g.loyalty = Math.min(100, g.loyalty + v);
    return { ok: true, msg: `褒美を与えた。忠誠 +${v}`, expr: 'happy' };
  },

  move(g, toCi) { g.city = toCi; g.acted = true; },

  transport(from, to, gold, food, troops) {
    from.gold -= gold; to.gold += gold; from.food -= food; to.food += food;
    if (troops) {
      const t = Math.min(troops, from.troops);
      to.train = Math.round((to.train * to.troops + from.train * t) / Math.max(1, to.troops + t));
      from.troops -= t; to.troops += t;
    }
  },

  // ---------------- 計略 ----------------
  // 離間：対象の忠誠を下げる
  plotSow(g, t) {
    const H = Game.has;
    if (t.isLord) return { ok: false, msg: '君主には効かない' };
    if (H(t, '忠義')) return { ok: false, msg: `${t.name}は動じなかった`, immune: true };
    let p = 0.45 + (g.int - t.int) / 120 + (H(g, '智謀') ? 0.15 : 0) - (H(t, '神算') ? 0.3 : 0) + (Game.top(g, 'int') ? 0.15 : 0) - (Game.top(t, 'int') ? 0.2 : 0);
    if (Math.random() > clamp(p, 0.08, 0.92)) return { ok: false, msg: Game.top(t, 'int') ? `${Game.TITLE.int[0]}の${t.name}に見破られた…` : '見破られた…' };
    let v = Math.round((g.int / 8 + irnd(2, 8)) * (H(t, '野心') ? 2 : 1));
    t.loyalty = Math.max(0, t.loyalty - v);
    return { ok: true, msg: `${t.name}の忠誠が ${v} 下がった`, v };
  },
  // 引き抜き
  plotLure(g, t, gold) {
    const H = Game.has;
    if (t.isLord) return { ok: false, msg: '君主は寝返らない' };
    if (H(t, '忠義')) return { ok: false, msg: `${t.name}「二君に仕える気はない」`, immune: true };
    let p = (75 - t.loyalty) / 60 + (g.cha - 60) / 200 + gold / 3000 + (H(t, '野心') ? 0.15 : 0) + (Game.top(g, 'cha') ? 0.12 : 0);
    if (Math.random() < clamp(p, 0, 0.9)) {
      const fromCity = G.cities[t.city];
      Game.joinFaction(t, g.faction, g.city);
      t.loyalty = irnd(50, 70);
      Game.checkCityEmpty(fromCity);
      return { ok: true, msg: `${t.name}が寝返った！` };
    }
    t.loyalty = Math.min(100, t.loyalty + 3);
    return { ok: false, msg: `${t.name}は誘いに乗らなかった` };
  },
  // 流言：都市の民忠・訓練を下げる
  plotRumor(g, c) {
    let p = 0.5 + (g.int - 70) / 100 + (Game.has(g, '智謀') ? 0.15 : 0) + (Game.top(g, 'int') ? 0.15 : 0);
    const def = Game.gensIn(c.i).reduce((m, h) => Math.max(m, h.int + (Game.has(h, '神算') ? 20 : 0) + (Game.top(h, 'int') ? 15 : 0)), 0);
    p -= (def - 70) / 120;
    if (Math.random() > clamp(p, 0.1, 0.9)) return { ok: false, msg: '流言は広まらなかった' };
    const v = irnd(8, 18); c.loyal = Math.max(0, c.loyal - v); c.train = Math.max(0, c.train - Math.round(v / 2));
    return { ok: true, msg: `${c.name}の民忠 -${v}、訓練 -${Math.round(v / 2)}` };
  },

  // ---------------- 外交 ----------------
  diploAlly(g, fi) {
    const me = G.factions[g.faction], tgt = G.factions[fi];
    const pMe = Game.power(g.faction), pT = Game.power(fi);
    let p = 0.3 + (g.cha + g.int - 130) / 200 + (pMe / (pT + 1) - 1) * 0.15 - (tgt.hostility[g.faction] || 0) / 100 + (Game.top(g, 'cha') || Game.top(g, 'int') ? 0.12 : 0);
    if (Game.has(Game.lordOf(fi), '野心')) p -= 0.1;
    if (Math.random() < clamp(p, 0.05, 0.85)) {
      me.allies[fi] = CONFIG.ALLY_TURNS; tgt.allies[g.faction] = CONFIG.ALLY_TURNS;
      return { ok: true, msg: `${tgt.name}と同盟を結んだ（${CONFIG.ALLY_TURNS / 4}年）` };
    }
    return { ok: false, msg: `${tgt.name}に同盟を断られた` };
  },
  // 降伏の見込み：兵力差・都市数・囲まれ方（隣接しているか）・相手君主の気性・使者の魅力で決まる
  surrenderOdds(g, fi) {
    const me = g.faction, tgt = G.factions[fi], lord = Game.lordOf(fi);
    const pMe = Game.power(me), pT = Game.power(fi);
    const tCities = Game.citiesOf(fi), nT = tCities.length, nMe = Game.citiesOf(me).length;
    // 囲まれ方：相手の都市の隣のうち、こちら（と同盟国）の都市が占める割合
    let adjMine = 0, adjAll = 0, touching = false;
    tCities.forEach(c => c.adj.forEach(a => {
      const o = G.cities[a].owner; if (o === fi) return;
      adjAll++;
      if (o === me) { adjMine++; touching = true; } else if (o !== null && Game.isAlly(me, o)) adjMine += 0.7;
    }));
    const enc = adjAll ? adjMine / adjAll : 0;
    const ratio = pMe / Math.max(1, pT);
    let cap = 0.85;
    let p = (Math.log2(Math.max(1, ratio)) - 1.6) * 0.13 + enc * 0.3 + Math.min(0.12, Math.max(0, nMe / nT - 3) * 0.015) + (g.cha - 70) / 160 + (Game.top(g, 'cha') ? 0.08 : 0);
    if (nT === 1) p += 0.12;                                 // 最後の一城
    p -= (nT - 1) * 0.06;                                    // 国が大きいほど粘る
    cap = Math.min(cap, 0.35 + enc * 0.6);                    // 囲みが甘いうちは、まだ逃げ道がある
    if (tCities.every(c => c.troops < 3000)) p += 0.08;      // もはや兵がいない
    p -= (tgt.hostility[me] || 0) / 150;
    // 相手の君主の気性
    let spirit = '';
    if (lord) {
      if (Game.has(lord, '野心')) { p -= 0.22; spirit = 'proud'; cap = 0.5; }
      if (Game.has(lord, '剛勇') || Game.has(lord, '猪突')) { p -= 0.15; spirit = spirit || 'brave'; cap = Math.min(cap, 0.6); }
      if (Game.has(lord, '忠義')) { p -= 0.15; spirit = spirit || 'loyal'; }
      if (Game.has(lord, '臆病')) p += 0.15;
      if (Game.has(lord, '慎重')) p += 0.05;
      if (lord.war >= 95 || ['曹操', '劉備', '孫権', '孫策'].includes(lord.name)) { p -= 0.3; spirit = 'hero'; cap = 0.3; }   // 天下に名だたる者は膝を屈しない
    }
    if (!touching) { p = p * 0.15 - 0.05; cap = Math.min(cap, 0.1); }   // 国境を接していなければ脅しにならない
    return { p: clamp(p, 0, cap), spirit, touching, enc };
  },
  diploSurrender(g, fi) {
    const tgt = G.factions[fi];
    const o = Game.surrenderOdds(g, fi);
    if (Math.random() < o.p) {
      Game.absorbFaction(fi, g.faction);
      return { ok: true, msg: `${tgt.name}が降伏した！ 領地と配下がすべて加わった` };
    }
    const say = !o.touching ? '遠く離れた者の脅しなど、恐るるに足らん'
      : o.spirit === 'hero' ? '天下を望む者が、膝を屈するものか！'
      : o.spirit === 'proud' ? 'わしの野望は、まだ終わっておらぬ！'
      : o.spirit === 'brave' ? '降伏だと？ 最後の一兵まで戦うのみ！'
      : o.spirit === 'loyal' ? '節を曲げて生き長らえる気はない'
      : o.p < 0.15 ? '降伏などせぬ！' : '……まだ戦える。降伏はせぬ';
    return { ok: false, msg: `${tgt.name}「${say}」` };
  },
  surrenderHint(p) { return p >= 0.5 ? '見込み 高' : p >= 0.25 ? '見込み 中' : p >= 0.08 ? '見込み 低' : '見込み なし'; },
  absorbFaction(fi, toFi) {
    G.cities.forEach(c => { if (c.owner === fi) c.owner = toFi; });
    G.gens.forEach(g => { if (g.state === 'serve' && g.faction === fi) { g.faction = toFi; g.isLord = false; g.loyalty = irnd(55, 75); } });
    Game.killFaction(fi);
  },
  killFaction(fi) {
    const f = G.factions[fi];
    if (!f.alive) return;
    f.alive = false;
    G.factions.forEach(o => { delete o.allies[fi]; });
    Game.log(`${f.name}軍、滅亡。`);
  },

  // 都市に武将がいなくなった・兵だけの都市の扱い（そのまま保持）
  checkCityEmpty(c) { /* 武将がいなくても兵は残る。空き都市は攻め込まれると守備隊が守る */ },

  // ---------------- 君主の死・後継 ----------------
  succession(fi, deadLord) {
    const f = G.factions[fi];
    const cands = Game.gensOf(fi).filter(g => g.i !== deadLord.i);
    if (!cands.length || !Game.citiesOf(fi).length) {
      // 後継なし（または都市がない）：都市は空白地に、残った家臣は在野に
      G.cities.forEach(c => { if (c.owner === fi) c.owner = null; });
      cands.forEach(g => { g.faction = -1; g.isLord = false; g.state = 'ronin'; });
      Game.killFaction(fi);
      return null;
    }
    const sur = deadLord.name[0];
    cands.sort((a, b) => ((b.name[0] === sur ? 60 : 0) + b.cha + b.lead) - ((a.name[0] === sur ? 60 : 0) + a.cha + a.lead));
    const h = cands[0];
    const oldName = f.name;
    h.isLord = true; h.loyalty = 100; f.lord = h.i; f.name = h.name;
    h.succFrom = oldName;   // 引き継ぐ前の軍の名前（知らせに使う）
    if (G.cities[f.capital].owner !== fi) f.capital = G.cities[h.city].owner === fi ? h.city : Game.citiesOf(fi)[0].i;
    Game.gensOf(fi).forEach(g => { if (!g.isLord && !Game.has(g, '忠義')) g.loyalty = Math.max(0, g.loyalty - irnd(0, 15)); });
    Game.log(`${deadLord.name}の跡を${h.name}が継いだ。${Game.succNote(h)}`);
    return h;
  },

  // 「◯◯軍は××軍となった」（名前が同じなら何も付けない）
  succNote(h) { return h && h.succFrom && h.succFrom !== h.name ? `${h.succFrom}軍は${h.name}軍となった。` : ''; },

  // 武将の死
  killGeneral(g, reason) {
    const wasLord = g.isLord, fi = g.faction;
    g.state = 'dead'; g.isLord = false; g.deathReason = reason;
    if (wasLord && fi >= 0) return Game.succession(fi, g);
    return null;
  },

  // ---------------- 季節の進行 ----------------
  // 戻り値: 出来事（UIで順に表示）
  endSeason() {
    const ev = [];
    // 収入
    G.cities.forEach(c => {
      if (c.owner === null) { c.troops = Math.min(c.troops + 200, 6000); return; }
      const loyK = 0.5 + c.loyal / 200;
      c.gold += Math.round((c.comm * 0.9 + c.pop / 4000) * loyK * 0.6);
      // 兵糧消費
      c.food -= Math.round(c.troops * 0.12);
      if (G.season === 2) { // 秋の収穫
        const h = Math.round((c.farm * 30 + c.pop / 30) * loyK * (c.harvestK || 1));
        c.food += h;
        if (c.owner === G.player) ev.push({ type: 'info', msg: `${c.name}で収穫。兵糧 +${h}` , city: c.i, quiet: true});
      }
      if (c.food < 0) { // 兵糧不足 → 兵が逃げる
        const lost = Math.round(c.troops * 0.2); c.troops -= lost; c.food = 0; c.loyal = Math.max(0, c.loyal - 5);
        if (c.owner === G.player) ev.push({ type: 'warn', msg: `${c.name}で兵糧が尽き、兵${lost}が逃げ出した`, city: c.i });
      }
      // 人口・民忠
      c.pop = Math.round(c.pop * (1 + (c.loyal - 40) / 8000 + c.farm / c.farmMax * 0.004));
      c.loyal = clamp(c.loyal + (c.loyal < 50 ? 1 : -0.5), 0, 100);
      c.train = Math.max(0, c.train - 1);
      c.harvestK = 1;
    });
    // 災害・豊作（夏に判定して秋の収穫に響く）
    if (G.season === 1) {
      G.cities.forEach(c => {
        const r = Math.random();
        if (r < 0.04) { c.harvestK = 0.5; c.pop = Math.round(c.pop * 0.97); if (c.owner === G.player) ev.push({ type: 'warn', msg: `${c.name}で洪水が起きた。秋の収穫が減りそうだ`, city: c.i }); }
        else if (r < 0.07) { c.harvestK = 0.6; if (c.owner === G.player) ev.push({ type: 'warn', msg: `${c.name}にイナゴの大群が襲来した`, city: c.i }); }
        else if (r < 0.12) { c.harvestK = 1.3; if (c.owner === G.player) ev.push({ type: 'good', msg: `${c.name}は天候に恵まれ、豊作の兆し`, city: c.i }); }
      });
    }
    if (Math.random() < 0.03) {
      const c = pick(G.cities.filter(x => x.owner !== null));
      c.pop = Math.round(c.pop * 0.9); c.troops = Math.round(c.troops * 0.9); c.loyal = Math.max(0, c.loyal - 8);
      if (c.owner === G.player) ev.push({ type: 'warn', msg: `${c.name}で疫病が流行した。人口と兵が減った`, city: c.i });
    }
    // 同盟の期限
    G.factions.forEach(f => { Object.keys(f.allies).forEach(k => { f.allies[k]--; if (f.allies[k] <= 0) { delete f.allies[k]; if (f.i === G.player) ev.push({ type: 'info', msg: `${G.factions[k].name}との同盟が期限を迎えた` }); } }); });
    // 忠誠の変化・謀反
    G.gens.forEach(g => {
      if (g.state !== 'serve' || g.isLord) return;
      if (Game.has(g, '忠義')) { g.loyalty = Math.max(g.loyalty, 85); return; }
      const lord = Game.lordOf(g.faction);
      const drift = (lord.cha - 70) / 60 - (Game.has(g, '野心') ? 1.2 : 0.3);
      g.loyalty = clamp(g.loyalty + drift, 0, 100);
    });
    ev.push(...Game.checkRebellion());
    ev.push(...Game.checkIndependence());

    // 季節を進める
    G.season++; G.turn++;
    if (G.season > 3) { G.season = 0; G.year++; ev.push(...Game.newYear()); }
    G.gens.forEach(g => g.acted = false);
    ev.push(...Game.wanderRonin());
    // 不定期イベントと史実イベント
    if (typeof Events !== 'undefined') ev.push(...Events.run());
    return ev;
  },

  checkRebellion() {
    const ev = [];
    G.gens.forEach(g => {
      if (g.state !== 'serve' || g.isLord || !Game.has(g, '野心') || g.loyalty >= 25) return;
      if (Math.random() > 0.35) return;
      const c = G.cities[g.city];
      if (c.owner !== g.faction) return;
      const oldF = g.faction;
      // 本拠では謀反しない（君主と同じ都市）
      if (Game.lordOf(oldF).city === c.i || G.factions[oldF].capital === c.i) return;
      // 独立：新勢力を作る
      const nf = { i: G.factions.length, name: g.name, color: '#' + (0x404040 + Math.floor(Math.random() * 0x9f9f9f)).toString(16).padStart(6, '0'), lord: g.i, alive: true, capital: c.i, allies: {}, isPlayer: false, hostility: {} };
      G.factions.push(nf);
      g.faction = nf.i; g.isLord = true; g.loyalty = 100;
      c.owner = nf.i;
      // 同じ都市の、忠誠の低い武将がついていく
      Game.gensIn(c.i, oldF).forEach(h => { if (h !== g && h.loyalty < 60 && !Game.has(h, '忠義')) { h.faction = nf.i; h.loyalty = irnd(70, 90); } });
      // ついていかない武将は本拠へ
      Game.gensIn(c.i, oldF).forEach(h => { h.city = G.factions[oldF].capital; });
      Game.log(`${g.name}が${c.name}で謀反を起こし、独立した！`);
      ev.push({ type: oldF === G.player ? 'warn' : 'info', msg: `${g.name}が${G.factions[oldF].name}に背き、${c.name}で独立した！`, gen: g.i, expr: 'angry', city: c.i, line: line(g, 'rebel') });
    });
    return ev;
  },

  // 天下の半分以上を治めると、忠誠の低い太守が独立することがある（季節に1件まで、2季節あける）
  // 独立した都市は兵が3倍になり、近くの在野武将が3人まで加わる
  checkIndependence() {
    const ev = [], pf = G.player;
    const mineN = Game.citiesOf(pf).length;
    if (mineN * 2 < G.cities.length) return ev;
    const now = G.year * 4 + G.season;
    if (G.events.indepAt != null && now - G.events.indepAt < 2) return ev;
    const lord = Game.lordOf(pf), cap = G.factions[pf].capital;
    const cand = [];
    Game.citiesOf(pf).forEach(c => {
      if (c.i === cap || c.i === lord.city) return;
      const gs = Game.gensIn(c.i, pf).filter(g => !g.isLord);
      if (!gs.length) return;
      const gov = gs.sort((a, b) => (b.lead + b.war + b.int + b.pol) - (a.lead + a.war + a.int + a.pol))[0];   // 太守：その都市でいちばん格上の武将
      if (Game.has(gov, '忠義') || gov.loyalty >= 60 || gov.i === G.strategist) return;
      const p = (60 - gov.loyalty) / 80 + (Game.has(gov, '野心') ? 0.15 : 0) + (c.loyal < 50 ? 0.05 : 0);
      cand.push({ c, gov, p });
    });
    const hit = cand.sort((a, b) => b.p - a.p).find(x => Math.random() < x.p);
    if (!hit) return ev;
    const { c, gov: g } = hit;
    G.events.indepAt = now;
    const say = line(g, 'indep');   // 主君の名が入るので、勢力を移る前に
    const nf = { i: G.factions.length, name: g.name, color: '#' + (0x404040 + Math.floor(Math.random() * 0x9f9f9f)).toString(16).padStart(6, '0'), lord: g.i, alive: true, capital: c.i, allies: {}, isPlayer: false, hostility: { [pf]: 60 } };
    G.factions.push(nf);
    g.faction = nf.i; g.isLord = true; g.loyalty = 100;
    c.owner = nf.i;
    // 同じ都市の、忠誠の低い武将はついていく。残りは本拠へ
    const followers = [];
    Game.gensIn(c.i, pf).forEach(h => { if (h.loyalty < 60 && !Game.has(h, '忠義')) { h.faction = nf.i; h.loyalty = irnd(70, 90); followers.push(h.name); } else h.city = cap; });
    // すぐに潰されないように：兵は3倍、蓄えも足す
    c.troops = Math.max(3000, c.troops * 3); c.food = Math.max(c.food, Math.round(c.troops * 1.5)); c.gold += 500; c.loyal = Math.max(c.loyal, 60);
    // 在野の武将が3人まで加わる（同じ都市→隣の都市→どこでも）
    const ronin = G.gens.filter(x => x.state === 'ronin' && x.name !== '諸葛亮')
      .sort((a, b) => (a.city === c.i ? 0 : c.adj.includes(a.city) ? 1 : 2) - (b.city === c.i ? 0 : c.adj.includes(b.city) ? 1 : 2) || (b.lead + b.war + b.int) - (a.lead + a.war + a.int)).slice(0, 3);
    ronin.forEach(x => { Game.joinFaction(x, nf.i, c.i); x.loyalty = irnd(75, 95); });
    Game.log(`${g.name}が${c.name}で独立した！`);
    const extra = [followers.length ? `${followers.join('・')}がついていった` : '', ronin.length ? `在野の${ronin.map(x => x.name).join('・')}が馳せ参じた` : ''].filter(Boolean).join('。');
    ev.push({ type: 'warn', msg: `大きくなりすぎた国に、ひびが入り始めた。\n${g.name}が${G.factions[pf].name}軍に背き、${c.name}で独立した！\n兵 ${fmt(c.troops)}。${extra}`, gen: g.i, expr: 'angry', city: c.i, line: say, tag: '独立' });
    return ev;
  },

  // 在野武将の放浪：同じ都市に3〜5季節（人ごとに決まる）とどまると、隣の都市へ移る
  //  諸葛亮は三顧の礼のため動かない。顔を知っている在野がプレイヤーの都市を去る時は知らせる
  wanderRonin() {
    const ev = [];
    G.gens.forEach(g => {
      if (g.state !== 'ronin' || g.name === '諸葛亮') return;
      if (g.stayMax == null) { g.stayMax = irnd(3, 5); g.stay = irnd(0, g.stayMax - 1); }   // はじめは、滞在の途中から数える
      g.stay = (g.stay || 0) + 1;
      if (g.stay < g.stayMax) return;
      const from = G.cities[g.city], to = G.cities[pick(from.adj)];
      g.city = to.i; g.stay = 0; g.stayMax = irnd(3, 5);
      if (g.known && from.owner === G.player && to.owner !== G.player && ev.length < 2) ev.push({ type: 'info', msg: `在野の${g.name}が${from.name}を去り、${to.name}へ旅立った` });
    });
    return ev;
  },

  newYear() {
    const ev = [];
    // 寿命
    if (G.opts.lifespan) {
      G.gens.forEach(g => {
        if ((g.state === 'serve' || g.state === 'ronin') && G.year >= g.die && Math.random() < 0.55) {
          const fi = g.faction, wasLord = g.isLord, mine = g.state === 'serve' && fi === G.player;
          const deathLine = mine ? line(g, 'death') : null;
          const heir = Game.killGeneral(g, '病');
          Game.log(`${g.name}、病に倒れる。`);
          if (mine || (wasLord)) ev.push({ type: mine ? 'warn' : 'info', msg: `${g.name}が病でこの世を去った${wasLord && heir ? `。跡は${heir.name}が継ぐ。${Game.succNote(heir)}` : ''}`, gen: g.i, expr: 'sad', death: true, line: mine ? deathLine : null });
        }
      });
    }
    // 新しい人物の登場
    G.gens.forEach(g => {
      if (g.state === 'future' && g.appear <= G.year && g.die > G.year) { g.state = 'ronin'; g.city = g.home; }
    });
    // AI の勧誘（在野）
    G.gens.forEach(g => {
      if (g.state !== 'ronin') return;
      const c = G.cities[g.city];
      if (c.owner !== null && c.owner !== G.player && g.name !== '諸葛亮' && Math.random() < 0.25 * Game.aiRecruitK(c.owner, c.i)) Game.joinFaction(g, c.owner, c.i);   // 諸葛亮は三顧の礼でしか仕えない
    });
    return ev;
  },

  // 勝敗判定
  checkEnd() {
    const alive = G.factions.filter(f => f.alive);
    if (!G.factions[G.player].alive) return 'lose';
    if (alive.length === 1 && alive[0].i === G.player) return 'win';
    return null;
  },

  // ---------------- 保存 ----------------
  save() { try { localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(G)); try { localStorage.setItem(CONFIG.SAVE_KEY + '_info', JSON.stringify(Game.saveInfo())); } catch (e2) {} return true; } catch (e) { return false; } },
  load() { try { const s = localStorage.getItem(CONFIG.SAVE_KEY); if (!s) return false; G = JSON.parse(s); return true; } catch (e) { return false; } },
  hasSave() { try { return !!localStorage.getItem(CONFIG.SAVE_KEY); } catch (e) { return false; } },
  clearSave() { try { localStorage.removeItem(CONFIG.SAVE_KEY); localStorage.removeItem(CONFIG.SAVE_KEY + '_info'); } catch (e) {} },
  // 任意セーブの枠（自動セーブとは別。自分で選んで保存した時だけ書き換わる）
  SLOTS: 5,
  slotKey(n) { return `${CONFIG.SAVE_KEY}_slot${n}`; },
  saveInfo() {
    const lord = Game.lordOf(G.player), f = G.factions[G.player];
    const d = new Date(), z = x => String(x).padStart(2, '0');
    return { lord: lord ? lord.name : '', fac: f ? f.name : '', color: f ? f.color : '#777', year: G.year, season: G.season,
      cities: Game.citiesOf(G.player).length, at: `${d.getFullYear()}/${z(d.getMonth() + 1)}/${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}` };
  },
  saveSlot(n) {
    try { localStorage.setItem(Game.slotKey(n), JSON.stringify(G)); localStorage.setItem(Game.slotKey(n) + '_info', JSON.stringify(Game.saveInfo())); return true; } catch (e) { return false; }
  },
  loadSlot(n) {
    try { const s = localStorage.getItem(n === 'auto' ? CONFIG.SAVE_KEY : Game.slotKey(n)); if (!s) return false; G = JSON.parse(s); return true; } catch (e) { return false; }
  },
  slotInfo(n) {
    try {
      const key = n === 'auto' ? CONFIG.SAVE_KEY : Game.slotKey(n);
      if (!localStorage.getItem(key)) return null;
      const inf = localStorage.getItem(key + '_info');
      if (inf) return JSON.parse(inf);
      // 以前の形式（見出しなし）のデータは、中身から見出しを作る
      const g = JSON.parse(localStorage.getItem(key)), f = g.factions[g.player], lord = g.gens.find(x => x.isLord && x.faction === g.player && x.state === 'serve');
      return { lord: lord ? lord.name : '', fac: f ? f.name : '', color: f ? f.color : '#777', year: g.year, season: g.season, cities: g.cities.filter(c => c.owner === g.player).length, at: '―' };
    } catch (e) { return null; }
  },
  deleteSlot(n) { try { localStorage.removeItem(Game.slotKey(n)); localStorage.removeItem(Game.slotKey(n) + '_info'); } catch (e) {} },
  anySave() { if (Game.hasSave()) return true; for (let n = 1; n <= Game.SLOTS; n++) if (Game.slotInfo(n)) return true; return false; },
};

// ============================================================
//  AI（コンピュータ勢力）
// ============================================================
const AI = {
  // 1勢力ぶんの行動。攻撃の予定（battles）を返す
  runFaction(fi) {
    const f = G.factions[fi];
    if (!f.alive) return [];
    const battles = [];
    const myCities = Game.citiesOf(fi);
    myCities.forEach(c => AI.develop(c, fi));
    // 褒美で忠誠維持
    Game.gensOf(fi).forEach(g => {
      if (g.loyalty < 70 && !g.isLord) { const c = G.cities[g.city]; if (c.gold > 300) { c.gold -= 100; g.loyalty = Math.min(100, g.loyalty + 8); } }
    });
    // 在野登用
    myCities.forEach(c => {
      const r = Game.roninIn(c.i);
      if (r.length && Math.random() < 0.3 * Game.aiRecruitK(fi, c.i)) { const t = r[0]; if (t.name !== '諸葛亮') Game.joinFaction(t, fi, c.i); }
    });
    // 計略（プレイヤーの武将に離間・引き抜き）を時々
    if (Math.random() < 0.25) AI.plot(fi);
    // 降伏勧告：追い詰めた隣国（プレイヤー以外）に使者を出す
    if (Math.random() < 0.3) {
      const env = Game.gensOf(fi).sort((a, b) => b.cha - a.cha)[0];
      const nb = new Set(); myCities.forEach(c => c.adj.forEach(a => { const o = G.cities[a].owner; if (o !== null && o !== fi && o !== G.player && !Game.isAlly(fi, o)) nb.add(o); }));
      const t = env && [...nb].map(o => ({ o, p: Game.surrenderOdds(env, o).p })).sort((a, b) => b.p - a.p)[0];
      if (t && t.p >= 0.2 && Math.random() < t.p) { const nm = G.factions[t.o].name; Game.absorbFaction(t.o, fi); Game.log(`${nm}軍が${f.name}軍に降伏した。`); }
    }
    // 合従：プレイヤーが強大になったら、プレイヤーと接する勢力どうしが手を組んで対抗する
    const pN = Game.citiesOf(G.player).length;
    if (pN >= 8 && pN >= myCities.length * 1.5 && !Game.isAlly(fi, G.player) && Math.random() < 0.15) {
      const touchP = x => Game.citiesOf(x).some(c => c.adj.some(a => G.cities[a].owner === G.player));
      if (touchP(fi)) {
        const partner = G.factions.filter(o => o.alive && o.i !== fi && o.i !== G.player && !Game.isAlly(fi, o.i) && !Game.isAlly(o.i, G.player) && touchP(o.i)
          && myCities.some(c => c.adj.some(a => G.cities[a].owner === o.i))).sort((a, b) => Game.power(b.i) - Game.power(a.i))[0];
        if (partner) {
          f.allies[partner.i] = CONFIG.ALLY_TURNS; partner.allies[fi] = CONFIG.ALLY_TURNS;
          Game.log(`${f.name}軍と${partner.name}軍が、${G.factions[G.player].name}軍に対抗して手を結んだ。`);
          (AI._allyNews = AI._allyNews || []).push({ a: fi, b: partner.i });
        }
      }
    }
    // 外交（たまにプレイヤーへ同盟を申し出る → UIで処理）
    // 武将の再配置：前線へ
    AI.redistribute(fi);
    // 攻撃
    myCities.forEach(c => {
      const b = AI.considerAttack(c, fi);
      if (b) battles.push(b);
    });
    return battles;
  },

  develop(c, fi) {
    const gens = Game.gensIn(c.i, fi);
    const threat = AI.threat(c, fi);
    gens.forEach(g => {
      if (g.acted) return;
      let cmd;
      const foodOk = add => c.food - Game.foodReserve(c, c.troops + add) > 0;
      if (c.loyal < 40 && c.food - 1500 > Game.foodReserve(c)) cmd = 'alms';
      else if (threat > c.troops * 0.8 && c.gold >= CONFIG.RECRUIT_COST && c.loyal >= 50 && foodOk(3000)) cmd = 'draft';
      // 魅力の高い将（70以上）は、自分が納得する民忠（30＋魅力×0.6）に届くまで施しをする（上の急ぎの用には譲る）
      else if (g.cha >= 70 && c.loyal < 30 + g.cha * 0.6 && c.food - 1500 > Game.foodReserve(c)) cmd = 'alms';
      else if (c.train < 60 && c.troops > 3000) cmd = 'train';
      else if (c.farm < c.farmMax * 0.8 && g.pol >= 50 && Math.random() < 0.5) cmd = 'farm';
      else if (c.comm < c.commMax * 0.8 && g.pol >= 50) cmd = 'comm';
      else if (c.def < c.defMax * 0.8 && Math.random() < 0.4) cmd = 'wall';
      else if (c.gold >= CONFIG.RECRUIT_COST * 2 && c.troops < 40000 && c.loyal >= 50 && foodOk(3000)) cmd = 'draft';
      else if (c.train < 95) cmd = 'train';
      else return;
      Game.doCommand(cmd, g, c);
      g.acted = true;
    });
    // 武将のいない都市も最低限の徴兵
    if (!gens.length && c.gold > 200) { c.gold -= 100; c.troops += 800; }
  },

  threat(c, fi) {
    return c.adj.reduce((s, a) => { const o = G.cities[a]; return (o.owner !== null && o.owner !== fi && !Game.isAlly(fi, o.owner)) ? s + o.troops : s; }, 0);
  },

  redistribute(fi) {
    const cities = Game.citiesOf(fi);
    if (cities.length < 2) return;
    // 兵の多い後方 → 前線へ兵を送る
    cities.forEach(c => {
      const front = c.adj.some(a => G.cities[a].owner !== fi);
      if (!front && c.troops > 8000) {
        const dest = c.adj.map(a => G.cities[a]).filter(o => o.owner === fi).sort((a, b) => AI.threat(b, fi) - AI.threat(a, fi))[0];
        if (dest) { const t = Math.round(c.troops * 0.5); Game.transport(c, dest, Math.round(c.gold * 0.3), Math.round(c.food * 0.3), t); }
      }
      // 武将が多すぎる都市から、武将のいない隣の自都市へ
      const gs = Game.gensIn(c.i, fi).filter(g => !g.isLord);
      const empty = c.adj.map(a => G.cities[a]).filter(o => o.owner === fi && Game.gensIn(o.i, fi).length === 0);
      if (gs.length >= 3 && empty.length) { gs.sort((a, b) => b.lead - a.lead); gs[gs.length - 1].city = empty[0].i; }
    });
    // 前線どうし：脅威に対して余裕のある都市から、兵の足りない隣の自都市へ回す（大軍に狙われた城を固める）
    cities.filter(c => Game.isFront(c)).forEach(c => {
      const spare = c.troops - Math.max(5000, AI.threat(c, fi) * 1.5);
      if (spare < 3000) return;
      const need = c.adj.map(a => G.cities[a]).filter(o => o.owner === fi && Game.isFront(o)).map(o => ({ o, lack: AI.threat(o, fi) * 0.9 - o.troops })).filter(x => x.lack > 2000).sort((a, b) => b.lack - a.lack)[0];
      if (!need) return;
      const amt = Math.round(Math.min(spare, need.lack) / 100) * 100;
      Game.transport(c, need.o, 0, Math.min(Math.round(c.food * 0.2), Math.round(amt * 0.5)), amt);
    });
    // 後方の強い武将を前線へ（季節に1〜2人）
    const fronts = cities.filter(c => Game.isFront(c));
    let moved = 0;
    cities.filter(c => !Game.isFront(c)).forEach(c => {
      if (moved >= 2 || !fronts.length) return;
      const gs = Game.gensIn(c.i, fi).filter(g => !g.isLord && !g.acted);
      if (Game.gensIn(c.i, fi).length < 2) return;
      const best = gs.sort((a, b) => (b.lead + b.war) - (a.lead + a.war))[0];
      if (best && best.lead + best.war >= 150) {
        const dest = fronts.slice().sort((a, b) => (AI.threat(b, fi) / 1500 - Game.gensIn(b.i, fi).length * 5) - (AI.threat(a, fi) / 1500 - Game.gensIn(a.i, fi).length * 5))[0];
        best.city = dest.i; moved++;
      }
    });
  },

  // プレイヤーへの攻め気（0〜1）：プレイヤーの都市3以下・開始直後は0、都市10以上か4年（16季節）たてば1
  pressure() { return clamp(Math.max((Game.citiesOf(G.player).length - 3) / 7, (G.turn || 0) / 16), 0, 1); },
  considerAttack(c, fi) {
    const gens = Game.gensIn(c.i, fi).filter(g => !g.acted || true);
    if (!gens.length || c.troops < 5000 || c.food < 4000) return null;
    const f = G.factions[fi];
    // 攻める相手
    const targets = c.adj.map(a => G.cities[a]).filter(o => o.owner !== fi && (o.owner === null || !Game.isAlly(fi, o.owner)));
    if (!targets.length) return null;
    // 見立て役：その勢力でいちばん知力の高い武将。賢いほど見積もりが正確で、確かな勝ち目を求める
    const sage = Game.gensOf(fi).reduce((m, g) => g.int > m.int ? g : m, gens[0]);
    const q = clamp((sage.int - 45) / 50, 0, 1), noise = (1 - q) * 0.5;
    const avgS = arr => arr.length ? arr.reduce((s2, g) => s2 + g.lead * 0.6 + g.war * 0.4, 0) / arr.length : 40;
    const top5 = gens.slice().sort((a, b) => (b.lead + b.war) - (a.lead + a.war)).slice(0, 5);
    // 実際に出せる兵（守備兵の目安を残し、将の率いられる上限まで）
    const sendable = Math.min(c.troops - Math.max(Game.isFront(c) ? 3000 : 1500, c.troops * 0.25), top5.reduce((s2, g) => s2 + Game.troopCap(g), 0));
    const atkPow = Math.max(0, sendable) * (0.5 + c.train / 200) * (0.6 + avgS(top5) / 100);
    const K = Game.siegeK(fi);
    let best = null, bestScore = 0;
    targets.forEach(t => {
      const defGens = Game.gensIn(t.i).sort((a, b) => (b.lead + b.war) - (a.lead + a.war)).slice(0, 5);
      // 守りの強さ：兵・訓練・将・城壁（序盤の効き目つき）、それに隣の都市から来そうな援軍
      let help = 0;
      if (t.owner !== null) { const nb = t.adj.map(a => G.cities[a]).filter(o => o.owner === t.owner).sort((a, b) => b.troops - a.troops)[0]; if (nb) help = Math.min(9000, nb.troops * 0.35) * 0.5; }
      const defPow = (t.troops * (1.05 + (0.1 + t.def / 1500) * K) + help) * (0.5 + t.train / 200) * (defGens.length ? 0.6 + avgS(defGens) / 100 : 0.85) + (t.owner === null ? 0 : 500);
      let score = atkPow / Math.max(1, defPow * (1 + (Math.random() - 0.5) * noise));
      // プレイヤーの都市は隙あらば狙う：兵が手薄（出陣直後など）なら大きく、武将がいなければさらに
      // 序盤は様子を見て、ゲームが進むほど（プレイヤーの都市数か経過した季節の多い方）激しく狙う
      if (t.owner === G.player) {
        const pr = AI.pressure();
        score *= 0.8 + 0.45 * pr;
        const mine = Game.citiesOf(G.player), avgT = mine.reduce((s2, x) => s2 + x.troops, 0) / Math.max(1, mine.length);
        if (t.troops < avgT * 0.6) score *= 1 + 0.2 * pr;
        if (!defGens.length) score *= 1 + 0.15 * pr;
      }
      if (t.owner === null) score *= 1.3;
      if (score > bestScore) { bestScore = score; best = t; }
    });
    // 強くて頭の良くない武将が上限まで兵を率いられるなら、攻め気が増す
    const brave = gens.find(g => ((g.war >= 85 && g.int <= 60) || (Game.has(g, '猪突') && g.war >= 80)) && c.troops * 0.8 >= Game.troopCap(g));
    // 求める勝ち目：賢い見立て役ほど高く（1.0〜1.2）。野心の君主・猛将は低く
    const aggressive = (brave ? 0.8 : Game.has(Game.lordOf(fi), '野心') ? 0.9 : 1.0) * (1 + 0.2 * q);
    if (!best || bestScore < aggressive) return null;
    // いつも攻めるわけではない。プレイヤーの都市は、序盤は35%で見送り、終盤は見逃さない
    if (!brave && Math.random() < (best.owner === G.player ? 0.35 * (1 - AI.pressure()) : 0.15)) return null;
    // 出陣武将を選ぶ（最大5人、本拠の君主は残す場合あり）
    const sorted = gens.slice().sort((a, b) => (b.lead + b.war) - (a.lead + a.war));
    // 君主は本拠を空けない。ただし猛将の君主は自分の判断で出る
    const army = sorted.filter(g => !(g.isLord && c.i === f.capital && sorted.length > 2 && g !== brave)).slice(0, 5);
    if (brave && !army.includes(brave)) { army.pop(); army.unshift(brave); }
    if (!army.length) return null;
    // 総大将（先頭）：見立て役が賢い勢力は、統率が高く猪突でない将を選ぶ（猛将が自ら出るときはその将）
    if (!brave && q >= 0.45) { const sc = g => g.lead * 1.2 + g.war * 0.5 + g.int * 0.3 - (Game.has(g, '猪突') ? 25 : 0) - (Game.has(g, '臆病') ? 15 : 0); army.sort((a, b) => sc(b) - sc(a)); }
    // 守備兵を残す：前線4000・今の兵の3割・隣の敵（攻め先以外）の最大兵力の半分、のうち多い数
    let maxEnemy = 0;
    c.adj.forEach(a => { const o = G.cities[a]; if (a !== best.i && o.owner !== null && o.owner !== fi && !Game.isAlly(fi, o.owner)) maxEnemy = Math.max(maxEnemy, o.troops); });
    const keep = Math.max(Game.isFront(c) ? 3000 : 1500, c.troops * 0.25, maxEnemy * 0.4);
    const troops = Math.floor(Math.min(c.troops - keep, army.reduce((s, g) => s + Game.troopCap(g), 0)) / 100) * 100;
    if (troops < 3000) return null;
    return { atkFi: fi, from: c.i, to: best.i, gens: army.map(g => g.i), troops, food: Math.min(c.food, Math.round(troops * 0.7)) };
  },

  plot(fi) {
    const enemies = G.gens.filter(g => g.state === 'serve' && g.faction !== fi && !g.isLord && !Game.isAlly(fi, g.faction) && g.loyalty < 70);
    if (!enemies.length) return;
    const smart = Game.gensOf(fi).sort((a, b) => b.int - a.int)[0];
    if (!smart || smart.int < 70) return;
    // 忠誠の低い相手ほど狙う（寝返らせやすい）
    const t = enemies.sort((a, b) => a.loyalty - b.loyalty)[Math.floor(Math.random() * Math.min(3, enemies.length))];
    const r = t.loyalty < 40 ? Game.plotLure(smart, t, 300) : Game.plotSow(smart, t);
    if (t.faction === G.player || (r.ok && t.faction === fi)) {
      if (r.ok && t.faction === fi) Game.log(`${t.name}が${G.factions[fi].name}軍に寝返った。`);
    }
    if (r.ok && t.faction === fi) AI._lastLure = { fi, t: t.i };
  },

  // 自動戦闘（AI同士、またはプレイヤーが委任）
  autoBattle(b) {
    const from = G.cities[b.from], to = G.cities[b.to];
    const atk = b.gens.map(i => G.gens[i]);
    const def = Game.gensIn(to.i).slice().sort((a, b2) => (b2.lead + b2.war) - (a.lead + a.war)).slice(0, 5);
    const bondA = Game.bondOf(atk.map(g => g.name)).reduce((s, x) => s + x.bonus, 0);
    const bondD = Game.bondOf(def.map(g => g.name)).reduce((s, x) => s + x.bonus, 0);
    const avg = (arr, k) => arr.length ? arr.reduce((s, g) => s + g[k], 0) / arr.length : 40;
    const atkPow = b.troops * (0.5 + from.train / 200) * (0.6 + (avg(atk, 'lead') * 0.6 + avg(atk, 'war') * 0.4) / 100) * (1 + bondA) * rnd(0.78, 1.22);
    // 援軍：隣の自都市や同盟国から駆けつける（合戦画面の援軍に相当）
    const helpers = [];
    if (to.owner !== null) {
      const near = fi => to.adj.map(a => G.cities[a]).filter(c => c.owner === fi && c.i !== from.i).sort((a, b2) => b2.troops - a.troops)[0];
      const own = near(to.owner);
      const sk = Game.siegeK(b.atkFi);
      if (own && own.troops >= 4000 && Math.random() < 0.4 + 0.45 * sk) helpers.push({ c: own, amt: Math.round(Math.min(own.troops - 1500, own.troops * 0.4)) });
      const al = Object.keys(G.factions[to.owner].allies).map(Number).find(fi => G.factions[fi].alive && Game.isAlly(to.owner, fi) && fi !== b.atkFi && !Game.isAlly(b.atkFi, fi) && near(fi) && near(fi).troops >= 5000);
      if (al != null && Math.random() < 0.25 + 0.3 * sk) { const c = near(al); helpers.push({ c, amt: Math.round(Math.min(c.troops - 1500, c.troops * 0.4)) }); }
    }
    const help = helpers.reduce((s, h) => s + h.amt, 0) * 0.7;   // 途中から来るので7割の働き
    const skD = Game.siegeK(b.atkFi);
    const defPow = (to.troops * (1.05 + (0.1 + to.def / 1500) * skD) + help) * (0.5 + to.train / 200) * (0.6 + (avg(def, 'lead') * 0.6 + avg(def, 'war') * 0.4) / 100) * (1 + bondD) * rnd(0.78, 1.22);
    const atkWin = atkPow > defPow;
    const ratio = Math.min(atkPow, defPow) / Math.max(atkPow, defPow);
    let atkLoss, defLoss;
    if (atkWin) { atkLoss = Math.round(b.troops * ratio * 0.5); defLoss = Math.round(to.troops * (0.6 + 0.3 * (1 - ratio))); }
    else { defLoss = Math.round(to.troops * ratio * 0.5); atkLoss = Math.round(b.troops * (0.5 + 0.3 * (1 - ratio))); }
    // 援軍の損害
    helpers.forEach(h => { h.c.troops = Math.max(0, h.c.troops - Math.round(h.amt * (atkWin ? 0.5 : ratio * 0.4))); });
    const result = { atkWin, atkLeft: Math.max(0, b.troops - atkLoss), defLeft: Math.max(0, to.troops - defLoss), captured: [], killed: [], reason: atkWin ? '攻め手が押し切った' : '守り手が持ちこたえた' };
    if (atkWin) {
      // 守備側の武将：一部捕縛、残りは逃走
      def.concat(Game.gensIn(to.i).filter(g => !def.includes(g))).forEach(g => {
        if (Math.random() < 0.3) result.captured.push(g.i);
      });
    } else {
      atk.forEach(g => { if (Math.random() < 0.15) result.captured.push(g.i); });
    }
    return result;
  },
};

