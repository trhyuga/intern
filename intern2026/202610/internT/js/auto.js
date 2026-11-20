// ============================================================
//  軍師オート
//  軍師に任命した武将が、季節ごとの命令・出陣・計略・外交を自分で決めて実行する。
//  都市画面を開いてボタンを押す様子や、戦場で部隊を動かす様子をそのまま見せる。
//  軍師の知力が高いほど判断が正確で、性格によって采配の癖が変わる。
// ============================================================
const Auto = (() => {
  let running = false, stopReq = false, seasonsLeft = 0;
  const S = { speed: 1 }; // 1 普通 / 2 速い / 4 超速（会話を読み飛ばす）
  const SPEED_NAME = sp => sp >= 4 ? '超速' : sp >= 2 ? '速い' : '普通';
  const nextSpeed = sp => sp >= 4 ? 1 : sp >= 2 ? 4 : 2;
  try { S.speed = +(localStorage.getItem('internT_autoSpeed') || 1); } catch (e) {}
  const wait = ms => new Promise(r => setTimeout(r, ms / S.speed));

  // ---------- 軍師 ----------
  function strategist() {
    let g = G.strategist != null ? G.gens[G.strategist] : null;
    if (!g || g.state !== 'serve' || g.faction !== G.player) {
      // 自動で選ぶときは、知力が近ければ戦の軍師を優先する（内政型は「軍師を替える」で選べる）
      const civ = x => !(x.int >= 90 && x.pol >= 90) && Game.has(x, '治世') && x.pol >= 85 && x.pol >= x.int && !Game.has(x, '智謀') && !Game.has(x, '神算') && !x.isLord;
      const list = Game.gensOf(G.player).sort((a, b) => (b.int + (b.isLord ? -15 : 0) - (civ(b) ? 8 : 0)) - (a.int + (a.isLord ? -15 : 0) - (civ(a) ? 8 : 0)));
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
    // 内政タイプ：治世を持ち、政治85以上で知力以上に政治が高い者（智謀・神算の者と君主は除く）
    // 万能型：知力・政治ともに90以上（曹操・荀彧・司馬懿・魯粛・諸葛亮）。富国強兵の独自の采配をする
    const master = g.int >= 90 && g.pol >= 90;
    const civil = !master && H('治世') && g.pol >= 85 && g.pol >= g.int && !H('智謀') && !H('神算') && !g.isLord;
    const b = {
      style: master ? 'master' : civil ? 'civil' : 'mil',
      q, tier: q >= 0.75 ? 'smart' : q >= 0.45 ? 'mid' : 'dumb',
      noise: (1 - q) * 0.6,
      // 求める力の比（1.0を超えれば勝ち。普通1.15、慎重なら大きな差、猪突なら小さな差で攻める）
      aggr: 1.15 + (H('慎重') ? 0.2 : 0) + (H('仁徳') ? 0.05 : 0) - (H('野心') ? 0.05 : 0) - (H('猪突') ? 0.1 : 0) - (H('剛勇') ? 0.03 : 0),
      plot: (H('智謀') ? 0.35 : 0) + (H('神算') ? 0.25 : 0) + Math.max(0, (g.int - 70) / 60),
      dom: { farm: H('治世') ? 0.2 : 0, comm: H('治世') ? 0.2 : 0, alms: H('仁徳') ? 0.3 : 0, wall: H('慎重') ? 0.25 : 0, train: (H('慎重') || H('剛勇')) ? 0.15 : 0, draft: (H('野心') || H('猪突')) ? 0.25 : 0, search: H('仁徳') ? 0.15 : 0 },
      diplo: q >= 0.6 || H('仁徳'),
      maxAttacks: q >= 0.75 ? 2 : 1,
      // 出陣に求める力の比（見積もり。1.0で互角）。優秀な軍師ほど確かな勝ち目がある時だけ攻める。慎重・猪突などの癖で上下する
      want: (q >= 0.75 ? 1.2 : q >= 0.45 ? 1.08 : 0.95) * (1.15 + (H('慎重') ? 0.2 : 0) + (H('仁徳') ? 0.05 : 0) - (H('野心') ? 0.05 : 0) - (H('猪突') ? 0.1 : 0) - (H('剛勇') ? 0.03 : 0)) / 1.15,
      // 兵5万以上の大軍でも、これを下回る相手には攻めない（知力の低い軍師は構わず攻める）
      bigWant: q >= 0.75 ? 1.0 : q >= 0.45 ? 0.85 : 0,
      // 消耗戦（一度で落とせない相手を削る攻め）に求める力の比
      attrWant: q >= 0.75 ? 0.9 : q >= 0.45 ? 0.75 : 0,
    };
    // 内政タイプは、あまり戦をしない：確かな勝ち目がある時だけ攻め、消耗戦はしない。出陣は1季節に1つまで
    if (civil) { b.want *= 1.25; b.bigWant = Math.max(b.bigWant, 1.1); b.attrWant = 99; b.maxAttacks = 1; }
    // 万能型は、内を固めた力で外を討つ：見立てが確かなぶん基準はやや低く、同時に攻める数も多い
    if (master) { b.want *= 0.95; b.maxAttacks += 1; b.diplo = true; }
    return b;
  }
  function grade(g) {
    const b = brain(g);
    const t = b.tier === 'smart' ? '天下に名だたる知略。判断は正確で、計略や外交も駆使する' : b.tier === 'mid' ? 'そこそこの見立て。ときどき判断を誤る' : '采配はかなり大ざっぱ。勢いまかせになりがち';
    const s = [];
    if (b.style === 'master') s.push('万能型：富国強兵。内地は内政で富ませ、前線は兵を集めて鍛え、好機には同時に何か所も攻める。計略・外交・修行も欠かさない');
    if (b.style === 'civil') s.push('内政型：前線は敵と同じくらいの兵で守り、戦は控えめ。内地に文官を置き、内政・訓練・修行で国を富ませる');
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
      intro: ['{season}。{plan}民の暮らしも、兵の調練も、抜かりなく', '{season}を迎えました。{plan}一手一手、確実に参りましょう', '{season}です。{plan}', '敵の動きは読めております。{plan}', '天の時はまだ。ですが、手は打っておきましょう。{plan}'],
      dom: ['{city}は{need}が急務。{gen}殿にお願いします', '{gen}殿の才なら、{city}の{need}は任せて安心です'],
      attack: ['{target}の兵{n}は恐るるに足りません。{gen}殿、兵{m}で一気に', '今こそ{target}を。{gen}殿に兵{m}を預けます。{city}には{k}を残して守りは万全です', '{target}の兵{n}に対し、こちらは{m}で攻めます。{city}には{k}を残します。総大将は{gen}殿に', '{target}の守りは手薄です。{gen}殿、兵{m}で落としましょう。{city}の守りは{k}で十分です'],
      hold: ['敵の隙が見えるまで、牙は研いでおきましょう', '今攻めても、得るものより失うものが多い。待ちます', '今は攻め時ではありません。力を蓄えましょう', '無理な戦は国を滅ぼします。今季は内を固めます'],
      plot: ['{foe}は主君に不満を抱いている様子。揺さぶってみましょう', '戦わずして敵を崩す。これも兵法です'],
      rumor: ['{target}に流言を放ち、民と兵の心を乱しましょう。攻める前の下ごしらえです', '{target}の守りを内から崩します'],
      diplo: ['{target}と手を結び、背後の憂いを断ちましょう', '敵を一度に相手にするのは愚策。{target}とは和を'],
      weakAlly: ['今は背中を守ることが先決。{target}と手を結びましょう', '小国が生き残る道は、強国と争わぬこと。{target}に使者を'],
      surr: ['{target}はもはや袋の鼠。降伏を勧めれば、無駄な血を流さずに済みます', '{target}に使者を。戦わずして勝つのが上策です'],
      reward: ['{gen}殿の心が離れかけています。褒美を'],
      recruit: ['{gen}殿、在野の賢者を探してきてください'],
      battle: ['敵の総大将は{foe}。そこを突けば崩れます', '地形を使い、城門を集中して攻めましょう'],
      defend: ['慌てることはありません。守り切れば敵は兵糧が尽きます'],
      win: ['{city}を手に入れました。民を安んじ、次の一手に備えましょう', '{city}が落ちました。ここを足がかりにします', 'これで敵の喉元に刃を突きつけました', '戦は勝って終わりではありません。すぐに守りを固めましょう', '予定通りです'], lose: ['{city}は手強かった。兵を養い直しましょう', '敗戦を嘆くより、次の手を。兵を休ませ、立て直します', 'この負けは、次の勝ちのための授業料です', '……読み違えました。立て直しましょう'],
      allyYes: ['悪くない話です。受けましょう'], allyLast: ['ここで手を結べば、攻める先がなくなります。お断りしましょう'], allyNo: ['今、手を結ぶ利はありません。断りましょう'],
      rec: ['{gen}は使える人物。登用を勧めます'], recruitGo: ['{gen}は得がたい人物。{envoy}殿、{city}へ赴いて口説いてください', '{city}の{gen}を放っておく手はありません。弁の立つ{envoy}殿を向かわせます'], kongming: ['{city}の{gen}は、礼を尽くさねば動かぬ人物。{lord}様ご自身で訪ねましょう'], rel: ['恩を売っておくのも策のうち。解放しましょう'], kill: ['生かしておけば後の災いとなります'],
      gather: ['{from}の兵を{to}に合流させ、{target}を一気に攻めます', '兵は集めてこそ力。{from}の兵も{to}へ'],
      mass: ['兵は十分に揃いました。{target}へ攻め込みます。総大将は{gen}殿、兵{m}', '{city}の兵は満ちています。待つ理由はありません。{target}を攻めましょう'],
      attrition: ['{target}は一度では落ちますまい。ですが兵{m}で攻めれば、敵の兵{n}を大きく削れます。次で落とせばよいのです', '一度で落とせずとも、敵の兵を削れば次で落とせます。{gen}殿、{target}へ'],
      braveLord: ['殿……！ お止めしても無駄でしょう。せめて深追いだけはなさいませぬよう', '殿が自ら……。ならば、兵の動きはこちらで整えます'],
      braveOk: ['……よろしい、{gen}殿。ただし深追いは禁物です', '{gen}殿の勢いを止めるのは惜しい。{target}を任せます'], braveNo: ['{gen}殿、今の{target}は分が悪すぎます。もう少し兵を集めてから'],
      deploy: ['{gen}殿ほどの将を後方に置くのは惜しい。{to}へ移っていただきます', '{to}の守りと攻めの要として、{gen}殿を前線へ'],
      deployCivil: ['{gen}殿には{to}で内政を任せます。前線は武の者に'],
      eventMeet: ['{gens}殿、{city}に集まっていただきましょう。良い縁は近くにあってこそです'], eventFace: ['{gen}殿を{city}へ。{foe}と相まみえる時が来ました', '{foe}の前に{gen}殿を。因縁の相手には、因縁の者を'],
      transfer: ['{to}は{what}が足りません。{from}から回しましょう', '前線の{to}を空にはできません。{from}から{what}を送ります'],
      held: ['{city}を守り切りました。敵は当分動けますまい', '{city}の守り、見事でした。城壁を直しておきましょう'],
      lost: ['{city}を失いました……。ですが、取り返す策はあります', '{city}は奪われましたが、まだ終わってはおりません'],
    },
    mid: {
      intro: ['{season}です。{plan}がんばりましょう', '{season}ですね。{plan}', '{season}になりました。{plan}', 'さて、今季はどう動きましょうか。{plan}'],
      dom: ['{city}で{need}をやりましょう。{gen}殿、頼みます', '{gen}殿に{need}をお願いします'],
      attack: ['{target}が手薄です。{gen}殿、兵{m}でお願いします', '{target}を攻めましょう。{gen}殿、兵{m}で出陣を。城には{k}を残します', 'そろそろ{target}を取りに行きましょう。兵は{m}です'],
      hold: ['今季は無理をせず、力を蓄えましょう', '今季は様子を見ましょう'],
      plot: ['{foe}に揺さぶりをかけてみます'], rumor: ['{target}に噂を流してみます'], diplo: ['{target}に使者を出してみましょう'], weakAlly: ['{target}とは仲良くしておきましょう。今は戦えません'], surr: ['{target}に降伏を勧めてみましょう'],
      reward: ['{gen}殿に褒美を与えておきましょう'], recruit: ['人材を探してみましょう'],
      battle: ['敵の城を落とすぞ！'], defend: ['なんとか守り抜きましょう'],
      win: ['{city}を取りました！', 'やりましたね！ 次もこの調子で', '勝ちました！'], lose: ['{city}は落とせませんでした……', 'うーん、今回は分が悪かったようです', '負けてしまいました……'],
      allyYes: ['手を組んでおきましょう'], allyLast: ['全部と仲良くしたら、戦う相手がいなくなっちゃいます。断りましょう'], allyNo: ['今回は断りましょう'],
      rec: ['登用してみましょう'], recruitGo: ['{envoy}殿、{city}の{gen}を誘いに行ってください'], kongming: ['{gen}は殿が直々に会いに行かないとダメみたいです'], rel: ['解放しましょう'], kill: ['ここは処断を'],
      gather: ['{from}の兵を{to}へ合流させます'], mass: ['兵が揃いました！ {target}を攻めましょう！'], attrition: ['兵の数ではこちらが上です。{target}を攻めて削りましょう'], braveLord: ['と、殿！ ご武運を！'], braveOk: ['わかりました、{gen}殿、存分に！'], braveNo: ['{gen}殿、今は待ってください'],
      deploy: ['{gen}殿は{to}へ移ってください'], deployCivil: ['{gen}殿は{to}で内政を'], eventMeet: ['{gens}殿、{city}に集まってください'], eventFace: ['{gen}殿、{city}へ。{foe}がいます'],
      transfer: ['{from}から{to}へ{what}を送ります'],
      held: ['{city}を守り切りました！'],
      lost: ['{city}を取られてしまいました……'],
    },
    dumb: {
      intro: ['{season}か！ 腹が減ったな！ {plan}', 'よーし、{season}も張り切っていこう！ {plan}', '{season}だ！ {plan}', 'えーと……{plan}', 'よし、今季も気合いでいくぞ！ {plan}'],
      dom: ['{gen}殿、とりあえず{need}を！', 'うーん、{need}でいいか！'],
      attack: ['{target}だ！ 理由？ なんとなく勝てそうだからだ！', '{target}を攻めるぞ！ 兵{m}もいれば勝てる気がする！', 'つべこべ言わずに{target}へ突撃だ！ 留守は{k}で何とかなるだろ！'],
      hold: ['今季は昼寝……じゃなくて、休養だ！', '……何をすればいいんだっけ', 'まあ、今季はいいか'],
      plot: ['な、何か悪だくみをしてみるか'], rumor: ['{target}に、あることないこと言いふらしてこい！'], diplo: ['仲良くしておこう！'], surr: ['{target}、降参しろーっ！'],
      reward: ['金をばらまいておけ！'], recruit: ['誰かいないか探してこい！'],
      battle: ['とにかく突っ込め！'], defend: ['ど、どうしよう……とにかく守れ！'],
      win: ['{city}ゲットだ！', 'ほらな！ 俺の言った通りだろ！', 'やったー！ 勝った！'], lose: ['{city}、硬すぎるぞ！', '……次は勝つ！ たぶん！', 'あれぇ……おかしいな……'],
      allyYes: ['いいよいいよ、組もう！'], allyLast: ['あれ？ 組んだら喧嘩する相手がいなくなるぞ。断る！'], allyNo: ['なんか怪しいから断る！'],
      rec: ['仲間にしちゃおう！'], recruitGo: ['{envoy}、{city}の{gen}を連れてこい！'], kongming: ['殿、{gen}に会いに行ってきてくださいよ！'], rel: ['逃がしてやれ！'], kill: ['えいっ、処断だ！'],
      gather: ['{from}の連中も呼んでこい！ {target}を攻めるぞ！'], mass: ['兵がいっぱいだ！ {target}に攻め込め！'], attrition: ['数で押せー！ {target}を囲め囲め！'], braveLord: ['さすが殿！ 俺もついていきたいくらいだ！'], braveOk: ['よし行け{gen}！ 暴れてこい！'], braveNo: ['うーん、やめとけ！'],
      deploy: ['{gen}、いつまで後ろにいる！ {to}へ行け！'], deployCivil: ['{gen}は後ろで畑でも耕してろ！'], eventMeet: ['{gens}、みんな{city}に集まれ！ 宴会だ！'], eventFace: ['{gen}、{city}へ行け！ {foe}がいるぞ！'],
      transfer: ['{to}に{what}を送っとけ！'],
      held: ['{city}は渡さん！ ……守れたな！'],
      lost: ['あれっ、{city}が……'],
    },
  };
  // 君主が自ら采配するとき（軍師を兼ねるとき）の言葉。{I} は君主の一人称
  const SL_LORD = {
    intro: ['{season}か。{plan}', '皆の者、聞け。{plan}', '{season}だ。{I}の考えを申し伝える。{plan}'],
    dom: ['{gen}、{city}の{need}を頼む', '{city}は{need}が足りぬ。{gen}、任せたぞ'],
    attack: ['{target}を攻める。{gen}、兵{m}を率いて行け。{city}には{k}を残す', '{target}を取る。総大将は{gen}だ。兵{m}、存分に働け'],
    hold: ['今は動く時ではない。力を蓄えよ', '焦りは禁物だ。今季は国を固める'],
    plot: ['{foe}の心は揺れておる。揺さぶってやれ'], rumor: ['{target}に噂を流せ。攻める前の下ごしらえだ'], diplo: ['{target}と手を結ぶ。使者を出せ'], weakAlly: ['今は{target}と争う時ではない。手を結べ'], surr: ['{target}に降伏を勧めよ。無駄な血は流したくない'],
    reward: ['{gen}には苦労をかけておる。褒美を取らせよ'], recruit: ['在野の賢者を探してまいれ'],
    battle: ['敵の総大将は{foe}。そこを突け！', '{I}の采配に従え。城門を集中して攻めよ！'], defend: ['この城は渡さぬ。皆、持ち場を守れ！'],
    win: ['皆、よくやってくれた！', '{city}を取ったか。よくやった'], lose: ['……{I}の采配の誤りだ。立て直すぞ', '{city}は手強いな。次は必ず'],
    allyYes: ['よかろう。手を結ぼう'], allyLast: ['皆と手を結べば、攻める先がなくなる。断れ'], allyNo: ['今は手を結ぶ時ではない。断れ'],
    rec: ['{gen}か。{I}の陣に迎えよう'], recruitGo: ['{envoy}、{city}の{gen}を口説いてまいれ'], kongming: ['{city}の{gen}……{I}自ら訪ねよう'], rel: ['放してやれ。恩は売っておく'], kill: ['生かしてはおけぬ'],
    gather: ['{from}の兵を{to}へ集めよ。{target}を攻める'], mass: ['兵は揃った。{target}へ攻め込め！ 総大将は{gen}、兵{m}だ', '{city}の兵は満ちた。{target}を落とすぞ'], attrition: ['{target}は一度では落ちまい。だが兵{m}で削っておけ'],
    braveLord: ['{I}自ら出る！ 皆、続け！'], braveOk: ['{gen}、行ってこい。深追いはするな'], braveNo: ['{gen}、逸るな。今の{target}は分が悪い'],
    deploy: ['{gen}、{to}へ移れ。前線を任せる'], deployCivil: ['{gen}は{to}で内政を頼む'], eventMeet: ['{gens}、{city}に集まれ'], eventFace: ['{gen}、{city}へ行け。{foe}が待っておる'],
    held: ['{city}を守り抜いたか。皆、よくやった'], lost: ['{city}を奪われたか……。必ず取り返す'],
    transfer: ['{from}から{to}へ{what}を送れ'],
  };
  const SL_SPECIAL = {
    '諸葛亮': { intro: ['{season}。星の巡りは我らに味方しております。{plan}'], attack: ['すでに錦の袋に策を入れてあります。{gen}殿、{target}へ'], battle: ['敵の動きは、すべて亮の掌の上です'], hold: ['今は国を富ませる時。北伐の機は必ず来ます'] },
    '郭嘉': { intro: ['{season}ですね。{plan}'], attack: ['{target}の主は優柔不断。今が好機です'], hold: ['焦らずとも、敵は内から崩れます'] },
    '周瑜': { attack: ['{target}を取れば、天下二分も見えてきます'], battle: ['水を制する者が戦を制します'] },
    '司馬懿': { hold: ['待つのです。敵が先に動くまで'], attack: ['……今です。{target}を'], intro: ['{season}。{plan}'] },
    '龐統': { attack: ['{target}を奇襲で取りましょう。上策です'] },
    '陳宮': { attack: ['{target}を攻めるべきです。……今度こそ、この策を用いてください'] },
    '賈詡': { hold: ['生き残ることが、まず第一です'], plot: ['離間は私の得意とするところ'] },
    '荀彧': { intro: ['{season}。大義を掲げ、民を安んじることこそ覇業の礎です。{plan}'], hold: ['今は内を固め、人を育てる時です'], attack: ['{target}は今が取り時。{gen}殿、大義の兵を'] },
    '荀攸': { attack: ['{target}には、もう一つ手を打ってあります。{gen}殿、兵{m}で'], hold: ['策は熟すまで寝かせるものです'] },
    '程昱': { attack: ['{target}の兵糧は乏しい。長くは持ちますまい'], hold: ['兵糧が足りぬうちは動かぬことです'] },
    '陸遜': { hold: ['敵を疲れさせ、驕らせる。それから火を放つのです'], attack: ['敵の陣が伸びきりました。{target}へ'], battle: ['焦らずに。敵の疲れを待ちます'] },
    '魯粛': { diplo: ['{target}とは、手を携えるのが上策。私が参りましょう'], hold: ['今は天下の形勢を見極める時です'] },
    '徐庶': { attack: ['{target}の陣形には破り方があります。{gen}殿、お任せを'], intro: ['{season}です。{plan}……母の便りが気がかりですが、務めは果たします'] },
    '法正': { attack: ['{target}を取れば、天下の要を押さえられます。今です'], hold: ['恩には恩を、仇には仇を。……失礼、今季は待ちましょう'] },
    '姜維': { attack: ['{target}へ。丞相の志を継ぐためにも'], hold: ['北伐の機は、必ず来ます'] },
    '陳登': { intro: ['{season}です。{plan}民の腹を満たすのが先決ですよ'], hold: ['湖の魚でも食べながら、機を待ちましょう'] },
    '沮授': { hold: ['兵を休め、国を富ませ、それから攻めても遅くはありません'], attack: ['{target}を攻めるなら、兵糧の道を固めてからです'] },
    '田豊': { hold: ['急いてはなりません。持久こそ上策です'], attack: ['……今の{target}なら、勝ち目はあります。ただし慎重に'] },
    '許攸': { attack: ['{target}の兵糧庫の場所なら知っております。ふふ'], plot: ['弱みを握れば、人は動きます'] },
    '李儒': { plot: ['邪魔な者は、内から崩すのが早い'], attack: ['{target}を焼き払ってしまえばよいのです'] },
    '張昭': { hold: ['戦より民の暮らしを。内政こそ国の根本です'], diplo: ['無駄な戦は避けるべきです。{target}とは和を'] },
    '劉曄': { attack: ['{target}は、今を逃せば手強くなります。すぐに'] },
    '呂蒙': { attack: ['{target}は油断している。白衣で川を渡るように、静かに攻めましょう'], intro: ['{season}。学んだ兵法を試す時です。{plan}'] },
  };
  function sl(kind, ctx = {}) {
    const g = strategist(); if (!g) return '';
    const b = brain(g);
    const sp = SL_SPECIAL[g.name];
    const pool = g.isLord ? (SL_LORD[kind] || SL[b.tier][kind] || ['']) : (sp && sp[kind] && Math.random() < 0.7) ? sp[kind] : SL[b.tier][kind] || SL.mid[kind] || [''];
    const I = (typeof VOICE !== 'undefined' && VOICE[g.name] && VOICE[g.name].I) || '我';
    return pick(pool).replace(/\{(\w+)\}/g, (m, k) => k === 'I' ? I : ctx[k] != null ? ctx[k] : '');
  }
  async function say(kind, ctx, expr = 'normal') {
    const g = strategist(); if (!g) return;
    await UI.talk(g, expr, `${title(g)}${g.name}「${sl(kind, ctx)}」`, facColor(g), { tag: g.isLord ? '君主の采配' : '軍師' });
  }
  // 名前の前の肩書き（君主が兼ねるときは付けない）
  function title(g) { return g && g.isLord ? '' : '軍師 ';
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
  // 全国地図では上部バー（勢力名）のすぐ下、戦場ではマップのすぐ下に置く
  function place() {
    const bar = document.getElementById('autobar'), app = document.getElementById('app');
    const hd = UI.cur === 'battle' ? document.querySelector('#battle .b-field') : document.querySelector('#main .topbar');
    if (!hd) return;
    const top = hd.getBoundingClientRect().bottom - app.getBoundingClientRect().top + 4;
    bar.style.top = top + 'px';
  }
  function setBar(text) {
    place();
    const g = strategist();
    const bar = document.getElementById('autobar');
    bar.querySelector('img').src = g ? Portrait.get(g, 'normal', facColor(g)) : '';
    bar.querySelector('.ab-text').innerHTML = text;
    bar.querySelector('[data-a=speed]').textContent = SPEED_NAME(S.speed);
  }

  // ---------- 内政の判断 ----------
  const STAT = { farm: 'pol', comm: 'pol', wall: 'lead', alms: 'cha', draft: 'cha', train: 'lead', search: 'cha' };
  const NEED_NAME = { farm: '開墾', comm: '商業', wall: '修築', alms: '施し', draft: '徴兵', train: '訓練', search: '人材探し' };
  // 命令1回で見込める伸び（Game.doCommand と同じ式の平均）
  function gain(cmd, g, c) {
    const pk = Game.has(g, '治世') ? 1.3 : 1;
    switch (cmd) {
      case 'farm': case 'comm': return (g.pol * 0.35 + 6) * pk;
      case 'wall': return g.lead * 0.3 + g.pol * 0.15 + 5;
      case 'alms': return (g.cha * 0.12 + 3) * (Game.has(g, '仁徳') ? 1.5 : 1);
      case 'train': return (g.lead * 0.18 + 4) * Math.max(0.4, 1 - c.troops / 80000);
      case 'draft': return (g.cha * 25 + 800) * (c.pop / 400000 + 0.5);
    }
    return 0;
  }
  // 基本の必要度。上限に達したもの・できないものは必ず 0
  // 民忠が低い・前線の兵が足りない、は性格や知力に関係なく最優先（「基本」）
  function baseNeeds(c) {
    const threat = AI.threat(c, G.player);
    const front = Game.isFront(c);
    const foodShort = c.food < Game.foodReserve(c);
    const room = (v, m) => m - v >= 3 ? (m - v) / m : 0;
    const n = {}, must = {};
    n.farm = room(c.farm, c.farmMax) * (G.season <= 1 ? 1.2 : 0.9) * (foodShort ? 1.4 : 1);
    n.comm = room(c.comm, c.commMax) * (c.gold < 400 ? 1.3 : 1);
    n.wall = room(c.def, c.defMax) * (front ? 1.1 : 0.35);
    // 施し：民忠が低いほど優先。40未満は最優先
    const canAlms = c.food - 1500 > Game.foodReserve(c) && c.loyal < 95;
    if (canAlms && c.loyal < 40) { n.alms = 3 + (40 - c.loyal) / 10; must.alms = true; }
    else n.alms = canAlms && c.loyal < 70 ? (70 - c.loyal) / 30 : 0;
    // 徴兵：民忠を下げるので、民忠50未満ではしない
    const canDraft = c.gold >= CONFIG.RECRUIT_COST + 50 && c.loyal >= 50 && c.food > Game.foodReserve(c, c.troops + 3500);
    if (canDraft && front && c.troops < threat * 0.9) { n.draft = 2 + Math.min(1, (threat * 0.9 - c.troops) / 10000); must.draft = true; }
    else if (canDraft && G.stage && G.stage.c === c.i && c.troops < G.stage.troops) n.draft = 1.5;   // 攻撃の拠点では兵を集める
    else n.draft = canDraft ? (front ? (c.troops < threat * 1.2 ? 0.8 : 0.3) : (c.troops < 12000 ? 0.45 : 0.1)) : 0;
    // 内地は兵を鍛える場所（鍛えた兵を前線へ送る）
    n.train = c.troops >= 2000 && c.train < 95 ? (95 - c.train) / 95 * (front ? 1.0 : 1.4) : 0;
    const hidden = Game.roninIn(c.i).filter(r => !r.known);
    n.search = hidden.length ? 1.0 + Math.min(1, Math.max(...hidden.map(r => r.lead + r.war + r.int + r.pol + r.cha)) / 400) : 0.1;
    if (c.gold < CONFIG.CMD_COST) n.farm = n.comm = n.wall = 0;
    return { n, must };
  }
  // ---------- 局面の見立て ----------
  // 序盤：都市4以下（かつ開始から3年未満）／終盤：天下の半分以上か都市16以上／その間が中盤
  // 武将の多さ：1都市あたりの武将が2人未満なら「人手不足」、4人以上なら「人材豊富」
  function phase() {
    const n = Game.citiesOf(G.player).length, gens = Game.gensOf(G.player).length;
    const stage = n * 2 >= G.cities.length || n >= 16 ? 'late' : n <= 4 && (G.turn || 0) < 12 ? 'early' : 'mid';
    const perCity = gens / Math.max(1, n);
    return { stage, staff: perCity < 2 ? 'few' : perCity >= 4 ? 'many' : 'ok' };
  }
  // 弱小勢力か：都市3以下、または隣国のいちばん強い勢力の6割に満たない力しかない
  function weak() {
    const my = Game.power(G.player), n = Game.citiesOf(G.player).length;
    const neigh = new Set(); Game.citiesOf(G.player).forEach(c => c.adj.forEach(a => { const o = G.cities[a].owner; if (o !== null && o !== G.player) neigh.add(o); }));
    const top = Math.max(0, ...[...neigh].map(fi => Game.power(fi)));
    return n <= 3 || my < top * 0.6;
  }
  // 局面ごとの内政の重み（掛け算。「最優先」の項目にはかけない）
  //  序盤：金と兵糧を増やして国の土台を作り、人材を集める。城壁は後回し
  //  中盤：前線で兵を集めて鍛え、攻めの力を作る。内地は開墾・商業で前線を支える
  //  終盤：大軍を養う兵と民忠（太守の独立を防ぐ）を重く。人材探しは控えめ
  function phaseWeights(c) {
    const ph = phase(), front = Game.isFront(c);
    const W = {
      early: { farm: 1.25, comm: 1.4, wall: 0.7, alms: 1.0, draft: 1.1, train: 0.9, search: 1.4 },
      mid: { farm: front ? 0.9 : 1.15, comm: front ? 0.9 : 1.15, wall: front ? 1.1 : 0.8, alms: 1.0, draft: front ? 1.35 : 1.0, train: front ? 1.2 : 1.3, search: 1.0 },
      late: { farm: 0.85, comm: 0.9, wall: front ? 0.9 : 0.6, alms: 1.35, draft: front ? 1.35 : 1.1, train: 1.1, search: 0.6 },
    }[ph.stage];
    const w = Object.assign({}, W);
    if (ph.staff === 'few') w.search *= 1.6;      // 人手不足なら人材探しを急ぐ
    if (ph.staff === 'many') w.search *= 0.5;     // 人材が豊富なら探すより働かせる
    // 万能型：内地は開墾・商業、前線は徴兵・訓練・修築を重く（富国強兵）
    { const g0 = strategist(); if (g0 && brain(g0).style === 'master') { if (front) { w.draft *= 1.2; w.train *= 1.25; w.wall *= 1.1; } else { w.farm *= 1.2; w.comm *= 1.2; w.train *= 1.15; } w.search *= 1.1; } }
    // 内政型：都市の開発・訓練・人材を重く。前線で敵より兵が少なければ徴兵も
    if (civilNow()) { w.farm *= 1.25; w.comm *= 1.25; w.wall *= 1.2; w.train *= 1.3; w.search *= 1.2; if (front && c.troops < maxAdjEnemy(c)) w.draft *= 1.3; }
    // 攻めの拠点（兵を集めている都市）では、訓練と徴兵を重く：強い軍を作ってから攻める
    if (G.stage && G.stage.c === c.i) { w.train *= 1.5; w.draft *= 1.3; }
    // 弱小勢力：前線は兵を集め、強い隣国に脅かされている城は守りを固める（まず生き残る）
    if (weak() && front) { w.draft *= 1.25; if (AI.threat(c, G.player) > c.troops) w.wall *= 1.3; }
    return w;
  }
  function planCity(c, br) {
    const idle = Game.gensIn(c.i, G.player).filter(g => !g.acted);
    // 試算用の都市（命令を割り振るたびに成果を見込んで更新する）
    const sim = Object.assign({}, c);
    // 性格の癖と判断のぶれは、命令ごとに一度だけ決める（掛け算。0 は 0 のまま）
    const mul = {};
    // 知力の低い軍師ほど、局面の見立ても大ざっぱ（重みが1に近づく）
    const pw = phaseWeights(c);
    Object.keys(STAT).forEach(k => { const wk = 1 + (pw[k] - 1) * (br.tier === 'dumb' ? 0.3 : br.tier === 'mid' ? 0.7 : 1); mul[k] = (1 + br.dom[k]) * wk * (1 + (Math.random() - 0.5) * br.noise); });
    const out = [];
    const pool = idle.slice();
    while (pool.length) {
      const { n, must } = baseNeeds(sim);
      const score = k => must[k] ? n[k] : n[k] * mul[k];   // 最優先の項目はぶれさせない
      const cmd = Object.keys(n).sort((a, b) => score(b) - score(a))[0];
      if (score(cmd) <= 0.05) break;
      let g;
      if (br.tier === 'dumb' && Math.random() < 0.5) g = pick(pool);   // 人選は大ざっぱ
      else { pool.sort((a, b) => b[STAT[cmd]] - a[STAT[cmd]]); g = br.tier === 'mid' && Math.random() < 0.25 && pool.length > 1 ? pool[1] : pool[0]; }
      out.push([g, cmd]);
      pool.splice(pool.indexOf(g), 1);
      // 成果を見込む
      const v = gain(cmd, g, sim);
      if (cmd === 'farm') { sim.farm = Math.min(sim.farmMax, sim.farm + v); sim.gold -= CONFIG.CMD_COST; }
      if (cmd === 'comm') { sim.comm = Math.min(sim.commMax, sim.comm + v); sim.gold -= CONFIG.CMD_COST; }
      if (cmd === 'wall') { sim.def = Math.min(sim.defMax, sim.def + v); sim.gold -= CONFIG.CMD_COST; }
      if (cmd === 'alms') { sim.loyal = Math.min(100, sim.loyal + v * 0.85); sim.food -= 1500; }
      if (cmd === 'train') sim.train = Math.min(100, sim.train + v);
      if (cmd === 'draft') { sim.troops += v; sim.gold -= CONFIG.RECRUIT_COST; sim.loyal -= 6; }
      if (cmd === 'search') mul.search *= 0.3;
    }
    return out;
  }

  // ---------- 攻撃の判断 ----------
  // 守備に残す兵：前線4000・後方2000、今の兵の3割、隣の敵の最大兵力×性格の係数、のうち一番多い数
  function garrison(c, br, excludeCi) {
    const g = strategist();
    const base = Game.isFront(c) ? 4000 : 2000;
    let maxEnemy = 0;
    c.adj.forEach(a => { const o = G.cities[a]; if (o.owner !== null && o.owner !== G.player && !Game.isAlly(G.player, o.owner)) maxEnemy = Math.max(maxEnemy, o.troops * (a === excludeCi ? 0.4 : 1)); });
    // 城の守りは兵1人あたり約1.4倍強いので、隣の敵の兵力の4〜6割を残せば持ちこたえられる
    let k = Game.has(g, '慎重') ? 0.55 : (Game.has(g, '野心') || Game.has(g, '猪突')) ? 0.3 : 0.4;
    if (br.tier === 'dumb') k *= 0.6;            // 知力が低いと敵の脅威を甘く見る（それでも最低限は残す）
    if (br.style === 'civil') k = 1.0;            // 内政型は、隣の敵と同じくらいの兵を残す
    if (br.style === 'master') k = Math.max(k, 0.55);   // 万能型は攻めながらも守りを薄くしない
    return Math.round(Math.max(base, c.troops * 0.25, maxEnemy * k));
  }
  const avg = (arr, k) => arr.length ? arr.reduce((s, g) => s + g[k], 0) / arr.length : 40;
  // 戦いの強さの見積もり（AI.autoBattle と同じ考え方）
  function atkFactor(c, army) {
    const bond = Game.bondOf(army.map(g => g.name)).reduce((s, b) => s + b.bonus, 0);
    return (0.5 + c.train / 200) * (0.6 + (avg(army, 'lead') * 0.6 + avg(army, 'war') * 0.4) / 100) * (1 + bond);
  }
  function defPower(t) {
    const def = Game.gensIn(t.i).slice().sort((a, b) => (b.lead + b.war) - (a.lead + a.war)).slice(0, 5);
    const gf = def.length ? (0.6 + (avg(def, 'lead') * 0.6 + avg(def, 'war') * 0.4) / 100) : 0.85;
    // 城壁の効き目と、隣の都市・同盟国から来そうな援軍も見込む（AI.autoBattle と同じ考え方）
    let help = 0;
    if (t.owner !== null) {
      const near = fi => t.adj.map(a => G.cities[a]).filter(c => c.owner === fi).sort((a, b) => b.troops - a.troops)[0];
      const own = near(t.owner);
      if (own && own.troops >= 4000) help += Math.min(own.troops - 1500, own.troops * 0.4) * 0.85;
      Object.keys(G.factions[t.owner].allies).map(Number).forEach(fi => { if (fi !== G.player && G.factions[fi].alive && Game.isAlly(t.owner, fi) && !Game.isAlly(G.player, fi)) { const c = near(fi); if (c && c.troops >= 5000) help += c.troops * 0.4 * 0.55; } });
    }
    const sk = Game.siegeK(G.player);
    return (t.troops * (1.1 + t.def / 1000 * sk) + help * 0.4 * (0.4 + 0.6 * sk)) * (0.5 + t.train / 200) * gf;
  }
  // 1つの攻め先について、連れていく武将と兵を決める。勝ち目が足りなければ null
  function evalAttack(c, t, br) {
    const idle = Game.gensIn(c.i, G.player).filter(g => !g.acted);
    if (!idle.length) return why('武将がいない');
    if (c.troops < 4000) return why('兵が4000未満');
    const keep = garrison(c, br, t.i);
    const avail = Math.floor((c.troops - keep) / 100) * 100;
    if (avail < 3000) return why('守備兵を残すと3000に届かない');
    // 敵の強さの見積もり（知力が低いほどぶれる）
    const defEst = defPower(t) * (1 + (Math.random() - 0.5) * br.noise * 0.6) * (t.owner === null ? 0.9 : 1);
    // 勝つために欲しい力の比：性格で変わる（慎重なら大きな差、猪突なら小さな差で攻める）
    const want = wantNow(br);   // 軍師の優秀さと癖で決まる、求める力の比（攻めない季節が続くと下がる）
    // 余裕を持たせすぎると必ず勝ってしまい面白くない。勝ち目はあるが、負けることもある程度に
    const margin = (br.tier === 'smart' ? 1.12 : br.tier === 'mid' ? 1.06 : 1.0) + (Game.has(strategist(), '慎重') ? 0.08 : 0);
    // 候補の武将（君主は他に武将がいれば残す。前線では最低1人は城に残す）
    let cands = br.tier === 'dumb' ? shuffle(idle.slice()) : idle.slice().sort((a, b) => (b.lead + b.war) - (a.lead + a.war));
    if (cands.length > 1) cands = cands.filter(g => !g.isLord || br.tier === 'dumb');
    const allInCity = Game.gensIn(c.i, G.player);
    if (Game.isFront(c) && cands.length >= allInCity.length && cands.length > 1) {
      // 一番守りに向いた武将（統率が高い者）を残す
      const stay = cands.slice().sort((a, b) => b.lead - a.lead)[br.tier === 'dumb' ? cands.length - 1 : 0];
      if (br.tier !== 'dumb' || Math.random() < 0.7) cands = cands.filter(g => g !== stay);
    }
    if (!cands.length) return why('出せる武将がいない');
    // 必要な兵を満たす最小の顔ぶれを探す
    for (let n = 1; n <= Math.min(5, cands.length); n++) {
      let army = cands.slice(0, n);
      if (br.tier === 'smart') {
        // 絆の相方・計略役を加える（強さが増す）
        BONDS.forEach(bd => { if (army.some(g => bd.members.includes(g.name))) cands.forEach(g => { if (bd.members.includes(g.name) && !army.includes(g) && army.length < 5) army.push(g); }); });
      }
      const f = atkFactor(c, army);
      const need = defEst * want / f;
      const cap = army.reduce((s, g) => s + Game.troopCap(g), 0);
      // 出せる兵はすべて連れていく（守備兵は残したうえで）。兵が多いほど勝ち目は上がり、生き残った兵は戻ってくる
      const send = Math.floor(Math.min(avail, cap) / 100) * 100;
      if (send >= need && send >= 3000) {
        addPairGens(army, c, t); orderArmy(army, br);
        return { c, t, army, troops: send, keep, ratio: send * f / defEst, need: Math.round(need) };
      }
    }
    // 1つの都市で足りなければ、周りの自都市から兵を合流させて攻める
    if (br.tier !== 'dumb' || Math.random() < 0.5) {
      const r = reach(c);
      const helpers = Game.citiesOf(G.player).filter(d => d !== c && r.has(d.i))
        .map(d => ({ d, amt: Math.floor(Math.max(0, d.troops - garrison(d, br)) / 100) * 100 }))
        .filter(x => x.amt >= 1000).sort((a, b) => b.amt - a.amt);
      const army = cands.slice(0, 5);
      // 率いる武将が足りなければ、周りの都市の待機武将も呼ぶ（前線の都市には1人残す）
      const extraGens = [];
      let need0 = defEst * want / atkFactor(c, army);
      if (army.reduce((s2, g) => s2 + Game.troopCap(g), 0) < need0 * margin && army.length < 5) {
        Game.citiesOf(G.player).filter(d => d !== c && r.has(d.i)).forEach(d => {
          const idleD = Game.gensIn(d.i, G.player).filter(g => !g.acted && !g.isLord);
          const allD = Game.gensIn(d.i, G.player).length;
          const canGive = Game.isFront(d) ? Math.max(0, Math.min(idleD.length, allD - 1)) : idleD.length;
          idleD.sort((x, y) => (y.lead + y.war) - (x.lead + x.war)).slice(0, canGive).forEach(g => extraGens.push(g));
        });
        extraGens.sort((x, y) => (y.lead + y.war) - (x.lead + x.war));
        while (army.length < 5 && extraGens.length && army.reduce((s2, g) => s2 + Game.troopCap(g), 0) < need0 * margin) army.push(extraGens.shift());
      }
      const f = atkFactor(c, army), need = defEst * want / f, cap = army.reduce((s2, g) => s2 + Game.troopCap(g), 0);
      const send = Math.min(cap, Math.max(need * margin * 1.3, 3000));   // 合流させる兵は、勝ち目に余裕が出るくらいまで
      let have = Math.max(0, avail);
      const reinforce = [];
      for (const h of helpers) { if (have >= send) break; const take = Math.min(h.amt, Math.ceil((send - have) / 100) * 100); reinforce.push({ d: h.d, amt: take }); have += take; }
      const moved = army.filter(g => g.city !== c.i);
      if ((reinforce.length || moved.length) && have >= need && cap >= need) {
        addPairGens(army, c, t); orderArmy(army, br);
        const troops = Math.floor(Math.min(have, send) / 100) * 100;
        return { c, t, army, troops, keep, ratio: troops * f / defEst, need: Math.round(need), reinforce, moved };
      }
    }
    // 知力の低い軍師は、勝ち目が少し足りなくても突っ込むことがある
    if (br.tier === 'dumb' && Math.random() < 0.1) {
      const army = cands.slice(0, Math.min(5, cands.length));
      const send = Math.floor(Math.min(avail, army.reduce((s, g) => s + Game.troopCap(g), 0)) / 100) * 100;
      if (send >= 3000 && send * atkFactor(c, army) / defEst >= 1.1) return { c, t, army, troops: send, keep, ratio: send * atkFactor(c, army) / defEst, need: 0 };
    }
    const army5 = cands.slice(0, 5), need5 = defEst * want / atkFactor(c, army5), cap5 = army5.reduce((s, g) => s + Game.troopCap(g), 0);
    return why(need5 > avail ? (need5 > c.troops ? '敵が強すぎる（全軍でも足りない）' : '守備兵を残すと足りない') : need5 > cap5 ? '武将が率いられる兵の上限で足りない' : 'その他');
  }
  const WHY = {};
  function why(r) { WHY[r] = (WHY[r] || 0) + 1; return null; }
  // 総大将を先頭に並べる。賢い軍師は統率が高く、猪突でない者を選ぶ
  // 攻め先に因縁の相手がいれば、その武将を必ず連れていく
  function addPairGens(army, c, t) {
    pairWishes().forEach(w => {
      if (w.foe.city !== t.i || w.me.city !== c.i || w.me.acted || army.includes(w.me)) return;
      if (army.length >= 5) army.sort((a, b) => (b.lead + b.war) - (a.lead + a.war)).pop();
      army.push(w.me);
    });
    return army;
  }
  function orderArmy(army, br) {
    const sc = g => g.lead * 1.2 + g.war * 0.5 + g.int * 0.3 + (Game.has(g, '慎重') ? 8 : 0) - (Game.has(g, '猪突') ? (br.tier === 'dumb' ? 0 : 25) : 0) - (Game.has(g, '臆病') ? 15 : 0);
    return br.tier === 'dumb' ? army.sort((a, b) => (b.lead + b.war) - (a.lead + a.war)) : army.sort((a, b) => sc(b) - sc(a));
  }
  // ---------- 消耗戦 ----------
  // 一度で落とせる見込みがなくても、兵の数で敵の数倍を出せるなら攻めて敵兵を削る（次の攻めで落とすため）
  function attritionMult(br) {
    const g = strategist();
    return Game.has(g, '慎重') ? 3 : (Game.has(g, '野心') || Game.has(g, '猪突')) ? 2 : 2.5;
  }
  function evalAttrition(c, t, br) {
    const idle = Game.gensIn(c.i, G.player).filter(g => !g.acted);
    if (!idle.length || t.troops <= 0) return null;
    const keep = garrison(c, br, t.i);
    const local = Math.max(0, c.troops - keep);
    // 周りの自都市から合流させられる兵
    const r = reach(c);
    const helpers = Game.citiesOf(G.player).filter(d => d !== c && r.has(d.i))
      .map(d => ({ d, amt: Math.floor(Math.max(0, d.troops - garrison(d, br)) / 100) * 100 })).filter(x => x.amt >= 1000).sort((a, b) => b.amt - a.amt);
    const mult = attritionMult(br);
    const want = Math.round(t.troops * mult);
    // 率いる武将（君主は他に武将がいれば残す。前線は1人残す）
    let cands = idle.slice().sort((a, b) => (b.lead + b.war) - (a.lead + a.war));
    if (cands.length > 1) cands = cands.filter(g => !g.isLord || br.tier === 'dumb');
    if (Game.isFront(c) && cands.length >= Game.gensIn(c.i, G.player).length && cands.length > 1) cands = cands.slice(0, -1).length ? cands.filter(g => g !== cands.slice().sort((a, b) => b.lead - a.lead)[0]) : cands;
    const army = cands.slice(0, 5);
    if (!army.length) return null;
    const cap = army.reduce((s2, g) => s2 + Game.troopCap(g), 0);
    let have = local; const reinforce = [];
    for (const h of helpers) { if (have >= Math.min(want, cap)) break; const take = Math.min(h.amt, Math.ceil((Math.min(want, cap) - have) / 100) * 100); reinforce.push({ d: h.d, amt: take }); have += take; }
    const troops = Math.floor(Math.min(have, cap) / 100) * 100;
    if (troops < 3000 || troops < t.troops * mult) return null;    // 数倍に届かない
    if (troops < 8000 || troops * atkFactor(c, army) / defPower(t) < br.attrWant) return null;   // 小勢での消耗戦や、見込みの低い消耗戦はしない
    orderArmy(army, br);
    return { c, t, army, troops, keep, ratio: troops * atkFactor(c, army) / defPower(t), need: 0, reinforce: reinforce.length ? reinforce : null, attrition: true };
  }

  // ---------- 兵が揃ったら攻める（最優先） ----------
  // 前線の都市に兵が2万以上（攻め気の強い軍師は1.5万以上）いれば、隣で一番落としやすい敵都市へ毎季節攻め込む
  const BIG_ARMY = 50000;   // これ以上の兵がいる都市は、基本的に毎季節攻め込む
  function massLine() { const g = strategist(); return (Game.has(g, '野心') || Game.has(g, '猪突')) ? 15000 : 20000; }
  function planMass(br) {
    const out = [];
    const usedT = new Set();
    Game.citiesOf(G.player).forEach(c => {
      if (c.troops < massLine()) return;
      const targets = c.adj.map(a => G.cities[a]).filter(o => o.owner !== G.player && !usedT.has(o.i) && (o.owner === null || !Game.isAlly(G.player, o.owner)));
      if (!targets.length) return;
      const keep = Math.max(5000, Math.round(c.troops * 0.25));
      const sendable = Math.floor((c.troops - keep) / 100) * 100;
      // 率いる武将：この都市の待機武将（君主は他にいれば残す）。足りなければ周りの都市から呼ぶ
      let army = Game.gensIn(c.i, G.player).filter(g => !g.acted && !g.isLord).sort((a, b) => (b.lead + b.war) - (a.lead + a.war)).slice(0, 5);
      const moved = [];
      const big = c.troops >= BIG_ARMY;
      if (army.reduce((s2, g) => s2 + Game.troopCap(g), 0) < sendable && army.length < 5) {
        const r = reach(c);
        // 地続きの都市から将を呼ぶ（その都市に1人は残す。5万以上の大軍なら前線・後方を問わず呼ぶ）
        const extra = Game.gensOf(G.player).filter(g => !g.acted && !g.isLord && g.city !== c.i && r.has(g.city) && Game.gensIn(g.city, G.player).length > 1).sort((a, b) => (b.lead + b.war) - (a.lead + a.war));
        while (army.length < 5 && extra.length && army.reduce((s2, g) => s2 + Game.troopCap(g), 0) < sendable) { const g = extra.shift(); army.push(g); moved.push(g); }
      }
      if (!army.length) { const lord = Game.gensIn(c.i, G.player).find(g => g.isLord && !g.acted); if (lord) army = [lord]; else return; }
      const troops = Math.floor(Math.min(sendable, army.reduce((s2, g) => s2 + Game.troopCap(g), 0)) / 100) * 100;
      if (troops < 5000) return;
      // 一番落としやすい攻め先（明らかに敵が上回るときだけ見送る）
      const f = atkFactor(c, army);
      // 見積もりは軍師の知力しだいでぶれる
      const best = targets.map(o => ({ o, ratio: troops * f / Math.max(1, defPower(o) * (1 + (Math.random() - 0.5) * br.noise * 0.6)) })).sort((a, b) => b.ratio - a.ratio)[0];
      if (best.ratio < (big ? br.bigWant : wantNow(br))) return;   // 兵が揃っていても、勝ち目が足りなければ攻めない（5万以上の大軍は基準を下げる）
      orderArmy(army, br);
      usedT.add(best.o.i);
      out.push({ c, t: best.o, army, troops, keep, ratio: best.ratio, mass: true, big, moved });
    });
    return out;
  }

  // 攻め先の戦略上の値打ち（賢い軍師ほど重く見る）
  //  最後の一城（勢力を滅ぼせる）・敵の本拠・すでに自分の都市に囲まれている所は高く、取ったあと強い敵の矢面に立つ所は低く
  function strategicValue(t, e, br) {
    const w = br.tier === 'smart' ? 1 : br.tier === 'mid' ? 0.5 : 0;
    if (!w || t.owner === null) return 0;
    const lateK = phase().stage === 'late' ? 1.5 : 1;   // 終盤は勢力ごと崩すことを重く見る
    const last = (Game.citiesOf(t.owner).length === 1 ? 0.8 : 0) * lateK;
    const cap = (G.factions[t.owner].capital === t.i ? 0.3 : 0) * lateK;
    const surround = t.adj.filter(a => G.cities[a].owner === G.player).length * 0.1;
    const exposed = t.adj.map(a => G.cities[a]).filter(o => o.owner !== null && o.owner !== G.player && o.owner !== t.owner && !Game.isAlly(G.player, o.owner)).reduce((s2, o) => s2 + o.troops, 0);
    const risk = Math.min(0.5, exposed / Math.max(1, (e.troops || 1) * 3));
    return w * (last + cap + surround - risk);
  }
  // 中盤以降の「主敵」：接している（同盟していない）勢力のうち、いちばん倒しやすい所（力が小さく、こちらと接する城が多い）
  // 敵を一つずつ減らせば、守るべき前線も減る
  function focusFaction() {
    const ns = new Map();
    Game.citiesOf(G.player).forEach(c => c.adj.forEach(a => { const o = G.cities[a].owner; if (o !== null && o !== G.player && !Game.isAlly(G.player, o)) ns.set(o, (ns.get(o) || 0) + 1); }));
    let best = null, bs = 1e18;
    ns.forEach((touch, fi) => { const sc = Game.power(fi) / (1 + touch * 0.5); if (sc < bs) { bs = sc; best = fi; } });
    return best;
  }
  function focusValue(t, br) {
    if (br.tier === 'dumb' || t.owner === null || phase().stage === 'early' || weak()) return 0;
    return t.owner === G.autoFocus ? (br.tier === 'smart' ? 0.2 : 0.1) : 0;
  }
  // 弱小勢力の攻め先：空き城と、前の季節から兵が大きく減った城（他と戦って消耗した隙）を狙い、大国の城には手を出さない
  function weakValue(t, br) {
    if (br.tier === 'dumb' || !weak()) return 0;
    let v = 0;
    if (t.owner === null) v += 0.5;
    const prev = G.autoPrev && G.autoPrev[t.i];
    if (prev && t.troops < prev * 0.7) v += 0.5;
    if (t.owner !== null && Game.power(t.owner) > Game.power(G.player) * 2) v -= 0.4;
    return v * (br.tier === 'smart' ? 1 : 0.6);
  }
  // 攻めない季節が続くと、勝ち目の基準を少しずつ下げる（1季節5%、最大20%）。出陣できたら元に戻る
  function wantNow(br) { return br.style === 'civil' ? br.want : br.want * (1 - Math.min(0.2, 0.05 * (G.autoIdle || 0))); }   // 内政型は焦らない
  function planAttacks(br) {
    const plans = [];
    Game.citiesOf(G.player).forEach(c => {
      c.adj.map(a => G.cities[a]).filter(o => o.owner !== G.player && (o.owner === null || !Game.isAlly(G.player, o.owner))).forEach(t => {
        const e = evalAttack(c, t, br) || evalAttrition(c, t, br);
        const pairBonus = pairWishes().some(w => w.me.city === c.i && w.foe.city === t.i) ? 0.5 : 0;   // 名場面が起きそうな攻め先
        if (e) plans.push(Object.assign(e, { score: (e.attrition ? 0.5 : 0) + e.ratio * (t.owner === null ? 1.2 : 1) + (t.pop / 1e6) + pairBonus + strategicValue(t, e, br) + weakValue(t, br) + focusValue(t, br) }));
      });
    });
    plans.sort((a, b) => b.score - a.score);
    const chosen = [];
    for (const p of plans) {
      if (chosen.length >= br.maxAttacks + Math.floor(Game.citiesOf(G.player).length / 8)) break;   // 国が大きいほど、同時に攻められる
      if (chosen.some(x => x.c === p.c || x.t === p.t)) continue;
      chosen.push(p);
    }
    return chosen;
  }

  // ---------- 猛将の出陣願い ----------
  // 強くて頭の良くない武将は、率いられる上限まで兵が揃うと、自分から攻め込みたがる
  const isBrave = g => (g.war >= 85 && g.int <= 60) || (Game.has(g, '猪突') && g.war >= 80);
  function planBrave(br, attacks, reserved) {
    const out = [];
    const usedT = new Set(attacks.map(a => a.t.i));
    const usedC = new Set();
    Game.citiesOf(G.player).forEach(c => {
      if (usedC.has(c.i) || out.length >= 2) return;
      const outTroops = attacks.filter(a => a.c === c).reduce((s2, a) => s2 + a.troops, 0);   // ほかの部隊が持ち出す兵
      const idle = Game.gensIn(c.i, G.player).filter(g => !g.acted && !reserved.has(g.i));
      const brave = idle.filter(isBrave).sort((a, b) => b.war - a.war)[0];
      if (!brave) return;
      const keep = Math.max(Game.isFront(c) ? 3000 : 2000, Math.round(c.troops * 0.2));
      const cap = Game.troopCap(brave);
      if (c.troops - outTroops - keep < cap) return;          // まだ兵が揃っていない
      const targets = c.adj.map(a => G.cities[a]).filter(o => o.owner !== G.player && !usedT.has(o.i) && (o.owner === null || !Game.isAlly(G.player, o.owner)));
      if (!targets.length) return;
      // 一緒に行く武将（自分より強くない待機武将を最大2人）
      const mates = idle.filter(g => g !== brave && !g.isLord).sort((a, b) => (b.lead + b.war) - (a.lead + a.war)).slice(0, 2);
      const army = [brave, ...mates];
      const troops = Math.floor(Math.min(c.troops - outTroops - keep, army.reduce((s2, g) => s2 + Game.troopCap(g), 0)) / 100) * 100;
      // 猛将自身の見立て（知力が低いほど甘い）
      const t = targets.map(o => ({ o, ratio: troops * atkFactor(c, army) / defPower(o) })).sort((a, b) => b.ratio - a.ratio)[0];
      const selfView = t.ratio * (1 + (60 - Math.min(60, brave.int)) / 100);
      if (selfView < 0.95) return;                         // さすがに勝ち目がないと本人も思う
      // 君主が猛将なら、誰の許しも要らない（軍師は止められない）
      out.push({ c, t: t.o, army, troops, keep, ratio: t.ratio, brave, lordSelf: brave.isLord, restrain: !brave.isLord && br.tier !== 'dumb' && t.ratio < br.want * (br.tier === 'smart' ? 0.85 : 0.7) });   // 軍師が止める基準は、軍師の優秀さしだい
      usedC.add(c.i); usedT.add(t.o.i);
    });
    return out;
  }

  // 兵が足りずに攻められないとき、一番取りやすい攻め先を決めて、その手前の拠点に兵を集める
  function planStage(br, attacks) {
    G.stage = null;
    if (br.tier === 'dumb' && Math.random() < 0.5) return null;   // 知力が低いと先を見ないこともある
    const cities = Game.citiesOf(G.player);
    let best = null;
    cities.forEach(c => {
      if (attacks.some(a => a.c === c)) return;
      const r = reach(c);
      // 集められる兵（後方の都市が自分の守りを残して出せる分）
      const spare = cities.filter(d => d !== c && r.has(d.i)).reduce((s, d) => s + Math.max(0, d.troops - wants(d).troops), 0);
      c.adj.map(a => G.cities[a]).filter(o => o.owner !== G.player && (o.owner === null || !Game.isAlly(G.player, o.owner))).forEach(t => {
        const idle = Game.gensIn(c.i, G.player);
        if (!idle.length) return;
        const army = idle.slice().sort((a, b) => (b.lead + b.war) - (a.lead + a.war)).slice(0, 5);
        const need = defPower(t) * Math.max(1.05, br.aggr) / atkFactor(c, army) * (br.tier === 'smart' ? 1.3 : 1.2);
        const target = Math.round(need + garrison(c, br, t.i));
        const short = target - c.troops;
        if (short <= 0 || short > spare + 6000) return;   // すでに足りている／集めても届かない
        const score = short / Math.max(1, t.pop / 100000) + (t.owner === null ? -2000 : 0);
        if (!best || score < best.score) best = { c: c.i, t: t.i, troops: target, score };
      });
    });
    G.stage = best;
    return best;
  }

  // ---------- 計略・外交・人事 ----------
  async function doRewards(br) {
    if (br.tier === 'dumb') return;
    // 終盤は太守の独立（忠誠60未満）に備えて、褒美の目安を上げる
    const lim = br.style === 'master' ? 65 : phase().stage === 'late' ? (br.tier === 'smart' ? 65 : 60) : br.tier === 'smart' ? 60 : 45;   // 万能型はいつも家臣の心を離さない
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
  // 降伏勧告：追い詰めた隣国に使者を出す。見込みの読みは軍師の知恵しだい
  async function doSurrender(br, list, reserved) {
    const env = Game.gensOf(G.player).filter(g => !g.acted && !reserved.has(g.i)).sort((a, b) => b.cha - a.cha)[0];
    if (!env) return;
    const cand = list.map(fi => ({ fi, p: Game.surrenderOdds(env, fi).p })).sort((a, b) => b.p - a.p);
    let t = null;
    if (br.tier === 'smart') t = cand.find(x => x.p >= 0.2);
    else if (br.tier === 'mid') t = cand.find(x => x.p >= 0.3 || (x.p >= 0.15 && Math.random() < 0.4));
    else t = Math.random() < 0.35 ? pick(cand) : null;   // 考えなしに勧めることもある
    if (!t) return;
    await press(env.city, 'dip', '[data-cmd=surr]');
    await say('surr', { target: G.factions[t.fi].name + '軍' });
    env.acted = true;
    const tl = Game.lordOf(t.fi), col = G.factions[t.fi].color;
    const r = Game.diploSurrender(env, t.fi);
    Sound.se(r.ok ? 'win' : 'ng');
    await UI.talk(tl, r.ok ? 'sad' : 'angry', r.msg, col, { tag: '外交' });
    if (r.ok) Game.log(r.msg);
  }
  async function doDiplo(br, reserved = new Set()) {
    const myPow = Game.power(G.player);
    const neigh = new Set();
    Game.citiesOf(G.player).forEach(c => c.adj.forEach(a => { const o = G.cities[a].owner; if (o !== null && o !== G.player) neigh.add(o); }));
    let list = [...neigh].filter(fi => !Game.isAlly(G.player, fi));
    if (list.length) { await doSurrender(br, list, reserved); list = list.filter(fi => G.factions[fi].alive && Game.citiesOf(fi).length); }
    if (stopReq) return;
    // 弱小勢力の外交：強い隣国とは手を結んで背後を固め、空き城や弱い相手へ伸びる（ふつう以上の軍師）
    if (weak() && br.tier !== 'dumb') {
      const vacantNear = Game.citiesOf(G.player).some(c => c.adj.some(a => G.cities[a].owner === null));
      const cand = list.filter(fi => Game.power(fi) > myPow * 1.1 && (leavesEnemy(fi) || vacantNear)).sort((a, b) => Game.power(b) - Game.power(a))[0];
      if (cand != null && Math.random() < 0.85) {
        const env = Game.gensOf(G.player).filter(g => !g.acted && !reserved.has(g.i)).sort((a, b) => (b.cha + b.int) - (a.cha + a.int))[0];
        if (env) {
          await press(env.city, 'dip', '[data-cmd=ally]');
          await say('weakAlly', { target: G.factions[cand].name + '軍' });
          env.acted = true;
          const r = Game.diploAlly(env, cand);
          Sound.se(r.ok ? 'ally' : 'ng');
          await UI.talk(Game.lordOf(cand), r.ok ? 'happy' : 'angry', r.msg, G.factions[cand].color, { tag: '外交' });
          if (r.ok) Game.log(r.msg);
          return;
        }
      }
    }
    if (!br.diplo) return;
    if (list.length < 2 && br.tier !== 'smart') return;
    // 一番強い隣国と手を結ぶ（主敵とは結ばない）
    const strong = list.filter(fi => fi !== G.autoFocus).sort((a, b) => Game.power(b) - Game.power(a))[0];
    if (strong != null && Game.power(strong) > myPow * 0.7 && list.length >= 2 && leavesEnemy(strong) && Math.random() < 0.6) {
      const env = Game.gensOf(G.player).filter(g => !g.acted).sort((a, b) => (b.cha + b.int) - (a.cha + a.int))[0];
      if (!env) return;
      await press(env.city, 'dip', '[data-cmd=ally]');
      await say('diplo', { target: G.factions[strong].name + '軍' });
      env.acted = true;
      const r = Game.diploAlly(env, strong);
      Sound.se(r.ok ? 'ally' : 'ng');
      await UI.talk(Game.lordOf(strong), r.ok ? 'happy' : 'angry', r.msg, G.factions[strong].color, { tag: '外交' });
      if (r.ok) Game.log(r.msg);
    }
  }
  // 計略：軍師の能力で回数と狙いが変わる（離間・引き抜き・流言を使い分ける）
  async function doPlots(br, reserved, attackTargets) {
    const sg = strategist();
    const wise = Game.has(sg, '智謀') || Game.has(sg, '神算');
    let times = br.tier === 'smart' ? 2 : br.tier === 'mid' ? 1 : (Math.random() < 0.6 ? 1 : 0);
    if (wise) times++;
    if (br.style === 'master') times++;
    const front = new Set();
    Game.citiesOf(G.player).forEach(c => c.adj.forEach(a => { const o = G.cities[a]; if (o.owner !== null && o.owner !== G.player && !Game.isAlly(G.player, o.owner)) front.add(a); }));
    if (!front.size) return;
    const used = new Set();
    for (let k = 0; k < times; k++) {
      if (stopReq) return;
      // 実行役：出陣予定でない、知力の高い待機中の武将（知力の低い軍師は人選も雑）
      let agents = Game.gensOf(G.player).filter(g => !g.acted && !reserved.has(g.i));
      if (!agents.length) return;
      agents = br.tier === 'dumb' ? shuffle(agents) : agents.sort((a, b) => b.int - a.int);
      const agent = agents[0];
      if (br.tier !== 'dumb' && agent.int < 60) return;
      const home = G.cities[agent.city];
      // 候補を作って、価値の高い順に選ぶ
      const opts = [];
      G.gens.forEach(t => {
        if (t.state !== 'serve' || !front.has(t.city) || t.isLord || Game.has(t, '忠義') || used.has('g' + t.i)) return;
        const worth = (t.lead + t.war + t.int + t.pol) / 40;
        // 次に攻める都市の将を崩しておくと、合戦で内応・寝返りが起きやすい（賢い軍師ほど重く見る）
        const nextT = attackTargets.includes(t.city) || (G.stage && G.stage.t === t.city) ? (br.tier === 'smart' ? 3 : 1.5) : 0;
        if (t.loyalty < 45 && home.gold >= 400) opts.push({ kind: 'lure', t, city: t.city, v: worth + (45 - t.loyalty) / 5 + (Game.has(t, '野心') ? 2 : 0) + nextT });
        else if (t.loyalty < 85 && home.gold >= 50) opts.push({ kind: 'sow', t, city: t.city, v: worth * 0.5 + (Game.has(t, '野心') ? 4 : 0) + (85 - t.loyalty) / 10 + nextT });
      });
      if (home.gold >= 100) front.forEach(ci => {
        const c = G.cities[ci];
        if (used.has('c' + ci) || c.loyal < 35) return;
        opts.push({ kind: 'rumor', city: ci, v: (attackTargets.includes(ci) ? 3.5 : 0.5) + c.loyal / 40 + c.train / 60 });
      });
      if (!opts.length) return;
      const o = br.tier === 'dumb' ? pick(opts) : opts.sort((a, b) => b.v - a.v)[br.tier === 'mid' && opts.length > 1 && Math.random() < 0.3 ? 1 : 0];
      used.add(o.t ? 'g' + o.t.i : 'c' + o.city);
      MapView.centerOn(o.city); App.openCity(o.city); await wait(400);
      const btn = document.querySelector(`[data-x=${o.kind}]`);
      if (btn) { btn.classList.add('auto-press'); Sound.se('tap'); await wait(450); btn.classList.remove('auto-press'); }
      await say(o.kind === 'rumor' ? 'rumor' : 'plot', { foe: o.t ? o.t.name : '', target: G.cities[o.city].name });
      if (br.tier !== 'dumb' || Math.random() < 0.5) await UI.talk(agent, 'normal', `${agent.name}「${line(agent, 'plotGo')}」`);
      agent.acted = true;
      let r;
      if (o.kind === 'lure') { home.gold -= 300; r = Game.plotLure(agent, o.t, 300); }
      else if (o.kind === 'sow') { home.gold -= 50; r = Game.plotSow(agent, o.t); }
      else { home.gold -= 100; r = Game.plotRumor(agent, G.cities[o.city]); }
      Sound.se(r.ok ? 'ok' : 'ng');
      if (r.immune) await UI.talk(o.t, 'angry', (SPECIAL_LINES[o.t.name] && SPECIAL_LINES[o.t.name].immune) || `${o.t.name}「${line(o.t, 'refuse')}」`, facColor(o.t), { tag: '忠義' });
      else if (r.ok && o.kind === 'lure') { await UI.talk(o.t, 'happy', `${o.t.name}「${line(o.t, 'join')}」\n<b>${r.msg}</b>`); Game.log(`${o.t.name}が${G.factions[G.player].name}軍に寝返った。`); }
      else if (r.ok && o.kind === 'sow') await UI.talk(o.t, Game.has(o.t, '野心') ? 'angry' : 'sad', `${o.t.name}「${line(o.t, 'sown')}」\n<b>${r.msg}</b>`, facColor(o.t));
      else if (r.ok) await UI.talk(agent, 'happy', `${agent.name}「${line(agent, 'success')}」\n<b>${r.msg}</b>`);
      else await UI.talk(agent, 'sad', `${agent.name}「${line(agent, 'fail')}」\n<b>${r.msg}</b>`);
      App.refresh();
    }
  }
  // ---------- 登用：見つけた在野の人物は、適任者を向かわせてでも採る ----------
  const worth = g => g.lead + g.war + g.int + g.pol + g.cha;
  async function doRecruit(br, reserved) {
    G.recFail = G.recFail || {};
    const lord = Game.lordOf(G.player);
    // 自領にいて、すでに見つけてある在野の人物（価値の高い順）
    const known = [];
    Game.citiesOf(G.player).forEach(c => Game.roninIn(c.i).filter(r => r.known).forEach(r => known.push(r)));
    if (br.tier !== 'dumb') known.sort((a, b) => worth(b) - worth(a)); else shuffle(known);
    let moves = 0;
    for (const t of known) {
      if (stopReq) return;
      if (t.state !== 'ronin') continue;
      const c = G.cities[t.city];
      if (c.owner !== G.player) continue;
      const fails = G.recFail[t.i] || 0;
      // 三顧の礼：君主自身が訪ねる
      if (t.name === '諸葛亮') {
        if (lord.acted || reserved.has(lord.i)) continue;
        if (lord.city !== c.i) {
          if (moves >= 2) continue;
          await press(lord.city, 'per', '[data-cmd=move]');
          await say('kongming', { gen: t.name, city: c.name, lord: lord.name });
          Game.move(lord, c.i); moves++;
          UI.toast(`${lord.name}が${c.name}へ（${t.name}を訪ねるため）`, 2200);
          continue;
        }
        await press(c.i, 'per', '[data-cmd=recruit]');
        lord.acted = true;
        await App.doRecruit(lord, t);
        continue;
      }
      // その都市にいる、まだ動ける武将のうち魅力の高い者
      const here = Game.gensIn(c.i, G.player).filter(g => !g.acted && !reserved.has(g.i));
      here.sort((a, b) => br.tier === 'dumb' ? Math.random() - 0.5 : b.cha - a.cha);
      // 他の都市にもっと魅力の高い者がいれば、向かわせる（失敗が続いた人物や、価値の高い人物ほど）
      const best = Game.gensOf(G.player).filter(g => !g.acted && !reserved.has(g.i) && g.city !== c.i && !(Game.isFront(G.cities[g.city]) && Game.gensIn(g.city, G.player).length <= 1))
        .sort((a, b) => b.cha - a.cha)[0];
      const env = here[0];
      const wantBetter = best && (!env || (br.tier !== 'dumb' && best.cha >= env.cha + (fails ? 8 : 20) && worth(t) >= 300));
      if (wantBetter) {
        if (moves >= (br.tier === 'smart' ? 3 : 2)) continue;
        const from = G.cities[best.city];
        await press(from.i, 'per', '[data-cmd=move]');
        await say('recruitGo', { gen: t.name, envoy: best.name, city: c.name });
        await MapView.march(from.i, c.i, G.factions[G.player].color);
        Game.move(best, c.i); moves++;
        UI.toast(`${best.name}（魅力${best.cha}）が${t.name}を誘いに ${from.name} → ${c.name} へ`, 2400);
        continue;   // 移動で今季の行動は終わり。次の季節に誘う
      }
      if (!env) continue;
      await press(c.i, 'per', '[data-cmd=recruit]');
      await say('rec', { gen: t.name });
      env.acted = true;
      const before = t.state;
      await App.doRecruit(env, t);
      if (t.state === before) G.recFail[t.i] = fails + 1; else delete G.recFail[t.i];
    }
  }
  // ---------- 補給（足りない拠点へ金・兵糧・兵を回す） ----------
  // 自領だけを通ってたどり着ける都市どうしで融通する
  function reach(from) {
    const seen = new Set([from.i]), q = [from.i];
    while (q.length) { const x = q.shift(); G.cities[x].adj.forEach(a => { if (!seen.has(a) && G.cities[a].owner === G.player) { seen.add(a); q.push(a); } }); }
    return seen;
  }
  // 今の軍師が内政型か
  function civilNow() { const g = strategist(); return !!g && brain(g).style === 'civil'; }
  // 隣の敵の都市のうち、いちばん兵の多い所の兵数
  function maxAdjEnemy(c) { return c.adj.reduce((m, a) => { const o = G.cities[a]; return (o.owner !== null && o.owner !== G.player && !Game.isAlly(G.player, o.owner)) ? Math.max(m, o.troops) : m; }, 0); }
  function wants(c) {
    const front = Game.isFront(c);
    const threat = AI.threat(c, G.player);
    return {
      front, threat,
      food: Game.foodReserve(c) + (front ? 3000 : 1000),               // これだけは置いておきたい
      gold: front ? 800 : 400,
      troops: Math.max(front ? Math.max(6000, Math.round(threat * 0.8), civilNow() ? maxAdjEnemy(c) : 0) : 2500, G.stage && G.stage.c === c.i ? G.stage.troops : 0),
    };
  }
  // ---------- 武将の配置換え：強い武将は前線へ、文官は内地へ ----------
  const milScore = g => g.lead + g.war + (Game.has(g, '剛勇') || Game.has(g, '猪突') ? 10 : 0) + (Game.has(g, '騎馬') ? 5 : 0);
  const civScore = g => g.pol + g.cha * 0.3 + (Game.has(g, '治世') ? 15 : 0);
  async function deploy(br, reserved, attacks) {
    const cities = Game.citiesOf(G.player);
    const fronts = cities.filter(c => Game.isFront(c));
    const inner = cities.filter(c => !Game.isFront(c));
    if (!fronts.length || !inner.length) return;
    const limit = br.tier === 'smart' ? 5 : br.tier === 'mid' ? 3 : 2;
    const strongLine = br.tier === 'dumb' ? 140 : 150;
    // 前線の優先度：攻撃の拠点・攻める予定の都市・敵の圧力が強い所。武将が多い所は下げる
    const prio = f => (G.stage && G.stage.c === f.i ? 40 : 0) + (attacks.some(a => a.c === f) ? 25 : 0)
      + Math.min(30, AI.threat(f, G.player) / 1500) - Game.gensIn(f.i, G.player).length * 5;
    // 後方にいる強い武将（内地に内政役を1人残す。君主は動かさない）
    const movers = [];
    inner.forEach(c => {
      const gs = Game.gensIn(c.i, G.player);
      if (gs.length < 2) return;
      const keeper = gs.slice().sort((a, b) => civScore(b) - civScore(a))[0];
      gs.forEach(g => {
        if (g === keeper || g.isLord || g.acted || reserved.has(g.i)) return;
        if (milScore(g) >= strongLine && (milScore(g) >= civScore(g) + 20 || milScore(g) >= 170)) movers.push(g);
      });
    });
    if (br.tier === 'dumb') shuffle(movers); else movers.sort((a, b) => milScore(b) - milScore(a));
    let n = 0, said = false;
    for (const g of movers) {
      if (stopReq || n >= limit) break;
      const dest = fronts.slice().sort((a, b) => prio(b) - prio(a))[br.tier === 'dumb' ? Math.floor(Math.random() * fronts.length) : 0];
      if (!dest) break;
      const from = G.cities[g.city];
      await press(from.i, 'per', '[data-cmd=move]');
      await say('deploy', { gen: g.name, to: dest.name, from: from.name });
      await UI.talk(g, Game.has(g, '臆病') ? 'shock' : 'angry', `${g.name}「${line(g, 'deployFront')}」`);
      await MapView.march(from.i, dest.i, G.factions[G.player].color);
      Game.move(g, dest.i);
      UI.toast(`${g.name}（統${g.lead} 武${g.war}）が ${from.name} → ${dest.name} へ`, 2400);
      App.refresh();
      n++; said = true;
    }
    // 前線に武将が多すぎるときは、文官を内地へ戻して内政を任せる
    if (br.tier !== 'smart') return;
    for (const f of fronts) {
      if (stopReq || n >= limit + 2) break;
      const gs = Game.gensIn(f.i, G.player);
      if (gs.length <= 4) continue;
      const civ = gs.filter(g => !g.isLord && !g.acted && !reserved.has(g.i) && civScore(g) >= milScore(g) * 0.75 && milScore(g) < 140).sort((a, b) => milScore(a) - milScore(b))[0];
      if (!civ) continue;
      const dest = inner.slice().sort((a, b) => Game.gensIn(a.i, G.player).length - Game.gensIn(b.i, G.player).length)[0];
      await press(f.i, 'per', '[data-cmd=move]');
      await say('deployCivil', { gen: civ.name, to: dest.name });
      Game.move(civ, dest.i);
      UI.toast(`${civ.name}が ${f.name} → ${dest.name} へ（内政）`, 2200);
      App.refresh();
      n++;
    }
  }

  // 内政型の軍師：内地の都市に、都市の大きさ（人口15万人ごとに1人、1〜3人）に応じて文官を置く
  async function placeCivil(br, reserved) {
    if (br.style === 'mil') return;   // 内政型と万能型が、内地に文官を置く
    const cities = Game.citiesOf(G.player);
    const isCiv = g => civScore(g) >= milScore(g) * 0.8 && !g.isLord;
    let moves = 0;
    for (const c of cities.filter(x => !Game.isFront(x)).sort((a, b) => b.pop - a.pop)) {
      if (stopReq || moves >= 3) return;
      const want = clamp(Math.round(c.pop / 150000), 1, 3);
      const have = Game.gensIn(c.i, G.player).filter(isCiv).length;
      if (have >= want) continue;
      // 文官の多すぎる都市（前線は2人を超える分、内地はその都市の必要数を超える分）から呼ぶ
      const donor = cities.filter(d => d !== c).map(d => {
        const civs = Game.gensIn(d.i, G.player).filter(g => isCiv(g) && !g.acted && !reserved.has(g.i));
        const need = Game.isFront(d) ? 0 : clamp(Math.round(d.pop / 150000), 1, 3);
        return { d, civs, extra: Game.gensIn(d.i, G.player).length > 1 ? civs.length - need : 0 };
      }).filter(x => x.extra > 0).sort((a, b) => b.extra - a.extra)[0];
      if (!donor) continue;
      const g = donor.civs.sort((a, b) => civScore(b) - civScore(a))[0];
      await press(g.city, 'per', '[data-cmd=move]');
      await say('deployCivil', { gen: g.name, to: c.name });
      Game.move(g, c.i);
      UI.toast(`${g.name}が ${donor.d.name} → ${c.name} へ（内政）`, 2200);
      App.refresh(); moves++;
    }
  }

  // ---------- 史実・人物イベントが起きるように武将を寄せる ----------
  // 戦場で名場面になる組み合わせ（自軍の人物 → 敵の人物）
  function battlePairs() {
    const list = PAIRS.map(p => p.who);
    ['劉備', '関羽', '張飛'].forEach(n => list.push([n, '呂布']));
    list.push(['関羽', '曹操']);
    return list;
  }
  // 自軍の誰を、どの敵の人物にぶつけたいか
  function pairWishes() {
    const out = [];
    battlePairs().forEach(([x, y]) => {
      [[x, y], [y, x]].forEach(([m, f]) => {
        const a = G.gens.find(g => g.name === m), b = G.gens.find(g => g.name === f);
        if (!a || !b || a.state !== 'serve' || b.state !== 'serve' || a.faction !== G.player || b.faction === G.player || Game.isAlly(G.player, b.faction)) return;
        if (m === '関羽' && f === '曹操' && G.events.huarong) return;
        out.push({ me: a, foe: b });
      });
    });
    return out;
  }
  async function eventSeek(br, reserved) {
    const done = G.events.hist || {};
    const limit = br.tier === 'smart' ? 4 : br.tier === 'mid' ? 3 : 2;
    let n = 0;
    const canMove = g => g && g.state === 'serve' && g.faction === G.player && !g.acted && !reserved.has(g.i) && !(Game.isFront(G.cities[g.city]) && Game.gensIn(g.city, G.player).length <= 1 && !g.isLord);
    const go = async (g, to, kind, ctx) => {
      if (n >= limit || g.city === to) return;
      const from = G.cities[g.city];
      await press(from.i, 'per', '[data-cmd=move]');
      await say(kind, ctx);
      await MapView.march(from.i, to, G.factions[G.player].color);
      Game.move(g, to); n++;
      UI.toast(`${g.name}が ${from.name} → ${G.cities[to].name} へ`, 2000);
      App.refresh();
    };
    // 1) 同じ都市に集める
    for (const m of Events.MEET) {
      if (stopReq || n >= limit || done[m.id]) continue;
      const gs = m.who.map(nm => G.gens.find(g => g.name === nm));
      if (!gs.every(g => g && g.state === 'serve' && g.faction === G.player)) continue;
      if (gs.every(g => g.city === gs[0].city)) continue;
      const anchor = gs.find(g => g.isLord) || gs.find(g => !canMove(g)) || gs[0];
      for (const g of gs) { if (g !== anchor && g.city !== anchor.city && canMove(g)) await go(g, anchor.city, 'eventMeet', { gens: gs.map(x => x.name).join('・'), city: G.cities[anchor.city].name }); }
    }
    // 2) 因縁の相手の隣へ
    for (const f of Events.FACE) {
      if (stopReq || n >= limit || done[f.id]) continue;
      if (f.year && (G.year < f.year[0] || G.year > f.year[1])) continue;
      const me = G.gens.find(g => g.name === f.mine);
      if (!canMove(me)) continue;
      let foeCities;
      if (f.foe[0] === '@') { const fi = G.factions.findIndex(x => x.alive && Game.lordOf(x.i).name === f.foe.slice(1)); if (fi < 0 || fi === G.player || Game.isAlly(G.player, fi)) continue; foeCities = Game.citiesOf(fi).filter(c => !f.river || c.terrain === 'river').map(c => c.i); }
      else { const y = G.gens.find(g => g.name === f.foe); if (!y || y.state !== 'serve' || y.faction === G.player || Game.isAlly(G.player, y.faction)) continue; foeCities = [y.city]; }
      if (G.cities[me.city].adj.some(a => foeCities.includes(a))) continue;
      const spots = Game.citiesOf(G.player).filter(c => c.adj.some(a => foeCities.includes(a))).sort((a, b) => b.troops - a.troops);
      if (spots[0]) await go(me, spots[0].i, 'eventFace', { gen: me.name, city: spots[0].name, foe: f.foe.replace('@', '') });
    }
    // 3) 戦場の名場面：相手のいる敵都市の隣へ
    for (const w of pairWishes()) {
      if (stopReq || n >= limit) break;
      if (!canMove(w.me) || G.cities[w.me.city].adj.includes(w.foe.city)) continue;
      const spots = Game.citiesOf(G.player).filter(c => c.adj.includes(w.foe.city)).sort((a, b) => b.troops - a.troops);
      if (spots[0]) await go(w.me, spots[0].i, 'eventFace', { gen: w.me.name, city: spots[0].name, foe: w.foe.name });
    }
  }

  // 内地（敵に接していない都市）で鍛えた兵を、前線の都市へ送り出す
  async function sendTrained(br) {
    if (br.tier === 'dumb' && Math.random() < 0.6) return;
    const cities = Game.citiesOf(G.player);
    const fronts = cities.filter(c => Game.isFront(c));
    if (!fronts.length) return;
    let moves = 0;
    for (const c of cities) {
      if (stopReq || moves >= (br.tier === 'smart' ? 3 : 2)) return;
      if (Game.isFront(c) || c.train < (br.tier === 'smart' ? 65 : 55)) continue;
      const keep = Math.max(2500, Math.round(c.troops * 0.2));
      const amt = Math.floor((c.troops - keep) / 100) * 100;
      if (amt < 2000) continue;
      const r = reach(c);
      // 送り先：攻撃の拠点 → 兵が脅威に足りない前線 → 兵の少ない前線
      const dest = fronts.filter(f => r.has(f.i)).sort((a, b) => {
        const s2 = f => (G.stage && G.stage.c === f.i ? 1e6 : 0) + (AI.threat(f, G.player) - f.troops);
        return s2(b) - s2(a);
      })[0];
      if (!dest) continue;
      await press(c.i, 'mil', '[data-cmd=transport]');
      await say('transfer', { from: c.name, to: dest.name, what: `鍛えた兵（訓練${Math.round(c.train)}）` });
      await MapView.march(c.i, dest.i, G.factions[G.player].color);
      const food = Math.max(0, Math.min(c.food - Game.foodReserve(c, c.troops - amt), Math.round(amt * 0.12 * 2)));
      Game.transport(c, dest, 0, Math.floor(food), amt);
      UI.toast(`${c.name} → ${dest.name}　鍛えた兵${fmt(amt)}（${dest.name}の訓練 ${Math.round(dest.train)}）`, 2600);
      App.refresh();
      moves++;
      await wait(400);
    }
  }
  // 敵と接していない都市に5万以上の兵がいれば、敵と接する都市へ送る（次の季節にそこから攻め込むため）
  async function forwardBig(br) {
    for (const c of Game.citiesOf(G.player)) {
      if (stopReq) return;
      if (c.troops < (phase().stage === 'late' ? 30000 : BIG_ARMY) || Game.isFront(c)) continue;   // 終盤は3万から前線へ回す
      // 地続きで、いちばん近い前線の都市
      const dist = { [c.i]: 0 }, q = [c.i]; let to = null;
      while (q.length && !to) { const x = q.shift(); for (const a of G.cities[x].adj) { if (dist[a] != null || G.cities[a].owner !== G.player) continue; dist[a] = dist[x] + 1; if (Game.isFront(G.cities[a])) { to = G.cities[a]; break; } q.push(a); } }
      if (!to) continue;
      const amt = Math.floor((c.troops - Math.max(8000, wants(c).troops)) / 100) * 100;
      if (amt < 10000) continue;
      const food = Math.floor(Math.max(0, Math.min(c.food - Game.foodReserve(c, c.troops - amt), Math.round(amt * 0.03 * 30))) / 100) * 100;
      await press(c.i, 'mil', '[data-cmd=transport]');
      await say('transfer', { from: c.name, to: to.name, what: '兵' });
      await MapView.march(c.i, to.i, G.factions[G.player].color);
      Game.transport(c, to, 0, food, amt);
      UI.toast(`${c.name} → ${to.name}　兵${fmt(amt)}・兵糧${fmt(food)} を前線へ`, 2400);
      App.refresh();
    }
  }
  // 手の空いた将に修行をさせる（武の将は統率・武力、文の将は政治・知力の低い方を伸ばす）
  async function idleStudy(br) {
    if (br.tier === 'dumb') return;
    const idle = Game.gensOf(G.player).filter(g => !g.acted && !g.isLord);
    let shown = 0;
    for (const g of idle) {
      if (stopReq) return;
      if (br.tier === 'mid' && br.style === 'mil' && Math.random() < 0.5) continue;   // 内政型・万能型は修行も欠かさない
      const keys = milScore(g) >= civScore(g) * 1.1 ? ['lead', 'war'] : ['pol', 'int'];
      const k = keys.filter(x => g[x] < 95).sort((a, b) => g[a] - g[b])[0];
      if (!k) continue;
      const before = g[k], gain = Game.study(g, k);
      g.acted = true;
      const NM = { lead: '統率', war: '武力', int: '知力', pol: '政治' };
      if (shown < 2) {   // 全員分の会話は長くなるので、2人まで見せて残りは知らせだけ
        await press(g.city, 'per', '[data-cmd=study]');
        await UI.talk(g, gain ? 'happy' : 'normal', `${g.name}「${gain ? line(g, 'study_' + k) : line(g, 'study_fail')}」\n<b>修行：${NM[k]} ${before} → ${g[k]}</b>`);
        shown++;
      } else if (gain) UI.toast(`${g.name} 修行で${NM[k]} +${gain}`, 1600);
    }
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
    setBar(`${g.isLord ? "君主" : "軍師"} <b>${g.name}</b> が${g.isLord ? "自ら" : ""}采配中（${G.year}年${SEASONS[G.season]}）`);
    G.autoFocus = focusFaction();
    const mass = planMass(br);
    const attacks = [...mass, ...planAttacks(br).filter(p => !mass.some(m => m.c === p.c || m.t === p.t))];
    const stage = attacks.length < br.maxAttacks ? planStage(br, attacks) : (G.stage = null);
    const L = g.isLord;   // 君主が自ら采配するときは、言い切りの口調で
    const plan = (attacks.length ? `今季は${attacks.map(a => a.t.name).join('と')}を${L ? '攻める' : '攻めます'}。` : '') + (stage ? `${G.cities[stage.c].name}に兵を集め、${G.cities[stage.t].name}を攻める支度を${L ? 'せよ' : 'します'}。` : attacks.length ? '' : `今季は国力を${L ? '蓄える' : '蓄えます'}。`);
    // 局面の見立てを一言添える（知力の低い軍師は言わない）
    const ph = phase();
    const PN = { early: L ? '今は国の土台を作る時だ。' : '今は国の土台を作る時です。', mid: L ? '攻めの力を蓄え、前へ出る時だ。' : '攻めの力を蓄え、前へ出る時です。', late: L ? '天下は目前。民と家臣の心を離さぬようにせよ。' : '天下は目前。民と家臣の心を離さぬように。' };
    const civilNote = br.style === 'civil' ? (L ? '' : '国を富ませ、兵を養い、守りを固めます。') : br.style === 'master' ? (L ? '富国強兵。内を固め、外を討つ。' : '富国強兵。内を固め、外を討ちます。') : '';
    const focusNote = civilNote ? civilNote : br.tier !== 'dumb' && ph.stage !== 'early' && !weak() && G.autoFocus != null ? (L ? `まずは${G.factions[G.autoFocus].name}軍を討ち、敵を一つずつ減らす。` : `まずは${G.factions[G.autoFocus].name}軍を討ち、敵を一つずつ減らします。`) : '';
    const note = focusNote + (br.tier === 'dumb' ? '' : (ph.stage === 'early' && weak() ? (L ? '今は小国だ。強国とは争わず、空き城と隙を狙え。' : '今は小国。強国とは争わず、空き城と隙を狙います。') : PN[ph.stage]) + (ph.staff === 'few' ? (L ? '人手が足りぬ。人材を探せ。' : '人手が足りません。人材を探しましょう。') : ''));
    await say('intro', { season: `${G.year}年${SEASONS[G.season]}`, plan: note + plan }, attacks.length ? 'angry' : 'normal');
    if (stopReq) return false;
    await doRewards(br); if (stopReq) return false;
    // 出陣は季節の最初に（将・兵・兵糧を寄せてから攻める。内政や輸送はそのあと）
    // 出陣する武将はあらかじめ取っておく
    const armies = attacks.map(p => ({ p, army: p.army, troops: p.troops }));
    const reserved = new Set(armies.flatMap(a => a.army.map(x => x.i)));
    // 猛将の出陣願い（兵が揃った強い武将は、自分から攻め込みたがる）
    for (const bp of planBrave(br, attacks, reserved)) {
      if (stopReq) return false;
      await press(bp.c.i, 'mil', '[data-cmd=attack]');
      if (bp.lordSelf) {
        // 君主自らの判断で出陣
        Sound.se('gong');
        await UI.talk(bp.brave, 'angry', `${bp.brave.name}「${line(bp.brave, 'braveLord')}」\n<b>（${bp.brave.name}は自ら${bp.t.name}への出陣を決めた）</b>`, facColor(bp.brave), { tag: '君主出陣' });
        await say('braveLord', { gen: bp.brave.name, target: bp.t.name });
        bp.isBrave = true;
        armies.push({ p: bp, army: bp.army, troops: bp.troops });
        bp.army.forEach(x => reserved.add(x.i));
        continue;
      }
      await UI.talk(bp.brave, 'angry', `${bp.brave.name}「${line(bp.brave, 'braveAsk')}」\n<b>（${bp.c.name}の兵が揃った。${bp.t.name}への出陣を願い出ている）</b>`, facColor(bp.brave), { tag: '出陣願い' });
      if (bp.restrain) {
        await say('braveNo', { gen: bp.brave.name, target: bp.t.name });
        bp.brave.loyalty = Math.max(0, bp.brave.loyalty - 3);
        await UI.talk(bp.brave, 'angry', `${bp.brave.name}「${line(bp.brave, 'braveGrumble')}」`, facColor(bp.brave));
        continue;
      }
      await say('braveOk', { gen: bp.brave.name, target: bp.t.name });
      bp.isBrave = true;
      armies.push({ p: bp, army: bp.army, troops: bp.troops });
      bp.army.forEach(x => reserved.add(x.i));
    }
    // 出陣
    let sorties = 0;
    if (!armies.length) await say('hold');
    for (const a of armies) {
      if (stopReq) return false;
      const { p } = a;
      if (p.c.owner !== G.player || p.t.owner === G.player || (p.t.owner !== null && Game.isAlly(G.player, p.t.owner))) continue;
      // 出陣は季節の最初に行うので、計画したときの見積もりのまま進める（見積もり直すと、他の出陣に充てた将を取り合ってしまう）
      const e = p;
      // 武将の合流
      if (e.moved && e.moved.length) {
        const names = e.moved.map(g => g.name).join('・');
        await press(e.moved[0].city, 'per', '[data-cmd=move]');
        await say('gather', { from: names, to: p.c.name, target: p.t.name });
        e.moved.forEach(g => { if (g.state === 'serve' && g.faction === G.player && !g.acted) g.city = p.c.i; });
        UI.toast(`${names} が${p.c.name}に合流`, 2200);
      }
      let army = e.army.filter(x => x.state === 'serve' && x.faction === G.player && x.city === p.c.i && !x.acted);
      // 寝返りに備える：忠誠40未満の将は、褒美で引き締める。それでも足りなければ連れていかない（知力の低い軍師は気づかない）
      if (br.tier !== 'dumb') {
        for (const g of army.filter(x => !x.isLord && !Game.has(x, '忠義') && x.loyalty < 40)) {
          for (let k = 0; k < 3 && g.loyalty < 40 && p.c.gold >= 150; k++) Game.reward(g, p.c);
          if (g.loyalty < 40) { army = army.filter(x => x !== g); UI.toast(`${g.name}は忠誠が低く、寝返りのおそれがあるので留守番`, 2200); }
          else UI.toast(`${g.name}に褒美を与え、出陣前に引き締めた（忠誠${Math.round(g.loyalty)}）`, 2200);
        }
      }
      if (!army.length) continue;
      // 兵の合流
      if (e.reinforce) {
        for (const rf of e.reinforce) {
          if (stopReq) return false;
          const d = rf.d, amt = Math.min(rf.amt, Math.floor((d.troops - garrison(d, br)) / 100) * 100);
          if (amt < 500) continue;
          await press(d.i, 'mil', '[data-cmd=transport]');
          await say('gather', { from: d.name, to: p.c.name, target: p.t.name });
          await MapView.march(d.i, p.c.i, G.factions[G.player].color);
          const food = Math.max(0, Math.min(d.food - Game.foodReserve(d, d.troops - amt), Math.round(amt * 0.03 * 30)));
          Game.transport(d, p.c, 0, Math.floor(food), amt);
          UI.toast(`${d.name} → ${p.c.name}　兵${fmt(amt)}・兵糧${fmt(food)} が合流`, 2400);
          App.refresh();
        }
      }
      // 実際に集まった将が率いられる分までに抑える
      const troops = Math.min(e.troops, Math.floor((p.c.troops - e.keep) / 100) * 100, Math.floor(army.reduce((s2, g) => s2 + Game.troopCap(g), 0) / 100) * 100);
      // 予定の将が他の出陣に回って減ったときは、勝ち目を確かめ直す（足りなければ見送る）
      if (army.length < e.army.length && !e.big) {
        const ratio = troops * atkFactor(p.c, army) / Math.max(1, defPower(p.t));
        if (ratio < (e.attrition ? br.attrWant : wantNow(br))) { await say('hold'); continue; }
      }
      if (troops < 3000) { await say('hold'); continue; }
      // 兵糧：通常は次の秋までの分を残し20日分。兵が揃った攻め・猛将は、残る兵の1季節分だけ残して10日分あればよい
      const loose = p.mass || p.isBrave;
      // 大軍の攻めで兵糧が20日分に足りなければ、地続きの都市から集める
      if (e.big) {
        let lack = Math.round(troops * 0.03 * 20) - (p.c.food - Math.round((p.c.troops - troops) * 0.12 + 1000));
        if (lack > 0) {
          const r = reach(p.c);
          for (const d of Game.citiesOf(G.player).filter(d => d !== p.c && r.has(d.i)).sort((a, b) => (b.food - Game.foodReserve(b)) - (a.food - Game.foodReserve(a)))) {
            if (lack <= 0) break;
            const give = Math.floor(Math.min(lack * 1.2, d.food - Game.foodReserve(d)) / 100) * 100;
            if (give < 1000) continue;
            await press(d.i, 'mil', '[data-cmd=transport]');
            await MapView.march(d.i, p.c.i, G.factions[G.player].color);
            Game.transport(d, p.c, 0, give, 0); lack -= give;
            UI.toast(`${d.name} → ${p.c.name}　兵糧${fmt(give)} を送った（大軍の出陣のため）`, 2200);
          }
          App.refresh();
        }
      }
      const spare = p.c.food - (loose ? Math.round((p.c.troops - troops) * 0.12 + 1000) : Game.foodReserve(p.c, p.c.troops - troops));
      const food = Math.min(Math.round(troops * 0.03 * 30), Math.floor(spare));
      if (food < troops * 0.03 * (loose ? 10 : 20)) { await say('hold'); continue; }
      await press(p.c.i, 'mil', '[data-cmd=attack]');
      MapView.setHighlight([p.t.i]); await wait(500); MapView.setHighlight(null);
      await say(e.mass ? 'mass' : e.attrition ? 'attrition' : 'attack', { target: p.t.name, n: fmt(p.t.troops), gen: army[0].name, m: fmt(troops), k: fmt(p.c.troops - troops), city: p.c.name }, 'angry');
      UI.closeSheet();
      const cmdr = army[0];
      Sound.se('march');
      await UI.talk(cmdr, 'angry', `${cmdr.name}「${line(cmdr, 'sortie')}」`, facColor(cmdr), { tag: '出陣' });
      army.forEach(x => x.acted = true);
      sorties++;
      const r = await App.executeBattle({ atkFi: G.player, from: p.c.i, to: p.t.i, gens: army.map(x => x.i), troops, food }, 'watch');
      if (r === 'end') return false;
    }
    UI.closeSheet();
    G.autoIdle = sorties ? 0 : (G.autoIdle || 0) + 1;
    // 出陣が済んだら、出陣した将は行動済み。取りやめになった出陣の将は、このあとの外交・内政などで働ける
    reserved.clear();
    const armies0 = [];
    await doDiplo(br, new Set()); if (stopReq) return false;
    await doPlots(br, new Set(armies0.map(x => x.i)), [...new Set([...attacks.filter(p => p.t.owner !== G.player).map(p => p.t.i), ...(G.stage ? [G.stage.t] : [])])]); if (stopReq) return false;
    await deploy(br, new Set(armies0.map(x => x.i)), attacks); if (stopReq) return false;
    await placeCivil(br, new Set()); if (stopReq) return false;
    await eventSeek(br, new Set(armies0.map(x => x.i))); if (stopReq) return false;
    await doRecruit(br, new Set(armies0.map(x => x.i))); if (stopReq) return false;
    await doLogistics(br); if (stopReq) return false;
    // 内政
    for (const c of Game.citiesOf(G.player)) {
      if (stopReq) return false;
      const idleBefore = Game.gensIn(c.i, G.player).filter(x => !x.acted && !reserved.has(x.i));
      if (!idleBefore.length) continue;
      const jobs = planCity(c, br);
      let first = true;
      for (let [gen, cmd] of jobs) {
        if (stopReq) return false;
        if (reserved.has(gen.i)) continue;
        // 実行の直前にもう一度確かめる（見込みと結果のずれ対策）
        if (cmd === 'draft' && c.loyal < 50) cmd = c.food - 1500 > Game.foodReserve(c) && c.loyal < 95 ? 'alms' : (c.train < 95 && c.troops >= 2000 ? 'train' : null);
        if (cmd === 'train' && c.train >= 100) cmd = null;
        if (!cmd) continue;
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
          Sound.se(r.ok ? ({ farm: 'farm', comm: 'coin', wall: 'build', alms: 'alms', draft: 'draft', train: 'train' }[cmd] || 'ok') : 'ng');
          if (r.ok && r.grade === 'great') setTimeout(() => Sound.se('great'), 380);
          await UI.talk(gen, r.ok ? r.expr : 'sad', `${gen.name}「${r.ok ? (r.say || line(gen, r.grade && r.grade !== 'normal' ? cmd + '_' + r.grade : cmd)) : line(gen, 'fail')}」\n<b>${r.msg}</b>`);
        }
        App.refresh();
      }
    }
    await idleStudy(br); if (stopReq) return false;
    G.autoPrev = {}; G.cities.forEach(c => { G.autoPrev[c.i] = c.troops; });   // 次の季節に「兵が減った城」を見つけるため
    await sendTrained(br); if (stopReq) return false;
    await doLogistics(br); if (stopReq) return false;
    await forwardBig(br); if (stopReq) return false;
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

  // 観戦中は画面を消さない（Screen Wake Lock。対応していない端末では何もしない）
  let wakeLock = null, wakePending = false;
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && !wakePending && 'wakeLock' in navigator && document.visibilityState === 'visible') {
        wakePending = true;
        const w = await navigator.wakeLock.request('screen');
        wakePending = false;
        if (!running) { await w.release(); return; }   // 待っている間にオートが止まった
        wakeLock = w;
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) { const w = wakeLock; wakeLock = null; await w.release(); }
    } catch (e) { wakeLock = null; wakePending = false; }
  }
  // アプリを切り替えると自動で解除されるので、戻ってきたらかけ直す
  document.addEventListener('visibilitychange', () => { if (running && document.visibilityState === 'visible') keepAwake(true); });

  function start(n) {
    if (running || App.busy) return;
    if (!strategist()) return UI.alert('軍師に任命できる武将がいません');
    running = true; stopReq = false; seasonsLeft = n || 0;
    App.busy = true; keepAwake(true);
    document.getElementById('autobar').classList.add('show'); document.getElementById('app').classList.add('auto-on'); place();
    loop().finally(() => { App.busy = false; });
  }
  function stop(done) {
    if (!running) return;
    if (!done) {
      stopReq = true;
      // 合戦の観戦中なら、合戦の決着を待たずに指揮を返す（このあとの会話や結果表示も手動で進む）
      if (typeof Battle !== 'undefined' && Battle.watching) { Battle.takeOver(); setBar('合戦は自分で指揮してください。終わったらオートを止めます'); }
      else setBar('この動きが終わったら止めます…');
      return;
    }
    running = false; stopReq = false; keepAwake(false);
    document.getElementById('autobar').classList.remove('show'); document.getElementById('app').classList.remove('auto-on');
    App.busy = false;
    if (UI.cur === 'main') { UI.closeSheet(); App.refresh(); UI.toast('軍師オートを止めました。ここからは自分で操作できます'); }
  }

  // ---------- 各場面での軍師の判断（ui.js から呼ぶ） ----------
  // 接している敵勢力のうち、fi と同盟したあとも同盟していない勢力が残るか
  function leavesEnemy(fi) {
    const neigh = new Set();
    Game.citiesOf(G.player).forEach(c => c.adj.forEach(a => { const o = G.cities[a].owner; if (o !== null && o !== G.player) neigh.add(o); }));
    return [...neigh].some(o => o !== fi && !Game.isAlly(G.player, o));
  }
  async function decideAlly(fi) {
    const br = brain(strategist());
    if (!leavesEnemy(fi)) { await say('allyLast'); return false; }   // 攻める相手がいなくなる同盟はしない
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

  // 会話の表示時間：文字数に応じて長く（1文字50ms、最大7秒）。「速い」でも長い文は読めるよう、速さの効きを弱める
  function talkMs(text) { if (S.speed >= 4) return 280;   // 超速：会話は一瞬だけ見せて流す
    const n = text.replace(/<[^>]+>/g, '').replace(/\s/g, '').length; return Math.min(7000, 900 + n * 50) / Math.pow(S.speed, 0.6); }

  function init() {
    const bar = document.getElementById('autobar');
    bar.querySelector('[data-a=stop]').onclick = e => { e.stopPropagation(); Sound.se('tap'); stop(false); };
    bar.querySelector('[data-a=speed]').onclick = e => {
      e.stopPropagation(); S.speed = nextSpeed(S.speed);
      try { localStorage.setItem('internT_autoSpeed', S.speed); } catch (er) {}
      if (G) G.opts.aiSpeed = S.speed; setBar(bar.querySelector('.ab-text').innerHTML);
    };
  }

  async function openMenu() {
    if (App.busy) return;
    const g = strategist();
    if (!g) return UI.alert('軍師に任命できる武将がいません');
    const v = await UI.choose(g.isLord ? `${g.name}（君主が自ら采配・知力${g.int}）` : `軍師 ${g.name}（知力${g.int}）`, [
      { label: '▶ 軍師オート開始', sub: '止めるまで季節を進め続ける', value: 'run', cls: 'primary' },
      { label: '▶ 1年だけ任せる', sub: '4季節ぶん', value: 'year' },
      { label: '▶ この季節だけ任せる', sub: '終わったら自分の操作に戻る', value: 'one' },
      { label: '軍師を替える', sub: grade(g), value: 'change' },
      { label: `見る速さ：${SPEED_NAME(S.speed)}`, sub: '普通→速い→超速（会話を読み飛ばす）', value: 'speed' },
    ]);
    if (v === 'run') start(0);
    if (v === 'year') start(4);
    if (v === 'one') start(1);
    if (v === 'speed') { S.speed = nextSpeed(S.speed); if (G) G.opts.aiSpeed = S.speed; try { localStorage.setItem('internT_autoSpeed', S.speed); } catch (e) {} return openMenu(); }
    if (v === 'change') {
      const list = Game.gensOf(G.player);
      const gi = await UI.pickGenerals('軍師に任命する武将（知力が高いほど采配が正確）', list, { stat: 'int', keys: ['int', 'lead', 'pol', 'cha'], extra: x => (x.i === G.strategist ? '現軍師 ' : '') + (brain(x).style === 'civil' ? '内政型' : brain(x).style === 'master' ? '万能型' : '') });
      if (gi != null) {
        G.strategist = gi;
        const ng = G.gens[gi];
        await UI.talk(ng, 'happy', `${ng.name}「${brain(ng).style === 'civil' ? '戦は最後の手段。まずは国を富ませ、民と兵を養いましょう' : brain(ng).tier === 'dumb' ? '軍師？ お、俺がですか！ やってやりますよ！' : brain(ng).tier === 'mid' ? '大役、謹んでお受けします' : '{you}の天下のため、この知略を尽くしましょう'.replace('{you}', '殿')}」\n<b>${ng.name}を軍師に任命した</b>`);
      }
      return openMenu();
    }
  }

  return {
    get running() { return running && !stopReq; },   // 止める指示のあとは、画面の進み方を手動に戻す
    get speed() { return S.speed; },
    start, stop, init, openMenu, title, phase, place, strategist, brain, talkMs, decideAlly, decideCaptive, say, sl, _plan: planCity, _attacks: planAttacks, _why: WHY, _dbg: { garrison, defPower, atkFactor, evalAttack },
  };
})();
