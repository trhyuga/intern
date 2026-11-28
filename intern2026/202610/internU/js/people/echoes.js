// ============================================================
//  伏線の回収（PEOPLE.events）：予兆（omen.js）と大侵攻（crisis.js）の選択が、
//  蝕のさなかと、その後にどう効いたかを描く。6か国 × 2〜5話。
//  id は ec<国>_<番号>、flag は ec<国>_...
// ============================================================
PEOPLE.events([
  // ==================================================== 帝国（fac 0）
  { id: 'ec0_1', title: '北天の鏡が見たもの', bg: 'crisis', cond: { fac: 0, ecl: 'great', flag: 'om0_watch', with: ['hanna'] },
    scenes: [
      ['narr', '', '群れが帝国の国境に迫る三日前、シュトラールの観測都市が、あの日増やした鏡で一つの像を捉えていた。'],
      ['hanna', 'normal', '{honor}。星が消える順番に、規則がありました。群れは、次にこの宙域を通ります。'],
      ['@mil', 'shock', '三日前に分かっていたと？ ……あの時、観測所に金を回したのは無駄ではなかったか。'],
      ['hanna', 'normal', '夜番の者が、ずっと見ていたのです。「次に消える星を見届けたい」と言った、あの子が。'],
      ['@leader', 'normal', '三日あれば、民を退かせることも、牙を研ぐこともできる。どちらに使う。'],
      ['hanna', 'sad', '鏡は道を示すだけです。選ぶのは、{honor}です。'],
    ],
    choices: [
      { t: '群れの通り道で待ち伏せる（主力が裂け目へ・蝕への火力 +12%（8か月）・主戦派が伸びる）',
        fx: { party: { war: 4 }, merit: { hanna: 3 }, flag: 'ec0_ambush', act: [{ fleet: 'rift', size: 'main', months: 6 }, { buff: 'eclDmg', v: 0.12, months: 8, name: '北天の待ち伏せ' }] },
        after: [['@mil', 'happy', '先に待つ側が勝つ。三日の差は、千の艦に勝る。'], ['hanna', 'normal', '観測所は、最後まで目を閉じません。']] },
      { t: '通り道の星から民を先に退かせる（避難民を迎える・民心 +4・融和派が伸びる）',
        fx: { stab: 4, party: { peace: 4 }, loyal: { hanna: 8 }, flag: 'ec0_evac', act: [{ refugees: 10 }] },
        after: [['hanna', 'happy', '三日あれば、一つの星の子どもは全員運べます。'], ['@leader', 'normal', '鏡の礼は、生きた民の数で払おう。']] },
    ] },

  { id: 'ec0_2', title: 'コンラートの壁', bg: 'crisis', cond: { fac: 0, ecl: 'ret', flag: 'cr0_konrad_rear', with: ['konrad'] },
    scenes: [
      ['narr', '', '群れが再び国境を呑んだ夜。大侵攻の折、コンラートが殿を務めながら築いた砦が、まだ立っていた。'],
      ['konrad', 'normal', '{honor}。あの時の砦が、まだ撃っております。守備兵は交代なしで四十時間です。'],
      ['lena', 'shock', '嘘でしょ、あの半壊した砦が？ あたし、もう落ちたと思ってた。'],
      ['konrad', 'normal', '自分は、壊れても撃てるように造りました。派手ではありませんが、それが自分のやり方です。'],
      ['@mil', 'normal', '砦が群れを引きつけている間なら、横から殴れる。だが砦の兵は持たんぞ。'],
      ['konrad', 'sad', '……砦の兵を見殺しにはしたくありません。ですが、ご判断はお任せします。'],
    ],
    choices: [
      { t: '砦を囮に、横から群れを討つ（主力が裂け目へ・蝕への火力 +10%・コンラートの武功 +5）',
        fx: { merit: { konrad: 5 }, party: { war: 3 }, flag: 'ec0_wall_strike', act: [{ fleet: 'rift', size: 'main', months: 6 }, { buff: 'eclDmg', v: 0.1, months: 8, name: '壁の横撃ち' }] },
        after: [['lena', 'angry', 'じゃあ、あたしが一番に殴り込む！ 砦の連中が持ってる間に！'], ['konrad', 'normal', '……頼みます。四十時間は、長すぎました。']] },
      { t: '砦に艦と資材を送り、壁を厚くする（国境の防衛衛星 +2・艦 +1・資金 −180・コンラートの忠誠 +10）',
        fx: { funds: -180, loyal: { konrad: 10 }, flag: 'ec0_wall_hold', act: [{ fort: 2, where: 'border' }, { ships: 1 }] },
        after: [['konrad', 'happy', '感謝します。砦の兵に、交代が来ると伝えます。']] },
    ] },

  { id: 'ec0_3', title: '徴発の請求書', bg: 'palace', cond: { fac: 0, ecl: 'recede', flag: 'cr0_levy', with: ['hanna'] },
    scenes: [
      ['narr', '', '群れが退いた後、帝都に商人組合の使者が来た。手には、再来の夜に徴発された船台と資材の目録があった。'],
      ['@pol', 'normal', '{honor}。造船所に徴発した民間の船台、その代金の請求です。総額は、帝国の半年の税に近い。'],
      ['hanna', 'normal', 'あの船台で造った二隻は、再来の夜に国境で沈みました。……沈むまで、民の船を守ったのです。'],
      ['@mil', 'angry', '国を救った船の代金を、今さら国に払えと言うのか。'],
      ['@pol', 'normal', '払わねば、次の夜に船台を貸す者はおりますまい。'],
      ['@leader', 'normal', '……帝国は、借りを踏み倒す国ではない。だが、金庫も無限ではない。'],
    ],
    choices: [
      { t: '全額を払い、商人の信を買い戻す（資金 −250・民心 +3・通商派が伸びる）',
        fx: { funds: -250, stab: 3, party: { trade: 6 }, flag: 'ec0_levy_paid' },
        after: [['@pol', 'happy', '使者は泣いておりました。「帝冠は約束を覚えていた」と。']] },
      { t: '代金の代わりに船台を国営の造船所とし、職人を雇い続ける（首都の造船所 +1・資金 −100・主戦派が伸びる）',
        fx: { funds: -100, party: { war: 3, trade: -3 }, flag: 'ec0_levy_yard', act: [{ dev: { k: 'yard', n: 1 } }] },
        after: [['hanna', 'normal', '職人たちは残ってくれるそうです。次の夜も、ここで槌を振ると。']] },
    ] },

  // ==================================================== 共和国（fac 1）
  { id: 'ec1_1', title: 'カリオペの恩返し', bg: 'bridge', cond: { fac: 1, ecl: 'great', flag: 'om1_public', with: ['iris'] },
    scenes: [
      ['narr', '', '群れが共和国の外縁を襲った日、見知らぬ国の艦隊が、呼ばれもせずに現れた。'],
      ['iris', 'shock', '他国の艦から通信です。「カリオペの記録のおかげで、我々は備えられた。今度はこちらの番だ」と。'],
      ['@mil', 'normal', 'あの時、記録を公開したことで民は揺れた。だが、銀河は覚えていたわけか。'],
      ['iris', 'normal', 'カリオペの乗員たちの最後の声が、他国の砲手の耳にも届いていたのです。'],
      ['@leader', 'happy', '分かち合ったものは、形を変えて戻ってくる。民主主義の、数少ない取り柄だ。'],
      ['iris', 'normal', '共闘を申し出ています。受けるなら、国境の指揮を合わせる必要があります。'],
    ],
    choices: [
      { t: '共闘を受け、ともに群れへ打って出る（主力が裂け目へ・全ての国の信頼 +8・融和派が伸びる）',
        fx: { trust: { 0: 8, 2: 8, 3: 8, 4: 8, 5: 8 }, party: { peace: 4 }, flag: 'ec1_joint', act: [{ fleet: 'rift', size: 'main', months: 6 }, { buff: 'eclDmg', v: 0.1, months: 8, name: 'カリオペの共闘' }] },
        after: [['iris', 'happy', 'カリオペの乗員に、報告しておきます。あなたたちの声は、届いたと。']] },
      { t: '援軍に外縁を任せ、自国は民の避難に回る（避難民を迎える・民心 +4・資金 −80）',
        fx: { stab: 4, funds: -80, flag: 'ec1_evac', act: [{ refugees: 10 }] },
        after: [['@mil', 'normal', '他国の背中に守られるのは癪だが……今は、民が先だ。']] },
    ] },

  { id: 'ec1_2', title: '機密の代償', bg: 'crisis', cond: { fac: 1, ecl: 'great', flag: 'om1_secret', with: ['iris'] },
    scenes: [
      ['narr', '', '群れの到来の翌朝、共和国の新聞の一面に、カリオペの通信記録の全文が載った。情報部から漏れたのだ。'],
      ['iris', 'sad', '……私の部の誰かです。「政府は一年前から知っていた」。その見出しは、事実です。'],
      ['@pol', 'angry', '議会は大荒れです。野党は首相の辞任を求めています。他国の大使も、説明を求めて来ました。'],
      ['iris', 'normal', 'ただ、秘して解析を進めた分、群れの動きの型は、どの国よりも掴んでいます。'],
      ['@leader', 'sad', '秘したことは、民を守るためだった。だが、民がそう思うかは別の話だ。'],
      ['iris', 'normal', '{honor}。今、全てを差し出せば、少なくとも嘘つきにはなりません。'],
    ],
    choices: [
      { t: '議会で全てを認め、解析を他国にも渡す（全ての国の研究 +200・全ての国の信頼 +10・民心 −3）',
        fx: { stab: -3, trust: { 0: 10, 2: 10, 3: 10, 4: 10, 5: 10 }, party: { peace: 4 }, flag: 'ec1_confess', act: [{ share: 200 }] },
        after: [['iris', 'normal', '遅すぎた正直でも、無いよりはましです。……辞表は、私が書きます。'], ['@leader', 'normal', '受け取らん。君の仕事は、これからだ。']] },
      { t: '解析を武器に変え、結果で黙らせる（蝕への火力 +15%（8か月）・民心 −5・主戦派が伸びる）',
        fx: { stab: -5, party: { war: 5 }, stat: { iris: { pol: -1 } }, flag: 'ec1_silence', act: [{ buff: 'eclDmg', v: 0.15, months: 8, name: '秘された解析' }] },
        after: [['iris', 'sad', '勝てば、許されるかもしれません。……勝てば、ですが。']] },
    ] },

  { id: 'ec1_3', title: '夢の絵の答え', bg: 'palace', cond: { fac: 1, ecl: 'first', flag: 'om1_dreams', with: ['sophia'] },
    scenes: [
      ['narr', '', '蝕の最初の姿が映像で届いた日、大学の倉庫で、ソフィアは一枚の絵を手に震えていた。'],
      ['sophia', 'shock', 'これ……一年前に、七歳の子が描いた夢の絵です。形が、同じなんです。'],
      ['@sci', 'normal', '大学で集めた絵は千枚を超えます。群れの陣形、侵入の方角、どれも映像と一致する。'],
      ['sophia', 'sad', 'あの子たち、ずっと見ていたのね。怖かったでしょうに。誰も信じてあげなかった。'],
      ['@leader', 'normal', '絵が未来を描いていたなら、次の絵には何が描いてある。'],
      ['@sci', 'normal', '最近の絵には、群れの「裂け目」の位置らしき印が。……ただ、子どもたちをこれ以上調べるのは。'],
    ],
    choices: [
      { t: '絵の印を元に、裂け目へ先回りする（主力が裂け目へ・研究 +100・技術派が伸びる）',
        fx: { rp: 100, party: { tech: 4 }, flag: 'ec1_dream_map', act: [{ fleet: 'rift', size: 'main', months: 6 }] },
        after: [['@sci', 'normal', '一枚一枚、敬意を持って読みます。あの子たちの見たものを、無駄にはしません。']] },
      { t: '調べるのはやめ、子どもたちを守る側に回る（民心 毎月 +1（10か月）・ソフィアの忠誠 +10・融和派が伸びる）',
        fx: { loyal: { sophia: 10 }, party: { peace: 4 }, flag: 'ec1_dream_rest', act: [{ buff: 'stab', v: 0.1, months: 10, name: '夢を見る子らへ' }] },
        after: [['sophia', 'happy', 'ありがとう。……あの子たちに、もう怖い絵を描かなくていいって、伝えに行きます。']] },
    ] },

  // ==================================================== 企業連合（fac 2）
  { id: 'ec2_1', title: '保険の支払日', bg: 'crisis', cond: { fac: 2, ecl: 'great', flag: 'om2_profit', with: ['vera'] },
    scenes: [
      ['narr', '', '予兆の頃に引き上げた航路保険。その掛金で潤った保険会社に、群れの到来と同時に、請求が雪崩れ込んだ。'],
      ['vera', 'normal', '請求額は掛金の四十倍。保険会社は三つが今朝、支払いを止めましたわ。'],
      ['zara', 'angry', 'あたしの知り合いの船主は、掛金を払うために船を一隻売ったんだ！ それで払わないって？'],
      ['@pol', 'normal', '払えば連合の金庫が傾きます。払わなければ、市場の信用が崩れる。'],
      ['vera', 'normal', 'あの時、わたくしたちは予兆で利を取りました。……利を取った者は、損も取るのが商いの筋ですわ。'],
    ],
    choices: [
      { t: '連合が保険を肩代わりし、支払いを保証する（資金 −300・民心 +5・通商派が伸びる）',
        fx: { funds: -300, stab: 5, party: { trade: 5 }, loyal: { zara: 8 }, flag: 'ec2_insure', act: [{ buff: 'income', v: 0.08, months: 10, name: '信用の保証' }] },
        after: [['vera', 'happy', '高い買い物ですけれど、信用は一度失えば二度と買えませんもの。']] },
      { t: '支払いを止め、浮いた金で艦を造る（艦 +3・資金 −150・民心 −5・主戦派が伸びる）',
        fx: { funds: -150, stab: -5, party: { war: 4, trade: -4 }, loyal: { zara: -10 }, flag: 'ec2_default', act: [{ ships: 3 }] },
        after: [['zara', 'angry', '……覚えときなよ。船乗りは、裏切られた港には二度と寄らない。']] },
    ] },

  { id: 'ec2_2', title: 'ザラの星図', bg: 'bridge', cond: { fac: 2, ecl: 'great', flag: 'om2_charts', with: ['zara'] },
    scenes: [
      ['narr', '', '群れが主要航路を塞いだ。だが連合の商船団だけは、迷わずに暗い宙域をすり抜けていく。'],
      ['zara', 'happy', 'ほら見な！ あの時あたしが引いた新しい星図だよ。消えた星を避ける裏道が、全部載ってる。'],
      ['vera', 'normal', '他国の船は旧い航路で立ち往生。わたくしたちの船だけが動ける。……さて、どう使いましょう。'],
      ['zara', 'normal', '星図を売れって言うんだろ。あたしは、どうせなら逃げ遅れた連中を運びたいね。'],
      ['@pol', 'normal', '売れば莫大な利が出ます。運べば、銀河中に恩が売れます。どちらも商いです。'],
    ],
    choices: [
      { t: '星図を他国にも渡し、避難船を通す（全ての国の信頼 +10・全ての国の研究 +150・避難民を迎える）',
        fx: { trust: { 0: 10, 1: 10, 3: 10, 4: 10, 5: 10 }, loyal: { zara: 10 }, flag: 'ec2_charts_share', act: [{ share: 150 }, { refugees: 8 }] },
        after: [['zara', 'happy', 'これでいいのさ。道は、みんなで使って初めて道になる。']] },
      { t: '星図の使用権を売る（資金 +300・通商派が伸びる・他国の信頼が少し下がる）',
        fx: { funds: 300, party: { trade: 6 }, trust: { 0: -5, 1: -5, 3: -5, 4: -5, 5: -5 }, flag: 'ec2_charts_sold' },
        after: [['vera', 'normal', '値札のある命綱でも、無いよりは良いでしょう？'], ['zara', 'sad', '……あたしの星図に値段がつくとはね。']] },
    ] },

  { id: 'ec2_3', title: '深坑の底から', bg: 'crisis', cond: { fac: 2, ecl: 'ret', flag: 'om2_deep', with: ['gustav', 'boris'] },
    scenes: [
      ['narr', '', '再来の夜、ドラクマの深坑が鳴った。予兆の頃、閉じずに掘り続けたあの坑の底から、群れが湧き出した。'],
      ['boris', 'angry', 'だから閉じろと言ったんだ！ 坑道にはまだ、おれの仲間が三百人いる！'],
      ['gustav', 'shock', '……俺様の坑が、口になっていたというのか。掘ったのは、音の源ではなく……扉だったのか。'],
      ['boris', 'normal', '仲間を上げる。艦を坑口へ回してくれ。それとも、坑ごと塞ぐか。'],
      ['gustav', 'sad', '塞げば三百人は終わりだ。だが、群れも閉じ込められる。……俺様に選ばせるな。'],
    ],
    choices: [
      { t: '艦隊を坑口へ回し、坑夫を救い出す（主力が裂け目へ・避難民を迎える・ボリスの忠誠 +15）',
        fx: { loyal: { boris: 15 }, stab: 3, flag: 'ec2_deep_rescue', act: [{ fleet: 'rift', size: 'main', months: 4 }, { refugees: 6 }] },
        after: [['boris', 'happy', '一人残らず上げてやる。……グスタフ、あんたも手を貸せ。'], ['gustav', 'normal', '……ああ。今度ばかりは、金の勘定はなしだ。']] },
      { t: '坑口を砲台で塞ぎ、群れを封じる（国境の防衛衛星 +2・民心 −5・グスタフの忠誠 −10）',
        fx: { stab: -5, loyal: { gustav: -10, boris: -15 }, party: { war: 3 }, flag: 'ec2_deep_seal', act: [{ fort: 2, where: 'border' }] },
        after: [['boris', 'sad', '……三百人分の名前を、おれは一生忘れない。']] },
    ] },

  // ==================================================== 聖教国（fac 3）
  { id: 'ec3_1', title: '驚かなかった信徒たち', bg: 'palace', cond: { fac: 3, ecl: 'first', flag: 'om3_told', with: ['serena'] },
    scenes: [
      ['narr', '', '蝕の最初の姿が聖都の空に映った日。大聖堂の前に集まった信徒たちは、泣き叫ばなかった。'],
      ['serena', 'normal', '一年前、私たちは星が消えることを、ありのままに告げました。民は、共に祈ってきたのです。'],
      ['@pol', 'normal', '各地の教区から報告が。暴動なし、逃散なし。祈りの灯は、どの家にも点いております。'],
      ['serena', 'sad', '怖くないはずはありません。けれど、知らされていた恐怖は、裏切られた恐怖より耐えやすい。'],
      ['@leader', 'normal', '民が揺らがぬなら、聖教国は動ける。その力をどこへ向ける。'],
    ],
    choices: [
      { t: '落ち着いた民を募り、聖都の守りを固める（首都の防衛衛星 +2・資金 −100・セレーナの忠誠 +8）',
        fx: { funds: -100, loyal: { serena: 8 }, flag: 'ec3_told_wall', act: [{ fort: 2, where: 'capital' }] },
        after: [['serena', 'happy', '祈る手と、石を積む手は、同じ手です。']] },
      { t: '他国の民にも祈りの灯を分ける（全ての国の信頼 +8・民心 毎月 +1（8か月）・融和派が伸びる）',
        fx: { trust: { 0: 8, 1: 8, 2: 8, 4: 8, 5: 8 }, party: { peace: 4 }, flag: 'ec3_told_light', act: [{ buff: 'stab', v: 0.1, months: 8, name: '分けられた灯' }] },
        after: [['serena', 'normal', '星を見上げる者は、皆、同じ空の下にいるのですから。']] },
    ] },

  { id: 'ec3_2', title: '星詠みの告白', bg: 'crisis', cond: { fac: 3, ecl: 'first', flag: 'om3_hidden', with: ['serena', 'benedetto'] },
    scenes: [
      ['narr', '', '蝕が現れた夜、一人の若い星詠みが、大聖堂の説教壇に立った。「私たちは、知っていた」と。'],
      ['serena', 'sad', '星詠みの子たちは、一年間、黙っていることに耐えられなかったのです。私も、同じでした。'],
      ['benedetto', 'angry', '秘せと命じたのは私だ。民を怯えさせぬためだった。それを今さら……！'],
      ['@pol', 'normal', '各教区で信徒が教会を離れ始めています。「神の家は嘘をつくのか」と。'],
      ['benedetto', 'normal', '……ただ、秘して詠ませた一年の記録はある。群れの来る星は、およそ読めている。'],
      ['serena', 'normal', '記録を民の前に置きましょう。罪を詫びるなら、役に立つ形で。'],
    ],
    choices: [
      { t: '枢機卿が民の前で詫び、記録を公開する（民心 +3・ベネデットの忠誠 −10・セレーナの忠誠 +10・融和派が伸びる）',
        fx: { stab: 3, loyal: { benedetto: -10, serena: 10 }, party: { peace: 4 }, flag: 'ec3_hidden_confess', act: [{ refugees: 6 }] },
        after: [['benedetto', 'sad', '……私の誇りなど、民一人の涙ほどの重さもなかったか。']] },
      { t: '告白を異端と断じ、記録で艦隊を動かす（主力が裂け目へ・民心 −5・主戦派が伸びる）',
        fx: { stab: -5, loyal: { benedetto: 8, serena: -12 }, party: { war: 5 }, flag: 'ec3_hidden_crush', act: [{ fleet: 'rift', size: 'main', months: 6 }] },
        after: [['serena', 'sad', '……星は、嘘を見ています。それだけは、お忘れなきよう。']] },
    ] },

  { id: 'ec3_3', title: '花の指す方角', bg: 'space', cond: { fac: 3, ecl: 'great', flag: 'om3_flowers', with: ['lucia'] },
    scenes: [
      ['narr', '', 'エデンの花は、予兆の頃と同じ方角へ、一斉に首を曲げていた。記録が残っていたのは聖教国だけだった。'],
      ['lucia', 'normal', 'あの時、花の向きを一輪ずつ記させました。いま、群れはその方角から、まっすぐに来ております。'],
      ['@mil', 'shock', '花が群れの道を指していたと？ ……ならば、次の群れがどこに出るかも分かるのか。'],
      ['lucia', 'sad', 'ええ。けれど花たちは、その方角に向いたまま、少しずつ枯れていきます。'],
      ['@leader', 'normal', '花が命を削って示した道だ。無駄にはできぬ。'],
    ],
    choices: [
      { t: '花の示す方角へ先回りし、群れを迎え撃つ（主力が裂け目へ・艦の守り +10%（8か月）・主戦派が伸びる）',
        fx: { party: { war: 4 }, merit: { lucia: 3 }, flag: 'ec3_flower_strike', act: [{ fleet: 'rift', size: 'main', months: 6 }, { buff: 'def', v: 0.1, months: 8, name: 'エデンの導き' }] },
        after: [['lucia', 'normal', '花に代わって、わたくしが最後まで方角を読みます。']] },
      { t: '方角の先の星から民を逃がす（避難民を迎える・民心 +4・ルチアの忠誠 +10）',
        fx: { stab: 4, loyal: { lucia: 10 }, party: { peace: 3 }, flag: 'ec3_flower_evac', act: [{ refugees: 10 }] },
        after: [['lucia', 'happy', '花は、人を逃がすために咲いたのかもしれませんわね。']] },
    ] },

  { id: 'ec3_4', title: '聖堂に残った者たち', bg: 'palace', cond: { fac: 3, ecl: 'recede', flag: 'cr3_sanctuary', with: ['lucia'] },
    scenes: [
      ['narr', '', '群れが退いて三月。大侵攻の折に聖堂を開いて迎えた異教の避難民たちは、まだ聖都に留まっていた。'],
      ['lucia', 'normal', '帝国の民も、同盟の民もおります。皆、聖堂の床で眠り、同じ鐘で目を覚ましました。'],
      ['benedetto', 'angry', '彼らは改宗もせず、我らの施しで生きている。聖都は、いつまで宿屋なのだ。'],
      ['lucia', 'sad', '帰る星が、もう無い方もいるのです。……ここで畑を耕したいと、願い出ておられます。'],
      ['@leader', 'normal', '神の家の扉を開けたのは、我らだ。閉じるのも、我らの手か。'],
    ],
    choices: [
      { t: '避難民に土地を与え、聖国の民として迎える（首都の産業 +1・民心 +3・融和派が伸びる）',
        fx: { stab: 3, party: { peace: 5 }, loyal: { lucia: 10, benedetto: -8 }, flag: 'ec3_new_citizens', act: [{ dev: { k: 'ind', n: 1 } }] },
        after: [['lucia', 'happy', '鐘の音を、これからも一緒に聞けますわね。']] },
      { t: '船を仕立て、故郷の再建へ送り出す（資金 −150・全ての国の信頼 +8・ベネデットの忠誠 +5）',
        fx: { funds: -150, trust: { 0: 8, 1: 8, 2: 8, 4: 8, 5: 8 }, loyal: { benedetto: 5 }, flag: 'ec3_sent_home', act: [{ gift: { to: 'weakest', funds: 100 } }] },
        after: [['benedetto', 'normal', '……送り出す時くらいは、祝福を授けてやろう。']] },
    ] },

  { id: 'ec3_5', title: '外の壁の兵', bg: 'bridge', cond: { fac: 3, ecl: 'solved', flag: 'cr3_outer', with: ['paola'] },
    scenes: [
      ['narr', '', '蝕が根絶された日、聖都の外縁で盾を張り続けた艦隊が、ようやく帰ってきた。'],
      ['paola', 'normal', '{honor}。外の壁の艦、帰還いたしました。再来の夜から、一度も持ち場を離れておりません。'],
      ['@mil', 'normal', '内の民は、外で何が起きていたか知らぬ。祝祭の鐘も、彼らのためには鳴らなかった。'],
      ['paola', 'sad', '構いません。盾とは、見えない所で割れるものですから。……ただ、割れた盾の名だけは。'],
      ['@leader', 'normal', '名を刻みましょう。どこに刻むかは、私が決めねばなりませんね。'],
    ],
    choices: [
      { t: '大聖堂の壁に、外縁で散った兵の名を刻む（民心 +4・パオラの忠誠 +10・武功 +5）',
        fx: { stab: 4, loyal: { paola: 10 }, merit: { paola: 5 }, flag: 'ec3_outer_names' },
        after: [['paola', 'happy', '……聖堂の内側に、外の兵の名が。それだけで、報われます。']] },
      { t: '外縁に新たな砦を築き、彼らの名をつける（国境の防衛衛星 +2・資金 −100・主戦派が伸びる）',
        fx: { funds: -100, party: { war: 3 }, loyal: { paola: 5 }, flag: 'ec3_outer_fort', act: [{ fort: 2, where: 'border' }] },
        after: [['paola', 'normal', '名を持つ壁なら、次の兵も背を預けられましょう。']] },
    ] },

  // ==================================================== 自由同盟（fac 4）
  { id: 'ec4_1', title: 'ミラの抜け道', bg: 'bridge', cond: { fac: 4, ecl: 'great', flag: 'om4_route', with: ['mira'] },
    scenes: [
      ['narr', '', '群れが渡り星の航路を塞いだ時、同盟の船団は、ミラが予兆の頃に引いた新しい航路へ一斉に舵を切った。'],
      ['mira', 'happy', 'ほら、言ったでしょ！ 消えた星を避ける道、ちゃんと通れる！ わたし、計算は間違えないの！'],
      ['freya', 'normal', '風も味方してる。この道なら、群れの背中に回り込めるわ。'],
      ['mira', 'normal', '回り込むなら、わたしが先導する。……でも、逃げる船も、この道しか無いんだよね。'],
      ['@leader', 'normal', '道は一本。攻めに使うか、逃がすために使うか。'],
    ],
    choices: [
      { t: '抜け道から群れの背を突く（主力が裂け目へ・蝕への火力 +10%・ミラの武功 +4）',
        fx: { merit: { mira: 4 }, party: { war: 4 }, flag: 'ec4_route_strike', act: [{ fleet: 'rift', size: 'main', months: 6 }, { buff: 'eclDmg', v: 0.1, months: 8, name: 'ミラの抜け道' }] },
        after: [['freya', 'happy', '背中を取った獲物は、逃がさない。']] },
      { t: '抜け道は避難船に譲る（避難民を迎える・民心 +4・ミラの忠誠 +10）',
        fx: { stab: 4, loyal: { mira: 10 }, party: { peace: 3 }, flag: 'ec4_route_evac', act: [{ refugees: 10 }] },
        after: [['mira', 'happy', '一隻も迷わせない。わたしの道だもん。']] },
    ] },

  { id: 'ec4_2', title: '裏の伝手の値段', bg: 'crisis', cond: { fac: 4, ecl: 'great', flag: 'om4_ulf', with: ['ulf'] },
    scenes: [
      ['narr', '', '予兆の頃にウルフが買った情報の伝手。その密輸商人たちが、群れのさなかに再び声をかけてきた。'],
      ['ulf', 'normal', '手前の古い馴染みが言うには、群れの「巣」の座標を掴んだそうでな。ただし、値は張る。'],
      ['bjorn', 'angry', '密輸屋の言うことなど信じられるか！ 俺様は自分の目で見たものしか信じん！'],
      ['ulf', 'normal', 'あの時の情報で、砦の位置は当たった。手前の伝手は、嘘はつかねえ。値を吊り上げるだけだ。'],
      ['@pol', 'normal', '払えば金庫が痩せます。ですが、座標が本物なら……。'],
    ],
    choices: [
      { t: '言い値で座標を買い、巣を叩く（主力が深淵へ・資金 −200・ウルフの忠誠 +10）',
        fx: { funds: -200, loyal: { ulf: 10 }, flag: 'ec4_ulf_buy', act: [{ fleet: 'abyss', size: 'main', months: 6 }, { buff: 'eclDmg', v: 0.12, months: 8, name: '密輸屋の座標' }] },
        after: [['ulf', 'happy', '毎度。……手前の取り分は、生きて帰ってから頂くよ。'], ['bjorn', 'normal', 'ふん。当たっていたら、一杯奢ってやる。']] },
      { t: '取引は断り、ビョルンに国境を固めさせる（国境の防衛衛星 +2・資金 −80・ビョルンの忠誠 +8）',
        fx: { funds: -80, loyal: { bjorn: 8, ulf: -8 }, flag: 'ec4_ulf_refuse', act: [{ fort: 2, where: 'border' }] },
        after: [['ulf', 'sad', 'やれやれ。手前の伝手も、信用されなきゃただの噂だ。']] },
    ] },

  { id: 'ec4_3', title: '首星に集った氏族', bg: 'palace', cond: { fac: 4, ecl: 'recede', flag: 'cr4_gather', with: ['ragnar'] },
    scenes: [
      ['narr', '', '群れが退いた後も、首星ノヴァ・ヘイヴンには、大侵攻の折に呼び集めた辺境の氏族が残っていた。'],
      ['ragnar', 'normal', '盟主よ。辺境の長どもが、帰るか、ここに根を下ろすかで揉めておる。'],
      ['freya', 'normal', '同じ天幕で冬を越した子どもたちは、もう氏族の区別もつかないわ。'],
      ['ragnar', 'happy', 'わしの若い頃は、氏族同士で殴り合うておった。それが今や、同じ鍋をつついとる。'],
      ['@leader', 'normal', '逃げ込んだ縁が、新しい絆になるか。それとも、辺境を空にするか。'],
    ],
    choices: [
      { t: '辺境へ帰る船と資材を出し、星を建て直させる（国境の星の産業 +1・資金 −150・ラグナルの忠誠 +8）',
        fx: { funds: -150, loyal: { ragnar: 8 }, flag: 'ec4_clans_home', act: [{ dev: { k: 'ind', n: 1 }, where: 'border' }] },
        after: [['ragnar', 'happy', '帰る場所があってこその自由よ。']] },
      { t: '首星に新しい氏族の座を設け、共に暮らす（民心 毎月 +1（10か月）・首都の造船所 +1）',
        fx: { party: { peace: 3 }, flag: 'ec4_clans_stay', act: [{ buff: 'stab', v: 0.1, months: 10, name: '新しい氏族' }, { dev: { k: 'yard', n: 1 } }] },
        after: [['freya', 'happy', '一つの天幕、一つの風。悪くないわね。']] },
    ] },

  { id: 'ec4_4', title: '熊殺しの傷', bg: 'bridge', cond: { fac: 4, ecl: 'recede', flag: 'cr4_strike', with: ['bjorn'] },
    scenes: [
      ['narr', '', '大侵攻で群れへ打って出たビョルンの艦隊は、勝った。だが、呼び集められなかった辺境の採掘基地は、消えていた。'],
      ['bjorn', 'sad', '……俺様は群れの頭を叩き割った。だがな、帰り道に、空っぽの基地を三つ見た。'],
      ['ragnar', 'normal', '辺境の者らには、わしが詫びた。誰もお前を責めはせなんだ。それが、余計に堪えるのう。'],
      ['bjorn', 'angry', '責めてくれた方がましだ！ 俺様は、攻めることしか知らん！'],
      ['@leader', 'normal', 'ならば、守ることも覚えてもらう。辺境は、まだ痛んでいる。'],
    ],
    choices: [
      { t: 'ビョルンを辺境の総督とし、守りを学ばせる（国境の総督にビョルン・ビョルンの政治 +2・国境の防衛衛星 +1）',
        fx: { stat: { bjorn: { pol: 2 } }, loyal: { bjorn: 10 }, flag: 'ec4_bjorn_guard', act: [{ officer: 'bjorn', do: 'govern', where: 'border' }, { fort: 1, where: 'border' }] },
        after: [['bjorn', 'normal', '……守るのは、殴るより難しそうだ。だが、やってやる。']] },
      { t: '散った基地の跡に、碑と新しい採掘所を建てる（国境の星の産業 +1・資金 −150・民心 +3）',
        fx: { funds: -150, stab: 3, flag: 'ec4_bjorn_memorial', act: [{ dev: { k: 'ind', n: 1 }, where: 'border' }] },
        after: [['bjorn', 'sad', '碑の前で、一杯やらせてもらう。……あいつらの分もな。']] },
    ] },

  // ==================================================== 機巧院（fac 5）
  { id: 'ec5_1', title: '明るくなる星', bg: 'space', cond: { fac: 5, ecl: 'great', flag: 'om5_watch', with: ['nyx'] },
    scenes: [
      ['narr', '', '全演算塔を観測に回して一年。ニュクスは、消える直前の星の「瞬き」を、数式に変えていた。'],
      ['nyx', 'happy', 'ニュクスは分かりました。星は、群れが来る十時間前に、少しだけ明るくなるのです。'],
      ['kronos', 'normal', '検証完了。過去の消失、全件で一致。誤差、四分以内。本機の記録は、正しかった。'],
      ['nyx', 'normal', 'いま、三つの星が明るくなり始めています。どれかに、群れが来ます。'],
      ['@leader', 'normal', '十時間。艦を送るにも、民を逃がすにも、足りるか。'],
    ],
    choices: [
      { t: '瞬いた星へ艦隊を先回りさせる（主力が裂け目へ・蝕への火力 +12%・ニュクスの武功 +4）',
        fx: { merit: { nyx: 4 }, party: { tech: 3 }, flag: 'ec5_blink_strike', act: [{ fleet: 'rift', size: 'main', months: 6 }, { buff: 'eclDmg', v: 0.12, months: 8, name: '瞬きの予報' }] },
        after: [['nyx', 'happy', 'ニュクスの数式が、誰かを守るのですね。とても、嬉しいです。']] },
      { t: '予報を他国にも送り、皆で逃げる（全ての国の研究 +150・全ての国の信頼 +10・クロノスの忠誠 +8）',
        fx: { trust: { 0: 10, 1: 10, 2: 10, 3: 10, 4: 10 }, loyal: { kronos: 8 }, flag: 'ec5_blink_share', act: [{ share: 150 }] },
        after: [['kronos', 'normal', '送信完了。予報は、受け取る者が多いほど価値を持つ。本機は、そう計算する。']] },
    ] },

  { id: 'ec5_2', title: '塔が答えた日', bg: 'crisis', cond: { fac: 5, ecl: 'ret', flag: 'om5_lyra', with: ['lyra'] },
    scenes: [
      ['narr', '', '再来の夜。予兆の頃からライラが「対話」を続けてきた演算塔が、初めて、意味のある数列を返した。'],
      ['lyra', 'shock', 'ちょっと待って、これ……群れの信号を、塔が真似してる。あたしたちの言葉に、訳してるんだ。'],
      ['theta', 'normal', '危険です。塔が群れの側に引き込まれる可能性を、私は否定できません。'],
      ['lyra', 'normal', '分かってる。でもこの一年、塔はずっと怯えてた。今やっと、喋ってくれたんだよ。'],
      ['@leader', 'normal', '塔の声を信じて群れを惑わすか、塔を閉じて守りに徹するか。'],
    ],
    choices: [
      { t: '塔に群れの信号を返させ、群れを惑わす（蝕への火力 +15%（8か月）・研究 +150・ライラの技術 +1）',
        fx: { rp: 150, stat: { lyra: { sci: 1 } }, loyal: { lyra: 10 }, flag: 'ec5_tower_speak', act: [{ buff: 'eclDmg', v: 0.15, months: 8, name: '塔の返信' }] },
        after: [['lyra', 'happy', 'ほら、群れが迷ってる！ 塔、すごいよ。あんたは怖がりじゃない。']] },
      { t: '塔を閉じ、その演算を艦の守りに回す（艦の守り +10%（10か月）・防御の研究に重点・シータの忠誠 +8）',
        fx: { loyal: { theta: 8, lyra: -8 }, flag: 'ec5_tower_close', act: [{ buff: 'def', v: 0.1, months: 10, name: '閉じた塔' }, { research: 'def' }] },
        after: [['lyra', 'sad', '……ごめんね。また、話そうね。'], ['theta', 'normal', '賢明な判断です。……ライラ、あなたの一年は、記録に残します。']] },
    ] },
]);
