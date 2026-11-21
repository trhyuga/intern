// ============================================================
//  イベント
//  ・不定期イベント：都市・武将ごとに、季節ごとに一定の確率で起きる
//  ・史実・演義にちなむイベント：年・勢力・武将の顔ぶれなどの条件がそろうと一度だけ起きる
//  ・プレイヤーの勢力に起きたものは画面に出す。他の勢力に起きたものは静かに反映
//    （大きな史実イベントは「天下の動き」として知らせる）
//  ・人物の逸話は史書・演義のよく知られた話にちなんだゲーム上の演出
// ============================================================
const Events = (() => {
  const cap = v => clamp(Math.round(v), 1, 100);
  const up = (g, k, v) => { g[k] = cap(g[k] + v); };
  const G_ = n => G.gens.find(g => g.name === n);
  const serving = n => { const g = G_(n); return g && g.state === 'serve' ? g : null; };
  const facOf = n => { const g = serving(n); return g ? g.faction : -1; };
  const lordIs = (fi, n) => fi >= 0 && G.factions[fi] && G.factions[fi].alive && Game.lordOf(fi).name === n;
  const facByLord = n => G.factions.findIndex(f => f.alive && Game.lordOf(f.i).name === n);
  const owns = (fi, cityName) => G.cities.some(c => c.name === cityName && c.owner === fi);
  const cityByName = n => G.cities.find(c => c.name === n);
  const govOf = c => Game.gensIn(c.i, c.owner).sort((a, b) => (b.isLord ? 100 : 0) + b.pol - (a.isLord ? 100 : 0) - a.pol)[0];
  const mine = fi => fi === G.player;
  const pct = (c, k, mk, r) => { c[k] = Math.max(0, Math.min(c[mk], Math.round(c[k] + c[mk] * r))); };

  // ---------------- 不定期イベント（都市） ----------------
  // 戻り値：{ msg, expr, line, good }。line は太守（その都市の武将）の一言
  const CITY = [
    { w: 5, name: '商隊の来訪', run: c => { const v = irnd(150, 400); c.gold += v; return { msg: `${c.name}に西域の商隊がやってきた。金 +${v}`, expr: 'happy', line: '珍しい品が並んでおります', good: true }; } },
    { w: 4, name: '豪族の献上', run: c => { const g = irnd(100, 300), f = irnd(2000, 5000); c.gold += g; c.food += f; return { msg: `${c.name}の豪族が金${g}と兵糧${f}を献上した`, expr: 'happy', line: '土地の者たちも、我らを認めたようです', good: true }; } },
    { w: 4, name: '流民の流入', run: c => { const v = irnd(8000, 25000); c.pop += v; c.loyal = Math.max(0, c.loyal - 3); return { msg: `戦乱を逃れた流民が${c.name}に流れ込んだ。人口 +${fmt(v)}、民忠 -3`, expr: 'normal', line: '住む場所と食べ物を用意してやらねば', good: true }; } },
    { w: 4, name: '祭り', cond: c => c.gold >= 200, run: c => { c.gold -= 100; c.loyal = Math.min(100, c.loyal + 8); return { msg: `${c.name}で祭りを開いた。金 -100、民忠 +8`, expr: 'happy', line: '民の笑顔は何よりの宝です', good: true }; } },
    { w: 3, name: '大地震', run: c => { const v = Math.round(c.def * 0.15); c.def -= v; c.pop = Math.round(c.pop * 0.98); return { msg: `${c.name}で大地震。城壁 -${v}`, expr: 'shock', line: '城壁にひびが……すぐに直さねば！' }; } },
    { w: 3, name: '大火', run: c => { const v = Math.round(c.comm * 0.12); c.comm -= v; return { msg: `${c.name}の市で大火が起きた。商業 -${v}`, expr: 'shock', line: '火の手が市を……！' }; } },
    { w: 4, name: '盗賊の出没', run: c => {
      const gs = Game.gensIn(c.i, c.owner).sort((a, b) => b.war - a.war);
      if (gs[0] && gs[0].war >= 75 && Math.random() < 0.6) { c.loyal = Math.min(100, c.loyal + 6); up(gs[0], 'cha', 1); return { msg: `${c.name}近くの盗賊を${gs[0].name}が討ち取った。民忠 +6、${gs[0].name}の魅力 +1`, expr: 'happy', line: '民を脅かす者は許さん', speaker: gs[0], good: true }; }
      const v = Math.min(c.gold, irnd(80, 200)); c.gold -= v; c.loyal = Math.max(0, c.loyal - 5); return { msg: `${c.name}の街道に盗賊が出没。金 -${v}、民忠 -5`, expr: 'angry', line: '盗賊どもめ……' }; } },
    { w: 3, name: '干ばつ', cond: () => G.season === 1, run: c => { c.harvestK = Math.min(c.harvestK || 1, 0.7); pct(c, 'farm', 'farmMax', -0.05); return { msg: `${c.name}で日照りが続いている。秋の収穫が減りそうだ。農業 -5%`, expr: 'sad', line: '雨が降らぬ……' }; } },
    { w: 3, name: '水路の発見', run: c => { pct(c, 'farm', 'farmMax', 0.06); return { msg: `${c.name}で古い水路が見つかり、田に水が行き渡った。農業 +6%`, expr: 'happy', line: 'これで田が潤います', good: true }; } },
    { w: 3, name: '塩の密売摘発', run: c => { const v = irnd(150, 350); c.gold += v; return { msg: `${c.name}で塩の密売人を捕らえ、隠し財産を没収した。金 +${v}`, expr: 'happy', line: '悪事は見逃しませぬ', good: true }; } },
    { w: 2, name: '瑞兆', run: c => { c.loyal = Math.min(100, c.loyal + 10); return { msg: `${c.name}の空に五色の雲がかかった。吉兆だと民が喜んでいる。民忠 +10`, expr: 'happy', line: '天も我らを祝福しているのでしょう', good: true }; } },
    { w: 2, name: '凶兆', run: c => { c.loyal = Math.max(0, c.loyal - 8); return { msg: `${c.name}に赤い流れ星が落ちた。不吉だと民が騒いでいる。民忠 -8`, expr: 'shock', line: 'ただの星にございます。民を落ち着かせねば' }; } },
    { w: 3, name: '異民族の侵入', cond: c => ['xiangping', 'beiping', 'wuwei', 'anding', 'tianshui', 'jinyang', 'yunnan', 'jianning'].includes(c.id), run: c => {
      const v = Math.round(c.troops * 0.08); c.troops -= v; c.loyal = Math.max(0, c.loyal - 4); return { msg: `辺境の${c.name}に異民族が侵入した。兵 -${fmt(v)}、民忠 -4`, expr: 'angry', line: '国境を荒らす者どもめ！' }; } },
    { w: 3, name: '義勇兵', cond: c => c.loyal >= 70, run: c => { const v = irnd(800, 2000); c.troops += v; return { msg: `${c.name}で民が義勇兵として集まった。兵 +${fmt(v)}`, expr: 'happy', line: '民の心が一つになっております', good: true }; } },
    { w: 2, name: '名工の来訪', run: c => { const v = Math.round(c.defMax * 0.06); c.def = Math.min(c.defMax, c.def + v); return { msg: `${c.name}に名高い工匠が訪れ、城壁の修理を手伝った。城壁 +${v}`, expr: 'happy', line: 'これで守りも安心です', good: true }; } },
    { w: 2, name: '兵の脱走', cond: c => c.loyal < 50, run: c => { const v = Math.round(c.troops * 0.06); c.troops -= v; return { msg: `${c.name}で兵が夜のうちに逃げ出した。兵 -${fmt(v)}`, expr: 'angry', line: '士気が緩んでおるのか……' }; } },
    { w: 2, name: '鍛冶の名人', run: c => { c.train = Math.min(100, c.train + 8); return { msg: `${c.name}に鍛冶の名人が現れ、良い武器が揃った。訓練 +8`, expr: 'happy', line: '刃の切れ味がまるで違います', good: true }; } },
    { w: 3, name: '豊作', cond: () => G.season === 2, run: c => { const v = irnd(3000, 7000); c.food += v; c.loyal = Math.min(100, c.loyal + 3); return { msg: `${c.name}は大豊作。兵糧 +${fmt(v)}、民忠 +3`, expr: 'happy', line: '倉に入りきらぬほどの実りです！', good: true }; } },
    { w: 2, name: '蝗の害', cond: () => G.season === 1 || G.season === 2, run: c => { const v = Math.round(c.food * 0.12); c.food -= v; pct(c, 'farm', 'farmMax', -0.04); return { msg: `${c.name}に蝗の大群が押し寄せた。兵糧 -${fmt(v)}、農業 -4%`, expr: 'shock', line: '空が蝗で黒く……！ 田が食い尽くされる！' }; } },
    { w: 2, name: '疫病', cond: () => G.season === 1, run: c => { const v = Math.round(c.troops * 0.05); c.troops -= v; c.pop = Math.round(c.pop * 0.98); c.loyal = Math.max(0, c.loyal - 4); return { msg: `${c.name}で疫病がはやった。兵 -${fmt(v)}、民忠 -4`, expr: 'sad', line: '医者と薬をかき集めろ！' }; } },
    { w: 2, name: '大雪', cond: () => G.season === 3, run: c => { const v = Math.min(c.gold, irnd(50, 150)); c.gold -= v; return { msg: `${c.name}に大雪が降った。雪かきと炊き出しに金 -${v}`, expr: 'sad', line: '雪で道が埋まってしまいました' }; } },
    { w: 2, name: '名士の来訪', run: c => { c.loyal = Math.min(100, c.loyal + 5); c.gold += 80; return { msg: `名高い学者が${c.name}に立ち寄り、講義を開いた。民忠 +5、金 +80`, expr: 'happy', line: '学問の香りが町に満ちております', good: true }; } },
    { w: 2, name: '偽商人', run: c => { const v = Math.min(c.gold, irnd(60, 180)); c.gold -= v; return { msg: `${c.name}の役人が偽の商人に騙され、金 -${v}`, expr: 'angry', line: '「西域の珍品」が、ただの石ころでした……' }; } },
    { w: 2, name: '井戸の発見', run: c => { pct(c, 'farm', 'farmMax', 0.03); c.loyal = Math.min(100, c.loyal + 2); return { msg: `${c.name}で良い水の出る井戸が掘り当てられた。農業 +3%、民忠 +2`, expr: 'happy', line: '冷たくて甘い水です！', good: true }; } },
  ];

  const BAD_CITY = new Set(['大地震', '大火', '盗賊の出没', '干ばつ', '凶兆', '異民族の侵入', '兵の脱走', '蝗の害', '疫病', '大雪', '偽商人']);

  // ---------------- 不定期イベント（武将） ----------------
  const GEN = [
    { w: 5, name: '武芸の鍛錬', cond: g => g.war >= 60 && g.war < 99, run: g => { up(g, 'war', 1); return { msg: `${g.name}は日夜武芸に励んだ。武力 +1`, expr: 'angry', line: pick(['まだまだ強くなれる', 'はっ！ せいっ！']), good: true }; } },
    { w: 5, name: '兵法書を読む', cond: g => g.int >= 50 && g.int < 99, run: g => { up(g, 'int', 1); return { msg: `${g.name}は兵法書を読みふけった。知力 +1`, expr: 'normal', line: pick(['なるほど、ここに勝機が', '孫子の言う通りだ']), good: true }; } },
    { w: 3, name: '政務に通じる', cond: g => g.pol >= 50 && g.pol < 99, run: g => { up(g, 'pol', 1); return { msg: `${g.name}は政務を学び直した。政治 +1`, expr: 'normal', line: '帳簿の付け方ひとつで、国は変わります', good: true }; } },
    { w: 3, name: '人望を得る', cond: g => g.cha < 99, run: g => { up(g, 'cha', 1); return { msg: `${g.name}の人柄が評判になった。魅力 +1`, expr: 'happy', line: '照れくさいものですな', good: true }; } },
    { w: 2, name: '名馬を得る', cond: g => g.war >= 70, run: g => { up(g, 'lead', 1); up(g, 'war', 1); return { msg: `${g.name}は一日千里を駆ける名馬を手に入れた。統率 +1、武力 +1`, expr: 'happy', line: 'この馬となら、どこまでも駆けられる！', good: true }; } },
    { w: 2, name: '宝剣を得る', cond: g => g.war >= 65, run: g => { up(g, 'war', 2); return { msg: `${g.name}は古い宝剣を手に入れた。武力 +2`, expr: 'happy', line: '見事な刃だ……', good: true }; } },
    { w: 2, name: '師に出会う', cond: g => g.int < 90 && g.appear >= 195, run: g => { up(g, 'int', 2); up(g, 'pol', 1); return { msg: `${g.name}は隠者に師事した。知力 +2、政治 +1`, expr: 'happy', line: '世の中には、まだまだ学ぶことがある', good: true }; } },
    { w: 3, name: '子の誕生', cond: g => !g.isLord, run: g => { g.loyalty = Math.min(100, g.loyalty + 6); return { msg: `${g.name}に子が生まれた。主君からの祝いに感激している。忠誠 +6`, expr: 'happy', line: 'この子のためにも、天下を泰平に', good: true }; } },
    { w: 3, name: '酒の失敗', cond: g => g.traits.includes('猪突') || g.traits.includes('剛勇'), run: g => { const c = G.cities[g.city]; c.loyal = Math.max(0, c.loyal - 5); return { msg: `${g.name}が酒に酔って暴れ、町で騒ぎを起こした。${c.name}の民忠 -5`, expr: 'shock', line: 'う……飲みすぎた……', }; } },
    { w: 3, name: '不満', cond: g => g.traits.includes('野心') && !g.isLord, run: g => { g.loyalty = Math.max(0, g.loyalty - 8); return { msg: `${g.name}が待遇に不満を漏らしている。忠誠 -8`, expr: 'angry', line: line(g, 'chatLow') }; } },
    { w: 2, name: '病', cond: g => G.year - g.appear > 25, run: g => { up(g, 'war', -2); up(g, 'lead', -1); return { msg: `${g.name}が病に伏せった。武力 -2、統率 -1`, expr: 'sad', line: 'ごほっ……この程度で……' }; } },
    { w: 2, name: '衰え', cond: g => G.year - g.appear > 32 && g.war > 40, run: g => { up(g, 'war', -1); up(g, 'int', 1); return { msg: `${g.name}は年を感じるようになった。武力 -1、知力 +1`, expr: 'sad', line: '槍が重く感じる。代わりに、見えるものも増えたが' }; } },
    { w: 2, name: '献策', cond: g => g.int >= 80, run: g => { const c = G.cities[g.city]; const v = irnd(200, 400); c.gold += v; return { msg: `${g.name}の献策で${c.name}の財政が改善した。金 +${v}`, expr: 'happy', line: '無駄を省けば、金は湧いて出るものです', good: true }; } },
    { w: 2, name: '決闘騒ぎ', cond: g => g.war >= 80 && !g.isLord, run: g => { const win = Math.random() < g.war / 120; if (win) { up(g, 'war', 1); return { msg: `${g.name}が腕自慢の豪傑と勝負し、打ち負かした。武力 +1`, expr: 'happy', line: '口ほどにもない', good: true }; } g.loyalty = Math.max(0, g.loyalty - 3); return { msg: `${g.name}が腕自慢の豪傑に後れを取った。忠誠 -3`, expr: 'sad', line: '不覚……！' }; } },
    { w: 2, name: '親孝行', cond: g => g.traits.includes('仁徳') || g.traits.includes('忠義'), run: g => { up(g, 'cha', 2); return { msg: `${g.name}の親孝行ぶりが評判になった。魅力 +2`, expr: 'happy', line: '親を大事にするのは人の道です', good: true }; } },
    { w: 2, name: '寝坊', cond: g => !g.isLord, run: g => { g.loyalty = Math.max(0, g.loyalty - 1); return { msg: `${g.name}が軍議に寝坊して遅れてきた。忠誠 -1（気まずい）`, expr: 'shock', line: 'す、すみません！ 鶏が鳴かなかったもので……' }; } },
    { w: 2, name: '料理自慢', run: g => { g.loyalty = Math.min(100, g.loyalty + 3); up(g, 'cha', 1); return { msg: `${g.name}が自慢の料理を皆に振る舞った。魅力 +1、忠誠 +3`, expr: 'happy', line: '鍋はな、火加減が命なのだ', good: true }; } },
    { w: 2, name: '詩会', cond: g => g.int >= 60, run: g => { up(g, 'int', 1); up(g, 'cha', 1); return { msg: `${g.name}が詩会で見事な詩を詠んだ。知力 +1、魅力 +1`, expr: 'happy', line: '月を詠むなら、今宵に限ります', good: true }; } },
    { w: 2, name: '馬が逃げた', cond: g => g.war >= 60, run: g => { up(g, 'lead', -1); return { msg: `${g.name}の愛馬が厩から逃げ出し、一日中追いかける羽目になった。統率 -1`, expr: 'shock', line: '待てーっ！ 戻ってこーい！' }; } },
    { w: 2, name: '腕相撲大会', cond: g => g.war >= 75 && !g.isLord, run: g => { const win = Math.random() < g.war / 110; if (win) { up(g, 'war', 1); g.loyalty = Math.min(100, g.loyalty + 2); return { msg: `${g.name}が兵の腕相撲大会で優勝した。武力 +1`, expr: 'happy', line: '次の挑戦者は誰だ！', good: true }; } return { msg: `${g.name}が兵の腕相撲大会で、炊事係に負けた`, expr: 'shock', line: '……あの男、何者だ……' }; } },
    { w: 1, name: '夢のお告げ', run: g => { up(g, 'int', 1); return { msg: `${g.name}が不思議な夢を見たと言っている。知力 +1`, expr: 'normal', line: '夢に古の賢者が現れて、何か大事なことを……忘れました', good: true }; } },
  ];

  const BAD_GEN = new Set(['酒の失敗', '不満', '病', '寝坊', '馬が逃げた']);

  // ---------------- 能力の上位者だけに起きるイベント ----------------
  const adjEnemy = c => c.adj.map(a => G.cities[a]).filter(o => o.owner !== null && o.owner !== c.owner && !Game.isAlly(c.owner, o.owner));
  const TOP_EV = {
    lead: [
      { name: '練兵の名手', run: (g, c) => { const v = Math.min(100 - c.train, 15); c.train += v; return { msg: `${g.name}の練兵で、${c.name}の兵は見違えるほど精強になった。訓練 +${v}`, line: '号令ひとつで、兵が一つの生き物のように動く' }; } },
      { name: '鉄壁の布陣', run: (g, c) => { const v = Math.round(c.defMax * 0.08); c.def = Math.min(c.defMax, c.def + v); return { msg: `${g.name}が${c.name}の守りの配置を見直した。城壁 +${v}`, line: '攻め口はすべて塞いだ' }; } },
    ],
    war: [
      { name: '虎退治', run: (g, c) => { c.loyal = Math.min(100, c.loyal + 8); up(g, 'cha', 1); return { msg: `${c.name}を荒らす人食い虎を${g.name}が素手で仕留めた。民忠 +8、${g.name}の魅力 +1`, line: '虎ごとき、物の数ではない' }; } },
      { name: '武名轟く', run: (g, c) => { const en = adjEnemy(c); en.forEach(o => o.train = Math.max(0, o.train - 6)); return { msg: `${g.name}の武名が轟き、${en.length ? en.map(o => o.name).join('・') + 'の敵兵が震え上がった。訓練 -6' : '近隣に名が知れ渡った'}`, line: '我が名を聞いて逃げ出すなら、それもよし' }; } },
    ],
    int: [
      { name: '天文を読む', run: (g, c) => { c.harvestK = Math.max(c.harvestK || 1, 1.15); c.loyal = Math.min(100, c.loyal + 3); return { msg: `${g.name}が天文を読み、${c.name}の天候の変化に備えさせた。秋の収穫が増えそうだ。民忠 +3`, line: '星の巡りに、雨の兆しが見えます' }; } },
      { name: '兵法書を著す', run: (g, c) => { const pupil = Game.gensOf(g.faction).filter(x => x !== g && x.int < 90).sort(() => Math.random() - 0.5)[0]; if (!pupil) return null; up(pupil, 'int', 2); return { msg: `${g.name}が兵法書を著し、${pupil.name}に授けた。${pupil.name}の知力 +2`, line: 'これを読めば、戦の理が見えてきましょう' }; } },
    ],
    pol: [
      { name: '名政', run: (g, c) => { pct(c, 'farm', 'farmMax', 0.06); pct(c, 'comm', 'commMax', 0.06); c.loyal = Math.min(100, c.loyal + 4); return { msg: `${g.name}の善政で${c.name}が栄えた。農業・商業 +6%、民忠 +4`, line: '税は軽く、法は公平に。それだけのことです' }; } },
      { name: '法を整える', run: (g, c) => { Game.citiesOf(g.faction).forEach(x => x.loyal = Math.min(100, x.loyal + 3)); const cap = G.cities[G.factions[g.faction].capital]; cap.gold += 150; return { msg: `${g.name}が国の法を整えた。全都市の民忠 +3、${cap.name}の金 +150`, line: '決まりが明らかなら、民は安心して働けます' }; } },
    ],
    cha: [
      { name: '人が慕い集まる', run: (g, c) => { const near = G.gens.filter(x => x.state === 'ronin' && (x.city === c.i || c.adj.includes(x.city)));
          if (near.length) { const r = pick(near); r.city = c.i; r.known = true; return { msg: `${g.name}を慕って、在野の${r.name}が${c.name}を訪ねてきた（登用できる）`, line: 'よく来てくれた。話を聞かせてほしい' }; }
          const v = irnd(10000, 25000); c.pop += v; return { msg: `${g.name}の評判を聞いて、${c.name}に人々が移り住んだ。人口 +${fmt(v)}`, line: '皆、よく来てくれた' }; } },
      { name: '民の喝采', run: (g, c) => { c.loyal = Math.min(100, c.loyal + 10); return { msg: `${g.name}が${c.name}の町を歩くと、民が道に出て喝采した。民忠 +10`, line: '皆の顔を見ると、力が湧いてくる' }; } },
    ],
  };
  function topEvents() {
    const ev = [];
    const map = Game.ranks();
    Object.keys(map).forEach(gi => {
      const g = G.gens[gi];
      if (g.state !== 'serve') return;
      Object.entries(map[gi]).forEach(([k, rank]) => {
        if (Math.random() > (rank === 1 ? 0.09 : 0.06)) return;
        const c = G.cities[g.city];
        const e = pick(TOP_EV[k]);
        const r = e.run(g, c);
        if (!r) return;
        if (mine(g.faction) && ev.length < 3) ev.push({ type: 'good', msg: r.msg, gen: g.i, expr: 'happy', line: r.line, tag: `${Game.TITLE[k][rank === 1 ? 1 : 0]}・${e.name}`, talk: true });
      });
    });
    return ev;
  }

  // ---------------- 大勢力の驕り ----------------
  // 敵の勢力は大きくなるほど、悪い出来事が起きやすく、被害も大きくなる（プレイヤーの勢力はいつも同じ）
  // 都市5つまでは1倍、それを超えると1都市ごとに +0.15倍、最大3倍
  function bigK(fi) {
    if (fi == null || fi < 0 || mine(fi)) return 1;
    const n = Game.citiesOf(fi).length;
    return Math.min(3, 1 + Math.max(0, n - 5) * 0.15);
  }
  // 悪い出来事の被害（下がった数値）を k 倍にする
  const CITY_KEYS = ['gold', 'food', 'troops', 'pop', 'loyal', 'def', 'comm', 'farm', 'train'];
  const GEN_KEYS = ['lead', 'war', 'int', 'pol', 'cha', 'loyalty'];
  function amplify(obj, before, keys, k) {
    if (k <= 1) return;
    keys.forEach(key => {
      const d = before[key] - obj[key];
      const floor = GEN_KEYS.includes(key) && key !== 'loyalty' ? 1 : 0;   // 能力は1より下げない
      if (d > 0) obj[key] = Math.max(floor, Math.round(before[key] - d * k));
    });
    if (before.harvestK !== undefined && obj.harvestK !== undefined && obj.harvestK < (before.harvestK || 1)) obj.harvestK = Math.max(0.3, 1 - (1 - obj.harvestK) * k);
  }
  const snap = (o, keys) => { const b = {}; keys.forEach(k => b[k] = o[k]); b.harvestK = o.harvestK; return b; };
  // 大きくなった勢力だけに起きる災い（季節ごとに 25%×(k−1)、最大60%、1勢力1件まで）
  const BIG_EV = [
    { name: '宮廷の内紛', run: (fi, k) => { const gs = Game.gensOf(fi).filter(g => !g.isLord).sort(() => Math.random() - 0.5).slice(0, 3 + Math.round(k));
        gs.forEach(g => g.loyalty = Math.max(0, g.loyalty - Math.round(8 * k))); return gs.length ? `${G.factions[fi].name}軍の宮廷で派閥争いが起きた。${gs.slice(0, 3).map(g => g.name).join('・')}${gs.length > 3 ? 'ら' : ''}の忠誠が下がった` : null; } },
    { name: '役人の腐敗', run: (fi, k) => { let t = 0; Game.citiesOf(fi).forEach(c => { const v = Math.round(c.gold * 0.12 * k); c.gold -= v; t += v; }); return `広がりすぎた${G.factions[fi].name}軍の領地で、役人の横領がはびこっている。金 -${fmt(t)}`; } },
    { name: '重税への不満', run: (fi, k) => { Game.citiesOf(fi).forEach(c => c.loyal = Math.max(0, c.loyal - Math.round(5 * k))); return `${G.factions[fi].name}軍の戦続きの重税に、民の不満が高まっている。全都市の民忠 -${Math.round(5 * k)}`; } },
    { name: '辺境の兵の疲れ', run: (fi, k) => { const cs = Game.citiesOf(fi).filter(c => c.adj.some(a => G.cities[a].owner !== fi)); cs.forEach(c => { c.troops = Math.round(c.troops * (1 - 0.06 * k)); c.train = Math.max(0, c.train - Math.round(6 * k)); }); return cs.length ? `長い国境を守る${G.factions[fi].name}軍の兵に、疲れが溜まっている。前線の兵 -${Math.round(6 * k)}%・訓練 -${Math.round(6 * k)}` : null; } },
    { name: '兵糧の目減り', run: (fi, k) => { let t = 0; Game.citiesOf(fi).forEach(c => { const v = Math.round(c.food * 0.1 * k); c.food -= v; t += v; }); return `${G.factions[fi].name}軍の遠い輸送路で、兵糧が腐ったり奪われたりしている。兵糧 -${fmt(t)}`; } },
  ];
  function bigEvents() {
    const ev = [];
    G.factions.forEach(f => {
      if (!f.alive || mine(f.i)) return;
      const k = bigK(f.i);
      if (k <= 1 || Math.random() > Math.min(0.6, 0.25 * (k - 1))) return;
      const e = pick(BIG_EV);
      const msg = e.run(f.i, k);
      if (!msg) return;
      Game.log(msg);
      if (ev.length < 1) { const lord = Game.lordOf(f.i); ev.push({ type: 'info', msg, gen: lord ? lord.i : null, expr: 'angry', line: null, tag: `天下の動き・${e.name}`, talk: true }); }
    });
    return ev;
  }

  function weighted(list) { const tot = list.reduce((s, x) => s + x.w, 0); let r = Math.random() * tot; for (const x of list) { if ((r -= x.w) <= 0) return x; } return list[0]; }

  function randomEvents() {
    const ev = [];
    let shown = 0;
    // 都市：季節ごとに各都市5%
    G.cities.forEach(c => {
      if (c.owner === null) return;
      const k = bigK(c.owner);
      // 大きな敵勢力の都市には、悪い出来事が 8%×(k−1) の確率で余分に起きる
      let badOnly = false;
      if (Math.random() > 0.05) { if (k > 1 && Math.random() < 0.08 * (k - 1)) badOnly = true; else return; }
      const cand = CITY.filter(e => (!e.cond || e.cond(c)) && (!badOnly || BAD_CITY.has(e.name)));
      if (!cand.length) return;
      const e = weighted(cand);
      const before = snap(c, CITY_KEYS);
      const r = e.run(c);
      if (!r.good) amplify(c, before, CITY_KEYS, k);
      if (mine(c.owner) && shown < 4) {
        const sp = r.speaker || govOf(c);
        ev.push({ type: r.good ? 'good' : 'warn', msg: r.msg, gen: sp ? sp.i : null, expr: r.expr, line: sp ? r.line : null, tag: e.name, talk: true });
        shown++;
      }
    });
    // 武将：季節ごとに各武将2.5%
    G.gens.forEach(g => {
      if (g.state !== 'serve') return;
      const k = bigK(g.faction);
      let badOnly = false;
      if (Math.random() > 0.025) { if (k > 1 && Math.random() < 0.025 * (k - 1)) badOnly = true; else return; }
      const cand = GEN.filter(e => (!e.cond || e.cond(g)) && (!badOnly || BAD_GEN.has(e.name)));
      if (!cand.length) return;
      const e = weighted(cand);
      const before = snap(g, GEN_KEYS);
      const r = e.run(g);
      // 武将の悪い出来事：忠誠が下がる分だけ k 倍（能力の衰えは同じ）。町の騒ぎ（酒の失敗）は都市の民忠も k 倍
      if (!r.good && k > 1) { amplify(g, before, ['loyalty'], k); if (e.name === '酒の失敗') { const c = G.cities[g.city]; c.loyal = Math.max(0, Math.round(c.loyal - 5 * (k - 1))); } }
      if (mine(g.faction) && shown < 5) { ev.push({ type: r.good ? 'good' : 'warn', msg: r.msg, gen: g.i, expr: r.expr, line: r.line, tag: e.name, talk: true }); shown++; }
    });
    return ev;
  }

  // ---------------- 史実・演義にちなむイベント ----------------
  // cond() が真で、まだ起きていなければ run() を一度だけ実行。chance は季節ごとの発生率
  // 戻り値：{ title, text, gen（語り手の名前）, expr, fac（関係する勢力。プレイヤーなら必ず見せる）, big（天下の動きとして皆に知らせる） }
  const HIST = [
    { id: 'taoyuan', title: '桃園の誓い', chance: 1,
      cond: () => { const f = facOf('劉備'); return f >= 0 && G.year <= 196 && facOf('関羽') === f && facOf('張飛') === f; },
      run: () => { ['劉備', '関羽', '張飛'].forEach(n => { const g = G_(n); up(g, 'cha', 2); if (!g.isLord) g.loyalty = 100; });
        return { title: '桃園の誓い', gen: '劉備', expr: 'happy', fac: facOf('劉備'), text: '「生まれた日は違えども、死す時は同じ日を願わん」\n劉備・関羽・張飛は、義兄弟の契りを改めて固めた。\n三人の魅力 +2、関羽・張飛の忠誠が最大に' }; } },
    { id: 'changan', title: '長安遷都', chance: 0.5,
      cond: () => { const f = facByLord('董卓'); return f >= 0 && G.year >= 190 && owns(f, '洛陽') && owns(f, '長安'); },
      run: () => { const f = facByLord('董卓'), lo = cityByName('洛陽'), ch = cityByName('長安'); const moved = Math.round(lo.pop * 0.4);
        lo.pop -= moved; ch.pop += moved; lo.comm = Math.round(lo.comm * 0.5); lo.loyal = Math.max(0, lo.loyal - 25); ch.comm = Math.min(ch.commMax, Math.round(ch.comm * 1.2));
        G.factions[f].capital = ch.i; up(G_('董卓'), 'cha', -5);
        return { title: '長安遷都', gen: '董卓', expr: 'angry', fac: f, big: true, text: `董卓は洛陽に火を放ち、天子と民を長安へ移した。\n洛陽の商業が半減し民忠 -25、人口 ${fmt(moved)} が長安へ。董卓の魅力 -5` }; } },
    { id: 'wangyun', title: '王允の計', chance: 0.3,
      cond: () => { const f = facByLord('董卓'); const lu = serving('呂布'); const wy = G_('王允'); return f >= 0 && G.year >= 191 && lu && lu.faction === f && wy && wy.state !== 'dead'; },
      run: () => { const f = facByLord('董卓'), dz = G_('董卓'), lu = G_('呂布');
        Game.killGeneral(dz, '暗殺');
        const fac = G.factions[f];
        if (fac.alive) { Game.gensOf(f).forEach(g => { g.isLord = false; }); lu.isLord = true; lu.loyalty = 100; fac.lord = lu.i; lu.succFrom = '董卓'; fac.name = '呂布'; Game.gensOf(f).forEach(g => { if (!g.isLord) g.loyalty = Math.max(0, g.loyalty - 20); }); }
        Game.log('呂布が董卓を討った。');
        return { title: '王允の計', gen: '呂布', expr: 'angry', fac: f, big: true, text: '王允の策により、呂布は義父・董卓に刃を向けた。\n董卓、討たれる。董卓軍は呂布軍となったが、配下の心は揺れている（忠誠 -20）' }; } },
    { id: 'tianzi', title: '天子を奉じる', chance: 0.5,
      cond: () => { const f = facByLord('曹操'); return f >= 0 && G.year >= 196 && (owns(f, '許昌') || owns(f, '洛陽')); },
      run: () => { const f = facByLord('曹操'), cao = G_('曹操'); up(cao, 'cha', 4); Game.gensOf(f).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + 8); });
        const c = cityByName('許昌').owner === f ? cityByName('許昌') : cityByName('洛陽'); c.loyal = Math.min(100, c.loyal + 10); pct(c, 'comm', 'commMax', 0.1);
        return { title: '天子を奉じる', gen: '曹操', expr: 'happy', fac: f, big: true, text: `曹操は流浪の天子を${c.name}に迎えた。\n大義を得た曹操の魅力 +4、配下の忠誠 +8、${c.name}の民忠と商業が上がった` }; } },
    { id: 'tuntian', title: '屯田制', chance: 0.6,
      cond: () => { const f = facByLord('曹操'); return f >= 0 && G.events.hist && G.events.hist.tianzi; },
      run: () => { const f = facByLord('曹操'); Game.citiesOf(f).forEach(c => pct(c, 'farm', 'farmMax', 0.08));
        return { title: '屯田制', gen: serving('荀彧') ? '荀彧' : '曹操', expr: 'happy', fac: f, text: '兵と流民に荒れ地を耕させる屯田制を始めた。\n全都市の農業 +8%' }; } },
    { id: 'qianli', title: '千里行', chance: 0.35,
      cond: () => { const gy = serving('関羽'), fl = facByLord('劉備'); return gy && !gy.isLord && fl >= 0 && gy.faction !== fl && Game.citiesOf(fl).length > 0; },
      run: () => { const gy = G_('関羽'), fl = facByLord('劉備'), old = gy.faction; gy.faction = fl; gy.city = G.factions[fl].capital; gy.loyalty = 100; gy.isLord = false; up(gy, 'cha', 3);
        return { title: '千里行', gen: '関羽', expr: 'angry', fac: old === G.player ? old : fl, big: true, text: `関羽は受けた恩賞をすべて封じて残し、兄・劉備のもとへ千里の道を駆けた。\n関羽が劉備軍に戻った。魅力 +3` }; } },
    { id: 'changban', title: '長坂の単騎駆け', chance: 0.4,
      cond: () => { const f = facByLord('劉備'); return f >= 0 && G.year >= 208 && facOf('趙雲') === f; },
      run: () => { const zy = G_('趙雲'), f = facByLord('劉備'); up(zy, 'cha', 4); up(zy, 'war', 1); zy.loyalty = 100;
        return { title: '長坂の単騎駆け', gen: '趙雲', expr: 'angry', fac: f, text: '乱戦のなか、趙雲はただ一騎で敵中を駆け抜け、主君の幼子を救い出した。\n趙雲の魅力 +4、武力 +1、忠誠が最大に' }; } },
    { id: 'chibi', title: '赤壁の大火', chance: 0.5,
      cond: () => { const fc = facByLord('曹操'); if (fc < 0 || G.year < 208 || G.year > 210 || Game.citiesOf(fc).length < 12) return false;
        return ['周瑜', '諸葛亮', '黄蓋'].some(n => nearFac(n, fc, true)); },
      run: () => { const fc = facByLord('曹操'); const hero = ['周瑜', '黄蓋', '諸葛亮'].find(n => nearFac(n, fc, true)); const fh = facOf(hero);
        const hit = Game.citiesOf(fc).filter(c => c.terrain === 'river' && c.adj.some(a => G.cities[a].owner === fh));
        const k = G.events.chained ? 0.5 : 0.65;
        hit.forEach(c => { c.troops = Math.round(c.troops * k); c.train = Math.max(0, c.train - 20); });
        return { title: '赤壁の大火', gen: hero, expr: 'angry', fac: fh === G.player ? fh : fc, big: true, text: `${G.events.chained ? '鎖でつながれた船団は逃げることもできず――\n' : ''}東南の風に乗せて放たれた火が、曹操軍の船団を焼き尽くした。\n${hit.map(c => c.name).join('・') || '長江沿い'}の曹操軍、兵 -${G.events.chained ? 50 : 35}%・訓練 -20` }; } },
    { id: 'wuhu', title: '五虎大将', chance: 0.5,
      cond: () => { const f = facByLord('劉備'); return f >= 0 && G.year >= 215 && ['関羽', '張飛', '趙雲', '馬超', '黄忠'].filter(n => facOf(n) === f).length >= 4; },
      run: () => { const f = facByLord('劉備'); const five = ['関羽', '張飛', '趙雲', '馬超', '黄忠'].filter(n => facOf(n) === f); five.forEach(n => { const g = G_(n); up(g, 'war', 1); g.loyalty = 100; }); up(G_('劉備'), 'cha', 2);
        return { title: '五虎大将', gen: '劉備', expr: 'happy', fac: f, text: `劉備は${five.join('・')}を五虎大将に任じた。\n各将の武力 +1、忠誠が最大に。劉備の魅力 +2` }; } },
    { id: 'weiwang', title: '魏王', chance: 0.4,
      cond: () => { const f = facByLord('曹操'); return f >= 0 && G.year >= 213 && Game.citiesOf(f).length >= 15; },
      run: () => { const f = facByLord('曹操'); Game.gensOf(f).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + 10); }); up(G_('曹操'), 'cha', 3);
        return { title: '魏王', gen: '曹操', expr: 'happy', fac: f, big: true, text: '曹操は魏王の位に就いた。\n配下の忠誠 +10、曹操の魅力 +3' }; } },
    { id: 'guoHao', title: '建国', chance: 0.4, repeat: true,
      cond: () => G.factions.some(f => f.alive && Game.citiesOf(f.i).length >= 20 && !(G.events.hist && G.events.hist['guo_' + f.i])),
      run: () => { const f = G.factions.find(x => x.alive && Game.citiesOf(x.i).length >= 20 && !(G.events.hist && G.events.hist['guo_' + x.i]));
        G.events.hist['guo_' + f.i] = true;   // 勢力ごとに一度
        const lord = Game.lordOf(f.i); const kuni = { '曹操': '魏', '曹丕': '魏', '劉備': '漢', '劉禅': '漢', '孫権': '呉', '孫策': '呉', '孫堅': '呉', '袁術': '仲' }[lord.name] || lord.name[0];   // 史実で国号を定めた人物以外は姓を国号に
        Game.gensOf(f.i).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + 10); }); Game.citiesOf(f.i).forEach(c => c.loyal = Math.min(100, c.loyal + 5)); up(lord, 'cha', 3);
        return { title: `${kuni}の建国`, gen: lord.name, expr: 'happy', fac: f.i, big: true, text: `${lord.name}は国号を「${kuni}」と定め、帝位に就いた。\n配下の忠誠 +10、全都市の民忠 +5` }; } },
    { id: 'chushi', title: '出師の表', chance: 0.5,
      cond: () => { const f = facByLord('劉禅'); return f >= 0 && facOf('諸葛亮') === f; },
      run: () => { const f = facByLord('劉禅'), z = G_('諸葛亮'); z.loyalty = 100; Game.gensOf(f).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + 10); }); Game.citiesOf(f).filter(c => Game.isFront(c)).forEach(c => c.train = Math.min(100, c.train + 15));
        return { title: '出師の表', gen: '諸葛亮', expr: 'normal', fac: f, big: true, text: '「先帝の遺志を継ぎ、漢室を興さん」\n諸葛亮は出師の表を奉り、北伐を誓った。\n配下の忠誠 +10、前線の訓練 +15' }; } },
    { id: 'qizong', title: '七縦七擒', chance: 0.5,
      cond: () => { const f = facOf('諸葛亮'); const mh = G_('孟獲'); return f >= 0 && (owns(f, '建寧') || owns(f, '雲南')) && mh && (mh.state === 'ronin' || (mh.isLord && Game.citiesOf(mh.faction).length <= 1 && mh.faction !== f && mh.faction !== G.player)); },   // プレイヤーが孟獲なら起きない
      run: () => { const f = facOf('諸葛亮'); const mh = G_('孟獲'); const city = owns(f, '雲南') ? cityByName('雲南') : cityByName('建寧');
        if (mh.isLord) Game.absorbFaction(mh.faction, f);
        ['孟獲', '祝融', '兀突骨'].forEach(n => { const g = G_(n); if (g && (g.state === 'ronin' || g.faction === f)) { Game.joinFaction(g, f, city.i); g.loyalty = 100; } });
        ['建寧', '雲南'].forEach(n => { const c = cityByName(n); if (c.owner === f) c.loyal = Math.min(100, c.loyal + 25); });
        return { title: '七縦七擒', gen: '孟獲', expr: 'sad', fac: f, big: true, text: '七たび捕らえ、七たび放つ。\n諸葛亮の寛大さに心から降った孟獲は、南方の民とともに従った。\n孟獲らが加わり、南方の民忠 +25' }; } },
    { id: 'axmeng', title: '呉下の阿蒙にあらず', chance: 0.4,
      cond: () => { const lm = serving('呂蒙'); return lm && G.year >= 210 && lm.int < 95; },
      run: () => { const lm = G_('呂蒙'); up(lm, 'int', 6);
        return { title: '呉下の阿蒙にあらず', gen: '呂蒙', expr: 'happy', fac: lm.faction, text: '「士、別れて三日なれば、刮目して相待すべし」\n学問に励んだ呂蒙は、見違えるほどの知将となった。\n呂蒙の知力 +6' }; } },
    { id: 'bashi', title: '抜矢啖睛', chance: 0.25,
      cond: () => { const g = serving('夏侯惇'); return g && G.year >= 198; },
      run: () => { const g = G_('夏侯惇'); up(g, 'war', 1); up(g, 'cha', 3);
        return { title: '抜矢啖睛', gen: '夏侯惇', expr: 'angry', fac: g.faction, text: '矢に射抜かれた目を、夏侯惇は矢ごと引き抜いて呑み込み、なおも戦い続けた。\n夏侯惇の武力 +1、魅力 +3' }; } },
    { id: 'liaolai', title: '遼来来', chance: 0.4,
      cond: () => { const g = serving('張遼'); const fs = facByLord('孫権'); return g && fs >= 0 && G.year >= 215 && g.faction !== fs && G.cities[g.city].adj.some(a => G.cities[a].owner === fs); },
      run: () => { const g = G_('張遼'), fs = facByLord('孫権'); up(g, 'lead', 2); up(g, 'cha', 3);
        Game.citiesOf(fs).filter(c => c.adj.some(a => G.cities[a].owner === g.faction)).forEach(c => c.train = Math.max(0, c.train - 10));
        return { title: '遼来来', gen: '張遼', expr: 'angry', fac: g.faction === G.player ? g.faction : fs, text: '張遼はわずかな兵で孫権の大軍に斬り込み、その名は泣く子も黙るほどに恐れられた。\n張遼の統率 +2、魅力 +3。向かい合う孫権軍の訓練 -10' }; } },
    { id: 'dingjun', title: '定軍山', chance: 0.35,
      cond: () => { const g = serving('黄忠'); return g && G.year >= 218; },
      run: () => { const g = G_('黄忠'); up(g, 'war', 1); up(g, 'cha', 5); g.loyalty = Math.min(100, g.loyalty + 10);
        return { title: '定軍山', gen: '黄忠', expr: 'happy', fac: g.faction, text: '老将・黄忠は定軍山で敵将を討ち取る大功を挙げた。\n黄忠の武力 +1、魅力 +5' }; } },
    { id: 'baima', title: '白馬義従', chance: 0.5,
      cond: () => { const f = facByLord('公孫瓚'); return f >= 0 && owns(f, '北平'); },
      run: () => { const f = facByLord('公孫瓚'), c = cityByName('北平'); c.train = Math.min(100, c.train + 20); c.troops += 3000;
        return { title: '白馬義従', gen: '公孫瓚', expr: 'angry', fac: f, text: '公孫瓚は白馬にそろえた精鋭騎兵を率い、北方の異民族を震え上がらせた。\n北平の訓練 +20、兵 +3,000' }; } },
    { id: 'xiaobawang', title: '江東の小覇王', chance: 0.4,
      cond: () => { const g = serving('孫策'); return g && G.year >= 195; },
      run: () => { const g = G_('孫策'); up(g, 'cha', 3); up(g, 'lead', 1); Game.citiesOf(g.faction).forEach(c => { if (['呉', '会稽', '建業', '廬江'].includes(c.name)) c.loyal = Math.min(100, c.loyal + 10); });
        return { title: '江東の小覇王', gen: '孫策', expr: 'happy', fac: g.faction, text: '孫策は破竹の勢いで江東を駆け、人々は「小覇王」と呼んだ。\n孫策の魅力 +3、統率 +1、江東の民忠 +10' }; } },
    { id: 'rushu', title: '入蜀', chance: 0.6,
      cond: () => { const f = facByLord('劉備'); return f >= 0 && owns(f, '成都'); },
      run: () => { const f = facByLord('劉備'), cd = cityByName('成都'); const joined = [];
        ['法正', '黄権', '李厳', '張松', '劉巴'].forEach(n => { const g = G_(n); if (!g || g.state === 'dead' || g.faction === f || g.isLord) return; if (g.state === 'ronin' || Math.random() < 0.6) { Game.joinFaction(g, f, cd.i); joined.push(n); } });
        cd.loyal = Math.min(100, cd.loyal + 10);
        return { title: '入蜀', gen: '劉備', expr: 'happy', fac: f, big: true, text: `劉備は成都に入り、益州の人々を迎え入れた。\n${joined.length ? joined.join('・') + 'が劉備軍に加わった。' : ''}成都の民忠 +10` }; } },
    { id: 'machao', title: '馬超の帰順', chance: 0.4,
      cond: () => { const f = facByLord('劉備'); const g = G_('馬超'); return f >= 0 && G.year >= 213 && g && g.state !== 'dead' && !g.isLord && g.faction !== f && (g.state === 'ronin' || g.loyalty < 75); },
      run: () => { const f = facByLord('劉備'), g = G_('馬超'); Game.joinFaction(g, f, G.factions[f].capital); g.loyalty = 90;
        return { title: '馬超の帰順', gen: '馬超', expr: 'normal', fac: f, text: '行き場を失った錦馬超は、劉備の人柄を慕って帰順した。\n馬超が劉備軍に加わった' }; } },
    { id: 'qibu', title: '七歩の詩', chance: 0.5,
      cond: () => { const cp = serving('曹丕'), cz = serving('曹植'); return cp && cz && cp.faction === cz.faction && G_('曹操').state === 'dead'; },
      run: () => { const cz = G_('曹植'); cz.loyalty = Math.max(0, cz.loyalty - 20); up(cz, 'int', 2);
        return { title: '七歩の詩', gen: '曹植', expr: 'sad', fac: cz.faction, text: '「七歩のうちに詩を作れ。できねば命はない」\n兄に迫られた曹植は、豆と豆がらの詩で兄弟の争いを嘆いた。\n曹植の忠誠 -20、知力 +2' }; } },
    { id: 'huatuo', title: '名医・華佗', chance: 0.03, repeat: true,
      cond: () => G.year >= 190 && G.year <= 208 && Game.gensOf(G.player).length > 0 && (G.events.huatuo || 0) < 2 && (G.events.huatuo = G.events.huatuo || 0) >= 0,
      run: () => { G.events.huatuo = (G.events.huatuo || 0) + 1; const gs = Game.gensOf(G.player); const g = gs.sort((a, b) => (b.wins + b.duels) - (a.wins + a.duels))[0]; up(g, 'war', 1); g.loyalty = Math.min(100, g.loyalty + 5); const c = G.cities[g.city]; c.loyal = Math.min(100, c.loyal + 5);
        return { title: '名医・華佗', gen: g.name, expr: 'happy', fac: G.player, text: `旅の名医・華佗が${c.name}を訪れ、${g.name}の古傷を治した。民の病も診て回った。\n${g.name}の武力 +1・忠誠 +5、${c.name}の民忠 +5` }; } },
    { id: 'huangjin', title: '黄巾の残党', chance: 0.12, repeat: true,
      cond: () => G.year <= 197,
      run: () => { const c = pick(G.cities.filter(x => x.owner !== null && ['runan', 'ye', 'nanpi', 'chenliu', 'xuchang', 'qiao', 'pingyuan', 'puyang'].includes(x.id))); if (!c) return null;
        c.troops = Math.round(c.troops * 0.9); c.loyal = Math.max(0, c.loyal - 10); const g = Math.min(c.gold, 150); c.gold -= g;
        return { title: '黄巾の残党', gen: null, fac: c.owner, text: `黄色い頭巾の残党が${c.name}で蜂起した。\n${c.name}の兵 -10%、民忠 -10、金 -${g}` }; } },
    { id: 'liuyan', title: '劉表の荊州', chance: 0.3,
      cond: () => { const f = facByLord('劉表'); return f >= 0 && Game.citiesOf(f).length >= 5 && G.year >= 195; },
      run: () => { const f = facByLord('劉表'); Game.citiesOf(f).forEach(c => c.loyal = Math.min(100, c.loyal + 6)); Game.citiesOf(f).forEach(c => pct(c, 'comm', 'commMax', 0.05));
        return { title: '荊州の繁栄', gen: '劉表', expr: 'happy', fac: f, text: '戦乱を避けて学者や民が荊州に集まり、学問と商いが栄えた。\n劉表軍の全都市、民忠 +6・商業 +5%' }; } },
  ];

  // ---------------- 特定の人物同士のイベント ----------------
  const same = (...ns) => { const f = facOf(ns[0]); return f >= 0 && ns.every(n => facOf(n) === f) ? f : -1; };
  // 本人のいる都市どうしが隣り合っている（敵どうし）
  const nearPerson = (n1, n2) => { const a = serving(n1), b = serving(n2); return !!(a && b && a.faction !== b.faction && !Game.isAlly(a.faction, b.faction) && G.cities[a.city].adj.includes(b.city)); };
  // 本人のいる都市が、ある勢力の都市（river なら大河沿い）に隣り合っている
  const nearFac = (n, fi, river) => { const a = serving(n); return !!(a && fi >= 0 && a.faction !== fi && G.cities[a.city].adj.some(x => G.cities[x].owner === fi && (!river || G.cities[x].terrain === 'river'))); };
  const adjFac = (fa, fb) => fa >= 0 && fb >= 0 && fa !== fb && Game.citiesOf(fa).some(c => c.adj.some(a => G.cities[a].owner === fb));
  const PAIR_EVENTS = [
    { id: 'lianhuan', title: '連環の計', chance: 0.5,
      cond: () => { const fc = facByLord('曹操'), fp = facOf('龐統'); return fc >= 0 && fp >= 0 && fp !== fc && G.year >= 207 && G.year <= 210 && Game.citiesOf(fc).length >= 12 && nearFac('龐統', fc, true) && !(G.events.hist && G.events.hist.chibi); },
      run: () => { const fc = facByLord('曹操'), fp = facOf('龐統'); G.events.chained = true;
        Game.citiesOf(fc).filter(c => c.terrain === 'river' && c.adj.some(a => G.cities[a].owner === fp)).forEach(c => c.train = Math.max(0, c.train - 10));
        return { title: '連環の計', gen: '龐統', expr: 'normal', fac: fp === G.player ? fp : fc, big: true, text: '「船を鎖でつなげば、揺れに慣れぬ北の兵も陸のように戦えましょう」\n龐統の献策に、曹操は大船団を鎖でつないだ。……それが火に弱いとも知らずに。\n長江沿いの曹操軍の訓練 -10（赤壁の大火が起きると被害が大きくなる）' }; } },
    { id: 'chitu', title: '赤兎馬の贈り物', chance: 0.4,
      cond: () => { const f = facByLord('曹操'); const ly = G_('呂布'); return f >= 0 && facOf('関羽') === f && ly && ly.state === 'dead'; },
      run: () => { const g = G_('関羽'); up(g, 'lead', 1); up(g, 'war', 1);
        return { title: '赤兎馬の贈り物', gen: '関羽', expr: 'happy', fac: g.faction, text: '曹操は関羽の心をつかもうと、名馬・赤兎を贈った。\n関羽「これで兄者の行方が知れれば、一日で駆けつけられる」\n関羽の統率 +1、武力 +1。……曹操は複雑な顔をした' }; } },
    { id: 'shuiyu', title: '水魚の交わり', chance: 0.5,
      cond: () => { const f = facByLord('劉備'); return f >= 0 && facOf('諸葛亮') === f && (facOf('関羽') === f || facOf('張飛') === f); },
      run: () => { const f = facByLord('劉備'); const z = G_('諸葛亮'); z.loyalty = 100; up(z, 'int', 0); up(G_('劉備'), 'cha', 1);
        ['関羽', '張飛'].forEach(n => { const g = serving(n); if (g && g.faction === f) g.loyalty = Math.max(0, g.loyalty - 5); });
        return { title: '水魚の交わり', gen: '劉備', expr: 'happy', fac: f, text: '諸葛亮を片時も離さぬ劉備に、関羽と張飛は不満げだった。\n劉備「私にとって孔明は、魚にとっての水のようなものだ」\n諸葛亮の忠誠が最大に。劉備の魅力 +1。関羽・張飛の忠誠 -5' }; } },
    { id: 'wolong', title: '臥龍と鳳雛', chance: 0.5,
      cond: () => same('諸葛亮', '龐統') >= 0,
      run: () => { ['諸葛亮', '龐統'].forEach(n => up(G_(n), 'int', 1)); const f = facOf('諸葛亮'); Game.lordOf(f) && up(Game.lordOf(f), 'cha', 2);
        return { title: '臥龍と鳳雛', gen: '龐統', expr: 'happy', fac: f, text: '「臥龍・鳳雛、どちらか一人を得れば天下を安んずることができる」\nその二人が、ともに同じ主君のもとに並んだ。\n諸葛亮・龐統の知力 +1、君主の魅力 +2' }; } },
    { id: 'duanjin', title: '断金の交わり', chance: 0.5,
      cond: () => same('孫策', '周瑜') >= 0,
      run: () => { ['孫策', '周瑜'].forEach(n => { const g = G_(n); up(g, 'cha', 2); if (!g.isLord) g.loyalty = 100; });
        return { title: '断金の交わり', gen: '周瑜', expr: 'happy', fac: facOf('孫策'), text: '同じ年に生まれた孫策と周瑜。その固い絆は「金をも断つ」と称された。\n二人の魅力 +2、周瑜の忠誠が最大に' }; } },
    { id: 'zhujiu', title: '煮酒論英雄', chance: 0.5,
      cond: () => { const f = facByLord('曹操'); const lb = serving('劉備'); return f >= 0 && lb && lb.faction === f && !lb.isLord; },
      run: () => { const f = facByLord('曹操'), lb = G_('劉備'), c = G.cities[lb.city];
        const text0 = '曹操「今、天下の英雄といえば、君とわしだけよ」\n思わず箸を落とした劉備は、雷鳴に驚いたふりをしてごまかした……。\n';
        if (c.i === G.factions[f].capital || c.owner !== f) { lb.loyalty = Math.max(0, lb.loyalty - 30); return { title: '煮酒論英雄', gen: '曹操', expr: 'normal', fac: f, text: text0 + '劉備の忠誠 -30' }; }
        // 劉備は都市を手に独立する（関羽・張飛もついていく）
        const nf = { i: G.factions.length, name: '劉備', color: '#2f8a4e', lord: lb.i, alive: true, capital: c.i, allies: {}, isPlayer: false, hostility: {} };
        G.factions.push(nf); lb.faction = nf.i; lb.isLord = true; lb.loyalty = 100; c.owner = nf.i;
        ['関羽', '張飛', '趙雲', '簡雍', '孫乾', '糜竺'].forEach(n => { const g = serving(n); if (g && g.faction === f) { g.faction = nf.i; g.city = c.i; g.loyalty = 90; } });
        Game.gensIn(c.i, f).forEach(g => { g.city = G.factions[f].capital; });
        return { title: '煮酒論英雄', gen: '劉備', expr: 'normal', fac: f, big: true, text: text0 + `その後、劉備は${c.name}で曹操に背き、独立した` }; } },
    { id: 'jisheng', title: '既生瑜、何生亮', chance: 0.3,
      cond: () => nearPerson('周瑜', '諸葛亮'),
      run: () => { const z = G_('周瑜'); up(z, 'int', 1); z.loyalty = Math.min(100, z.loyalty + 5);
        return { title: '既生瑜、何生亮', gen: '周瑜', expr: 'angry', fac: z.faction === G.player ? z.faction : facOf('諸葛亮'), text: '周瑜「天はなぜ、この周瑜を生みながら、諸葛亮まで生んだのか！」\n好敵手の存在が、周瑜をさらに奮い立たせた。周瑜の知力 +1' }; } },
    { id: 'rival', title: '宿命の好敵手', chance: 0.4,
      cond: () => nearPerson('諸葛亮', '司馬懿'),
      run: () => { ['諸葛亮', '司馬懿'].forEach(n => { const g = G_(n); up(g, 'lead', 1); up(g, 'int', 1); });
        return { title: '宿命の好敵手', gen: '司馬懿', expr: 'normal', fac: facOf('司馬懿') === G.player ? G.player : facOf('諸葛亮'), big: true, text: '司馬懿「孔明……ようやく相まみえることになったか」\n天下の二大軍師が国境を挟んで向かい合った。\n諸葛亮・司馬懿の統率 +1、知力 +1' }; } },
    { id: 'baiyi', title: '白衣渡江', chance: 0.3,
      cond: () => nearPerson('関羽', '呂蒙'),
      run: () => { const gy = G_('関羽'), lm = G_('呂蒙'), c = G.cities[gy.city]; c.loyal = Math.max(0, c.loyal - 20); c.def = Math.round(c.def * 0.8);
        return { title: '白衣渡江', gen: '呂蒙', expr: 'normal', fac: gy.faction === G.player ? gy.faction : lm.faction, big: true, text: `呂蒙は兵に商人の白い衣を着せて川を渡り、関羽の守る${c.name}の見張りを次々と押さえた。\n${c.name}の民忠 -20、城壁 -20%` }; } },
    { id: 'marriage', title: '政略結婚', chance: 0.4,
      cond: () => { const fs = facByLord('孫権'), fl = facByLord('劉備'); const x = G_('孫尚香'); return fs >= 0 && fl >= 0 && Game.isAlly(fs, fl) && x && x.state === 'serve' && x.faction === fs; },
      run: () => { const fs = facByLord('孫権'), fl = facByLord('劉備'); G.factions[fs].allies[fl] += 8; G.factions[fl].allies[fs] += 8; const x = G_('孫尚香'); x.faction = fl; x.city = G.factions[fl].capital; x.loyalty = 80;
        return { title: '政略結婚', gen: '孫尚香', expr: 'happy', fac: fs === G.player ? fs : fl, big: true, text: '同盟の証として、孫権の妹・孫尚香が劉備のもとへ嫁いだ。\n孫権軍と劉備軍の同盟が2年延びた。孫尚香が劉備軍に加わった' }; } },
  ];
  HIST.push(...PAIR_EVENTS);

  // 同じ都市に集まると起きやすいイベント
  const MEET = [
    { id: 'taoyuan', who: ['劉備', '関羽', '張飛'] }, { id: 'shuiyu', who: ['劉備', '諸葛亮'] }, { id: 'wolong', who: ['諸葛亮', '龐統'] },
    { id: 'duanjin', who: ['孫策', '周瑜'] }, { id: 'chitu', who: ['曹操', '関羽'] },
  ];
  // 本人が敵の隣に立つと起きるイベント（mine 側の人物を動かす。foe は人物名か、'@勢力の君主名'。river は大河沿いの都市に限る）
  const FACE = [
    { id: 'jisheng', mine: '周瑜', foe: '諸葛亮' }, { id: 'jisheng', mine: '諸葛亮', foe: '周瑜' },
    { id: 'rival', mine: '諸葛亮', foe: '司馬懿' }, { id: 'rival', mine: '司馬懿', foe: '諸葛亮' },
    { id: 'baiyi', mine: '呂蒙', foe: '関羽' },
    { id: 'lianhuan', mine: '龐統', foe: '@曹操', river: true, year: [207, 210] }, { id: 'chibi', mine: '周瑜', foe: '@曹操', river: true, year: [208, 210] }, { id: 'chibi', mine: '黄蓋', foe: '@曹操', river: true, year: [208, 210] },
    { id: 'liaolai', mine: '張遼', foe: '@孫権', year: [215, 999] },
  ];

  function histEvents() {
    G.events.hist = G.events.hist || {};
    const ev = [];
    for (const h of HIST) {
      if (!h.repeat && G.events.hist[h.id]) continue;
      let ok = false;
      try { ok = h.cond(); } catch (e) { ok = false; }
      let ch = h.chance;
      const meet = MEET.find(m => m.id === h.id);
      if (meet) { const gs = meet.who.map(serving); ch *= gs.every(g => g && g.city === gs[0].city) ? 1.6 : 0.35; }   // 同じ都市に集まっていると起きやすい
      if (!ok || Math.random() > Math.min(1, ch)) continue;
      let r = null;
      try { r = h.run(); } catch (e) { console.error('event', h.id, e); }
      if (!h.repeat) G.events.hist[h.id] = true;
      if (!r) continue;
      Game.log(`【${r.title}】${r.text.split('\n')[0]}`);
      const show = r.fac === G.player || r.big;
      if (show) {
        const g = r.gen ? G_(r.gen) : null;
        ev.push({ type: 'hist', title: r.title, msg: r.text, gen: g ? g.i : null, expr: r.expr || 'normal', tag: r.fac === G.player ? '史実' : '天下の動き', talk: true, hist: true });
      }
    }
    return ev;
  }


  // ---------------- 即位（公→王→皇帝） ----------------
  // 都市が一定数に達すると、家臣の勧めで君主が位に就く。位は勢力に残り、跡継ぎも引き継ぐ。
  // 効果：家臣の忠誠＋、全都市の民忠＋、君主の魅力＋。合戦では位に応じて士気が上がる（battle.js）
  const RANKS = [null, { n: 10, t: '公' }, { n: 16, t: '王' }, { n: 24, t: '皇帝' }];
  const STATE = { 曹操: '魏', 曹丕: '魏', 劉備: '漢', 劉禅: '漢', 孫堅: '呉', 孫策: '呉', 孫権: '呉', 袁紹: '冀', 袁術: '仲', 劉表: '楚', 劉璋: '蜀', 馬騰: '涼', 馬超: '涼', 公孫瓚: '燕', 呂布: '徐', 董卓: '秦', 張魯: '漢寧', 孟獲: '南蛮', 陶謙: '徐', 孔融: '北海' };
  const rankName = fi => { const f = G.factions[fi]; return f && f.rank ? (f.rank === 3 ? '皇帝' : f.state + RANKS[f.rank].t) : ''; };
  const CROWN_LINES = {
    曹操: ['わしが{t}か。……天下はまだ定まっておらん。浮かれるでないぞ', '覇道はここからよ。{t}の名に恥じぬ働きをせよ'],
    劉備: ['私のような者が{t}とは……。いや、民のため、漢室のため、謹んでお受けしよう', '桃園で誓った志、ようやくここまで来た。皆のおかげだ'],
    孫権: ['父上、兄上……。孫家の志、この孫権が{t}として継ぎます', '江東の地を守り抜いてくれた皆に感謝する'],
    袁術: ['ふはは！ やはり天命はこの袁術にあったのだ！'],
    袁紹: ['名門袁家の当主として、当然の位よ'],
    呂布: ['{t}だと？ 面倒だが……悪くはない'],
  };
  const LORD_BY_TRAIT = [['仁徳', '私には過ぎた位だが……民が安らぐのなら、受けよう'], ['野心', '待ちわびたぞ。これで天下に号令をかけられる'], ['猪突', 'がはは！ {t}か！ よし、次は天下だ！'], ['_', '皆の推挙とあらば、謹んで{t}の位に就こう']];
  const ADVISE = ['殿、今や我が軍は{n}の城を治めております。もはや一勢力の主ではございません。{t}の位にお就きください', '天下の人心は殿に集まっております。{t}を称し、大義を明らかになさいませ', '諸将も民も、殿の即位を待ち望んでおります。どうか{t}に'];
  function crownEvents() {
    const ev = [];
    G.factions.forEach(f => {
      if (!f.alive) return;
      const n = Game.citiesOf(f.i).length, cur = f.rank || 0, now = G.year * 4 + G.season;
      if (f.rankAt == null) f.rankAt = now;            // ゲーム開始時点から数える
      if (cur >= 3 || n < RANKS[cur + 1].n || now - f.rankAt < 4) return;   // 位が上がるのは1年に1段まで
      f.rankAt = now;
      const lord = Game.lordOf(f.i);
      if (!f.state) f.state = STATE[lord.name] || (G.cities[f.capital] ? G.cities[f.capital].name[0] : lord.name[0]);
      f.rank = cur + 1;
      const title = rankName(f.i), full = f.rank === 3 ? `${f.state}の皇帝` : title;
      // 効果
      Game.gensOf(f.i).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + 6 + f.rank * 2); });
      Game.citiesOf(f.i).forEach(c => { c.loyal = Math.min(100, c.loyal + 4 + f.rank * 2); });
      up(lord, 'cha', f.rank + 1);
      Game.log(`【即位】${lord.name}が${full}に即位した`);
      if (mine(f.i)) {
        const adv = (G.strategist != null && G.gens[G.strategist] && G.gens[G.strategist].faction === f.i && !G.gens[G.strategist].isLord) ? G.gens[G.strategist] : Game.gensOf(f.i).filter(g => !g.isLord).sort((a, b) => (b.int + b.cha) - (a.int + a.cha))[0];
        const fill = t => t.replace('{t}', full).replace('{n}', n);
        if (adv) ev.push({ type: 'hist', title: `${full}即位の勧め`, msg: `${adv.name}「${fill(pick(ADVISE))}」`, gen: adv.i, expr: 'happy', tag: '即位', talk: true, hist: true, se: 'bell' });
        const tl = CROWN_LINES[lord.name] || [(LORD_BY_TRAIT.find(([k]) => k === '_' || Game.has(lord, k)) || LORD_BY_TRAIT[3])[1]];
        ev.push({ type: 'hist', title: `${full}即位`, msg: `${lord.name}「${fill(pick(tl))}」\n${lord.name}は${full}の位に就いた！\n<small>家臣の忠誠・全都市の民忠が上がった。合戦では将兵の士気が上がる</small>`, gen: lord.i, expr: 'happy', tag: '即位', talk: true, hist: true, se: 'coronation' });
      } else if (f.rank >= 2) {
        ev.push({ type: 'hist', title: '天下の動き', msg: `${lord.name}が${full}を称した！\n${f.rank === 3 ? '天下に二人の天子はいらぬ——群雄は色めき立っている' : '勢いを増す' + lord.name + '軍に、諸侯は警戒を強めている'}`, gen: lord.i, expr: 'happy', tag: '天下の動き', talk: true, hist: true });
      }
    });
    return ev;
  }

  return {
    run() { return [...crownEvents(), ...histEvents(), ...topEvents(), ...randomEvents(), ...bigEvents()]; },
    bigK,
    rankName,
    counts: () => ({ city: CITY.length, gen: GEN.length, hist: HIST.length }),
    MEET, FACE,
    _HIST: HIST,
  };
})();
