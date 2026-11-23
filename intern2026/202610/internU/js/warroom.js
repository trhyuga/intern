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
  const reply = (kind, k) => pickL((REPLY[kind] || REPLY.attack)[OFF[k].pers] || ['了解。']);
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
  const SPEED = [{ base: 1700, per: 55 }, { base: 950, per: 32 }, { base: 380, per: 10 }];
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
      if (e.pid !== null && e.pid !== undefined && G.planets[e.pid]) { StarMap.focus(e.pid, null, 0.25); StarMap.selPlanet = e.pid; }
      if (e.k === 'say' && !skipAll) Sound.se('type');
      if (e.k === 'result') Sound.se(e.ok ? 'good' : 'bad');
      if (!skipAll) {
        const sp = SPEED[speedIdx];
        await sleep(e.k === 'head' ? sp.base * 0.5 : sp.base + (e.text || '').length * sp.per);
        // 画面が開いている間（会話・窓）は待つ
        while (on() && (document.querySelector('#talk.show') || document.querySelector('#modal.show') || (typeof UI !== 'undefined' && UI.current !== 'main'))) await sleep(300);
      }
    }
    playing = false;
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
  return { say, order, result, news, head, pend, link, reply, RECRUIT, DIPLO, pickL, play, redrawAll, setSpeed, clearQueue, skip: () => { skipAll = true; }, get playing() { return playing; }, get queued() { return queue.length; } };
})();
