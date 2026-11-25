// ============================================================
//  作戦室：オートモードの間、参謀の命令・士官の返事・その結果を、会話の形で1件ずつ見せる
//  種類：head 月の見出し / say 台詞 / order 命令 / result 結果 / news 銀河の報
// ============================================================
const WarRoom = (() => {
  let queue = [];
  const on = () => typeof Staff !== 'undefined' && Staff.active();
  function hist() { if (!G.war) G.war = []; return G.war; }
  function push(e) {
    if (!on()) return null;
    e.t = G.turn; e.id = (G.warId = (G.warId || 0) + 1);
    hist().push(e); queue.push(e);
    // 直近12か月分だけ残す
    const h = hist(); while (h.length && h[0].t < G.turn - 12) h.shift();
    return e;
  }
  const say = (who, text, expr = 'normal', pid = null) => who && OFF[who] ? push({ k: 'say', who, text, expr, pid }) : null;
  const order = (text, pid = null) => push({ k: 'order', text, pid });
  const result = (text, ok = true, pid = null) => push({ k: 'result', text, ok, pid });
  const news = text => push({ k: 'news', text });
  const head = text => push({ k: 'head', text });
  const flow = text => push({ k: 'flow', text });   // 艦隊戦の流れ
  // 侵攻：どこからどこへ（タップで地図をその矢印へ寄せる）
  const raid = (label, text, ok, from, to) => push({ k: 'raid', label, text, ok, from, to, pid: to });

  // ---------- 待ちの命令（あとで結果と結びつける） ----------
  function pend(match, text, pid) { if (!on()) return; G.warPend = (G.warPend || []).concat([{ match, text, pid, t: G.turn }]).slice(-40); }
  // 記録の文に合う待ちの命令があれば、その命令の文を返して消す
  function link(logText) {
    const list = G.warPend || [];
    const i = list.findIndex(p => logText.includes(p.match));
    if (i < 0) return null;
    const p = list[i]; list.splice(i, 1);
    return p;
  }

  // ---------- 台詞の表（性格ごと） ----------
  const pickL = a => a[Math.floor(Math.random() * a.length)];
  const REPLY = {
    attack: {
      '猛進': ['任せろ！ 一気に片をつける！', '待ってました！ 全艦、続け！'],
      '沈着': ['承知した。抜かりなく進める。', '了解。敵の出方を見ながら詰める。'],
      '策士': ['ふふ、良い手です。敵の弱みは見えています。', '了解。罠も用意しておきましょう。'],
      '仁徳': ['わかりました。無駄な血は流させません。', '承知しました。皆、無理はするな。'],
      '野心': ['その武功、私がいただきましょう。', '良い機会だ。名を上げさせてもらう。'],
      '忠烈': ['御意。この身に代えても。', '命に代えて、果たしてまいります。'],
      '奔放': ['はいはーい、派手にいくよ！', 'おっ、面白くなってきた！'],
    },
    move: {
      '猛進': ['守りか。……まあいい、来る奴は叩き潰す。'], '沈着': ['了解。陣を敷いて待つ。'], '策士': ['承知。敵がどこから来るか、読んでおきます。'],
      '仁徳': ['わかりました。民を守ります。'], '野心': ['退屈な役目だが、引き受けよう。'], '忠烈': ['御意。一歩も通しませぬ。'], '奔放': ['りょーかい、のんびり行くね。'],
    },
    repair: {
      '猛進': ['ちっ、仕方ない。すぐ戻るぞ。'], '沈着': ['了解。整えてから出直す。'], '策士': ['賢明です。傷を癒やすのも戦のうち。'],
      '仁徳': ['ありがとうございます。兵を休ませます。'], '野心': ['……やむを得まい。'], '忠烈': ['御意。すぐに戦列へ戻ります。'], '奔放': ['ふー、ちょっと休憩！'],
    },
    govern: {
      '猛進': ['内政は性に合わんが、やってみよう。'], '沈着': ['承知しました。着実に。'], '策士': ['数字は嘘をつきません。お任せを。'],
      '仁徳': ['民のためになるよう努めます。'], '野心': ['この星を、銀河一の星にしてみせよう。'], '忠烈': ['御意。'], '奔放': ['りょーかい、楽しくやるよ！'],
    },
    appoint: {
      '猛進': ['総督か！ 退屈しないといいがな。'], '沈着': ['謹んでお受けします。'], '策士': ['面白い。この星の帳簿、すぐに洗い直しましょう。'],
      '仁徳': ['この星の人々のために、力を尽くします。'], '野心': ['ふむ、まずはここからか。'], '忠烈': ['御意。命に代えて治めます。'], '奔放': ['えっ、私が総督？ まあいっか！'],
    },
  };
  // 君主の返事（家臣の「御意」ではなく、君主らしく）
  const LEADER_REPLY = {
    attack: ['よかろう。我が出る。', '任せよ。この手で道を開こう。', 'うむ。皆の働き、無駄にはせぬ。'],
    move: ['わかった。そこで備えよう。', 'よかろう。守りは任せよ。'],
    repair: ['うむ。兵を休ませよう。', 'よかろう。立て直してから出る。'],
    govern: ['よかろう。民のためになるなら。', 'わかった。目を配っておこう。'],
    appoint: ['よかろう。その地、我が治めよう。', '任せよ。民の暮らしは守る。'],
    command: ['よかろう。我が自ら艦隊を率いる。', '旗艦を出せ。我が前に立つ。'],
    envoy: ['我が自ら出向こう。それが礼というものだ。', 'よかろう。{target}の顔を、この目で見てこよう。'],
    research: ['うむ。学者たちを励ましておこう。', 'よかろう。研究所に足を運ぼう。'],
    recruit: ['我が自ら招こう。その者の才、見てみたい。'],
  };
  // 性格ごとの返事を増やす（人物ごとの言葉が無い時に使う）
  const MORE = {
    attack: { '猛進': ['{target}か！ 一番乗りは俺がもらう！', '腕が鳴る。{target}を叩き潰す！'], '沈着': ['{target}の守りは調べてある。手順どおりに落とす。', '承知。損害は最小に抑える。'], '策士': ['{target}ね。正面からは行かないわよ。', '相手が気づいた時には、もう終わっている。'], '仁徳': ['{target}の民を巻き込まないように進めます。', '兵たちを必ず連れて帰ります。'], '野心': ['{target}を落とせば、私の名も上がるというもの。', 'ふふ、良い獲物だ。'], '忠烈': ['{target}、必ずや御旗のもとに。', 'この命、作戦に捧げます。'], '奔放': ['{target}？ いいね、ちょっと遊んでくる！', '派手にいっていい？ いいよね！'] },
    move: { '猛進': ['待つのは苦手だが……来たら叩く。', '{target}で待ち伏せか。悪くない。'], '沈着': ['{target}に陣を敷きます。', '守りは任せてください。'], '策士': ['{target}なら、敵の通り道が見えるわ。', '守りながら、次の手を考えておきます。'], '仁徳': ['{target}の民を守ります。', '誰も通しません。安心してください。'], '野心': ['守りの功は地味だが、まあいい。', '{target}か。……退屈させるなよ。'], '忠烈': ['{target}、死守いたします。', '一歩も退きませぬ。'], '奔放': ['{target}でお留守番ね、了解！', 'のんびりしてていいの？ やった！'] },
    repair: { '猛進': ['ちっ、まだやれるんだがな。', 'すぐに直して戻ってくる！'], '沈着': ['整備を急がせます。', '修理の間に、次の戦いの段取りを。'], '策士': ['傷を治すのも作戦のうちよ。', '休む間に、敵の動きを洗っておきます。'], '仁徳': ['兵たちを休ませられます。ありがとう。', '負傷者の手当てを先に。'], '野心': ['……仕方あるまい。', '次は、この借りを返す。'], '忠烈': ['御意。一刻も早く戦列へ。', '恥ずかしながら、下がります。'], '奔放': ['休憩だー！', 'ちょっと一息いれてくる！'] },
    govern: { '猛進': ['数字は苦手だが、言われた通りにやる。', '{target}を鍛え上げてやる。'], '沈着': ['{target}の計画を立て直します。', '一年で形にしてみせます。'], '策士': ['{target}の帳簿、隅々まで見ておきます。', '無駄は全部削りましょう。'], '仁徳': ['{target}の人々の声を聞いてきます。', '皆が笑って暮らせるように。'], '野心': ['{target}を銀河一の星にしてやろう。', '成果は、私の名で上げておく。'], '忠烈': ['御意。', 'お任せください。'], '奔放': ['{target}を、楽しい星にしちゃおう！', 'まかせて、なんとかなるって！'] },
    appoint: { '猛進': ['総督か！ 退屈しないといいがな。', '{target}を、強い星にしてやる。'], '沈着': ['{target}の総督、謹んでお受けします。', '着実に治めます。'], '策士': ['{target}ね。面白い星を任されたわ。', 'さて、まずは帳簿から。'], '仁徳': ['{target}の人々のために、力を尽くします。', '民の暮らしを、まず見て回ります。'], '野心': ['ふむ、まずは{target}からか。', '一つの星から、天下は始まる。'], '忠烈': ['御意。命に代えて{target}を治めます。', '必ずや、ご期待に。'], '奔放': ['えっ、私が総督？ まあいっか！', '{target}、どんなところかな！'] },
  };
  const GENERIC = {
    command: ['艦隊の指揮、お預かりします。', 'この艦隊、必ず勝たせてみせます。', '了解。艦隊を預かります。'],
    envoy: ['{target}へ参ります。良い返事を持ち帰りましょう。', '{target}との交渉、お任せを。'],
    research: ['研究所の総力を挙げます。', '{target}の完成を急がせます。'],
    recruit: ['{target}殿を、必ず口説き落としてきます。', '{target}殿に会ってまいります。'],
  };
  function reply(kind, k, target) {
    const p = typeof People !== 'undefined' ? People.reply(kind, k, target) : null;
    if (p) return p;
    if (Game.isLeader(k)) return pickL(LEADER_REPLY[kind] || LEADER_REPLY.attack).replace(/\{target\}/g, target || '');
    const pool = [].concat((REPLY[kind] || {})[OFF[k].pers] || [], (MORE[kind] || {})[OFF[k].pers] || [], GENERIC[kind] || []);
    return pickL(pool.length ? pool : (REPLY.attack[OFF[k].pers] || ['了解。'])).replace(/\{target\}/g, target || 'そこ');
  }
  const RECRUIT = {
    ask: ['殿、我らに力を貸していただきたい。', '殿の才、ぜひ我らのもとで。', '殿、共に新しい時代を作りませんか。'],
    yes: ['……いいだろう。その誘い、乗った。', 'わかりました。この力、お預けします。', 'ふむ、退屈はしなさそうだ。'],
    no: ['悪いが、まだ仕える気はない。', '今は、その時ではありません。', '考えておこう。……今日のところは断る。'],
  };
  const DIPLO = {
    ask: {
      nap: 'まずは互いに矛を収める約束を交わしませんか。', trade: '交易の道を開きましょう。互いの民が潤います。',
      ally: '共に歩む盟約を結びたく、参りました。', peace: 'これ以上の流血は、互いのためになりません。',
    },
    yes: { nap: '……よかろう。しばらく背中は撃たぬ。', trade: '取引か。悪くない話だ。', ally: '共に戦おう。この盟約、違えはせぬ。', peace: '……これ以上の血は、互いのためにならぬな。' },
    no: { nap: '信用できぬな。出直してまいれ。', trade: '今はその時ではない。', ally: '盟を結ぶには、まだ互いを知らなすぎる。', peace: '停戦だと？ 笑わせる。' },
  };

  // ---------- 見せる ----------
  const SPEED = [{ base: 1700, per: 55 }, { base: 950, per: 32 }, { base: 380, per: 10 }, { base: 70, per: 0 }];   // 最後が超速
  let speedIdx = 1, playing = false, skipAll = false;
  function setSpeed(i) { speedIdx = i; }
  function render(e, typing) {
    const wrap = document.createElement('div');
    wrap.className = 'wr-e wr-' + e.k + (e.k === 'result' ? (e.ok ? ' ok' : ' ng') : '');
    if (e.k === 'say') {
      const fac = G.officers[e.who] && typeof G.officers[e.who].fac === 'number' ? FACTIONS[G.officers[e.who].fac].col : '#8aa0c0';
      const st = G.officers[e.who] && G.officers[e.who].st === 'act' ? `<span class="rk ${Game.isLeader(e.who) ? 'lord' : Game.rankIdx(e.who) >= 6 ? 'gen' : ''}">${Game.rankName(e.who)}</span>` : '';
      wrap.innerHTML = `<img src="${Portrait.url(e.who, e.expr)}" style="border-color:${fac}"><div class="wr-b" style="--c:${fac}"><b>${st}${OFF[e.who].name}</b><p></p></div>`;
      const p = wrap.querySelector('p');
      if (typing) { let n = 0; const tx = e.text; const h = setInterval(() => { n += 2; p.textContent = tx.slice(0, n); if (n >= tx.length) clearInterval(h); }, 24); wrap._h = h; }
      else p.textContent = e.text;
    } else if (e.k === 'order') wrap.innerHTML = `<span class="wr-i">▶ 命令</span><span>${esc(e.text)}</span>`;
    else if (e.k === 'result') wrap.innerHTML = `<span class="wr-i">${e.ok ? '✔ 結果' : '✖ 結果'}</span><span>${esc(e.text)}</span>`;
    else if (e.k === 'raid') {
      wrap.className = 'wr-e wr-result wr-raid ' + (e.ok ? 'ok' : 'ng');
      wrap.innerHTML = `<span class="wr-i">${esc(e.label)}</span><span>${esc(e.text)}<small class="wr-map">地図で見る ›</small></span>`;
      wrap.onclick = () => { if (typeof UI !== 'undefined') UI.showRaid({ from: e.from, to: e.to }); };
    }
    else if (e.k === 'flow') wrap.innerHTML = `<span class="wr-i">戦況</span><span>${esc(e.text)}</span>`;
    else if (e.k === 'news') wrap.innerHTML = `<span class="wr-i">銀河の報</span><span>${esc(e.text)}</span>`;
    else wrap.innerHTML = `<span>${esc(e.text)}</span>`;
    return wrap;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // たまった記録を1件ずつ見せる（地図をその星へ寄せる）
  async function play() {
    const list = document.querySelector('#warroom .wr-list');
    if (!list || !queue.length) { queue = []; return; }
    playing = true; skipAll = false;
    const items = queue; queue = [];
    for (const e of items) {
      if (!on()) break;
      const el = render(e, !skipAll && speedIdx < 2);
      list.appendChild(el);
      while (list.children.length > 160) list.removeChild(list.firstChild);
      list.scrollTop = list.scrollHeight;
      if (e.k === 'raid' && G.planets[e.from] && G.planets[e.to]) { StarMap.raidFocus = { from: e.from, to: e.to }; StarMap.focusPair(e.from, e.to); StarMap.selPlanet = e.to; }
      else if (e.pid !== null && e.pid !== undefined && G.planets[e.pid]) { StarMap.raidFocus = null; StarMap.focus(e.pid); StarMap.selPlanet = e.pid; }
      if (e.k === 'say' && !skipAll) Sound.se('type');
      if (e.k === 'result') Sound.se(e.ok ? 'good' : 'bad');
      if (e.k === 'raid') Sound.se(e.ok ? 'order' : 'alarm');
      if (!skipAll) {
        const sp = SPEED[speedIdx];
        await sleep(e.k === 'head' ? sp.base * 0.5 : sp.base + (e.text || '').length * sp.per);
        // 画面が開いている間（会話・窓）は待つ
        while (on() && (document.querySelector('#talk.show') || document.querySelector('#modal.show') || (typeof UI !== 'undefined' && UI.current !== 'main'))) await sleep(300);
      }
    }
    playing = false; StarMap.raidFocus = null;
  }
  // 作戦室を開いた時に、残っている記録を並べ直す
  function redrawAll() {
    const list = document.querySelector('#warroom .wr-list');
    if (!list) return;
    list.innerHTML = '';
    hist().slice(-80).forEach(e => list.appendChild(render(e, false)));
    list.scrollTop = list.scrollHeight;
  }
  function clearQueue() { queue = []; }
  return { say, order, result, news, head, raid, flow, get speed() { return speedIdx; }, pend, link, reply, RECRUIT, DIPLO, pickL, play, redrawAll, setSpeed, clearQueue, skip: () => { skipAll = true; }, get playing() { return playing; }, get queued() { return queue.length; } };
})();
