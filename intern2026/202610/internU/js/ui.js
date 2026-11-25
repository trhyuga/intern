// ============================================================
//  画面と操作
// ============================================================
const UI = (() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const num = n => Math.round(n).toLocaleString();
  const bar = (v, max, col) => `<div class="mbar"><i style="width:${clamp(v / max * 100, 0, 100)}%;background:${col}"></i></div>`;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let current = null;

  function show(id) {
    $$('.screen').forEach(s => s.classList.toggle('show', s.id === id));
    current = id;
    if (id === 'main') { StarMap.start(); setTimeout(() => StarMap.resize(), 30); } else StarMap.stop();
  }
  function toast(msg, ms = 2200) {
    const t = $('#toast'); t.innerHTML = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
  }
  // 士官のひと言（手で命令した時の返事）：顔と名前つきの吹き出し
  function speak(k, text, expr = 'normal') {
    if (!k || !OFF[k] || !text) return;
    let el = document.getElementById('vbub');
    if (!el) { el = document.createElement('div'); el.id = 'vbub'; el.className = 'vbub'; document.getElementById('app').appendChild(el); el.onclick = () => el.classList.remove('show'); }
    const fac = G.officers[k] && typeof G.officers[k].fac === 'number' ? FACTIONS[G.officers[k].fac].col : '#8aa0c0';
    el.innerHTML = `<img src="${Portrait.url(k, expr)}" style="border-color:${fac}"><div><b>${OFF[k].name}</b><p>${text}</p></div>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(el._h); el._h = setTimeout(() => el.classList.remove('show'), 2600 + text.length * 45);
  }
  const answer = (kind, k, target, expr) => { if (k) speak(k, WarRoom.reply(kind, k, target), expr); };
  function busy(msg) {
    const b = $('#busy');
    if (msg) { b.textContent = msg; b.classList.add('show'); } else b.classList.remove('show');
  }
  // 汎用の窓
  function modal(html, buttons = [{ t: '閉じる', v: null }], opt = {}) {
    return new Promise(res => {
      const m = $('#modal');
      m.innerHTML = `<div class="m-box ${opt.cls || ''}"><div class="m-body">${html}</div><div class="m-btns">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}" ${b.disabled ? 'disabled' : ''}>${b.t}</button>`).join('')}</div></div>`;
      m.classList.add('show');
      m.querySelectorAll('.m-btns button').forEach(btn => btn.onclick = () => { Sound.se('click'); m.classList.remove('show'); res(buttons[+btn.dataset.i].v); });
      if (opt.onOpen) opt.onOpen(m);
    });
  }
  function confirm(text, yes) { modal(`<p>${text}</p>`, [{ t: 'やめる', v: false }, { t: 'はい', v: true, cls: 'primary' }]).then(v => { if (v) yes(); }); }

  // ---------- 下から出るシート ----------
  let sheetStack = [];
  function sheet(render, title) {
    const s = $('#sheet');
    sheetStack.push({ render, title });
    drawSheet();
    s.classList.add('show');
  }
  function drawSheet() {
    const s = $('#sheet');
    const top = sheetStack[sheetStack.length - 1];
    if (!top) return;
    $('.sh-title', s).textContent = top.title || '';
    $('.sh-back', s).style.visibility = sheetStack.length > 1 ? 'visible' : 'hidden';
    const body = $('.sh-body', s);
    const st = body.scrollTop;
    body.innerHTML = '';
    top.render(body);
    body.scrollTop = st;
  }
  function closeSheet() { sheetStack = []; $('#sheet').classList.remove('show'); refresh(); }
  function backSheet() { sheetStack.pop(); if (!sheetStack.length) closeSheet(); else { drawSheet(); } }
  function redraw() { if (sheetStack.length) drawSheet(); refreshTop(); }

  // ---------- 上の帯 ----------
  function refreshTop() {
    if (!G) return;
    const me = G.player, f = G.facs[me], F = FACTIONS[me], e = Game.economy(me);
    const rt = Game.researchTarget(f);
    $('#tbDate').textContent = Game.dateStr();
    $('#tbFac').innerHTML = `<span style="color:${F.col}">◆</span> ${F.name}`;
    $('#tbRes').innerHTML = `<span title="資金">💰 ${num(f.funds)} <small class="${e.inc - e.up >= 0 ? 'up' : 'down'}">${e.inc - e.up >= 0 ? '+' : ''}${e.inc - e.up}</small></span><span title="研究中：${rt.name}${rt.gain ? '（' + rt.gain + '）' : ''}">🔬 ${rt.short || rt.name} ${Math.min(100, Math.floor(f.rp / rt.cost * 100))}%</span>`;
    $('#btnStaff').classList.toggle('on', Staff.active());
    const ecl = $('#tbEcl');
    const st = Eclipse.status();
    ecl.textContent = st; ecl.style.display = st ? '' : 'none';
    ecl.onclick = () => { if (Turn.running) return; if (G.eclipse.arrived) { Sound.se('click'); openTab('gov'); } };
  }
  function refresh() { refreshTop(); quick(); }

  // ---------- 星図のタップ ----------
  function onMapTap(hit) {
    if (Turn.running) return;
    const mm = StarMap.moveMode;
    if (mm) {
      if (hit.planet !== undefined) {
        const pid = hit.planet;
        if (pid === mm.at) { mm.route = null; mm.dest = null; mm.mission = null; toast('待機させました'); }
        else if (!Game.canEnter(G.player, pid)) toast('その星には入れません（戦争中の相手か、独立惑星・味方の星だけ）');
        else if (!Game.path(mm.at, pid, n => Game.friendly(G.player, G.planets[n].owner))) toast('そこまでの道がありません（敵の星を通り抜けることはできません）');
        else {
          mm.route = pid; mm.dest = null; mm.mission = null;
          const h = Game.path(mm.at, pid, n => Game.friendly(G.player, G.planets[n].owner)).length - 1;
          toast(`${Game.fleetName(mm)} → ${G.planets[pid].name}（${h}か月ほど）`);
          Sound.se('order');
          answer(Game.friendly(G.player, G.planets[pid].owner) ? 'move' : 'attack', mm.cmd, G.planets[pid].name, Game.friendly(G.player, G.planets[pid].owner) ? 'normal' : 'angry');
        }
      } else toast('移動の指示をやめました');
      StarMap.moveMode = null;
      quick(); return;
    }
    if (hit.fleet) { StarMap.selFleet = hit.fleet; StarMap.selPlanet = hit.fleet.at; Sound.se('click'); quick(); return; }
    if (hit.planet !== undefined) { StarMap.selPlanet = hit.planet; StarMap.selFleet = null; Sound.se('click'); quick(); return; }
    StarMap.selPlanet = null; StarMap.selFleet = null; quick();
  }
  // 選んだものの小さなカード
  function quick() {
    const q = $('#quick'); if (!q || !G) return;
    if (Staff.active()) { q.classList.remove('show'); return; }
    const mm = StarMap.moveMode;
    if (mm) { q.innerHTML = `<div class="q-move">「${Game.fleetName(mm)}」の行き先の星をタップ<br><small>光っている星へ進めます（赤は攻撃）。同じ星で待機。</small><button class="btn small" data-q="cancel">やめる</button></div>`; q.classList.add('show'); bindQuick(); return; }
    const fl = StarMap.selFleet, pid = StarMap.selPlanet;
    if (fl && G.fleets.includes(fl)) {
      const mine = fl.fac === G.player;
      const p = G.planets[fl.at];
      const tgt = fl.route ?? fl.dest;
      q.innerHTML = `<div class="q-card" style="--c:${Game.ownerCol(fl.fac)}">
        ${fl.cmd ? `<img src="${Portrait.url(fl.cmd)}">` : '<div class="q-em">⚓</div>'}
        <div class="q-info"><b>${fl.fac === 'E' ? '蝕の群れ' : Game.fleetName(fl)}</b><small>${Game.ownerShort(fl.fac)}・${p.name}・${fl.ships.length}隻・戦力 ${num(Game.fleetPower(fl))}${mine && tgt !== null && tgt !== undefined ? ` → ${G.planets[tgt].name}` : ''}</small></div>
        <div class="q-btns">${mine ? `<button class="btn small primary" data-q="move">移動</button><button class="btn small" data-q="fleet">詳細</button>` : `<button class="btn small" data-q="planet">星を見る</button>`}</div></div>`;
      q.classList.add('show'); bindQuick(); return;
    }
    if (pid !== null && pid !== undefined && G.planets[pid]) {
      const p = G.planets[pid];
      const fls = G.fleets.filter(f => f.at === pid && f.ships.length);
      const myFl = fls.filter(f => f.fac === G.player);
      q.innerHTML = `<div class="q-card" style="--c:${Game.ownerCol(p.owner)}">
        <canvas class="q-pl" width="88" height="88" data-pid="${pid}"></canvas>
        <div class="q-info"><b>${p.name}</b><small>${Game.ownerName(p.owner)}・${PTYPES[p.type].name}・人口${Math.round(p.pop)}億・防衛衛星${p.def}基${fls.length ? `・艦隊${fls.length}` : ''}</small></div>
        <div class="q-btns">${myFl.length ? `<button class="btn small primary" data-q="fsel">艦隊</button>` : ''}<button class="btn small" data-q="planet">詳細</button></div></div>`;
      q.classList.add('show');
      const c = $('.q-pl', q).getContext('2d'); c.scale(2, 2); Art.planet(c, 22, 22, 15, p.type, p.seed);
      bindQuick(); return;
    }
    q.classList.remove('show'); q.innerHTML = '';
  }
  function bindQuick() {
    $$('#quick [data-q]').forEach(b => b.onclick = () => {
      Sound.se('click');
      const a = b.dataset.q, fl = StarMap.selFleet;
      if (a === 'cancel') { StarMap.moveMode = null; quick(); }
      if (a === 'move') { StarMap.moveMode = fl; quick(); }
      if (a === 'fleet') openFleet(fl);
      if (a === 'planet') openPlanet(StarMap.selPlanet);
      if (a === 'fsel') { const f = G.fleets.find(x => x.at === StarMap.selPlanet && x.fac === G.player && x.ships.length); StarMap.selFleet = f; quick(); }
    });
  }

  // ---------- 士官の表示 ----------
  function ofcCard(k, extra = '') {
    const S = OFF[k], o = G.officers[k];
    const role = roleText(k);
    const rk = o && o.st === 'act' ? `<span class="rk ${Game.isLeader(k) ? 'lord' : Game.rankIdx(k) >= 6 ? 'gen' : ''}">${Game.rankName(k)}</span>` : '';
    return `<div class="ofc" data-ofc="${k}"><img src="${Portrait.url(k)}"><div class="ofc-i"><b>${rk}${S.name}</b><small>${S.epi}・${S.pers}${role ? '・' + role : ''}</small>
      <div class="st"><span>統${S.ldr}</span><span>戦${S.tac}</span><span>政${S.pol}</span><span>交${S.dip}</span><span>技${S.sci}</span></div></div>${extra}</div>`;
  }
  function roleText(k) {
    const o = G.officers[k]; if (!o) return '';
    if (G.facs[G.player] && G.facs[G.player].leader === k && o.fac === G.player) return '君主';
    if (!o.role) return o.st === 'cap' ? '捕虜' : o.st === 'free' ? '在野' : '';
    if (o.role.startsWith('gov:')) return G.planets[+o.role.slice(4)].name + '総督';
    const fl = G.fleets.find(f => f.id === +o.role.slice(4));
    if (!fl) return '';
    return fl.cmd === k ? '艦隊司令' : '副官';
  }
  // 士官を選ぶ
  function pickOfficer(title, list, sortKey, note) {
    return new Promise(res => {
      sheet(body => {
        body.innerHTML = `${note ? `<p class="note">${note}</p>` : ''}<div class="list">${list.length ? list.sort((a, b) => (OFF[b][sortKey] || 0) - (OFF[a][sortKey] || 0)).map(k => ofcCard(k, `<button class="btn small primary" data-pick="${k}">選ぶ</button>`)).join('') : '<p class="dim">選べる士官がいません。</p>'}</div>
          <button class="btn" data-pick="">（置かない）</button>`;
        $$('[data-pick]', body).forEach(b => b.onclick = () => { Sound.se('click'); sheetStack.pop(); if (sheetStack.length) drawSheet(); else closeSheet(); res(b.dataset.pick || null); });
      }, title);
    });
  }

  // ---------- 惑星 ----------
  function openPlanet(pid) {
    sheet(body => renderPlanet(body, pid), G.planets[pid].name);
  }
  function renderPlanet(body, pid) {
    const p = G.planets[pid], mine = p.owner === G.player, f = G.facs[G.player];
    const inc = Game.planetIncome(p), rs = Game.planetResearch(p);
    let h = `<div class="pl-head"><canvas width="160" height="160" class="pl-art"></canvas><div>
      <div class="tag" style="background:${Game.ownerCol(p.owner)}">${Game.ownerName(p.owner)}</div>
      <p class="dim">${SYSTEMS[p.sys].name}・${PTYPES[p.type].name}${p.cap ? '・首都' : ''}</p><p>${p.desc}</p></div></div>`;
    h += `<div class="kv">
      <div><span>人口</span><b>${Math.round(p.pop)} / ${p.maxPop} 億</b></div>
      <div><span>民心</span><b>${Gloss.tag(p.stab, Gloss.stab(p.stab))}</b></div>
      <div><span>防衛衛星</span><b>${p.def} 基</b></div>
      ${mine ? `<div><span>収入</span><b>${Math.round(inc)}</b></div><div><span>研究</span><b>${Math.round(rs)}</b></div>` : ''}
      <div><span>造船所</span><b>${p.yard ? 'Lv' + p.yard : 'なし'}</b><small>${Gloss.dev('yard', p.yard)}</small></div></div>`;
    if (mine) {
      // 総督
      h += `<h3>総督</h3>${p.gov ? ofcCard(p.gov, '<button class="btn small" data-a="gov">替える</button>') : `<div class="empty">総督がいません（開発が遅く、民心が下がります）<button class="btn small primary" data-a="gov">任命</button></div>`}`;
      // 開発
      h += `<h3>開発</h3><div class="dev">${['ind', 'res', 'def', 'yard', 'pop'].map(k => {
        const lv = k === 'pop' ? '' : `Lv${p[k]}${p[k] >= Game.devCap(p, k) ? '（上限）' : ''}`;
        return `<button class="dev-b ${p.focus === k ? 'on' : ''}" data-focus="${k}"><b>${Game.FOCUS[k]}</b><small>${lv || '人口・民心'}</small><small class="dv">${Gloss.dev(k, k === 'pop' ? 0 : p[k], p)}</small></button>`;
      }).join('')}</div>`;
      if (p.focus !== 'pop') h += `<div class="prog">${bar(p.prog, 100, '#6ad0ff')}<small>${Game.FOCUS[p.focus]}の開発 ${Math.floor(p.prog)}%（毎月 +${Math.round(Game.devSpeed(p))}）</small><button class="btn small" data-a="invest">投資 ${Game.investCost(p)}</button></div>`;
      else h += `<p class="note">民生に力を注ぎ、人口の伸びと民心を高めます。</p>`;
      // 造艦
      h += `<h3>造艦 <small>${p.yard ? `同時に ${p.yard * 2} 隻まで` : '造船所がありません'}</small></h3>`;
      if (p.build.length) h += `<div class="queue">${p.build.map(b => `<div>${G.designs[b.d].name} <small>あと${b.left}か月</small></div>`).join('')}</div>`;
      if (p.yard) h += `<button class="btn primary wide" data-a="build">艦を造る</button>`;
      // 駐留
      h += `<h3>駐留艦 <small>${p.dock.length}隻（星を守る）</small></h3>`;
      if (p.dock.length) {
        h += shipGroups(p.dock);
        const fls = G.fleets.filter(x => x.fac === G.player && x.at === pid);
        h += `<div class="row">${fls.map(x => `<button class="btn small" data-join="${x.id}">${Game.fleetName(x)}に編入</button>`).join('')}<button class="btn small primary" data-a="newfleet">新しい艦隊を作る</button></div>`;
      }
    }
    // 艦隊
    const fls = G.fleets.filter(x => x.at === pid && x.ships.length);
    if (fls.length) h += `<h3>ここにいる艦隊</h3>${fls.map(x => `<div class="fl-row" data-fl="${x.id}" style="--c:${Game.ownerCol(x.fac)}"><b>${x.fac === 'E' ? '蝕の群れ' : Game.fleetName(x)}</b><small>${Game.ownerShort(x.fac)}・${x.ships.length}隻・戦力${num(Game.fleetPower(x))}</small></div>`).join('')}`;
    // 在野
    const free = Object.keys(G.officers).filter(k => G.officers[k].st === 'free' && G.officers[k].loc === pid);
    if (free.length) {
      h += `<h3>在野の人材</h3>${free.map(k => ofcCard(k, mine ? `<button class="btn small primary" data-recruit="${k}">登用</button>` : '')).join('')}`;
      if (!mine) h += `<p class="note">自国の星にいる人材だけ登用できます。</p>`;
    }
    if (!mine && p.owner !== 'E') {
      const fac = p.owner;
      h += `<h3>守り</h3><p>守りの強さ：およそ ${num(Game.planetDefense(p))}</p>`;
      if (Game.isMajor(fac)) h += `<p class="dim">${FACTIONS[fac].name}との関係：${REL_NAMES[Game.rel(G.player, fac).s]}</p>`;
    }
    body.innerHTML = h;
    const c = $('.pl-art', body).getContext('2d'); Art.planet(c, 80, 80, 52, p.type, p.seed);
    $$('[data-focus]', body).forEach(b => b.onclick = () => { if (p.focus !== b.dataset.focus) { p.focus = b.dataset.focus; p.prog = Math.floor(p.prog / 2); answer('govern', p.gov, p.name); } Sound.se('click'); redraw(); });
    const on = (sel, fn) => { const el = $(sel, body); if (el) el.onclick = () => { Sound.se('click'); fn(); }; };
    on('[data-a=invest]', () => { if (Game.invest(pid)) { toast('投資しました（開発 +60%）'); Sound.se('good'); } else toast('資金が足りません'); redraw(); });
    on('[data-a=gov]', async () => {
      const list = Game.officersOf(G.player).filter(k => !G.officers[k].role || G.officers[k].role === 'gov:' + pid || G.officers[k].role.startsWith('gov:'));
      const k = await pickOfficer(`${p.name}の総督`, list, 'pol', '政治が高いほど開発が早く、収入と民心が上がります。ほかの星の総督を選ぶと、そちらは空きます。');
      Game.setGov(pid, k); if (k) answer('appoint', k, p.name, 'happy'); redraw();
    });
    on('[data-a=build]', () => openBuild(pid));
    on('[data-a=newfleet]', async () => {
      const list = Game.officersOf(G.player).filter(k => !G.officers[k].role);
      const k = await pickOfficer('新しい艦隊の司令', list, 'ldr', '司令の統率は被害を減らし、戦術は火力を上げます。');
      if (!k) return;
      const fl = Game.newFleet(G.player, k, pid);
      fl.ships = p.dock.splice(0, Game.fleetCap(fl));
      toast(`${Game.fleetName(fl)}を編成しました`); Sound.se('good'); redraw();
    });
    $$('[data-join]', body).forEach(b => b.onclick = () => { const fl = G.fleets.find(x => x.id === +b.dataset.join); if (fl.ships.length >= Game.fleetCap(fl)) { toast(`${Game.fleetName(fl)}はもう艦を率いきれません（司令の階級で上限が決まります）`); return; } while (p.dock.length && fl.ships.length < Game.fleetCap(fl)) fl.ships.push(p.dock.shift()); Sound.se('good'); redraw(); });
    $$('[data-fl]', body).forEach(b => b.onclick = () => { const fl = G.fleets.find(x => x.id === +b.dataset.fl); if (fl && fl.fac === G.player) openFleet(fl); });
    $$('[data-recruit]', body).forEach(b => b.onclick = () => recruit(b.dataset.recruit));
    $$('.ofc[data-ofc]', body).forEach(el => el.querySelector('img').onclick = () => openOfficer(el.dataset.ofc));
  }
  function shipGroups(ships) {
    const by = new Map();
    ships.forEach(s => { const k = s.ecl || s.d; if (!by.has(k)) by.set(k, []); by.get(k).push(s); });
    return `<div class="ships">${[...by.entries()].map(([k, list]) => {
      const name = list[0].ecl ? ECLIPSE_SHIPS[list[0].ecl].name : G.designs[k].name;
      const hp = list.reduce((a, s) => a + s.hp, 0), mx = list.reduce((a, s) => a + Game.shipMaxHp(s), 0);
      const xp = Math.round(list.reduce((a, s) => a + (s.xp || 0), 0) / list.length);
      return `<div class="sg"><b>${name}</b><small>×${list.length}・${Game.rankOf(xp)}</small>${bar(hp, mx, hp / mx > 0.6 ? '#7ae08a' : hp / mx > 0.3 ? '#f0c050' : '#ff6a5a')}</div>`;
    }).join('')}</div>`;
  }
  function recruit(k) {
    const o = G.officers[k], S = OFF[k];
    const lead = G.facs[G.player].leader;
    const p = AI.recruitChance(k, G.player) + (isMine(lead) ? (OFF[lead].dip - 50) / 200 : 0) + People.recruitBonus(k).v;
    modal(`<div class="center">${ofcCard(k)}<p>登用に向かいますか？ 支度金 100。<br>見込み：<b>${Math.round(clamp(p, 0.05, 0.95) * 100)}%</b>${People.recruitBonus(k).who ? `<br><small>${OFF[People.recruitBonus(k).who.k].name}との縁がある（${People.recruitBonus(k).v > 0 ? '+' : ''}${Math.round(People.recruitBonus(k).v * 100)}%）</small>` : ''}</p></div>`, [{ t: 'やめる', v: false }, { t: '登用する', v: true, cls: 'primary' }]).then(async v => {
      if (!v) return;
      const f = G.facs[G.player];
      if (f.funds < 100) { toast('資金が足りません'); return; }
      f.funds -= 100;
      const rb = People.recruitBonus(k);
      const ok = Math.random() < clamp(p, 0.05, 0.95);
      const sc = [];
      if (rb.who) sc.push([rb.who.k, 'normal', rb.who.line]);
      sc.push([k, ok ? 'happy' : 'normal', People.voice(k, ok ? 'join' : 'refuse') || (ok ? 'わかった。その誘い、受けよう。' : '悪いが、まだ仕える気はない。')]);
      if (ok) {
        o.st = 'act'; o.fac = G.player; o.loyal = 65 + Math.random() * 20; if (o.ever === null || o.ever === undefined) o.ever = G.player; o.capBy = null;
        Game.log(`${S.name}が仕官した。`, 'good', G.player);
        Sound.se('good');
      } else Sound.se('bad');
      await talk(ok ? '仕官' : '登用ならず', sc, null, 'palace');
      redraw();
      Story.run();
    });
  }

  // ---------- 造艦 ----------
  function openBuild(pid) {
    sheet(body => {
      const p = G.planets[pid], f = G.facs[G.player];
      const ds = f.designs.map(id => G.designs[id]).filter(d => Game.designUnlocked(d, G.player));
      body.innerHTML = `<p class="note">資金 ${num(f.funds)}。戦艦・空母には造船所Lv2、弩級旗艦にはLv3が要ります。</p>
        <div class="list">${ds.map(d => {
          const st = Game.designStats(d, G.player), c = Game.designCost(d, G.player), can = Game.canBuildHull(p, d.hull);
          return `<div class="dsg"><canvas width="60" height="60" data-hull="${d.hull}"></canvas><div class="dsg-i"><b>${d.name}</b><small>${HULLS[d.hull].name}・${d.mods.map(m => MODULES[m].name).join('・')}</small>
            <div class="st"><span>耐久${st.hp}</span><span>火力${Math.round(st.dps * 10) / 10}</span><span>速さ${Math.round(st.speed)}</span>${st.shield ? `<span>盾${st.shield}</span>` : ''}<span>${st.turns}か月</span></div></div>
            <button class="btn small primary" data-b="${d.id}" ${!can || f.funds < c || p.build.length >= p.yard * 2 ? 'disabled' : ''}>${c}</button></div>`;
        }).join('')}</div><button class="btn wide" data-a="design">新しい設計を作る</button>`;
      $$('canvas[data-hull]', body).forEach(cv => { const c = cv.getContext('2d'); Art.ship(c, cv.dataset.hull, 30, 30, 0, 44, FACTIONS[G.player].col); });
      $$('[data-b]', body).forEach(b => b.onclick = () => { if (Game.queueBuild(pid, b.dataset.b)) { Sound.se('good'); toast(`${G.designs[b.dataset.b].name}を発注しました`); } drawSheet(); refreshTop(); });
      $('[data-a=design]', body).onclick = () => openDesigner();
    }, `${G.planets[pid].name}で造る`);
  }

  // ---------- 艦の設計 ----------
  function openDesigner(base) {
    const st0 = base ? { hull: base.hull, mods: base.mods.slice(), name: base.name + '改' } : { hull: 'cl', mods: [], name: '新型艦' };
    sheet(body => {
      const hulls = Designer.unlockedHulls(G.player), mods = Designer.unlockedMods(G.player);
      const H = HULLS[st0.hull];
      st0.mods = st0.mods.filter(m => mods.includes(m)).slice(0, H.slots);
      const d = { hull: st0.hull, mods: st0.mods };
      const st = Game.designStats(d, G.player);
      body.innerHTML = `<div class="dz-top"><canvas width="120" height="120" class="dz-art"></canvas><div class="dz-stat">
          <div class="st big"><span>耐久 ${st.hp}</span><span>装甲 ${st.armor}</span><span>盾 ${st.shield}</span><span>速さ ${Math.round(st.speed)}</span><span>火力 ${Math.round(st.dps * 10) / 10}</span><span>迎撃 ${Math.round(st.pd * 100)}%</span><span>費用 ${Game.designCost(d, G.player)}</span><span>${st.turns}か月</span></div></div></div>
        <label class="fld">名前 <input type="text" maxlength="12" value="${esc(st0.name)}"></label>
        <h3>船体</h3><div class="chips">${Object.keys(HULLS).map(h => `<button class="chip ${h === st0.hull ? 'on' : ''}" data-h="${h}" ${hulls.includes(h) ? '' : 'disabled'}>${HULLS[h].name}<small>枠${HULLS[h].slots}</small></button>`).join('')}</div>
        <h3>モジュール <small>${st0.mods.length} / ${H.slots}</small></h3>
        <div class="slots">${st0.mods.map((m, i) => `<button class="slot" data-rm="${i}">${MODULES[m].name} ✕</button>`).join('') || '<span class="dim">下から選んで載せます</span>'}</div>
        <div class="mods">${Object.keys(MODULES).map(k => { const M = MODULES[k]; const ok = mods.includes(k); return `<button class="mod ${ok ? '' : 'lock'}" data-m="${k}" ${ok && st0.mods.length < H.slots ? '' : 'disabled'}><b>${M.name}</b><small>${ok ? M.desc : '未解放：' + Object.entries(M.req).map(([b, v]) => b === 'forb' ? FORBIDDEN[v].name : Gloss.techLabel(b, v)).join('・')}</small></button>`; }).join('')}</div>
        <button class="btn primary wide" data-a="save" ${st0.mods.length ? '' : 'disabled'}>この設計を登録する</button>`;
      const c = $('.dz-art', body).getContext('2d'); Art.ship(c, st0.hull, 60, 60, 0, 80, FACTIONS[G.player].col);
      $('input', body).oninput = e => { st0.name = e.target.value; };
      $$('[data-h]', body).forEach(b => b.onclick = () => { st0.hull = b.dataset.h; drawSheet(); });
      $$('[data-m]', body).forEach(b => b.onclick = () => { st0.mods.push(b.dataset.m); Sound.se('click'); drawSheet(); });
      $$('[data-rm]', body).forEach(b => b.onclick = () => { st0.mods.splice(+b.dataset.rm, 1); drawSheet(); });
      $('[data-a=save]', body).onclick = () => { Game.newDesign(G.player, st0.name || '新型艦', st0.hull, st0.mods); Sound.se('good'); toast(`設計「${st0.name}」を登録しました`); backSheet(); };
    }, '艦の設計');
  }

  // ---------- 艦隊 ----------
  function openFleet(fl) {
    sheet(body => renderFleet(body, fl), Game.fleetName(fl));
  }
  function renderFleet(body, fl) {
    if (!G.fleets.includes(fl)) { body.innerHTML = '<p>この艦隊はもうありません。</p>'; return; }
    const p = G.planets[fl.at];
    const tgt = fl.route ?? fl.dest;
    let h = `<div class="kv"><div><span>現在地</span><b>${p.name}</b></div><div><span>行き先</span><b>${tgt !== null && tgt !== undefined ? G.planets[tgt].name : '待機'}</b></div><div><span>艦（上限は司令の階級）</span><b>${fl.ships.length} / ${Game.fleetCap(fl)}</b></div><div><span>戦力</span><b>${num(Game.fleetPower(fl))}</b></div></div>`;
    if (fl.mission && fl.mission.until >= G.turn) h += `<p class="note">出来事の命：${G.planets[fl.mission.at].name}へ（${fl.mission.why}）。あと${fl.mission.until - G.turn + 1}か月、参謀もこの命を守る。移動や待機を指示すると、命は解ける。</p>`;
    h += `<div class="row"><button class="btn primary" data-a="move">移動を指示</button><button class="btn" data-a="stay">待機</button></div>`;
    h += `<h3>司令</h3>${fl.cmd ? ofcCard(fl.cmd, '<button class="btn small" data-a="cmd">替える</button>') : `<div class="empty">司令がいません（奥の手が使えず、弱くなります）<button class="btn small primary" data-a="cmd">任命</button></div>`}`;
    if (fl.cmd) h += `<p class="note">奥の手：<b>${SKILLS[skillName(fl.cmd)].name}</b> ― ${SKILLS[skillName(fl.cmd)].desc}</p>`;
    h += `<h3>副官</h3>${fl.sub ? ofcCard(fl.sub, '<button class="btn small" data-a="sub">替える</button>') : `<div class="empty">副官なし（戦術の高い士官を置くと火力が上がる）<button class="btn small" data-a="sub">任命</button></div>`}`;
    h += `<h3>陣形</h3><div class="chips">${Object.entries(Battle.FORMS).map(([k, v]) => `<button class="chip ${fl.form === k ? 'on' : ''}" data-fm="${k}">${v.name}<small>${v.desc}</small></button>`).join('')}</div>`;
    h += `<h3>艦</h3>${shipGroups(fl.ships)}`;
    if (p.owner === G.player) {
      h += `<div class="row">${p.dock.length ? `<button class="btn small" data-a="take">駐留艦 ${p.dock.length}隻を編入</button>` : ''}<button class="btn small" data-a="drop">傷ついた艦を駐留へ</button><button class="btn small danger" data-a="disband">艦隊を解く</button></div>`;
    }
    body.innerHTML = h;
    const on = (sel, fn) => { const el = $(sel, body); if (el) el.onclick = () => { Sound.se('click'); fn(); }; };
    on('[data-a=move]', () => { closeSheet(); StarMap.selFleet = fl; StarMap.moveMode = fl; StarMap.focus(fl.at); quick(); });
    on('[data-a=stay]', () => { fl.route = null; fl.dest = null; fl.mission = null; redraw(); });
    on('[data-a=cmd]', async () => { const k = await pickOfficer('艦隊の司令', Game.officersOf(G.player).filter(k => !G.officers[k].role || G.officers[k].role === 'cmd:' + fl.id), 'ldr'); if (k) { Game.setCmd(fl, k); answer('command', k, G.planets[fl.at].name, 'happy'); } redraw(); });
    on('[data-a=sub]', async () => { const k = await pickOfficer('副官', Game.officersOf(G.player).filter(k => (!G.officers[k].role || G.officers[k].role === 'cmd:' + fl.id) && k !== fl.cmd), 'tac'); Game.setCmd(fl, k, 'sub'); if (k) { const t = fl.cmd ? People.tie(fl.cmd, k) : null; speak(k, t ? People.line(t, 'ally', k) : WarRoom.reply('command', k, G.planets[fl.at].name), 'happy'); } redraw(); });
    $$('[data-fm]', body).forEach(b => b.onclick = () => { fl.form = b.dataset.fm; Sound.se('click'); redraw(); });
    on('[data-a=take]', () => { if (fl.ships.length >= Game.fleetCap(fl)) { toast('司令の階級では、これ以上の艦は率いられません'); return; } while (p.dock.length && fl.ships.length < Game.fleetCap(fl)) fl.ships.push(p.dock.shift()); redraw(); });
    on('[data-a=drop]', () => { const hurt = fl.ships.filter(s => s.hp < Game.shipMaxHp(s) * 0.5); if (!hurt.length) { toast('半分以上傷ついた艦はありません'); return; } fl.ships = fl.ships.filter(s => !hurt.includes(s)); p.dock.push(...hurt); toast(`${hurt.length}隻を駐留させました`); redraw(); });
    on('[data-a=disband]', () => confirm('艦隊を解いて、艦をこの星に駐留させますか？', () => { p.dock.push(...fl.ships); fl.ships = []; Game.removeFleet(fl); StarMap.selFleet = null; closeSheet(); }));
    $$('.ofc[data-ofc]', body).forEach(el => el.querySelector('img').onclick = () => openOfficer(el.dataset.ofc));
  }
  function skillName(k) { const p = OFF[k].pers; const s = PERSONALITY[p].skill; return s === 'random' ? 'focus' : s; }

  // ---------- 一覧のタブ ----------
  function openTab(tab) {
    const titles = { planets: '惑星', fleets: '艦隊', tech: '技術と設計', people: '人事', diplo: '外交', gov: '国政', menu: 'メニュー' };
    sheetStack = [];
    sheet(body => ({ planets: tabPlanets, fleets: tabFleets, tech: tabTech, people: tabPeople, diplo: tabDiplo, gov: tabGov, menu: tabMenu })[tab](body), titles[tab]);
  }
  function tabPlanets(body) {
    const list = G.planets.filter(p => p.owner === G.player).sort((a, b) => b.pop - a.pop);
    const e = Game.economy(G.player);
    body.innerHTML = `<p class="note">${list.length}の星・収入 ${e.inc}・維持費 ${e.up}・研究 ${e.rp}</p>` + list.map(p => `<div class="pl-row" data-p="${p.id}"><canvas width="56" height="56"></canvas><div><b>${p.name}${p.cap ? ' ★' : ''}</b><small>${Game.FOCUS[p.focus]}・人口${Math.round(p.pop)}・民心${Math.round(p.stab)}〈${Gloss.stab(p.stab).w}〉・防衛衛星${p.def}基${p.gov ? '' : '・<span class="warn">総督なし</span>'}${p.build.length ? '・造艦中' : ''}</small></div></div>`).join('');
    $$('.pl-row', body).forEach(el => { const p = G.planets[+el.dataset.p]; const c = $('canvas', el).getContext('2d'); c.scale(2, 2); Art.planet(c, 14, 14, 9, p.type, p.seed); el.onclick = () => { StarMap.focus(p.id); StarMap.selPlanet = p.id; openPlanet(p.id); }; });
  }
  function tabFleets(body) {
    const list = G.fleets.filter(f => f.fac === G.player);
    const docks = G.planets.filter(p => p.owner === G.player && p.dock.length);
    body.innerHTML = (list.length ? list.map(fl => { const t = fl.route ?? fl.dest; return `<div class="fl-row" data-f="${fl.id}" style="--c:${FACTIONS[G.player].col}">${fl.cmd ? `<img src="${Portrait.url(fl.cmd)}">` : ''}<div><b>${Game.fleetName(fl)}</b><small>${G.planets[fl.at].name}${t !== null && t !== undefined ? ' → ' + G.planets[t].name : ''}・${fl.ships.length}隻・戦力${num(Game.fleetPower(fl))}〈${Gloss.power(Game.fleetPower(fl))}〉・${Battle.FORMS[fl.form].name}</small></div></div>`; }).join('') : '<p class="dim">艦隊がありません。</p>')
      + (docks.length ? `<h3>駐留艦のある星</h3>${docks.map(p => `<div class="pl-row" data-p="${p.id}"><div><b>${p.name}</b><small>駐留 ${p.dock.length}隻</small></div></div>`).join('')}` : '');
    $$('[data-f]', body).forEach(el => el.onclick = () => { const fl = G.fleets.find(x => x.id === +el.dataset.f); StarMap.focus(fl.at); StarMap.selFleet = fl; openFleet(fl); });
    $$('[data-p]', body).forEach(el => el.onclick = () => openPlanet(+el.dataset.p));
  }
  function tabTech(body) {
    const f = G.facs[G.player], rt = Game.researchTarget(f), e = Game.economy(G.player);
    const left = Math.max(0, Math.ceil((rt.cost - f.rp) / Math.max(1, e.rp)));
    let h = `<div class="res-now"><b>研究中：${rt.name}</b>${rt.gain ? `<small>完成すると：${rt.gain}</small>` : ''}${bar(f.rp, rt.cost, rt.forb ? '#ff3070' : '#6ad0ff')}<small>${Math.floor(f.rp)} / ${rt.cost}（毎月 +${e.rp}・あと${left}か月ほど）</small></div>`;
    h += `<div class="tech">${Object.entries(TECH_BRANCH).map(([k, B]) => {
      const lv = f.tech[k], next = TECH_UNLOCK[k][lv + 1];
      return `<button class="tb ${f.researching === k ? 'on' : ''}" data-t="${k}" style="--c:${B.col}"><b>${B.name} <span>Lv${lv}${lv ? '「' + Gloss.techName(k, lv) + '」' : ''}</span></b><small>いまの効果：${Gloss.techEffect(k, lv)}</small><small>次：${lv >= 8 ? '極めた' : `Lv${lv + 1}「${Gloss.techName(k, lv + 1)}」― ${Gloss.techGain(k, lv + 1)}（研究 ${techCost(lv + 1)}）`}</small></button>`;
    }).join('')}</div>`;
    if (Eclipse.canSeal(G.player) || f.sealed || f.researching === 'seal') h += `<h3 class="seal">蝕を断つ</h3><button class="tb seal ${f.researching === 'seal' ? 'on' : ''}" data-t="seal" ${f.sealed ? 'disabled' : ''}><b>${Eclipse.SEAL.name}${f.sealed ? '（修得済）' : ''}</b><small>${Eclipse.SEAL.desc}</small><small>研究 ${Eclipse.SEAL.cost}・核の欠片 ${Eclipse.keysOf(G.player)} / ${Eclipse.KEYS_NEEDED}</small></button>`;
    const forb = Object.keys(FORBIDDEN).filter(k => Game.forbAvailable(f, k) || f.forb.includes(k));
    if (forb.length) h += `<h3 class="forb">禁忌の技術</h3>${forb.map(k => { const F = FORBIDDEN[k]; const done = f.forb.includes(k); return `<button class="tb forb ${f.researching === k ? 'on' : ''}" data-t="${k}" ${done ? 'disabled' : ''}><b>${F.name}${done ? '（修得済）' : ''}</b><small>${F.desc}</small><small class="warn">⚠ ${F.warn}${G.flags.knowForbidden ? '' : '（……と、星詠みたちは言う）'}・${F.cost}</small></button>`; }).join('')}`;
    h += `<h3>設計 <small>${f.designs.length}種</small></h3><div class="list">${f.designs.map(id => { const d = G.designs[id]; const ok = Game.designUnlocked(d, G.player); return `<div class="dsg"><canvas width="44" height="44" data-hull="${d.hull}"></canvas><div class="dsg-i"><b>${d.name}${ok ? '' : '（旧式）'}</b><small>${HULLS[d.hull].name}・${d.mods.map(m => MODULES[m].name).join('・')}</small></div><button class="btn small" data-copy="${id}">改良</button></div>`; }).join('')}</div>
      <button class="btn primary wide" data-a="design">新しい設計を作る</button>`;
    body.innerHTML = h;
    $$('canvas[data-hull]', body).forEach(cv => Art.ship(cv.getContext('2d'), cv.dataset.hull, 22, 22, 0, 34, FACTIONS[G.player].col));
    $$('[data-t]', body).forEach(b => b.onclick = () => {
      const k = b.dataset.t;
      const go = () => {
        f.researching = k; Sound.se('click'); redraw();
        const sci = Game.officersOf(G.player).sort((a, b) => OFF[b].sci - OFF[a].sci)[0];
        if (sci) { const rt = Game.researchTarget(f); answer('research', sci, rt.short || rt.name); }
      };
      if (FORBIDDEN[k] && !G.flags.forbWarned) confirm('禁忌の技術は強力ですが、研究するたびに「何か」が近づくと言われています。それでも研究しますか？', () => { G.flags.forbWarned = 1; go(); });
      else go();
    });
    $$('[data-copy]', body).forEach(b => b.onclick = () => openDesigner(G.designs[b.dataset.copy]));
    $('[data-a=design]', body).onclick = () => openDesigner();
  }
  function tabPeople(body) {
    const me = G.player;
    const act = Game.officersOf(me);
    const caps = Object.keys(G.officers).filter(k => G.officers[k].st === 'cap' && G.officers[k].capBy === me);
    const free = Object.keys(G.officers).filter(k => G.officers[k].st === 'free' && G.officers[k].loc !== null && G.planets[G.officers[k].loc] && G.planets[G.officers[k].loc].owner === me);
    let h = `<p class="note">士官 ${act.length}名。顔をタップすると詳しく見られます。</p>`;
    h += `<div class="chips sortby">${[['ldr', '統率'], ['tac', '戦術'], ['pol', '政治'], ['dip', '交渉'], ['sci', '技術']].map(([k, n]) => `<button class="chip ${tabPeople.sort === k ? 'on' : ''}" data-sort="${k}">${n}順</button>`).join('')}</div>`;
    const sk = tabPeople.sort || 'ldr';
    h += act.sort((a, b) => OFF[b][sk] - OFF[a][sk]).map(k => ofcCard(k, `<div class="loy" title="忠誠">${G.facs[me].leader === k ? '君主' : '忠誠' + Math.round(G.officers[k].loyal) + '<br>' + Gloss.loyal(G.officers[k].loyal).w}</div>`)).join('');
    if (free.length) h += `<h3>領内の在野の人材</h3>${free.map(k => ofcCard(k, `<button class="btn small primary" data-recruit="${k}">登用</button>`)).join('')}`;
    if (caps.length) h += `<h3>捕虜</h3>${caps.map(k => ofcCard(k, `<div class="col"><button class="btn small primary" data-recruit="${k}">登用</button><button class="btn small" data-free="${k}">解放</button></div>`)).join('')}`;
    body.innerHTML = h;
    $$('[data-sort]', body).forEach(b => b.onclick = () => { tabPeople.sort = b.dataset.sort; drawSheet(); });
    $$('.ofc[data-ofc]', body).forEach(el => el.onclick = e => { if (e.target.closest('button')) return; openOfficer(el.dataset.ofc); });
    $$('[data-recruit]', body).forEach(b => b.onclick = () => recruit(b.dataset.recruit));
    $$('[data-free]', body).forEach(b => b.onclick = () => { const o = G.officers[b.dataset.free]; o.st = 'free'; o.fac = null; o.capBy = null; o.loc = R.pick(G.planets.filter(p => p.owner !== 'E')).id; if (Game.isMajor(o.ever)) FX.trust(o.ever, 8); toast(`${OFF[b.dataset.free].name}を解放しました（相手国の信頼 +8）`); drawSheet(); });
  }
  const REWARD = { '猛進': 'おう、ありがたい！ 次の戦で返す！', '沈着': '恐縮です。期待に応えます。', '策士': 'あら、気前がいいのね。覚えておくわ。', '仁徳': 'ありがとうございます。皆のために使います。', '野心': 'ふふ、私の価値をよく分かっている。', '忠烈': 'もったいなきお言葉。この身、さらに捧げます。', '奔放': 'やった！ 今夜はごちそうだ！' };
  const RELIEVE = { '猛進': 'なんだと？ ……まあいい、呼ばれたらすぐ戻る。', '沈着': '承知しました。次の務めをお待ちします。', '策士': 'しばらく、のんびり考え事でもするわ。', '仁徳': 'わかりました。少し休ませていただきます。', '野心': '……覚えておこう。', '忠烈': '御意。いつでもお呼びください。', '奔放': 'お休み？ やったー！' };
  function openOfficer(k) {
    sheet(body => {
      const S = OFF[k], o = G.officers[k];
      const ties = People.tiesOf(k), pf = People.prof(k);
      const mine = o.fac === G.player && o.st === 'act';
      const sk = PERSONALITY[S.pers].skill;
      const ri = Game.rankIdx(k), lord = Game.isLeader(k);
      const rankHtml = o.st !== 'act' ? '' : lord ? `<p class="rkline"><span class="rk lord">${Game.rankName(k)}</span>艦隊は30隻まで率いる</p>`
        : `<p class="rkline"><span class="rk ${ri >= 6 ? 'gen' : ''}">${OFFRANKS[ri]}</span>${ri < 10 ? `次の${OFFRANKS[ri + 1]}まで 武功 ${Math.max(0, Math.ceil(RANK_MERIT[ri + 1] - o.merit))}${ri === 9 ? '（元帥は国に一人）' : ''}` : '国でただ一人の元帥'}・艦隊は${RANK_CAP[ri]}隻まで</p>`;
      body.innerHTML = `<div class="ofc-big"><img src="${Portrait.url(k, 'normal')}"><div><h2>${S.name}</h2><p class="epi">${S.epi}</p>${rankHtml}
        <p>${S.age ? S.age + '歳・' : '年齢不詳・'}${S.pers}（${PERSONALITY[S.pers].desc}）</p><p>${roleText(k) || (o.st === 'dead' ? '戦死' : '')}</p></div></div>
        ${pf ? `<p class="bio">${pf.bio}</p>${pf.likes ? `<p class="note">好むもの：${pf.likes}</p>` : ''}` : ''}
        ${(() => { const st = Battle.styleOf(k); return st ? `<div class="st-style">戦い方：<em class="vs-style s-${st.type}">${st.name}</em> <small class="dim">${st.desc}</small></div>` : ''; })()}
        <div class="stat-bars">${[['統率', 'ldr', '艦隊の被害を減らす'], ['戦術', 'tac', '艦隊の火力を上げる'], ['政治', 'pol', '総督として開発・収入'], ['交渉', 'dip', '外交の使者'], ['技術', 'sci', '総督として研究']].map(([n, s, d]) => `<div><span>${n}</span>${bar(S[s], 100, '#6ad0ff')}<b>${S[s]}</b><small><em class="gl ${Gloss.stat(S[s]).cls}">${Gloss.stat(S[s]).w}</em> ${d}</small></div>`).join('')}</div>
        <p class="note">奥の手：<b>${sk === 'random' ? '気まぐれ（毎回変わる）' : SKILLS[sk].name}</b>${sk !== 'random' ? ' ― ' + SKILLS[sk].desc : ''}</p>
        <div class="kv"><div><span>忠誠</span><b>${Gloss.tag(o.loyal, Gloss.loyal(o.loyal))}</b></div><div><span>武功</span><b>${Math.round(o.merit)}</b></div><div><span>戦い</span><b>${o.battles}（勝${o.wins}）</b></div></div>
        ${ties.length ? `<h3>関係</h3>${ties.map(t => {
          const ot = People.other(t, k), so = G.officers[ot], stg = People.state(t).stage;
          const where = !so ? '' : so.st === 'dead' ? '故人' : so.st === 'cap' ? '捕虜' : so.st === 'free' ? '在野' : so.fac === G.player ? '自国' : Game.isMajor(so.fac) ? FACTIONS[so.fac].short : '小勢力';
          return `<div class="tie ${People.WARM.has(t.kind) ? 'bond' : t.kind}" data-ofc2="${ot}"><img src="${Portrait.url(ot)}"><div><b>${OFF[ot].name}<em class="gl">${where}</em></b><small><b>${People.KIND_NAME[t.kind] || ''}・${t.label}</b>${t.talk ? `<span class="stg">${'◆'.repeat(stg)}${'◇'.repeat(3 - stg)}</span>` : ''}：${t.desc}</small></div></div>`;
        }).join('')}<p class="note">◆は二人の物語の進み具合。絆・想い人・家族・師弟は同じ艦隊や戦場で力を高め合い、好敵手は戦場で燃え、遺恨は同じ国にいると忠誠を損ねます。</p>` : ''}
        ${pf && pf.arc && mine ? `<p class="note">${S.name}の物語：${pf.arc.filter(ev => G.evDone[ev.id]).length} / ${pf.arc.length} 話</p>` : ''}
        ${mine && G.facs[G.player].leader !== k ? `<div class="row"><button class="btn" data-a="reward">褒美を与える（100）</button><button class="btn" data-a="relieve">役目を解く</button></div>` : ''}
        <div class="row">${[['happy', '喜'], ['angry', '怒'], ['sad', '憂'], ['shock', '驚']].map(([e, n]) => `<button class="chip" data-ex="${e}">${n}</button>`).join('')}</div>`;
      const on = (sel, fn) => { const el = $(sel, body); if (el) el.onclick = () => { Sound.se('click'); fn(); }; };
      $$('[data-ofc2]', body).forEach(el => el.onclick = () => { Sound.se('click'); openOfficer(el.dataset.ofc2); });
      on('[data-a=reward]', () => { const f = G.facs[G.player]; if (f.funds < 100) { toast('資金が足りません'); return; } f.funds -= 100; o.loyal = Math.min(100, o.loyal + 15); toast(`${S.name}の忠誠が上がった`); speak(k, REWARD[S.pers] || 'ありがたく頂戴します。', 'happy'); drawSheet(); refreshTop(); });
      on('[data-a=relieve]', () => { Game.freeOfficer(k); speak(k, RELIEVE[S.pers] || '承知しました。', 'normal'); drawSheet(); });
      $$('[data-ex]', body).forEach(b => b.onclick = () => { $('.ofc-big img', body).src = Portrait.url(k, b.dataset.ex); });
    }, OFF[k].name);
  }
  function tabDiplo(body) {
    const me = G.player;
    let h = `<p class="note">残るすべての勢力と同盟を結べば、和平による勝利。使者は交渉の高い士官ほど通りやすく、ひと月に一度ずつ使えます。</p>`;
    for (const f of G.facs) {
      if (f.id === me) continue;
      const F = FACTIONS[f.id];
      if (!f.alive) { h += `<div class="dp-row dead"><b>${F.name}</b><small>滅亡</small></div>`; continue; }
      const r = Game.rel(me, f.id);
      const ratio = Diplo.power(me) / Diplo.power(f.id);
      h += `<div class="dp-row" data-d="${f.id}" style="--c:${F.col}"><canvas width="64" height="64"></canvas><div><b>${F.name}</b><small><span style="color:${REL_COL[r.s]}">${REL_NAMES[r.s]}</span>・信頼 ${Math.round(r.t)}〈${Gloss.trust(r.t).w}〉・国力 ${Gloss.ratio(ratio)}（${ratio.toFixed(1)}倍）・星${G.planets.filter(p => p.owner === f.id).length}</small>${bar(r.t + 100, 200, REL_COL[r.s])}</div></div>`;
    }
    h += `<h3>中立の小勢力</h3>`;
    for (const M of MINORS) {
      const m = G.minors[M.id], p = G.planets[M.planet];
      const gone = p.owner !== M.id;
      const prog = Game.minorProgress(M.id, me);
      h += `<div class="mn-row" style="--c:${M.col}"><b>◆ ${M.name}</b><small>${M.desc}</small>
        ${gone ? `<small class="dim">本拠は${Game.ownerName(p.owner)}のもの</small>` : m.ally !== null ? `<small>盟約：${Game.ownerName(m.ally)}${m.ally === me ? '・お礼：' + M.reward : ''}</small>${m.ally === me && MINOR_SVC[M.id] ? `<div class="row"><button class="btn small" data-svc="${M.id}" ${G.turn - (m.svcAt || -99) < MINOR_SVC[M.id].cool ? 'disabled' : ''}>${MINOR_SVC[M.id].name}</button><small class="dim">${MINOR_SVC[M.id].desc}${G.turn - (m.svcAt || -99) < MINOR_SVC[M.id].cool ? `（あと${MINOR_SVC[M.id].cool - (G.turn - m.svcAt)}か月）` : ''}</small></div>` : ''}` : `<small>依頼：${M.quest.text}（いま ${Math.min(prog, M.quest.need)} / ${M.quest.need}）・お礼：${M.reward}</small>
        <div class="row"><button class="btn small primary" data-mn="${M.id}" ${prog >= M.quest.need ? '' : 'disabled'}>盟約を結ぶ</button>${M.id === 'm2' ? `<button class="btn small" data-pay="m2">1500 払って雇う</button>` : ''}</div>`}</div>`;
    }
    body.innerHTML = h;
    $$('.dp-row[data-d]', body).forEach(el => { const fid = +el.dataset.d; const F = FACTIONS[fid]; Art.emblem($('canvas', el).getContext('2d'), F.emblem, 32, 32, 26, F.col, F.col2); el.onclick = () => openDiplo(fid); });
    $$('[data-mn]', body).forEach(b => b.onclick = () => { Game.minorJoin(b.dataset.mn, me); Sound.se('fanfare'); toast(`${MINORS.find(m => m.id === b.dataset.mn).name}と盟約を結びました！`); drawSheet(); });
    $$('[data-svc]', body).forEach(b => b.onclick = async () => { Sound.se('click'); const id = b.dataset.svc, S = MINOR_SVC[id], m = G.minors[id]; const r = S.run(); if (!r) { toast('資金が足りません'); return; } m.svcAt = G.turn; drawSheet(); refreshTop(); if (r.who && OFF[r.who] && G.officers[r.who].st !== 'dead') await talk(S.name, [[r.who, 'normal', r.line]], null, 'palace'); toast(r.msg); });
    $$('[data-pay]', body).forEach(b => b.onclick = () => { const f = G.facs[me]; if (f.funds < 1500) { toast('資金が足りません'); return; } f.funds -= 1500; G.minors.m2.paid = true; Game.minorJoin('m2', me); Sound.se('fanfare'); drawSheet(); refreshTop(); });
  }
  // 小勢力に頼めること（盟約を結んだ相手だけ）
  const MINOR_SVC = {
    m0: { name: '相場に乗る（資金 300）', cool: 6, desc: '港の商人と組んで一山当てる。300が、150〜700になって戻る。',
      run: () => { const f = G.facs[G.player]; if (f.funds < 300) return null; const v = Math.round(150 + Math.random() * 550); f.funds += v - 300; return { who: 'rico', line: v >= 300 ? '風が良かった。儲けは、港の流儀で山分けだ。' : '……相場は気まぐれでね。次はきっと取り返す。', msg: `相場の結果：資金 ${v - 300 >= 0 ? '+' : ''}${v - 300}` }; } },
    m1: { name: '学者を招く（資金 400）', cool: 6, desc: '学術都市の学者を招き、研究を手伝ってもらう。研究 +320。',
      run: () => { const f = G.facs[G.player]; if (f.funds < 400) return null; f.funds -= 400; f.rp += 320; return { who: 'sophos', line: '知は分け合うほど増える。存分に使いなされ。', msg: '研究 +320' }; } },
    m2: { name: '傭兵を増やす（資金 600）', cool: 8, desc: '黒鴉傭兵団から、強襲艦を4隻まわしてもらう（首都に駐留）。',
      run: () => { const f = G.facs[G.player]; if (f.funds < 600) return null; f.funds -= 600; const d = f.designs.map(id => G.designs[id]).filter(x => Game.designUnlocked(x, G.player)).sort((a, b) => Game.designStats(b, G.player).cost - Game.designStats(a, G.player).cost)[0]; if (d) for (let i = 0; i < 4; i++) G.planets[f.capital].dock.push(Game.newShip(d.id)); return { who: 'crow', line: '金の分だけは働く。それが鴉の流儀だ。', msg: `首都に艦が4隻届いた` }; } },
    m3: { name: '塔の記録を読む', cool: 12, desc: '塔守に頼み、古い記録を読み解いてもらう。研究 +200。何かが分かるかもしれない。',
      run: () => { const f = G.facs[G.player]; f.rp += 200; G.flags.towerRead = (G.flags.towerRead || 0) + 1; const e = G.eclipse; const line = !e.arrived ? (e.omen ? '記録の欠けた頁が、また一つ埋まった。……星が消える前に、同じことが書かれている。' : '記録には、遠い昔に「空が欠けた」とだけある。続きは、まだ読めぬ。') : e.phase === 'solved' ? '塔の記録は、ここで終わっている。もう、続きを書く必要はない。' : '裂け目はみな、ひとつの根から伸びる枝だと、記録は言う。根を断たねば、枝はまた生える。'; return { who: 'naja', line, msg: '研究 +200（塔の記録）' }; } },
    m4: { name: '抜け道の案内を雇う（資金 250）', cool: 8, desc: '漂泊民の案内で、半年のあいだ艦の速さ +15%。',
      run: () => { const f = G.facs[G.player]; if (f.funds < 250) return null; f.funds -= 250; G.minors.m4.guideUntil = G.turn + 6; return { who: 'tahir', line: '星図にない道を教えてやる。ただし、通った道は誰にも言うなよ。', msg: '半年のあいだ、艦の速さ +15%' }; } },
  };
  function openDiplo(fid) {
    sheet(body => {
      const me = G.player, F = FACTIONS[fid], f = G.facs[fid], r = Game.rel(me, fid);
      const envoys = Game.officersOf(me).filter(k => G.officers[k].busy !== G.turn).sort((a, b) => OFF[b].dip - OFF[a].dip);
      openDiplo.envoy = envoys.includes(openDiplo.envoy) ? openDiplo.envoy : envoys[0];
      const ev = openDiplo.envoy;
      const kinds = Object.keys(Diplo.KINDS).filter(k => Diplo.KINDS[k].need.includes(r.s));
      body.innerHTML = `<div class="dp-head" style="--c:${F.col}"><canvas width="90" height="90"></canvas><div><h2>${F.name}</h2><p class="dim">「${F.motto}」</p><p>関係：<b style="color:${REL_COL[r.s]}">${REL_NAMES[r.s]}</b>・信頼 ${Gloss.tag(r.t, Gloss.trust(r.t))}・主導 ${PARTIES[f.ruling].name}</p></div></div>
        ${f.leader && OFF[f.leader] && G.officers[f.leader].fac === fid ? ofcCard(f.leader) : ''}
        <h3>使者</h3>${ev ? ofcCard(ev, '<button class="btn small" data-a="envoy">替える</button>') : '<p class="dim">今月動ける士官がいません。</p>'}
        <h3>申し入れ</h3>${kinds.length ? kinds.map(k => { const c = Diplo.chance(me, fid, k, ev); return `<button class="dp-act" data-k="${k}" ${ev ? '' : 'disabled'}><b>${Diplo.KINDS[k].name}</b><small>${Diplo.KINDS[k].desc}</small><span class="pc">${Math.round(c.p * 100)}%</span><small class="why">${c.why.join('／')}</small></button>`; }).join('') : '<p class="dim">今の関係で申し込めるものはありません。</p>'}
        <h3>そのほか</h3><div class="row"><button class="btn small" data-g="200">贈り物 200</button><button class="btn small" data-g="600">贈り物 600</button><button class="btn small" data-a="tech">技術供与（研究150）</button>${r.s !== 'war' ? '<button class="btn small danger" data-a="war">宣戦布告</button>' : ''}</div>`;
      Art.emblem($('canvas', body).getContext('2d'), F.emblem, 45, 45, 38, F.col, F.col2);
      const on = (sel, fn) => { const el = $(sel, body); if (el) el.onclick = () => { Sound.se('click'); fn(); }; };
      on('[data-a=envoy]', async () => { const k = await pickOfficer('使者', envoys, 'dip', '交渉の高い士官ほど、申し入れが通りやすくなります。'); if (k) openDiplo.envoy = k; drawSheet(); });
      $$('[data-k]', body).forEach(b => b.onclick = async () => {
        const k = b.dataset.k;
        if (ev) await talk(null, [[ev, 'normal', WarRoom.reply('envoy', ev, F.name)], [ev, 'normal', WarRoom.DIPLO.ask[k] || '申し入れに参りました。']], null, 'palace', true);
        const res = Diplo.propose(me, fid, k, ev);
        await talkReply(fid, res.ok, k);
        if (res.ok) { Game.log(`${F.name}と${Diplo.KINDS[k].name}${k === 'surrender' ? 'が成った' : 'を結んだ'}。`, 'good', me); Sound.se('fanfare'); }
        else Sound.se('bad');
        drawSheet(); refreshTop();
        if (res.ok) { const v = Game.checkVictory(); if (v) { G.over = v.type; Game.save(); closeSheet(); await gameOver(v.type); } }
      });
      $$('[data-g]', body).forEach(b => b.onclick = () => { if (Diplo.gift(me, fid, +b.dataset.g)) { toast('贈り物を届けました。信頼が上がった'); Sound.se('good'); } else toast('資金が足りません'); drawSheet(); refreshTop(); });
      on('[data-a=tech]', () => { if (Diplo.techGift(me, fid)) toast('技術を供与しました。信頼が上がった'); else toast('研究の蓄えが足りません'); drawSheet(); refreshTop(); });
      on('[data-a=war]', () => confirm(`${F.name}に宣戦を布告しますか？${['nap', 'trade', 'ally'].includes(r.s) ? '<br><b class="warn">約束を破ることになり、ほかの国の信頼と民心が下がります。</b>' : ''}`, () => { Diplo.declareWar(me, fid); Sound.se('alarm'); drawSheet(); }));
    }, FACTIONS[fid].name);
  }
  async function talkReply(fid, ok, kind) {
    const lead = G.facs[fid].leader;
    if (!lead || !OFF[lead] || G.officers[lead].fac !== fid) { toast(ok ? '申し入れは受け入れられた' : '申し入れは断られた'); return; }
    const yes = { nap: '……よかろう。互いの背中は、しばらく撃たぬことにしよう。', trade: '取引か。悪くない話だ。', ally: '共に戦おう。この盟約、違えはせぬ。', peace: '……これ以上の血は、互いのためにならぬな。', surrender: '……我らの負けだ。民だけは、頼む。' };
    const no = { nap: '信用できぬな。出直してまいれ。', trade: '今はその時ではない。', ally: '盟を結ぶには、まだ互いを知らなすぎる。', peace: '停戦だと？ 笑わせる。', surrender: '降伏？ 寝言は寝て言え！' };
    await talk(null, [[lead, ok ? 'happy' : 'angry', (ok ? yes : no)[kind]]], null, 'palace', true);
  }
  // 蝕のいま：段階・開いている裂け目・核の欠片・何をすべきか
  function eclipseBox() {
    const e = G.eclipse;
    if (!e.arrived) return e.omen ? `<div class="eclbox omen"><b>異変</b><p>遠い星が消え、辺境の観測所が沈黙している。何かが起きている。</p></div>` : '';
    if (e.phase === 'solved') return `<div class="eclbox done"><b>蝕は根絶された</b><p>${Game.ownerName(e.defeatedBy)}が深淵の核を砕いた（${Game.dateStr(e.defeatedAt)}）。もう裂け目は開かない。</p></div>`;
    const me = G.player, f = G.facs[me], keys = Eclipse.keysOf(me), rifts = Eclipse.openRifts();
    const eatenPl = G.planets.filter(p => p.owner === 'E' && p.type !== 'rift').length;
    const stage = { first: '先触れ ― 裂け目がひとつ。群れは近くの国を襲っている。だが、これは先遣隊にすぎない。', lull: '小康 ― 先触れの裂け目は閉じた。だが観測所は、もっと大きなものが来ると告げている。', great: '大侵攻 ― 銀河の三方で裂け目が開いた。群れは何倍にもなり、どの国も襲われる。', receded: `退潮 ― 裂け目はすべて閉じた。だが根は残っている。およそ${Math.max(0, e.returnAt - G.turn)}か月後、蝕はもっと強くなって戻ってくる。`, ret: `再来（${e.cycle}度目）― 閉じたはずの裂け目が開いた。前よりも多く、強く。` }[e.phase] || '';
    const todo = f.sealed ? (G.planets[e.abyss] && G.planets[e.abyss].owner === 'E' ? '封印の理論を修めた。艦隊を「深淵」へ送り、核を砕けば、蝕は二度と来ない。' : '')
      : keys >= Eclipse.KEYS_NEEDED ? '核の欠片がそろった。技術の画面で「封印の理論」を研究すれば、蝕の源「深淵」への道が開く。'
      : `裂け目の核を砕くと「核の欠片」が手に入る（同盟国の分も合わせられる）。欠片が${Eclipse.KEYS_NEEDED}つそろえば、蝕の源を突き止められる。`;
    return `<div class="eclbox"><b>蝕：${Eclipse.PHASE_NAME[e.phase]}${e.cycle > 1 ? '・' + e.cycle + '度目' : ''}</b><p>${stage}</p>
      <div class="kv"><div><span>開いている裂け目</span><b>${rifts.length}</b></div><div><span>喰われた星</span><b>${eatenPl}</b></div><div><span>消えた民</span><b>${Math.round(e.eaten)}億</b></div><div><span>核の欠片</span><b>${keys} / ${Eclipse.KEYS_NEEDED}</b></div></div>
      ${rifts.map(r => `<button class="btn small" data-rift="${r.id}">${G.planets[r.id].name}を見る</button>`).join('')}
      <p class="note">${todo}</p><p class="note">蝕の根を断たないかぎり、どちらの勝利（統一・和平）にも届かない。</p></div>`;
  }
  function tabGov(body) {
    const f = G.facs[G.player];
    const v = (() => { const others = G.facs.filter(x => x.alive && x.id !== G.player); return { allies: others.filter(x => Game.rel(G.player, x.id).s === 'ally').length, others: others.length, mine: G.planets.filter(p => p.owner === G.player || Game.friendly(G.player, p.owner)).length, total: G.planets.length }; })();
    let h = `<button class="btn primary wide" data-a="staff">参謀に任せる（オートモード）${Staff.active() ? '：実行中' : ''}</button><h3>勝利への道</h3><div class="kv"><div><span>武力統一</span><b>${v.mine} / ${v.total} 星</b></div><div><span>和平</span><b>同盟 ${v.allies} / ${v.others} 国</b></div></div>`;
    h += eclipseBox();
    { // 出来事で決めたことの、続いている効き目と、命を受けた艦隊
      const bf = (G.facs[G.player].buffs || []).filter(x => x.until >= G.turn), ms = G.fleets.filter(x => x.fac === G.player && x.mission && x.mission.until >= G.turn);
      if (bf.length || ms.length) h += `<h3>続いている決定</h3><div class="decis">${bf.map(x => `<div>${x.name ? `<b>${x.name}</b>：` : ''}${x.k === 'stab' ? `民心 毎月 +${Math.round(x.v * 10)}` : `${People.BUFF_NAME[x.k] || x.k} ${x.k === 'build' ? '−' : '+'}${Math.round(x.v * 100)}%`}<small>あと${x.until - G.turn + 1}か月</small></div>`).join('')}${ms.map(x => `<div><b>${Game.fleetName(x)}</b>：${G.planets[x.mission.at].name}へ（${x.mission.why}）<small>あと${x.mission.until - G.turn + 1}か月</small></div>`).join('')}</div>`;
    }
    // 物語の進み（メインストーリー）
    { const mp = People.mainProgress(); if (mp.total) h += `<h3>${FACTIONS[G.player].short}の物語 <small>${mp.done.length} / ${mp.total} 話</small></h3><div class="story-prog">${mp.done.map((x, i) => `<div><span>${i + 1}</span>${x.title}<small>${Game.dateStr(x.t)}</small></div>`).join('')}${mp.done.length < mp.total ? `<div class="next"><span>${mp.done.length + 1}</span>……</div>` : ''}</div>`; }
    h += `<h3>国内の派閥 <small>主導：${PARTIES[f.ruling].name}</small></h3>`;
    h += Object.entries(PARTIES).map(([k, P]) => `<div class="party"><b style="color:${P.col}">${P.name}</b>${bar(f.parties[k], 100, P.col)}<span>${Math.round(f.parties[k])}%</span><small>${P.bonus}</small></div>`).join('');
    h += `<p class="note">戦えば主戦派、条約を結べば通商派・融和派、研究すれば技術派が伸びます。毎年1月の評議で、いちばん支持の多い派閥が主導権を握ります。</p>`;
    if (f.demand) h += `<div class="demand"><b>${PARTIES[f.demand.party].name}の要求</b><p>${Game.DEMANDS[f.demand.party].text}</p><small>期限：${Game.dateStr(f.demand.until)}まで。応えれば民心が上がり、背けば下がります。</small></div>`;
    h += `<h3>記録</h3><div class="log">${G.log.slice(0, 60).map(l => `<div class="lg ${l.kind}"><small>${Game.dateStr(l.t)}</small> ${l.text}</div>`).join('')}</div>`;
    body.innerHTML = h;
    $('[data-a=staff]', body).onclick = () => { Sound.se('click'); openStaff(); };
    $$('[data-rift]', body).forEach(b => b.onclick = () => { closeSheet(); StarMap.focus(+b.dataset.rift, 0.7); StarMap.selPlanet = +b.dataset.rift; quick(); });
  }
  function tabMenu(body) {
    body.innerHTML = `<div class="menu">
      <button class="btn wide" data-m="save">セーブする</button>
      <button class="btn wide" data-m="howto">遊び方</button>
      <button class="btn wide" data-m="mute">音：${Sound.muted ? 'オフ' : 'オン'}</button>
      ${Wake.supported() ? `<button class="btn wide" data-m="wake">画面を消さない：${Wake.on ? 'オン' : 'オフ'}</button>` : ''}
      <button class="btn wide danger" data-m="title">タイトルへ戻る</button></div>
      <p class="note">ひと月ごとに「自動」の枠へセーブされます。ほかに、好きなときに3つの枠へセーブできます。</p>`;
    $$('[data-m]', body).forEach(b => b.onclick = () => {
      Sound.se('click');
      const m = b.dataset.m;
      if (m === 'save') saveToSlot();
      if (m === 'howto') howto();
      if (m === 'mute') { Sound.toggleMute(); drawSheet(); }
      if (m === 'wake') { Wake.set(!Wake.on); toast(Wake.on ? '遊んでいる間、画面を消さないようにしました' : '画面の自動スリープを元に戻しました'); drawSheet(); }
      if (m === 'title') { Game.save(); closeSheet(); toTitle(); }
    });
  }

  // ---------- セーブの枠 ----------
  //  mode 'save'：手動の枠（1〜3）を選ぶ ／ 'load'：自動と手動の枠から選ぶ
  function pickSlot(mode) {
    let chosen = null;
    const render = () => Game.slotInfo().filter(s => mode === 'load' || !s.auto).map(s => {
      const i = s.info, empty = !i, off = mode === 'load' && empty;
      const when = i && i.at ? new Date(i.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      return `<div class="slot ${empty ? 'empty' : ''} ${off ? 'off' : ''}" data-s="${s.slot}" style="--c:${i ? FACTIONS[i.fac].col : '#556'}">
        <div class="sl-no">${s.auto ? '自動' : '枠' + s.slot}</div>
        <div class="sl-body">${i ? `<b>${i.name}</b><small>${i.date}・星 ${i.planets}${i.staff ? '・参謀 ' + i.staff : ''}${i.over ? '・終局' : ''}</small>${when ? `<small class="sl-at">保存 ${when}</small>` : ''}` : '<small>空き</small>'}</div>
        ${i && !s.auto ? '<button class="sl-del" data-del="1">消す</button>' : ''}</div>`;
    }).join('');
    const p = modal(`<h3>${mode === 'save' ? 'どの枠にセーブしますか' : 'どこから続けますか'}</h3><div class="slots">${render()}</div>`, [{ t: 'やめる', v: null }], {
      onOpen: m => {
        const box = $('.slots', m);
        box.onclick = e => {
          const el = e.target.closest('.slot'); if (!el) return;
          const s = +el.dataset.s;
          if (e.target.closest('[data-del]')) {
            const b = e.target.closest('[data-del]');
            if (!b.classList.contains('sure')) { b.classList.add('sure'); b.textContent = '本当に消す'; return; }
            Game.clearSave(s); Sound.se('click'); box.innerHTML = render(); return;
          }
          if (el.classList.contains('off')) return;
          if (mode === 'save' && !el.classList.contains('empty') && !el.classList.contains('sure')) {
            el.classList.add('sure'); $('.sl-no', el).textContent = '上書き？'; return;
          }
          chosen = s; $('.m-btns button', m).click();
        };
      },
    });
    return p.then(() => chosen);
  }
  async function saveToSlot() {
    const s = await pickSlot('save');
    if (s === null) return;
    toast(Game.save(s) ? `枠${s}にセーブしました` : 'セーブできませんでした（容量が足りないかもしれません）');
  }

  // ---------- 会話 ----------
  function talk(title, scenes, choices, bg, noTitle) {
    return new Promise(res => {
      const el = $('#talk');
      el.className = 'talk show bg-' + (bg || 'space');
      let i = 0, typing = null, full = false;
      if (!noTitle && title) Sound.se('event');
      const prevMood = null;
      const draw = () => {
        const [who, ex, text] = scenes[i];
        const narr = who === 'narr';
        const S = narr ? null : OFF[who];
        const fc = !narr && typeof G.officers[who].fac === 'number' ? FACTIONS[G.officers[who].fac].col : '#8aa0c0';
        el.innerHTML = `${title && !noTitle && i === 0 ? `<div class="t-title"><span>${title}</span></div>` : ''}
          ${narr ? '' : `<div class="t-por" style="--c:${fc}"><img src="${Portrait.url(who, ex || 'normal')}"></div>`}
          <div class="t-box ${narr ? 'narr' : ''}" style="--c:${fc}">${narr ? '' : `<div class="t-name">${S.name}<small>${S.epi}</small></div>`}<div class="t-text"></div><div class="t-next">▼</div></div>`;
        const tt = $('.t-text', el);
        let n = 0; full = false;
        clearInterval(typing);
        typing = setInterval(() => { n++; tt.textContent = text.slice(0, n); if (n % 3 === 0) Sound.se('type'); if (n >= text.length) { clearInterval(typing); full = true; } }, 28);
        tt._full = text;
      };
      const finish = () => {
        clearInterval(typing);
        if (choices && choices.length) {
          el.innerHTML += `<div class="t-choices">${choices.map((c, k) => `<button class="btn" data-c="${k}">${c.t}</button>`).join('')}</div>`;
          $$('[data-c]', el).forEach(b => b.onclick = e => { e.stopPropagation(); Sound.se('click'); el.className = 'talk'; el.innerHTML = ''; el.onclick = null; res(+b.dataset.c); });
          el.onclick = null;
          return;
        }
        el.className = 'talk'; el.innerHTML = ''; el.onclick = null; res(null);
      };
      el.onclick = () => {
        const tt = $('.t-text', el);
        if (!full && tt) { clearInterval(typing); tt.textContent = tt._full; full = true; return; }
        Sound.se('page');
        i++;
        if (i >= scenes.length) finish(); else draw();
      };
      draw();
    });
  }

  // ---------- 戦いの確認 ----------
  async function battlePrompt(setup, side) {
    const p = G.planets[setup.pid];
    const myF = side === 'A' ? setup.att : setup.def;
    const enF = side === 'A' ? setup.def : setup.att;
    const pw = (sd, isDef) => sd.fleets.reduce((a, f) => a + Game.fleetPower(f), 0) + (isDef ? Game.dockPower(p) + Game.satPower(p) : 0);
    const mp = pw(myF, side === 'D'), ep = pw(enF, side !== 'D');
    StarMap.focus(p.id);
    const v = await modal(`<div class="bp"><h2>${side === 'A' ? '攻撃' : '敵襲'}：${p.name}</h2>
      <div class="bp-vs"><div style="--c:${Game.ownerCol(myF.fac)}"><b>${Game.ownerShort(myF.fac === null ? null : myF.fac)}${side === 'D' && myF.fac !== G.player ? '（味方）' : ''}</b><small>${myF.fleets.map(f => Game.fleetName(f)).join('・') || '守備隊'}</small><span>戦力 ${num(mp)}</span></div>
      <div class="x">VS</div>
      <div style="--c:${Game.ownerCol(enF.fac)}"><b>${enF.fac === 'E' ? '蝕の群れ' : Game.ownerShort(enF.fac)}</b><small>${enF.fleets.map(f => f.fac === 'E' ? '蝕の群れ' : Game.fleetName(f)).join('・') || (side === 'A' ? `防衛衛星 ${p.def}基${p.dock.length ? `・駐留艦${p.dock.length}` : ''}` : '')}</small><span>戦力 ${num(ep)}</span></div></div>
      <p class="note">自分で指揮すると、陣形・突撃・後退・奥の手を使い分けられます。</p></div>`,
      [{ t: '自動で解決', v: 'auto' }, { t: '観戦する', v: 'watch' }, { t: '指揮する', v: 'cmd', cls: 'primary' }], { cls: 'wide' });
    let res;
    if (v === 'watch') return watchBattle(setup, side);
    if (v === 'cmd') {
      res = await Battle.run(setup, side);
      show('main');
      Sound.bgm(Eclipse.active() ? 'crisis' : 'strategy');
    } else {
      res = Battle.simulate(setup);
      const won = res.winner === side;
      await modal(`<div class="bp"><h2 class="${won ? 'win' : 'lose'}">${won ? '勝利' : '敗北'}</h2><p>${p.name}の戦い</p><p>撃沈 ${side === 'A' ? res.lostD : res.lostA}隻 ／ 喪失 ${side === 'A' ? res.lostA : res.lostD}隻</p></div>`);
    }
    return res;
  }

  // ---------- 会敵の帯：どこからどこへ攻め込んだか（攻め込まれたか）を、地図と帯で知らせる ----------
  function raidText(r) { return `${G.planets[r.from].name} → ${G.planets[r.to].name}`; }
  function showRaid(r) {
    if (!r) return;
    const f = { from: r.from, to: r.to };
    StarMap.raidFocus = f;
    StarMap.focusPair(r.from, r.to, null);
    StarMap.selPlanet = r.to;
    setTimeout(() => { if (StarMap.raidFocus === f) StarMap.raidFocus = null; }, 7000);
  }
  function raidAlert(o) {
    return new Promise(res => {
      const p = G.planets[o.pid], r = o.raids[0];
      const attack = o.af === G.player, ally = !attack && o.attF.some(f => f.fac === G.player);
      const facName = o.af === 'E' ? '蝕の群れ' : Game.ownerName(o.af);
      const n = o.attF.reduce((a, f) => a + f.ships.length, 0);
      const pw = fl => fl.reduce((a, f) => a + Game.fleetPower(f), 0);
      const ap = pw(o.attF), dp = pw(o.defF) + Game.dockPower(p) + Game.satPower(p);
      const who = o.attF.filter(f => f.fac !== 'E').map(f => Game.fleetName(f)).slice(0, 2).join('・');
      const from = r ? G.planets[r.from].name : '';
      const kind = attack || ally ? 'go' : 'hit';
      const head = attack ? '⚔ 進攻' : o.def === G.player ? '⚠ 敵襲' : '⚔ 援軍';
      const body = attack
        ? `わが${who || '艦隊'}（${n}隻）が<b>${from}</b>から<b>${p.name}</b>へ攻め込む`
        : `${facName}${who ? 'の' + who : ''}（${n}隻）が<b>${from || '近く'}</b>から<b>${p.name}</b>へ侵攻${o.def === G.player ? '' : `（${Game.ownerShort(o.def)}の星）`}`;
      const vs = o.free ? (attack ? '守りはいない' : '守りがいない！') : `戦力　攻 ${num(ap)} ／ 守 ${num(dp)}`;
      if (r) showRaid(r); else StarMap.focus(p.id, null, null);
      if (Staff.active() && r) WarRoom.raid(head, `${raidText(r)}　${facName}（${n}隻）`, kind === 'go', r.from, r.to);
      const el = $('#raid');
      el.className = `raid show ${kind}`;
      el.innerHTML = `<div class="rd-h">${head}</div><div class="rd-b">${body}</div><div class="rd-vs">${vs}</div><small class="rd-tap">タップで進む</small>`;
      Sound.se(kind === 'hit' ? 'alarm' : 'order');
      let done = false;
      const fin = () => { if (done) return; done = true; el.onclick = null; el.classList.remove('show'); res(); };
      el.onclick = fin;
      const ms = Staff.active() ? [3200, 2500, 1400, 600][WarRoom.speed ?? 1] : 3000;
      setTimeout(fin, ms);
    });
  }
  // 観戦しない設定のとき、勝ち負けをしばらく見せる
  function raidResult(res, side, pid) {
    return new Promise(done => {
      const won = res.winner === side, p = G.planets[pid];
      const el = $('#raid');
      el.className = `raid show ${won ? 'go' : 'hit'}`;
      el.innerHTML = `<div class="rd-h">${won ? '勝利' : '敗北'}</div><div class="rd-b"><b>${p.name}</b>の戦い</div><div class="rd-vs">撃沈 ${side === 'A' ? res.lostD : res.lostA}隻 ／ 喪失 ${side === 'A' ? res.lostA : res.lostD}隻</div>`;
      Sound.se(won ? 'good' : 'bad');
      let f = false; const fin = () => { if (f) return; f = true; el.onclick = null; el.classList.remove('show'); done(); };
      el.onclick = fin; setTimeout(fin, 1800);
    });
  }

  // 観戦（参謀や司令が指揮し、簡単な指示だけ出す）
  async function watchBattle(setup, side) {
    const res = await Battle.run(setup, side, { watch: true, fast: Staff.active() && autoSpeed === 3 });   // 超速なら、観戦も速く
    show('main');
    Sound.bgm(Eclipse.active() ? 'crisis' : 'strategy');
    return res;
  }

  // ---------- 月の報告 ----------
  async function monthReport(report) {
    Sound.se('turn');
    refresh();
    if (!report.length) { toast(`${Game.dateStr()}`); return; }
    const mineR = report.filter(r => r.kind !== 'news' && r.kind !== 'info'), news = report.filter(r => r.kind === 'news' || r.kind === 'info');
    const shown = mineR.concat(news.slice(0, 4).map(r => ({ kind: 'news', text: '【銀河】' + r.text })));
    // 今月の戦い：どこからどこへ攻め込んだか（押すと、地図でその矢印を見せる）
    const RES = { take: '制圧', repel: '撃退', free: '無血で制圧' };
    const raids = (G.raids || []).filter(r => r.t === G.turn - 1 && (r.fac === G.player || r.def === G.player) && G.planets[r.from] && G.planets[r.to]);
    const rh = raids.length ? `<h3>今月の戦い</h3>${raids.map((r, i) => {
      const go = r.fac === G.player, won = go ? r.res === 'take' || r.res === 'free' : r.res === 'repel';
      return `<div class="lg rraid ${go ? 'go' : ''} ${won ? 'good' : 'bad'}" data-r="${i}">${go ? '⚔ 進攻' : '⚠ 敵襲'}　${G.planets[r.from].name} → <b>${G.planets[r.to].name}</b>　${go ? '' : (r.fac === 'E' ? '蝕' : Game.ownerShort(r.fac)) + '・'}${r.n}隻${r.res ? `　<b>${RES[r.res] || ''}</b>` : ''}<small class="wr-map"> 地図で見る ›</small></div>`;
    }).join('')}<h3>報告</h3>` : '';
    let pick = null;
    await modal(`<h2 class="rep-h">${Game.dateStr()}</h2><div class="rep">${rh}${shown.map(r => `<div class="lg ${r.kind}">${r.text}</div>`).join('')}${news.length > 4 ? `<div class="lg news">ほか ${news.length - 4} 件の銀河の報（国政の記録で読めます）</div>` : ''}</div>`, [{ t: '閉じる', v: null, cls: 'primary' }], {
      onOpen: m => $$('[data-r]', m).forEach(d => d.onclick = () => { pick = raids[+d.dataset.r]; $('.m-btns button', m).click(); }),
    });
    if (pick) showRaid(pick);
  }
  async function pendingProposals() {
    while (G.pending.length) {
      const pd = G.pending.shift();
      if (!G.facs[pd.from].alive) continue;
      const r = Game.rel(pd.from, G.player);
      if (!Diplo.KINDS[pd.kind].need.includes(r.s)) continue;
      const F = FACTIONS[pd.from], lead = G.facs[pd.from].leader;
      if (Staff.active()) {
        const yes = Staff.answer(pd);
        Diplo.answer(pd, yes);
        autoLine(`${F.name}からの${Diplo.KINDS[pd.kind].name}の申し入れを、参謀が${yes ? '受けた' : '断った'}。`);
        if (yes) { const vic = Game.checkVictory(); if (vic) { G.staff.on = false; G.over = vic.type; Game.save(); await gameOver(vic.type); return; } }
        continue;
      }
      const lines = { nap: '貴国と、互いに攻め込まぬ約束を交わしたい。', trade: '交易の道を開こうではないか。互いの懐が温まる。', ally: '共に戦う盟約を結びたい。いかがか。', peace: 'この戦、そろそろ終わりにせぬか。' };
      const v = await modal(`<div class="center">${lead && OFF[lead] ? `<img class="big-por" src="${Portrait.url(lead, 'normal')}">` : ''}<h2>${F.name}からの申し入れ</h2><p><b>${Diplo.KINDS[pd.kind].name}</b></p><p>「${lines[pd.kind]}」</p></div>`, [{ t: '断る', v: false }, { t: '受ける', v: true, cls: 'primary' }]);
      Diplo.answer(pd, v);
      if (v) { const vic = Game.checkVictory(); if (vic) { G.over = vic.type; Game.save(); await gameOver(vic.type); return; } }
    }
  }

  // ---------- 参謀 ----------
  let staffDraft = null;
  function openStaff() {
    sheetStack = [];
    sheet(body => renderStaff(body), '参謀');
  }
  function gradeBadge(g) { return `<span class="grade" style="--g:${Staff.GRADE_COL[g]}">${g}</span>`; }
  function renderStaff(body) {
    const me = G.player;
    if (Staff.active()) {
      const s = G.staff, P = Staff.POLICIES[s.policy], g = Staff.gradeOf(s.score);
      const cur = s.policy === 'balanced' && s.cur ? `<small>いまの重点：${Staff.POLICIES[s.cur].icon}${Staff.POLICIES[s.cur].name}（${s.curWhy || ''}・得意${Staff.gradeOf(s.curScore)}）</small>` : '';
      body.innerHTML = `<div class="st-now">${ofcCard(s.key)}<div class="st-pol"><b>${P.icon} ${P.name}</b> ${gradeBadge(g)}<small>${P.desc}</small>${cur}<small>効き目：${P.effect}</small>
        <small>期間：${s.until ? `${Game.dateStr(s.until)}まで（あと${Math.max(0, s.until - G.turn)}か月）` : '止めるまで'}・艦隊戦：${({ watch: '見る（簡単な指示）', bigcmd: '大きな戦いは自分で指揮', none: '見ない' })[s.watch || (s.bigManual ? 'bigcmd' : 'watch')]}</small></div></div>
        ${(s.lines || []).length ? `<h3>${s.linesDate || ''}の報告</h3><div class="rep">${s.lines.map(x => typeof x === 'string' ? { cls: 'staff', t: x } : x).map(x => `<div class="lg ${x.cls}">${esc(x.t)}</div>`).join('')}</div>` : ''}
        <h3>ここまでの成果</h3><div class="kv">${Staff.summary().map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div>
        <div class="row"><button class="btn primary" data-a="resume">続けて任せる</button><button class="btn danger" data-a="stop">任せるのをやめる</button></div>`;
      $('[data-a=stop]', body).onclick = () => { Sound.se('click'); Staff.stop(); toast('参謀に任せるのをやめました'); closeSheet(); };
      $('[data-a=resume]', body).onclick = () => { Sound.se('click'); closeSheet(); autoNext(); };
      return;
    }
    const lead = G.facs[me].leader;
    const cands = Game.officersOf(me).filter(k => k !== lead);
    if (!cands.length) { body.innerHTML = '<p class="note">参謀を任せられる士官がいません。士官を登用すると、任せられるようになります。</p>'; return; }
    if (!staffDraft || !cands.includes(staffDraft.key)) {
      // いちばん得意の大きい士官を勧める
      let best = cands[0], bs = -1;
      for (const k of cands) for (const p in Staff.POLICIES) { if (Staff.POLICIES[p].needEclipse) continue; const sc = Staff.score(k, p); if (sc > bs) { bs = sc; best = k; } }
      staffDraft = { key: best, policy: staffDraft ? staffDraft.policy : 'balanced', months: 12, big: true };
    }
    const d = staffDraft;
    if (Staff.POLICIES[d.policy] && Staff.POLICIES[d.policy].needEclipse && (!G.eclipse.arrived || G.eclipse.defeated)) d.policy = 'balanced';
    const grs = Staff.grades(d.key);
    if (!G.eclipse.arrived) delete grs.eclipse;
    const balG = grs.balanced; delete grs.balanced;
    const good = Object.keys(grs).filter(p => 'SA'.includes(grs[p])).map(p => Staff.POLICIES[p].name), bad = Object.keys(grs).filter(p => grs[p] === 'D').map(p => Staff.POLICIES[p].name);
    grs.balanced = balG;
    body.innerHTML = `<p class="note">参謀と方針と期間を決めると、その方針を中心に、月を自動で進めます。参謀（7割）と君主（3割）の能力・性格で得意・不得意が決まり、方針の効き目と、しくじりやすさが変わります。会話の出来事は途中で見られます。</p>
      <h3>参謀</h3>${ofcCard(d.key, '<button class="btn small" data-a="pick">替える</button>')}
      <p class="note">得意：${good.join('・') || 'とくになし'}${bad.length ? `／不得手：${bad.join('・')}` : ''}${lead && isMine(lead) ? `（君主${shortName(OFF[lead])}の${OFF[lead].pers}の気質も加わる）` : ''}</p>
      <h3>方針</h3><div class="pols">${Object.entries(Staff.POLICIES).filter(([k, P]) => !P.needEclipse || G.eclipse.arrived).map(([k, P]) => {
        const dis = P.needEclipse && G.eclipse.defeated;
        return `<button class="pol ${d.policy === k ? 'on' : ''}" data-p="${k}" ${dis ? 'disabled' : ''}><b>${P.icon} ${P.name}</b>${gradeBadge(grs[k])}<small>${dis ? '蝕は根絶された' : P.desc}</small></button>`; }).join('')}</div>
      <h3>期間</h3><div class="chips">${[[6, '半年'], [12, '1年'], [24, '2年'], [0, '止めるまで']].map(([m, n]) => `<button class="chip ${d.months === m ? 'on' : ''}" data-m="${m}">${n}</button>`).join('')}</div>
      <h3>艦隊戦</h3><div class="chips">${[['watch', '見る', '参謀が指揮。簡単な指示が出せる'], ['bigcmd', '大きな戦いは指揮', '20隻以上は自分で指揮、ほかは見る'], ['none', '見ない', '結果だけ報告']].map(([k, n, ds]) => `<button class="chip ${(d.watch || 'watch') === k ? 'on' : ''}" data-w="${k}">${n}<small>${ds}</small></button>`).join('')}</div>
      <button class="btn primary wide" data-a="go">${OFF[d.key].name}に「${Staff.POLICIES[d.policy].name}」を任せる</button>
      <button class="btn wide" data-a="self">任せずに、自分で指揮する</button>`;
    $('[data-a=self]', body).onclick = () => { Sound.se('click'); closeSheet(); toast('星や艦隊をタップして命令。下のボタンで一覧。「月を進める」で次の月へ。', 5000); };
    $('[data-a=pick]', body).onclick = async () => {
      Sound.se('click');
      const k = await pickStaff(cands);
      if (k) staffDraft.key = k; drawSheet();
    };
    $$('[data-p]', body).forEach(b => b.onclick = () => { Sound.se('click'); d.policy = b.dataset.p; drawSheet(); });
    $$('[data-m]', body).forEach(b => b.onclick = () => { Sound.se('click'); d.months = +b.dataset.m; drawSheet(); });
    $$('[data-w]', body).forEach(b => b.onclick = () => { Sound.se('click'); d.watch = b.dataset.w; drawSheet(); });
    $('[data-a=go]', body).onclick = async () => {
      Sound.se('click');
      closeSheet();
      await talk(null, [[d.key, Staff.gradeOf(Staff.score(d.key, d.policy)) === 'D' ? 'sad' : 'happy', Staff.line(d.key, d.policy)]], null, 'bridge', true);
      Staff.start(d.key, d.policy, d.months, (d.watch || 'watch') === 'bigcmd');
      G.staff.watch = d.watch || 'watch';
      refresh();
      autoNext(300);
    };
  }
  // 参謀を選ぶ（方針ごとの得意を並べて）
  function pickStaff(cands) {
    return new Promise(res => {
      sheet(body => {
        const pols = Object.keys(Staff.POLICIES).filter(p => !Staff.POLICIES[p].needEclipse || G.eclipse.arrived);
        body.innerHTML = `<p class="note">各方針への向き不向き（S〜D）。君主の気質も少し加わっています。</p>` + cands.map(k => {
          const g = Staff.grades(k);
          return `<div class="ofc sp" data-k="${k}"><img src="${Portrait.url(k)}"><div class="ofc-i"><b><span class="rk">${Game.rankName(k)}</span>${OFF[k].name}</b><small>${OFF[k].epi}・${OFF[k].pers}</small>
            <div class="gr">${pols.map(p => `<span>${Staff.POLICIES[p].icon}${gradeBadge(g[p])}</span>`).join('')}</div></div><button class="btn small primary">選ぶ</button></div>`;
        }).join('');
        $$('.sp', body).forEach(el => el.onclick = () => { Sound.se('click'); sheetStack.pop(); drawSheet(); res(el.dataset.k); });
      }, '参謀を選ぶ');
    });
  }
  // 自動で進む帯
  let autoSpeed = 1, autoTimer = null;
  try { const v = +localStorage.getItem('seisou_autospeed'); if (v >= 0 && v <= 3) autoSpeed = v; } catch (x) { }
  const AUTO_DELAY = [900, 450, 150, 30];   // ゆっくり・ふつう・速い・超速
  function uiIdle() {
    return current === 'main' && !$('#sheet').classList.contains('show') && !$('#modal').classList.contains('show') && !$('#talk').classList.contains('show') && !Turn.running;
  }
  function autoNext(delay) {
    clearTimeout(autoTimer);
    drawAutobar();
    if (!Staff.active() || G.over) return;
    autoTimer = setTimeout(function tick() {
      if (!Staff.active() || G.over) { drawAutobar(); return; }
      if (!uiIdle()) { autoTimer = setTimeout(tick, 600); return; }
      Turn.end();
    }, delay ?? AUTO_DELAY[autoSpeed]);
  }
  function autoLine(t) { if (G.staff) { G.staff.lines = [{ cls: 'staff', t }].concat((G.staff.lines || []).map(x => typeof x === 'string' ? { cls: 'staff', t: x } : x)).slice(0, 8); } drawAutobar(); }
  // 参謀に任せている間の、月ごとの報告（帯に出す。「変わりなし」は出さない）
  function autoReport(report) {
    refresh();
    const s = G.staff; if (!s) return;
    const L = [];
    const add = (cls, t) => { if (t && !L.some(x => x.t === t)) L.push({ cls, t }); };
    report.filter(r => r.text.startsWith('【出来事】') || r.kind === 'big' || r.kind === 'bad').forEach(r => add(r.kind === 'bad' ? 'bad' : 'big', r.text));
    (s.month || []).forEach(t => add('staff', '参謀：' + t));
    add('sum', Staff.monthLine());
    report.filter(r => r.kind === 'good').slice(0, 3).forEach(r => add('good', r.text));
    report.filter(r => r.kind === 'news' || r.kind === 'info').slice(0, 3).forEach(r => add('news', '【銀河】' + r.text));
    s.lines = L; s.linesDate = Game.dateStr(G.turn - 1);
    drawAutobar();
  }
  // 作戦室（参謀に任せている間、地図の下半分に出す）
  function drawAutobar() {
    const wr = $('#warroom'); if (!wr) return;
    const was = wr.classList.contains('show');
    if (!G || !Staff.active()) { wr.classList.remove('show'); refreshEnd(); return; }
    const s = G.staff, P0 = Staff.POLICIES[s.policy];
    const P = s.policy === 'balanced' && s.cur ? { icon: '⚖', name: `均衡→${Staff.POLICIES[s.cur].icon}${Staff.POLICIES[s.cur].name}` } : P0;
    if (!was) { let m = false; try { m = localStorage.getItem('seisou_wr_mini') === '1'; } catch (x) { } wr.classList.toggle('mini', m); }
    wr.classList.add('show');
    const head = $('.wr-head', wr);
    head.innerHTML = `<img src="${Portrait.url(s.key)}"><div class="ab-i"><b>作戦室｜参謀 ${shortName(OFF[s.key])}：${P.icon}${P.name} ${gradeBadge(Staff.gradeOf(s.score))}</b><small>${Game.dateStr()}・${s.until ? `あと${Math.max(0, s.until - G.turn)}か月` : '止めるまで'}・${esc(Staff.monthLine())}</small></div>
      <div class="ab-b"><button data-ab="mini" title="作戦室をたたむ／ひろげる">${wr.classList.contains('mini') ? '▴' : '▾'}</button><button data-ab="speed">${['ゆっくり', 'ふつう', '速い', '超速'][autoSpeed]}</button><button data-ab="skip">⏭</button><button data-ab="stop" class="stop">■</button></div>`;
    WarRoom.setSpeed(autoSpeed);
    head.querySelector('[data-ab=speed]').onclick = e => { e.stopPropagation(); autoSpeed = (autoSpeed + 1) % 4; try { localStorage.setItem('seisou_autospeed', autoSpeed); } catch (x) { } drawAutobar(); };
    head.querySelector('[data-ab=mini]').onclick = e => { e.stopPropagation(); Sound.se('click'); const m = !wr.classList.contains('mini'); wr.classList.toggle('mini', m); try { localStorage.setItem('seisou_wr_mini', m ? '1' : '0'); } catch (x) { } drawAutobar(); const l = $('.wr-list', wr); l.scrollTop = l.scrollHeight; };
    head.querySelector('[data-ab=skip]').onclick = e => { e.stopPropagation(); WarRoom.skip(); toast('今月の報告を一気に出します'); };
    head.querySelector('[data-ab=stop]').onclick = e => { e.stopPropagation(); stopAuto(); };
    head.querySelector('.ab-i').onclick = () => openStaff();
    if (!was) WarRoom.redrawAll();
    refreshEnd();
  }
  function stopAuto() { Sound.se('click'); Staff.stop(); WarRoom.clearQueue(); clearTimeout(autoTimer); drawAutobar(); refresh(); toast('参謀に任せるのをやめました。自分で命令できます。'); }
  // 下の「月を進める」ボタン：任せている間は「止める」
  function refreshEnd() {
    const b = $('#main nav [data-nav=end]'); if (!b) return;
    const on = G && Staff.active();
    b.innerHTML = on ? '<i>■</i>任せるのを止める' : '<i>▶</i>月を進める';
    b.classList.toggle('stopper', !!on);
  }
  async function staffStop(why) {
    const s = G.staff;
    Staff.stop(); clearTimeout(autoTimer); drawAutobar(); refresh();
    Sound.se('event');
    await modal(`<div class="center"><img class="big-por" src="${Portrait.url(s.key, 'normal')}"><h2>参謀からの報告</h2><p>「${why}」</p></div>
      <div class="kv">${Staff.summary().map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div>`, [{ t: '自分で指揮する', v: null }, { t: '方針を決め直す', v: 'again', cls: 'primary' }])
      .then(v => { if (v === 'again') openStaff(); });
  }

  // ---------- 終わり ----------
  async function gameOver(type) {
    closeSheet();
    if (type === 'defeat') {
      Sound.bgm('defeat');
      await modal(`<div class="center"><h2 class="lose">${FACTIONS[G.player].name}　滅亡</h2><p>星々は、ほかの者たちの物語を紡いでいく。</p></div>`, [{ t: 'タイトルへ', v: null }]);
      Game.clearSave(); toTitle(); return;
    }
    // 自国の物語の終幕（メインストーリーの締めくくり）
    try { const fe = People.finale(type); if (fe) await Story.play(fe); } catch (e) { console.error(e); }
    const rec = Ending.record(type);
    Game.clearSave();
    await Cinema.ending(rec);
    toTitle();
  }

  // ---------- 遊び方 ----------
  function howto() {
    modal(`<div class="howto"><h2>遊び方</h2>
      <h3>目的</h3><p>星を奪って銀河を統一するか、残るすべての国と同盟を結んで和平を成せば勝ち。首都を失っても、星が一つでも残れば国は続きます。</p>
      <h3>ひと月の流れ</h3><p>星図で星や艦隊をタップして命令し、右下の「月を進める」で次の月へ。各国が動き、艦隊が進み、戦いが起き、収入と研究が入ります。</p>
      <h3>星（内政）</h3><p>星ごとに開発の向き（産業・研究・防衛衛星・造船所・民生）を選びます。総督の政治が高いほど早く進みます。民心が低いと蜂起されます。</p>
      <h3>艦隊</h3><p>造船所で艦を造ると、星に「駐留艦」として置かれます。士官を司令にして艦隊を作り、「移動」で行き先の星をタップ。敵の星に入ると艦隊戦になります。</p>
      <h3>星環協定</h3><p>惑星そのものは撃てません。軌道の防衛衛星と守りの艦をすべて倒すと、その星を制圧できます。</p>
      <h3>艦隊戦</h3><p>分隊をタップで選び、宇宙をタップで移動、敵をタップで攻撃。陣形・構え（突撃・砲撃・防御・後退）・司令の奥の手を使い分けます。側面や背後から撃つと大きな被害。止めている間も命令できます。「自動で解決」も選べます。艦の傷と練度は次の戦いへ持ち越されます。</p>
      <h3>地形</h3><p>星雲は射程が縮み、身を隠せます。小惑星帯は遅くなるが実弾に強い。残骸は被害を減らす遮蔽になります。</p>
      <h3>技術と設計</h3><p>兵器・機関・防御・経済の4系統。新しい船体やモジュールが手に入ったら、自分で艦を設計できます。禁忌の技術は強力ですが……。</p>
      <h3>外交</h3><p>交渉の高い士官を使者に、不可侵→通商→同盟と関係を深めます。中立の小勢力は、頼まれごとを果たすと味方になります。</p>
      <h3>国内の派閥</h3><p>主戦・通商・技術・融和の4派閥。主導する派閥で国の得意が変わり、ときどき要求を出してきます。</p>
</div>`, [{ t: '閉じる', v: null }], { cls: 'wide' });
  }

  // ---------- タイトル・勢力選び ----------
  function toTitle() {
    closeSheet();
    { const wr = $('#warroom'); if (wr) wr.classList.remove('show'); }
    show('title');
    Cinema.title();
    Sound.bgm('title');
    $('#title [data-act=load]').disabled = !Game.hasSave();
  }
  function factionSelect() {
    show('select');
    Cinema.stopTitle();
    const el = $('#selList');
    el.innerHTML = FACTIONS.map(F => `<div class="fc" data-f="${F.id}" style="--c:${F.col};--c2:${F.col2}">
      <div class="fc-top"><canvas width="72" height="72"></canvas><div><h3>${F.name}</h3><p class="motto">「${F.motto}」</p></div></div>
      <div class="fc-mid"><img src="${Portrait.url(F.leader)}"><div><b>${OFF[F.leader].name}</b><small>${OFF[F.leader].epi}</small><p>${F.desc}</p></div></div>
      <div class="fc-bot"><span>難しさ ${F.diff}</span><span>${F.bonusText}</span><span>${F.style}</span></div></div>`).join('');
    $$('.fc', el).forEach(c => {
      const F = FACTIONS[+c.dataset.f];
      Art.emblem($('canvas', c).getContext('2d'), F.emblem, 36, 36, 30, F.col, F.col2);
      c.onclick = () => {
        Sound.se('click');
        confirm(`<b>${F.name}</b>で始めますか？`, () => startGame(F.id));
      };
    });
  }
  let starting = false;
  // 前のゲームの画面の状態（移動の指示・作戦室・参謀の下書き）を消す
  function resetView() {
    StarMap.moveMode = null; StarMap.selFleet = null; StarMap.raidFocus = null;
    staffDraft = null;
    WarRoom.clearQueue();
    const wr = $('#warroom'); if (wr) { wr.classList.remove('show'); WarRoom.redrawAll(); }
  }
  async function startGame(fid) {
    starting = true;
    Game.newGame(fid);
    resetView();
    show('main');
    StarMap.focus(FACTIONS[fid].capital, 0.75);
    StarMap.selPlanet = FACTIONS[fid].capital;
    refresh();
    Sound.bgm('strategy');
    await wait(400);
    await Story.run();
    starting = false;
    Game.save();
    refresh();
    if (!G.flags.tutorial) {
      G.flags.tutorial = 1;
      // このゲームは参謀に任せて進めるのが基本。最初に参謀を選ぶ
      await modal(`<div class="center"><h2>参謀を選ぶ</h2><p>このゲームでは、参謀に方針を任せて国を動かします。参謀の命令と士官たちの返事、その結果は、地図の下の「作戦室」に流れます。</p><p class="note">自分で命令したいときは、いつでも止めて手動で遊べます。</p></div>`, [{ t: '参謀を選ぶ', v: 1, cls: 'primary' }]);
      openStaff();
    }
  }
  async function continueGame() {
    const s = await pickSlot('load');
    if (s === null) return;
    if (!Game.load(s)) { toast('セーブを読めませんでした'); return; }
    Cinema.stopTitle();
    resetView();
    show('main');
    if (G.over) { refresh(); await gameOver(G.over); return; }
    StarMap.focus(G.facs[G.player].capital, 0.7);
    refresh();
    Sound.bgm(Eclipse.active() ? 'crisis' : 'strategy');
    drawAutobar();
    if (Staff.active()) toast('参謀に任せたまま中断しています。帯の「■ 止める」で自分の指揮に戻れます。下の帯をタップで詳細。', 4000), autoNext(2500);
  }

  // ---------- 起動 ----------
  function boot() {
    document.title = `${CONFIG.title} ―${CONFIG.sub}―`;
    $$('[data-title]').forEach(e => e.textContent = CONFIG.title);
    $$('[data-sub]').forEach(e => e.textContent = CONFIG.sub);
    StarMap.init($('#mapcv'), onMapTap);
    // どこを触っても、止まった音を戻す（iPhone でアプリを切り替えた後など）
    ['pointerdown', 'touchend', 'click'].forEach(ev => document.addEventListener(ev, () => Sound.init(true), { capture: true, passive: true }));
    Wake.init();   // 遊んでいる間、画面を消さない
    $('#tap').onclick = () => {
      Sound.init();
      let seen = false; try { seen = localStorage.getItem('seisou_seen_op') === '1'; } catch (e) { }
      if (!seen) { try { localStorage.setItem('seisou_seen_op', '1'); } catch (e) { } Cinema.opening().then(toTitle); }
      else toTitle();
    };
    $('#title').addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      Sound.se('click');
      const a = b.dataset.act;
      if (a === 'new') { if (Game.hasSave(0)) confirm('「自動」の枠のセーブは、新しいゲームで上書きされます（枠1〜3は残ります）。新しく始めますか？', factionSelect); else factionSelect(); }
      if (a === 'load') continueGame();
      if (a === 'howto') howto();
      if (a === 'opening') { Cinema.stopTitle(); Cinema.opening().then(toTitle); }
      if (a === 'records') Ending.showRecords();
      if (a === 'mute') { const m = Sound.toggleMute(); b.textContent = '音：' + (m ? 'オフ' : 'オン'); }
    });
    $('#title [data-act=mute]').textContent = '音：' + (Sound.muted ? 'オフ' : 'オン');
    $('#select .back').onclick = () => { Sound.se('click'); toTitle(); };
    $('#main nav').addEventListener('click', e => {
      const b = e.target.closest('[data-nav]'); if (!b || Turn.running || starting) return;
      Sound.se('click');
      const n = b.dataset.nav;
      if (n === 'end') { if (Staff.active()) { stopAuto(); return; } closeSheet(); StarMap.moveMode = null; Turn.end(); }
      else openTab(n);
    });
    $('#btnMenu').onclick = () => { if (Turn.running) { toast('月の処理が終わるまで、お待ちください'); return; } Sound.se('click'); openTab('menu'); };
    $('#btnStaff').onclick = () => { if (Turn.running) return; Sound.se('click'); openStaff(); };
    $('#sheet .sh-close').onclick = () => { Sound.se('click'); closeSheet(); };
    $('#sheet .sh-back').onclick = () => { Sound.se('click'); backSheet(); };
    $('#sheet .sh-bg').onclick = () => closeSheet();
  }

  return { show, toast, speak, busy, modal, confirm, wait, sheet, closeSheet, refresh, refreshTop, talk, battlePrompt, monthReport, pendingProposals, gameOver, boot, toTitle, howto, ofcCard, openPlanet, openFleet, openStaff, autoNext, autoReport, staffStop, watchBattle, raidAlert, raidResult, showRaid, get current() { return current; } };
})();
