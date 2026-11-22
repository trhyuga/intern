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
    { name: '逃亡兵の続出', run: (fi, k) => { let t = 0; Game.citiesOf(fi).forEach(c => { const v = Math.round(c.troops * 0.04 * k); c.troops -= v; t += v; }); return `${G.factions[fi].name}軍では、遠い戦地へ送られるのを嫌って逃げ出す兵が後を絶たない。兵 -${fmt(t)}`; } },
    { name: '兵糧の目減り', run: (fi, k) => { let t = 0; Game.citiesOf(fi).forEach(c => { const v = Math.round(c.food * 0.1 * k); c.food -= v; t += v; }); return `${G.factions[fi].name}軍の遠い輸送路で、兵糧が腐ったり奪われたりしている。兵糧 -${fmt(t)}`; } },
  ];
  function bigEvents() {
    const ev = [];
    G.factions.forEach(f => {
      if (!f.alive || mine(f.i)) return;
      const k = bigK(f.i);
      if (k <= 1) return;
      // 大軍を養いきれず、毎季節すこしずつ兵が散っていく（都市18以上で各都市の兵 −2%）
      Game.citiesOf(f.i).forEach(c => { c.troops = Math.round(c.troops * (1 - 0.01 * (k - 1))); });
      if (Math.random() > Math.min(0.6, 0.25 * (k - 1))) return;
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
        // 跡継ぎは、ふつうの継承ではなく呂布（君主の死の知らせも呂布に直す）
        if (G._lordDied && G._lordDied.length) { const d = G._lordDied[G._lordDied.length - 1]; if (d.gi === dz.i) d.heir = lu.i; }
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
        ['法正', '黄権', '李厳', '張松', '劉巴'].forEach(n => { const g = G_(n); if (!g || (g.state !== 'ronin' && g.state !== 'serve') || g.faction === f || g.isLord) return; if (g.state === 'ronin' || Math.random() < 0.6) { Game.joinFaction(g, f, cd.i); joined.push(n); } });
        cd.loyal = Math.min(100, cd.loyal + 10);
        return { title: '入蜀', gen: '劉備', expr: 'happy', fac: f, big: true, text: `劉備は成都に入り、益州の人々を迎え入れた。\n${joined.length ? joined.join('・') + 'が劉備軍に加わった。' : ''}成都の民忠 +10` }; } },
    { id: 'machao', title: '馬超の帰順', chance: 0.4,
      cond: () => { const f = facByLord('劉備'); const g = G_('馬超'); return f >= 0 && G.year >= 213 && g && g.state !== 'dead' && !g.isLord && g.faction !== f && (g.state === 'ronin' || g.loyalty < 75); },
      run: () => { const f = facByLord('劉備'), g = G_('馬超'), old = g.faction; Game.joinFaction(g, f, G.factions[f].capital); g.loyalty = 90;
        return { title: '馬超の帰順', gen: '馬超', expr: 'normal', fac: old === G.player ? old : f, text: '行き場を失った錦馬超は、劉備の人柄を慕って帰順した。\n馬超が劉備軍に加わった' }; } },
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

  // ---------------- 君主ごとのイベント（選べる全君主） ----------------
  // その君主の特徴・こだわりにちなむ。史実にもとづくものと、史実と違う展開がある。
  // 史実の部分は、君主紹介（flavor.js の LORD_BIO）と同じ、よく知られた逸話にもとづく
  const LF = n => facByLord(n);
  const capOf = fi => G.cities[G.factions[fi].capital];
  const joinIf = (n, fi, ci) => { const g = G_(n); if (g && g.state === 'ronin') { Game.joinFaction(g, fi, ci); return g; } return null; };
  const allyWith = (a, b) => { G.factions[a].allies[b] = CONFIG.ALLY_TURNS; G.factions[b].allies[a] = CONFIG.ALLY_TURNS; };
  const LORD_EVENTS = [
    { id: 'l_dongzhuo', title: '郿塢の蓄え', chance: 0.4, cond: () => { const f = LF('董卓'); return f >= 0 && owns(f, '長安'); },
      run: () => { const f = LF('董卓'), c = cityByName('長安'); c.food += 15000; c.gold += 1000; Game.citiesOf(f).forEach(x => x.loyal = Math.max(0, x.loyal - 5));
        return { title: '郿塢の蓄え', gen: '董卓', expr: 'happy', fac: f, text: '董卓は長安の西に城塞・郿塢を築き、三十年分ともいわれる穀物と財宝を蓄えた。\n長安の兵糧 +15000・金 +1000。ただし取り立ての厳しさに、全都市の民忠 −5' }; } },
    { id: 'l_yuanshao', title: '河北四州の盟主', chance: 0.4, cond: () => { const f = LF('袁紹'); return f >= 0 && owns(f, '鄴') && owns(f, '南皮') && Game.citiesOf(f).length >= 4; },
      run: () => { const f = LF('袁紹'), l = Game.lordOf(f); Game.gensOf(f).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + 6); }); up(l, 'cha', 2);
        return { title: '河北四州の盟主', gen: '袁紹', expr: 'happy', fac: f, text: '鄴と南皮を押さえた袁紹のもとに、河北の名士と兵が集まった。名門袁家の威光は、いま頂点にある。\n袁紹の魅力 +2、家臣の忠誠 +6' }; } },
    { id: 'l_hanfu', title: '冀州は譲らぬ', chance: 0.5, cond: () => { const f = LF('韓馥'); return f >= 0 && owns(f, '鄴') && G.year >= 191; },
      run: () => { const f = LF('韓馥'), l = Game.lordOf(f), c = cityByName('鄴'); up(l, 'lead', 3); up(l, 'int', 2); c.def = Math.min(c.defMax, c.def + 150);
        return { title: '冀州は譲らぬ', gen: '韓馥', expr: 'angry', fac: f, text: '袁紹の使者が、冀州を明け渡すよう迫ってきた。韓馥は使者を追い返した――\n韓馥「冀州の民を、名門の看板ひとつで明け渡してなるものか！」\n韓馥の統率 +3・知力 +2、鄴の城壁 +150' }; } },
    { id: 'l_caocao', title: '求賢令', chance: 0.4, cond: () => { const f = LF('曹操'); return f >= 0 && Game.citiesOf(f).length >= 6; },
      run: () => { const f = LF('曹操'), cap = capOf(f); const rs = shuffle(G.gens.filter(g => g.state === 'ronin' && g.name !== '諸葛亮')).slice(0, 3); rs.forEach(g => { g.city = cap.i; g.known = true; }); up(Game.lordOf(f), 'pol', 1);
        return { title: '求賢令', gen: '曹操', expr: 'happy', fac: f, text: '曹操「才ある者なら、出自も品行も問わぬ。我がもとへ来たれ」\n曹操は天下に賢者を求める令を発した。\n' + (rs.length ? `在野の${rs.map(g => g.name).join('・')}が${cap.name}を訪ねてきた（登用できる）。` : '') + '曹操の政治 +1' }; } },
    { id: 'l_liubei', title: '民を見捨てず', chance: 0.4, cond: () => { const f = LF('劉備'); return f >= 0 && Game.citiesOf(f).length <= 3 && G.year >= 195; },
      run: () => { const f = LF('劉備'); Game.citiesOf(f).forEach(c => c.loyal = Math.min(100, c.loyal + 10)); up(Game.lordOf(f), 'cha', 2); Game.gensOf(f).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + 5); });
        return { title: '民を見捨てず', gen: '劉備', expr: 'normal', fac: f, text: '劉備「大事を成すには、人をもって本とする。慕ってくる民を、どうして捨てられようか」\n追われる身にあっても民を連れて歩む劉備の姿に、人々の心は離れなかった。\n全都市の民忠 +10、劉備の魅力 +2、家臣の忠誠 +5' }; } },
    { id: 'l_gongsunzan', title: '易京の楼', chance: 0.4, cond: () => { const f = LF('公孫瓚'); return f >= 0 && (owns(f, '薊') || owns(f, '北平')); },
      run: () => { const f = LF('公孫瓚'), c = owns(f, '薊') ? cityByName('薊') : cityByName('北平'); c.def = Math.min(c.defMax, c.def + 200); c.food += 6000;
        return { title: '易京の楼', gen: '公孫瓚', expr: 'normal', fac: f, text: `公孫瓚は易京に幾重もの堀と高い楼を築き、守りを固めた。\n${c.name}の城壁 +200・兵糧 +6000` }; } },
    { id: 'l_liuyu', title: '恩と信義', chance: 0.45, cond: () => { const f = LF('劉虞'); return f >= 0 && G.year >= 191; },
      run: () => { const f = LF('劉虞'), cap = capOf(f); Game.citiesOf(f).forEach(c => c.loyal = Math.min(100, c.loyal + 12)); cap.troops += 3000; up(Game.lordOf(f), 'cha', 2);
        return { title: '恩と信義', gen: '劉虞', expr: 'happy', fac: f, text: `劉虞の恩と信義に感じ入った北方の異民族が、友好の証として騎兵を送ってきた。\n全都市の民忠 +12、${cap.name}の兵 +3000、劉虞の魅力 +2` }; } },
    { id: 'l_sunjian', title: '伝国の玉璽', chance: 0.6, cond: () => { const f = LF('孫堅'); return f >= 0 && owns(f, '洛陽'); },
      run: () => { const f = LF('孫堅'); up(Game.lordOf(f), 'cha', 4); Game.gensOf(f).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + 5); });
        return { title: '伝国の玉璽', gen: '孫堅', expr: 'happy', fac: f, big: true, text: '焼け落ちた洛陽の井戸から、五色の光が立ちのぼった。引き上げると、それは天子の印・伝国の玉璽であった。\n孫堅の魅力 +4、家臣の忠誠 +5' }; } },
    { id: 'l_yuanshu', title: '仲の皇帝', chance: 0.5, cond: () => { const f = LF('袁術'); return f >= 0 && owns(f, '寿春') && G.year >= 196; },
      run: () => { const f = LF('袁術'), l = Game.lordOf(f); up(l, 'cha', 3); capOf(f).gold += 1500; Game.citiesOf(f).forEach(c => c.loyal = Math.max(0, c.loyal - 8));
        return { title: '仲の皇帝', gen: '袁術', expr: 'happy', fac: f, big: true, text: '袁術「玉璽はわが手にある。天命は袁家に下ったのだ！」\n袁術は寿春で皇帝を名乗り、国号を「仲」とした。\n袁術の魅力 +3、本拠の金 +1500。ただし宮殿造りの重税に、全都市の民忠 −8' }; } },
    { id: 'l_liubiao', title: '荊州の学府', chance: 0.4, cond: () => { const f = LF('劉表'); return f >= 0 && owns(f, '襄陽'); },
      run: () => { const f = LF('劉表'), c = cityByName('襄陽'); const rs = shuffle(G.gens.filter(g => g.state === 'ronin' && g.name !== '諸葛亮')).slice(0, 2); rs.forEach(g => { g.city = c.i; g.known = true; }); shuffle(Game.gensOf(f).filter(g => g.int < 95)).slice(0, 3).forEach(g => up(g, 'int', 1));
        return { title: '荊州の学府', gen: '劉表', expr: 'happy', fac: f, text: '劉表は襄陽に学校を開き、学者を招いて書物を整えさせた。戦乱を逃れた知識人が次々と荊州に集まる。\n' + (rs.length ? `在野の${rs.map(g => g.name).join('・')}が襄陽を訪ねてきた（登用できる）。` : '') + '家臣3人の知力 +1' }; } },
    { id: 'l_liuyan', title: '州牧の力', chance: 0.4, cond: () => { const f = LF('劉焉'); return f >= 0 && owns(f, '成都'); },
      run: () => { const f = LF('劉焉'); Game.citiesOf(f).forEach(c => c.def = Math.min(c.defMax, c.def + 60)); up(Game.lordOf(f), 'pol', 2);
        return { title: '州牧の力', gen: '劉焉', expr: 'normal', fac: f, text: '州牧として兵も税も一手に握った劉焉は、険しい山々に守られた益州で着々と力を蓄えた。\n全都市の城壁 +60、劉焉の政治 +2' }; } },
    { id: 'l_zhanglu', title: '義舎', chance: 0.45, cond: () => { const f = LF('張魯'); return f >= 0 && owns(f, '漢中'); },
      run: () => { const f = LF('張魯'); Game.citiesOf(f).forEach(c => { c.loyal = Math.min(100, c.loyal + 10); c.food += 3000; });
        return { title: '義舎', gen: '張魯', expr: 'happy', fac: f, text: '張魯は道すがらに米や肉を置いた「義舎」を設け、旅人が必要な分だけ食べられるようにした。漢中の民は張魯を慕っている。\n全都市の民忠 +10・兵糧 +3000' }; } },
    { id: 'l_mateng', title: '西涼の鉄騎', chance: 0.45, cond: () => { const f = LF('馬騰'); return f >= 0 && owns(f, '武威'); },
      run: () => { const f = LF('馬騰'); Game.citiesOf(f).forEach(c => c.train = Math.min(100, c.train + 10)); up(Game.lordOf(f), 'lead', 2); const mc = serving('馬超'); if (mc && mc.faction === f) mc.loyalty = Math.min(100, mc.loyalty + 15);
        return { title: '西涼の鉄騎', gen: '馬騰', expr: 'angry', fac: f, text: '羌族にも慕われる馬騰のもとに、西涼の荒々しい騎兵が集った。\n全都市の訓練 +10、馬騰の統率 +2' + (mc && mc.faction === f ? '、馬超の忠誠 +15' : '') }; } },
    { id: 'l_taoqian', title: '徐州を託す', chance: 0.5, cond: () => { const f = LF('陶謙'); const lb = G_('劉備'), fl = LF('劉備'); return f >= 0 && G.year >= 193 && lb && (lb.state === 'ronin' || (fl >= 0 && fl !== f && !Game.isAlly(f, fl))); },
      run: () => { const f = LF('陶謙'), cap = capOf(f), lb = G_('劉備');
        if (lb.state === 'ronin') { const j = ['劉備', '関羽', '張飛'].map(n => joinIf(n, f, cap.i)).filter(Boolean); j.forEach(g => g.loyalty = Math.max(g.loyalty, 85));
          return { title: '徐州を託す', gen: '陶謙', expr: 'happy', fac: f, text: '陶謙は、流浪の身の劉備を徐州に招いた――\n陶謙「わしは老いた。徐州の民を、そなたの仁徳で守ってやってくれ」\n' + `${j.map(g => g.name).join('・')}が陶謙軍に加わった` }; }
        const fl = LF('劉備'); allyWith(f, fl); up(Game.lordOf(f), 'cha', 2);
        return { title: '徐州を託す', gen: '陶謙', expr: 'happy', fac: f, text: '陶謙は劉備のもとへ使者を送り、固い盟を結んだ――\n陶謙「劉玄徳どのの仁徳を、わしは信じておる」\n陶謙軍と劉備軍が同盟、陶謙の魅力 +2' }; } },
    { id: 'l_kongrong', title: '梨を譲る心', chance: 0.4, cond: () => { const f = LF('孔融'); return f >= 0 && G.year >= 191; },
      run: () => { const f = LF('孔融'), cap = capOf(f); up(Game.lordOf(f), 'cha', 3); Game.gensOf(f).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + 6); }); const rs = shuffle(G.gens.filter(g => g.state === 'ronin' && g.name !== '諸葛亮' && g.int >= 60)).slice(0, 2); rs.forEach(g => { g.city = cap.i; g.known = true; });
        return { title: '梨を譲る心', gen: '孔融', expr: 'happy', fac: f, text: '幼い日に大きな梨を兄に譲った孔融。その謙譲の心と学識を慕って、文人たちが北海に集まった。\n孔融の魅力 +3、家臣の忠誠 +6' + (rs.length ? `、在野の${rs.map(g => g.name).join('・')}が訪ねてきた（登用できる）` : '') }; } },
    { id: 'l_gongsundu', title: '遼東の王', chance: 0.45, cond: () => { const f = LF('公孫度'); return f >= 0 && owns(f, '襄平'); },
      run: () => { const f = LF('公孫度'), c = cityByName('襄平'); c.def = Math.min(c.defMax, c.def + 150); c.troops += 4000; up(Game.lordOf(f), 'lead', 2);
        return { title: '遼東の王', gen: '公孫度', expr: 'normal', fac: f, text: '中原の戦乱をよそに、公孫度は遼東で自立し、高句麗や烏桓とも渡り合って北の果てに独自の国を築いた。\n襄平の城壁 +150・兵 +4000、公孫度の統率 +2' }; } },
    { id: 'l_wanglang', title: '経書の講義', chance: 0.4, cond: () => { const f = LF('王朗'); return f >= 0 && G.year >= 191; },
      run: () => { const f = LF('王朗'); up(Game.lordOf(f), 'pol', 2); shuffle(Game.gensOf(f).filter(g => !g.isLord)).slice(0, 3).forEach(g => { up(g, 'int', 1); up(g, 'pol', 1); });
        return { title: '経書の講義', gen: '王朗', expr: 'normal', fac: f, text: '経書に通じた王朗は、配下の将にも学問を説いた。武骨な将たちも、少しずつ書を読むようになった。\n王朗の政治 +2、家臣3人の知力・政治 +1' }; } },
    { id: 'l_yanbaihu', title: '東呉の徳王', chance: 0.45, cond: () => { const f = LF('厳白虎'); return f >= 0 && owns(f, '呉'); },
      run: () => { const f = LF('厳白虎'), c = cityByName('呉'); c.troops += 5000; up(Game.lordOf(f), 'war', 2);
        return { title: '東呉の徳王', gen: '厳白虎', expr: 'angry', fac: f, text: '厳白虎「江東は我ら厳家のものよ。若造の孫策などに渡すものか！」\n厳白虎は「東呉の徳王」を名乗り、呉郡の豪族たちを束ねた。\n呉の兵 +5000、厳白虎の武力 +2' }; } },
    { id: 'l_liuyao', title: '同郷のよしみ', chance: 0.5, cond: () => { const f = LF('劉繇'); const t = G_('太史慈'); return f >= 0 && t && (t.state === 'ronin' || (t.state === 'serve' && t.faction === f)); },
      run: () => { const f = LF('劉繇'), t = G_('太史慈'); if (t.state === 'ronin') Game.joinFaction(t, f, capOf(f).i); t.loyalty = Math.max(t.loyalty, 90); up(Game.lordOf(f), 'cha', 1);
        return { title: '同郷のよしみ', gen: '太史慈', expr: 'happy', fac: f, text: '劉繇「子義（太史慈）よ、同郷のよしみだ。そなたの武勇、存分に振るってくれ」\n劉繇は太史慈を重く用い、その力を信じた。\n太史慈が劉繇軍の将として奮い立った（忠誠 90以上）' }; } },
    { id: 'l_zhangyan', title: '飛燕、百万を号す', chance: 0.45, cond: () => { const f = LF('張燕'); return f >= 0 && G.year >= 191; },
      run: () => { const f = LF('張燕'), cap = capOf(f); cap.troops += 6000; const l = Game.lordOf(f); up(l, 'war', 1); up(l, 'lead', 1);
        return { title: '飛燕、百万を号す', gen: '張燕', expr: 'angry', fac: f, text: `山々に散る黒山の衆が、「飛燕」張燕のもとに続々と集まってきた。\n${cap.name}の兵 +6000、張燕の武力・統率 +1` }; } },
    { id: 'l_lubu', title: '轅門射戟', chance: 0.4, cond: () => { const f = LF('呂布'), fl = LF('劉備'); return f >= 0 && fl >= 0 && fl !== f && !Game.isAlly(f, fl) && G.year >= 195; },
      run: () => { const f = LF('呂布'), fl = LF('劉備'); allyWith(f, fl); up(Game.lordOf(f), 'cha', 2);
        return { title: '轅門射戟', gen: '呂布', expr: 'happy', fac: f, big: true, text: '呂布「わしが門に立てた戟の小枝を一矢で射抜いたら、この戦はやめてもらおう」\n呂布の矢は見事に小枝を射抜き、劉備と袁術軍の争いは収まった。これを機に、呂布は劉備と手を結んだ――\n呂布軍と劉備軍が同盟、呂布の魅力 +2' }; } },
    { id: 'l_sunce', title: '神亭の一騎討ち', chance: 0.5, cond: () => { const f = LF('孫策'); const t = G_('太史慈'); return f >= 0 && t && (t.state === 'ronin' || (t.state === 'serve' && t.faction !== f && !t.isLord && Game.citiesOf(t.faction).length <= 2)); },
      run: () => { const f = LF('孫策'), t = G_('太史慈'); Game.joinFaction(t, f, capOf(f).i); t.loyalty = 95; up(Game.lordOf(f), 'cha', 1);
        return { title: '神亭の一騎討ち', gen: '太史慈', expr: 'happy', fac: f, big: true, text: '神亭で一騎討ちを演じ、互いの武勇を認め合った孫策と太史慈。\n孫策「子義、おぬしほどの男を敵にしておくのは惜しい。わしと共に来い」\n太史慈が孫策軍に加わった' }; } },
    { id: 'l_zhangxiu', title: '賈詡の献策', chance: 0.45, cond: () => { const f = LF('張繍'); return f >= 0 && facOf('賈詡') === f; },
      run: () => { const f = LF('張繍'); up(Game.lordOf(f), 'int', 3); Game.citiesOf(f).forEach(c => c.train = Math.min(100, c.train + 8)); const j = G_('賈詡'); j.loyalty = Math.min(100, j.loyalty + 10);
        return { title: '賈詡の献策', gen: '賈詡', expr: 'normal', fac: f, text: '賈詡「追う時を誤らなければ、寡兵でも勝てまする」\n張繍は賈詡の言葉をよく聞き、兵の動かし方を学んだ。\n張繍の知力 +3、全都市の訓練 +8、賈詡の忠誠 +10' }; } },
    { id: 'l_lijue', title: '長安の実権', chance: 0.45, cond: () => { const f = LF('李傕'); return f >= 0 && owns(f, '長安'); },
      run: () => { const f = LF('李傕'), c = cityByName('長安'); c.gold += 1500; Game.gensOf(f).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + 5); }); c.loyal = Math.max(0, c.loyal - 8);
        return { title: '長安の実権', gen: '李傕', expr: 'happy', fac: f, text: '朝廷を思うままにする李傕は、官位と財宝を配下にばらまいて歓心を買った。\n長安の金 +1500、家臣の忠誠 +5。ただし長安の民忠 −8' }; } },
    { id: 'l_liuzhang', title: '劉璋、決断す', chance: 0.4, cond: () => { const f = LF('劉璋'); return f >= 0 && owns(f, '成都') && G.year >= 200; },
      run: () => { const f = LF('劉璋'), l = Game.lordOf(f); up(l, 'lead', 3); up(l, 'int', 2); Game.citiesOf(f).forEach(c => c.food += 4000);
        return { title: '劉璋、決断す', gen: '劉璋', expr: 'angry', fac: f, text: '温和で決断に欠けると言われてきた劉璋が、益州の危機を前に腹をくくった――\n劉璋「父上から受け継いだ益州、この手で守り抜く！」\n劉璋の統率 +3・知力 +2、全都市の兵糧 +4000' }; } },
    { id: 'l_sunquan', title: '碧眼児、江東を固める', chance: 0.4, cond: () => { const f = LF('孫権'); return f >= 0 && ['建業', '呉', '会稽'].filter(n => owns(f, n)).length >= 2; },
      run: () => { const f = LF('孫権'); Game.citiesOf(f).filter(c => c.terrain === 'river').forEach(c => c.def = Math.min(c.defMax, c.def + 80)); up(Game.lordOf(f), 'pol', 2);
        return { title: '碧眼児、江東を固める', gen: '孫権', expr: 'normal', fac: f, text: '父と兄の遺した江東を守るため、孫権は長江沿いの守りを固め、人材を広く登用した。\n大河沿いの全都市の城壁 +80、孫権の政治 +2' }; } },
    { id: 'l_hanxuan', title: '老将と若武者', chance: 0.45, cond: () => { const f = LF('韓玄'); return f >= 0 && (facOf('黄忠') === f || facOf('魏延') === f); },
      run: () => { const f = LF('韓玄'); ['黄忠', '魏延'].forEach(n => { const g = serving(n); if (g && g.faction === f) g.loyalty = Math.min(100, g.loyalty + 30); }); up(Game.lordOf(f), 'cha', 5);
        return { title: '老将と若武者', gen: '黄忠', expr: 'happy', fac: f, text: '韓玄は、老将・黄忠と若き魏延の力を認め、篤く遇した――\n黄忠「殿がそこまで言われるなら、この老骨、長沙のために射ましょう」\n黄忠・魏延の忠誠 +30、韓玄の魅力 +5' }; } },
    { id: 'l_jinxuan', title: '都仕込みの政', chance: 0.45, cond: () => { const f = LF('金旋'); return f >= 0 && G.year >= 200; },
      run: () => { const f = LF('金旋'), cap = capOf(f); up(Game.lordOf(f), 'pol', 3); cap.gold += 800; pct(cap, 'comm', 'commMax', 0.08);
        return { title: '都仕込みの政', gen: '金旋', expr: 'normal', fac: f, text: `都の官職を歴任した金旋は、朝廷で学んだ帳簿と法の扱いで、${cap.name}の政を立て直した。\n金旋の政治 +3、${cap.name}の金 +800・商業 +8%` }; } },
    { id: 'l_liudu', title: '零陵の守り', chance: 0.45, cond: () => { const f = LF('劉度'); return f >= 0 && owns(f, '零陵'); },
      run: () => { const f = LF('劉度'), c = cityByName('零陵'); c.def = Math.min(c.defMax, c.def + 100); const x = serving('邢道栄'); if (x && x.faction === f) up(x, 'war', 3); const s2 = serving('劉賢'); if (s2 && s2.faction === f) up(s2, 'lead', 2);
        return { title: '零陵の守り', gen: '劉度', expr: 'normal', fac: f, text: '劉度は息子の劉賢と猛将・邢道栄に、零陵の守りを固めさせた。\n零陵の城壁 +100' + (x && x.faction === f ? '、邢道栄の武力 +3' : '') + (s2 && s2.faction === f ? '、劉賢の統率 +2' : '') }; } },
    { id: 'l_zhaofan', title: '断られた縁談', chance: 0.5, cond: () => { const f = LF('趙範'); return f >= 0 && G.year >= 200; },
      run: () => { const f = LF('趙範'), z = G_('趙雲'), cap = capOf(f); up(Game.lordOf(f), 'cha', 2);
        if (z && z.state === 'ronin') { z.city = cap.i; z.known = true;
          return { title: '断られた縁談', gen: '趙範', expr: 'normal', fac: f, text: `趙範は兄嫁の樊氏を趙雲に嫁がせようとしたが、きっぱり断られた。\nだがその一件で、趙範は趙雲の義の固さに惚れ込み、改めて客として迎えた――\n在野の趙雲が${cap.name}に滞在している（登用できる）。趙範の魅力 +2` }; }
        const r = shuffle(G.gens.filter(g => g.state === 'ronin' && g.name !== '諸葛亮' && g.war >= 65))[0]; if (r) { r.city = cap.i; r.known = true; }
        return { title: '義の士を求めて', gen: '趙範', expr: 'normal', fac: f, text: `趙範は、縁談をきっぱり断った趙雲の義の固さを忘れられなかった。趙範は、そのような義の士を桂陽に求めた――\n` + (r ? `在野の${r.name}が${cap.name}を訪ねてきた（登用できる）。` : '') + `趙範の魅力 +2` }; } },
    { id: 'l_gongsunkang', title: '袁氏の首', chance: 0.45, cond: () => { const f = LF('公孫康'), fc = LF('曹操'); return f >= 0 && fc >= 0 && fc !== f && !Game.isAlly(f, fc) && G.year >= 205; },
      run: () => { const f = LF('公孫康'), fc = LF('曹操'); allyWith(f, fc); capOf(f).gold += 1000;
        return { title: '袁氏の首', gen: '公孫康', expr: 'normal', fac: f, big: true, text: '逃げ込んできた袁尚・袁熙の首をはね、曹操に送り届けた公孫康。曹操はこれを喜び、遼東に手を出さなかった。\n公孫康軍と曹操軍が同盟、本拠の金 +1000' }; } },
    { id: 'l_menghuo', title: '南蛮の王', chance: 0.45, cond: () => { const f = LF('孟獲'); return f >= 0 && (owns(f, '建寧') || owns(f, '雲南')); },
      run: () => { const f = LF('孟獲'), c = owns(f, '雲南') ? cityByName('雲南') : cityByName('建寧'); c.troops += 6000; up(Game.lordOf(f), 'war', 2); const z = serving('祝融'); if (z && z.faction === f) z.loyalty = 100;
        return { title: '南蛮の王', gen: '孟獲', expr: 'angry', fac: f, text: `孟獲「南中の兵は、象も虎も味方につけておるのだ！ かかってこい！」\n南中の諸部族が孟獲の旗のもとに集まった。\n${c.name}の兵 +6000、孟獲の武力 +2` + (z && z.faction === f ? '、祝融の忠誠 100' : '') }; } },
  ];
  HIST.push(...LORD_EVENTS);

  // ---------------- 重要な脇役30人のイベント ----------------
  // その人物が仕えていて条件がそろうと、季節ごとに25%で1回だけ起きる。自軍の人物なら会話で知らせる
  const S = n => { const g = serving(n); return g && !g.isLord ? g : null; };
  const sameF = (a, b) => { const x = S(a), y = S(b); return !!(x && y && x.faction === y.faction); };
  const cityOf = g => G.cities[g.city];
  const loyFac = (fi, v) => Game.gensOf(fi).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + v); });
  const gatherFac = (fi, n, pred) => { const cap = G.cities[G.factions[fi].capital]; const rs = shuffle(G.gens.filter(g => g.state === 'ronin' && g.name !== '諸葛亮' && (!pred || pred(g)))).slice(0, n); rs.forEach(g => { g.city = cap.i; g.known = true; }); return rs; };
  const ev1 = (id, name, title, cond, run) => ({ id, title, chance: 0.25, cond: () => { const g = S(name); return !!g && (!cond || cond(g)); }, run: () => { const g = S(name); const t = run(g); return { title, gen: name, expr: t.expr || 'happy', fac: g.faction, big: !!t.big, text: t.text }; } });
  const SIDE_EVENTS = [
    ev1('c_guanyu', '関羽', '単刀赴会', g => { const r = S('魯粛'); return r && r.faction !== g.faction; }, g => { up(g, 'cha', 2); up(g, 'war', 1);
      return { text: '関羽は刀一振りだけを携え、わずかな供を連れて魯粛との会見の場に臨んだ。その堂々たる態度に、居並ぶ者は誰も手を出せなかった。\n関羽の魅力 +2・武力 +1' }; }),
    ev1('c_zhangfei', '張飛', '長坂橋の仁王立ち', null, g => { up(g, 'war', 1); up(g, 'cha', 1); const c = cityOf(g); c.def = Math.min(c.defMax, c.def + 60);
      return { expr: 'angry', text: `張飛「我こそは燕人張益徳！ 死にたい奴からかかってこい！」\n橋の上でただ一騎、矛を構えて吼える張飛に、追っ手の大軍は誰ひとり近づけなかった。\n張飛の武力 +1・魅力 +1、${c.name}の城壁 +60` }; }),
    ev1('c_zhaoyun', '趙雲', '一身これ胆なり', null, g => { up(g, 'lead', 1); up(g, 'cha', 2); g.loyalty = Math.min(100, g.loyalty + 10);
      return { text: '寡兵で陣を守り、門を開け放って敵の大軍を退けた趙雲。主君は感嘆して言った。\n「子龍は、一身これすべて胆なり」\n趙雲の統率 +1・魅力 +2、忠誠 +10' }; }),
    ev1('c_zhuge', '諸葛亮', '天下三分の計', g => Game.citiesOf(g.faction).length <= 4, g => { const l = Game.lordOf(g.faction); up(l, 'cha', 2); loyFac(g.faction, 5); up(g, 'pol', 1);
      return { text: '諸葛亮は地図を広げ、主君に天下の形を説いた。\n諸葛亮「北は曹操に、東は孫権に譲り、まず荊州と益州を取って足場とする。天下はそこから見えてまいります」\n君主の魅力 +2、家臣の忠誠 +5、諸葛亮の政治 +1' }; }),
    ev1('c_pangtong', '龐統', '百日の政務を半日で', null, g => { up(g, 'pol', 3); G.cities[G.factions[g.faction].capital].gold += 500;
      return { text: '小さな県を任された龐統は、酒ばかり飲んで政務を放っておいた。叱責の使者が来ると、たまった百日分の訴えを半日で片づけてみせた。\n龐統「小さな県を治めるのに、大した手間はいりませぬ」\n龐統の政治 +3、本拠の金 +500' }; }),
    ev1('c_weiyan', '魏延', '子午谷の奇策', null, g => { up(g, 'lead', 2); up(g, 'int', 1);
      return { text: '魏延「精兵五千で子午谷を抜け、長安を一気に突けば、十日で関中は我らのものとなりましょう！」\n大胆すぎる策は採られなかったが、魏延の気概に将兵は奮い立った。\n魏延の統率 +2・知力 +1' }; }),
    ev1('c_jiangwei', '姜維', '涼州の麒麟児', null, g => { const zg = sameF('姜維', '諸葛亮'); up(g, 'int', zg ? 2 : 1); up(g, 'lead', 1);
      return { text: zg ? '諸葛亮「伯約（姜維）は忠勤で思慮深く、涼州の上士に勝る者である」\n師のもとで、姜維は兵法を一心に学んだ。\n姜維の知力 +2・統率 +1' : '涼州に生まれた若き姜維は、兵法を学び、武芸を磨き続けた。\n姜維の知力 +1・統率 +1' }; }),
    ev1('c_fazheng', '法正', '漢中を取るべし', null, g => { up(g, 'int', 1); Game.citiesOf(g.faction).forEach(c => c.train = Math.min(100, c.train + 5));
      return { text: '法正「漢中を取れば、北は敵を防ぎ、内は民を富ませる。今こそ天が与えた好機です」\n法正の鋭い献策に、軍は活気づいた。\n法正の知力 +1、全都市の訓練 +5' }; }),
    ev1('c_maliang', '馬良', '白眉', null, g => { up(g, 'pol', 2); up(g, 'int', 1); Game.citiesOf(g.faction).forEach(c => c.loyal = Math.min(100, c.loyal + 4));
      return { text: '才に秀でた五人兄弟の中でも、眉に白い毛のある馬良がいちばん優れていた。人々は「馬氏の五常、白眉最も良し」と讃えた。\n馬良の政治 +2・知力 +1、全都市の民忠 +4' }; }),
    ev1('c_xushu', '徐庶', '徐庶の推挙', null, g => { const z = G_('諸葛亮'), l = Game.lordOf(g.faction);
      if (z && z.state === 'ronin') { z.city = l.city; z.known = true;
        return { text: `徐庶「隆中に臥龍と呼ばれる男がおります。諸葛孔明――私など足元にも及びませぬ。ただし、呼びつけても来る男ではございません。殿が自ら訪ねられませ」\n在野の諸葛亮の居場所がわかった（${G.cities[l.city].name}）。君主が自ら三度訪ねれば、登用できる` }; }
      const rs = gatherFac(g.faction, 1, x => x.int >= 70); up(g, 'int', 1);
      return { text: '徐庶「私の知る中に、殿のお役に立てる者がおります。会ってみられませ」\n' + (rs.length ? `在野の${rs[0].name}が本拠を訪ねてきた（登用できる）。` : '') + '徐庶の知力 +1' }; }),
    ev1('c_dianwei', '典韋', '古の悪来', null, g => { up(g, 'war', 1); g.loyalty = 100;
      return { text: '両手に大きな鉄の戟を持ち、主君の陣を守り抜く典韋。その怪力ぶりに、人々は古の豪傑の名を取って「悪来」と呼んだ。\n典韋の武力 +1、忠誠 100' }; }),
    ev1('c_xuchu', '許褚', '虎痴', null, g => { up(g, 'war', 1); g.loyalty = 100; up(g, 'cha', 1);
      return { text: '虎のような怪力でありながら、どこか間の抜けた許褚は「虎痴」と呼ばれた。だが主君を守る時の眼光は、まさに虎そのものである。\n許褚の武力 +1・魅力 +1、忠誠 100' }; }),
    ev1('c_guojia', '郭嘉', '十勝十敗', null, g => { up(g, 'int', 1); loyFac(g.faction, 6);
      return { text: '郭嘉「敵には十の負ける理由があり、殿には十の勝つ理由がございます。恐れることはありませぬ」\n郭嘉の明快な弁に、諸将の迷いは晴れた。\n郭嘉の知力 +1、家臣の忠誠 +6' }; }),
    ev1('c_xunyu', '荀彧', '王佐の才', null, g => { up(g, 'pol', 2); const rs = gatherFac(g.faction, 2, x => x.int >= 65 || x.pol >= 65);
      return { text: '「王佐の才」と称された荀彧は、天下の賢者を次々と主君に推挙した。\n' + (rs.length ? `在野の${rs.map(x => x.name).join('・')}が本拠を訪ねてきた（登用できる）。` : '') + '荀彧の政治 +2' }; }),
    ev1('c_jiaxu', '賈詡', '離間の計', g => { const a = S('馬超'), b = S('韓遂'); return a && b && a.faction === b.faction && a.faction !== g.faction; }, g => { const a = S('馬超'), b = S('韓遂'); [a, b].forEach(x => x.loyalty = Math.max(0, x.loyalty - 25)); up(g, 'int', 1);
      return { expr: 'normal', big: true, text: '賈詡は、わざと書き直した跡のある手紙を韓遂に送らせた。それを見た馬超は、韓遂が何かを隠していると疑い始めた。\n馬超と韓遂の忠誠 −25、賈詡の知力 +1' }; }),
    ev1('c_simayi', '司馬懿', '雌伏の時', null, g => { up(g, 'int', 2); up(g, 'lead', 1); if (!Game.has(g, '忠義')) g.loyalty = Math.max(0, g.loyalty - 8);
      return { expr: 'normal', text: '司馬懿は表立って功を誇らず、じっと時を待った。その目の奥に何があるのか、誰にもわからない。\n司馬懿の知力 +2・統率 +1、忠誠 −8' }; }),
    ev1('c_xuhuang', '徐晃', '周亜夫の風あり', null, g => { up(g, 'lead', 2); Game.citiesOf(g.faction).forEach(c => c.train = Math.min(100, c.train + 5));
      return { text: '陣を乱さず、敵の包囲を真正面から破った徐晃。主君は、名将・周亜夫の風格があると讃えた。\n徐晃の統率 +2、全都市の訓練 +5' }; }),
    ev1('c_zhanghe', '張郃', '巧みなる変化', null, g => { up(g, 'lead', 1); up(g, 'int', 2);
      return { text: '地形を読み、陣を自在に変える張郃の戦いぶりに、敵の名将たちも一目置いた。\n張郃の統率 +1・知力 +2' }; }),
    ev1('c_caoren', '曹仁', '死守', null, g => { const c = cityOf(g); c.def = Math.min(c.defMax, c.def + 150); up(g, 'lead', 1);
      return { expr: 'angry', text: `曹仁「この城は、わしが死んでも渡さぬ！」\n曹仁は${c.name}の守りを自ら指揮して固めた。\n${c.name}の城壁 +150、曹仁の統率 +1` }; }),
    ev1('c_zhouyu', '周瑜', '曲に誤りあれば', null, g => { up(g, 'cha', 3); loyFac(g.faction, 4);
      return { text: '音楽にも通じた周瑜は、宴の最中でも演奏の誤りに気づくと、思わずそちらを振り返った。人々は「曲に誤りあれば周郎顧みる」と歌った。\n周瑜の魅力 +3、家臣の忠誠 +4' }; }),
    ev1('c_lusu', '魯粛', '榻上の策', null, g => { const l = Game.lordOf(g.faction); up(g, 'int', 1); up(l, 'pol', 1); G.cities[G.factions[g.faction].capital].gold += 600;
      return { text: '寝台に腰かけて、魯粛は主君と二人きりで天下の行く末を語り合った。\n魯粛「まず足元を固め、天下の変を待つのです」\n魯粛の知力 +1、君主の政治 +1、本拠の金 +600' }; }),
    ev1('c_luxun', '陸遜', '書生の大将', null, g => { up(g, 'lead', 2); up(g, 'int', 1);
      return { text: '若い陸遜が大将に任じられると、古参の将たちは「書生に何ができる」と侮った。だが陸遜は、じっと敵の疲れを待ち続けた――\n陸遜の統率 +2・知力 +1' }; }),
    ev1('c_ganning', '甘寧', '百騎の夜襲', null, g => { up(g, 'war', 1); up(g, 'cha', 2); Game.citiesOf(g.faction).forEach(c => c.train = Math.min(100, c.train + 6));
      return { expr: 'angry', text: '甘寧はわずか百騎を率いて夜の敵陣に斬り込み、一人も失わずに帰ってきた。\n甘寧「敵の大軍も、夜には眠る。恐れることはない」\n甘寧の武力 +1・魅力 +2、全都市の訓練 +6' }; }),
    ev1('c_taishici', '太史慈', '信義の士', null, g => { up(g, 'war', 1); g.loyalty = 100;
      return { text: '受けた恩は必ず返す。かつて母が世話になった恩に報いるため、包囲された城へ単騎で駆けつけたこともある太史慈。その信義は主君にも向けられている。\n太史慈の武力 +1、忠誠 100' }; }),
    ev1('c_chengpu', '程普', '醇酒を飲むが如し', g => sameF('程普', '周瑜'), g => { const z = S('周瑜'); [g, z].forEach(x => x.loyalty = Math.min(100, x.loyalty + 10)); up(g, 'lead', 1);
      return { text: '若い周瑜を快く思っていなかった古参の程普は、やがてその器量に心服した。\n程普「周公瑾との付き合いは、上等な酒を飲むようなもの。知らぬ間に酔ってしまう」\n程普と周瑜の忠誠 +10、程普の統率 +1' }; }),
    ev1('c_chengong', '陳宮', '陳宮の策', null, g => { up(g, 'int', 2); const c = G.cities[G.factions[g.faction].capital]; c.def = Math.min(c.defMax, c.def + 60);
      return { expr: 'normal', text: '陳宮「敵が来れば城外に兵を伏せて挟み撃ちにし、城を守り抜くのです」\n陳宮の策で、守りの備えが整った。\n陳宮の知力 +2、本拠の城壁 +60' }; }),
    ev1('c_gaoshun', '高順', '陥陣営', null, g => { const c = cityOf(g); c.troops += 2000; c.train = Math.min(100, c.train + 10); up(g, 'lead', 1);
      return { expr: 'angry', text: `高順の鍛えた七百の兵は、攻めれば必ず敵陣を破ることから「陥陣営」と呼ばれた。\n${c.name}の兵 +2000・訓練 +10、高順の統率 +1` }; }),
    ev1('c_zhangzhao', '張昭', '内のことは張昭に問え', null, g => { up(g, 'pol', 2); Game.citiesOf(g.faction).forEach(c => pct(c, 'comm', 'commMax', 0.04));
      return { text: '「外のことで迷えば周瑜に、内のことで迷えば張昭に問え」――重臣・張昭は、国の内の政をしっかりと支えた。\n張昭の政治 +2、全都市の商業 +4%' }; }),
    ev1('c_huanggai', '黄蓋', '苦肉の計', g => sameF('黄蓋', '周瑜'), g => { g.loyalty = 100; up(g, 'cha', 2); const fi = g.faction;
      Game.citiesOf(fi).forEach(c => c.adj.forEach(a => { const o = G.cities[a]; if (o.owner !== null && o.owner !== fi && !Game.isAlly(fi, o.owner)) o.train = Math.max(0, o.train - 8); }));
      return { expr: 'angry', big: true, text: '黄蓋は軍議で周瑜に逆らい、満座の中で打ちすえられた。傷だらけの黄蓋から「降伏したい」という手紙を受け取った敵は、すっかり油断した――\n黄蓋の忠誠 100・魅力 +2、隣の敵都市の訓練 −8' }; }),
    ev1('c_pangde', '龐徳', '棺を担いで', null, g => { up(g, 'war', 2); g.loyalty = 100;
      return { expr: 'angry', text: '龐徳は自らの棺を担がせて出陣した。\n龐徳「今日、敵将を討つか、この棺に入るか。二つに一つだ！」\n龐徳の武力 +2、忠誠 100' }; }),
  ];
  HIST.push(...SIDE_EVENTS);

  // ---------------- 最弱の4人にゆかりのイベント（アクセント） ----------------
  // 楊松・劉禅・曹豹・邢道栄。悪い出来事が中心で、良い出来事も少し。repeat のものは何度でも起きる（確率は低め）
  const sv = n => { const g = serving(n); return g && g.state === 'serve' ? g : null; };
  const enemyAdj = c => c.adj.map(a => G.cities[a]).filter(o => o.owner !== null && o.owner !== c.owner && !Game.isAlly(c.owner, o.owner));
  const strongest = (fi, not) => Game.gensOf(fi).filter(g => !g.isLord && g.name !== not).sort((a, b) => (b.war + b.lead) - (a.war + a.lead))[0];
  const ev4 = (id, name, title, chance, repeat, cond, run) => ({ id, title, chance, repeat, cond: () => { const g = sv(name); return !!g && (!cond || cond(g)); }, run: () => { const g = sv(name); const t = run(g); if (!t) return null; return { title, gen: t.gen || name, expr: t.expr || 'shock', fac: g.faction, big: !!t.big, text: t.text }; } });
  const WEAK_EVENTS = [
    // ---- 楊松：欲深い張魯の家臣 ----
    ev4('w_ys_bribe', '楊松', '楊松、賄賂を受け取る', 0.08, true, null, g => { const c = G.cities[g.city]; const v = Math.round(c.gold * 0.12); c.gold -= v; c.loyal = Math.max(0, c.loyal - 5);
      return { text: `楊松の屋敷に、夜な夜な怪しげな客が出入りしている。気づけば${c.name}の蔵から金が消えていた。\n楊松「はて、何のことやら。わしは知りませぬなあ」\n${c.name}の金 −${v}、民忠 −5` }; }),
    ev4('w_ys_slander', '楊松', '楊松の讒言', 0.07, true, g => !!strongest(g.faction, '楊松'), g => { const t = (['馬超', '龐徳'].map(sv).find(x => x && x.faction === g.faction && !x.isLord)) || strongest(g.faction, '楊松'); t.loyalty = Math.max(0, t.loyalty - 15);
      return { gen: t.name, expr: 'angry', text: `楊松「殿、${t.name}は近ごろ、よからぬ者と通じているようでございますぞ」\nありもしない噂を流された${t.name}は、主君に疑われていると感じている。\n${t.name}の忠誠 −15` }; }),
    ev4('w_ys_betray', '楊松', '楊松、敵に通じる', 0.12, false, g => g.loyalty < 60 && enemyAdj(G.cities[g.city]).length > 0, g => { const c = G.cities[g.city]; c.def = Math.round(c.def * 0.7); c.troops = Math.round(c.troops * 0.9);
      return { big: true, text: `賄賂に目のくらんだ楊松が、${c.name}の守りの手薄な所を敵に漏らしていた！\n${c.name}の城壁 −30%、兵 −10%` }; }),
    ev4('w_ys_hoard', '楊松', '楊松の隠し蔵', 0.06, false, null, g => { const c = G.cities[G.factions[g.faction].capital]; c.gold += 1200; g.loyalty = Math.max(0, g.loyalty - 20);
      return { expr: 'sad', text: `楊松の屋敷の床下から、ため込んだ金銀がざくざくと出てきた。すべて国の蔵に納めさせた。\n楊松「あ、あれはいざという時のために……」\n本拠の金 +1200、楊松の忠誠 −20` }; }),
    ev4('w_ys_bribe_foe', '楊松', '金で動かす', 0.06, true, g => enemyAdj(G.cities[g.city]).length > 0, g => { const o = pick(enemyAdj(G.cities[g.city])); const t = Game.gensIn(o.i, o.owner).filter(x => !x.isLord && !Game.has(x, '忠義'))[0]; if (!t) return null; t.loyalty = Math.max(0, t.loyalty - 15);
      return { expr: 'happy', text: `楊松「金で動かぬ者などおりませぬ。ふっふっふ」\n楊松が袖の下を使って、${o.name}の${t.name}に揺さぶりをかけた。\n${t.name}の忠誠 −15` }; }),
    // ---- 劉禅：劉備の子。おっとりとした若君 ----
    ev4('w_ls_feast', '劉禅', '宴に興じる', 0.08, true, null, g => { const c = G.cities[g.city]; c.gold = Math.max(0, c.gold - 400); pct(c, 'comm', 'commMax', -0.04);
      return { expr: 'happy', text: `劉禅は今日も宴を開き、歌と踊りに興じている。\n劉禅「みな、楽しんでおるか？ 堅いことは明日考えればよい」\n${c.name}の金 −400、商業 −4%` }; }),
    ev4('w_ls_nap', '劉禅', '若君の昼寝', 0.07, true, null, g => { const c = G.cities[g.city]; c.train = Math.max(0, c.train - 6);
      return { expr: 'normal', text: `調練の視察に来たはずの劉禅が、木陰ですやすやと眠っている。兵たちもつられて気が抜けてしまった。\n${c.name}の訓練 −6` }; }),
    ev4('w_ls_toss', '劉禅', '阿斗を地に投げる', 0.3, false, g => sameF2('劉禅', '劉備') && sameF2('劉禅', '趙雲'), g => { const z = sv('趙雲'); z.loyalty = 100; up(z, 'cha', 1); up(sv('劉備'), 'cha', 1);
      return { gen: '劉備', expr: 'angry', text: '幼い阿斗（劉禅）を抱いて敵中を駆け抜けた趙雲。劉備は受け取った我が子を地に投げ出した。\n劉備「この子のために、危うく大事な将を失うところであった！」\n趙雲は涙を流して忠誠を誓った。\n趙雲の忠誠 100・魅力 +1、劉備の魅力 +1' }; }),
    ev4('w_ls_trust', '劉禅', '相父に任せる', 0.3, false, g => g.isLord && facOf('諸葛亮') === g.faction, g => { const z = sv('諸葛亮'); z.loyalty = 100; Game.citiesOf(g.faction).forEach(c => { pct(c, 'farm', 'farmMax', 0.03); pct(c, 'comm', 'commMax', 0.03); });
      return { expr: 'happy', text: '劉禅「政のことは、すべて相父（諸葛亮）にお任せしよう。わしは祭りごとだけをしておればよい」\n諸葛亮は、若き主君の信頼に命をかけて応えることを誓った。\n諸葛亮の忠誠 100、全都市の農業・商業 +3%' }; }),
    ev4('w_ls_happy', '劉禅', '此間楽し', 0.3, false, g => { const l = Game.lordOf(g.faction); return !g.isLord && l && !['劉備', '劉禅'].includes(l.name); }, g => { g.loyalty = 100;
      return { expr: 'happy', text: '故郷を懐かしくないかと問われた劉禅は、にこにこと答えた。\n劉禅「ここは楽しゅうございます。故郷のことなど思い出しませぬ」\n劉禅の忠誠 100' }; }),
    ev4('w_ls_kind', '劉禅', '気のいい若君', 0.06, true, null, g => { const c = G.cities[g.city]; c.loyal = Math.min(100, c.loyal + 5);
      return { expr: 'happy', text: `町に出た劉禅が、子どもたちと一緒に凧揚げをしていた。おっとりとした若君は、民にはなぜか好かれている。\n${c.name}の民忠 +5` }; }),
    // ---- 曹豹：陶謙の家臣 ----
    ev4('w_cb_drink', '曹豹', '酒席の諍い', 0.3, false, g => sameF2('曹豹', '張飛'), g => { const z = sv('張飛'); g.loyalty = Math.max(0, g.loyalty - 25); z.loyalty = Math.max(0, z.loyalty - 5);
      return { gen: '張飛', expr: 'angry', big: true, text: '張飛「おい曹豹、俺の酒が飲めんというのか！」\n禁酒の誓いを破った張飛は、酒を断った曹豹を鞭で打ちすえた。曹豹の目に、暗い恨みの色が浮かんだ――\n曹豹の忠誠 −25、張飛の忠誠 −5' }; }),
    ev4('w_cb_gate', '曹豹', '城門を開く', 0.25, false, g => g.loyalty < 45 && G.cities[g.city].i !== G.factions[g.faction].capital && enemyAdj(G.cities[g.city]).length > 0, g => {
      const c = G.cities[g.city], old = c.owner; const foes = enemyAdj(c); const lb = foes.find(o => Game.lordOf(o.owner) && Game.lordOf(o.owner).name === '呂布') || pick(foes);
      if (Math.random() < 0.5) { c.def = Math.round(c.def * 0.6); c.troops = Math.round(c.troops * 0.85); return { big: true, text: `曹豹が夜中にこっそり${c.name}の城門を開けようとしたところを、見張りが取り押さえた。だが城内は大混乱に陥った。\n${c.name}の城壁 −40%、兵 −15%` }; }
      const nf = lb.owner; c.owner = nf; Game.gensIn(c.i, old).forEach(x => { if (x !== g) x.city = G.factions[old].capital; }); g.faction = nf; g.loyalty = irnd(50, 70);
      return { big: true, text: `曹豹が夜中に${c.name}の城門を開け、${G.factions[nf].name}軍を引き入れた！\n${c.name}は${G.factions[nf].name}軍のものとなった。曹豹も${G.factions[nf].name}軍に降った` }; }),
    ev4('w_cb_danyang', '曹豹', '丹陽の兵', 0.08, false, null, g => { const c = G.cities[g.city]; c.troops += 2000; c.train = Math.min(100, c.train + 5);
      return { expr: 'happy', text: `勇猛で知られる丹陽の兵を、曹豹が呼び寄せた。\n曹豹「丹陽の兵は強いですぞ。……率いるわしは、まあ、ほどほどですがな」\n${c.name}の兵 +2000・訓練 +5` }; }),
    ev4('w_cb_inlaw', '曹豹', '娘婿は呂布', 0.25, false, g => { const f = facByLord('呂布'); return f >= 0 && f !== g.faction; }, g => { g.loyalty = Math.max(0, g.loyalty - 15);
      return { expr: 'normal', text: '曹豹の娘は、あの呂布に嫁いでいる。敵方の娘婿から、たびたび手紙が届いているらしい。\n曹豹の忠誠 −15' }; }),
    // ---- 邢道栄：零陵の自称「上将」 ----
    ev4('w_xd_boast', '邢道栄', '万夫不当の大言', 0.08, true, null, g => { const c = G.cities[g.city]; c.train = Math.min(100, c.train + 4); g.loyalty = Math.min(100, g.loyalty + 3);
      return { expr: 'angry', text: `邢道栄「この零陵の上将・邢道栄、万の敵をもってしても止められぬわ！ わはははは！」\n大斧を振り回す邢道栄の大声に、兵たちは苦笑いしつつも元気づけられた。\n${c.name}の訓練 +4` }; }),
    ev4('w_xd_feast', '邢道栄', '前祝いの大宴会', 0.07, true, null, g => { const c = G.cities[g.city]; c.gold = Math.max(0, c.gold - 250); c.food = Math.max(0, c.food - 1500);
      return { expr: 'happy', text: `邢道栄「勝ったも同然！ 前祝いじゃ、飲め飲め！」\nまだ戦も始まっていないのに、邢道栄が兵たちと大宴会を開いた。\n${c.name}の金 −250・兵糧 −1500` }; }),
    ev4('w_xd_fear', '邢道栄', '張飛と趙雲が怖い', 0.15, false, g => ['張飛', '趙雲'].some(n => { const x = sv(n); return x && x.faction !== g.faction && G.cities[x.city].adj.includes(g.city); }), g => { const who = ['張飛', '趙雲'].map(sv).find(x => x && x.faction !== g.faction && G.cities[x.city].adj.includes(g.city)); g.loyalty = Math.max(0, g.loyalty - 10); up(g, 'war', -1);
      return { expr: 'shock', text: `隣の城に${who.name}がいると聞いた邢道栄は、急に腹が痛いと言い出した。\n邢道栄「い、いや、怖いわけではないぞ。たまたま腹が……」\n邢道栄の武力 −1、忠誠 −10` }; }),
    ev4('w_xd_fake', '邢道栄', '偽りの降伏', 0.15, false, g => g.loyalty < 50 && enemyAdj(G.cities[g.city]).length > 0, g => { const c = G.cities[g.city]; c.def = Math.round(c.def * 0.85);
      return { big: true, text: `邢道栄が「降伏したふりをして敵を誘い込む」と言い出し、勝手に敵陣へ出かけた。案の定、こちらの陣の様子をべらべらとしゃべってきたらしい。\n${c.name}の城壁 −15%` }; }),
    ev4('w_xd_axe', '邢道栄', '大斧の稽古', 0.06, true, g => g.war < 85, g => { up(g, 'war', 1);
      return { expr: 'angry', text: '邢道栄は毎朝、六十斤の大斧を振って稽古に励んでいる。……腕は、少しずつ上がっているようだ。\n邢道栄の武力 +1' }; }),
  ];
  function sameF2(a, b) { const x = sv(a), y = sv(b); return !!(x && y && x.faction === y.faction); }
  HIST.push(...WEAK_EVENTS);

  // ---------------- 武将一人ひとりのイベント（js/data_genev.js） ----------------
  // ほかにイベントのない武将の、逸話や人物像にちなむ出来事。仕えていて条件がそろうと、季節ごとに20%で1回だけ起きる
  const STAT_NM = { lead: '統率', war: '武力', int: '知力', pol: '政治', cha: '魅力' };
  const CITY_K = { train: '訓練', troops: '兵', def: '城壁', gold: '金', food: '兵糧', loyal: '民忠' };
  const sgn = v => (v >= 0 ? '+' : '−') + Math.abs(v);
  function genCond(g, c) {
    const fi = g.faction;
    switch (c.t) {
      case 'with': { const x = serving(c.who); return !!(x && x.faction === fi); }
      case 'foe': { const x = serving(c.who); return !!(x && x.faction !== fi && !Game.isAlly(fi, x.faction)); }
      case 'lord': { const l = Game.lordOf(fi); return !!(l && l.name === c.who); }
      case 'owns': return owns(fi, c.city);
      case 'cities_le': return Game.citiesOf(fi).length <= c.n;
      case 'cities_ge': return Game.citiesOf(fi).length >= c.n;
      case 'year_ge': return G.year >= c.y;
    }
    return true;
  }
  function applyCity(c, k, v) {
    if (k === 'def') c.def = clamp(c.def + v, 0, c.defMax);
    else if (k === 'train' || k === 'loyal') c[k] = clamp(c[k] + v, 0, 100);
    else c[k] = Math.max(0, c[k] + v);
  }
  function genFx(g, f) {
    const fi = g.faction, who = f.who === 'lord' ? Game.lordOf(fi) : f.who ? serving(f.who) : g;
    switch (f.t) {
      case 'stat': if (!who) return ''; who[f.k] = clamp(who[f.k] + f.v, 1, 99); return `${who.name}の${STAT_NM[f.k]} ${sgn(f.v)}`;
      case 'loyalty': if (!who || who.isLord) return ''; who.loyalty = clamp(who.loyalty + f.v, 0, 100); return `${who.name}の忠誠 ${sgn(f.v)}`;
      case 'city': { const c = G.cities[g.city]; applyCity(c, f.k, f.v); return `${c.name}の${CITY_K[f.k]} ${sgn(f.v)}`; }
      case 'all': Game.citiesOf(fi).forEach(c => applyCity(c, f.k, f.v)); return `全都市の${CITY_K[f.k]} ${sgn(f.v)}`;
      case 'pct': { const k = f.k === 'farm' ? 'farm' : 'comm'; Game.citiesOf(fi).forEach(c => pct(c, k, k + 'Max', f.v / 100)); } return `全都市の${f.k === 'farm' ? '農業' : '商業'} ${sgn(f.v)}%`;
      case 'gens_loyalty': Game.gensOf(fi).forEach(x => { if (!x.isLord) x.loyalty = clamp(x.loyalty + f.v, 0, 100); }); return `家臣の忠誠 ${sgn(f.v)}`;
      case 'recruit': { const cap = G.cities[G.factions[fi].capital]; const rs = shuffle(G.gens.filter(x => x.state === 'ronin' && x.name !== '諸葛亮')).slice(0, f.n || 1); rs.forEach(x => { x.city = cap.i; x.known = true; }); return rs.length ? `在野の${rs.map(x => x.name).join('・')}が${cap.name}を訪ねてきた（登用できる）` : ''; }
      case 'foe_city': { let n = 0; Game.citiesOf(fi).forEach(c => c.adj.forEach(a => { const o = G.cities[a]; if (o.owner !== null && o.owner !== fi && !Game.isAlly(fi, o.owner)) { applyCity(o, f.k, f.v); n++; } })); return n ? `隣の敵都市の${CITY_K[f.k]} ${sgn(f.v)}` : ''; }
    }
    return '';
  }
  if (typeof GEN_EVENTS !== 'undefined') GEN_EVENTS.forEach(e => {
    HIST.push({ id: 'g_' + e.name, title: e.title, chance: 0.2,
      cond: () => { const g = serving(e.name); return !!g && (e.cond || []).every(c => genCond(g, c)); },
      run: () => {
        const g = serving(e.name);
        const fx = (e.fx || []).map(f => genFx(g, f)).filter(Boolean);
        const bad = (e.fx || []).some(f => f.v < 0 && f.t !== 'foe_city');
        return { title: e.title, gen: e.name, expr: bad ? 'sad' : 'happy', fac: g.faction, text: `${e.text}\n${e.name}「${e.quote}」` + (fx.length ? `\n${fx.join('、')}` : '') };
      } });
  });

  // ---------------- 君主ごとのイベントの別の展開 ----------------
  // 本来のイベントが、ゲーム開始から3年たっても起きていない（条件がそろわない）とき、代わりにこちらが起きる。
  // どちらか一方だけ。どの君主でも、1回のゲームで必ずどちらかが起きる（その君主が生きて君主である限り）
  const startYear = () => { const sc = SCENARIOS.find(x => x.id === G.scen); return sc ? sc.year : 190; };
  const mainIdOf = {};
  LORD_EVENTS.forEach(e => { const m = e.cond.toString().match(/LF\('([^']+)'\)/); if (m) mainIdOf[m[1]] = e.id; });
  const ALT = {
    孫堅: { title: '江東の虎、吼える', run: (f, l) => { up(l, 'war', 2); up(l, 'lead', 1); Game.citiesOf(f).forEach(c => c.train = Math.min(100, c.train + 8)); return '洛陽はまだ遠い。だが江東の虎の牙は鈍ってはいない。\n孫堅「天子の都は、いずれこの手で取り戻す。それまで牙を研いでおけ！」\n孫堅の武力 +2・統率 +1、全都市の訓練 +8'; } },
    袁紹: { title: '名門の檄文', run: (f, l) => { const rs = gatherTo(f, 2); up(l, 'cha', 1); loyF(f, 5); return '袁紹は天下に檄文を飛ばし、名門袁家のもとに集えと呼びかけた。\n袁紹「四世三公の家に、仕えぬ理由があろうか」\n' + (rs.length ? `在野の${rs.map(g => g.name).join('・')}が訪ねてきた（登用できる）。` : '') + '袁紹の魅力 +1、家臣の忠誠 +5'; } },
    曹操: { title: '乱世の奸雄', run: (f, l) => { up(l, 'int', 1); up(l, 'lead', 1); capOf(f).gold += 800; return '人物評の名人・許劭は、若き日の曹操を「治世の能臣、乱世の奸雄」と評した。\n曹操「奸雄、大いに結構。乱世を終わらせるのは、きれいごとではない」\n曹操の知力 +1・統率 +1、本拠の金 +800'; } },
    劉備: { title: '仁徳の君', run: (f, l) => { Game.citiesOf(f).forEach(c => c.loyal = Math.min(100, c.loyal + 6)); loyF(f, 6); up(l, 'cha', 1); return '城が増えても、劉備は民と将兵を第一に考えることを忘れなかった。\n劉備「国の大きさは城の数ではない。民の笑顔の数だ」\n全都市の民忠 +6、家臣の忠誠 +6、劉備の魅力 +1'; } },
    張繍: { title: '宛城の守り', run: (f, l) => { const c = capOf(f); c.def = Math.min(c.defMax, c.def + 120); Game.citiesOf(f).forEach(x => x.train = Math.min(100, x.train + 6)); up(l, 'lead', 2); return `涼州の兵を鍛え上げた張繍は、${c.name}の守りを固めた。\n張繍「寡兵でも、守りを固めれば大軍を退けられる」\n${c.name}の城壁 +120、全都市の訓練 +6、張繍の統率 +2`; } },
    韓玄: { title: '長沙の再起', run: (f, l) => { const rs = gatherTo(f, 2, g => g.war >= 65); up(l, 'cha', 3); return '人望がないと噂された韓玄は、心を入れ替えて広く武人を求めた。\n韓玄「わしの不明であった。腕に覚えのある者は、長沙へ来い！」\n' + (rs.length ? `在野の${rs.map(g => g.name).join('・')}が訪ねてきた（登用できる）。` : '') + '韓玄の魅力 +3'; } },
    劉繇: { title: '揚州の名士', run: (f, l) => { const rs = gatherTo(f, 2); up(l, 'cha', 2); return '漢の皇族である劉繇を頼って、戦乱を逃れた名士が揚州に集まった。\n' + (rs.length ? `在野の${rs.map(g => g.name).join('・')}が訪ねてきた（登用できる）。` : '') + '劉繇の魅力 +2'; } },
    孫策: { title: '若き覇気', run: (f, l) => { Game.citiesOf(f).forEach(c => c.train = Math.min(100, c.train + 8)); up(l, 'war', 1); loyF(f, 5); return '孫策「江東の地は、俺たちの手で平らげる！ ついて来い！」\n若き主君の覇気に、将兵は奮い立った。\n全都市の訓練 +8、孫策の武力 +1、家臣の忠誠 +5'; } },
    呂布: { title: '赤兎、千里を駆ける', run: (f, l) => { up(l, 'lead', 2); Game.citiesOf(f).forEach(c => c.train = Math.min(100, c.train + 6)); capOf(f).troops += 3000; return '「人中に呂布あり、馬中に赤兎あり」。赤兎馬を駆る呂布の武名を慕って、腕自慢の兵が集まってきた。\n呂布「強い者だけついて来い。天下最強の軍を見せてやる」\n呂布の統率 +2、全都市の訓練 +6、本拠の兵 +3000'; } },
    公孫康: { title: '遼東の守り', run: (f, l) => { const c = owns(f, '襄平') ? cityByName('襄平') : capOf(f); c.def = Math.min(c.defMax, c.def + 150); c.food += 5000; up(l, 'lead', 1); return `中原の争いをよそに、公孫康は北の守りを固めた。\n公孫康「遼東は父祖の地。誰にも渡さぬ」\n${c.name}の城壁 +150・兵糧 +5000、公孫康の統率 +1`; } },
    董卓: { title: '西涼の暴風', run: (f, l) => { const c = capOf(f); c.troops += 5000; up(l, 'war', 1); Game.citiesOf(f).forEach(x => x.loyal = Math.max(0, x.loyal - 3)); return `董卓は故郷・涼州から荒々しい兵を呼び寄せた。\n董卓「逆らう者は、西涼の騎兵で踏みつぶせ」\n${c.name}の兵 +5000、董卓の武力 +1。ただし全都市の民忠 −3`; } },
    韓馥: { title: '冀州の牧', run: (f, l) => { const c = capOf(f); c.def = Math.min(c.defMax, c.def + 100); up(l, 'pol', 2); loyF(f, 5); return `韓馥は冀州の長官として、城の守りと政を地道に整えた。\n韓馥「派手さはなくとも、民と城を守るのがわしの務めだ」\n${c.name}の城壁 +100、韓馥の政治 +2、家臣の忠誠 +5`; } },
    公孫瓚: { title: '白馬長史', run: (f, l) => { up(l, 'lead', 2); Game.citiesOf(f).forEach(c => c.train = Math.min(100, c.train + 8)); return '白馬の騎兵を率いて北方を駆けた公孫瓚は「白馬長史」と呼ばれ、異民族に恐れられた。\n公孫瓚「白馬の旗を見ただけで、敵は逃げ出すわ」\n公孫瓚の統率 +2、全都市の訓練 +8'; } },
    劉虞: { title: '北方の仁者', run: (f, l) => { Game.citiesOf(f).forEach(c => c.loyal = Math.min(100, c.loyal + 8)); up(l, 'cha', 2); return '倹約を旨とし、民をいたわる劉虞のもとには、戦乱を逃れた人々が北方から次々と身を寄せた。\n劉虞「力で従えるより、恩で結ぶほうが長く続くものだ」\n全都市の民忠 +8、劉虞の魅力 +2'; } },
    袁術: { title: '名門の驕り', run: (f, l) => { capOf(f).gold += 1200; up(l, 'cha', 1); return '袁術は名門の名にものをいわせ、各地から金品を集めさせた。\n袁術「袁家の当主に貢ぐのは当然であろう！」\n本拠の金 +1200、袁術の魅力 +1'; } },
    劉表: { title: '八俊の名声', run: (f, l) => { up(l, 'int', 2); loyF(f, 5); return '若き日より名士として「八俊」の一人に数えられた劉表。その名声は、荊州の人心をひとつにまとめた。\n劉表「荊州を戦乱から守ること、それが何よりの務めだ」\n劉表の知力 +2、家臣の忠誠 +5'; } },
    劉焉: { title: '益州に拠る', run: (f, l) => { Game.citiesOf(f).forEach(c => { c.food += 4000; c.def = Math.min(c.defMax, c.def + 50); }); up(l, 'lead', 1); return '険しい山々に囲まれた益州に拠り、劉焉は中原の争いから距離を置いて力を蓄えた。\n劉焉「天下の乱れは、益州の門の外のことよ」\n全都市の兵糧 +4000・城壁 +50、劉焉の統率 +1'; } },
    張魯: { title: '五斗米道の教え', run: (f, l) => { Game.citiesOf(f).forEach(c => c.loyal = Math.min(100, c.loyal + 8)); up(l, 'cha', 2); return '罪を犯した者には三度まで許しを与え、道を直させる――五斗米道の教えは、乱世に疲れた民の心をつかんだ。\n張魯「人の心を正しく導けば、国は自ずと治まる」\n全都市の民忠 +8、張魯の魅力 +2'; } },
    馬騰: { title: '伏波将軍の末裔', run: (f, l) => { up(l, 'war', 1); up(l, 'lead', 1); capOf(f).troops += 3000; return '後漢の名将・伏波将軍馬援の子孫を称する馬騰。その誇りに、西涼の若者たちが集った。\n馬騰「祖先の名に恥じぬ戦をするぞ」\n馬騰の武力 +1・統率 +1、本拠の兵 +3000'; } },
    陶謙: { title: '徐州の守り', run: (f, l) => { const c = capOf(f); c.def = Math.min(c.defMax, c.def + 100); c.food += 5000; up(l, 'pol', 1); return `老いてなお、陶謙は徐州の民を守るために城を固め、倉を満たした。\n陶謙「わしの目の黒いうちは、徐州を戦火に焼かせはせん」\n${c.name}の城壁 +100・兵糧 +5000、陶謙の政治 +1`; } },
    孔融: { title: '北海の文人', run: (f, l) => { const rs = gatherTo(f, 2, g => g.int >= 60); up(l, 'cha', 2); return '才気あふれる孔融の屋敷は、いつも客であふれていた。\n孔融「座には客が満ち、樽には酒が尽きぬ。これに勝る楽しみはない」\n' + (rs.length ? `在野の${rs.map(g => g.name).join('・')}が訪ねてきた（登用できる）。` : '') + '孔融の魅力 +2'; } },
    公孫度: { title: '北の果ての覇者', run: (f, l) => { capOf(f).troops += 4000; up(l, 'war', 1); return '公孫度は高句麗や烏桓と渡り合いながら、遼東の兵を鍛え上げた。\n公孫度「中原の者どもは、北の果ての力を知らぬ」\n本拠の兵 +4000、公孫度の武力 +1'; } },
    王朗: { title: '学者太守', run: (f, l) => { up(l, 'pol', 2); Game.citiesOf(f).forEach(c => pct(c, 'comm', 'commMax', 0.05)); return '経書に通じた王朗は、法と礼をもって会稽の政を整えた。\n王朗「国を治める道は、すべて書物の中にある」\n王朗の政治 +2、全都市の商業 +5%'; } },
    厳白虎: { title: '豪族の結束', run: (f, l) => { capOf(f).troops += 4000; loyF(f, 6); return '弟の厳輿とともに、厳白虎は呉郡の豪族たちをまとめ上げた。\n厳白虎「よそ者に江東を荒らされてたまるか。我らは一つだ！」\n本拠の兵 +4000、家臣の忠誠 +6'; } },
    張燕: { title: '黒山の山寨', run: (f, l) => { const c = capOf(f); c.def = Math.min(c.defMax, c.def + 120); c.troops += 3000; return `山々に散らばる砦を結び、張燕は攻めにくい守りを築いた。\n張燕「山に入れば、我ら飛燕の衆に追いつける者はいない」\n${c.name}の城壁 +120・兵 +3000`; } },
    李傕: { title: '涼州兵の意地', run: (f, l) => { Game.citiesOf(f).forEach(c => c.train = Math.min(100, c.train + 8)); up(l, 'war', 1); return '董卓亡きあとも、李傕の率いる涼州の兵は精強さを失わなかった。\n李傕「わしらを見くびった者は、皆あの世へ行ったわ」\n全都市の訓練 +8、李傕の武力 +1'; } },
    劉璋: { title: '天府の富', run: (f, l) => { Game.citiesOf(f).forEach(c => c.food += 5000); up(l, 'pol', 2); return '肥沃な益州の田畑は、今年も豊かな実りをもたらした。\n劉璋「民が飢えぬこと、それが何よりだ」\n全都市の兵糧 +5000、劉璋の政治 +2'; } },
    孫権: { title: '碧眼紫髯', run: (f, l) => { const rs = gatherTo(f, 1); up(l, 'cha', 2); loyF(f, 5); return '碧い目と紫の髭の若き君主・孫権は、身分を問わず人の話によく耳を傾けた。\n孫権「わしは兄上のように戦は上手くない。だから、皆の知恵を借りたい」\n' + (rs.length ? `在野の${rs[0].name}が訪ねてきた（登用できる）。` : '') + '孫権の魅力 +2、家臣の忠誠 +5'; } },
    金旋: { title: '武陵の太守', run: (f, l) => { capOf(f).gold += 600; up(l, 'pol', 2); Game.citiesOf(f).forEach(c => c.loyal = Math.min(100, c.loyal + 5)); return '都の官職を歴任した金旋は、武陵の民の声によく耳を傾けた。\n金旋「都で見てきた腐った政を、ここで繰り返すわけにはいかん」\n本拠の金 +600、金旋の政治 +2、全都市の民忠 +5'; } },
    劉度: { title: '父子の守り', run: (f, l) => { const c = capOf(f); c.def = Math.min(c.defMax, c.def + 80); up(l, 'lead', 1); const x = serving('劉賢'); if (x && x.faction === f) x.loyalty = Math.min(100, x.loyalty + 20); return `劉度は息子の劉賢とともに、${c.name}の守りを固めた。\n劉度「親子で守る城だ。そう簡単には落ちんぞ」\n${c.name}の城壁 +80、劉度の統率 +1` + (x && x.faction === f ? '、劉賢の忠誠 +20' : ''); } },
    趙範: { title: '桂陽の政', run: (f, l) => { up(l, 'pol', 2); Game.citiesOf(f).forEach(c => c.loyal = Math.min(100, c.loyal + 6)); return '趙範は、桂陽の民の暮らしを立て直すことに力を注いだ。\n趙範「小さな郡でも、民が安らかなら誇れる国だ」\n趙範の政治 +2、全都市の民忠 +6'; } },
    孟獲: { title: '南中の盟主', run: (f, l) => { capOf(f).troops += 5000; up(l, 'cha', 2); return '負けず嫌いで豪胆な孟獲は、南中の諸部族の盟主として仰がれた。\n孟獲「わしが負けを認めぬ限り、南中は負けておらんのだ！」\n本拠の兵 +5000、孟獲の魅力 +2'; } },
  };
  // 上の10人以外：その君主の人物像（君主紹介）にちなむ「志」のイベント。得意な能力が伸びる
  const STAT_JP = { lead: '統率', war: '武力', int: '知力', pol: '政治', cha: '魅力' };
  function gatherTo(f, n, pred) { const cap = capOf(f); const rs = shuffle(G.gens.filter(g => g.state === 'ronin' && g.name !== '諸葛亮' && (!pred || pred(g)))).slice(0, n); rs.forEach(g => { g.city = cap.i; g.known = true; }); return rs; }
  function loyF(f, v) { Game.gensOf(f).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + v); }); }
  Object.keys(mainIdOf).forEach(name => {
    const mainId = mainIdOf[name];
    HIST.push({ id: mainId + '_alt', title: (ALT[name] ? ALT[name].title : `${name}の志`), chance: 0.5,
      cond: () => { const f = LF(name); return f >= 0 && !(G.events.hist && G.events.hist[mainId]) && G.year >= startYear() + 3; },
      run: () => {
        const f = LF(name), l = Game.lordOf(f);
        (G.events.hist = G.events.hist || {})[mainId] = true;   // 本来のイベントは、もう起きない
        let text;
        if (ALT[name]) text = ALT[name].run(f, l);
        else {
          const k = ['lead', 'war', 'int', 'pol', 'cha'].sort((a, b) => l[b] - l[a])[0];
          up(l, k, 2); loyF(f, 4); capOf(f).gold += 500;
          const bio = (typeof Flavor !== 'undefined' && Flavor.bio && Flavor.bio(name)) || '';
          text = `${bio}\n${name}「${voice(l, 'big')}」\n${name}の${STAT_JP[k]} +2、家臣の忠誠 +4、本拠の金 +500`;
        }
        return { title: ALT[name] ? ALT[name].title : `${name}の志`, gen: name, expr: 'happy', fac: f, text };
      } });
  });

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


  // ================================================================
  //  進捗イベント（天下の歩み）
  //  ・誰でも起きる：都市の数の節目／要地（洛陽・長安など）を得た時
  //  ・天下の形：残りの勢力が5つ（五覇）・3つ（三国鼎立）・2つ（天下二分。司馬氏がいれば政変で国が割れる）
  //  ・一時は大国だった勢力（最大8都市以上）が滅んだ時
  //  ・君主ごとに台詞が変わる（その人物らしい言葉）
  //  ・ボーナス：能力の上昇・忠誠・民忠・金や兵糧・人材が集まる など
  // ================================================================
  const up99 = (g, k, v) => { if (g) g[k] = Math.min(99, Math.max(1, g[k] + v)); };
  const VOICE = {
    曹操: { win: ['よし。だが、天下はまだ遠いぞ', '才ある者は身分を問わず用いよ。この勢い、止めてはならん'], big: '天下の英雄は、残るところわずか。ふふ……面白くなってきたわ' },
    劉備: { win: ['民が安らかに暮らせる地が、また一つ増えた', 'みなの力あってこそだ。驕らず進もう'], big: '漢室の再興まで、あと少しだ。皆、もうひと踏ん張りしてくれ' },
    孫権: { win: ['父上と兄上が遺した地を、さらに広げることができた', '江東の守りを固めつつ、次を狙う'], big: '江東の孫権が、天下を語る日が来ようとはな' },
    孫策: { win: ['はっはっは！ この勢いのまま突き進むぞ！'], big: '小覇王の名、天下に轟かせてやる！' },
    孫堅: { win: ['江東の虎の牙、まだ鈍ってはおらん'], big: '孫家の旗を、天下に立てる時が来た' },
    袁紹: { win: ['四世三公の名門に、ふさわしい勢いよ'], big: '天下は名門袁家のもとに一つになるのだ' },
    袁術: { win: ['見よ、天命はやはりこの袁術にある！'], big: '玉璽を持つ者こそ天下の主よ！' },
    呂布: { win: ['ふん、弱い者ばかりだ'], big: '天下最強はこの呂布。それを皆に教えてやる' },
    董卓: { win: ['逆らう者は根絶やしにせよ'], big: '天下はわしのものだ。誰にも渡さん' },
    馬騰: { win: ['西涼の騎馬の力、思い知ったか'], big: '西涼の旗を、都に翻してみせよう' },
    公孫瓚: { win: ['白馬義従の駆けるところ、敵はなし'], big: '北の雄が天下を取る日も近い' },
    劉表: { win: ['荊州の安らぎを、さらに広げよう'], big: '荊州を守るだけのつもりが……天下が見えてきたか' },
    劉璋: { win: ['益州の民のためにも、負けられぬ'], big: '天府の国から、天下を目指す時が来た' },
  };
  const VOICE_TRAIT = [['仁徳', '民の暮らしを第一に、着実に進もう'], ['野心', 'まだだ。天下を取るまで、止まりはせぬ'], ['猪突', 'がはは！ この調子で次も攻め取るぞ！'], ['治世', '得た地を治めてこそ、真の勝利だ'], ['_', '皆、よくやってくれた。次の一歩も頼むぞ']];
  const voice = (lord, kind) => { const v = VOICE[lord.name]; if (v && v[kind]) return Array.isArray(v[kind]) ? pick(v[kind]) : v[kind]; return (VOICE_TRAIT.find(([k]) => k === '_' || Game.has(lord, k)) || VOICE_TRAIT[4])[1]; };
  const myCap = () => G.cities[G.factions[G.player].capital];
  // 人材が集まる：在野の人物を n 人、本拠へ招く（諸葛亮は三顧の礼のため除く）
  function gather(n) { const cap = myCap(); const rs = shuffle(G.gens.filter(g => g.state === 'ronin' && g.name !== '諸葛亮')).slice(0, n); rs.forEach(g => { g.city = cap.i; g.known = true; }); return rs; }
  const loyAll = v => Game.gensOf(G.player).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + v); });
  const cityAll = (k, v, max = 100) => Game.citiesOf(G.player).forEach(c => c[k] = Math.min(max, c[k] + v));

  // 都市の数の節目
  const CITY_MS = [
    { n: 3, title: '旗揚げの地固め', text: '三つの城を治め、一勢力として名が知られ始めた。', bonus: () => { myCap().gold += 300; return '本拠の金 +300'; } },
    { n: 5, title: '群雄の一角', text: '五つの城を数え、群雄の一角に数えられるようになった。各地から仕官を望む者が訪ねてくる。', bonus: () => { const rs = gather(2); loyAll(3); return (rs.length ? `在野の${rs.map(g => g.name).join('・')}が本拠を訪ねてきた（登用できる）。` : '') + '家臣の忠誠 +3'; } },
    { n: 8, title: '一州の主', text: '八つの城を従え、一州に号令する力を得た。', bonus: () => { const l = Game.lordOf(G.player); up99(l, 'lead', 1); up99(l, 'cha', 1); cityAll('loyal', 3); return `${l.name}の統率 +1・魅力 +1、全都市の民忠 +3`; } },
    { n: 12, title: '天下に覇を唱える', text: '十二の城を擁し、天下の諸侯がその動きを注視している。', bonus: () => { const l = Game.lordOf(G.player); up99(l, 'cha', 2); loyAll(5); myCap().gold += 800; return `${l.name}の魅力 +2、家臣の忠誠 +5、本拠の金 +800`; } },
    { n: 16, title: '天下の半ばへ', text: '十六の城。天下の地図の多くが、我が旗の色に染まり始めた。', bonus: () => { const l = Game.lordOf(G.player); ['lead', 'war', 'int', 'pol', 'cha'].sort((a, b) => l[b] - l[a]).slice(0, 2).forEach(k => up99(l, k, 1)); cityAll('train', 5); const rs = gather(2); return `${l.name}の得意な能力 +1（2つ）、全都市の訓練 +5` + (rs.length ? `。在野の${rs.map(g => g.name).join('・')}が本拠を訪ねてきた` : ''); } },
    { n: 22, title: '天下の大勢、決す', text: '二十を超える城を治め、天下の大勢は我が方に傾きつつある。', bonus: () => { loyAll(8); cityAll('loyal', 5); Game.citiesOf(G.player).forEach(c => c.food += 3000); return '家臣の忠誠 +8、全都市の民忠 +5・兵糧 +3000'; } },
    { n: 30, title: '天下統一の目前', text: '三十の城。残る敵は、もはや天下の片隅に追いやられている。', bonus: () => { const l = Game.lordOf(G.player); up99(l, 'cha', 3); loyAll(10); return `${l.name}の魅力 +3、家臣の忠誠 +10`; } },
  ];
  // 要地を得た時
  const REGION = {
    luoyang: { title: '洛陽入城', text: '漢の都・洛陽を手中に収めた。荒れ果てた宮殿にも、天下の中心としての重みがある。', bonus: c => { const l = Game.lordOf(G.player); up99(l, 'cha', 2); c.loyal = Math.min(100, c.loyal + 10); return `${l.name}の魅力 +2、洛陽の民忠 +10`; } },
    changan: { title: '旧都・長安', text: '前漢の都・長安を得た。関中の守りと豊かな地が、我が国の背を支える。', bonus: c => { c.def = Math.min(c.defMax, c.def + 100); c.food += 5000; return '長安の城壁 +100・兵糧 +5000'; } },
    xuchang: { title: '許都を押さえる', text: '許昌を手に入れた。中原の要として、多くの人と物が集まる地である。', bonus: c => { const rs = gather(1); c.gold += 600; return '許昌の金 +600' + (rs.length ? `。在野の${rs[0].name}が本拠を訪ねてきた` : ''); } },
    ye: { title: '河北の要・鄴', text: '鄴を得た。河北の富と兵が、我が軍の力となる。', bonus: c => { cityAll('train', 4); c.troops += 3000; return '全都市の訓練 +4、鄴の兵 +3000'; } },
    chengdu: { title: '天府の国', text: '成都を手に入れた。肥沃な益州の地は「天府の国」と呼ばれる。', bonus: c => { Game.citiesOf(G.player).forEach(x => x.food += 2500); c.loyal = Math.min(100, c.loyal + 8); return '全都市の兵糧 +2500、成都の民忠 +8'; } },
    jianye: { title: '江東の要・建業', text: '建業を押さえた。長江の流れが、天然の守りとなる。', bonus: c => { c.def = Math.min(c.defMax, c.def + 120); const l = Game.lordOf(G.player); up99(l, 'lead', 1); return `建業の城壁 +120、${l.name}の統率 +1`; } },
    xiangyang: { title: '荊州の要・襄陽', text: '襄陽を得た。四方に通じる荊州の要には、名士も多く集まる。', bonus: c => { const rs = gather(2); return rs.length ? `在野の${rs.map(g => g.name).join('・')}が本拠を訪ねてきた（登用できる）` : '荊州の名士たちが、我が軍に好意を寄せている'; } },
    hanzhong: { title: '漢中を制す', text: '漢中を得た。益州と関中をつなぐ要の地である。', bonus: c => { c.def = Math.min(c.defMax, c.def + 80); loyAll(3); return '漢中の城壁 +80、家臣の忠誠 +3'; } },
  };
  // 司馬氏の政変：残り2勢力になった時、コンピュータの国に仕える司馬氏が国を二つに割る
  const SIMA = ['司馬懿', '司馬師', '司馬昭'];
  // 司馬氏の政変：天下が二つになった時、司馬懿（いなければ司馬師・司馬昭）が仕える勢力から、
  //  都市の三分の一を地続きで持って独立する。もう一方の勢力と同盟を結び、手を組める場所（相手と接する所）を選ぶ。
  //  魏に仕えた人々（曹・夏侯の一族は除く）が多く従う。離反する都市に残った元の勢力の将は、隣の自領へ均等に移る
  const WEI_LATE = ['司馬孚', '司馬望', '鄧艾', '鍾会', '賈充', '王基', '陳泰', '郭淮', '毌丘倹', '諸葛誕', '王昶', '杜預', '羊祜', '衛瓘', '胡質', '王凌', '孫礼', '辛毗', '高柔', '陳矯', '牽招', '田豫', '楽綝', '文鴦', '王双', '費曜', '戴陵', '鄧忠', '石苞', '州泰'];
  const SIMA_CLOSE = ['鄧艾', '鍾会', '賈充', '王基', '陳泰', '郭淮', '杜預', '羊祜', '衛瓘', '胡質', '王昶', '孫礼', '蒋済', '高柔', '石苞'];
  function weiSet() {
    const w = new Set(WEI_LATE);
    SCENARIOS.forEach(sc => sc.lords.forEach(L => { if (L[0] === '曹操' || L[0] === '曹丕') L[3].forEach(n => w.add(n)); }));
    if (typeof GEN_FATHER !== 'undefined') Object.entries(GEN_FATHER).forEach(([ch, fa]) => { if (w.has(fa)) w.add(ch); });
    return w;
  }
  const isCaoClan = n => n.startsWith('曹') || n.startsWith('夏侯');
  function simaCoup() {
    const alive = G.factions.filter(f => f.alive);
    if (alive.length !== 2) return null;
    const sima = SIMA.map(serving).filter(g => g && !g.isLord && g.faction >= 0 && G.factions[g.faction] && G.factions[g.faction].alive);
    if (!sima.length) return null;
    const head = sima[0], fi = head.faction, f = G.factions[fi];
    const other = alive.find(x => x.i !== fi);
    const mine = Game.citiesOf(fi);
    if (mine.length < 3) return null;
    const want = Math.max(1, Math.round(mine.length / 3));
    // 起点：もう一方の勢力と接する都市（司馬氏のいる都市を優先）。本拠は除く
    const touchesOther = c => c.adj.some(a => G.cities[a].owner === other.i);
    const cand = mine.filter(c => c.i !== f.capital);
    if (!cand.length) return null;
    const hc = G.cities[head.city];
    const start = (hc.owner === fi && hc.i !== f.capital && touchesOther(hc)) ? hc : (cand.filter(touchesOther).sort((a, b) => Game.gensIn(b.i, fi).filter(g => sima.includes(g)).length - Game.gensIn(a.i, fi).filter(g => sima.includes(g)).length)[0] || (hc.owner === fi && hc.i !== f.capital ? hc : cand[0]));
    // 地続きに広げる。相手と接する都市を先に取り、同盟相手と連携しやすい形にする
    const take = new Set([start.i]);
    while (take.size < want) {
      const front = [];
      take.forEach(ci => G.cities[ci].adj.forEach(a => { const o = G.cities[a]; if (o.owner === fi && o.i !== f.capital && !take.has(o.i) && !front.includes(o)) front.push(o); }));
      if (!front.length) break;
      front.sort((a, b) => (touchesOther(b) ? 1 : 0) - (touchesOther(a) ? 1 : 0) || b.adj.filter(x => take.has(x)).length - a.adj.filter(x => take.has(x)).length);
      take.add(front[0].i);
    }
    const nf = { i: G.factions.length, name: head.name, color: '#5a5a8c', lord: head.i, alive: true, capital: start.i, allies: {}, isPlayer: false, hostility: {} };
    G.factions.push(nf);
    // 従う者：司馬一族 → 司馬氏に近い魏の重臣 → ほかの魏の人々（曹・夏侯の一族と君主は除く）。多くても勢力の将の三分の一まで
    const W = weiSet();
    const all = Game.gensOf(fi).filter(g => !g.isLord);
    const rank = g => SIMA.includes(g.name) ? 0 : SIMA_CLOSE.includes(g.name) ? 1 : 2;
    let followers = all.filter(g => SIMA.includes(g.name) || (W.has(g.name) && !isCaoClan(g.name))).sort((a, b) => rank(a) - rank(b) || (b.lead + b.war + b.int) - (a.lead + a.war + a.int));
    if (fi === G.player) followers = followers.slice(0, Math.max(sima.length, Math.round(all.length / 3)));   // 自軍からは多くても将の三分の一まで
    else if (followers.length < take.size) {   // 敵軍の政変：魏ゆかりの将は皆つく。城の数に足りなければ、離反する城にいた将（曹・夏侯の一族と忠義の者は除く）が加わる
      const extra = all.filter(g => !followers.includes(g) && take.has(g.city) && !isCaoClan(g.name) && !Game.has(g, '忠義')).sort((a, b) => (b.lead + b.war) - (a.lead + a.war));
      followers = followers.concat(extra.slice(0, take.size - followers.length));
    }
    take.forEach(ci => { G.cities[ci].owner = nf.i; });
    const takeArr = [...take];
    followers.forEach((g, k) => {
      g.faction = nf.i; g.isLord = false; g.loyalty = SIMA.includes(g.name) ? 95 : irnd(75, 92); g.acted = false;
      if (!take.has(g.city)) g.city = takeArr[k % takeArr.length];
    });
    head.isLord = true; head.loyalty = 100; head.city = start.i;
    // 離反した都市に残った元の勢力の将は、隣の自領の都市へ均等に移る（隣がなければ本拠へ）
    const stay = Game.gensOf(fi).filter(g => take.has(g.city));
    const dest = Game.citiesOf(fi).filter(c => c.adj.some(a => take.has(a)));
    const pool = dest.length ? dest : [G.cities[f.capital]];
    stay.sort((a, b) => a.city - b.city).forEach((g, k) => { g.city = pool[k % pool.length].i; });
    // もう一方の勢力と同盟を結ぶ
    nf.allies[other.i] = CONFIG.ALLY_TURNS; other.allies[nf.i] = CONFIG.ALLY_TURNS;   // 残る勢力と同盟（ふつうの同盟と同じく2年）
    Game.log(`${head.name}が政変を起こし、${take.size}の城とともに${f.name}軍から独立した。${other.name}軍と同盟を結んだ。`);
    return { head, f, other, n: take.size, followers, moved: stay.length, mine: fi === G.player };
  }
  // 初めて：ゲーム開始時点ですでに満たしている節目は、起きたことにしておく（「得た時」だけ起こす）
  function initProg() {
    const P0 = G.events.prog = { cities: {}, region: {}, fac: {}, fell: {} };
    const n0 = Game.citiesOf(G.player).length, a0 = G.factions.filter(f => f.alive).length;
    CITY_MS.forEach(m => { if (n0 >= m.n) P0.cities[m.n] = true; });
    Object.keys(REGION).forEach(id => { const c = G.cities.find(x => x.id === id); if (c && c.owner === G.player) P0.region[id] = true; });
    [5, 3, 2].forEach(k => { if (a0 <= k) P0.fac[k] = true; });
    G.factions.forEach(f => { if (!f.alive) P0.fell[f.i] = true; else f.maxCities = Game.citiesOf(f.i).length; });
  }
  function progEvents() {
    if (!G.factions[G.player] || !G.factions[G.player].alive) return [];
    if (!G.events.prog) initProg();
    const P = G.events.prog;
    const ev = [], lord = Game.lordOf(G.player), col = G.factions[G.player].color;
    const push = (title, msg, gen, tag, extra) => ev.push(Object.assign({ type: 'hist', title, msg, gen: gen ? gen.i : null, expr: 'happy', tag, talk: true, hist: true, se: 'bell' }, extra || {}));
    // 都市の数の節目（季節に1つまで）
    const n = Game.citiesOf(G.player).length;
    const ms = CITY_MS.filter(m => n >= m.n && !P.cities[m.n]);
    if (ms.length) {
      ms.forEach(m => P.cities[m.n] = true);
      const m = ms[ms.length - 1];
      const b = m.bonus();
      Game.log(`【${m.title}】${m.text}`);
      push(m.title, `${m.text}\n${lord.name}「${voice(lord, 'win')}」\n<small>${b}</small>`, lord, '天下の歩み');
    }
    // 要地を得た時（季節に2つまで）
    let rg = 0;
    Object.keys(REGION).forEach(id => {
      const c = G.cities.find(x => x.id === id);
      if (!c || c.owner !== G.player || P.region[id] || rg >= 2) return;
      P.region[id] = true; rg++;
      const r = REGION[id], b = r.bonus(c);
      Game.log(`【${r.title}】${r.text}`);
      const sp = Game.gensIn(c.i, G.player).filter(g => !g.isLord).sort((a, b2) => b2.int - a.int)[0] || lord;
      push(r.title, `${r.text}\n<small>${b}</small>`, sp, '天下の歩み');
    });
    // 一時は大国だった勢力が滅んだ
    G.factions.forEach(f => {
      if (f.alive) { f.maxCities = Math.max(f.maxCities || 0, Game.citiesOf(f.i).length); return; }
      if (P.fell[f.i] || (f.maxCities || 0) < 8 || f.i === G.player) { P.fell[f.i] = true; return; }
      P.fell[f.i] = true;
      const cap = G.cities[f.capital], by = cap ? cap.owner : null;
      const old = G.gens[f.lord];
      if (by === G.player) {
        loyAll(8); up99(lord, 'cha', 2); Game.citiesOf(G.player).forEach(c => c.loyal = Math.min(100, c.loyal + 4));
        push('巨星墜つ', `かつて${f.maxCities}の城を誇った${f.name}軍が、我が軍の前に滅んだ。\n${lord.name}「${voice(lord, 'big')}」\n<small>家臣の忠誠 +8、${lord.name}の魅力 +2、全都市の民忠 +4</small>`, lord, '天下の歩み', { se: 'coronation' });
      } else {
        push('巨星墜つ', `かつて${f.maxCities}の城を誇った${f.name}軍が滅んだ。${by != null && G.factions[by] ? G.factions[by].name + '軍の勢いは侮れない。' : ''}\n栄華を極めた国も、滅びる時は一瞬である。`, old, '天下の動き', { expr: 'sad', se: 'event' });
      }
    });
    // 天下の形：残りの勢力の数
    const alive = G.factions.filter(f => f.alive && Game.citiesOf(f.i).length > 0);
    const names = alive.map(f => `${f.name}（${Game.citiesOf(f.i).length}城）`).join('・');
    const stage = alive.length <= 2 ? 2 : alive.length <= 3 ? 3 : alive.length <= 5 ? 5 : 0;
    if (stage && !P.fac[stage]) {
      [5, 3, 2].forEach(k => { if (k >= stage) P.fac[k] = true; });
      if (stage === 5) {
        loyAll(5); cityAll('train', 5);
        push('五雄並び立つ', `天下に残る勢力は五つとなった。\n${names}\n群雄割拠の時代は終わり、覇を競う五雄の時代が始まる。\n${lord.name}「${voice(lord, 'big')}」\n<small>家臣の忠誠 +5、全都市の訓練 +5</small>`, lord, '天下の形');
      } else if (stage === 3) {
        up99(lord, 'cha', 2); loyAll(5); cityAll('loyal', 5);
        push('三国鼎立', `天下は三つに分かれた。\n${names}\n鼎の三本の足のように、三つの国が並び立つ。\n${lord.name}「${voice(lord, 'big')}」\n<small>${lord.name}の魅力 +2、家臣の忠誠 +5、全都市の民忠 +5</small>`, lord, '天下の形', { se: 'coronation' });
      } else {
        const coup = simaCoup();
        const mySima = SIMA.map(serving).find(g => g && g.faction === G.player && !g.isLord);
        if (coup) {
          const fl = coup.followers.filter(g => g !== coup.head).slice(0, 5).map(g => g.name);
          push('天下二分、そして政変', coup.mine
            ? `天下は二つの国に分かれた——と思われた矢先、我が軍で政変が起きた。\n${coup.head.name}が兵を挙げ、${coup.n}の城とともに独立した！${fl.length ? `\n${fl.join('、')}${coup.followers.length - 1 > fl.length ? 'ら' : ''}が${coup.head.name}に従った。` : ''}\n${coup.head.name}は${coup.other.name}軍と同盟を結び、天下は再び三つに割れた。${coup.moved ? `\n<small>離反した城に残った将${coup.moved}人は、隣の城へ移った</small>` : ''}`
            : `天下は二つの国に分かれた——と思われた矢先、${coup.f.name}軍で政変が起きた。\n${coup.head.name}が兵を挙げ、${coup.n}の城とともに${coup.f.name}軍から離れた！${fl.length ? `\n${fl.join('、')}${coup.followers.length - 1 > fl.length ? 'ら' : ''}が${coup.head.name}に従った。` : ''}\n${coup.head.name}は我が軍と同盟を結んだ。天下は再び三つに割れた。`,
            coup.head, '天下の形', { expr: 'angry', se: 'gong' });
        } else {
          loyAll(10); const l2 = lord; ['lead', 'war', 'int', 'pol', 'cha'].sort((a, b) => l2[b] - l2[a]).slice(0, 1).forEach(k => up99(l2, k, 2));
          push('天下二分', `天下は二つに分かれた。\n${names}\n残るは、雌雄を決する最後の戦いのみ。\n${lord.name}「${voice(lord, 'big')}」\n<small>家臣の忠誠 +10、${lord.name}の得意な能力 +2</small>` + (mySima ? `\n<small>${mySima.name}が、何やら静かに天下の形を見つめている……（忠誠 −10）</small>` : ''), lord, '天下の形', { se: 'coronation' });
          if (mySima && !Game.has(mySima, '忠義')) mySima.loyalty = Math.max(0, mySima.loyalty - 10);
        }
      }
    }
    return ev;
  }

  return {
    run() { return [...crownEvents(), ...histEvents(), ...progEvents(), ...topEvents(), ...randomEvents(), ...bigEvents()]; },
    bigK, initProg,
    rankName,
    counts: () => ({ city: CITY.length, gen: GEN.length, hist: HIST.length }),
    MEET, FACE,
    _HIST: HIST,
  };
})();
