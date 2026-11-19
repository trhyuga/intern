// ============================================================
//  軍師オート
//  軍師に任命した武将が、季節ごとの命令・出陣・計略・外交を自分で決めて実行する。
//  都市画面を開いてボタンを押す様子や、戦場で部隊を動かす様子をそのまま見せる。
//  軍師の知力が高いほど判断が正確で、性格によって采配の癖が変わる。
// ============================================================
const Auto = (() => {
  let running = false, stopReq = false, seasonsLeft = 0;
  const S = { speed: 1 }; // 1 普通 / 2 速い
  try { S.speed = +(localStorage.getItem('internT_autoSpeed') || 1); } catch (e) {}
  const wait = ms => new Promise(r => setTimeout(r, ms / S.speed));

  // ---------- 軍師 ----------
  function strategist() {
    let g = G.strategist != null ? G.gens[G.strategist] : null;
    if (!g || g.state !== 'serve' || g.faction !== G.player) {
      const list = Game.gensOf(G.player).sort((a, b) => (b.int + (b.isLord ? -15 : 0)) - (a.int + (a.isLord ? -15 : 0)));
      g = list[0] || null;
      G.strategist = g ? g.i : null;
    }
    return g;
  }
  // 能力（0〜1）と采配の癖
  function brain(g) {
    let q = clamp((g.int - 45) / 50, 0, 1);
    if (Game.has(g, '神算')) q = Math.min(1, q + 0.1);
    if (Game.has(g, '智謀')) q = Math.min(1, q + 0.05);
    const H = t => Game.has(g, t);
    return {
      q, tier: q >= 0.75 ? 'smart' : q >= 0.45 ? 'mid' : 'dumb',
      noise: (1 - q) * 0.6,
      aggr: 1.35 + (H('慎重') ? 0.3 : 0) + (H('仁徳') ? 0.1 : 0) - (H('野心') ? 0.15 : 0) - (H('猪突') ? 0.3 : 0) - (H('剛勇') ? 0.1 : 0),
      plot: (H('智謀') ? 0.35 : 0) + (H('神算') ? 0.25 : 0) + Math.max(0, (g.int - 70) / 60),
      dom: { farm: H('治世') ? 0.2 : 0, comm: H('治世') ? 0.2 : 0, alms: H('仁徳') ? 0.3 : 0, wall: H('慎重') ? 0.25 : 0, train: (H('慎重') || H('剛勇')) ? 0.15 : 0, draft: (H('野心') || H('猪突')) ? 0.25 : 0, search: H('仁徳') ? 0.15 : 0 },
      diplo: q >= 0.6 || H('仁徳'),
      maxAttacks: q >= 0.75 ? 2 : 1,
    };
  }
  function grade(g) {
    const b = brain(g);
    const t = b.tier === 'smart' ? '天下に名だたる知略。判断は正確で、計略や外交も駆使する' : b.tier === 'mid' ? 'そこそこの見立て。ときどき判断を誤る' : '采配はかなり大ざっぱ。勢いまかせになりがち';
    const s = [];
    if (Game.has(g, '慎重')) s.push('守りを固め、勝ち目の高い戦しかしない');
    if (Game.has(g, '野心') || Game.has(g, '猪突')) s.push('攻め気が強い');
    if (Game.has(g, '仁徳')) s.push('民と人材を大事にする');
    if (Game.has(g, '治世')) s.push('内政に力を入れる');
    if (Game.has(g, '智謀') || Game.has(g, '神算')) s.push('計略を好む');
    return t + (s.length ? '。' + s.join('、') : '');
  }

  // ---------- 軍師の台詞 ----------
  const SL = {
    smart: {
      intro: ['{season}です。{plan}', '敵の動きは読めております。{plan}', '天の時はまだ。ですが、手は打っておきましょう。{plan}'],
      dom: ['{city}は{need}が急務。{gen}殿にお願いします', '{gen}殿の才なら、{city}の{need}は任せて安心です'],
      attack: ['{target}は兵{n}。いま攻めれば勝てます。総大将は{gen}殿に', '{target}の守りは手薄です。{gen}殿、一気に落としましょう'],
      hold: ['今は攻め時ではありません。力を蓄えましょう', '無理な戦は国を滅ぼします。今季は内を固めます'],
      plot: ['{foe}は主君に不満を抱いている様子。揺さぶってみましょう', '戦わずして敵を崩す。これも兵法です'],
      diplo: ['{target}と手を結び、背後の憂いを断ちましょう', '敵を一度に相手にするのは愚策。{target}とは和を'],
      reward: ['{gen}殿の心が離れかけています。褒美を'],
      recruit: ['{gen}殿、在野の賢者を探してきてください'],
      battle: ['敵の総大将は{foe}。そこを突けば崩れます', '地形を使い、城門を集中して攻めましょう'],
      defend: ['慌てることはありません。守り切れば敵は兵糧が尽きます'],
      win: ['予定通りです'], lose: ['……読み違えました。立て直しましょう'],
      allyYes: ['悪くない話です。受けましょう'], allyNo: ['今、手を結ぶ利はありません。断りましょう'],
      rec: ['{gen}は使える人物。登用を勧めます'], rel: ['恩を売っておくのも策のうち。解放しましょう'], kill: ['生かしておけば後の災いとなります'],
      transfer: ['{to}は{what}が足りません。{from}から回しましょう', '前線の{to}を空にはできません。{from}から{what}を送ります'],
    },
    mid: {
      intro: ['{season}になりました。{plan}', 'さて、今季はどう動きましょうか。{plan}'],
      dom: ['{city}で{need}をやりましょう。{gen}殿、頼みます', '{gen}殿に{need}をお願いします'],
      attack: ['{target}を攻めましょう。{gen}殿、出陣を', 'そろそろ{target}を取りに行きましょう'],
      hold: ['今季は様子を見ましょう'],
      plot: ['{foe}に揺さぶりをかけてみます'], diplo: ['{target}に使者を出してみましょう'],
      reward: ['{gen}殿に褒美を与えておきましょう'], recruit: ['人材を探してみましょう'],
      battle: ['敵の城を落とすぞ！'], defend: ['なんとか守り抜きましょう'],
      win: ['勝ちました！'], lose: ['負けてしまいました……'],
      allyYes: ['手を組んでおきましょう'], allyNo: ['今回は断りましょう'],
      rec: ['登用してみましょう'], rel: ['解放しましょう'], kill: ['ここは処断を'],
      transfer: ['{from}から{to}へ{what}を送ります'],
    },
    dumb: {
      intro: ['{season}だ！ {plan}', 'えーと……{plan}', 'よし、今季も気合いでいくぞ！ {plan}'],
      dom: ['{gen}殿、とりあえず{need}を！', 'うーん、{need}でいいか！'],
      attack: ['{target}を攻めるぞ！ 勝てる気がする！', 'つべこべ言わずに{target}へ突撃だ！'],
      hold: ['……何をすればいいんだっけ', 'まあ、今季はいいか'],
      plot: ['な、何か悪だくみをしてみるか'], diplo: ['仲良くしておこう！'],
      reward: ['金をばらまいておけ！'], recruit: ['誰かいないか探してこい！'],
      battle: ['とにかく突っ込め！'], defend: ['ど、どうしよう……とにかく守れ！'],
      win: ['やったー！ 勝った！'], lose: ['あれぇ……おかしいな……'],
      allyYes: ['いいよいいよ、組もう！'], allyNo: ['なんか怪しいから断る！'],
      rec: ['仲間にしちゃおう！'], rel: ['逃がしてやれ！'], kill: ['えいっ、処断だ！'],
      transfer: ['{to}に{what}を送っとけ！'],
    },
  };
  const SL_SPECIAL = {
    '諸葛亮': { intro: ['{season}。星の巡りは我らに味方しております。{plan}'], attack: ['すでに錦の袋に策を入れてあります。{gen}殿、{target}へ'], battle: ['敵の動きは、すべて亮の掌の上です'], hold: ['今は国を富ませる時。北伐の機は必ず来ます'] },
    '郭嘉': { intro: ['{season}ですね。{plan}'], attack: ['{target}の主は優柔不断。今が好機です'], hold: ['焦らずとも、敵は内から崩れます'] },
    '周瑜': { attack: ['{target}を取れば、天下二分も見えてきます'], battle: ['水を制する者が戦を制します'] },
    '司馬懿': { hold: ['待つのです。敵が先に動くまで'], attack: ['……今です。{target}を'], intro: ['{season}。{plan}'] },
    '龐統': { attack: ['{target}を奇襲で取りましょう。上策です'] },
    '陳宮': { attack: ['{target}を攻めるべきです。……今度こそ、この策を用いてください'] },
    '賈詡': { hold: ['生き残ることが、まず第一です'], plot: ['離間は私の得意とするところ'] },
  };
  function sl(kind, ctx = {}) {
    const g = strategist(); if (!g) return '';
    const b = brain(g);
    const sp = SL_SPECIAL[g.name];
    const pool = (sp && sp[kind] && Math.random() < 0.7) ? sp[kind] : SL[b.tier][kind] || SL.mid[kind] || [''];
    return pick(pool).replace(/\{(\w+)\}/g, (m, k) => ctx[k] != null ? ctx[k] : '');
  }
  async function say(kind, ctx, expr = 'normal') {
    const g = strategist(); if (!g) return;
    await UI.talk(g, expr, `軍師 ${g.name}「${sl(kind, ctx)}」`, facColor(g), { tag: '軍師' });
  }

  // ---------- 操作している感じの演出 ----------
  async function press(ci, tab, sel) {
    if (stopReq) return;
    MapView.centerOn(ci);
    App.openCity(ci, tab);
    await wait(350);
    const el = document.querySelector(sel);
    if (el) { el.classList.add('auto-press'); Sound.se('tap'); await wait(450); el.classList.remove('auto-press'); }
  }
  function setBar(text) {
    const g = strategist();
    const bar = document.getElementById('autobar');
    bar.querySelector('img').src = g ? Portrait.get(g, 'normal', facColor(g)) : '';
    bar.querySelector('.ab-text').innerHTML = text;
    bar.querySelector('[data-a=speed]').textContent = S.speed >= 2 ? '速い' : '普通';
  }

  // ---------- 内政の判断 ----------
  const STAT = { farm: 'pol', comm: 'pol', wall: 'lead', alms: 'cha', draft: 'cha', train: 'lead', search: 'cha' };
  const NEED_NAME = { farm: '開墾', comm: '商業', wall: '修築', alms: '施し', draft: '徴兵', train: '訓練', search: '人材探し' };
  function needs(c, br) {
    const threat = AI.threat(c, G.player);
    const front = threat > 0;
    const n = {
      farm: (1 - c.farm / c.farmMax) * (G.season <= 1 ? 1.2 : 0.9),
      comm: (1 - c.comm / c.commMax),
      wall: (1 - c.def / c.defMax) * (front ? 1.1 : 0.4),
      alms: c.loyal < 60 && c.food - 1500 > Game.foodReserve(c) ? (60 - c.loyal) / 40 * 1.3 : 0,
      draft: c.gold >= 200 && c.loyal > 30 && c.food > Game.foodReserve(c, c.troops + 3500) ? (front ? clamp((threat * 1.1 - c.troops) / 10000 + 0.5, 0.2, 1.4) : 0.25) : 0,
      train: c.troops > 3000 ? (85 - c.train) / 85 : 0,
      search: Game.roninIn(c.i).filter(r => !r.known).length ? 0.3 + br.q * 0.5 : 0.12,
    };
    Object.keys(n).forEach(k => { n[k] = Math.max(0, n[k] + br.dom[k] + (Math.random() - 0.5) * br.noise * 2); });
    if (c.gold < CONFIG.CMD_COST) { n.farm = n.comm = n.wall = 0; }
    if (c.gold < CONFIG.RECRUIT_COST) n.draft = 0;
    return n;
  }
  function planCity(c, br) {
    const idle = Game.gensIn(c.i, G.player).filter(g => !g.acted);
    const n = needs(c, br);
    const out = [];
    const pool = idle.slice();
    while (pool.length) {
      const cmd = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
      if (n[cmd] <= 0.05) break;
      let g;
      if (br.tier === 'dumb' && Math.random() < 0.6) g = pick(pool);
      else { pool.sort((a, b) => b[STAT[cmd]] - a[STAT[cmd]]); g = br.tier === 'mid' && Math.random() < 0.3 && pool.length > 1 ? pool[1] : pool[0]; }
      out.push([g, cmd]);
      pool.splice(pool.indexOf(g), 1);
      n[cmd] *= 0.55;
    }
    return out;
  }

  // ---------- 攻撃の判断 ----------
  function planAttacks(br) {
    const plans = [];
    const used = new Set();
    Game.citiesOf(G.player).forEach(c => {
      const gens = Game.gensIn(c.i, G.player).filter(g => !g.acted);
      if (!gens.length || c.troops < 5000) return;
      const targets = c.adj.map(a => G.cities[a]).filter(o => o.owner !== G.player && (o.owner === null || !Game.isAlly(G.player, o.owner)));
      targets.forEach(t => {
        if (used.has(t.i)) return;
        const defGens = Game.gensIn(t.i);
        const defPow = t.troops * (1 + t.def / 1500) * (1 + defGens.reduce((s, g) => s + g.lead, 0) / 400);
        const army = gens.slice().sort((a, b) => (b.lead + b.war) - (a.lead + a.war)).slice(0, 5);
        const threat = AI.threat(c, G.player) - t.troops;
        const keep = br.tier === 'smart' ? Math.max(1500, threat * 0.5) : br.tier === 'mid' ? 1500 : 500;
        const troops = Math.floor(Math.min(c.troops - keep, army.reduce((s, g) => s + Game.troopCap(g), 0)) / 100) * 100;
        if (troops < 3000) return;
        // 出陣しても、残る兵の兵糧（次の収穫まで）を残し、12日分以上を持って行けるか
        if (c.food - Game.foodReserve(c, c.troops - troops) < troops * 0.03 * 12) return;
        const atkPow = troops * (0.5 + c.train / 200) * (1 + army.reduce((s, g) => s + g.lead + g.war, 0) / 1000);
        let score = atkPow / Math.max(1, defPow) * (1 + (Math.random() - 0.5) * br.noise * 1.6);
        if (t.owner === null) score *= 1.25;
        plans.push({ c, t, score, army, troops });
      });
    });
    plans.sort((a, b) => b.score - a.score);
    const chosen = [];
    for (const p of plans) {
      if (chosen.length >= br.maxAttacks) break;
      if (p.score < br.aggr || used.has(p.t.i) || chosen.some(x => x.c === p.c)) continue;
      used.add(p.t.i); chosen.push(p);
    }
    return chosen;
  }
  function pickArmy(p, br) {
    const gens = Game.gensIn(p.c.i, G.player).filter(g => !g.acted);
    let army;
    if (br.tier === 'dumb') army = shuffle(gens.slice()).slice(0, Math.min(5, gens.length));
    else {
      army = gens.slice().sort((a, b) => (b.lead + b.war) - (a.lead + a.war)).slice(0, 4);
      // 絆の相方を入れる
      if (br.tier === 'smart') {
        BONDS.forEach(bd => { if (army.some(g => bd.members.includes(g.name))) gens.forEach(g => { if (bd.members.includes(g.name) && !army.includes(g) && army.length < 5) army.push(g); }); });
        // 計略役（知力の高い者）を1人
        const smart = gens.filter(g => !army.includes(g)).sort((a, b) => b.int - a.int)[0];
        if (smart && smart.int >= 80 && army.length < 5) army.push(smart);
      }
      // 君主は本拠を空けない（守りが手薄なら）
      army = army.filter(g => !(g.isLord && army.length > 1 && br.tier !== 'dumb'));
      army.sort((a, b) => (b.lead + b.war) - (a.lead + a.war));
    }
    const cap = army.reduce((s, g) => s + Game.troopCap(g), 0);
    return { army, troops: Math.max(500, Math.min(p.troops, Math.floor(cap / 100) * 100)) };
  }

  // ---------- 計略・外交・人事 ----------
  async function doRewards(br) {
    if (br.tier === 'dumb') return;
    const lim = br.tier === 'smart' ? 60 : 45;
    for (const g of Game.gensOf(G.player)) {
      if (stopReq) return;
      if (g.isLord || Game.has(g, '忠義') || g.loyalty >= lim) continue;
      const c = G.cities[g.city];
      if (c.gold < 300) continue;
      await press(c.i, 'per', '[data-cmd=reward]');
      await say('reward', { gen: g.name });
      const r = Game.reward(g, c);
      await UI.talk(g, r.expr, `${g.name}「${r.ok ? line(g, 'reward') : '……'}」\n<b>${r.msg}</b>`);
    }
  }
  async function doDiplo(br) {
    if (!br.diplo) return;
    const myPow = Game.power(G.player);
    const neigh = new Set();
    Game.citiesOf(G.player).forEach(c => c.adj.forEach(a => { const o = G.cities[a].owner; if (o !== null && o !== G.player) neigh.add(o); }));
    const list = [...neigh].filter(fi => !Game.isAlly(G.player, fi));
    if (list.length < 2 && br.tier !== 'smart') return;
    // 一番強い隣国と手を結ぶ
    const strong = list.sort((a, b) => Game.power(b) - Game.power(a))[0];
    if (strong != null && Game.power(strong) > myPow * 0.7 && list.length >= 2 && Math.random() < 0.6) {
      const env = Game.gensOf(G.player).filter(g => !g.acted).sort((a, b) => (b.cha + b.int) - (a.cha + a.int))[0];
      if (!env) return;
      await press(env.city, 'dip', '[data-cmd=ally]');
      await say('diplo', { target: G.factions[strong].name + '軍' });
      env.acted = true;
      const r = Game.diploAlly(env, strong);
      Sound.se(r.ok ? 'win' : 'ng');
      await UI.talk(Game.lordOf(strong), r.ok ? 'happy' : 'angry', r.msg, G.factions[strong].color, { tag: '外交' });
      if (r.ok) Game.log(r.msg);
    }
    // 小勢力に降伏勧告
    const tiny = list.find(fi => Game.citiesOf(fi).length === 1 && Game.power(fi) < myPow / 5);
    if (tiny != null && br.tier === 'smart' && Math.random() < 0.5) {
      const env = Game.gensOf(G.player).filter(g => !g.acted).sort((a, b) => b.cha - a.cha)[0];
      if (!env) return;
      await press(env.city, 'dip', '[data-cmd=surr]');
      await say('diplo', { target: G.factions[tiny].name + '軍' });
      env.acted = true;
      const r = Game.diploSurrender(env, tiny);
      Sound.se(r.ok ? 'win' : 'ng');
      await UI.talk(Game.lordOf(tiny), r.ok ? 'sad' : 'angry', r.msg, G.factions[tiny].color, { tag: '外交' });
      if (r.ok) Game.log(r.msg);
    }
  }
  async function doPlots(br) {
    if (Math.random() > br.plot) return;
    const front = new Set();
    Game.citiesOf(G.player).forEach(c => c.adj.forEach(a => { const o = G.cities[a]; if (o.owner !== null && o.owner !== G.player && !Game.isAlly(G.player, o.owner)) front.add(a); }));
    const cands = G.gens.filter(g => g.state === 'serve' && front.has(g.city) && !g.isLord && !Game.has(g, '忠義'));
    if (!cands.length) return;
    // 賢い軍師は野心家・忠誠の低い者を狙う
    cands.sort((a, b) => br.tier === 'dumb' ? Math.random() - 0.5 : (a.loyalty - (Game.has(a, '野心') ? 25 : 0)) - (b.loyalty - (Game.has(b, '野心') ? 25 : 0)));
    const t = cands[0];
    const agent = Game.gensOf(G.player).filter(g => !g.acted).sort((a, b) => b.int - a.int)[0];
    if (!agent) return;
    const home = G.cities[agent.city];
    const lure = t.loyalty < 40 && home.gold >= 400;
    if (!lure && home.gold < 50) return;
    MapView.centerOn(t.city); App.openCity(t.city); await wait(400);
    const btn = document.querySelector(lure ? '[data-x=lure]' : '[data-x=sow]');
    if (btn) { btn.classList.add('auto-press'); Sound.se('tap'); await wait(450); btn.classList.remove('auto-press'); }
    await say('plot', { foe: t.name });
    agent.acted = true;
    let r;
    if (lure) { home.gold -= 300; r = Game.plotLure(agent, t, 300); }
    else { home.gold -= 50; r = Game.plotSow(agent, t); }
    Sound.se(r.ok ? 'ok' : 'ng');
    if (r.ok && lure) { await UI.talk(t, 'happy', `${t.name}「${line(t, 'join')}」\n<b>${r.msg}</b>`); Game.log(`${t.name}が${G.factions[G.player].name}軍に寝返った。`); }
    else if (r.ok) await UI.talk(t, Game.has(t, '野心') ? 'angry' : 'sad', `${t.name}「${line(t, 'sown')}」\n<b>${r.msg}</b>`, facColor(t));
    else await UI.talk(agent, 'sad', `${agent.name}「${line(agent, 'fail')}」\n<b>${r.msg}</b>`);
  }
  async function doRecruit(br) {
    for (const c of Game.citiesOf(G.player)) {
      if (stopReq) return;
      const known = Game.roninIn(c.i).filter(r => r.known);
      if (!known.length) continue;
      const env = Game.gensIn(c.i, G.player).filter(g => !g.acted).sort((a, b) => b.cha - a.cha)[0];
      if (!env) continue;
      const t = known[0];
      await press(c.i, 'per', '[data-cmd=recruit]');
      await say('rec', { gen: t.name });
      env.acted = true;
      await App.doRecruit(env, t);
    }
  }
  // ---------- 補給（足りない拠点へ金・兵糧・兵を回す） ----------
  // 自領だけを通ってたどり着ける都市どうしで融通する
  function reach(from) {
    const seen = new Set([from.i]), q = [from.i];
    while (q.length) { const x = q.shift(); G.cities[x].adj.forEach(a => { if (!seen.has(a) && G.cities[a].owner === G.player) { seen.add(a); q.push(a); } }); }
    return seen;
  }
  function wants(c) {
    const front = Game.isFront(c);
    const threat = AI.threat(c, G.player);
    return {
      front, threat,
      food: Game.foodReserve(c) + (front ? 3000 : 1000),               // これだけは置いておきたい
      gold: front ? 800 : 400,
      troops: front ? Math.max(6000, Math.round(threat * 0.8)) : 2500,
    };
  }
  async function doLogistics(br) {
    const cities = Game.citiesOf(G.player);
    if (cities.length < 2) return;
    const maxMoves = br.tier === 'smart' ? 5 : br.tier === 'mid' ? 3 : 2;
    let moves = 0;
    // 困っている順（前線で空に近いほど先）
    const needy = cities.map(c => {
      const w = wants(c);
      const lack = { food: Math.max(0, w.food - c.food), gold: Math.max(0, w.gold - c.gold), troops: Math.max(0, w.troops - c.troops) };
      const score = lack.food / 3000 + lack.gold / 500 + lack.troops / 4000 + (w.front ? 1 : 0) * (lack.food + lack.troops > 0 ? 1 : 0);
      return { c, w, lack, score };
    }).filter(x => x.lack.food + x.lack.gold + x.lack.troops > 0)
      // 知力の低い軍師は、兵糧が尽きかけの所しか気づかない
      .filter(x => br.tier !== 'dumb' || x.c.food < Game.foodReserve(x.c))
      .sort((a, b) => b.score - a.score);
    for (const n of needy) {
      if (stopReq || moves >= maxMoves) return;
      const r = reach(n.c);
      // 送り手：自分の必要分を超えて余っている都市（後方を優先）
      G.logi = G.logi || {};
      const donors = cities.filter(d => d !== n.c && r.has(d.i))
        // 前の季節に n.c から受け取った都市には送り返さない（往復を防ぐ）
        .filter(d => !(G.logi[n.c.i + '>' + d.i] >= G.turn - 1))
        .map(d => {
          const w = wants(d);
          const keepT = w.front ? w.troops * 1.25 : w.troops;   // 前線どうしは自分の守りを厚めに残す
          return { d, w, food: Math.max(0, d.food - w.food * (w.front ? 1.2 : 1)), gold: Math.max(0, d.gold - w.gold), troops: Math.max(0, d.troops - keepT) };
        });
      const pickD = k => donors.filter(x => x[k] > 0).sort((a, b) => (a.w.front - b.w.front) || (b[k] - a[k]))[0];
      const plan = new Map();
      [['food', 100], ['gold', 10], ['troops', 100]].forEach(([k, step]) => {
        if (n.lack[k] <= (k === 'troops' ? 1500 : k === 'gold' ? 100 : 500)) return;
        const dn = pickD(k); if (!dn) return;
        let amt = Math.min(dn[k], k === 'troops' ? n.lack[k] : n.lack[k] * 1.3);
        amt = Math.floor(amt / step) * step;
        if (amt <= 0) return;
        if (!plan.has(dn.d)) plan.set(dn.d, { food: 0, gold: 0, troops: 0 });
        plan.get(dn.d)[k] = amt; dn[k] -= amt;
      });
      for (const [d, amt] of plan) {
        if (stopReq || moves >= maxMoves) return;
        const what = [amt.food ? '兵糧' : '', amt.gold ? '金' : '', amt.troops ? '兵' : ''].filter(Boolean).join('と');
        await press(d.i, 'mil', '[data-cmd=transport]');
        await say('transfer', { from: d.name, to: n.c.name, what });
        await MapView.march(d.i, n.c.i, G.factions[G.player].color);
        // 兵を送るときは、その兵の分の兵糧も一緒に
        const extraFood = amt.troops ? Math.min(Math.max(0, d.food - Game.foodReserve(d, d.troops - amt.troops) - amt.food), Math.round(amt.troops * 0.12 * 2)) : 0;
        Game.transport(d, n.c, amt.gold, amt.food + extraFood, amt.troops);
        G.logi[d.i + '>' + n.c.i] = G.turn;
        UI.toast(`${d.name} → ${n.c.name}　${[amt.food + extraFood ? '兵糧' + fmt(amt.food + extraFood) : '', amt.gold ? '金' + fmt(amt.gold) : '', amt.troops ? '兵' + fmt(amt.troops) : ''].filter(Boolean).join('・')}`, 2400);
        App.refresh();
        moves++;
        await wait(500);
      }
    }
  }

  // ---------- 1季節ぶん ----------
  async function playSeason() {
    const g = strategist();
    if (!g) { UI.toast('軍師がいない'); return false; }
    const br = brain(g);
    setBar(`軍師 <b>${g.name}</b> が采配中（${G.year}年${SEASONS[G.season]}）`);
    const attacks = planAttacks(br);
    const plan = attacks.length ? `今季は${attacks.map(a => a.t.name).join('と')}を攻めます。` : '今季は国力を蓄えます。';
    await say('intro', { season: `${G.year}年${SEASONS[G.season]}`, plan }, attacks.length ? 'angry' : 'normal');
    if (stopReq) return false;
    await doRewards(br); if (stopReq) return false;
    await doDiplo(br); if (stopReq) return false;
    await doPlots(br); if (stopReq) return false;
    await doLogistics(br); if (stopReq) return false;
    // 出陣する武将はあらかじめ取っておく
    const armies = attacks.map(p => ({ p, ...pickArmy(p, br) })).filter(a => a.army.length);
    const reserved = new Set(armies.flatMap(a => a.army.map(x => x.i)));
    // 内政
    for (const c of Game.citiesOf(G.player)) {
      if (stopReq) return false;
      const idleBefore = Game.gensIn(c.i, G.player).filter(x => !x.acted && !reserved.has(x.i));
      if (!idleBefore.length) continue;
      reserved.forEach(i => G.gens[i].acted = true); // 一時的に除外
      const jobs = planCity(c, br);
      reserved.forEach(i => G.gens[i].acted = false);
      let first = true;
      for (const [gen, cmd] of jobs) {
        if (stopReq) return false;
        if (reserved.has(gen.i)) continue;
        await press(c.i, cmd === 'search' ? 'per' : ['draft', 'train'].includes(cmd) ? 'mil' : 'dom', `[data-cmd=${cmd}]`);
        if (first || Math.random() < 0.35) { await say('dom', { city: c.name, need: NEED_NAME[cmd], gen: gen.name }); first = false; }
        const r = Game.doCommand(cmd, gen, c);
        gen.acted = true;
        if (r.found) {
          r.found.known = true;
          await UI.talk(gen, 'happy', `${gen.name}「在野に${r.found.name}という人物がおりました」`);
          await say('rec', { gen: r.found.name });
          await App.doRecruit(gen, r.found);
        } else {
          Sound.se(r.ok ? 'ok' : 'ng');
          await UI.talk(gen, r.ok ? r.expr : 'sad', `${gen.name}「${r.ok ? line(gen, cmd) : line(gen, 'fail')}」\n<b>${r.msg}</b>`);
        }
        App.refresh();
      }
    }
    await doRecruit(br); if (stopReq) return false;
    await doLogistics(br); if (stopReq) return false;
    // 出陣
    if (!armies.length) await say('hold');
    for (const a of armies) {
      if (stopReq) return false;
      const { p } = a;
      if (p.c.owner !== G.player || p.t.owner === G.player || (p.t.owner !== null && Game.isAlly(G.player, p.t.owner))) continue;
      const army = a.army.filter(x => x.state === 'serve' && x.faction === G.player && x.city === p.c.i && !x.acted);
      if (!army.length) continue;
      const troops = Math.min(a.troops, p.c.troops - 300);
      if (troops < 2000) continue;
      const spare = p.c.food - Game.foodReserve(p.c, p.c.troops - troops);
      const food = Math.min(Math.round(troops * 0.03 * 30), Math.floor(spare));
      if (food < troops * 0.03 * 12) { await say('hold'); continue; }
      await press(p.c.i, 'mil', '[data-cmd=attack]');
      MapView.setHighlight([p.t.i]); await wait(500); MapView.setHighlight(null);
      await say('attack', { target: p.t.name, n: fmt(p.t.troops), gen: army[0].name }, 'angry');
      UI.closeSheet();
      const cmdr = army[0];
      Sound.se('march');
      await UI.talk(cmdr, 'angry', `${cmdr.name}「${line(cmdr, 'sortie')}」`, facColor(cmdr), { tag: '出陣' });
      army.forEach(x => x.acted = true);
      const r = await App.executeBattle({ atkFi: G.player, from: p.c.i, to: p.t.i, gens: army.map(x => x.i), troops, food }, 'watch');
      if (r === 'end') return false;
    }
    UI.closeSheet();
    return true;
  }

  async function loop() {
    while (running && !stopReq) {
      const ok = await playSeason();
      if (!ok || stopReq || G.gameOver) break;
      setBar(`季節を進めています…`);
      await App.endTurn(true);
      App.busy = true;
      if (G.gameOver || UI.cur !== 'main') break;
      if (seasonsLeft > 0 && --seasonsLeft === 0) break;
      await wait(500);
    }
    stop(true);
  }

  function start(n) {
    if (running || App.busy) return;
    if (!strategist()) return UI.alert('軍師に任命できる武将がいません');
    running = true; stopReq = false; seasonsLeft = n || 0;
    App.busy = true;
    document.getElementById('autobar').classList.add('show');
    loop().finally(() => { App.busy = false; });
  }
  function stop(done) {
    if (!running) return;
    if (!done) { stopReq = true; setBar('この動きが終わったら止めます…'); return; }
    running = false; stopReq = false;
    document.getElementById('autobar').classList.remove('show');
    App.busy = false;
    if (UI.cur === 'main') { UI.closeSheet(); App.refresh(); UI.toast('軍師オートを止めました。ここからは自分で操作できます'); }
  }

  // ---------- 各場面での軍師の判断（ui.js から呼ぶ） ----------
  async function decideAlly(fi) {
    const br = brain(strategist());
    const yes = br.tier === 'dumb' ? Math.random() < 0.7 : Game.power(fi) > Game.power(G.player) * 0.5 || br.tier === 'smart' && Math.random() < 0.6;
    await say(yes ? 'allyYes' : 'allyNo');
    return yes;
  }
  async function decideCaptive(g, lordCaptive) {
    const br = brain(strategist());
    let act;
    if (lordCaptive) act = br.tier === 'smart' && !Game.has(strategist(), '仁徳') ? 'kill' : 'rel';
    else if (br.tier === 'dumb') act = pick(['rec', 'rec', 'rel', 'kill']);
    else act = (g.lead + g.war + g.int + g.pol >= 230 || br.tier === 'mid') ? 'rec' : 'rel';
    if (act === 'kill' && Game.has(strategist(), '仁徳')) act = 'rel';
    await say(act, { gen: g.name }, act === 'kill' ? 'angry' : 'normal');
    return act;
  }

  function talkMs(text) { return (1100 + Math.min(1600, text.replace(/<[^>]+>/g, '').length * 28)) / S.speed; }

  function init() {
    const bar = document.getElementById('autobar');
    bar.querySelector('[data-a=stop]').onclick = e => { e.stopPropagation(); Sound.se('tap'); stop(false); };
    bar.querySelector('[data-a=speed]').onclick = e => {
      e.stopPropagation(); S.speed = S.speed >= 2 ? 1 : 2;
      try { localStorage.setItem('internT_autoSpeed', S.speed); } catch (er) {}
      if (G) G.opts.aiSpeed = S.speed; setBar(bar.querySelector('.ab-text').innerHTML);
    };
  }

  async function openMenu() {
    if (App.busy) return;
    const g = strategist();
    if (!g) return UI.alert('軍師に任命できる武将がいません');
    const v = await UI.choose(`軍師 ${g.name}（知力${g.int}）`, [
      { label: '▶ 軍師オート開始', sub: '止めるまで季節を進め続ける', value: 'run', cls: 'primary' },
      { label: '▶ 1年だけ任せる', sub: '4季節ぶん', value: 'year' },
      { label: '▶ この季節だけ任せる', sub: '終わったら自分の操作に戻る', value: 'one' },
      { label: '軍師を替える', sub: grade(g), value: 'change' },
      { label: `見る速さ：${S.speed >= 2 ? '速い' : '普通'}`, value: 'speed' },
    ]);
    if (v === 'run') start(0);
    if (v === 'year') start(4);
    if (v === 'one') start(1);
    if (v === 'speed') { S.speed = S.speed >= 2 ? 1 : 2; try { localStorage.setItem('internT_autoSpeed', S.speed); } catch (e) {} return openMenu(); }
    if (v === 'change') {
      const list = Game.gensOf(G.player);
      const gi = await UI.pickGenerals('軍師に任命する武将（知力が高いほど采配が正確）', list, { stat: 'int', keys: ['int', 'lead', 'pol', 'cha'], extra: x => x.i === G.strategist ? '現軍師' : '' });
      if (gi != null) {
        G.strategist = gi;
        const ng = G.gens[gi];
        await UI.talk(ng, 'happy', `${ng.name}「${brain(ng).tier === 'dumb' ? '軍師？ お、俺がですか！ やってやりますよ！' : brain(ng).tier === 'mid' ? '大役、謹んでお受けします' : '{you}の天下のため、この知略を尽くしましょう'.replace('{you}', '殿')}」\n<b>${ng.name}を軍師に任命した</b>`);
      }
      return openMenu();
    }
  }

  return {
    get running() { return running; }, get speed() { return S.speed; },
    start, stop, init, openMenu, strategist, brain, talkMs, decideAlly, decideCaptive, say, sl,
  };
})();
