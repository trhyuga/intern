// ============================================================
//  隠し要素・レア要素
//  ・隠し武将（条件を満たすと在野に現れる）／隠しシナリオ／隠し君主（下剋上）
//  ・宝物（名剣・名馬・兵法書・伝国の玉璽）とレアな出来事
//  ・武将図鑑と実績（ゲームをまたいで記録）、おまけ（タイトルの隠しコマンド）
//  ・現実の暦に合わせた季節の祝い
// ============================================================
const Secret = (() => {
  // ---------- ゲームをまたいで残す記録 ----------
  const META_KEY = 'internT_meta';
  let meta = null;
  function M() {
    if (meta) return meta;
    try { meta = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) { meta = null; }
    meta = Object.assign({ met: {}, ach: {}, wonBy: {}, unify: 0, duelWins: 0, items: {}, legend: {}, days: {} }, meta || {});
    return meta;
  }
  // 遊んでいる場所の日付（UTCではなく端末の暦）
  const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(M())); } catch (e) { } }

  // ---------- 実績 ----------
  const ACH = [
    ['unify1', '天下統一', '初めて天下を統一した'],
    ['unify_fast', '電光石火', '挙兵から10年以内に天下を統一した'],
    ['unify_noloss', '常勝不敗', '合戦に一度も負けずに天下を統一した'],
    ['unify_lords5', '群雄巡り', '5人の君主で天下を統一した'],
    ['unify_all', '天下人の系譜', '選べるすべての君主で天下を統一した'],
    ['usurp', '下剋上', '主君に代わって立ち、天下を統一した'],
    ['duel100', '万夫不当', '一騎討ちに通算100回勝った'],
    ['ultimate', '天下無双', '一騎討ちで「天下無双」の一撃を見た'],
    ['meisho', '名勝負', '一騎討ちで名勝負を演じた'],
    ['wind', '東南の風', '火計の最中に東南の風が吹いた'],
    ['legend', '長坂の英雄', '長坂の名場面を目にした'],
    ['hidden1', '世に隠れし者', '隠れた人物を配下に加えた'],
    ['hidden_all', '奇人異才', '隠れた人物4人をすべて配下に加えた'],
    ['seal', '伝国の玉璽', '伝国の玉璽を手に入れた'],
    ['treasure3', '宝物蒐集', '宝物を3つ集めた'],
    ['treasure_all', '宝物庫', 'すべての宝物を集めた'],
    ['zukan50', '人物録', '武将図鑑の半分を埋めた'],
    ['zukan100', '三国英傑録', '武将図鑑をすべて埋めた'],
    ['festival', '季節の祝い', '暦の祝いの日に遊んだ'],
    ['omake', '隠し部屋', 'タイトルの隠し部屋を見つけた'],
  ];
  function unlock(id) {
    const m = M(); if (m.ach[id]) return;
    m.ach[id] = localDay(); saveMeta();
    const a = ACH.find(x => x[0] === id);
    if (a && typeof UI !== 'undefined') { UI.toast(`実績「${a[1]}」を達成！`, 2600); try { Sound.se('great'); } catch (e) { } }
  }

  // ---------- 宝物 ----------
  //  k：持たせた武将の能力（手に入れた時に上がる）。horse：一騎討ちで攻撃をかわしやすい。sword：一騎討ちの一撃が重い
  const ITEMS = {
    itenk: { name: '倚天の剣', kind: 'sword', k: { war: 2, cha: 1 }, desc: '曹操が帯びたと伝わる名剣。鉄をも断つ' },
    seiko: { name: '青釭の剣', kind: 'sword', k: { war: 3 }, desc: '倚天と対をなす名剣。長坂で趙雲が奪ったと伝わる' },
    shichisei: { name: '七星宝刀', kind: 'sword', k: { war: 1, int: 1 }, desc: '七つの宝玉をちりばめた宝刀' },
    tekiro: { name: '的盧', kind: 'horse', k: { cha: 2 }, desc: '主を乗せて檀渓を跳び越えたと伝わる名馬' },
    zetsuei: { name: '絶影', kind: 'horse', k: { lead: 1, cha: 1 }, desc: '影さえ残さぬほど速いと言われた名馬' },
    sohi: { name: '爪黄飛電', kind: 'horse', k: { cha: 2 }, desc: '白い毛並みに黄色い蹄の名馬' },
    sonshi: { name: '孫子の兵法書', kind: 'book', k: { lead: 3 }, desc: '兵を用いる者が必ず学ぶ兵法の書' },
    taihei: { name: '太平要術の書', kind: 'book', k: { int: 3 }, desc: '不思議な術を記したと伝わる書' },
    gyokuji: { name: '伝国の玉璽', kind: 'seal', k: { cha: 3 }, desc: '天子の証。持つ者は天命を受けると言われる' },
  };
  // ゲーム開始時の持ち主（その武将が仕えていれば）
  const START_OWNER = { itenk: '曹操', seiko: '夏侯恩', shichisei: '王允', tekiro: '劉備', zetsuei: '曹操' };
  const up99 = (g, k, v) => { g[k] = Math.min(99, (g[k] || 0) + v); };
  function itemsOf(g) { if (!G || !G.items || !g) return []; return Object.keys(G.items).filter(id => G.items[id] === g.i); }
  function giveItem(g, id, quiet) {
    const it = ITEMS[id]; if (!it || !g) return null;
    G.items = G.items || {}; G.itemBonus = G.itemBonus || {};
    // 前の持ち主が宝物で上がった分は返す（初めから持っていた者は、もともとの能力なので減らさない）
    const prev = G.itemBonus[id] != null ? G.gens[G.itemBonus[id]] : null;
    if (prev && prev !== g) Object.entries(it.k).forEach(([k, v]) => { prev[k] = Math.max(1, prev[k] - v); });
    G.items[id] = g.i; G.itemBonus[id] = g.i;
    Object.entries(it.k).forEach(([k, v]) => up99(g, k, v));
    if (it.kind === 'seal' && g.faction >= 0) Game.gensOf(g.faction).forEach(x => { if (!x.isLord) x.loyalty = Math.min(100, x.loyalty + 10); });
    if (g.faction === G.player) {
      const m = M(); m.items[id] = true; saveMeta();
      if (id === 'gyokuji') unlock('seal');
      const n = Object.keys(m.items).length;
      if (n >= 3) unlock('treasure3');
      if (n >= Object.keys(ITEMS).length) unlock('treasure_all');
    }
    if (!quiet) Game.log(`${g.name}が${it.name}を手に入れた。`);
    return it;
  }
  // 持ち主が亡くなった宝物は行方知れずになる（また探せば見つかる）
  function dropDeadItems() { if (!G || !G.items) return; Object.keys(G.items).forEach(id => { const g = G.gens[G.items[id]]; if (!g || g.state === 'dead') delete G.items[id]; }); }
  const freeItems = () => Object.keys(ITEMS).filter(id => id !== 'gyokuji' && !(G.items && G.items[id] != null));
  // 探索でまれに宝物を見つける
  function findTreasure(g, c) {
    if (!g || g.faction !== G.player) return null;
    dropDeadItems();
    const free = freeItems();
    if (!free.length || Math.random() >= 0.025 + g.int / 4000) return null;
    const id = pick(free), it = giveItem(g, id);
    return { msg: `${c.name}の古い蔵の奥で、宝物「${it.name}」を見つけた！ ${it.desc}。${g.name}が預かる（${Object.entries(it.k).map(([k, v]) => `${STAT_NAME[k]}+${v}`).join('・')}）` };
  }
  // 一騎討ちでの宝物の効き目
  function duelHitK(d) { return itemsOf(d).some(id => ITEMS[id].kind === 'horse') ? -0.06 : 0; }
  function duelDmgK(a) { return itemsOf(a).some(id => ITEMS[id].kind === 'sword') ? 1.1 : 1; }
  // 一騎討ちに勝って敵将を討ち取る・捕らえると、その者の剣や馬を奪う
  function duelSpoils(w, l) {
    const take = itemsOf(l).filter(id => ITEMS[id].kind === 'sword' || ITEMS[id].kind === 'horse');
    take.forEach(id => giveItem(w, id));
    return take.map(id => ITEMS[id].name);
  }

  // ---------- 隠し武将 ----------
  const HIDDEN = {
    王越: { cond: () => (G.stats.duelsWon || 0) >= 10, text: '一騎討ちの噂を聞きつけ、天下に名高い剣客・王越がふらりと現れた。', line: '噂の豪傑がおると聞いてな。わしの剣、試してみるか' },
    華佗: { cond: () => { const cs = Game.citiesOf(G.player); return cs.length >= 5 && cs.reduce((s, c) => s + c.loyal, 0) / cs.length >= 85; }, text: '民を慈しむ国の評判を聞き、名医・華佗が訪ねてきた。', line: '病める者を救うのが医者の務め。この国でなら腕をふるえそうです' },
    管輅: { cond: () => Game.citiesOf(G.player).length >= 15, text: '星を読み、人の運命を言い当てるという占い師・管輅が姿を見せた。', line: 'あなたの頭上に、天下の星が輝いておりますな' },
    左慈: { cond: () => G.turn >= 30 && Math.random() < 0.04, text: 'どこからともなく、白髪の老人・左慈が現れた。不思議な術を使うという。', line: 'ほっほっ。天下が欲しいか。ならば少し、手を貸してやろう' },
  };
  // 新しいゲームでは、隠し武将は姿を見せない
  function hideNew() { if (!G) return; G.gens.forEach(g => { if (HIDDEN[g.name] && g.state !== 'serve') { g.state = 'hidden'; g.city = -1; g.faction = -1; } }); }
  function hiddenEvents() {
    const ev = [];
    Object.entries(HIDDEN).forEach(([name, h]) => {
      const g = G.gens.find(x => x.name === name);
      if (!g || g.state !== 'hidden' || !h.cond()) return;
      const cap = G.factions[G.player].capital;
      g.state = 'ronin'; g.city = cap; g.known = true; g.stay = 0; g.stayMax = 6; g.die = Math.max(g.die, G.year + 20);
      Game.log(`${name}が${G.cities[cap].name}に現れた。`);
      ev.push({ type: 'hist', hist: true, title: '隠れた人物', msg: `${h.text}\n${name}「${h.line}」\n<small>${G.cities[cap].name}にいる。登用すれば仲間になる</small>`, gen: g.i, expr: 'happy', tag: '奇縁', se: 'bell' });
    });
    return ev;
  }
  function checkHiddenJoined() {
    const names = Object.keys(HIDDEN), m = M();
    m.hidden = m.hidden || {};
    names.forEach(n => { const g = G.gens.find(x => x.name === n); if (g && g.state === 'serve' && g.faction === G.player) m.hidden[n] = true; });
    if (Object.keys(m.hidden).length) unlock('hidden1');
    if (names.every(n => m.hidden[n])) unlock('hidden_all');
    saveMeta();
  }
  // 華佗が仕えていれば、自軍の武将は病で倒れにくい
  const healer = () => G && G.gens.some(g => g.name === '華佗' && g.state === 'serve' && g.faction === G.player);

  // ---------- レアな出来事・暦の祝い ----------
  function rareEvents() {
    const ev = [];
    const lord = Game.lordOf(G.player);
    if (!lord) return ev;
    G.items = G.items || {};
    dropDeadItems();
    // 伝国の玉璽（季節に0.4%。洛陽か長安を持っていると少し見つかりやすい）
    const capitals = Game.citiesOf(G.player).some(c => c.id === 'luoyang' || c.id === 'changan');
    if (G.items.gyokuji == null && G.turn >= 8 && Math.random() < (capitals ? 0.008 : 0.004)) {
      giveItem(lord, 'gyokuji');
      ev.push({ type: 'hist', hist: true, title: '伝国の玉璽', msg: `古井戸の底から、五色の光が立ちのぼった。\n引き上げてみると、それは天子の証「伝国の玉璽」であった。\n${lord.name}「天は、我に天下を託すというのか……」\n<small>${lord.name}の魅力 +3、家臣の忠誠 +10</small>`, gen: lord.i, expr: 'happy', tag: '天命', se: 'coronation' });
    }
    // 名馬の献上（季節に1.2%）
    const horses = freeItems().filter(id => ITEMS[id].kind === 'horse');
    if (horses.length && G.turn >= 4 && Math.random() < 0.012) {
      const best = Game.gensOf(G.player).filter(g => !g.isLord).sort((a, b) => b.war - a.war)[0] || lord;
      const id = pick(horses), it = giveItem(best, id);
      ev.push({ type: 'hist', hist: true, title: `名馬・${it.name}`, msg: `遠い西の国の商人が、一頭の名馬を献上した。${it.desc}。\n${best.name}「なんと見事な……。この馬となら、どこまでも駆けられそうだ」\n<small>${best.name}が乗る（一騎討ちで攻撃をかわしやすくなる）</small>`, gen: best.i, expr: 'happy', tag: '名馬', se: 'bell' });
    }
    // 暦の祝い（遊んでいる日の日付。1日1回まで）
    const d = new Date(), md = (d.getMonth() + 1) * 100 + d.getDate(), key = localDay();
    const FEST = md >= 101 && md <= 107 ? ['新春の祝い', '年が改まった。国中で爆竹が鳴り、人々が新しい年を祝っている。', 'loyal', 6]
      : md === 505 ? ['端午の節句', '川では竜舟の競漕が行われ、人々は粽を食べて邪気をはらった。', 'loyal', 5]
      : md === 707 ? ['七夕', '天の川に、牽牛と織女の星が並んだ。娘たちは針仕事の上達を願っている。', 'loyal', 5]
      : md === 909 ? ['重陽の節句', '人々は高い丘に登り、菊の酒を酌み交わして長寿を願った。', 'loyal', 5]
      : null;
    const m = M();
    if (FEST && !m.days[key]) {
      m.days[key] = true; saveMeta();
      Game.citiesOf(G.player).forEach(c => { c.loyal = Math.min(100, c.loyal + FEST[3]); c.gold += 100; });
      unlock('festival');
      ev.push({ type: 'hist', hist: true, title: FEST[0], msg: `${FEST[1]}\n${lord.name}「今日ばかりは、皆で祝おう」\n<small>全都市の民忠 +${FEST[3]}、金 +100</small>`, gen: lord.i, expr: 'happy', tag: '暦', se: 'bell' });
    }
    return ev;
  }
  // 隠し部屋のヒント：一度統一したあとのプレイで、まだ隠し部屋を見つけていなければ、
  //  3季節目に一度、そのあとは12季節ごとに、軍師（いなければ君主）がはっきり教えてくれる
  function omakeHint() {
    const m = M();
    if (!cleared() || m.ach.omake || G.turn < 3) return [];
    G.events.omakeHintAt = G.events.omakeHintAt == null ? -99 : G.events.omakeHintAt;
    if (G.turn - G.events.omakeHintAt < 12) return [];
    G.events.omakeHintAt = G.turn;
    const st = G.strategist != null && G.gens[G.strategist] && G.gens[G.strategist].state === 'serve' && G.gens[G.strategist].faction === G.player ? G.gens[G.strategist] : null;
    const sg = st && !st.isLord ? st : (Game.gensOf(G.player).filter(g => !g.isLord).sort((a, b) => b.int - a.int)[0] || Game.lordOf(G.player));
    if (!sg) return [];
    const body = sg.isLord
      ? `${sg.name}「妙な噂を耳にした。\nはじめの画面の『群雄天下』の題字を、すばやく5回たたくと、隠し部屋の扉が開くという。音楽や効果音を、好きなだけ楽しめるそうだ」`
      : `${sg.name}「殿、妙な噂を耳にしました。\nはじめの画面の『群雄天下』の題字を、すばやく5回たたくと、隠し部屋の扉が開くそうです。音楽や効果音を、好きなだけ楽しめるとか」`;
    return [{ type: 'hist', hist: true, title: '隠し部屋の噂', msg: `${body}\n<small>タイトル画面で「群雄天下」の文字を素早く5回タップ</small>`, gen: sg.i, expr: 'happy', tag: 'ひみつ', se: 'bell' }];
  }
  // 季節の終わりに呼ぶ（events.js の Events.run から）
  function seasonEvents() {
    if (!G || !G.factions[G.player] || !G.factions[G.player].alive) return [];
    recordMet();
    checkHiddenJoined();
    return [...hiddenEvents(), ...rareEvents(), ...omakeHint()];
  }

  // ---------- 武将図鑑 ----------
  function recordMet() {
    const m = M(); let add = 0;
    G.gens.forEach(g => { if (g.state === 'serve' && g.faction === G.player && !m.met[g.name]) { m.met[g.name] = 1; add++; } });
    if (add) saveMeta();
    const total = GENERAL_SRC.trim().split('\n').length, n = Object.keys(m.met).length;
    if (n >= total / 2) unlock('zukan50');
    if (n >= total) unlock('zukan100');
  }

  // ---------- 隠しシナリオ ----------
  const HIDDEN_SCEN = [
    { id: 'sbushin', year: 200, title: '武神乱舞', sub: '豪傑だけが覇を競う', unlock: m => m.unify >= 1,
      desc: '【隠しシナリオ】天下に名だたる豪傑たちが、それぞれ一国の主として立った。知略より腕っぷし。最後に立っているのは誰か。', dream: true, hidden: true,
      lords: [
        ['呂布', '#5b3a8c', ['xiapi', 'xiaopei'], ['高順', '張遼']],
        ['関羽', '#2f8a4e', ['jiangling', 'xiangyang'], ['関平', '周倉']],
        ['張飛', '#3a3a6a', ['zitong', 'hanzhong'], ['厳顔']],
        ['趙雲', '#4a7ab0', ['changsha', 'guiyang'], ['陳到']],
        ['馬超', '#8a8a8a', ['tianshui', 'wuwei'], ['馬岱', '龐徳']],
        ['典韋', '#2f5aa8', ['chenliu', 'xuchang'], ['許褚']],
        ['甘寧', '#c0392b', ['chaisang', 'jiangxia'], ['凌統']],
        ['孫策', '#d9532b', ['jianye', 'wu'], ['太史慈', '周泰']],
        ['顔良', '#c9a227', ['ye', 'nanpi'], ['文醜']],
        ['華雄', '#6a2f5b', ['luoyang', 'changan'], ['徐栄']],
      ] },
    { id: 'sgunshi', year: 220, title: '軍師天下', sub: '知恵者だけが覇を競う', unlock: m => m.unify >= 2,
      desc: '【隠しシナリオ】主君の陰で策を巡らせてきた軍師たちが、ついに自ら天下を狙う。武より知。一手先を読む者が勝つ。', dream: true, hidden: true,
      lords: [
        ['諸葛亮', '#2f8a4e', ['chengdu', 'jiangzhou'], ['姜維', '馬謖']],
        ['司馬懿', '#5a5a8c', ['luoyang', 'changan'], ['鄧艾', '鍾会']],
        ['周瑜', '#c0392b', ['chaisang', 'lujiang'], ['魯粛', '呂蒙']],
        ['郭嘉', '#2f5aa8', ['xuchang', 'chenliu'], ['程昱']],
        ['陸遜', '#d9532b', ['wu', 'kuaiji'], ['朱然']],
        ['賈詡', '#6a2f5b', ['wan', 'shangyong'], ['張繍']],
        ['龐統', '#3a8c8c', ['xiangyang', 'jiangling'], ['法正']],
        ['荀彧', '#c9a227', ['ye', 'pingyuan'], ['荀攸']],
      ] },
  ];
  // 実在しない名前（データにない武将）は外して登録する
  function initScenarios() {
    const names = new Set(GENERAL_SRC.trim().split('\n').map(l => l.split(',')[0]));
    const ids = new Set(CITY_DATA.map(c => c[0]));
    HIDDEN_SCEN.forEach(sc => {
      sc.lords = sc.lords.filter(L => names.has(L[0])).map(L => [L[0], L[1], L[2].filter(id => ids.has(id)), L[3].filter(n => names.has(n))]).filter(L => L[2].length);
      if (!SCENARIOS.some(s => s.id === sc.id)) SCENARIOS.push(sc);
    });
  }
  const scenUnlocked = sc => !sc.hidden || (HIDDEN_SCEN.find(h => h.id === sc.id) || { unlock: () => false }).unlock(M());

  // ---------- 隠し君主（下剋上） ----------
  //  ある君主で天下を統一すると、その陣営の重臣が君主として選べるようになる（どのシナリオでも、その人物が家臣として仕えていれば）
  const USURP = { 曹操: '司馬懿', 劉備: '諸葛亮', 孫権: '周瑜', 孫策: '周瑜', 孫堅: '孫策', 呂布: '陳宮', 袁紹: '田豊', 董卓: '李儒', 馬騰: '馬超', 劉表: '蔡瑁', 劉璋: '法正', 袁術: '紀霊', 公孫瓚: '趙雲', 張魯: '閻圃', 陶謙: '陳登', 劉焉: '張任' };
  const usurpers = () => { const m = M(); return [...new Set(Object.keys(m.wonBy).map(l => USURP[l]).filter(Boolean))]; };
  // 下剋上の新しいゲーム：その人物が仕える勢力の君主に立てる（元の君主は家臣になる）
  function usurpStart(g) {
    const fi = g.faction; if (fi < 0) return;
    const f = G.factions[fi], old = Game.lordOf(fi);
    old.isLord = false; old.loyalty = 70;
    g.isLord = true; g.loyalty = 100;
    f.lord = g.i; f.name = g.name; f.isPlayer = true; G.player = fi; G.usurp = true;
    g.city = f.capital;
    Game.log(`${g.name}が${old.name}に代わって立ち、天下に名乗りを上げた。`);
  }

  // ---------- 天下統一のとき ----------
  function onFinish(kind) {
    if (kind !== 'win' || !G) return;
    const m = M(), lord = Game.lordOf(G.player);
    recordMet(); checkHiddenJoined();
    m.unify = (m.unify || 0) + 1;
    const sc = SCENARIOS.find(s => s.id === G.scen);
    if (lord) m.wonBy[G.startLord || lord.name] = true;
    saveMeta();
    unlock('unify1');
    if (sc && !sc.dream && G.year - sc.year <= 10) unlock('unify_fast');
    if (G.stats.battles > 0 && G.stats.battles === G.stats.wins) unlock('unify_noloss');
    if (G.usurp) unlock('usurp');
    const lordsAll = new Set(); SCENARIOS.filter(s => !s.hidden).forEach(s => s.lords.forEach(L => lordsAll.add(L[0])));
    const won = Object.keys(m.wonBy).filter(n => lordsAll.has(n)).length;
    if (won >= 5) unlock('unify_lords5');
    if (won >= lordsAll.size) unlock('unify_all');
  }
  // エンディングの語りに添える一文（統一の仕方で変わる）
  function endingNote() {
    if (!G) return '';
    const sc = SCENARIOS.find(s => s.id === G.scen);
    const yrs = sc && !sc.dream ? G.year - sc.year : 99;
    const exe = G.stats.executed || 0, lord = Game.lordOf(G.player);
    if (G.usurp) return `主君を越えて立った｜${lord ? lord.name : ''}の名は、｜のちの世に｜「下剋上」の手本として語られる。`;
    if (exe >= 10) return '多くの血の上に｜築かれた天下に、｜人々はただ｜息をひそめた。';
    if (yrs <= 10) return '挙兵からわずかの年月。｜その電光石火の覇業に、｜天下は目を見張った。';
    if (exe === 0 && lord && Game.has(lord, '仁徳')) return '敵将すら一人も斬らずに｜成し遂げた天下統一。｜その仁の名は、｜千年の後まで語り継がれる。';
    if (G.items && G.items.gyokuji != null) return '伝国の玉璽は、｜ついにふさわしい主の｜もとに収まった。';
    return '';
  }

  // ---------- 記録の画面（実績・武将図鑑・宝物） ----------
  async function openRecords(tab = 'ach') {
    const m = M();
    const tabs = `<div class="rec-tabs">${[['ach', '実績'], ['zukan', '武将図鑑'], ['items', '宝物']].map(([k, n]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'ach') {
      const n = ACH.filter(a => m.ach[a[0]]).length;
      body = `<p class="rec-sum">達成 ${n} / ${ACH.length}　天下統一 ${m.unify || 0}回　一騎討ち通算 ${m.duelWins || 0}勝</p>` + ACH.map(([id, nm, ds]) => m.ach[id] ? `<div class="rec-row on"><b>${nm}</b><small>${ds}</small></div>` : `<div class="rec-row"><b>？？？</b><small>${id === 'omake' ? 'タイトルの題字に、秘密があるらしい' : id.startsWith('hidden') || id === 'legend' || id === 'wind' || id === 'ultimate' ? 'まだ見ぬ何か' : ds}</small></div>`).join('');
    } else if (tab === 'zukan') {
      const all = GENERAL_SRC.trim().split('\n').map(l => l.split(','));
      const n = all.filter(p => m.met[p[0]]).length;
      body = `<p class="rec-sum">配下にした武将 ${n} / ${all.length}　<small>（名前をタップすると顔が見られます）</small></p><div class="zukan">` + all.map(p => m.met[p[0]] ? `<button class="zk on" data-n="${p[0]}">${p[0]}</button>` : `<span class="zk">？？</span>`).join('') + '</div>';
    } else {
      body = Object.entries(ITEMS).map(([id, it]) => m.items[id] ? `<div class="rec-row on"><b>${it.name}</b><small>${it.desc}（${Object.entries(it.k).map(([k, v]) => `${STAT_NAME[k]}+${v}`).join('・')}）</small></div>` : `<div class="rec-row"><b>？？？</b><small>${{ sword: '名剣', horse: '名馬', book: '書物', seal: '天子の証' }[it.kind]}</small></div>`).join('');
    }
    const p = UI.modal({ title: '記録', body: tabs + `<div class="rec-body">${body}</div>`, wide: true, buttons: [{ label: '閉じる', cls: 'primary', value: 'close' }] });
    const mEl = document.getElementById('modal');
    mEl.querySelectorAll('.rec-tabs button').forEach(b => b.onclick = () => { Sound.se('tap'); UI.closeModal('tab:' + b.dataset.t); });
    mEl.querySelectorAll('.zk.on').forEach(b => b.onclick = () => {
      Sound.se('tap');
      const p0 = GENERAL_SRC.trim().split('\n').map(l => l.split(',')).find(x => x[0] === b.dataset.n);
      const g = { name: p0[0], lead: +p0[1], war: +p0[2], int: +p0[3], pol: +p0[4], cha: +p0[5], traits: p0[6] === '-' ? [] : p0[6].split(' '), female: p0[10] === 'F' };
      const box = mEl.querySelector('.rec-body');
      box.querySelectorAll('.zk-face').forEach(x => x.remove());
      const d = document.createElement('div'); d.className = 'zk-face';
      d.innerHTML = `<img src="${Portrait.get(g, 'normal')}"><div><b>${g.name}</b><br>統${g.lead} 武${g.war} 知${g.int} 政${g.pol} 魅${g.cha}<br>${g.traits.map(t => `<span class="trait">${t}</span>`).join('')}</div>`;
      box.prepend(d); box.scrollTop = 0;
    });
    const v = await p;
    if (typeof v === 'string' && v.startsWith('tab:')) return openRecords(v.slice(4));
  }

  // ---------- おまけ（タイトルの文字「群雄天下」を素早く5回タップ） ----------
  let taps = [];
  // 一度でも天下を統一したか（記録と隠し部屋は、統一したあとに開く）
  const cleared = () => (M().unify || 0) >= 1;
  function logoTap() {
    if (!cleared()) return;
    const now = Date.now(); taps = taps.filter(t => now - t < 2500); taps.push(now);
    if (taps.length >= 5) { taps = []; openOmake(); }
  }
  async function openOmake() {
    unlock('omake');
    const SONGS = [['title', 'タイトル'], ['map0', '春の地図'], ['map1', '夏の地図'], ['map2', '秋の地図'], ['map3', '冬の地図'], ['mid0', '中盤（春夏）'], ['mid1', '中盤（秋冬）'], ['late0', '終盤（春夏）'], ['late1', '終盤（秋冬）'], ['battle', '合戦'], ['lordwar', '決戦'], ['defend', '籠城'], ['crisis', '劣勢'], ['duel', '一騎討ち'], ['ending', 'エンディング'], ['sad', '悲しみ']];
    const SE = [['gong', '銅鑼'], ['koBig', '必殺の一撃'], ['ko', 'とどめ'], ['skill', '必殺技'], ['crit', '会心'], ['warcry', '鬨の声'], ['horn', '角笛'], ['march', '出陣'], ['fire', '火計'], ['gateBreak', '城門破り'], ['victory', '勝利'], ['coronation', '即位'], ['bell', '鐘'], ['great', '大成功']];
    const v = await UI.modal({ title: '隠し部屋', wide: true, body: `<p class="rec-sum">ようこそ。ここは作り手の隠し部屋です。</p>
      <h4 class="om-h">音楽室</h4><div class="zukan">${SONGS.map(([k, n]) => `<button class="zk on" data-song="${k}">${n}</button>`).join('')}</div>
      <h4 class="om-h">効果音</h4><div class="zukan">${SE.map(([k, n]) => `<button class="zk on" data-se="${k}">${n}</button>`).join('')}</div>`,
      buttons: [{ label: '記録を見る', value: 'rec' }, { label: '閉じる', cls: 'primary', value: 'close' }] });
    Sound.bgm('title');
    if (v === 'rec') return openRecords();
  }
  // 隠し部屋のボタン（モーダルを開いた直後に結びつける）
  document.addEventListener('click', e => {
    const s = e.target.closest && e.target.closest('[data-song]'); if (s) { Sound.init(true); Sound.bgm(s.dataset.song); return; }
    const t = e.target.closest && e.target.closest('[data-se]'); if (t) { Sound.init(true); Sound.se(t.dataset.se); }
  });

  // ---------- 一騎討ち・合戦から呼ぶ記録 ----------
  function duelWon(byPlayer) { if (!byPlayer) return; const m = M(); m.duelWins = (m.duelWins || 0) + 1; saveMeta(); if (m.duelWins >= 100) unlock('duel100'); }
  function seen(id) { const m = M(); m.legend[id] = true; saveMeta(); }

  return {
    M, saveMeta, unlock, ACH, ITEMS, itemsOf, giveItem, findTreasure, duelHitK, duelDmgK, duelSpoils,
    HIDDEN, hideNew, healer, seasonEvents, recordMet, initScenarios, scenUnlocked, usurpers, usurpStart, onFinish, endingNote,
    openRecords, logoTap, duelWon, seen, START_OWNER, cleared,
    // 開始時の宝物の持ち主
    initItems() {
      G.items = {}; G.itemBonus = {};
      const m = M(); let rec = false;
      Object.entries(START_OWNER).forEach(([id, n]) => { const g = G.gens.find(x => x.name === n && x.state === 'serve'); if (g) { G.items[id] = g.i; if (g.faction === G.player) { m.items[id] = true; rec = true; } } });
      if (rec) saveMeta();
    },
  };
})();
Secret.initScenarios();
