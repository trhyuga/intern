// ============================================================
//  画面と操作
// ============================================================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = n => Math.round(n).toLocaleString('ja-JP');
const facColor = g => (g && g.state === 'serve' && G.factions[g.faction]) ? G.factions[g.faction].color : '#6a5a4a';
const STAT_NAME = { lead: '統率', war: '武力', int: '知力', pol: '政治', cha: '魅力', loyalty: '忠誠' };

const UI = {
  show(id) {
    $$('.screen').forEach(s => s.classList.toggle('show', s.id === id));
    UI.cur = id;
    if (id === 'main') setTimeout(() => MapView.resize(), 0);
    if (typeof Auto !== 'undefined' && Auto.running) setTimeout(() => Auto.place(), 0);
  },
  toast(msg, ms = 1800) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(UI._tt); UI._tt = setTimeout(() => t.classList.remove('show'), ms);
  },
  // 武将の会話（タップで閉じる）
  talk(g, expr, text, color, opts = {}) {
    return new Promise(res => {
      const el = $('#talk');
      const autoMs = (typeof Auto !== 'undefined' && (Auto.running || (typeof Battle !== 'undefined' && Battle.watching && UI.cur === 'battle'))) ? Auto.talkMs(text) : 0;
      el.innerHTML = `<div class="talk-box">${g ? `<img src="${Portrait.get(g, expr || 'normal', color || facColor(g))}">` : ''}<div class="talk-text">${opts.tag ? `<div class="talk-tag">${opts.tag}</div><br>` : ''}${text.replace(/<b>[\s\S]*?<\/b>/g, m => m.replace(/\n/g, '<br>')).split('\n').map(t => `<span class="tl">${t}</span>`).join('<br>')}${autoMs ? `<div class="talk-auto"><i style="transition:width ${autoMs}ms linear"></i></div>` : '<div class="talk-next">▼</div>'}</div></div>`;
      el.classList.add('show');
      UI.fixOrphans(el);
      if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => UI.fixOrphans(el));
      requestAnimationFrame(() => UI.fixOrphans(el));
      let veil = $('.talk-veil');
      if (!veil) { veil = document.createElement('div'); veil.className = 'talk-veil'; el.after(veil); }
      let closed = false;
      const close = () => { if (closed) return; closed = true; clearTimeout(tm); el.classList.remove('show'); veil.onclick = null; el.onclick = null; if (!autoMs) Sound.se('tap'); res(); };
      setTimeout(() => { veil.onclick = close; el.onclick = close; }, 180);
      let tm = null;
      if (autoMs) { requestAnimationFrame(() => { const bar = $('.talk-auto i', el); if (bar) bar.style.width = '100%'; }); tm = setTimeout(close, autoMs); }
    });
  },
  // 折り返しで最後の行に2文字以下だけ残る段落は、字間を少し詰めて前の行に収める
  fixOrphans(root) {
    root.querySelectorAll('.tl').forEach(sp => {
      // 何度呼んでも同じ結果になるよう、元の状態に戻してから測る（文字の読み込み後にもう一度呼ぶ）
      if (sp.dataset.src == null) sp.dataset.src = sp.innerHTML; else { sp.innerHTML = sp.dataset.src; sp.style.letterSpacing = ''; }
      const fs = parseFloat(getComputedStyle(sp).fontSize) || 16;
      const orphan = () => { const rs = sp.getClientRects(); return rs.length > 1 && rs[rs.length - 1].width < fs * 2.6 ? rs.length : 0; };
      const n0 = orphan(); if (!n0) return;
      for (const ls of [-0.3, -0.6, -0.9, -1.2, -1.5, -2]) {
        sp.style.letterSpacing = ls + 'px';
        if (sp.getClientRects().length < n0) return;
      }
      sp.style.letterSpacing = '';
      // 詰めても収まらなければ、最後の5文字を折り返さないようにして、前の行から何文字か連れてくる
      const w = document.createTreeWalker(sp, NodeFilter.SHOW_TEXT); let last = null; while (w.nextNode()) if (w.currentNode.nodeValue.trim()) last = w.currentNode;
      if (!last) return;
      const v = last.nodeValue, k = Math.min(5, v.length);
      const tail = document.createElement('span'); tail.style.whiteSpace = 'nowrap'; tail.textContent = v.slice(v.length - k);
      last.nodeValue = v.slice(0, v.length - k); last.after(tail);
    });
  },
  modal({ title, body, buttons, wide, auto }) {
    return new Promise(res => {
      if (auto !== undefined && typeof Auto !== 'undefined' && Auto.running) setTimeout(() => { if (m.classList.contains('show') && UI._modalRes === myRes) UI.closeModal(auto); }, 2600 / Auto.speed);
      const m = $('#modal');
      m.innerHTML = `<div class="modal-box">${title ? `<div class="modal-hd">${title}</div>` : ''}<div class="modal-bd">${body || ''}</div>${buttons && buttons.length ? `<div class="modal-ft"></div>` : ''}</div>`;
      const ft = $('.modal-ft', m);
      (buttons || []).forEach(b => {
        const e = document.createElement('button'); e.className = 'btn ' + (b.cls || ''); e.textContent = b.label;
        e.onclick = () => { Sound.se('tap'); const v = b.get ? b.get() : b.value; if (v === undefined && b.get) return; m.classList.remove('show'); res(v); };
        ft.appendChild(e);
      });
      m.classList.add('show');
      const myRes = UI._modalRes = v => { m.classList.remove('show'); res(v); };
    });
  },
  closeModal(v) { if (UI._modalRes) UI._modalRes(v); },
  confirm(text, yes = 'はい', no = 'いいえ') { return UI.modal({ body: text, buttons: [{ label: no, value: false }, { label: yes, cls: 'primary', value: true }] }); },
  alert(text, title) { return UI.modal({ title, body: text, buttons: [{ label: 'OK', cls: 'primary', value: true }] }); },
  choose(title, options, cancel = true) {
    const body = options.map((o, i) => `<button class="btn opt ${o.cls || ''}" data-i="${i}" ${o.disabled ? 'disabled' : ''}>${o.label}${o.sub ? `<small>${o.sub}</small>` : ''}</button>`).join('');
    const p = UI.modal({ title, body, buttons: cancel ? [{ label: 'やめる', value: null }] : [] });
    $$('#modal .opt').forEach(b => b.onclick = () => { Sound.se('tap'); UI.closeModal(options[+b.dataset.i].value); });
    return p;
  },
  number(title, min, max, init, step = 100, unit = '') {
    if (max < min) max = min;
    const body = `<div class="rng-v"><span id="rv">${fmt(init)}</span>${unit}</div><input type="range" class="rng" id="rg" min="${min}" max="${max}" step="${step}" value="${init}"><div style="display:flex;gap:6px"><button class="btn small" data-q="0">最小</button><button class="btn small" data-q="0.5">半分</button><button class="btn small" data-q="1">最大</button></div>`;
    const p = UI.modal({ title, body, buttons: [{ label: 'やめる', value: null }, { label: '決定', cls: 'primary', get: () => +$('#rg').value }] });
    const rg = $('#rg'), rv = $('#rv');
    rg.oninput = () => rv.textContent = fmt(rg.value);
    $$('#modal [data-q]').forEach(b => b.onclick = () => { rg.value = Math.round((min + (max - min) * +b.dataset.q) / step) * step; rg.oninput(); });
    return p;
  },
  // 武将を選ぶ。multi なら配列で返す
  pickGenerals(title, list, opts = {}) {
    const stat = opts.stat || 'lead';
    const sorted = list.slice().sort((a, b) => (b[stat] || 0) - (a[stat] || 0));
    const sel = new Set();
    const keys = opts.keys || ['lead', 'war', 'int', 'pol', 'cha'];
    const body = (opts.note ? `<div style="font-size:13px;color:var(--muted);margin-bottom:6px">${opts.note}</div>` : '') + (sorted.length ? sorted.map(g => `
      <div class="list-item ${opts.disabled && opts.disabled(g) ? 'dis' : ''}" data-i="${g.i}">
        <img src="${Portrait.get(g, 'normal', facColor(g))}">
        <div class="li-body"><div class="li-name">${g.name}${g.isLord ? ' <small>君主</small>' : ''}${Game.titles(g).map(t => `<span class="tbadge">${t.name}</span>`).join('')}${opts.extra ? `<small>${opts.extra(g)}</small>` : ''}</div>
        <div class="li-st">${keys.map(k => `<span>${STAT_NAME[k][0]}<b class="${k === stat ? 'hi' : ''}">${Math.round(g[k])}</b></span>`).join('')}</div>
        <div>${g.traits.map(t => `<span class="trait">${t}</span>`).join('')}</div></div>
      </div>`).join('') : '<p>該当する武将がいない</p>');
    const btns = [{ label: 'やめる', value: null }];
    if (opts.multi) btns.push({ label: '決定', cls: 'primary', get: () => sel.size ? [...sel] : undefined });
    const p = UI.modal({ title, body, buttons: btns });
    $$('#modal .list-item').forEach(el => el.onclick = () => {
      const gi = +el.dataset.i, g = G.gens[gi];
      if (opts.disabled && opts.disabled(g)) { UI.toast(opts.disabledMsg || '選べない'); return; }
      Sound.se('tap');
      if (!opts.multi) return UI.closeModal(gi);
      if (sel.has(gi)) { sel.delete(gi); el.classList.remove('sel'); }
      else if (sel.size < (opts.max || 5)) { sel.add(gi); el.classList.add('sel'); }
      else UI.toast(`最大${opts.max || 5}人まで`);
    });
    return p;
  },
  sheet(html) {
    const s = $('#sheet'); $('.sheet-content', s).innerHTML = html; s.classList.add('show');
    $('.sheet-bg', s).onclick = () => UI.closeSheet();
    return $('.sheet-content', s);
  },
  closeSheet() { $('#sheet').classList.remove('show'); MapView.select(-1); },
};

// ============================================================
//  アプリ全体の流れ
// ============================================================
const App = {
  busy: false,
  init() {
    $('#tap').onclick = () => { Sound.init(); App.opening(); };
    $$('#title [data-act]').forEach(b => b.onclick = () => { Sound.se('tap'); App.titleAction(b.dataset.act); });
    $$('.back').forEach(b => b.onclick = () => { Sound.se('tap'); UI.show(b.closest('#lord') ? 'scen' : 'title'); if (b.closest('#scen')) App.title(); });
    $$('.bottombar [data-nav]').forEach(b => b.onclick = () => { Sound.se('tap'); App.nav(b.dataset.nav); });
    $('#btnMenu').onclick = () => { Sound.se('tap'); App.menu(); };
    MapView.init($('#mapcv'));
    MapView.onTap = ci => App.tapCity(ci);
    Auto.init();
    $('#mapHint').onclick = () => { if (App._pickRes) { const r = App._pickRes; App._pickRes = null; App.endPick(); r(null); } };
  },
  async opening() {
    UI.show('opening');
    await Cinema.opening($('#opcv'), $('#opening .skip'));
    App.title();
  },
  title() {
    UI.show('title');
    Sound.bgm('title');
    Cinema.titleBG($('#titlecv'));
  },
  async titleAction(a) {
    if (a === 'new') return App.scenList();
    if (a === 'load') {
      if (!Game.hasSave() || !Game.load()) return UI.alert('セーブデータがありません');
      return App.enterMain();
    }
    if (a === 'howto') return App.howto();
    if (a === 'opening') return App.opening();
  },
  howto() {
    return UI.modal({ title: '遊び方', body: `<div class="howto">
      <h4>目的</h4><p>他の勢力をすべて滅ぼし、天下を統一する。自分の君主が倒れ、跡継ぎもいなければ敗北。</p>
      <h4>季節ごとに</h4><p>都市をタップして命令を出す。命令はすべて<b>武将が1人1回</b>行う。誰に任せるかで結果が変わる（政治の高い者は内政、魅力の高い者は徴兵や登用、知力の高い者は計略）。終わったら「季節を進める」。</p>
      <h4>武将の個性</h4><ul>
      <li><b>猪突</b>の武将は戦場で命令を無視して突撃することがある</li>
      <li><b>野心</b>の武将は離間が倍効き、忠誠が下がると謀反を起こす</li>
      <li><b>忠義</b>の武将は寝返らない。<b>臆病</b>な武将は兵が減ると勝手に退く</li>
      <li>特定の武将が同じ戦場にそろうと<b>絆</b>の力で強くなる</li></ul>
      <h4>戦争</h4><p>攻める側は城の<b>本丸</b>を占領するか、敵の<b>総大将★</b>を倒せば勝ち。守る側は30日守るか、攻めの総大将を倒せば勝ち。城門は攻撃で壊せる。隣の敵将とは<b>一騎討ち</b>ができる。</p>
      <h4>操作</h4><p>地図はドラッグで移動、2本指で拡大縮小。戦場では自分の部隊をタップ → 青いマスへ移動 → 行動を選ぶ。</p>
      <h4>秋</h4><p>秋に収穫があり、兵糧が増える。兵は季節ごとに兵糧を食べる。</p></div>`, buttons: [{ label: '閉じる', cls: 'primary', value: true }] });
  },
  scenList() {
    UI.show('scen');
    $('#scenList').innerHTML = SCENARIOS.map(s => `
      <div class="scen-card" data-id="${s.id}">
        <div class="yr">${s.dream ? '仮想' : s.year + '年'}</div>
        <h3>${s.title}</h3><div class="sub">${s.sub}</div>
        <p>${s.desc}</p>
        <div class="mini">${s.lords.map(L => `<span class="chip"><i style="background:${L[1]}"></i>${L[0]}</span>`).join('')}</div>
      </div>`).join('');
    $$('#scenList .scen-card').forEach(el => el.onclick = () => { Sound.se('tap'); App.lordList(el.dataset.id); });
  },
  lordList(sid) {
    const sc = SCENARIOS.find(s => s.id === sid);
    UI.show('lord');
    const gmap = {}; GENERAL_SRC.trim().split('\n').forEach(l => { const p = l.split(','); gmap[p[0]] = { name: p[0], lead: +p[1], war: +p[2], int: +p[3], pol: +p[4], cha: +p[5], traits: p[6] === '-' ? [] : p[6].split(' '), appear: +p[8], female: p[10] === 'F', isLord: true }; });
    const rows = sc.lords.map(L => ({ L, n: L[2].length, g: L[3].length }));
    const maxN = Math.max(...rows.map(r => r.n + r.g * 0.3));
    $('#lordList').innerHTML = rows.sort((a, b) => (b.n + b.g * 0.3) - (a.n + a.g * 0.3)).map(({ L, n, g }) => {
      const k = (n + g * 0.3) / maxN;
      const diff = k > 0.75 ? '易しい' : k > 0.45 ? '普通' : k > 0.25 ? '難しい' : '至難';
      const lord = gmap[L[0]];
      return `<div class="lord-card" data-n="${L[0]}"><img src="${Portrait.get(lord, 'normal', L[1])}">
        <div class="lc-body"><div class="lc-name"><i style="background:${L[1]}"></i>${L[0]}</div>
        <div class="lc-sub">都市 ${n}　武将 ${g + 1}人　本拠 ${CITY_DATA.find(c => c[0] === L[2][0])[1]}</div>
        <div class="lc-sub">統${lord.lead} 武${lord.war} 知${lord.int} 政${lord.pol} 魅${lord.cha}　${lord.traits.map(t => `<span class="trait">${t}</span>`).join('')}</div>
        <div class="diff">難易度：${diff}</div></div></div>`;
    }).join('');
    $$('#lordList .lord-card').forEach(el => el.onclick = async () => {
      Sound.se('tap');
      if (!(await UI.confirm(`${el.dataset.n}で天下を目指しますか？`))) return;
      Game.newGame(sid, el.dataset.n);
      await App.enterMain(true);
    });
  },

  // ---------------- メイン画面 ----------------
  async enterMain(isNew) {
    UI.show('main');
    Sound.bgm('map');
    MapView.resize();
    const f = G.factions[G.player];
    MapView.centerOn(f.capital);
    App.refresh();
    if (isNew) {
      const lord = Game.lordOf(G.player);
      const sc = SCENARIOS.find(s => s.id === G.scen);
      await UI.talk(lord, 'normal', `${sc.title}――${sc.dream ? '' : sc.year + '年。'}\n${lord.name}「いよいよだ。この乱世、我らの手で終わらせよう」`, f.color);
      await UI.talk(null, '', '都市をタップして命令を出そう。\n武将は季節ごとに1回ずつ働ける。\n終わったら右下の「季節を進める」。');
      // 軍師から、オートの説明
      const sg = Auto.strategist();
      if (sg && sg !== lord) {
        const v = VOICE[sg.name] || {}, you = v.you && (!v.youIf || v.youIf === lord.name) ? v.you : '殿', I = v.I || '私';
        await UI.talk(sg, 'normal', `軍師 ${sg.name}「${you}、内政や戦の采配が手に余るときは、下の「軍師」から${I}にお任せください。この季節だけ・1年・止めるまで、のいずれかで代わりに采配いたします」`, facColor(sg), { tag: '軍師オート' });
        await UI.talk(sg, 'happy', `軍師 ${sg.name}「任せている間は、上のバーの「止める」でいつでも${you}の手にお戻しします。合戦の観戦中に止めれば、その場で指揮をお返しします。見る速さは 普通・速い・超速。話の途中でも、画面をたたけば先へ進みます」`, facColor(sg), { tag: '軍師オート' });
      }
    }
  },
  refresh() {
    if (!G) return;
    const f = G.factions[G.player];
    $('#tbDate').textContent = `${G.year}年 ${SEASONS[G.season]}`;
    $('#tbFac').innerHTML = `<i style="background:${f.color}"></i>${Events.rankName(f.i) ? `<b class="tb-rank">${Events.rankName(f.i)}</b>` : ''}${f.name}軍`;
    const cs = Game.citiesOf(G.player);
    const sum = k => cs.reduce((s, c) => s + c[k], 0);
    const idle = Game.gensOf(G.player).filter(g => !g.acted).length;
    $('#tbRes').innerHTML = `<span>都市<b>${cs.length}</b></span><span>兵<b>${fmt(sum('troops'))}</b></span><span>金<b>${fmt(sum('gold'))}</b></span><span>糧<b>${fmt(sum('food'))}</b></span><span>待機<b>${idle}</b></span>`;
    MapView.refresh();
  },

  // 地図で都市を選ぶ（候補を光らせる）
  pickCity(hint, cands) {
    return new Promise(res => {
      UI.closeSheet();
      MapView.setHighlight(cands);
      $('#mapHint').innerHTML = `${hint}　<u>やめる</u>`; $('#mapHint').classList.add('show');
      App._pickRes = ci => { App.endPick(); res(ci); };
      App._pickCands = cands;
    });
  },
  endPick() { MapView.setHighlight(null); $('#mapHint').classList.remove('show'); App._pickCands = null; },

  tapCity(ci) {
    if (App.busy) return;
    if (App._pickRes) {
      if (ci >= 0 && App._pickCands.includes(ci)) { Sound.se('ok'); const r = App._pickRes; App._pickRes = null; r(ci); }
      return;
    }
    if (ci < 0) { UI.closeSheet(); return; }
    Sound.se('tap');
    App.openCity(ci);
  },

  // ---------------- 都市シート ----------------
  openCity(ci, tab) {
    const c = G.cities[ci];
    MapView.select(ci);
    const own = c.owner === G.player;
    const f = c.owner === null ? null : G.factions[c.owner];
    const gens = Game.gensIn(ci);
    const knownRonin = own ? Game.roninIn(ci).filter(g => g.known) : [];
    const bar = (v, m) => `<div class="bar"><i style="width:${clamp(v / m * 100, 0, 100)}%"></i></div>`;
    const ally = f && !own && Game.isAlly(G.player, c.owner);
    tab = tab || App._lastTab || 'dom';
    let html = `<div class="city-hd"><h3>${c.name}</h3><span class="own">${f ? `<i style="background:${f.color}"></i>${f.name}軍${f.capital === ci ? '（本拠）' : ''}${ally ? ' <span class="ally">同盟</span>' : ''}` : '空白地'}</span><button class="x">×</button></div>
      <div class="stats">
        <div class="stat">兵<b>${fmt(c.troops)}</b></div>
        <div class="stat">訓練<b>${Math.round(c.train)}</b>${bar(c.train, 100)}</div>
        <div class="stat">民忠<b>${Math.round(c.loyal)}</b>${bar(c.loyal, 100)}</div>
        ${own || ally ? `<div class="stat">金<b>${fmt(c.gold)}</b></div><div class="stat">兵糧<b>${fmt(c.food)}</b></div>` : ''}
        <div class="stat">人口<b>${fmt(c.pop / 10000)}万</b></div>
        <div class="stat">農業<b>${c.farm}/${c.farmMax}</b>${bar(c.farm, c.farmMax)}</div>
        <div class="stat">商業<b>${c.comm}/${c.commMax}</b>${bar(c.comm, c.commMax)}</div>
        <div class="stat">城壁<b>${c.def}/${c.defMax}</b>${bar(c.def, c.defMax)}</div>
      </div>
      <div class="sec-t">武将 ${gens.length}人${own ? `（待機 ${gens.filter(g => !g.acted).length}）` : ''}</div>
      <div class="gens-row">${gens.length ? gens.map(g => `<div class="gchip ${own && g.acted ? 'acted' : ''}" data-g="${g.i}">${g.isLord ? '<span class="lordmark">君主</span>' : ''}<img src="${Portrait.get(g, 'normal', facColor(g))}">${g.name}${!own && f ? `<br><small>忠${Math.round(g.loyalty)}</small>` : ''}</div>`).join('') : '<span style="font-size:13px;color:var(--muted)">なし</span>'}</div>`;
    if (knownRonin.length) html += `<div class="sec-t">在野の人物</div><div class="gens-row">${knownRonin.map(g => `<div class="gchip" data-g="${g.i}"><img src="${Portrait.get(g, 'normal')}">${g.name}</div>`).join('')}</div>`;
    if (own) {
      const T = { dom: '内政', mil: '軍事', per: '人事', plot: '計略', dip: '外交' };
      html += `<div class="tabs">${Object.entries(T).map(([k, v]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${v}</button>`).join('')}</div><div class="cmds">${App.cmdButtons(tab, c)}</div>
        <div class="toggle"><span>委任（この都市の内政をまかせる）</span><button class="sw ${c.delegate ? 'on' : ''}" id="swDel"></button></div>`;
    } else {
      const adjOwn = c.adj.filter(a => G.cities[a].owner === G.player);
      html += `<div class="cmds" style="margin-top:10px">
        <button class="btn primary" data-x="attack" ${adjOwn.length && !ally ? '' : 'disabled'}>ここを攻める<small>${adjOwn.length ? '隣の自都市から' : '隣接する自都市なし'}</small></button>
        <button class="btn" data-x="sow" ${f && gens.length && !ally ? '' : 'disabled'}>離間<small>忠誠を下げる</small></button>
        <button class="btn" data-x="lure" ${f && gens.length && !ally ? '' : 'disabled'}>引き抜き<small>寝返らせる</small></button>
        <button class="btn" data-x="rumor" ${f && !ally ? '' : 'disabled'}>流言<small>民忠を下げる</small></button>
        <button class="btn" data-x="ally" ${f && !ally ? '' : 'disabled'}>同盟<small>使者を送る</small></button>
        <button class="btn" data-x="surr" ${f ? '' : 'disabled'}>降伏勧告<small>大差なら</small></button></div>`;
    }
    const el = UI.sheet(html);
    $('.x', el).onclick = () => UI.closeSheet();
    $$('.gchip', el).forEach(ch => ch.onclick = () => App.profile(+ch.dataset.g));
    $$('[data-tab]', el).forEach(b => b.onclick = () => { Sound.se('tap'); App._lastTab = b.dataset.tab; App.openCity(ci, b.dataset.tab); });
    $$('[data-cmd]', el).forEach(b => b.onclick = () => { Sound.se('tap'); App.command(b.dataset.cmd, c); });
    $$('[data-x]', el).forEach(b => b.onclick = () => { Sound.se('tap'); App.foreign(b.dataset.x, c); });
    const sw = $('#swDel', el); if (sw) sw.onclick = () => { c.delegate = !c.delegate; sw.classList.toggle('on', c.delegate); UI.toast(c.delegate ? `${c.name}の内政を委任した（季節の終わりに自動で行う）` : '委任を解除した'); };
  },
  cmdButtons(tab, c) {
    const B = (cmd, label, sub, cls = '') => `<button class="btn ${cls}" data-cmd="${cmd}">${label}<small>${sub}</small></button>`;
    switch (tab) {
      case 'dom': return B('farm', '開墾', '農業↑ 金50') + B('comm', '商業', '商業↑ 金50') + B('wall', '修築', '城壁↑ 金50') + B('alms', '施し', '民忠↑ 糧1500') + B('auto', '一括内政', '待機武将に自動', 'gold');
      case 'mil': return B('attack', '出陣', '隣の都市を攻める', 'primary') + B('draft', '徴兵', '兵↑ 金100') + B('train', '訓練', '訓練↑') + B('transport', '輸送', '金・糧・兵を送る');
      case 'per': return B('search', '探索', '人材・財宝を探す') + B('recruit', '登用', '在野の人物を誘う') + B('move', '移動', '武将を別の都市へ') + B('reward', '褒美', '忠誠↑ 金100') + B('study', '修行', '武将の能力を伸ばす');
      case 'plot': return B('sow', '離間', '敵将の忠誠↓') + B('lure', '引き抜き', '敵将を寝返らせる') + B('rumor', '流言', '敵都市の民忠↓');
      case 'dip': return B('ally', '同盟', '他勢力と手を結ぶ') + B('surr', '降伏勧告', '囲んだ弱小勢力を併合');
    }
    return '';
  },

  async pickActor(c, stat, title, note) {
    const list = Game.gensIn(c.i, G.player);
    if (!list.length) { UI.toast('この都市には武将がいない'); return null; }
    return UI.pickGenerals(title, list, { stat, note, disabled: g => g.acted, disabledMsg: 'この季節はもう行動した' });
  },

  // ---------------- 自都市の命令 ----------------
  async command(cmd, c) {
    const simple = { farm: ['pol', '開墾を任せる武将'], comm: ['pol', '商業を任せる武将'], wall: ['lead', '修築を任せる武将'], alms: ['cha', '施しを任せる武将'], draft: ['cha', '徴兵を任せる武将'], train: ['lead', '訓練を任せる武将'] };
    if (simple[cmd]) {
      const gi = await App.pickActor(c, simple[cmd][0], simple[cmd][1]);
      if (gi == null) return App.openCity(c.i);
      const g = G.gens[gi];
      const r = Game.doCommand(cmd, g, c);
      if (r.ok) g.acted = true;
      Sound.se(r.ok ? ({ farm: 'farm', comm: 'coin', wall: 'build', alms: 'alms', draft: 'draft', train: 'train' }[cmd] || 'ok') : 'ng');
      if (r.ok && r.grade === 'great') setTimeout(() => Sound.se('great'), 380);
      await UI.talk(g, r.ok ? r.expr : 'sad', `${g.name}「${r.ok ? (r.say || line(g, r.grade && r.grade !== 'normal' ? cmd + '_' + r.grade : cmd)) : line(g, 'fail')}」\n<b>${r.msg}</b>`);
      App.refresh(); return App.openCity(c.i);
    }
    switch (cmd) {
      case 'auto': return App.autoDomestic(c);
      case 'attack': return App.sortie(c);
      case 'transport': return App.transport(c);
      case 'search': {
        const gi = await App.pickActor(c, 'cha', '探索に出す武将');
        if (gi == null) return App.openCity(c.i);
        const g = G.gens[gi]; g.acted = true;
        const r = Game.doCommand('search', g, c);
        if (r.found) {
          r.found.known = true;
          await UI.talk(g, 'happy', `${g.name}「殿、${r.found.name}という人物を見つけました」`);
          if (await UI.confirm(`${r.found.name}を登用しますか？（使者：${g.name}）`)) await App.doRecruit(g, r.found);
        } else await UI.talk(g, r.expr, `${g.name}「${r.ok ? (r.say || line(g, 'search')) : line(g, 'fail')}」\n<b>${r.msg}</b>`);
        App.refresh(); return App.openCity(c.i);
      }
      case 'recruit': {
        const ronin = Game.roninIn(c.i).filter(g => g.known);
        if (!ronin.length) { await UI.alert('この都市で見つかっている在野の人物はいない。まず「探索」で探そう。'); return App.openCity(c.i); }
        const ti = await UI.pickGenerals('誰を登用する？', ronin, { stat: 'lead' });
        if (ti == null) return App.openCity(c.i);
        const gi = await App.pickActor(c, 'cha', `${G.gens[ti].name}への使者`);
        if (gi == null) return App.openCity(c.i);
        G.gens[gi].acted = true;
        await App.doRecruit(G.gens[gi], G.gens[ti]);
        App.refresh(); return App.openCity(c.i);
      }
      case 'move': {
        const list = Game.gensIn(c.i, G.player);
        const sel = await UI.pickGenerals('移動させる武将（複数可）', list, { multi: true, max: 10, disabled: g => g.acted, disabledMsg: 'もう行動した' });
        if (!sel) return App.openCity(c.i);
        const cands = Game.citiesOf(G.player).map(x => x.i).filter(i => i !== c.i);
        if (!cands.length) { UI.toast('ほかに自分の都市がない'); return App.openCity(c.i); }
        const to = await App.pickCity('移動先の都市を選ぶ', cands);
        if (to == null) return App.openCity(c.i);
        sel.forEach(gi => Game.move(G.gens[gi], to));
        UI.toast(`${sel.length}人が${G.cities[to].name}へ移動した`);
        App.refresh(); return App.openCity(to);
      }
      case 'study': {
        const gi = await App.pickActor(c, 'war', '修行する武将', 'その武将の行動を1回使って、能力を1つ伸ばす。低い能力ほど大きく伸び、高い能力ほど伸びにくい（99が上限）');
        if (gi == null) return App.openCity(c.i);
        const g = G.gens[gi];
        const K = { lead: ['統率', '兵法書と陣形の稽古'], war: ['武力', '武芸の稽古'], int: ['知力', '書物を読みふける'], pol: ['政治', '政務と法を学ぶ'], cha: ['魅力', '人々と語らい、礼を学ぶ'] };
        const k = await UI.choose(`${g.name}の修行`, Object.entries(K).map(([key, [nm, how]]) => ({ label: `${nm} ${g[key]}`, sub: `${how}　見込み ${Game.studyHint(g[key])}`, value: key, disabled: g[key] >= 99 })));
        if (k == null) return App.openCity(c.i);
        const before = g[k], gain = Game.study(g, k);
        g.acted = true;
        Sound.se(gain ? 'train' : 'ng'); if (gain >= 3) setTimeout(() => Sound.se('great'), 380);
        const say = !gain ? line(g, 'study_fail') : gain >= 3 && Math.random() < 0.35 ? line(g, 'study_big') : before < 60 && Math.random() < 0.5 ? line(g, 'study_low_' + k) : line(g, 'study_' + k);
        await UI.talk(g, gain ? 'happy' : 'normal', `${g.name}「${say}」\n<b>${K[k][0]} ${before} → ${g[k]}${gain ? `（+${gain}）` : '（変わらず）'}</b>`);
        App.refresh(); return App.openCity(c.i);
      }
      case 'reward': {
        const list = Game.gensIn(c.i, G.player).filter(g => !g.isLord);
        const gi = await UI.pickGenerals('褒美を与える武将', list, { stat: 'loyalty', keys: ['loyalty', 'lead', 'war', 'int'] });
        if (gi == null) return App.openCity(c.i);
        const g = G.gens[gi], r = Game.reward(g, c);
        Sound.se(r.ok ? 'ok' : 'ng');
        await UI.talk(g, r.expr, `${g.name}「${r.ok ? line(g, 'reward') : '……'}」\n<b>${r.msg}</b>`);
        App.refresh(); return App.openCity(c.i);
      }
      case 'sow': case 'lure': case 'rumor': {
        const targets = G.cities.filter(x => x.owner !== null && x.owner !== G.player && !Game.isAlly(G.player, x.owner) && (cmd === 'rumor' || Game.gensIn(x.i).length)).map(x => x.i);
        const to = await App.pickCity('計略をかける敵の都市を選ぶ', targets);
        if (to == null) return App.openCity(c.i);
        return App.foreign(cmd, G.cities[to], c);
      }
      case 'ally': case 'surr': {
        const facs = G.factions.filter(f => f.alive && f.i !== G.player);
        // 降伏勧告は、いちばん魅力の高い使者を立てた場合の見込みを添える
        const envoy = Game.gensOf(G.player).filter(g => !g.acted).sort((a, b) => b.cha - a.cha)[0] || Game.lordOf(G.player);
        const hint = f => cmd === 'surr' ? '　' + Game.surrenderHint(Game.surrenderOdds(envoy, f.i).p) + (Game.surrenderOdds(envoy, f.i).touching ? '' : '（国境を接していない）') : '';
        const fi = await UI.choose(cmd === 'ally' ? '同盟を申し込む相手' : '降伏を勧める相手', facs.map(f => ({ label: `<span style="color:${f.color}">■</span> ${f.name}軍`, sub: `都市${Game.citiesOf(f.i).length}　兵${fmt(Game.power(f.i))}${Game.isAlly(G.player, f.i) ? '　同盟中' : ''}${hint(f)}`, value: f.i, disabled: cmd === 'ally' && Game.isAlly(G.player, f.i) })));
        if (fi == null) return App.openCity(c.i);
        return App.diplo(cmd, fi, c);
      }
    }
  },

  async doRecruit(g, t) {
    const r = Game.tryRecruit(g, t, false);
    if (r.special) {
      const msg = { kongming0: `${t.name}は留守だった……。\n（君主自らが訪ねる必要がありそうだ）`, kongming1: `${t.name}は昼寝をしていて会えなかった……。\nまた来よう。`, kongming2: `雪の中を訪ねたが、${t.name}は外出していた……。\n次こそは。` }[r.special];
      await UI.talk(g, 'sad', msg, undefined, { tag: '三顧の礼' });
      return;
    }
    if (r.ok) { Sound.se('join'); await UI.talk(t, 'happy', `${t.name}「${line(t, 'join')}」\n<b>${t.name}が仲間になった！</b>`, facColor(t)); Game.log(`${t.name}が${G.factions[G.player].name}軍に加わった。`); }
    else { Sound.se('ng'); await UI.talk(t, 'normal', `${t.name}「${line(t, 'refuse')}」\n<b>登用に失敗した</b>`, '#6a5a4a'); }
  },

  async autoDomestic(c) {
    const gens = Game.gensIn(c.i, G.player).filter(g => !g.acted);
    if (!gens.length) { UI.toast('待機中の武将がいない'); return; }
    const done = [];
    gens.forEach(g => {
      let cmd;
      if (c.loyal < 40 && c.food - 1500 > Game.foodReserve(c)) cmd = 'alms';
      else if (g.pol >= g.lead && c.farm < c.farmMax - 2 && (c.farm / c.farmMax <= c.comm / c.commMax || c.comm >= c.commMax - 2)) cmd = 'farm';
      else if (g.pol >= g.lead && c.comm < c.commMax - 2) cmd = 'comm';
      else if (c.train < 90 && c.troops > 2000) cmd = 'train';
      else if (c.def < c.defMax - 2) cmd = 'wall';
      else if (c.farm < c.farmMax - 2) cmd = 'farm';
      else if (c.comm < c.commMax - 2) cmd = 'comm';
      else if (c.loyal < 90 && c.food - 1500 > Game.foodReserve(c)) cmd = 'alms';
      else return;
      const r = Game.doCommand(cmd, g, c);
      if (r.ok) { g.acted = true; done.push(`${g.name}：${r.msg}`); }
    });
    Sound.se('ok');
    await UI.alert(done.length ? done.join('<br>') : '金や兵糧が足りず、何もできなかった', '一括内政');
    App.refresh(); App.openCity(c.i);
  },

  async transport(c) {
    const cands = c.adj.filter(a => G.cities[a].owner === G.player);
    if (!cands.length) { UI.toast('隣に自分の都市がない'); return; }
    const to = await App.pickCity('輸送先（隣の自都市）を選ぶ', cands);
    if (to == null) return App.openCity(c.i);
    const gold = await UI.number('送る金', 0, Math.floor(c.gold / 10) * 10, 0, 10);
    if (gold == null) return App.openCity(c.i);
    const food = await UI.number('送る兵糧', 0, Math.floor(c.food / 100) * 100, 0, 100);
    if (food == null) return App.openCity(c.i);
    const tr = await UI.number('送る兵', 0, Math.floor(c.troops / 100) * 100, 0, 100);
    if (tr == null) return App.openCity(c.i);
    Game.transport(c, G.cities[to], gold, food, tr);
    UI.toast(`${G.cities[to].name}へ 金${gold}・兵糧${food}・兵${tr} を送った`);
    App.refresh(); App.openCity(to);
  },

  // ---------------- 他勢力の都市への命令 ----------------
  async foreign(x, tc, fromCity) {
    if (x === 'attack') {
      const cands = tc.adj.filter(a => G.cities[a].owner === G.player);
      const from = cands.length === 1 ? cands[0] : await App.pickCity('出陣する自都市を選ぶ', cands);
      if (from == null) return;
      return App.sortie(G.cities[from], tc.i);
    }
    if (x === 'ally' || x === 'surr') {
      const c = fromCity || G.cities[G.factions[G.player].capital];
      return App.diplo(x === 'ally' ? 'ally' : 'surr', tc.owner, null);
    }
    // 計略：自軍の誰が行うか（どの都市の武将でもよい）
    const all = Game.gensOf(G.player);
    const gi = await UI.pickGenerals({ sow: '離間を行う武将', lure: '引き抜きを行う武将', rumor: '流言を行う武将' }[x], all, { stat: x === 'lure' ? 'cha' : 'int', disabled: g => g.acted, disabledMsg: 'もう行動した', extra: g => G.cities[g.city].name });
    if (gi == null) return;
    const g = G.gens[gi], home = G.cities[g.city];
    if (x === 'rumor') {
      if (home.gold < 100) return UI.alert(`${home.name}の金が足りない（100必要）`);
      home.gold -= 100; g.acted = true;
      const r = Game.plotRumor(g, tc);
      Sound.se(r.ok ? 'ok' : 'ng');
      await UI.talk(g, r.ok ? 'happy' : 'sad', `${g.name}「${r.ok ? line(g, 'success') : line(g, 'fail')}」\n<b>${r.msg}</b>`);
      App.refresh(); return;
    }
    const tgts = Game.gensIn(tc.i).filter(t => !t.isLord);
    if (!tgts.length) return UI.alert('狙える武将がいない（君主には効かない）');
    const ti = await UI.pickGenerals('誰を狙う？', tgts, { stat: 'loyalty', keys: ['loyalty', 'int', 'lead', 'war'] });
    if (ti == null) return;
    const t = G.gens[ti];
    let gold = 0;
    if (x === 'lure') {
      gold = await UI.number('贈る金（多いほど成功しやすい）', 0, Math.min(1000, Math.floor(home.gold / 50) * 50), Math.min(300, Math.floor(home.gold / 50) * 50), 50);
      if (gold == null) return;
      home.gold -= gold;
    } else { if (home.gold < 50) return UI.alert(`${home.name}の金が足りない（50必要）`); home.gold -= 50; }
    g.acted = true;
    const r = x === 'sow' ? Game.plotSow(g, t) : Game.plotLure(g, t, gold);
    Sound.se(r.ok ? 'ok' : 'ng');
    if (r.immune) {
      const sp = SPECIAL_LINES[t.name] && SPECIAL_LINES[t.name].immune;
      await UI.talk(t, 'angry', sp || `${t.name}「${line(t, 'refuse')}」`, facColor(t), { tag: '忠義' });
    } else if (x === 'lure' && r.ok) {
      await UI.talk(t, 'happy', `${t.name}「${line(t, 'join')}」\n<b>${r.msg}</b>`, facColor(t));
      Game.log(`${t.name}が${G.factions[G.player].name}軍に寝返った。`);
    } else {
      await UI.talk(r.ok ? t : g, r.ok ? (Game.has(t, '野心') ? 'angry' : 'sad') : 'sad', r.ok ? `${t.name}「${line(t, 'sown')}」\n<b>${r.msg}</b>${Game.has(t, '野心') ? '（野心家には効果てきめん）' : ''}` : `${g.name}「${line(g, 'fail')}」\n<b>${r.msg}</b>`, r.ok ? facColor(t) : undefined);
    }
    App.refresh();
  },

  async diplo(kind, fi, c) {
    const all = Game.gensOf(G.player);
    const gi = await UI.pickGenerals('使者に立てる武将', all, { stat: 'cha', disabled: g => g.acted, disabledMsg: 'もう行動した', extra: g => G.cities[g.city].name });
    if (gi == null) return;
    const g = G.gens[gi];
    g.acted = true;
    const r = kind === 'ally' ? Game.diploAlly(g, fi) : Game.diploSurrender(g, fi);
    Sound.se(r.ok ? 'win' : 'ng');
    const tl = Game.lordOf(fi);
    await UI.talk(tl, r.ok ? 'happy' : 'angry', `${r.msg}`, G.factions[fi].color);
    if (r.ok) Game.log(r.msg);
    App.refresh();
    await App.milestones();
    if (Game.checkEnd() === 'win') return App.finish('win');
  },

  // ---------------- 出陣 ----------------
  async sortie(c, targetCi) {
    if (targetCi == null) {
      const cands = c.adj.filter(a => G.cities[a].owner !== G.player && (G.cities[a].owner === null || !Game.isAlly(G.player, G.cities[a].owner)));
      if (!cands.length) { UI.toast('攻められる隣の都市がない'); return; }
      targetCi = await App.pickCity('攻める都市を選ぶ', cands);
      if (targetCi == null) return App.openCity(c.i);
    }
    const t = G.cities[targetCi];
    const list = Game.gensIn(c.i, G.player);
    const sel = await UI.pickGenerals(`${t.name}へ出陣する武将（最大5人。最初に選んだ者が総大将）`, list, { multi: true, max: 5, stat: 'lead', disabled: g => g.acted, disabledMsg: 'この季節はもう行動した', note: `${t.name}：兵${fmt(t.troops)}　武将${Game.gensIn(t.i).length}人　城壁${t.def}` });
    if (!sel) return App.openCity(c.i);
    const cap = sel.reduce((s, gi) => s + Game.troopCap(G.gens[gi]), 0);
    const maxT = Math.min(c.troops, cap);
    if (maxT < 500) return UI.alert('兵が足りない（500以上必要）');
    let maxEnemy = 0;
    c.adj.forEach(a => { const o = G.cities[a]; if (a !== t.i && o.owner !== null && o.owner !== G.player && !Game.isAlly(G.player, o.owner)) maxEnemy = Math.max(maxEnemy, o.troops); });
    const keep = Math.round(Math.max(Game.isFront(c) ? 4000 : 2000, c.troops * 0.3, maxEnemy * 0.7) / 100) * 100;
    const suggest = Math.max(500, Math.min(Math.floor(maxT / 100) * 100, Math.floor((c.troops - keep) / 100) * 100));
    const troops = await UI.number(`率いる兵（上限 ${fmt(cap)}）<br><small style="font-weight:500">${c.name}の守りに ${fmt(keep)} ほど残すのがおすすめ（初期値はその分を残した数）</small>`, 500, Math.floor(maxT / 100) * 100, suggest, 100);
    if (troops == null) return App.openCity(c.i);
    const needFood = Math.round(troops * 0.03 * 30);
    const food = Math.min(c.food, needFood);
    if (food < troops * 0.03 * 8) return UI.alert(`兵糧が足りない（最低 ${fmt(troops * 0.03 * 8)} 必要）`);
    const how = await UI.choose('戦い方', [{ label: '自ら指揮する', sub: '戦場で部隊を動かす', value: 'manual', cls: 'primary' }, { label: '軍師に任せて観戦', sub: `軍師 ${Auto.strategist() ? Auto.strategist().name : ''} の采配を戦場で見る`, value: 'watch' }, { label: '委任する', sub: '結果だけを見る', value: 'auto' }]);
    if (!how) return App.openCity(c.i);
    UI.closeSheet();
    const cmdr = G.gens[sel[0]];
    Sound.se('march');
    await UI.talk(cmdr, 'angry', `${cmdr.name}「${line(cmdr, 'sortie')}」`, facColor(cmdr), { tag: '出陣' });
    sel.forEach(gi => G.gens[gi].acted = true);
    const plan = { atkFi: G.player, from: c.i, to: t.i, gens: sel, troops, food };
    await App.executeBattle(plan, how === 'manual' ? true : how === 'watch' ? 'watch' : false);
  },

  // 戦いを実行して結果を反映
  async executeBattle(plan, manual) {
    const from = G.cities[plan.from], to = G.cities[plan.to];
    const atkF = G.factions[plan.atkFi];
    await MapView.march(plan.from, plan.to, atkF.color);
    from.troops -= plan.troops; from.food -= plan.food;
    const playerInvolved = plan.atkFi === G.player || to.owner === G.player;
    let res;
    if (playerInvolved && manual) {
      res = await Battle.start(plan, { watch: manual === 'watch' });
      UI.show('main'); Sound.bgm('map');
    } else {
      res = AI.autoBattle(plan);
    }
    return App.applyBattle(plan, res, playerInvolved);
  },

  async applyBattle(plan, res, show) {
    const from = G.cities[plan.from], to = G.cities[plan.to];
    const atkFi = plan.atkFi, defFi = to.owner;
    // 合戦中に寝返った武将は、寝返った先の勢力に移る
    (res.turncoats || []).forEach(t => { const g = G.gens[t.gi]; if (g.state !== 'serve' || !G.factions[t.fi] || !G.factions[t.fi].alive) return; g.faction = t.fi; g.isLord = false; g.loyalty = irnd(55, 75); g.city = G.factions[t.fi].capital; Game.log(`${g.name}が戦場で寝返り、${G.factions[t.fi].name}軍に加わった。`); });
    const atkGens = plan.gens.map(i => G.gens[i]).filter(g => g.state === 'serve' && g.faction === atkFi);
    const pAtk = atkFi === G.player, pDef = defFi === G.player;
    const playerWon = (pAtk && res.atkWin) || (pDef && !res.atkWin);
    if (pAtk || pDef) { G.stats.battles++; if (playerWon) G.stats.wins++; }
    const msgs = [];
    // 討死
    const deaths = [];
    res.killed.forEach(gi => { const g = G.gens[gi]; if (g.state === 'serve') { deaths.push(g); } });
    let caps = [...new Set(res.captured)].filter(gi => G.gens[gi].state === 'serve' && !res.killed.includes(gi));
    if (res.atkWin) {
      to.owner = atkFi; to.troops = Math.max(100, res.atkLeft); to.loyal = Math.max(10, to.loyal - 12); to.train = from.train;
      to.food = Math.round(to.food * 0.5) + Math.round(plan.food * 0.4); to.gold = Math.round(to.gold * 0.6);
      atkGens.forEach(g => { if (!caps.includes(g.i) && !deaths.includes(g)) { g.city = to.i; if (pAtk) g.wins++; } });
      if (defFi !== null) {
        const df = G.factions[defFi];
        const remain = Game.citiesOf(defFi);
        G.gens.filter(g => g.state === 'serve' && g.faction === defFi && g.city === to.i && !caps.includes(g.i) && !deaths.includes(g)).forEach(g => {
          const esc = to.adj.find(a => G.cities[a].owner === defFi) ?? (remain[0] ? remain[0].i : null);
          if (esc != null && Math.random() < 0.8) g.city = esc; else caps.push(g.i);
        });
        if (df.capital === to.i && remain.length) { const lord = Game.lordOf(defFi); df.capital = G.cities[lord.city].owner === defFi ? lord.city : remain[0].i; }
      }
      Game.log(`${G.factions[atkFi].name}軍が${to.name}を攻め落とした。`);
    } else {
      to.troops = Math.max(0, res.defLeft);
      from.troops += res.atkLeft;
      if (pDef) Game.gensIn(to.i, G.player).forEach(g => g.wins++);
      Game.log(`${to.name}の${defFi === null ? '守備隊' : G.factions[defFi].name + '軍'}が${G.factions[atkFi].name}軍を退けた。`);
    }
    // 結果表示
    if (show) {
      const atkName = G.factions[atkFi].name, defName = defFi === null ? '守備隊' : G.factions[defFi].name;
      const hero = (playerWon ? (pAtk ? atkGens[0] : Game.gensIn(to.i, G.player)[0]) : null) || Game.lordOf(G.player);
      await UI.modal({ title: playerWon ? '勝利' : '敗北', body: `
        <div style="text-align:center;font-family:var(--brush);font-size:30px;color:${playerWon ? 'var(--red)' : '#555'}">${playerWon ? '勝 利' : '敗 北'}</div>
        <p style="text-align:center">${to.name}の戦い：${res.reason || (res.atkWin ? '攻め手の勝利' : '守り手の勝利')}</p>
        <p>攻 ${atkName}軍　残兵 ${fmt(res.atkLeft)}<br>守 ${defName}　残兵 ${fmt(res.defLeft)}</p>
        ${res.atkWin ? `<p><b>${to.name}は${atkName}軍のものとなった。</b></p>` : ''}
        ${deaths.length ? `<p>討死：${deaths.map(g => g.name).join('、')}</p>` : ''}
        ${caps.length ? `<p>捕虜：${caps.map(i => G.gens[i].name).join('、')}</p>` : ''}`, buttons: [{ label: '次へ', cls: 'primary', value: 1 }], auto: 1 });
      if (Auto.running && Auto.strategist()) await Auto.say(playerWon ? 'win' : 'lose', {}, playerWon ? 'happy' : 'sad');
      if (playerWon && hero) await UI.talk(hero, 'happy', `${hero.name}「${line(hero, 'victory')}」`);
      if (!playerWon && pAtk) { const lg = atkGens.find(g => g.state === 'serve' && !caps.includes(g.i) && !deaths.includes(g)); if (lg) await UI.talk(lg, 'sad', `${lg.name}「${line(lg, 'defeat')}」`); }
    }
    // 討死の処理
    for (const g of deaths) {
      const fi = g.faction, wasLord = g.isLord;
      const heir = Game.killGeneral(g, '戦死');
      Game.log(`${g.name}、${to.name}にて討死。`);
      if (show || fi === G.player) await UI.talk(g, 'sad', `${g.name}「${line(g, 'defeat')}」\n<b>${g.name}、討死――</b>${wasLord ? (heir ? `\n${heir.name}が跡を継いだ。${Game.succNote(heir)}` : `\n${G.factions[fi].name}軍は後継ぎなく滅んだ。`) : ''}`, G.factions[fi].color);
    }
    // 捕虜
    for (const gi of caps) {
      const g = G.gens[gi];
      if (g.state !== 'serve') continue;
      const captor = g.faction === atkFi ? defFi : atkFi;
      if (captor === null) { // 空白地の守備隊に負けた：逃げ帰る
        continue;
      }
      await App.handleCaptive(g, captor, to);
    }
    // 滅亡の判定
    G.factions.forEach(f => {
      if (!f.alive) return;
      if (Game.citiesOf(f.i).length === 0) {
        Game.gensOf(f.i).forEach(g => { g.state = 'ronin'; g.isLord = false; g.faction = -1; });
        Game.killFaction(f.i);
      } else if (G.cities[f.capital].owner !== f.i) {
        const lord = Game.lordOf(f.i);
        f.capital = lord && G.cities[lord.city].owner === f.i ? lord.city : Game.citiesOf(f.i)[0].i;
      }
      // 君主が他勢力の都市にいる（取り残された）場合は本拠へ
      const lord = Game.lordOf(f.i);
      if (f.alive && lord && lord.state === 'serve' && G.cities[lord.city].owner !== f.i) lord.city = f.capital;
    });
    // 自勢力の武将で、他勢力の都市に取り残された者は本拠へ
    G.gens.forEach(g => { if (g.state === 'serve' && G.factions[g.faction].alive && G.cities[g.city].owner !== g.faction) g.city = G.factions[g.faction].capital; });
    App.refresh();
    await App.milestones();
    const end = Game.checkEnd();
    if (end) { await App.finish(end); return 'end'; }
  },

  // 節目の言葉：天下統一まで敵の都市が残り1つ（労い）／5都市以上に広げたあと残り1都市に追い込まれた（励まし）
  // 軍師と、功績（戦功＋一騎討ちの勝ち）がいちばん多い武将が声をかける。それぞれ1回まで（立て直して3都市に戻れば、また励ます）
  async milestones() {
    if (!G || G.gameOver || !G.factions[G.player].alive) return;
    const ms = G.events.ms = G.events.ms || {};
    const mine = Game.citiesOf(G.player).length;
    G.events.maxCities = Math.max(G.events.maxCities || 0, mine);
    if (mine >= 3) ms.cornered = false;
    const foeCities = G.cities.filter(c => c.owner !== null && c.owner !== G.player);
    let kind = null;
    if (foeCities.length === 1 && !ms.final) { ms.final = true; kind = 'final'; }
    else if (mine === 1 && G.events.maxCities >= 5 && !ms.cornered) { ms.cornered = true; kind = 'corner'; }
    if (!kind) return;
    const sg = Auto.strategist();
    const merit = g => g.wins + g.duels;
    const hero = Game.gensOf(G.player).filter(g => !g.isLord && g !== sg).sort((a, b) => merit(b) - merit(a) || (b.lead + b.war) - (a.lead + a.war))[0];
    const foe = foeCities[0] ? G.factions[foeCities[0].owner].name + '軍' : '';
    const ctx = { foe, city: foeCities[0] ? foeCities[0].name : '' };
    const fill = t => t.replace(/\{city\}/g, ctx.city);
    Sound.se(kind === 'final' ? 'bell' : 'horn');
    if (sg) await UI.talk(sg, kind === 'final' ? 'happy' : 'normal', `軍師 ${sg.name}「${fill(line(sg, kind + 'Sg', ctx))}」`, facColor(sg), { tag: kind === 'final' ? '天下統一目前' : '再起を誓う' });
    if (hero) await UI.talk(hero, kind === 'final' ? 'happy' : 'angry', `${hero.name}「${fill(line(hero, kind + 'Hero', ctx))}」${merit(hero) ? `\n<small>戦功 ${hero.wins}・一騎討ち ${hero.duels}勝</small>` : ''}`, facColor(hero), { tag: kind === 'final' ? '功臣の言葉' : '忠臣の言葉' });
  },

  async handleCaptive(g, captor, city) {
    const ownerAlive = g.faction >= 0 && G.factions[g.faction].alive && Game.citiesOf(g.faction).length > 0;
    const release = () => {
      if (ownerAlive) { g.city = G.factions[g.faction].capital; }
      else { g.state = 'ronin'; g.isLord = false; g.faction = -1; g.city = city.i; }
    };
    if (captor === G.player) {
      G.stats.captured++;
      const lordCaptive = g.isLord && ownerAlive;
      await UI.talk(g, Game.has(g, '臆病') ? 'shock' : 'angry', `${g.name}を捕らえた。\n${g.name}「${line(g, 'captured')}」`, facColor(g), { tag: '捕虜' });
      const act = Auto.running ? await Auto.decideCaptive(g, lordCaptive) : await UI.choose(`${g.name}をどうする？`, [
        { label: '登用する', sub: lordCaptive ? '敵の君主は登用できない' : '配下に誘う', value: 'rec', disabled: lordCaptive, cls: 'primary' },
        { label: '解放する', sub: ownerAlive ? '元の主のもとへ帰す' : '野に放つ', value: 'rel' },
        { label: '処断する', sub: '命を絶つ（武将の忠誠が少し下がることも）', value: 'kill' },
      ], false);
      if (act === 'rec') {
        const lord = Game.lordOf(G.player);
        const r = Game.tryRecruit(lord, g, true);
        if (r.ok) { g.city = city.owner === G.player ? city.i : G.factions[G.player].capital; Sound.se('join'); await UI.talk(g, 'happy', `${g.name}「${line(g, 'join')}」\n<b>${g.name}が配下に加わった！</b>`); }
        else { Sound.se('ng'); await UI.talk(g, 'angry', `${g.name}「${line(g, 'refuse')}」\n<b>登用を拒まれた。${g.name}は去っていった</b>`, '#6a5a4a'); release(); }
      } else if (act === 'kill') {
        await UI.talk(g, 'sad', `${g.name}「${line(g, 'execute')}」`, facColor(g), { tag: '処断' });
        const fi = g.faction, wasLord = g.isLord;
        const heir = Game.killGeneral(g, '処断');
        Game.log(`${g.name}、処断される。`);
        Game.gensOf(G.player).forEach(h => { if (Game.has(h, '仁徳') && !h.isLord) h.loyalty = Math.max(0, h.loyalty - 5); });
        if (wasLord) await UI.alert(heir ? `${heir.name}が跡を継いだ。${Game.succNote(heir)}` : `${g.name}の勢力は滅んだ。`);
      } else { await UI.talk(g, 'normal', `${g.name}「${line(g, 'release')}」`, facColor(g)); release(); }
      return;
    }
    // AI が捕らえた場合
    const mine = g.faction === G.player;
    let outcome;
    if (g.isLord) outcome = Math.random() < 0.4 ? 'kill' : 'rel';
    else {
      let p = (100 - g.loyalty) / 100 * 0.7 + (ownerAlive ? 0 : 0.4);
      if (Game.has(g, '忠義') && ownerAlive) p = 0.03;
      outcome = Math.random() < p ? 'rec' : (Game.has(Game.lordOf(captor), '野心') && Math.random() < 0.25 ? 'kill' : 'rel');
    }
    if (outcome === 'rec') { Game.joinFaction(g, captor, G.factions[captor].capital); Game.log(`${g.name}が${G.factions[captor].name}軍に降った。`); }
    else if (outcome === 'kill') { const fi = g.faction; const heir = Game.killGeneral(g, '処断'); Game.log(`${g.name}、${G.factions[captor].name}軍に処断される。`); if (fi === G.player && !heir && !G.factions[G.player].alive) return; }
    else release();
    if (mine) await UI.talk(g, outcome === 'rel' ? 'sad' : outcome === 'rec' ? 'normal' : 'sad', `${g.name}は${G.factions[captor].name}軍に捕らえられ、${outcome === 'rec' ? '降伏して敵に仕えることになった……' : outcome === 'kill' ? '処断された……' : '解放されて戻ってきた'}`, '#6a5a4a');
  },

  // ---------------- 季節を進める ----------------
  async endTurn(fromAuto) {
    if (App.busy && !fromAuto) return;
    const idle = Game.gensOf(G.player).filter(g => !g.acted).length;
    if (!fromAuto && idle > 0 && !(await UI.confirm(`まだ ${idle}人 の武将が待機中です。季節を進めますか？`))) return;
    App.busy = true; UI.closeSheet();
    try {
      // 委任都市
      G.cities.filter(c => c.owner === G.player && c.delegate).forEach(c => AI.develop(c, G.player));
      // 他勢力の行動
      const order = shuffle(G.factions.filter(f => f.alive && f.i !== G.player).map(f => f.i));
      $('#mapHint').textContent = '他勢力が動いている…'; $('#mapHint').classList.add('show');
      for (const fi of order) {
        if (!G.factions[fi].alive) continue;
        const f = G.factions[fi];
        // 同盟の申し入れ
        const adj = Game.citiesOf(fi).some(c => c.adj.some(a => G.cities[a].owner === G.player));
        if (adj && !Game.isAlly(fi, G.player) && Math.random() < 0.04 && Game.power(fi) < Game.power(G.player) * 1.3) {
          $('#mapHint').classList.remove('show');
          await UI.talk(Game.lordOf(fi), 'normal', `${f.name}軍から使者が来た。\n「我が主は貴軍との同盟を望んでおります」`, f.color, { tag: '外交' });
          if (Auto.running ? await Auto.decideAlly(fi) : await UI.confirm(`${f.name}軍と同盟を結びますか？（${CONFIG.ALLY_TURNS / 4}年）`)) { f.allies[G.player] = CONFIG.ALLY_TURNS; G.factions[G.player].allies[fi] = CONFIG.ALLY_TURNS; Game.log(`${f.name}軍と同盟を結んだ。`); Sound.se('ally'); }
          $('#mapHint').classList.add('show');
        }
        const before = Game.gensOf(G.player).length;
        const battles = AI.runFaction(fi);
        if (Game.gensOf(G.player).length < before && AI._lastLure && AI._lastLure.fi === fi) {
          const t = G.gens[AI._lastLure.t];
          $('#mapHint').classList.remove('show');
          await UI.talk(t, 'angry', `${t.name}「${line(t, 'betray')}」\n<b>${t.name}が${f.name}軍に寝返った！</b>`, f.color, { tag: '寝返り' });
          $('#mapHint').classList.add('show');
        }
        AI._lastLure = null;
        for (const b of battles) {
          const from = G.cities[b.from], to = G.cities[b.to];
          if (from.owner !== fi || to.owner === fi || (to.owner !== null && Game.isAlly(fi, to.owner))) continue;
          b.gens = b.gens.filter(i => G.gens[i].state === 'serve' && G.gens[i].faction === fi && G.gens[i].city === from.i);
          if (!b.gens.length || from.troops < b.troops) continue;
          let manual = false;
          if (to.owner === G.player) {
            $('#mapHint').classList.remove('show');
            MapView.centerOn(to.i);
            await MapView.march(b.from, b.to, f.color);
            const lead = G.gens[b.gens[0]];
            Sound.se('gong');
            await UI.talk(lead, 'angry', `${f.name}軍が${to.name}に攻めてきた！\n総大将 ${lead.name}、兵 ${fmt(b.troops)}`, f.color, { tag: '敵襲' });
            if (Game.gensIn(to.i, G.player).length) {
              const dg = Game.gensIn(to.i, G.player).sort((x, y) => (y.isLord ? 999 : 0) + y.lead - (x.isLord ? 999 : 0) - x.lead)[0];
              await UI.talk(dg, Game.has(dg, '臆病') ? 'shock' : 'angry', `${dg.name}「${line(dg, 'defend')}」`, facColor(dg));
              if (Auto.running) { await Auto.say('defend'); manual = 'watch'; }
              else {
                const how = await UI.choose(`${to.name}の防衛`, [{ label: '自ら指揮する', value: 'manual', cls: 'primary' }, { label: '軍師に任せて観戦', value: 'watch' }, { label: '委任する（結果だけ）', value: 'auto' }], false);
                manual = how === 'manual' ? true : how === 'watch' ? 'watch' : false;
              }
            }
          }
          const r = await App.executeBattle(b, manual);
          if (r === 'end') return;
          $('#mapHint').textContent = '他勢力が動いている…'; $('#mapHint').classList.add('show');
        }
      }
      $('#mapHint').classList.remove('show');
      // 季節の終わり
      const ev = Game.endSeason();
      for (const e of ev) {
        if (e.quiet) continue;
        const eg = e.gen != null ? G.gens[e.gen] : null;
        const ecol = eg ? (G.factions[eg.faction] ? G.factions[eg.faction].color : '#6a5a4a') : undefined;
        if (e.hist) { Sound.se(e.se || 'gong'); await UI.talk(eg, e.expr || 'normal', `<b>【${e.title}】</b>\n${e.msg}`, ecol, { tag: e.tag }); }
        else if (eg) { Sound.se(e.death ? 'death' : 'event'); await UI.talk(eg, e.expr || 'normal', e.line ? `${eg.name}「${e.line}」\n<b>${e.msg}</b>` : `<b>${e.msg}</b>`, ecol, e.tag ? { tag: e.tag } : {}); }
        else UI.toast(e.msg, 2600), await new Promise(r => setTimeout(r, 900));
      }
      await App.milestones();
      const end = Game.checkEnd();
      if (end) return App.finish(end);
      Game.save();
      App.refresh();
      UI.toast(`${G.year}年 ${SEASONS[G.season]}`);
      Sound.bgm('map'); Sound.se(G.season === 0 ? 'gong' : 'season');
    } finally { App.busy = false; $('#mapHint').classList.remove('show'); }
  },

  // ---------------- 各種一覧 ----------------
  nav(k) {
    if (App.busy) return;
    if (k === 'end') return App.endTurn();
    if (k === 'auto') return Auto.openMenu();
    if (k === 'cities') {
      const cs = Game.citiesOf(G.player);
      const el = UI.sheet(`<div class="city-hd"><h3>自軍の都市</h3><button class="x">×</button></div>` + cs.map(c => `
        <div class="list-item" data-c="${c.i}"><div class="li-body"><div class="li-name">${c.name}${G.factions[G.player].capital === c.i ? ' <small>本拠</small>' : ''}${c.delegate ? ' <small>委任</small>' : ''}</div>
        <div class="li-st"><span>兵<b>${fmt(c.troops)}</b></span><span>金<b>${fmt(c.gold)}</b></span><span>糧<b>${fmt(c.food)}</b></span><span>武将<b>${Game.gensIn(c.i, G.player).length}</b></span><span>待機<b class="hi">${Game.gensIn(c.i, G.player).filter(g => !g.acted).length}</b></span></div></div></div>`).join(''));
      $('.x', el).onclick = () => UI.closeSheet();
      $$('[data-c]', el).forEach(r => r.onclick = () => { MapView.centerOn(+r.dataset.c); App.openCity(+r.dataset.c); });
    }
    if (k === 'gens') return App.genList('lead');
    if (k === 'facs') {
      const fs = G.factions.filter(f => f.alive).sort((a, b) => Game.citiesOf(b.i).length - Game.citiesOf(a.i).length);
      const el = UI.sheet(`<div class="city-hd"><h3>勢力</h3><button class="x">×</button></div>` + fs.map(f => { const l = Game.lordOf(f.i); return `
        <div class="fac-row" data-f="${f.i}"><img src="${Portrait.get(l, 'normal', f.color)}"><div class="fr-body"><div class="fr-name"><i style="background:${f.color}"></i>${f.name}軍 ${f.i === G.player ? '<small>（自軍）</small>' : Game.isAlly(G.player, f.i) ? `<span class="ally">同盟 残り${G.factions[G.player].allies[f.i]}季</span>` : ''}</div>
        <div class="fr-st">都市 ${Game.citiesOf(f.i).length}　武将 ${Game.gensOf(f.i).length}　兵 ${fmt(Game.power(f.i))}</div></div></div>`; }).join(''));
      $('.x', el).onclick = () => UI.closeSheet();
      $$('[data-f]', el).forEach(r => r.onclick = () => { const f = G.factions[+r.dataset.f]; MapView.centerOn(f.capital); App.openCity(f.capital); });
    }
    if (k === 'log') {
      const el = UI.sheet(`<div class="city-hd"><h3>記録</h3><button class="x">×</button></div>` + (G.log.map(l => `<div class="logline"><small>${l.t}</small>${l.msg}</div>`).join('') || '<p>まだ何もない</p>'));
      $('.x', el).onclick = () => UI.closeSheet();
    }
  },
  genList(sortKey) {
    const list = Game.gensOf(G.player).sort((a, b) => b[sortKey] - a[sortKey]);
    const el = UI.sheet(`<div class="city-hd"><h3>配下の武将 ${list.length}人</h3><button class="x">×</button></div>
      <div class="sortbar">${Object.entries(STAT_NAME).map(([k, v]) => `<button data-s="${k}" class="${k === sortKey ? 'on' : ''}">${v}</button>`).join('')}</div>` +
      list.map(g => `<div class="list-item" data-g="${g.i}"><img src="${Portrait.get(g, 'normal', facColor(g))}"><div class="li-body"><div class="li-name">${g.name}${Game.titles(g).map(t => `<span class="tbadge">${t.name}</span>`).join('')}<small>${G.cities[g.city].name}${g.acted ? '・行動済' : ''}</small></div>
      <div class="li-st">${['lead', 'war', 'int', 'pol', 'cha', 'loyalty'].map(k => `<span>${STAT_NAME[k][0]}<b class="${k === sortKey ? 'hi' : ''}">${Math.round(g[k])}</b></span>`).join('')}</div>
      <div>${g.traits.map(t => `<span class="trait">${t}</span>`).join('')}</div></div></div>`).join(''));
    $('.x', el).onclick = () => UI.closeSheet();
    $$('[data-s]', el).forEach(b => b.onclick = () => App.genList(b.dataset.s));
    $$('[data-g]', el).forEach(r => r.onclick = () => App.profile(+r.dataset.g));
  },
  // 列伝
  async profile(gi) {
    const g = G.gens[gi];
    const col = facColor(g);
    const bonds = BONDS.filter(b => b.members.includes(g.name));
    const age = G.year - g.appear + 16;
    const body = `<div class="bio"><img id="bioImg" src="${Portrait.get(g, 'normal', col)}"><div class="bars"><h3>${g.name}</h3>
      ${['lead', 'war', 'int', 'pol', 'cha'].map(k => `<div class="sbar"><span>${STAT_NAME[k]}</span><div class="b"><i style="width:${g[k]}%"></i></div><b>${g[k]}</b></div>`).join('')}
      ${g.state === 'serve' ? `<div class="sbar"><span>忠誠</span><div class="b"><i style="width:${g.loyalty}%"></i></div><b>${Math.round(g.loyalty)}</b></div>` : ''}
      </div></div>
      <div class="exprs">${[['normal', '通常'], ['happy', '喜'], ['angry', '怒'], ['sad', '哀'], ['shock', '驚']].map(([e, n]) => `<button data-e="${e}">${n}</button>`).join('')}</div>
      <div style="font-size:13px;margin-top:8px;color:var(--muted)">${g.state === 'serve' ? `${G.factions[g.faction].name}軍　${G.cities[g.city].name}` : g.state === 'ronin' ? `在野　${G.cities[g.city].name}` : ''}　年齢 およそ${age}歳　戦功 ${g.wins}　一騎討ち勝利 ${g.duels}</div>
      ${Game.titles(g).map(t => `<div class="tr-desc"><span class="trait title">${t.name}</span>${STAT_NAME[t.k]}で天下${t.rank}位。${({ lead: '訓練・修築が大きく伸び、戦場で与える被害↑・受ける被害↓', war: '戦場の攻撃と一騎討ちが強い', int: '計略が成功しやすく、敵の計略を見破りやすい。外交↑', pol: '開墾・商業が大きく伸び、ときどき大成功', cha: '徴兵・施し・登用・外交が効きやすく、率いる軍の士気が高い' })[t.k]}。専用のイベントも起きる</div>`).join('')}
      ${g.traits.length ? g.traits.map(t => `<div class="tr-desc"><span class="trait">${t}</span>${TRAIT_INFO[t]}</div>`).join('') : '<div class="tr-desc">特筆すべき性格はない</div>'}
      ${bonds.map(b => `<div class="tr-desc"><span class="trait" style="background:var(--red)">絆</span>${b.name}（${b.members.join('・')}）同じ戦場で力が増す</div>`).join('')}`;
    const canChat = g.state === 'serve' && g.faction === G.player;
    const p = UI.modal({ title: '列伝', body, buttons: (canChat ? [{ label: '話を聞く', value: 'chat' }] : []).concat([{ label: '閉じる', cls: 'primary', value: 1 }]) });
    $$('#modal [data-e]').forEach(b => b.onclick = () => { $('#bioImg').src = Portrait.get(g, b.dataset.e, col); });
    const v = await p;
    if (v === 'chat') {
      const low = !g.isLord && g.loyalty < 50;
      const expr = low ? (Game.has(g, '野心') ? 'angry' : 'sad') : g.isLord ? 'normal' : pick(['normal', 'happy', 'normal']);
      await UI.talk(g, expr, `${g.name}「${line(g, low ? 'chatLow' : 'chat')}」`, col);
      return App.profile(gi);
    }
  },

  async menu() {
    const v = await UI.choose('メニュー', [
      { label: 'セーブ', sub: '季節の終わりにも自動で保存されます', value: 'save' },
      { label: 'ロード', value: 'load' },
      { label: Sound.muted ? '音を出す' : '音を消す', value: 'mute' },
      { label: `戦闘の速さ：${G.opts.aiSpeed >= 2 ? '速い' : '普通'}`, value: 'speed' },
      { label: '遊び方', value: 'howto' },
      { label: 'タイトルへ戻る', value: 'title', cls: 'danger' },
    ]);
    if (v === 'save') { Game.save() ? UI.toast('保存しました') : UI.toast('保存できませんでした'); }
    if (v === 'load') { if (Game.load()) { App.enterMain(); UI.toast('読み込みました'); } else UI.toast('セーブデータがありません'); }
    if (v === 'mute') { Sound.toggleMute(); UI.toast(Sound.muted ? '音を消しました' : '音を出します'); }
    if (v === 'speed') { G.opts.aiSpeed = G.opts.aiSpeed >= 2 ? 1 : 2; UI.toast('戦闘の速さを変えました'); }
    if (v === 'howto') App.howto();
    if (v === 'title') { if (await UI.confirm('タイトルへ戻りますか？（保存していない進行は失われます）')) App.title(); }
  },

  async finish(kind) {
    G.gameOver = true;
    if (Auto.running) Auto.stop(true);
    Game.clearSave();
    UI.closeSheet();
    UI.show('ending');
    await Cinema.ending($('#endcv'), $('#endRoll'), $('#ending .skip'), kind);
    App.title();
  },
};

window.addEventListener('load', () => App.init());
