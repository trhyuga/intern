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
  ];

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
  ];

  function weighted(list) { const tot = list.reduce((s, x) => s + x.w, 0); let r = Math.random() * tot; for (const x of list) { if ((r -= x.w) <= 0) return x; } return list[0]; }

  function randomEvents() {
    const ev = [];
    let shown = 0;
    // 都市：季節ごとに各都市5%
    G.cities.forEach(c => {
      if (c.owner === null || Math.random() > 0.05) return;
      const cand = CITY.filter(e => !e.cond || e.cond(c));
      if (!cand.length) return;
      const e = weighted(cand);
      const r = e.run(c);
      if (mine(c.owner) && shown < 4) {
        const sp = r.speaker || govOf(c);
        ev.push({ type: r.good ? 'good' : 'warn', msg: r.msg, gen: sp ? sp.i : null, expr: r.expr, line: sp ? r.line : null, tag: e.name, talk: true });
        shown++;
      }
    });
    // 武将：季節ごとに各武将2.5%
    G.gens.forEach(g => {
      if (g.state !== 'serve' || Math.random() > 0.025) return;
      const cand = GEN.filter(e => !e.cond || e.cond(g));
      if (!cand.length) return;
      const e = weighted(cand);
      const r = e.run(g);
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
    { id: 'lianhuan', title: '連環の計', chance: 0.3,
      cond: () => { const f = facByLord('董卓'); const lu = serving('呂布'); const wy = G_('王允'); return f >= 0 && G.year >= 191 && lu && lu.faction === f && wy && wy.state !== 'dead'; },
      run: () => { const f = facByLord('董卓'), dz = G_('董卓'), lu = G_('呂布');
        Game.killGeneral(dz, '暗殺');
        const fac = G.factions[f];
        if (fac.alive) { Game.gensOf(f).forEach(g => { g.isLord = false; }); lu.isLord = true; lu.loyalty = 100; fac.lord = lu.i; fac.name = '呂布'; Game.gensOf(f).forEach(g => { if (!g.isLord) g.loyalty = Math.max(0, g.loyalty - 20); }); }
        Game.log('呂布が董卓を討った。');
        return { title: '連環の計', gen: '呂布', expr: 'angry', fac: f, big: true, text: '王允の策により、呂布は義父・董卓に刃を向けた。\n董卓、討たれる。呂布が軍を継いだが、配下の心は揺れている（忠誠 -20）' }; } },
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
        return ['周瑜', '諸葛亮', '黄蓋'].some(n => { const f = facOf(n); return f >= 0 && f !== fc && Game.citiesOf(f).some(c => c.adj.some(a => G.cities[a].owner === fc)); }); },
      run: () => { const fc = facByLord('曹操'); const hero = ['周瑜', '黄蓋', '諸葛亮'].find(n => facOf(n) >= 0 && facOf(n) !== fc); const fh = facOf(hero);
        const hit = Game.citiesOf(fc).filter(c => c.terrain === 'river' && c.adj.some(a => G.cities[a].owner === fh));
        hit.forEach(c => { c.troops = Math.round(c.troops * 0.65); c.train = Math.max(0, c.train - 20); });
        return { title: '赤壁の大火', gen: hero, expr: 'angry', fac: fh === G.player ? fh : fc, big: true, text: `東南の風に乗せて放たれた火が、曹操軍の船団を焼き尽くした。\n${hit.map(c => c.name).join('・') || '長江沿い'}の曹操軍、兵 -35%・訓練 -20` }; } },
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
        const lord = Game.lordOf(f.i); const kuni = { '曹': '魏', '劉': '漢', '孫': '呉', '袁': '仲', '董': '秦', '呂': '晋' }[lord.name[0]] || lord.name[0];
        Game.gensOf(f.i).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + 10); }); Game.citiesOf(f.i).forEach(c => c.loyal = Math.min(100, c.loyal + 5)); up(lord, 'cha', 3);
        return { title: `${kuni}の建国`, gen: lord.name, expr: 'happy', fac: f.i, big: true, text: `${lord.name}は国号を「${kuni}」と定め、帝位に就いた。\n配下の忠誠 +10、全都市の民忠 +5` }; } },
    { id: 'chushi', title: '出師の表', chance: 0.5,
      cond: () => { const f = facByLord('劉禅'); return f >= 0 && facOf('諸葛亮') === f; },
      run: () => { const f = facByLord('劉禅'), z = G_('諸葛亮'); z.loyalty = 100; Game.gensOf(f).forEach(g => { if (!g.isLord) g.loyalty = Math.min(100, g.loyalty + 10); }); Game.citiesOf(f).filter(c => Game.isFront(c)).forEach(c => c.train = Math.min(100, c.train + 15));
        return { title: '出師の表', gen: '諸葛亮', expr: 'normal', fac: f, big: true, text: '「先帝の遺志を継ぎ、漢室を興さん」\n諸葛亮は出師の表を奉り、北伐を誓った。\n配下の忠誠 +10、前線の訓練 +15' }; } },
    { id: 'qizong', title: '七縦七擒', chance: 0.5,
      cond: () => { const f = facOf('諸葛亮'); const mh = G_('孟獲'); return f >= 0 && (owns(f, '建寧') || owns(f, '雲南')) && mh && (mh.state === 'ronin' || (mh.isLord && Game.citiesOf(mh.faction).length <= 1 && mh.faction !== f)); },
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

  function histEvents() {
    G.events.hist = G.events.hist || {};
    const ev = [];
    for (const h of HIST) {
      if (!h.repeat && G.events.hist[h.id]) continue;
      let ok = false;
      try { ok = h.cond(); } catch (e) { ok = false; }
      if (!ok || Math.random() > h.chance) continue;
      const r = h.run();
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

  return {
    run() { return [...histEvents(), ...randomEvents()]; },
    counts: () => ({ city: CITY.length, gen: GEN.length, hist: HIST.length }),
    _HIST: HIST,
  };
})();
