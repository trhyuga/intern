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

  // ---------------- 君主ごとのイベント（選べる全君主） ----------------
  // その君主の特徴・こだわりにちなむ。史実にもとづくもの（史実）と、史実と違う展開（もしも）がある。
  // 史実の部分は、君主紹介（flavor.js の LORD_BIO）と同じ、よく知られた逸話にもとづく
  const LF = n => facByLord(n);
  const capOf = fi => G.cities[G.factions[fi].capital];
  const joinIf = (n, fi, ci) => { const g = G_(n); if (g && g.state === 'ronin') { Game.joinFaction(g, fi, ci); return g; } return null; };
  const allyWith = (a, b) => { G.factions[a].allies[b] = CONFIG.ALLY_TURNS; G.factions[b].allies[a] = CONFIG.ALLY_TURNS; };
  const IF = '<small>（もしもの物語）</small>';
  const LORD_EVENTS = [
    { id: 'l_dongzhuo', title: '郿塢の蓄え', chance: 0.4, cond: () => { const f = LF('董卓'); return f >= 0 && owns(f, '長安'); },
      run: () => { const f = LF('董卓'), c = cityByName('長安'); c.food += 15000; c.gold += 1000; Game.citiesOf(f).forEach(x => x.loyal = Math.max(0, x.loyal - 5));
        return { title: '郿塢の蓄え', gen: '董卓', expr: 'happy', fac: f, text: '董卓は長安の西に城塞・郿塢を築き、三十年分ともいわれる穀物と財宝を蓄えた。\n長安の兵糧 +15000・金 +1000。ただし取り立ての厳しさに、全都市の民忠 −5' }; } },
    { id: 'l_yuanshao', title: '河北四州の盟主', chance: 0.4, cond: () => { const f = LF('袁紹'); return f >= 0 && owns(f, '鄴') && owns(f, '南皮') && Game.citiesOf(f).length >= 4; },
      run: () => { const f = LF('袁紹'), l = Game.lordOf(f); Game.gensOf(f).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + 6); }); up(l, 'cha', 2);
        return { title: '河北四州の盟主', gen: '袁紹', expr: 'happy', fac: f, text: '鄴と南皮を押さえた袁紹のもとに、河北の名士と兵が集まった。名門袁家の威光は、いま頂点にある。\n袁紹の魅力 +2、家臣の忠誠 +6' }; } },
    { id: 'l_hanfu', title: '冀州は譲らぬ', chance: 0.5, cond: () => { const f = LF('韓馥'); return f >= 0 && owns(f, '鄴') && G.year >= 191; },
      run: () => { const f = LF('韓馥'), l = Game.lordOf(f), c = cityByName('鄴'); up(l, 'lead', 3); up(l, 'int', 2); c.def = Math.min(c.defMax, c.def + 150);
        return { title: '冀州は譲らぬ', gen: '韓馥', expr: 'angry', fac: f, text: '史実の韓馥は、袁紹の圧力に屈して冀州を譲り渡した。だがこの天下では――\n韓馥「冀州の民を、名門の看板ひとつで明け渡してなるものか！」\n韓馥の統率 +3・知力 +2、鄴の城壁 +150\n' + IF }; } },
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
        return { title: '恩と信義', gen: '劉虞', expr: 'happy', fac: f, text: `劉虞の恩と信義に感じ入った北方の異民族が、友好の証として騎兵を送ってきた。\n全都市の民忠 +12、${cap.name}の兵 +3000、劉虞の魅力 +2\n` + IF }; } },
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
          return { title: '徐州を託す', gen: '陶謙', expr: 'happy', fac: f, text: '史実の陶謙は、臨終にあたって劉備に徐州を託したと伝わる。この天下では、陶謙が自ら劉備を招いた――\n陶謙「わしは老いた。徐州の民を、そなたの仁徳で守ってやってくれ」\n' + `${j.map(g => g.name).join('・')}が陶謙軍に加わった\n` + IF }; }
        const fl = LF('劉備'); allyWith(f, fl); up(Game.lordOf(f), 'cha', 2);
        return { title: '徐州を託す', gen: '陶謙', expr: 'happy', fac: f, text: '史実の陶謙は、臨終にあたって劉備に徐州を託したと伝わる。この天下では、陶謙は劉備に使者を送り、固い盟を結んだ――\n陶謙「劉玄徳どのの仁徳を、わしは信じておる」\n陶謙軍と劉備軍が同盟、陶謙の魅力 +2\n' + IF }; } },
    { id: 'l_kongrong', title: '梨を譲る心', chance: 0.4, cond: () => { const f = LF('孔融'); return f >= 0 && G.year >= 191; },
      run: () => { const f = LF('孔融'), cap = capOf(f); up(Game.lordOf(f), 'cha', 3); Game.gensOf(f).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + 6); }); const rs = shuffle(G.gens.filter(g => g.state === 'ronin' && g.name !== '諸葛亮' && g.int >= 60)).slice(0, 2); rs.forEach(g => { g.city = cap.i; g.known = true; });
        return { title: '梨を譲る心', gen: '孔融', expr: 'happy', fac: f, text: '幼い日に大きな梨を兄に譲った孔融。その謙譲の心と学識を慕って、文人たちが北海に集まった。\n孔融の魅力 +3、家臣の忠誠 +6' + (rs.length ? `、在野の${rs.map(g => g.name).join('・')}が訪ねてきた（登用できる）` : '') }; } },
    { id: 'l_gongsundu', title: '遼東の王', chance: 0.45, cond: () => { const f = LF('公孫度'); return f >= 0 && owns(f, '襄平'); },
      run: () => { const f = LF('公孫度'), c = cityByName('襄平'); c.def = Math.min(c.defMax, c.def + 150); c.troops += 4000; up(Game.lordOf(f), 'lead', 2);
        return { title: '遼東の王', gen: '公孫度', expr: 'normal', fac: f, text: '中原の戦乱をよそに、公孫度は遼東で自立し、高句麗や烏桓とも渡り合って北の果てに独自の国を築いた。\n襄平の城壁 +150・兵 +4000、公孫度の統率 +2' }; } },
    { id: 'l_wanglang', title: '経書の講義', chance: 0.4, cond: () => { const f = LF('王朗'); return f >= 0 && G.year >= 191; },
      run: () => { const f = LF('王朗'); up(Game.lordOf(f), 'pol', 2); shuffle(Game.gensOf(f).filter(g => !g.isLord)).slice(0, 3).forEach(g => { up(g, 'int', 1); up(g, 'pol', 1); });
        return { title: '経書の講義', gen: '王朗', expr: 'normal', fac: f, text: '経書に通じた王朗は、配下の将にも学問を説いた。武骨な将たちも、少しずつ書を読むようになった。\n王朗の政治 +2、家臣3人の知力・政治 +1\n' + IF }; } },
    { id: 'l_yanbaihu', title: '東呉の徳王', chance: 0.45, cond: () => { const f = LF('厳白虎'); return f >= 0 && owns(f, '呉'); },
      run: () => { const f = LF('厳白虎'), c = cityByName('呉'); c.troops += 5000; up(Game.lordOf(f), 'war', 2);
        return { title: '東呉の徳王', gen: '厳白虎', expr: 'angry', fac: f, text: '厳白虎「江東は我ら厳家のものよ。若造の孫策などに渡すものか！」\n厳白虎は「東呉の徳王」を名乗り、呉郡の豪族たちを束ねた。\n呉の兵 +5000、厳白虎の武力 +2' }; } },
    { id: 'l_liuyao', title: '同郷のよしみ', chance: 0.5, cond: () => { const f = LF('劉繇'); const t = G_('太史慈'); return f >= 0 && t && (t.state === 'ronin' || (t.state === 'serve' && t.faction === f)); },
      run: () => { const f = LF('劉繇'), t = G_('太史慈'); if (t.state === 'ronin') Game.joinFaction(t, f, capOf(f).i); t.loyalty = Math.max(t.loyalty, 90); up(Game.lordOf(f), 'cha', 1);
        return { title: '同郷のよしみ', gen: '太史慈', expr: 'happy', fac: f, text: '劉繇「子義（太史慈）よ、同郷のよしみだ。そなたの武勇、存分に振るってくれ」\n史実では太史慈を重く用いなかった劉繇が、この天下ではその力を信じた。\n太史慈が劉繇軍の将として奮い立った（忠誠 90以上）\n' + IF }; } },
    { id: 'l_zhangyan', title: '飛燕、百万を号す', chance: 0.45, cond: () => { const f = LF('張燕'); return f >= 0 && G.year >= 191; },
      run: () => { const f = LF('張燕'), cap = capOf(f); cap.troops += 6000; const l = Game.lordOf(f); up(l, 'war', 1); up(l, 'lead', 1);
        return { title: '飛燕、百万を号す', gen: '張燕', expr: 'angry', fac: f, text: `山々に散る黒山の衆が、「飛燕」張燕のもとに続々と集まってきた。\n${cap.name}の兵 +6000、張燕の武力・統率 +1` }; } },
    { id: 'l_lubu', title: '轅門射戟', chance: 0.4, cond: () => { const f = LF('呂布'), fl = LF('劉備'); return f >= 0 && fl >= 0 && fl !== f && !Game.isAlly(f, fl) && G.year >= 195; },
      run: () => { const f = LF('呂布'), fl = LF('劉備'); allyWith(f, fl); up(Game.lordOf(f), 'cha', 2);
        return { title: '轅門射戟', gen: '呂布', expr: 'happy', fac: f, big: true, text: '呂布「わしが門に立てた戟の小枝を一矢で射抜いたら、この戦はやめてもらおう」\n呂布の矢は見事に小枝を射抜き、劉備と袁術軍の争いは収まった。この天下では、これを機に呂布は劉備と手を結ぶ――\n呂布軍と劉備軍が同盟、呂布の魅力 +2\n' + IF }; } },
    { id: 'l_sunce', title: '神亭の一騎討ち', chance: 0.5, cond: () => { const f = LF('孫策'); const t = G_('太史慈'); return f >= 0 && t && (t.state === 'ronin' || (t.state === 'serve' && t.faction !== f && !t.isLord && Game.citiesOf(t.faction).length <= 2)); },
      run: () => { const f = LF('孫策'), t = G_('太史慈'); Game.joinFaction(t, f, capOf(f).i); t.loyalty = 95; up(Game.lordOf(f), 'cha', 1);
        return { title: '神亭の一騎討ち', gen: '太史慈', expr: 'happy', fac: f, big: true, text: '神亭で一騎討ちを演じ、互いの武勇を認め合った孫策と太史慈。\n孫策「子義、おぬしほどの男を敵にしておくのは惜しい。わしと共に来い」\n太史慈が孫策軍に加わった' }; } },
    { id: 'l_zhangxiu', title: '賈詡の献策', chance: 0.45, cond: () => { const f = LF('張繍'); return f >= 0 && facOf('賈詡') === f; },
      run: () => { const f = LF('張繍'); up(Game.lordOf(f), 'int', 3); Game.citiesOf(f).forEach(c => c.train = Math.min(100, c.train + 8)); const j = G_('賈詡'); j.loyalty = Math.min(100, j.loyalty + 10);
        return { title: '賈詡の献策', gen: '賈詡', expr: 'normal', fac: f, text: '賈詡「追う時を誤らなければ、寡兵でも勝てまする」\n張繍は賈詡の言葉をよく聞き、兵の動かし方を学んだ。\n張繍の知力 +3、全都市の訓練 +8、賈詡の忠誠 +10' }; } },
    { id: 'l_lijue', title: '長安の実権', chance: 0.45, cond: () => { const f = LF('李傕'); return f >= 0 && owns(f, '長安'); },
      run: () => { const f = LF('李傕'), c = cityByName('長安'); c.gold += 1500; Game.gensOf(f).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + 5); }); c.loyal = Math.max(0, c.loyal - 8);
        return { title: '長安の実権', gen: '李傕', expr: 'happy', fac: f, text: '朝廷を思うままにする李傕は、官位と財宝を配下にばらまいて歓心を買った。\n長安の金 +1500、家臣の忠誠 +5。ただし長安の民忠 −8\n' + IF }; } },
    { id: 'l_liuzhang', title: '劉璋、決断す', chance: 0.4, cond: () => { const f = LF('劉璋'); return f >= 0 && owns(f, '成都') && G.year >= 200; },
      run: () => { const f = LF('劉璋'), l = Game.lordOf(f); up(l, 'lead', 3); up(l, 'int', 2); Game.citiesOf(f).forEach(c => c.food += 4000);
        return { title: '劉璋、決断す', gen: '劉璋', expr: 'angry', fac: f, text: '温和だが決断に欠けると言われた劉璋。だがこの天下では、益州の危機を前に腹をくくった――\n劉璋「父上から受け継いだ益州、この手で守り抜く！」\n劉璋の統率 +3・知力 +2、全都市の兵糧 +4000\n' + IF }; } },
    { id: 'l_sunquan', title: '碧眼児、江東を固める', chance: 0.4, cond: () => { const f = LF('孫権'); return f >= 0 && ['建業', '呉', '会稽'].filter(n => owns(f, n)).length >= 2; },
      run: () => { const f = LF('孫権'); Game.citiesOf(f).filter(c => c.terrain === 'river').forEach(c => c.def = Math.min(c.defMax, c.def + 80)); up(Game.lordOf(f), 'pol', 2);
        return { title: '碧眼児、江東を固める', gen: '孫権', expr: 'normal', fac: f, text: '父と兄の遺した江東を守るため、孫権は長江沿いの守りを固め、人材を広く登用した。\n大河沿いの全都市の城壁 +80、孫権の政治 +2' }; } },
    { id: 'l_hanxuan', title: '老将と若武者', chance: 0.45, cond: () => { const f = LF('韓玄'); return f >= 0 && (facOf('黄忠') === f || facOf('魏延') === f); },
      run: () => { const f = LF('韓玄'); ['黄忠', '魏延'].forEach(n => { const g = serving(n); if (g && g.faction === f) g.loyalty = Math.min(100, g.loyalty + 30); }); up(Game.lordOf(f), 'cha', 5);
        return { title: '老将と若武者', gen: '黄忠', expr: 'happy', fac: f, text: '演義では人望に欠けたとされる韓玄。だがこの天下では、老将・黄忠と若き魏延の力を認め、篤く遇した――\n黄忠「殿がそこまで言われるなら、この老骨、長沙のために射ましょう」\n黄忠・魏延の忠誠 +30、韓玄の魅力 +5\n' + IF }; } },
    { id: 'l_jinxuan', title: '都仕込みの政', chance: 0.45, cond: () => { const f = LF('金旋'); return f >= 0 && G.year >= 200; },
      run: () => { const f = LF('金旋'), cap = capOf(f); up(Game.lordOf(f), 'pol', 3); cap.gold += 800; pct(cap, 'comm', 'commMax', 0.08);
        return { title: '都仕込みの政', gen: '金旋', expr: 'normal', fac: f, text: `都の官職を歴任した金旋は、朝廷で学んだ帳簿と法の扱いで、${cap.name}の政を立て直した。\n金旋の政治 +3、${cap.name}の金 +800・商業 +8%\n` + IF }; } },
    { id: 'l_liudu', title: '零陵の守り', chance: 0.45, cond: () => { const f = LF('劉度'); return f >= 0 && owns(f, '零陵'); },
      run: () => { const f = LF('劉度'), c = cityByName('零陵'); c.def = Math.min(c.defMax, c.def + 100); const x = serving('邢道栄'); if (x && x.faction === f) up(x, 'war', 3); const s2 = serving('劉賢'); if (s2 && s2.faction === f) up(s2, 'lead', 2);
        return { title: '零陵の守り', gen: '劉度', expr: 'normal', fac: f, text: '劉度は息子の劉賢と猛将・邢道栄に、零陵の守りを固めさせた。\n零陵の城壁 +100' + (x && x.faction === f ? '、邢道栄の武力 +3' : '') + (s2 && s2.faction === f ? '、劉賢の統率 +2' : '') }; } },
    { id: 'l_zhaofan', title: '断られた縁談', chance: 0.5, cond: () => { const f = LF('趙範'); return f >= 0 && G.year >= 200; },
      run: () => { const f = LF('趙範'), z = G_('趙雲'), cap = capOf(f); up(Game.lordOf(f), 'cha', 2);
        if (z && z.state === 'ronin') { z.city = cap.i; z.known = true;
          return { title: '断られた縁談', gen: '趙範', expr: 'normal', fac: f, text: `趙範は兄嫁の樊氏を趙雲に嫁がせようとしたが、きっぱり断られた。\nだがこの天下では、その一件で趙範は趙雲の義の固さに惚れ込み、改めて客として迎えた――\n在野の趙雲が${cap.name}に滞在している（登用できる）。趙範の魅力 +2\n` + IF }; }
        const r = shuffle(G.gens.filter(g => g.state === 'ronin' && g.name !== '諸葛亮' && g.war >= 65))[0]; if (r) { r.city = cap.i; r.known = true; }
        return { title: '義の士を求めて', gen: '趙範', expr: 'normal', fac: f, text: `趙範は、縁談をきっぱり断った趙雲の義の固さを忘れられなかった。この天下では、趙範はそのような義の士を桂陽に求めた――\n` + (r ? `在野の${r.name}が${cap.name}を訪ねてきた（登用できる）。` : '') + `趙範の魅力 +2\n` + IF }; } },
    { id: 'l_gongsunkang', title: '袁氏の首', chance: 0.45, cond: () => { const f = LF('公孫康'), fc = LF('曹操'); return f >= 0 && fc >= 0 && fc !== f && !Game.isAlly(f, fc) && G.year >= 205; },
      run: () => { const f = LF('公孫康'), fc = LF('曹操'); allyWith(f, fc); capOf(f).gold += 1000;
        return { title: '袁氏の首', gen: '公孫康', expr: 'normal', fac: f, big: true, text: '逃げ込んできた袁尚・袁熙の首をはね、曹操に送り届けた公孫康。曹操はこれを喜び、遼東に手を出さなかった。\n公孫康軍と曹操軍が同盟、本拠の金 +1000' }; } },
    { id: 'l_menghuo', title: '南蛮の王', chance: 0.45, cond: () => { const f = LF('孟獲'); return f >= 0 && (owns(f, '建寧') || owns(f, '雲南')); },
      run: () => { const f = LF('孟獲'), c = owns(f, '雲南') ? cityByName('雲南') : cityByName('建寧'); c.troops += 6000; up(Game.lordOf(f), 'war', 2); const z = serving('祝融'); if (z && z.faction === f) z.loyalty = 100;
        return { title: '南蛮の王', gen: '孟獲', expr: 'angry', fac: f, text: `孟獲「南中の兵は、象も虎も味方につけておるのだ！ かかってこい！」\n南中の諸部族が孟獲の旗のもとに集まった。\n${c.name}の兵 +6000、孟獲の武力 +2` + (z && z.faction === f ? '、祝融の忠誠 100' : '') }; } },
  ];
  HIST.push(...LORD_EVENTS);

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
  //  ・君主ごとに台詞が変わる（史実そのものではなく、その人物らしい「もしも」の言葉）
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
  function simaCoup(fi) {
    const sima = SIMA.map(serving).filter(g => g && g.faction === fi && !g.isLord);
    if (!sima.length) return null;
    const head = sima[0], f = G.factions[fi];
    const mine = Game.citiesOf(fi);
    if (mine.length < 2) return null;
    // 司馬氏のいる都市から、地続きに半分の都市が離反する（本拠は除く）
    let start = G.cities[head.city].owner === fi && head.city !== f.capital ? G.cities[head.city] : mine.find(c => c.i !== f.capital);
    if (!start) return null;
    const take = new Set([start.i]), q = [start];
    const half = Math.floor(mine.length / 2);
    while (q.length && take.size < half) { const c = q.shift(); c.adj.forEach(a => { const o = G.cities[a]; if (take.size < half && o.owner === fi && o.i !== f.capital && !take.has(o.i)) { take.add(o.i); q.push(o); } }); }
    const nf = { i: G.factions.length, name: head.name, color: '#5a5a8c', lord: head.i, alive: true, capital: start.i, allies: {}, isPlayer: false, hostility: {} };
    G.factions.push(nf);
    head.faction = nf.i; head.isLord = true; head.loyalty = 100; head.city = start.i;
    sima.slice(1).forEach(g => { g.faction = nf.i; g.city = start.i; g.loyalty = 95; });
    take.forEach(ci => { const c = G.cities[ci]; c.owner = nf.i; Game.gensIn(ci, fi).forEach(g => { if (g.isLord) return; if (!Game.has(g, '忠義') && (g.loyalty < 75 || Game.has(g, '野心'))) { g.faction = nf.i; g.loyalty = irnd(70, 90); } else g.city = f.capital; }); });
    return { head, f, n: take.size };
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
        const foe = alive.find(f => f.i !== G.player);
        const coup = foe ? simaCoup(foe.i) : null;
        const mySima = SIMA.map(serving).find(g => g && g.faction === G.player && !g.isLord);
        if (coup) {
          push('天下二分、そして政変', `天下は二つの国に分かれた——と思われた矢先、${coup.f.name}軍で政変が起きた。\n${coup.head.name}が兵を挙げ、${coup.n}つの城とともに${coup.f.name}軍から離れた！\n天下は再び三つに割れた。`, coup.head, '天下の形', { expr: 'angry', se: 'gong' });
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
