// ============================================================
//  戦場（マス目の戦術マップ）
//  ・上が城（守備側）、下から攻め手が寄せる
//  ・攻め手の勝ち: 本丸を占領 / 守備隊全滅 / 守備の総大将を倒す
//  ・守り手の勝ち: 30日守り切る / 攻め手全滅 / 攻めの総大将を倒す / 攻め手の兵糧切れ
// ============================================================
const Battle = (() => {
  const COLS = 9, ROWS = 11;
  const COST = { plain: 1, forest: 2, mount: 3, ford: 2, water: 99, inner: 1, keep: 1, gate: 1, wall: 99, road: 1 };
  const DEFK = { plain: 1, forest: 1.2, mount: 1.35, ford: 0.85, water: 0.8, inner: 1.35, keep: 1.6, gate: 1.4, wall: 2, road: 1 };
  const TNAME = { plain: '平地', forest: '森', mount: '山', ford: '浅瀬', water: '川', inner: '城内', keep: '本丸', gate: '城門', wall: '城壁', road: '道' };
  let B = null, cv, ctx, cell, raf, resolveEnd, terrainLayer, anims = [], floaters = [], particles = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms / Math.max(G && G.opts.aiSpeed ? G.opts.aiSpeed : 1, B && B.watch ? Auto.speed : 1)));

  // ---------- 地形の生成 ----------
  function genTerrain(city) {
    const t = [];
    for (let r = 0; r < ROWS; r++) { t.push([]); for (let c = 0; c < COLS; c++) t[r].push({ t: 'plain', fire: 0 }); }
    const fr = city.terrain === 'mount' ? 0.14 : 0.12, mr = city.terrain === 'mount' ? 0.2 : 0.06;
    for (let r = 3; r < ROWS - 1; r++) for (let c = 0; c < COLS; c++) {
      const x = Math.random();
      if (x < mr) t[r][c].t = 'mount'; else if (x < mr + fr) t[r][c].t = 'forest';
    }
    // 森はかたまりにする
    for (let k = 0; k < 3; k++) { const r = irnd(3, 8), c = irnd(0, 8); [[0,0],[0,1],[1,0],[1,1]].forEach(([dr, dc]) => { if (t[r + dr] && t[r + dr][c + dc] && Math.random() < 0.8) t[r + dr][c + dc].t = city.terrain === 'mount' && Math.random() < 0.5 ? 'mount' : 'forest'; }); }
    if (city.terrain === 'river') {
      let r = irnd(5, 6);
      const fords = shuffle([0,1,2,3,4,5,6,7,8]).slice(0, 3);
      for (let c = 0; c < COLS; c++) {
        t[r][c].t = fords.includes(c) ? 'ford' : 'water';
        if (Math.random() < 0.3 && r > 4 && r < 7) { r += Math.random() < 0.5 ? -1 : 1; r = clamp(r, 4, 7); t[r][c].t = fords.includes(c) ? 'ford' : 'water'; }
      }
    }
    // 城
    for (let c = 1; c <= 7; c++) { t[0][c].t = 'inner'; t[1][c].t = 'inner'; t[2][c].t = 'wall'; }
    t[0][1].t = 'wall'; t[0][7].t = 'wall'; t[1][1].t = 'wall'; t[1][7].t = 'wall';
    t[0][4].t = 'keep'; t[2][4].t = 'gate';
    // 城の前は道
    for (let r = 3; r < ROWS; r++) if (t[r][4].t !== 'water' && t[r][4].t !== 'ford') t[r][4].t = 'road';
    // 攻め手の出発地点は平地に
    for (let c = 0; c < COLS; c++) { if (t[ROWS - 1][c].t !== 'water') t[ROWS - 1][c].t = t[ROWS - 1][c].t === 'road' ? 'road' : 'plain'; }
    return t;
  }

  function mkUnit(g, side, fi, troops, r, c) {
    return { gi: g ? g.i : -1, g: g || Portrait.GENERIC, side, fi, troops, maxTroops: troops, morale: 80, r, c, x: c, y: r, acted: false, alive: true, confused: 0, rogue: false, commander: false, status: 'ok' };
  }

  // ---------- 開始 ----------
  // plan: { atkFi, from, to, gens:[gi], troops, food }
  function start(plan, opts) {
    return new Promise(resolve => {
      resolveEnd = resolve;
      const to = G.cities[plan.to], from = G.cities[plan.from];
      const defFi = to.owner;
      const atkGens = plan.gens.map(i => G.gens[i]);
      const defGensAll = Game.gensIn(to.i, defFi === null ? undefined : defFi);
      const defGens = defGensAll.slice().sort((a, b) => (b.isLord ? 1000 : 0) + b.lead + b.war - (a.isLord ? 1000 : 0) - a.lead - a.war).slice(0, 5);
      B = { plan, atkFi: plan.atkFi, defFi, from, to, tiles: genTerrain(to), units: [], day: 1, weather: 'sun', food: plan.food,
        playerSide: plan.atkFi === G.player ? 'atk' : 'def', gateHP: 600 + to.def * 9, gateMax: 600 + to.def * 9, log: [], sel: null, mode: 'idle', reach: null, targets: null, over: false,
        bondAtk: Game.bondOf(atkGens.map(g => g.name)), bondDef: Game.bondOf(defGens.map(g => g.name)),
        watch: !!(opts && opts.watch), smart: 0.5,
        buff: { atk: { atk: 1, guard: 1, days: 0 }, def: { atk: 1, guard: 1, days: 0 } } };
      if (B.watch) { const sg = Auto.strategist(); B.smart = sg ? Auto.brain(sg).q : 0.5; }
      // 攻め手の配置（下段）
      let left = plan.troops;
      const atkCols = [4, 3, 5, 2, 6];
      atkGens.forEach((g, k) => {
        const share = k === atkGens.length - 1 ? left : Math.min(Game.troopCap(g), Math.round(plan.troops / atkGens.length));
        left -= share;
        const u = mkUnit(g, 'atk', plan.atkFi, Math.max(100, share), ROWS - 1 - (k >= 3 ? 1 : 0), atkCols[k]);
        if (B.tiles[u.r][u.c].t === 'water') u.r = ROWS - 1;
        B.units.push(u);
      });
      B.units.find(u => u.side === 'atk').commander = true;
      // 守り手の配置
      const defTroops = to.troops;
      if (defGens.length) {
        const caps = defGens.map(g => Game.troopCap(g));
        const capSum = caps.reduce((s, x) => s + x, 0);
        const use = Math.min(defTroops, capSum);
        B.reserve = defTroops - use;
        const pos = [[0, 4], [1, 3], [1, 5], [1, 2], [1, 6]];   // 全員城内に構える
        defGens.forEach((g, k) => {
          const tr = Math.max(100, Math.round(use * caps[k] / capSum));
          B.units.push(mkUnit(g, 'def', defFi, tr, pos[k][0], pos[k][1]));
        });
      } else {
        B.reserve = Math.max(0, defTroops - 6000);
        B.units.push(mkUnit(null, 'def', defFi, Math.max(300, Math.min(defTroops, 6000)), 0, 4));
      }
      B.units.find(u => u.side === 'def').commander = true;
      B.units.forEach(u => { u.train = u.side === 'atk' ? from.train : to.train; if (u.gi >= 0 && Game.top(u.g, 'cha')) u.morale = 95; });
      // 人望の上位者がいる軍は士気が高い
      ['atk', 'def'].forEach(sd => { if (B.units.some(u => u.side === sd && u.gi >= 0 && Game.top(u.g, 'cha'))) B.units.filter(u => u.side === sd).forEach(u => u.morale = Math.max(u.morale, 90)); });
      // 君主の位（公・王・皇帝）に応じて、その勢力の将兵の士気が上がる
      B.units.forEach(u => { const f = u.fi != null && G.factions[u.fi]; if (f && f.rank) u.morale = Math.min(100, u.morale + f.rank * 4); });
      B.reinfPlan = planReinf();
      B.weather = pickWeather();
      setupDOM(opts && opts.auto);
      baseBgm();
      Sound.se('warcry');
      Sound.amb(B.weather === 'rain' ? 'rain' : null);
      draw();
      startDay(true);
    });
  }

  function pickWeather() { const r = Math.random(); return r < 0.6 ? 'sun' : r < 0.85 ? 'cloud' : 'rain'; }
  const WNAME = { sun: '晴', cloud: '曇', rain: '雨' };

  // ---------- DOM ----------
  let root, hud, info, actions, auto = false;
  function setupDOM(isAuto) {
    auto = !!isAuto;
    root = document.getElementById('battle');
    root.innerHTML = `
      <div class="b-hud"></div>
      <div class="b-field"><canvas id="bcv"></canvas><div class="b-banner"></div></div>
      <div class="b-info"></div>
      <div class="b-actions"></div>`;
    UI.show('battle');
    hud = root.querySelector('.b-hud'); info = root.querySelector('.b-info'); actions = root.querySelector('.b-actions');
    cv = root.querySelector('#bcv'); ctx = cv.getContext('2d');
    const W = Math.min(window.innerWidth, 480) - 8;
    const avail = root.getBoundingClientRect().height - 250 - (typeof Auto !== 'undefined' && Auto.running ? 54 : 0);   // 軍師のバーの分
    cell = Math.max(28, Math.floor(Math.min(W / COLS, avail / ROWS)));
    const dpr = window.devicePixelRatio || 1;
    cv.width = cell * COLS * dpr; cv.height = cell * ROWS * dpr;
    cv.style.width = cell * COLS + 'px'; cv.style.height = cell * ROWS + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildTerrainLayer(dpr);
    cv.onclick = onTap;
    cancelAnimationFrame(raf);
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
  }

  function buildTerrainLayer(dpr) {
    terrainLayer = document.createElement('canvas');
    terrainLayer.width = cell * COLS * dpr; terrainLayer.height = cell * ROWS * dpr;
    const c = terrainLayer.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = cell;
    for (let r = 0; r < ROWS; r++) for (let q = 0; q < COLS; q++) {
      const x = q * s, y = r * s, t = B.tiles[r][q].t;
      // 地面
      const base = { plain: '#9bb46a', road: '#c8b583', forest: '#6f9a52', mount: '#9a8a6a', ford: '#8fb7c4', water: '#4f86a8', inner: '#c9b48a', keep: '#c9b48a', gate: '#7a5a3a', wall: '#8a8478' }[t];
      c.fillStyle = base; c.fillRect(x, y, s, s);
      // ざらつき
      for (let k = 0; k < 10; k++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},0.06)`; c.fillRect(x + Math.random() * s, y + Math.random() * s, 2, 2); }
      if (t === 'forest') {
        for (let k = 0; k < 4; k++) {
          const tx = x + s * (0.25 + (k % 2) * 0.5) + rnd(-3, 3), ty = y + s * (0.3 + Math.floor(k / 2) * 0.42);
          c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(tx + 2, ty + s * 0.18, s * 0.16, s * 0.06, 0, 0, 7); c.fill();
          c.fillStyle = '#5a3a20'; c.fillRect(tx - 1, ty, 2, s * 0.15);
          c.fillStyle = '#2f6a2f'; c.beginPath(); c.moveTo(tx, ty - s * 0.2); c.lineTo(tx - s * 0.15, ty + s * 0.05); c.lineTo(tx + s * 0.15, ty + s * 0.05); c.fill();
          c.fillStyle = '#3f8a3a'; c.beginPath(); c.moveTo(tx, ty - s * 0.22); c.lineTo(tx - s * 0.08, ty - s * 0.02); c.lineTo(tx + s * 0.05, ty - s * 0.02); c.fill();
        }
      } else if (t === 'mount') {
        c.fillStyle = '#7a6a50'; c.beginPath(); c.moveTo(x + s * 0.05, y + s * 0.9); c.lineTo(x + s * 0.45, y + s * 0.15); c.lineTo(x + s * 0.95, y + s * 0.9); c.fill();
        c.fillStyle = '#a8987a'; c.beginPath(); c.moveTo(x + s * 0.45, y + s * 0.15); c.lineTo(x + s * 0.95, y + s * 0.9); c.lineTo(x + s * 0.55, y + s * 0.9); c.fill();
        c.fillStyle = '#eee'; c.beginPath(); c.moveTo(x + s * 0.45, y + s * 0.15); c.lineTo(x + s * 0.36, y + s * 0.32); c.lineTo(x + s * 0.52, y + s * 0.3); c.fill();
      } else if (t === 'water' || t === 'ford') {
        c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.5;
        for (let k = 0; k < 3; k++) { c.beginPath(); const yy = y + s * (0.25 + k * 0.25); c.moveTo(x + 4, yy); c.quadraticCurveTo(x + s * 0.3, yy - 4, x + s * 0.5, yy); c.quadraticCurveTo(x + s * 0.7, yy + 4, x + s - 4, yy); c.stroke(); }
        if (t === 'ford') { c.fillStyle = 'rgba(200,180,120,0.5)'; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(x + rnd(6, s - 6), y + rnd(6, s - 6), 3, 0, 7); c.fill(); } }
      } else if (t === 'wall') {
        c.fillStyle = '#6a6458'; c.fillRect(x, y + s * 0.15, s, s * 0.7);
        c.strokeStyle = '#4a463e'; c.lineWidth = 1;
        for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(x, y + s * (0.3 + k * 0.2)); c.lineTo(x + s, y + s * (0.3 + k * 0.2)); c.stroke(); }
        c.fillStyle = '#8a8478'; for (let k = 0; k < 3; k++) c.fillRect(x + k * s / 3 + 2, y + s * 0.02, s / 3 - 6, s * 0.16);
      } else if (t === 'gate') {
        c.fillStyle = '#6a6458'; c.fillRect(x, y + s * 0.15, s, s * 0.7);
        c.fillStyle = '#5a3a1a'; c.beginPath(); c.moveTo(x + s * 0.2, y + s * 0.85); c.lineTo(x + s * 0.2, y + s * 0.4); c.quadraticCurveTo(x + s * 0.5, y + s * 0.15, x + s * 0.8, y + s * 0.4); c.lineTo(x + s * 0.8, y + s * 0.85); c.fill();
        c.fillStyle = '#c9a227'; for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(x + s * (0.3 + (k % 3) * 0.2), y + s * (0.5 + Math.floor(k / 3) * 0.2), 1.5, 0, 7); c.fill(); }
      } else if (t === 'keep') {
        c.fillStyle = '#8a2a1a'; c.fillRect(x + s * 0.12, y + s * 0.35, s * 0.76, s * 0.55);
        c.fillStyle = '#2a2a2a'; c.beginPath(); c.moveTo(x, y + s * 0.4); c.lineTo(x + s * 0.5, y + s * 0.08); c.lineTo(x + s, y + s * 0.4); c.fill();
        c.fillStyle = '#c9a227'; c.fillRect(x + s * 0.44, y + s * 0.55, s * 0.12, s * 0.35);
      } else if (t === 'road') {
        c.fillStyle = 'rgba(120,90,50,0.25)'; c.fillRect(x + s * 0.3, y, s * 0.4, s);
      }
      c.strokeStyle = 'rgba(0,0,0,0.08)'; c.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
    }
  }

  // ---------- 描画 ----------
  function draw() {
    if (!B || !ctx) return;
    const s = cell;
    ctx.clearRect(0, 0, s * COLS, s * ROWS);
    ctx.drawImage(terrainLayer, 0, 0, s * COLS, s * ROWS);
    // 城門の耐久
    const gt = B.tiles[2][4];
    if (gt.t === 'gate') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(4 * s + 3, 2 * s + s - 7, s - 6, 4);
      ctx.fillStyle = '#e0c040'; ctx.fillRect(4 * s + 3, 2 * s + s - 7, (s - 6) * B.gateHP / B.gateMax, 4);
    } else if (gt.t === 'road') { ctx.fillStyle = 'rgba(40,20,10,0.5)'; ctx.fillRect(4 * s + 4, 2 * s + 4, s - 8, s - 8); }
    // 炎
    for (let r = 0; r < ROWS; r++) for (let q = 0; q < COLS; q++) if (B.tiles[r][q].fire > 0) {
      for (let k = 0; k < 3; k++) particles.push({ x: q * s + rnd(4, s - 4), y: r * s + rnd(s * 0.4, s - 2), vx: rnd(-0.2, 0.2), vy: rnd(-1.4, -0.6), life: rnd(20, 40), max: 40, col: Math.random() < 0.5 ? '#ff7a1a' : '#ffd23a', size: rnd(3, 6) });
      ctx.fillStyle = 'rgba(255,90,0,0.25)'; ctx.fillRect(q * s, r * s, s, s);
    }
    // 移動範囲
    if (B.reach) { B.reach.forEach(k => { const [r, q] = k.split(',').map(Number); ctx.fillStyle = 'rgba(80,160,255,0.35)'; ctx.fillRect(q * s + 1, r * s + 1, s - 2, s - 2); }); }
    if (B.targets) { B.targets.forEach(([r, q]) => { ctx.strokeStyle = '#ff3b2f'; ctx.lineWidth = 3; ctx.strokeRect(q * s + 2, r * s + 2, s - 4, s - 4); ctx.fillStyle = 'rgba(255,60,40,0.2)'; ctx.fillRect(q * s + 2, r * s + 2, s - 4, s - 4); }); }
    // 部隊
    B.units.filter(u => u.alive).sort((a, b) => a.y - b.y).forEach(u => drawUnit(u));
    // 粒子
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; ctx.globalAlpha = p.life / p.max; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0, p.size * p.life / p.max), 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1;
    // 矢・斬撃などの一時描画
    const now = performance.now();
    anims = anims.filter(a => now - a.t0 < a.dur);
    anims.forEach(a => a.draw((now - a.t0) / a.dur));
    // 数字
    floaters = floaters.filter(f => now - f.t0 < 1100);
    floaters.forEach(f => {
      const k = (now - f.t0) / 1100;
      ctx.globalAlpha = 1 - k; ctx.font = `bold ${Math.round(s * 0.36)}px sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(f.text, f.x, f.y - k * s * 0.8);
      ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, f.y - k * s * 0.8);
      ctx.globalAlpha = 1;
    });
    // 雨
    if (B.weather === 'rain') { ctx.strokeStyle = 'rgba(200,220,255,0.35)'; ctx.lineWidth = 1; for (let k = 0; k < 40; k++) { const x = Math.random() * s * COLS, y = Math.random() * s * ROWS; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 10); ctx.stroke(); } }
  }

  function drawUnit(u) {
    const s = cell, x = u.x * s, y = u.y * s;
    const col = u.fi === null ? '#777' : G.factions[u.fi].color;
    const shake = u.shake ? Math.sin(performance.now() / 20) * 3 : 0;
    const cx = x + s / 2 + shake, cy = y + s / 2;
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx + 2, cy + s * 0.32, s * 0.36, s * 0.12, 0, 0, 7); ctx.fill();
    // 兵（小さな人影の群れ）
    const n = clamp(Math.ceil(u.troops / 1200), 1, 6);
    for (let k = 0; k < n; k++) {
      const ox = (k % 3 - 1) * s * 0.22, oy = Math.floor(k / 3) * s * 0.16 + s * 0.08;
      ctx.fillStyle = shadeHex(col, 0.6); ctx.fillRect(cx + ox - 3, cy + oy - 2, 6, 9);
      ctx.fillStyle = '#e2c09a'; ctx.beginPath(); ctx.arc(cx + ox, cy + oy - 4, 2.6, 0, 7); ctx.fill();
      ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + ox + 3, cy + oy + 6); ctx.lineTo(cx + ox + 5, cy + oy - 9); ctx.stroke();
    }
    // 旗
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - s * 0.32, cy + s * 0.25); ctx.lineTo(cx - s * 0.32, cy - s * 0.45); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx - s * 0.31, cy - s * 0.45); ctx.lineTo(cx + s * 0.08, cy - s * 0.42); ctx.lineTo(cx - s * 0.02, cy - s * 0.3); ctx.lineTo(cx + s * 0.08, cy - s * 0.16); ctx.lineTo(cx - s * 0.31, cy - s * 0.14); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = isLight(col) ? '#222' : '#fff'; ctx.font = `bold ${Math.round(s * 0.24)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(u.gi >= 0 ? u.g.name[0] : (u.src != null ? '援' : '守'), cx - s * 0.13, cy - s * 0.29);
    if (u.commander) { ctx.fillStyle = '#ffd23a'; ctx.font = `${Math.round(s * 0.22)}px serif`; ctx.fillText('★', cx + s * 0.26, cy - s * 0.36); }
    // 兵力バー
    const w = s * 0.8, bx = x + s * 0.1, by = y + s - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, w, 5);
    ctx.fillStyle = u.side === B.playerSide ? '#4fd36a' : '#ff5a4a'; ctx.fillRect(bx, by, w * clamp(u.troops / u.maxTroops, 0, 1), 5);
    // 選択・行動済み
    if (B.sel === u) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.strokeRect(x + 2, y + 2, s - 4, s - 4); }
    if (u.acted && u.side === B.playerSide && !B.over) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 1, y + 1, s - 2, s - 2); }
    if (u.confused > 0) { ctx.fillStyle = '#ffd23a'; ctx.font = `${Math.round(s * 0.3)}px sans-serif`; ctx.fillText('？', cx + s * 0.3, cy); }
    ctx.textBaseline = 'alphabetic';
  }
  function shadeHex(hex, k) { const n = parseInt(hex.slice(1), 16); const r = Math.round((n >> 16) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k); return `rgb(${r},${g},${b})`; }
  function isLight(hex) { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) > 170; }

  // ---------- HUD ----------
  function updateHUD() {
    if (typeof Auto !== 'undefined' && Auto.running) setTimeout(() => Auto.place(), 0);
    const tot = side => B.units.filter(u => u.alive && u.side === side).reduce((s, u) => s + u.troops, 0);
    const an = B.atkFi === null ? '' : G.factions[B.atkFi].name, dn = B.defFi === null ? '守備隊' : G.factions[B.defFi].name;
    hud.innerHTML = `
      <div class="b-hud-row"><span class="b-day">${B.day}<small>/${CONFIG.BATTLE_DAYS}日</small></span><span class="b-w">${WNAME[B.weather]}</span><span class="b-city">${B.to.name}攻防戦</span><span class="b-food">兵糧 ${Math.max(0, Math.round(B.food))}</span></div>
      <div class="b-hud-row b-vs"><span style="color:${G.factions[B.atkFi].color}">攻 ${an} ${tot('atk')}</span><span>vs</span><span style="color:${B.defFi === null ? '#aaa' : G.factions[B.defFi].color}">守 ${dn} ${tot('def')}</span></div>`;
  }
  function showInfo(u) {
    if (!u) { info.innerHTML = `<div class="b-tip">${B.playerSide === 'atk' ? '本丸（城の天守）を占領するか、敵の総大将★を倒せば勝ち' : '30日守り切るか、敵の総大将★を倒せば勝ち'}</div>`; return; }
    const g = u.g;
    const t = B.tiles[u.r][u.c].t;
    info.innerHTML = `<div class="b-unit">
      <img src="${Portrait.get(g, u.troops < u.maxTroops * 0.3 ? 'sad' : 'normal', u.fi === null ? '#777' : G.factions[u.fi].color)}" />
      <div class="b-unit-body">
        <div class="b-unit-name">${g.name}${u.commander ? ' <span class="star">★総大将</span>' : ''} <small>${u.side === 'atk' ? '攻' : '守'}</small></div>
        <div class="b-unit-stat">兵 <b>${u.troops}</b> / 士気 ${Math.round(u.morale)} / ${TNAME[t]}</div>
        <div class="b-unit-stat">統${g.lead || '-'} 武${g.war} 知${g.int}　${(g.traits || []).map(x => `<span class="trait">${x}</span>`).join('')}</div>
      </div></div>`;
  }
  function setActions(list) {
    actions.innerHTML = '';
    list.forEach(a => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.cls || ''); b.textContent = a.label; b.disabled = !!a.disabled;
      b.onclick = () => { Sound.se('tap'); a.fn(); };
      actions.appendChild(b);
    });
  }
  function banner(text, ms = 1200) {
    const el = root.querySelector('.b-banner');
    el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    return sleep(ms);
  }

  // ---------- 盤面の計算 ----------
  const unitAt = (r, c) => B.units.find(u => u.alive && u.r === r && u.c === c);
  const inb = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const dist = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
  function tileCost(u, r, c) {
    const t = B.tiles[r][c].t;
    if (t === 'water') return Game.has(u.g, '水軍') ? 2 : 99;
    if (t === 'gate') return u.side === 'def' ? 1 : 99;
    if (t === 'ford' && Game.has(u.g, '水軍')) return 1;
    if (B.tiles[r][c].fire > 0) return 99;
    return COST[t];
  }
  function moveRange(u) {
    let mp = 3 + (Game.has(u.g, '騎馬') ? 1 : 0) - (B.weather === 'rain' ? 1 : 0);
    const best = { [u.r + ',' + u.c]: mp };
    const q = [[u.r, u.c, mp]];
    while (q.length) {
      const [r, c, m] = q.shift();
      // 敵に隣接していたらそこで止まる（足止め）
      if (!(r === u.r && c === u.c) && DIRS.some(([dr, dc]) => { const o = unitAt(r + dr, c + dc); return o && o.side !== u.side; })) continue;
      DIRS.forEach(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        if (!inb(nr, nc)) return;
        const o = unitAt(nr, nc);
        if (o && o.side !== u.side) return;
        const cost = tileCost(u, nr, nc);
        const left = m - cost;
        if (left < 0) return;
        const k = nr + ',' + nc;
        if (best[k] === undefined || best[k] < left) { best[k] = left; q.push([nr, nc, left]); }
      });
    }
    return Object.keys(best).filter(k => { const [r, c] = k.split(',').map(Number); const o = unitAt(r, c); return !o || o === u; });
  }
  function attackTargets(u, r = u.r, c = u.c) {
    let range = Game.has(u.g, '弓術') ? 2 : 1;
    // 城壁の上からは、城外の敵にも矢が届く
    if (u.side === 'def' && r <= 2 && B.tiles[2][4].t === 'gate' && ['inner', 'gate'].includes(B.tiles[r][c].t)) range = 2;
    const res = B.units.filter(o => o.alive && o.side !== u.side && Math.abs(o.r - r) + Math.abs(o.c - c) <= range);
    const out = res.map(o => [o.r, o.c]);
    if (u.side === 'atk' && B.tiles[2][4].t === 'gate' && Math.abs(2 - r) + Math.abs(4 - c) <= 1) out.push([2, 4]);
    return out;
  }
  function plotTargets(u) { return B.units.filter(o => o.alive && o.side !== u.side && dist(u, o) <= 2).map(o => [o.r, o.c]); }
  function duelTargets(u) { return B.units.filter(o => o.alive && o.side !== u.side && o.gi >= 0 && u.gi >= 0 && dist(u, o) === 1).map(o => [o.r, o.c]); }

  // ---------- 戦闘計算 ----------
  function bondBonus(u) { const list = u.side === 'atk' ? B.bondAtk : B.bondDef; return list.filter(b => b.members.includes(u.g.name) && b.members.filter(m => B.units.some(v => v.alive && v.side === u.side && v.g.name === m)).length >= 2).reduce((s, b) => s + b.bonus, 0); }
  function calcDamage(a, d, ranged) {
    const ag = a.g, dg = d.g;
    const aVal = (ag.lead || 40) * 0.55 + ag.war * 0.45, dVal = (dg.lead || 40) * 0.65 + dg.war * 0.25 + dg.int * 0.1;
    const t = B.tiles[d.r][d.c].t;
    let k = Math.pow(a.troops, 0.85) * 0.75 * (aVal / Math.max(20, dVal)) / DEFK[t];
    k *= (0.6 + (a.train || 50) / 250) * (0.5 + a.morale / 160) * (1 + bondBonus(a));
    if (Game.has(ag, '猪突')) k *= 1.1;
    if (Game.has(dg, '慎重')) k *= 0.9;
    const at = B.tiles[a.r][a.c].t;
    if ((at === 'water' || at === 'ford' || t === 'water' || t === 'ford')) k *= Game.has(ag, '水軍') ? 1.25 : 0.9;
    if (ranged) k *= B.weather === 'rain' ? 0.5 : 0.7;
    if (B.weather === 'rain') k *= 0.9;
    if (B.rally && B.rally[a.side] > 0) k *= 1.3;   // 背水の陣
    if (B.buff) { k *= B.buff[a.side].atk; k *= B.buff[d.side].guard; }   // 必殺技の効果
    // 能力の上位者：豪傑は攻撃↑、名将は攻撃↑・被害↓
    if (a.gi >= 0) { k *= Game.topK(ag, 'war', 1.12, 1.22); k *= Game.topK(ag, 'lead', 1.08, 1.15); }
    if (d.gi >= 0) k /= Game.topK(dg, 'lead', 1.12, 1.2);
    // 城壁：城内・城門・本丸の守り手は、城壁の値に応じて被害が減る。門が破れると守りは半減
    const castle = ['inner', 'keep', 'gate'];
    if (d.side === 'def' && castle.includes(t)) k /= 1 + B.to.def / 600 * (gateUp() ? 1 : 0.5);
    // 城壁の上からの矢は届く
    if (a.side === 'def' && ranged && castle.includes(at) && gateUp()) k *= 1 + B.to.def / 1400;
    return Math.max(30, Math.round(k * rnd(0.85, 1.15)));
  }

  function addFloater(r, c, text, col = '#fff') { floaters.push({ x: c * cell + cell / 2, y: r * cell + cell * 0.4, text, col, t0: performance.now() }); }
  // 部隊の頭上に吹き出しで台詞を出す（流れを止めない）
  function bubble(u, text) {
    if (!text || auto) return;
    const t0 = performance.now();
    anims.push({ t0, dur: 1800, draw: k => {
      const s = cell, x = clamp(u.x * s + s / 2, 50, s * COLS - 50), y = Math.max(16, u.y * s - 4);
      ctx.globalAlpha = k < 0.1 ? k * 10 : k > 0.8 ? (1 - k) * 5 : 1;
      ctx.font = `bold ${Math.round(s * 0.3)}px sans-serif`;
      const w = Math.min(s * COLS - 8, ctx.measureText(text).width + 12), h = s * 0.46;
      ctx.fillStyle = 'rgba(255,250,235,0.95)'; ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h, w, h, 6) : ctx.rect(x - w / 2, y - h, w, h); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x, y + 6); ctx.lineTo(x + 4, y); ctx.fill();
      ctx.fillStyle = '#2a1a10'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y - h / 2, w - 8); ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 1;
    } });
  }

  function slash(r, c) {
    const s = cell; anims.push({ t0: performance.now(), dur: 300, draw: k => { ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(c * s + s * 0.15, r * s + s * (0.15 + k * 0.2)); ctx.lineTo(c * s + s * 0.85, r * s + s * (0.65 + k * 0.2)); ctx.stroke(); } });
  }
  function arrow(a, d) {
    const s = cell; anims.push({ t0: performance.now(), dur: 400, draw: k => { const x = (a.c + (d.c - a.c) * k) * s + s / 2, y = (a.r + (d.r - a.r) * k) * s + s / 2 - Math.sin(k * Math.PI) * s * 0.6; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (d.c - a.c) * 8, y - (d.r - a.r) * 8); ctx.stroke(); } });
  }

  async function animateMove(u, r, c) {
    const fr = u.y, fc = u.x, t0 = performance.now(), dur = 220 + 60 * (Math.abs(r - fr) + Math.abs(c - fc));
    u.r = r; u.c = c;
    if (!auto && (r !== fr || c !== fc)) Sound.se('horse');
    await new Promise(res => { const step = () => { const k = Math.min(1, (performance.now() - t0) / dur * (G.opts.aiSpeed || 1)); const e = k * (2 - k); u.y = fr + (r - fr) * e; u.x = fc + (c - fc) * e; if (k < 1) requestAnimationFrame(step); else res(); }; step(); });
  }

  async function doAttack(a, r, c) {
    if (r === 2 && c === 4 && B.tiles[2][4].t === 'gate' && !unitAt(r, c)) {
      // 城門攻撃
      const dmg = Math.round(Math.pow(a.troops, 0.8) * 0.9 * ((a.g.lead || 40) + a.g.war) / 120 * rnd(0.85, 1.15));
      B.gateHP -= dmg; Sound.se('hit'); slash(r, c); addFloater(r, c, `門-${dmg}`, '#ffd23a');
      if (B.gateHP <= 0) {
        // 城壁が堅いほど、崩れるのは門だけで済みやすい（門だけ／片側も／両脇まで）
        const q = clamp(B.to.def / 800, 0, 1), rr = Math.random();
        const pOnly = 0.2 + 0.45 * q, pBoth = 0.45 - 0.3 * q;
        const side = Math.random() < 0.5 ? 3 : 5;
        const broken = rr < pOnly ? [] : rr < pOnly + pBoth ? [3, 5] : [side];
        B.tiles[2][4].t = 'road'; broken.forEach(c => { B.tiles[2][c].t = 'road'; });
        buildTerrainLayer(window.devicePixelRatio || 1);
        B.gateDay = B.day; Sound.se('gateBreak'); await banner('城門、破れたり！', 1000);
        addLog(`${a.g.name}隊が城門を破った！ ${broken.length === 2 ? '両脇の城壁も崩れ落ちた' : broken.length ? '城壁の一角も崩れた' : 'だが城壁は持ちこたえている'}`);
        await tryMilitia('gate');
      }
      a.acted = true; await sleep(400); return;
    }
    const d = unitAt(r, c);
    if (!d) return;
    // 華容道：関羽は追い詰められた曹操を見逃す（ゲーム中1回）
    if (a.g.name === '関羽' && d.g.name === '曹操' && d.troops < d.maxTroops * 0.35 && !(G.events && G.events.huarong)) {
      G.events.huarong = true;
      if (!auto) {
        await UI.talk(d.g, 'sad', '曹操「雲長、かつての情けを覚えておるか……」', G.factions[d.fi].color, { tag: '華容道' });
        await UI.talk(a.g, 'sad', '関羽「……行け。これで恩は返した」', G.factions[a.fi].color, { tag: '華容道' });
      }
      d.alive = false; d.status = 'retreat'; a.acted = true;
      addLog('華容道：関羽は曹操を見逃した');
      return;
    }
    const ranged = dist(a, d) > 1;
    if (a.gi >= 0 && Math.random() < (a.side === B.playerSide ? 0.45 : 0.3)) bubble(a, line(a.g, 'attack'));
    const dmg = calcDamage(a, d, ranged);
    if (ranged) { Sound.se(a.troops > 3000 ? 'volley' : 'arrow'); arrow(a, d); await sleep(350); } else { Sound.se('slash'); slash(r, c); }
    d.shake = true; setTimeout(() => d.shake = false, 300);
    d.troops = Math.max(0, d.troops - dmg); d.morale = Math.max(0, d.morale - dmg / Math.max(500, d.maxTroops) * 40);
    addFloater(d.r, d.c, '-' + dmg, '#ff6a5a');
    a.morale = Math.min(100, a.morale + 3);
    // 反撃
    if (!ranged && d.troops > 0) {
      await sleep(250);
      const back = Math.round(calcDamage(d, a, false) * 0.5);
      a.troops = Math.max(0, a.troops - back); a.shake = true; setTimeout(() => a.shake = false, 300);
      addFloater(a.r, a.c, '-' + back, '#ff6a5a'); Sound.se('hit');
    }
    a.acted = true;
    await sleep(450);
    await checkRout(d, a); await checkRout(a, d);
  }

  async function checkRout(u, by) {
    if (!u.alive) return;
    if (u.troops <= 0) {
      u.alive = false;
      const r = Math.random();
      if (u.gi >= 0) {
        if (r < 0.06) { u.status = 'killed'; addLog(`${u.g.name}、討ち死に！`); await say(u, 'sad', `${u.g.name}「${line(u.g, 'defeat')}」`); }
        else if (r < 0.6) { u.status = 'captured'; addLog(`${u.g.name}を捕らえた！`); }
        else { u.status = 'fled'; addLog(`${u.g.name}隊は壊滅し、${u.g.name}は落ち延びた`); }
      } else { addLog('守備隊は壊滅した'); }
      return;
    }
    // 臆病・士気崩壊による退却
    if ((Game.has(u.g, '臆病') && u.troops < u.maxTroops * 0.3) || u.morale < 12) {
      u.alive = false; u.status = 'retreat';
      addLog(`${u.g.name}隊が退却した`);
      if (u.gi >= 0) await say(u, 'shock', `${u.g.name}「${line(u.g, 'flee')}」`);
    }
  }

  function addLog(t) { B.log.unshift(t); const el = root && root.querySelector('.b-tip'); if (el) el.textContent = t; }
  async function say(u, expr, text) {
    if (auto) return;
    await UI.talk(u.g, expr, text, u.fi === null ? '#777' : G.factions[u.fi].color, { quick: true });
  }

  // ---------- 計略 ----------
  async function doPlot(a, kind, d) {
    const H = Game.has;
    let p = 0.35 + (a.g.int - d.g.int) / 90 + (H(a.g, '智謀') ? 0.15 : 0) - (H(d.g, '神算') ? 0.3 : 0) + (a.gi >= 0 && Game.top(a.g, 'int') ? 0.15 : 0) - (d.gi >= 0 && Game.top(d.g, 'int') ? 0.2 : 0);
    if (kind === 'fire' && B.weather === 'rain') p = 0;
    if (kind === 'fire' && ['water', 'ford', 'wall', 'keep', 'gate'].includes(B.tiles[d.r][d.c].t)) p *= 0.3;
    a.acted = true;
    if (!auto && a.side === B.playerSide && !B.watch) await say(a, 'normal', `${a.g.name}「${line(a.g, kind === 'fire' ? 'fire' : 'confuse')}」`);
    else bubble(a, line(a.g, kind === 'fire' ? 'fire' : 'confuse'));
    if (Math.random() > clamp(p, 0.05, 0.9)) {
      addFloater(d.r, d.c, '失敗', '#aaa'); addLog(`${a.g.name}の${kind === 'fire' ? '火計' : '混乱'}は${H(d.g, '神算') ? '見破られた' : '失敗した'}`);
      Sound.se('ng'); await sleep(500); return;
    }
    if (kind === 'fire') {
      Sound.se('fire');
      B.tiles[d.r][d.c].fire = irnd(2, 3);
      const dmg = Math.round(d.troops * rnd(0.12, 0.2) + 200);
      d.troops = Math.max(0, d.troops - dmg); d.morale = Math.max(0, d.morale - 15);
      addFloater(d.r, d.c, '火-' + dmg, '#ffb02a'); addLog(`${a.g.name}の火計！ ${d.g.name}隊が炎に包まれた`);
      // 延焼
      DIRS.forEach(([dr, dc]) => { const r = d.r + dr, c = d.c + dc; if (inb(r, c) && ['forest', 'plain', 'road'].includes(B.tiles[r][c].t) && Math.random() < (B.tiles[r][c].t === 'forest' ? 0.5 : 0.2)) B.tiles[r][c].fire = 2; });
    } else {
      d.confused = 2; addFloater(d.r, d.c, '混乱', '#ffd23a'); addLog(`${d.g.name}隊は混乱した！`); Sound.se('confuse');
    }
    await sleep(600);
    await checkRout(d, a);
  }

  // ---------- 必殺技 ----------
  function cutin(u, sk) {
    if (auto) return Promise.resolve();
    const el = document.getElementById('cutin');
    const col = u.fi === null ? '#777' : G.factions[u.fi].color;
    el.innerHTML = `<div class="ci-band" style="--c:${col}"><img src="${Portrait.get(u.g, 'angry', col)}"><div class="ci-txt"><div class="ci-who">${u.g.name}</div><div class="ci-name">${sk.name}</div><div class="ci-line">「${sk.line}」</div></div></div>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    Sound.se('skill');
    return sleep(1700).then(() => el.classList.remove('show'));
  }
  // 目標を選ぶ必要がある技なら、その候補マス。不要なら null
  function skillTargets(u, sk) {
    const foes = B.units.filter(o => o.alive && o.side !== u.side);
    switch (sk.type) {
      case 'strike': case 'sweep': case 'dash': return sk.type === 'sweep' ? null : foes.filter(o => dist(o, u) === 1).map(o => [o.r, o.c]);
      case 'ranged': return foes.filter(o => dist(o, u) <= sk.range).map(o => [o.r, o.c]);
      case 'fire': case 'chain': return foes.filter(o => dist(o, u) <= sk.range).map(o => [o.r, o.c]);
      default: return null;
    }
  }
  function skillReady(u) {
    const sk = SKILLS[u.g.name]; if (!sk || u.skillUsed) return false;
    const foes = B.units.filter(o => o.alive && o.side !== u.side);
    if (sk.type === 'sweep') return foes.some(o => dist(o, u) === 1);
    if (sk.type === 'roar' || sk.type === 'confuse') return foes.some(o => dist(o, u) <= (sk.range || 2));
    if ((sk.type === 'fire' || sk.type === 'chain') && B.weather === 'rain') return false;
    const tg = skillTargets(u, sk);
    return tg ? tg.length > 0 : true;
  }
  async function aiSkill(u) {
    const sk = SKILLS[u.g.name];
    if (!sk || u.gi < 0 || u.skillUsed || u.acted || !skillReady(u)) return false;
    const foes = B.units.filter(o => o.alive && o.side !== u.side);
    const allies = B.units.filter(o => o.alive && o.side === u.side);
    // 使いどころ：攻撃系は敵が隣・射程に、範囲系は2部隊以上、強化は戦いが始まってから、回復は兵が減ってから
    let p = 0.55;
    if (sk.type === 'roar' || sk.type === 'confuse') p = foes.filter(o => dist(o, u) <= (sk.range || 2)).length >= 2 || sk.target ? 0.6 : 0.2;
    if (sk.type === 'buff') p = foes.some(o => allies.some(a => dist(a, o) <= 2)) ? 0.55 : 0;
    if (sk.type === 'heal') p = allies.reduce((s2, a) => s2 + a.troops, 0) < allies.reduce((s2, a) => s2 + a.maxTroops, 0) * 0.7 ? 0.7 : 0;
    if (sk.type === 'sweep') p = foes.filter(o => dist(o, u) === 1).length >= 2 ? 0.8 : 0.35;
    if (B.watch && u.side === B.playerSide) p = Math.min(0.9, p + 0.15 * B.smart);
    if (Math.random() >= p) return false;
    let target = null;
    const tg = skillTargets(u, sk);
    if (tg) {
      const cands = tg.map(([r, c]) => unitAt(r, c)).filter(Boolean);
      if (!cands.length) return false;
      cands.sort((a, b) => (b.commander ? 5000 : 0) + b.troops - (a.commander ? 5000 : 0) - a.troops);
      target = cands[0];
    }
    await useSkill(u, target);
    return true;
  }
  async function useSkill(u, target) {
    const sk = SKILLS[u.g.name];
    u.skillUsed = true; u.acted = true;
    await cutin(u, sk);
    addLog(`${u.g.name}の必殺技「${sk.name}」！`);
    const foes = () => B.units.filter(o => o.alive && o.side !== u.side);
    const hit = async (d, mult) => {
      const dmg = Math.round(calcDamage(u, d, false) * mult);
      d.troops = Math.max(0, d.troops - dmg); d.morale = Math.max(0, d.morale - 12); d.shake = true; setTimeout(() => d.shake = false, 350);
      slash(d.r, d.c); addFloater(d.r, d.c, '-' + dmg, '#ffd23a'); Sound.se('hit');
      await sleep(260);
      await checkRout(d, u);
    };
    switch (sk.type) {
      case 'strike': case 'dash':
        if (target) await hit(target, sk.mult);
        if (target && sk.extra === 'confuse' && target.alive) { target.confused = 2; addFloater(target.r, target.c, '混乱', '#ffd23a'); }
        if (sk.extra === 'fear') foes().filter(o => dist(o, u) <= 2).forEach(o => { o.morale = Math.max(0, o.morale - 15); });
        if (sk.extra === 'rally') B.units.filter(o => o.alive && o.side === u.side).forEach(o => o.morale = Math.min(100, o.morale + 15));
        if (sk.extra === 'self') u.morale = 100;
        if (sk.type === 'dash') { u.acted = false; addLog(`${u.g.name}はさらに駆ける！`); if (B.watch || u.side !== B.playerSide || auto) { await sleep(200); if (u.alive && !B.over) await aiUnit(u, false); } }
        break;
      case 'sweep':
        for (const d of foes().filter(o => dist(o, u) === 1)) await hit(d, sk.mult);
        break;
      case 'ranged':
        if (target) { arrow(u, target); Sound.se('arrow'); await sleep(300); await hit(target, sk.mult); }
        break;
      case 'roar':
        foes().filter(o => dist(o, u) <= sk.range).forEach(o => { o.morale = Math.max(0, o.morale - sk.morale); if (Math.random() < sk.conf) { o.confused = 2; addFloater(o.r, o.c, '混乱', '#ffd23a'); } else addFloater(o.r, o.c, '士気↓', '#aaf'); });
        for (const o of foes()) await checkRout(o, u);
        break;
      case 'confuse': {
        let list = foes().filter(o => dist(o, u) <= sk.range);
        if (sk.target === 'commander') { const c = foes().find(o => o.commander); list = c ? [c] : list; }
        list.forEach(o => { if (sk.target === 'commander' || Math.random() < sk.prob) { o.confused = 2; addFloater(o.r, o.c, '混乱', '#ffd23a'); } if (sk.morale) o.morale = Math.max(0, o.morale - sk.morale); });
        if (sk.guard) { B.buff[u.side].guard = sk.guard; B.buff[u.side].days = sk.days; addLog('味方の守りが固まった（2日間）'); }
        break;
      }
      case 'fire': {
        if (!target) break;
        Sound.se('fire');
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const r = target.r + dr, c = target.c + dc; if (inb(r, c) && !['water', 'wall', 'gate', 'keep'].includes(B.tiles[r][c].t)) B.tiles[r][c].fire = 2; }
        for (const o of foes().filter(o => Math.abs(o.r - target.r) <= 1 && Math.abs(o.c - target.c) <= 1)) { const dmg = Math.round(o.troops * sk.dmg + 300); o.troops = Math.max(0, o.troops - dmg); o.morale = Math.max(0, o.morale - 15); addFloater(o.r, o.c, '火-' + dmg, '#ffb02a'); await checkRout(o, u); }
        break;
      }
      case 'chain': {
        if (!target) break;
        // 隣り合ってつながった敵部隊をすべてたどる
        const seen = new Set([target]), q = [target];
        while (q.length) { const x = q.shift(); foes().forEach(o => { if (!seen.has(o) && dist(o, x) === 1) { seen.add(o); q.push(o); } }); }
        Sound.se('fire');
        for (const o of seen) { if (!['water'].includes(B.tiles[o.r][o.c].t)) B.tiles[o.r][o.c].fire = 2; const dmg = Math.round(o.troops * sk.dmg + 250); o.troops = Math.max(0, o.troops - dmg); o.morale = Math.max(0, o.morale - 12); addFloater(o.r, o.c, '火-' + dmg, '#ffb02a'); await sleep(150); await checkRout(o, u); }
        addLog(`炎は${seen.size}部隊に燃え広がった！`);
        break;
      }
      case 'buff':
        B.buff[u.side].atk = sk.atk || 1; B.buff[u.side].guard = sk.guard || 1; B.buff[u.side].days = sk.days;
        B.units.filter(o => o.alive && o.side === u.side).forEach(o => { o.morale = Math.min(100, o.morale + (sk.morale || 0)); addFloater(o.r, o.c, sk.atk ? '攻↑' : '守↑', '#7fe0ff'); });
        break;
      case 'heal':
        B.units.filter(o => o.alive && o.side === u.side).forEach(o => { const v = Math.round(o.maxTroops * sk.heal); o.troops = Math.min(o.maxTroops, o.troops + v); o.morale = Math.min(100, o.morale + sk.morale); addFloater(o.r, o.c, '+' + v, '#7fff9a'); });
        break;
    }
    updateHUD();
    await sleep(300);
  }

  // ---------- 特定の人物同士 ----------
  function pairOf(a, d) { return PAIRS.find(p => (p.who[0] === a.g.name && p.who[1] === d.g.name) || (p.who[1] === a.g.name && p.who[0] === d.g.name)); }
  async function pairTalk(p, a) {
    if (auto) return;
    for (const l of p.lines) {
      const nm = l.split('「')[0];
      const u = B.units.find(x => x.g.name === nm);
      await UI.talk(u ? u.g : null, 'angry', l, u && u.fi !== null ? G.factions[u.fi].color : undefined, { tag: p.title });
    }
  }

  // ---------- 一騎打ち ----------
  // 戦況に応じた合戦の曲（攻め／守り／劣勢）
  function baseBgm() { Sound.bgm(B.playerSide && outlook(B.playerSide) < -0.45 ? 'crisis' : B.playerSide === 'def' ? 'defend' : 'battle'); }
  // 戦況の見通し（-1：ジリ貧で負けそう 〜 +1：このまま押し切れそう）
  function outlook(side) {
    const sum = sd => B.units.filter(u => u.alive && u.side === sd).reduce((t, u) => t + u.troops * (0.5 + u.morale / 200), 0);
    const mine = sum(side), foe = sum(side === 'atk' ? 'def' : 'atk');
    const r = Math.log2(Math.max(0.1, mine) / Math.max(0.1, foe)) * 0.8;
    const prog = B.day / CONFIG.BATTLE_DAYS, gateBroken = B.tiles[2][4].t !== 'gate';
    const v = side === 'atk' ? r - Math.max(0, prog - 0.5) * 1.4 + (gateBroken ? 0.2 : 0) - (B.food < 1 ? 0.3 : 0)
                             : r + prog * 0.6 - (gateBroken ? 0.3 : 0);
    return clamp(v, -1, 1);
  }
  const isMusou = g => g.name === '呂布' || g.war >= 98;
  const isWeakVs = (dg, ag) => dg.war < 65 || ag.war - dg.war >= 15;
  // 一騎討ちを受けるか：負けそうなら一発逆転を狙って受け、勝てそうなら無理に受けない
  function willAcceptDuel(d, a) {
    if (d.gi < 0) return false;
    const adv = outlook(d.side), diff = (d.g.war - a.g.war) / 60;
    const hot = Game.has(d.g, '剛勇') || Game.has(d.g, '猪突');
    const heroes = d.g.war >= 85 && a.g.war >= 85;   // 豪傑同士は引き合う
    // 天下無双（呂布など武力98以上）は、誰の挑戦でもすべて受けて立つ
    if (isMusou(d.g)) return true;
    // 君主は負ければ命を落としかねない。武力で10以上勝る相手でなければ受けない
    if (d.g.isLord) { if (d.g.war >= a.g.war + 10 && Math.random() < 0.7) return true; d._lordHeld = true; return false; }
    // 弱い武将（武力65未満、または相手より15以上劣る）は基本的に受けない。猪突だけはまれに無謀に受ける
    if (isWeakVs(d.g, a.g)) return Game.has(d.g, '猪突') && !d.commander && Math.random() < 0.15;
    // 総大将は討たれると負け。基本は受けない。ジリ貧で負けが見えた時だけ、賭けに出る
    if (d.commander) {
      const line0 = hot ? -0.3 : -0.5;
      if (adv > line0) { d._held = true; return false; }
      const ok = Math.random() < clamp(0.3 + (line0 - adv) * 0.6 + diff + (hot ? 0.15 : 0), 0.05, 0.9);
      if (ok) d._desperate = true; else d._held = true;
      return ok;
    }
    if (Game.has(d.g, '猪突') || heroes) return Math.random() < 0.9;
    let p = 0.45 - adv * 0.35 + diff;
    if (Game.has(d.g, '剛勇')) p += 0.25;
    if (Game.has(d.g, '臆病') || Game.has(d.g, '慎重')) p -= 0.2;
    const ok = Math.random() < clamp(p, 0.05, 0.95);
    if (!ok && adv > 0.3) d._winning = true;
    return ok;
  }
  async function doDuel(a, d) {
    a.acted = true;
    // 典韋の護衛：主君（曹操）への一騎討ちを引き受ける
    if (d.g.name === '曹操') { const dw = B.units.find(x => x.alive && x.side === d.side && x.g.name === '典韋' && dist(x, a) <= 2); if (dw) { if (!auto) await UI.talk(dw.g, 'angry', '典韋「殿には指一本触れさせん！ 相手はこの俺だ！」', G.factions[dw.fi].color, { tag: '護衛' }); d = dw; } }
    // 三英戦呂布：劉備・関羽・張飛のうち2人以上がいると、三人がかりで呂布を退ける
    const lu = a.g.name === '呂布' ? a : d.g.name === '呂布' ? d : null;
    if (lu) {
      const other = lu === a ? d : a;
      const trio = B.units.filter(x => x.alive && x.side === other.side && ['劉備', '関羽', '張飛'].includes(x.g.name));
      if (trio.length >= 2 && trio.includes(other) && !B.trioDone) {
        B.trioDone = true;
        if (!auto) {
          await UI.talk(other.g, 'angry', `${trio.map(x => x.g.name).join('・')}「三人でかかれ！ 呂布を討て！」`, G.factions[other.fi].color, { tag: '三英戦呂布' });
          await UI.talk(lu.g, 'shock', '呂布「三人がかりとは……！ ちっ、ここは退く！」', G.factions[lu.fi] ? G.factions[lu.fi].color : '#777', { tag: '三英戦呂布' });
        }
        lu.alive = false; lu.status = 'fled'; lu.troops = Math.round(lu.troops * 0.7);
        trio.forEach(x => { x.morale = Math.min(100, x.morale + 25); if (x.gi >= 0 && x.fi === G.player) G.gens[x.gi].duels++; });
        B.units.filter(x => x.alive && x.side === lu.side).forEach(x => x.morale = Math.max(0, x.morale - 15));
        addLog('三英戦呂布！ 呂布は三人の猛攻に退いた');
        return;
      }
    }
    const pair = pairOf(a, d);
    if (pair && pair.kind === 'draw') {
      await pairTalk(pair, a);
      a.morale = Math.min(100, a.morale + 20); d.morale = Math.min(100, d.morale + 20);
      if (pair.respect) [a, d].forEach(x => { if (x.gi >= 0) G.gens[x.gi].respect = (x === a ? d : a).g.name; });
      addLog(`${pair.title}：${a.g.name}と${d.g.name}の一騎打ちは決着がつかなかった`);
      return;
    }
    if (pair && pair.kind === 'normal') await pairTalk(pair, a);
    if (!auto) await UI.talk(a.g, 'angry', `${a.g.name}「${line(a.g, 'duelChallenge', { foe: d.g.name })}」`, G.factions[a.fi] ? G.factions[a.fi].color : '#777', { tag: '一騎討ち' });
    const accept = willAcceptDuel(d, a);
    if (!accept) {
      if (!auto) await UI.talk(d.g, 'normal', d._lordHeld ? `${d.g.name}「${pick(['一国の主が、匹夫の勇を競うわけにはいかぬ', '我が身はもはや我一人のものではない。相手にするな', '挑発には乗らん。将兵よ、わしを守れ'])}」` : d._held ? `${d.g.name}「……総大将が軽々しく動くわけにはいかん。相手にするな！」` : d._winning ? `${d.g.name}「${pick(['勝ち戦で、貴様の遊びに付き合う義理はない', 'ふん、焦っておるな。その手には乗らん', 'このまま押し潰せば済むこと。相手にするまでもない'])}」` : `${d.g.name}「${line(d.g, 'duelRefuse')}」`, G.factions[d.fi] ? G.factions[d.fi].color : '#777');
      d._held = false; d._winning = false; d._lordHeld = false;
      d.morale = Math.max(0, d.morale - 8); a.morale = Math.min(100, a.morale + 5);
      addLog(`${d.g.name}は一騎打ちを避けた（士気が下がった）`);
      return;
    }
    if (d._desperate) { d._desperate = false; if (!auto) await UI.talk(d.g, 'angry', `${d.g.name}「${pick(['このままではジリ貧……ならば、この一戦に賭ける！', '退いても先はない。よかろう、受けて立つ！', '大将自ら出るしかあるまい……！'])}」`, G.factions[d.fi] ? G.factions[d.fi].color : '#777', { tag: '総大将出陣' }); addLog(`総大将 ${d.g.name}が、劣勢を覆すべく一騎打ちに応じた`); }
    const res = auto ? Duel.quick(a.g, d.g) : await Duel.run(a, d, B.watch ? null : a.side === B.playerSide ? 'a' : d.side === B.playerSide ? 'd' : null, B.watch);
    baseBgm();
    if (pair && pair.kind === 'spare') { const wn = (res.winner === 'a' ? a : d).g.name; await pairTalk(pair.winLines ? Object.assign({}, pair, { lines: pair.winLines[wn] || [] }) : pair, a); res.outcome = 'fled'; const loser = res.winner === 'a' ? d : a; if (loser.gi >= 0) { const lg = G.gens[loser.gi]; lg.loyalty = Math.max(0, lg.loyalty - 15); lg.respect = (res.winner === 'a' ? a : d).g.name; } }
    const win = res.winner === 'a' ? a : d, lose = res.winner === 'a' ? d : a;
    win.morale = Math.min(100, win.morale + 20);
    B.units.filter(u => u.alive && u.side === lose.side).forEach(u => u.morale = Math.max(0, u.morale - 10));
    if (win.gi >= 0 && win.fi === G.player) { G.gens[win.gi].duels++; G.stats.duelsWon++; }
    lose.alive = false; lose.status = res.outcome; // killed / captured / fled
    addLog(`一騎打ち：${win.g.name}の勝利！ ${lose.g.name}は${res.outcome === 'killed' ? '討ち取られた' : res.outcome === 'captured' ? '捕らえられた' : '逃げ去った'}`);
    // 負けた部隊の兵は散る（半分は自軍に吸収されない）
    lose.troops = Math.round(lose.troops * 0.5);
    await sleep(300);
  }

  // ---------- 逆転の目（援軍・背水の陣） ----------
  const REINF = { name: '援軍', lead: 66, war: 64, int: 45, pol: 40, cha: 50, appear: 180, traits: [] };
  const MILITIA = { name: '市民兵', lead: 50, war: 52, int: 30, pol: 30, cha: 40, appear: 180, traits: [] };
  function freeTile(side) {
    const rows = side === 'def' ? [0, 1, 3] : [ROWS - 1, ROWS - 2];
    for (const r of rows) for (const c of shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8])) { const t = B.tiles[r][c].t; if (!unitAt(r, c) && !['wall', 'water', 'gate'].includes(t) && !B.tiles[r][c].fire) return [r, c]; }
    return null;
  }
  async function dramaEvents() {
    B.rally = B.rally || { atk: 0, def: 0 };
    B.reinf = B.reinf || { atk: 0, def: 0 };
    B.rallied = B.rallied || { atk: false, def: false };
    ['atk', 'def'].forEach(sd => { if (B.rally[sd] > 0) B.rally[sd]--; const bf = B.buff[sd]; if (bf.days > 0 && --bf.days === 0) { bf.atk = 1; bf.guard = 1; } });
    const tot = sd => B.units.filter(u => u.alive && u.side === sd).reduce((s2, u) => s2 + u.troops, 0);
    const fname = sd => { const fi = sd === 'atk' ? B.atkFi : B.defFi; return fi === null ? '守備隊' : G.factions[fi].name + '軍'; };
    // 背水の陣：兵が相手の4割を切った側が、一度だけ奮い立つ
    for (const sd of ['atk', 'def']) {
      const other = sd === 'atk' ? 'def' : 'atk';
      const cmd = B.units.find(u => u.side === sd && u.commander);
      if (!B.rallied[sd] && cmd && cmd.alive && tot(sd) < tot(other) * 0.4 && Math.random() < 0.6) {
        B.rallied[sd] = true; B.rally[sd] = 3;
        B.units.filter(u => u.alive && u.side === sd).forEach(u => u.morale = Math.min(100, u.morale + 30));
        Sound.se('warcry');
        await banner(`${fname(sd)}、背水の陣！`, 1300);
        addLog(`${fname(sd)}は追い詰められて奮い立った！（3日間、攻撃力が上がる）`);
        if (cmd.gi >= 0 && !auto) await UI.talk(cmd.g, 'angry', `${cmd.g.name}「退路はない！ ここで死力を尽くせ！」`, cmd.fi === null ? '#777' : G.factions[cmd.fi].color, { tag: '背水の陣' });
      }
    }
    // 援軍：開戦時に決めた到着日に駆けつける。守り手が危ないと急報を受けて急ぐ
    const defBad = outlook('def') < -0.3 || !gateUp();
    for (const rf of B.reinfPlan) {
      if (rf.done) continue;
      if (rf.side === 'def' && defBad && rf.day > B.day && Math.random() < 0.5) { rf.day = B.day; rf.rushed = true; }
      if (rf.day > B.day) continue;
      await arriveReinf(rf);
    }
    // 守り手が苦しくなると、民が立ち上がることがある
    if (outlook('def') < -0.3) await tryMilitia('crisis');
  }

  const gateUp = () => B.tiles[2][4].t === 'gate';
  // 開戦時に、どこから・いつ援軍が来るかを決める
  function planReinf() {
    const out = [], used = new Set(B.units.map(u => u.gi));
    const add = (side, fi, src, day, ally) => {
      const gs = Game.gensIn(src.i, fi).filter(g => !g.isLord && !used.has(g.i)).sort((a, b2) => (b2.lead + b2.war) - (a.lead + a.war));
      const g = gs[0] || null;
      const cap = g ? Game.troopCap(g) : 8000;
      const amt = Math.round(Math.min(cap, clamp(src.troops * 0.4, 2000, 12000), src.troops - 1500) / 100) * 100;
      if (amt < 1500) return;
      if (g) used.add(g.i);
      out.push({ side, fi, src: src.i, g, amt, day: day - (g && Game.has(g, '騎馬') ? 1 : 0), ally });
    };
    const near = fi => B.to.adj.map(a => G.cities[a]).filter(c => c.owner === fi && c.i !== B.from.i).sort((a, b2) => b2.troops - a.troops)[0];
    if (B.defFi !== null) {
      // 守り手の隣の自都市
      const own = near(B.defFi);
      if (own && own.troops >= 4000 && Math.random() < 0.85) add('def', B.defFi, own, irnd(3, 7), false);
      // 同盟国（攻め手と手を結んでいない国）
      const allies = Object.keys(G.factions[B.defFi].allies).map(Number).filter(fi => G.factions[fi].alive && Game.isAlly(B.defFi, fi) && fi !== B.atkFi && !Game.isAlly(B.atkFi, fi));
      for (const fi of allies) {
        const c = near(fi); if (!c || c.troops < 5000) continue;
        const lord = Game.lordOf(fi);
        const p = 0.55 + (Game.has(lord, '忠義') || Game.has(lord, '仁徳') ? 0.2 : 0) - (Game.has(lord, '野心') ? 0.15 : 0);
        if (Math.random() < p) { add('def', fi, c, irnd(4, 9), true); break; }
      }
    }
    const atkOwn = near(B.atkFi);
    if (atkOwn && atkOwn.troops >= 6000 && Math.random() < 0.45) add('atk', B.atkFi, atkOwn, irnd(5, 11), false);
    return out;
  }
  // 守りの援軍は、攻め手の側面か背後を突ける場所に現れる
  function reinfTile(side) {
    if (side === 'atk') return freeTile('atk');
    const foes = B.units.filter(u => u.alive && u.side === 'atk');
    let best = null, bs = 1e9;
    for (let r = 3; r < ROWS; r++) for (const c of [0, 1, 7, 8]) {
      const t = B.tiles[r][c].t;
      if (unitAt(r, c) || ['wall', 'water', 'gate'].includes(t) || B.tiles[r][c].fire) continue;
      const d = foes.length ? Math.min(...foes.map(f => dist(f, { r, c }))) : 3;
      const sc = Math.abs(d - 2) + Math.random() * 0.5;
      if (sc < bs) { bs = sc; best = [r, c]; }
    }
    return best || freeTile('def');
  }
  async function arriveReinf(rf) {
    rf.done = true;
    const src = G.cities[rf.src];
    if (src.owner !== rf.fi || rf.g && (rf.g.state !== 'serve' || rf.g.faction !== rf.fi)) return;
    const amt = Math.min(rf.amt, src.troops - 1000); if (amt < 1000) return;
    const pos = reinfTile(rf.side); if (!pos) return;
    src.troops -= amt;
    const u = mkUnit(rf.g, rf.side, rf.fi, amt, pos[0], pos[1]);
    if (!rf.g) u.g = REINF;
    u.src = src.i; u.train = src.train; u.morale = 95; u.ally = rf.ally;
    B.units.push(u);
    const fname = G.factions[rf.fi].name;
    Sound.se('horn'); setTimeout(() => Sound.se('warcry'), 400);
    await banner(rf.ally ? `${fname}軍の援軍到着！` : `${src.name}から援軍到着！`, 1300);
    addLog(`${rf.ally ? '同盟国 ' + fname + '軍' : src.name}の援軍 ${rf.g ? rf.g.name + '隊 ' : ''}${amt} が${rf.rushed ? '急報を受けて' : ''}駆けつけた！`);
    // 苦しい側に届いた援軍は、全軍を奮い立たせる
    const bad = outlook(rf.side) < -0.15;
    if (bad) B.units.filter(o => o.alive && o.side === rf.side).forEach(o => o.morale = Math.min(100, o.morale + 15));
    if (!auto) {
      const col = G.factions[rf.fi].color;
      if (rf.g) await UI.talk(rf.g, 'angry', `${rf.g.name}「${rf.ally ? `${fname}軍の${rf.g.name}、盟約により助太刀いたす！` : rf.rushed ? '急報を受けて駆けつけた！ 持ちこたえよ！' : 'お待たせした！ 援軍、ただいま到着！'}」`, col, { tag: '援軍' });
      const cmd = B.units.find(o => o.side === rf.side && o.commander && o.alive && o.gi >= 0);
      if (bad && cmd && rf.side === B.playerSide) await UI.talk(cmd.g, 'happy', `${cmd.g.name}「助かった！ 皆の者、いまこそ押し返せ！」`, G.factions[cmd.fi].color, { tag: '援軍' });
    }
  }
  // 市民兵：魅力の高い大将が守り、民忠が高い城では、民が武器を取って立ち上がる（1回まで）
  async function tryMilitia(why) {
    if (B.militia || B.defFi === null) return;
    const cmd = B.units.find(u => u.side === 'def' && u.commander && u.alive && u.gi >= 0);
    if (!cmd) return;
    const cha = cmd.g.cha, loyal = B.to.loyal;
    if (cha < 78 || loyal < 75) return;
    B.militia = true;   // 判定は1回だけ
    if (Math.random() > clamp(0.35 + (cha - 78) / 40 + (loyal - 75) / 50, 0.2, 0.9)) return;
    const pos = freeTile('def'); if (!pos) return;
    const amt = Math.round(clamp(B.to.pop / 80, 1000, 5000) / 100) * 100;
    const u = mkUnit(null, 'def', B.defFi, amt, pos[0], pos[1]);
    u.g = MILITIA; u.src = -1; u.militia = true; u.train = 30; u.morale = 100;
    B.units.push(u);
    B.units.filter(o => o.alive && o.side === 'def').forEach(o => o.morale = Math.min(100, o.morale + 10));
    Sound.se('warcry'); setTimeout(() => Sound.se('cheer'), 500);
    await banner('民が立ち上がった！', 1300);
    addLog(`${cmd.g.name}を慕う${B.to.name}の民 ${amt} が、市民兵として加わった！`);
    if (!auto) await UI.talk(cmd.g, 'happy', `民「${cmd.g.name}様をお守りしろ！ この町は俺たちの町だ！」\n${cmd.g.name}「……皆、かたじけない！」`, G.factions[B.defFi].color, { tag: '市民兵' });
  }

  // ---------- 日の流れ ----------
  async function startDay(first) {
    if (B.over) return;
    if (!first) {
      B.day++;
      // 炎のダメージと消火
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const tl = B.tiles[r][c];
        if (tl.fire > 0) {
          const u = unitAt(r, c);
          if (u) { const dmg = Math.round(u.troops * 0.1 + 100); u.troops = Math.max(0, u.troops - dmg); addFloater(r, c, '火-' + dmg, '#ffb02a'); await checkRout(u, null); }
          tl.fire--; if (B.weather === 'rain') tl.fire = 0;
        }
      }
      B.weather = Math.random() < 0.7 ? B.weather : pickWeather();
      // 兵糧
      const atkTroops = B.units.filter(u => u.alive && u.side === 'atk').reduce((s, u) => s + u.troops, 0);
      B.food -= atkTroops * 0.03;
      if (B.food <= 0) { B.units.filter(u => u.alive && u.side === 'atk').forEach(u => u.morale = Math.max(0, u.morale - 25)); addLog('攻め手の兵糧が尽きた！'); }
    }
    B.units.forEach(u => { if (u.alive) { u.acted = false; if (u.confused > 0) { u.confused--; if (u.confused > 0) u.acted = true; } } });
    if (!first) await dramaEvents();
    if (await checkEnd()) return;
    updateHUD();
    baseBgm(); Sound.amb(B.weather === 'rain' ? 'rain' : null);
    await banner(`${B.day}日目　${WNAME[B.weather]}`, 700);
    // 先手は攻め手
    if (B.playerSide === 'atk') await playerPhase(); else { await aiPhase('atk'); if (B.over) return; await playerPhase(); }
  }

  async function playerPhase() {
    if (B.over) return;
    if (auto) { await aiPhase(B.playerSide); return endPlayerPhase(); }
    if (B.watch) {
      setActions([{ label: '▶ ここから自分で指揮する', cls: 'primary', fn: () => { B.watch = false; setActions([]); UI.toast('この手番のあとから、自分で指揮できます'); } }]);
      const sg = Auto.strategist();
      if (sg && ((B.day === 1 && B.playerSide === 'atk') || (B.day > 1 && Math.random() < 0.15))) {
        const foeCmd = B.units.find(u => u.side !== B.playerSide && u.commander);
        await UI.talk(sg, 'normal', `軍師 ${sg.name}「${Auto.sl(B.playerSide === 'atk' ? 'battle' : 'defend', { foe: foeCmd ? foeCmd.g.name : '' })}」`, facColor(sg), { tag: '軍師' });
      }
      await aiPhase(B.playerSide);
      if (B.over) return;
      if (B.watch) return endPlayerPhase();
      return endPlayerPhase();
    }
    B.mode = 'idle'; B.sel = null; B.reach = null; B.targets = null;
    // 命令無視（猪突・忠誠の低い武将）
    for (const u of B.units.filter(u => u.alive && u.side === B.playerSide && !u.acted && u.gi >= 0 && !u.ally)) {
      const g = u.g;
      if (g.isLord || Game.has(g, '慎重') || Game.has(g, '忠義') && !Game.has(g, '猪突')) continue;
      let p = Game.has(g, '猪突') ? 0.15 : 0;
      if (g.loyalty < 50) p += (50 - g.loyalty) / 120;
      if (Math.random() < p && B.units.some(o => o.alive && o.side !== u.side && dist(o, u) <= 6)) {
        await UI.talk(g, 'angry', `${g.name}「${line(g, 'ignore')}」`, G.factions[u.fi].color, { tag: '命令無視' });
        await aiUnit(u, true);
        if (await checkEnd()) return;
      }
    }
    updateHUD(); showInfo(null);
    idleActions();
  }
  function idleActions() {
    setActions([
      { label: 'ターン終了', cls: 'primary', fn: () => endPlayerPhase() },
      { label: '委任', fn: async () => { auto = true; setActions([]); await aiPhase(B.playerSide); endPlayerPhase(); } },
      { label: '撤退', cls: 'danger', fn: async () => { if (await UI.confirm('全軍を退却させますか？')) { B.units.filter(u => u.alive && u.side === B.playerSide).forEach(u => { u.alive = false; u.status = 'retreat'; }); checkEnd(); } } },
    ]);
  }
  async function endPlayerPhase() {
    if (B.over) return;
    B.sel = null; B.reach = null; B.targets = null; B.mode = 'busy'; setActions([]);
    if (await checkEnd()) return;
    // 同盟国の援軍は自分たちで動く
    for (const u of B.units.filter(o => o.alive && o.ally && o.side === B.playerSide && !o.acted)) { await aiUnit(u, false); updateHUD(); if (await checkEnd()) return; }
    const enemy = B.playerSide === 'atk' ? 'def' : 'atk';
    if (B.playerSide === 'atk') { await aiPhase(enemy); if (B.over) return; }
    startDay(false);
  }

  async function onTap(ev) {
    if (!B || B.over || B.mode === 'busy') return;
    const rect = cv.getBoundingClientRect();
    const c = Math.floor((ev.clientX - rect.left) / cell), r = Math.floor((ev.clientY - rect.top) / cell);
    if (!inb(r, c)) return;
    const u = unitAt(r, c);
    if (B.mode === 'target') {
      if (B.targets.some(([tr, tc]) => tr === r && tc === c)) { const fn = B.onTarget; B.targets = null; B.mode = 'busy'; await fn(r, c); afterAct(); }
      else { Sound.se('tap'); }
      return;
    }
    if (B.mode === 'move' && B.sel && B.reach.includes(r + ',' + c) && (!u || u === B.sel)) {
      const s = B.sel; B.mode = 'busy'; B.reach = null;
      s.prev = [s.r, s.c];
      await animateMove(s, r, c);
      actMenu(s);
      return;
    }
    if (u) {
      Sound.se('tap');
      showInfo(u);
      if (u.side === B.playerSide && !u.acted && !u.ally) { B.sel = u; B.mode = 'move'; B.reach = moveRange(u); B.targets = null; setActions([{ label: 'この場で行動', cls: 'primary', fn: () => { B.reach = null; u.prev = [u.r, u.c]; actMenu(u); } }, { label: '戻る', fn: () => { B.sel = null; B.reach = null; B.mode = 'idle'; showInfo(null); idleActions(); } }]); }
      else { B.sel = null; B.reach = null; B.mode = 'idle'; }
    } else { B.sel = null; B.reach = null; B.mode = 'idle'; showInfo(null); idleActions(); }
  }

  function actMenu(u) {
    B.mode = 'menu'; B.sel = u; showInfo(u);
    const at = attackTargets(u), pt = plotTargets(u), dt = duelTargets(u);
    const choose = (targets, fn) => { B.mode = 'target'; B.targets = targets; B.onTarget = fn; setActions([{ label: '戻る', fn: () => { B.targets = null; actMenu(u); } }]); };
    setActions([
      { label: Game.has(u.g, '弓術') ? '攻撃/射撃' : '攻撃', cls: 'primary', disabled: !at.length, fn: () => choose(at, (r, c) => doAttack(u, r, c)) },
      { label: '火計', disabled: !pt.length || u.gi < 0, fn: () => choose(pt, (r, c) => doPlot(u, 'fire', unitAt(r, c))) },
      { label: '混乱', disabled: !pt.length || u.gi < 0, fn: () => choose(pt, (r, c) => doPlot(u, 'confuse', unitAt(r, c))) },
      { label: '一騎討ち', disabled: !dt.length, fn: () => choose(dt, (r, c) => doDuel(u, unitAt(r, c))) },
      ...(SKILLS[u.g.name] && u.gi >= 0 ? [{ label: `必殺：${SKILLS[u.g.name].name}`, cls: 'gold', disabled: u.skillUsed || !skillReady(u), fn: () => { const sk = SKILLS[u.g.name], tg = skillTargets(u, sk); if (tg) choose(tg, (r, c) => useSkill(u, unitAt(r, c))); else { B.mode = 'busy'; useSkill(u, null).then(afterAct); } } }] : []),
      { label: '待機', fn: () => { u.acted = true; afterAct(); } },
      { label: '取消', fn: async () => { if (u.prev) { u.r = u.prev[0]; u.c = u.prev[1]; u.x = u.c; u.y = u.r; } B.sel = null; B.mode = 'idle'; showInfo(null); idleActions(); } },
    ]);
  }
  async function afterAct() {
    B.sel = null; B.reach = null; B.targets = null; B.mode = 'idle';
    updateHUD();
    if (await checkEnd()) return;
    showInfo(null);
    if (B.units.filter(u => u.alive && u.side === B.playerSide && !u.acted).length === 0) return endPlayerPhase();
    idleActions();
  }

  // ---------- 敵の思考 ----------
  async function aiPhase(side) {
    B.mode = 'busy';
    const list = B.units.filter(u => u.alive && u.side === side && !u.acted);
    // 総大将は最後に動く
    list.sort((a, b) => (a.commander ? 1 : 0) - (b.commander ? 1 : 0));
    for (const u of list) {
      if (B.over) return;
      if (!u.alive || u.acted) continue;
      await aiUnit(u, false);
      updateHUD();
      if (await checkEnd()) return;
    }
  }

  // 目標までの道のり（地形の移動コストを考えた距離）
  function distField(u, goal) {
    const d = Array.from({ length: ROWS }, () => Array(COLS).fill(999));
    d[goal.r][goal.c] = 0;
    const q = [[goal.r, goal.c]];
    while (q.length) {
      q.sort((a, b) => d[a[0]][a[1]] - d[b[0]][b[1]]);
      const [r, c] = q.shift();
      DIRS.forEach(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        if (!inb(nr, nc)) return;
        let cost = tileCost(u, nr, nc);
        if (cost >= 99) { if (B.tiles[nr][nc].fire > 0) cost = 4; else return; }
        const o = unitAt(nr, nc); if (o && o.side === u.side && o !== u) cost += 1;
        if (d[r][c] + cost < d[nr][nc]) { d[nr][nc] = d[r][c] + cost; q.push([nr, nc]); }
      });
    }
    return d;
  }

  // 一騎打ちを挑むか（性格と武力の差で決める）
  async function tryDuel(u, wmine) {
    if (u.gi < 0 || u.acted) return false;
    B.challenged = B.challenged || new Set();
    const bold = Game.has(u.g, '剛勇') || Game.has(u.g, '猪突');
    const timid = Game.has(u.g, '臆病') || Game.has(u.g, '慎重');
    const cands = B.units.filter(o => o.alive && o.side !== u.side && o.gi >= 0 && dist(o, u) === 1 && !B.challenged.has(u.gi + '-' + o.gi))
      .filter(o => !isWeakVs(o.g, u.g) || Math.random() < 0.1)   // 弱い相手はまず受けないので、挑むのは時々（挑発）
      .filter(o => bold ? u.g.war >= o.g.war - 8 : timid ? u.g.war >= o.g.war + 8 : u.g.war >= o.g.war - (u.g.war >= 80 ? 3 : -2))
      .sort((a, b) => { const v = o => (o.commander ? (u.g.war >= o.g.war + 8 ? 20 : -15) : 0) + (u.g.war - o.g.war); return v(b) - v(a); });   // 総大将は応じにくいので、勝ち目が大きい時だけ狙う
    const t = cands[0];
    if (!t) return false;
    if (u.commander && !isMusou(u.g) && u.g.war < t.g.war + (Game.has(u.g, '猪突') || Game.has(u.g, '剛勇') ? 4 : 10)) return false;
    if (u.g.isLord && !isMusou(u.g) && u.g.war < t.g.war + 10) return false;   // 君主は大きく勝る相手にしか挑まない   // 総大将は大差で勝てる相手にだけ挑む
    let p = bold ? 0.8 : timid ? 0.3 : 0.55;
    if (u.g.war >= 85) p += 0.1;                                       // 腕に覚えのある者は名乗りを上げたがる
    if (t.g.war >= 85 && u.g.war >= 85) p += 0.1;                      // 豪傑同士は引き合う
    if (t.commander && u.g.war >= t.g.war + 8) p += 0.25;              // 総大将を討てば勝ち
    if (wmine && t.commander && u.g.war >= t.g.war + 10) p += 0.2 * B.smart;   // 賢い軍師は好機を逃さない
    if (Math.random() >= p) return false;
    B.challenged.add(u.gi + '-' + t.gi);
    await doDuel(u, t);
    return true;
  }
  // 計略（火計・混乱）を使うか（知力と性格で決める）
  async function tryPlot(u, wmine, foes, after) {
    if (u.gi < 0 || u.acted) return false;
    const wise = Game.has(u.g, '智謀') || Game.has(u.g, '神算');
    let need = wise ? 65 : 75;
    if (wmine) need = Math.min(need, 80 - 20 * B.smart);
    if (u.g.int < need) return false;
    let p = (wise ? 0.55 : 0.4) + (u.g.int - 75) / 100;
    if (wmine) p += 0.15 * B.smart;
    if (after) p += 0.15;
    // 斬りかかれる敵がいるなら、計略より攻撃を優先する
    const canHit = after ? attackTargets(u).some(([r, c]) => unitAt(r, c)) : moveRange(u).some(k => { const [r, c] = k.split(',').map(Number); return attackTargets(u, r, c).some(([r2, c2]) => unitAt(r2, c2)); });
    if (canHit) p *= 0.3;
    p *= Math.pow(0.6, u.plots || 0);   // 同じ武将の計略は使うほど出にくく
    if (Math.random() >= clamp(p, 0.1, 0.85)) return false;
    const inRange = foes.filter(o => o.alive && dist(o, u) <= 2 && !o.confused);
    if (!inRange.length) return false;
    u.plots = (u.plots || 0) + 1;
    // 火計は森・平地の敵に。雨なら混乱。総大将や大部隊を優先
    const fireOk = B.weather !== 'rain';
    const fireT = inRange.filter(o => ['forest', 'plain', 'road'].includes(B.tiles[o.r][o.c].t)).sort((a, b) => (b.troops + (B.tiles[b.r][b.c].t === 'forest' ? 3000 : 0)) - (a.troops + (B.tiles[a.r][a.c].t === 'forest' ? 3000 : 0)))[0];
    const confT = inRange.slice().sort((a, b) => (b.commander ? 5000 : 0) + b.troops - (a.commander ? 5000 : 0) - a.troops)[0];
    if (fireOk && fireT && (Math.random() < 0.6 || !confT.commander)) await doPlot(u, 'fire', fireT);
    else await doPlot(u, 'confuse', confT);
    return true;
  }

  async function aiUnit(u, rogue) {
    const foes = B.units.filter(o => o.alive && o.side !== u.side);
    if (!foes.length) { u.acted = true; return; }
    showInfo(u);
    const wmine = B.watch && u.side === B.playerSide;
    // 必殺技（好機なら使う）
    if (!rogue && await aiSkill(u)) return;
    // 一騎打ち（移動の前にも後にも考える）
    if (!rogue || Game.has(u.g, '猪突')) { if (await tryDuel(u, wmine)) return; }
    // 計略
    if (!rogue && await tryPlot(u, wmine, foes)) return;
    // 守り手（総大将）や城内の部隊は、敵が近づくまで動かない
    const nearest = foes.slice().sort((a, b) => dist(a, u) - dist(b, u))[0];
    if (u.side === 'def' && !rogue && u.src == null) {
      const keepGuard = u.commander && B.tiles[u.r][u.c].t === 'keep';
      // 門が無事なうちは、城内の部隊は城壁に拠って戦う（よほど優勢なら打って出る）
      const holdWall = u.r <= 2 && gateUp() && outlook('def') < 0.3;
      if (keepGuard || holdWall || (dist(nearest, u) > 4 && gateUp())) {
        const weakest = t => t.sort((a, b) => unitAt(a[0], a[1]).troops - unitAt(b[0], b[1]).troops)[0];
        let t = attackTargets(u).filter(([r, c]) => unitAt(r, c));
        if (!t.length && holdWall && !keepGuard) {
          // 城内で、矢の届く場所（城門の上を含む）へ移る
          const spots = moveRange(u).map(k => k.split(',').map(Number)).filter(([r, c]) => r <= 2 && !unitAt(r, c) && attackTargets(u, r, c).some(([rr, cc]) => unitAt(rr, cc)));
          if (spots.length) {
            const [r, c] = spots.sort((a, b) => (b[0] === 2 && b[1] === 4 ? 1 : 0) - (a[0] === 2 && a[1] === 4 ? 1 : 0))[0];
            await animateMove(u, r, c);
            t = attackTargets(u).filter(([rr, cc]) => unitAt(rr, cc));
          }
        }
        if (t.length) { const [r, c] = weakest(t); await doAttack(u, r, c); return; }
        u.acted = true; return;
      }
    }
    // 移動先を評価
    const reach = moveRange(u);
    let best = null, bestScore = -1e9;
    const goal = u.side === 'atk' ? (B.tiles[2][4].t === 'gate' ? { r: 3, c: 4 } : { r: 0, c: 4 }) : nearest;
    const field = distField(u, goal);
    reach.forEach(k => {
      const [r, c] = k.split(',').map(Number);
      const tg = attackTargets(u, r, c);
      let score = -field[r][c] * 1.2;
      if (tg.length) {
        const best2 = tg.map(([tr, tc]) => { const o = unitAt(tr, tc); return o ? 20 + (o.commander ? (wmine ? 8 + 14 * B.smart : 8) : 0) + (1 - o.troops / o.maxTroops) * 10 : 14; });
        score += Math.max(...best2) + 10;
      }
      score += (DEFK[B.tiles[r][c].t] - 1) * 8;
      // 武勇に優れた武将は前に出て、激しくぶつかる
      if (u.g.war >= 85 && !u.commander && tg.length) score += 6 + (Game.has(u.g, '剛勇') || Game.has(u.g, '猪突') ? 6 : 0);
      // 武勇の将は、一騎討ちを挑めそうな敵将の隣を目指す
      if (u.g.war >= 78 && !u.commander && u.gi >= 0 && DIRS.some(([dr, dc]) => { const o = unitAt(r + dr, c + dc); return o && o.side !== u.side && o.gi >= 0 && o.g.war <= u.g.war + 5 && !isWeakVs(o.g, u.g); })) score += 10;
      if (B.tiles[r][c].t === 'keep' && u.side === 'atk') score += 100;
      // 総大将は、味方が戦っている間は敵に囲まれる位置を避ける
      if (u.commander && B.units.some(o => o.alive && o.side === u.side && o !== u)) {
        const adjFoe = DIRS.filter(([dr, dc]) => { const o = unitAt(r + dr, c + dc); return o && o.side !== u.side; }).length;
        score -= adjFoe * (Game.has(u.g, '猪突') ? 4 : 14) * (1.5 - u.troops / u.maxTroops);
      }
      if (u.troops < u.maxTroops * 0.25 && u.side === 'def') score -= tg.length * 6;
      if (score > bestScore) { bestScore = score; best = [r, c]; }
    });
    if (best && (best[0] !== u.r || best[1] !== u.c)) await animateMove(u, best[0], best[1]);
    // 着いた先で、必殺技・一騎打ち・計略の好機があれば狙う
    if (!rogue && await aiSkill(u)) return;
    if (await tryDuel(u, wmine)) return;
    if (!rogue && attackTargets(u).filter(([r, c]) => unitAt(r, c)).length === 0 && await tryPlot(u, wmine, foes, true)) return;
    const tg = attackTargets(u);
    if (tg.length) {
      tg.sort((a, b) => { const oa = unitAt(a[0], a[1]), ob = unitAt(b[0], b[1]); return (oa ? oa.troops - (oa.commander ? 3000 : 0) : 99999) - (ob ? ob.troops - (ob.commander ? 3000 : 0) : 99999); });
      await doAttack(u, tg[0][0], tg[0][1]);
    } else { u.acted = true; await sleep(150); }
  }

  // ---------- 決着 ----------
  async function checkEnd() {
    if (B.over) return true;
    const atkAlive = B.units.filter(u => u.alive && u.side === 'atk');
    const defAlive = B.units.filter(u => u.alive && u.side === 'def');
    let winner = null, reason = '';
    const atkCmd = B.units.find(u => u.side === 'atk' && u.commander), defCmd = B.units.find(u => u.side === 'def' && u.commander);
    if (atkAlive.some(u => B.tiles[u.r][u.c].t === 'keep')) { winner = 'atk'; reason = '本丸を占領した'; }
    else if (!defAlive.length) { winner = 'atk'; reason = '守備隊が全滅した'; }
    else if (!atkAlive.length) { winner = 'def'; reason = '攻め手が全滅・退却した'; }
    else if (!defCmd.alive) { winner = 'atk'; reason = `守りの総大将 ${defCmd.g.name} が倒れた`; }
    else if (!atkCmd.alive) { winner = 'def'; reason = `攻めの総大将 ${atkCmd.g.name} が倒れた`; }
    else if (B.day > CONFIG.BATTLE_DAYS) { winner = 'def'; reason = '30日を守り抜いた'; }
    else if (B.food <= 0 && B.day > 3 && atkAlive.every(u => u.morale < 30)) { winner = 'def'; reason = '攻め手の兵糧が尽きた'; }
    if (!winner) return false;
    B.over = true; B.mode = 'busy'; setActions([]); updateHUD();
    const pWin = winner === B.playerSide;
    Sound.amb(null);
    Sound.se(pWin ? 'victory' : 'defeat'); if (pWin) setTimeout(() => Sound.se('cheer'), 900);
    await banner(pWin ? '勝利！' : '敗北…', 1400);
    const res = {
      atkWin: winner === 'atk', reason,
      atkLeft: B.units.filter(u => u.side === 'atk' && u.status !== 'killed' && u.src == null).reduce((s, u) => s + (u.alive || u.status === 'retreat' ? u.troops : 0), 0),
      defLeft: B.units.filter(u => u.side === 'def' && u.src == null).reduce((s, u) => s + (u.alive || u.status === 'retreat' ? u.troops : 0), 0) + (B.reserve || 0),
      captured: B.units.filter(u => u.gi >= 0 && u.status === 'captured').map(u => u.gi),
      killed: B.units.filter(u => u.gi >= 0 && u.status === 'killed').map(u => u.gi),
      days: B.day,
    };
    // 市民兵は戦が終われば町へ帰る。守り切ったら、生き残りの半分が兵に志願する
    if (!res.atkWin) res.defLeft += Math.round(B.units.filter(u => u.militia && u.alive).reduce((s, u) => s + u.troops, 0) / 2);
    // 勝った側に残った敵将は捕縛されることがある
    const timeUp = reason.includes('30日') || reason.includes('兵糧');
    if (!timeUp) B.units.filter(u => u.gi >= 0 && u.alive && u.side !== winner).forEach(u => { if (Math.random() < (winner === 'atk' ? 0.3 : 0.15)) res.captured.push(u.gi); });
    // 援軍の生き残りは元の都市へ帰る
    B.units.filter(u => u.src != null && (u.alive || u.status === 'retreat')).forEach(u => { const c = G.cities[u.src]; if (c) c.troops += u.troops; });
    cancelAnimationFrame(raf);
    const r = resolveEnd; r(res);
    return true;
  }

  return { start, get watching() { return !!(B && B.watch && !B.over); }, get _B() { return B; }, _duel: (a, d) => doDuel(a, d), _attack: (a, r, c) => doAttack(a, r, c) };
})();

// ============================================================
//  一騎打ち（演出つき）
// ============================================================
const Duel = (() => {
  function strike(a, d, mode) {
    // mode: 'atk' 通常 / 'power' 渾身（当たれば大、外れやすい） / 'guard' 守り
    // 戻り値 { dmg, crit（会心）, skill（必殺技） }
    let hit = 0.65 + (a.war - d.war) / 120;
    let dmg = rnd(8, 16) * Math.pow(a.war / Math.max(30, d.war), 1.4);
    if (mode === 'power') { hit -= 0.25; dmg *= 2; }
    if (Game.has(a, '剛勇')) dmg *= 1.1;
    dmg *= Game.topK(a, 'war', 1.1, 1.18);   // 豪傑
    // 必殺技持ちの渾身は、35%で必殺技に化ける（必ず当たる）
    if (mode === 'power' && typeof SKILLS !== 'undefined' && SKILLS[a.name] && Math.random() < 0.35) return { dmg: Math.round(dmg * 1.3), skill: SKILLS[a.name] };
    if (Math.random() >= clamp(hit, 0.15, 0.95)) return { dmg: 0 };
    // 会心の一撃：武力が高いほど、剛勇・豪傑はさらに出やすい
    const pc = clamp(0.04 + (a.war - 70) / 400 + (Game.has(a, '剛勇') ? 0.04 : 0) + (Game.top(a, 'war') ? 0.04 : 0), 0.02, 0.2);
    if (mode !== 'guard' && Math.random() < pc) return { dmg: Math.round(dmg * rnd(1.8, 2.2)), crit: true };
    return { dmg: Math.round(dmg) };
  }
  function quick(a, d) {
    let ha = 100, hd = 100;
    for (let i = 0; i < 30 && ha > 0 && hd > 0; i++) { hd -= strike(a, d, Math.random() < 0.25 ? 'power' : 'atk').dmg; if (hd > 0) ha -= strike(d, a, Math.random() < 0.25 ? 'power' : 'atk').dmg; }
    const winner = ha > hd ? 'a' : 'd';
    const r = Math.random();
    return { winner, outcome: r < 0.3 ? 'killed' : r < 0.75 ? 'captured' : 'fled' };
  }
  // pSide: 'a' or 'd' プレイヤーが操作する側（null なら観戦）
  // ---------- 一騎討ちの闘技場（2騎が駆け寄って打ち合う絵） ----------
  const WEAPON = { '関羽': 'glaive', '張飛': 'snake', '呂布': 'halberd', '典韋': 'twin', '許褚': 'blade', '黄忠': 'blade', '張遼': 'blade', '甘寧': 'blade', '太史慈': 'twin', '孫策': 'spear', '趙雲': 'spear', '馬超': 'spear', '夏侯惇': 'spear', '顔良': 'blade', '文醜': 'spear', '孟獲': 'blade' };
  const HORSE = { '関羽': '#8a2a14', '呂布': '#a82a14', '趙雲': '#e8e4dc', '馬超': '#e0dcd2', '張飛': '#1a1410', '曹操': '#2a1e16' };
  function makeArena(cv, ca, cd, a, d) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const st = { pa: 0, pd: 0, fa: 0, fd: 0, kbA: 0, kbD: 0, swA: 0, swD: 0, shake: 0, floats: [], sparks: [], t0: performance.now(), raf: 0, flash: 0, dark: 0, banner: null, charging: 0 };
    const S = H / 150;   // 画面の高さに合わせた倍率
    const baseA = W * 0.2, baseD = W * 0.8, meet = W * 0.5, ground = H * 0.82;
    const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = v => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
    function weapon(type, len) {
      c.strokeStyle = '#6a4a2a'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-len * 0.25, 0); c.lineTo(len, 0); c.stroke();   // 柄
      c.fillStyle = '#e8eef4'; c.strokeStyle = '#8a96a0'; c.lineWidth = 0.8;
      if (type === 'glaive') { c.beginPath(); c.moveTo(len - 2, -2); c.quadraticCurveTo(len + 10, -14, len + 20, -4); c.lineTo(len + 4, 4); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#2f8a4e'; c.fillRect(len - 4, -3, 3, 6); }
      else if (type === 'snake') { c.beginPath(); c.moveTo(len, -2); for (let k = 0; k <= 4; k++) c.lineTo(len + k * 4, (k % 2 ? 3 : -3)); c.lineTo(len + 22, 0); c.lineTo(len + 16, 3); for (let k = 4; k >= 0; k--) c.lineTo(len + k * 4, (k % 2 ? 5 : -1)); c.closePath(); c.fill(); c.stroke(); }
      else if (type === 'halberd') { c.beginPath(); c.moveTo(len, -2); c.lineTo(len + 18, 0); c.lineTo(len, 2); c.fill(); [-1, 1].forEach(sg => { c.beginPath(); c.moveTo(len + 4, 0); c.quadraticCurveTo(len + 10, sg * 12, len + 2, sg * 14); c.quadraticCurveTo(len + 6, sg * 6, len + 2, sg * 2); c.fill(); c.stroke(); }); c.fillStyle = '#c0392b'; c.beginPath(); c.arc(len - 2, 0, 2.5, 0, 7); c.fill(); }
      else if (type === 'blade') { c.beginPath(); c.moveTo(len - 4, -3); c.quadraticCurveTo(len + 14, -10, len + 18, 2); c.lineTo(len - 4, 4); c.closePath(); c.fill(); c.stroke(); }
      else if (type === 'twin') { c.beginPath(); c.moveTo(len, -2); c.lineTo(len + 14, 0); c.lineTo(len, 2); c.fill(); c.beginPath(); c.moveTo(len + 2, 0); c.quadraticCurveTo(len + 8, -10, len + 2, -12); c.lineTo(len, -2); c.fill(); c.stroke(); }
      else { c.beginPath(); c.moveTo(len, -2.5); c.lineTo(len + 16, 0); c.lineTo(len, 2.5); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(len - 2, 0); c.lineTo(len - 8, -5); c.lineTo(len - 6, 0); c.lineTo(len - 8, 5); c.fill(); }
    }
    function rider(x, y, col, dir, t, flash, g, swing, speed) {
      const horse = HORSE[g.name] || (g.war >= 90 ? '#3a2416' : '#5a3a22');
      c.save(); c.translate(x, y); c.scale(dir * S * 1.15, S * 1.15);
      const gal = t * (8 + speed * 10), bob = Math.sin(gal * 2) * 2;
      // 影
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(2, 21, 34, 5, 0, 0, 7); c.fill();
      c.translate(0, bob);
      const hc = flash ? '#ff7060' : horse, hd = shade(hc.startsWith('#') ? hc : '#5a3a22', 0.65);
      // 後ろ脚・前脚（2関節＋ひづめ）
      const leg = (bx, ph, near) => { const a1 = Math.sin(gal + ph) * 0.7, a2 = Math.max(0, Math.sin(gal + ph + 1.2)) * 0.9; c.save(); c.translate(bx, 6); c.rotate(a1); c.fillStyle = near ? hc : hd; c.fillRect(-2.5, 0, 5, 9); c.translate(0, 9); c.rotate(a2); c.fillRect(-2, 0, 4, 8); c.fillStyle = '#1a1210'; c.fillRect(-2.5, 7, 5, 3); c.restore(); };
      leg(-18, 0, false); leg(14, 2.2, false);
      // 尾
      c.strokeStyle = shade(hd.startsWith('rgb') ? '#2a1a10' : hd, 1); c.strokeStyle = '#2a1a10'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-26, -4); c.quadraticCurveTo(-38, -2 + Math.sin(gal) * 3, -44 - speed * 6, 6 + Math.sin(gal + 1) * 4); c.stroke();
      // 胴
      const bg = c.createLinearGradient(0, -12, 0, 12); bg.addColorStop(0, shade(hc.startsWith('#') ? hc : '#5a3a22', 1.25)); bg.addColorStop(1, hd);
      c.fillStyle = bg;
      c.beginPath(); c.moveTo(-28, -2); c.quadraticCurveTo(-30, -12, -16, -12); c.lineTo(14, -12); c.quadraticCurveTo(26, -12, 26, 0); c.quadraticCurveTo(22, 10, 10, 10); c.lineTo(-18, 10); c.quadraticCurveTo(-30, 10, -28, -2); c.fill();
      // 首と頭
      c.beginPath(); c.moveTo(16, -8); c.quadraticCurveTo(22, -26, 30, -30); c.lineTo(42, -24); c.quadraticCurveTo(44, -20, 40, -18); c.lineTo(33, -19); c.quadraticCurveTo(28, -8, 24, 2); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(35, -26, 1.2, 0, 7); c.fill();
      c.fillStyle = hd; c.beginPath(); c.moveTo(30, -31); c.lineTo(32, -37); c.lineTo(34, -30); c.fill();   // 耳
      // たてがみ
      c.strokeStyle = '#1a1210'; c.lineWidth = 2;
      for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(18 + k * 2.6, -12 - k * 3.6); c.quadraticCurveTo(12 + k * 2.6 - speed * 4, -14 - k * 3.6 + Math.sin(gal + k) * 2, 8 + k * 2 - speed * 6, -10 - k * 3); c.stroke(); }
      // 手前の脚
      leg(-12, 1.1, true); leg(20, 3.3, true);
      // 鞍の布（勢力の色＋金縁）
      c.fillStyle = col; c.beginPath(); c.moveTo(-12, -12); c.lineTo(10, -12); c.lineTo(8, 4); c.lineTo(-10, 4); c.closePath(); c.fill();
      c.strokeStyle = '#d4af37'; c.lineWidth = 1.2; c.stroke();
      // マント
      c.fillStyle = shade(col, 0.6);
      c.beginPath(); c.moveTo(-4, -34); c.quadraticCurveTo(-18 - speed * 8, -30 + Math.sin(gal) * 3, -26 - speed * 14, -18 + Math.sin(gal + 1) * 4); c.lineTo(-10, -16); c.closePath(); c.fill();
      // 武者：胴・肩当て・脚
      c.fillStyle = '#3a3a40'; c.fillRect(-4, -16, 6, 12);
      const ag = c.createLinearGradient(-6, -38, 8, -16); ag.addColorStop(0, shade(col, 1.3)); ag.addColorStop(1, shade(col, 0.6));
      c.fillStyle = ag; c.beginPath(); c.moveTo(-7, -16); c.lineTo(-6, -36); c.lineTo(7, -36); c.lineTo(8, -16); c.closePath(); c.fill();
      c.strokeStyle = '#d4af37'; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#c9a227'; c.beginPath(); c.ellipse(5, -34, 6, 3.5, -0.3, 0, 7); c.fill();
      // 頭・兜・房
      c.fillStyle = '#e8c49a'; c.beginPath(); c.arc(1, -41, 5, 0, 7); c.fill();
      c.fillStyle = '#7a7a84'; c.beginPath(); c.arc(1, -43, 5.6, Math.PI, 0); c.fill(); c.fillRect(-5, -43, 12, 2);
      c.fillStyle = '#c0281e'; c.beginPath(); c.moveTo(0, -49); c.quadraticCurveTo(-8 - speed * 4, -54, -14 - speed * 6, -48 + Math.sin(gal) * 2); c.quadraticCurveTo(-6, -50, 1, -47); c.fill();
      // 腕と武器（振り抜き）
      c.save(); c.translate(6, -30); c.rotate(-0.55 + swing * 1.6);
      c.fillStyle = shade(col, 0.9); c.fillRect(0, -2, 10, 4);
      c.translate(8, 0); weapon(WEAPON[g.name] || 'spear', 34);
      c.restore();
      c.restore();
      // 名前（大きな文字の演出中は隠す）
      if (!st.banner) { c.save(); c.font = `bold ${Math.round(12 * S)}px 'Shippori Mincho B1', serif`; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.strokeText(g.name, x, y - 66 * S); c.fillStyle = '#fff'; c.fillText(g.name, x, y - 66 * S); c.restore(); }
    }
    function armyRow(x0, x1, y, col, t, dir) {
      for (let x = x0, i = 0; x < x1; x += 9, i++) { const b = Math.sin(t * 5 + i) * 1.2; c.fillStyle = '#140a06'; c.fillRect(x, y - 8 + b, 4, 8); c.beginPath(); c.arc(x + 2, y - 10 + b, 2.2, 0, 7); c.fill(); if (i % 4 === 0) { c.strokeStyle = '#140a06'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 2, y - 8 + b); c.lineTo(x + 2, y - 26 + b); c.stroke(); c.fillStyle = col; c.beginPath(); c.moveTo(x + 2, y - 26 + b); c.lineTo(x + 2 + dir * 9, y - 23 + Math.sin(t * 4 + i) * 1.5 + b); c.lineTo(x + 2, y - 19 + b); c.fill(); } }
    }
    function frame() {
      const t = (performance.now() - st.t0) / 1000;
      const sh = st.shake > 0.3 ? (Math.random() - 0.5) * st.shake : 0;
      st.shake *= 0.86;
      c.save(); c.translate(sh, sh * 0.5);
      // 空・夕日・山
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a0806'); g.addColorStop(0.45, '#7a2a12'); g.addColorStop(0.62, '#d07a3a'); g.addColorStop(0.63, '#4a2a18'); g.addColorStop(1, '#22140c');
      c.fillStyle = g; c.fillRect(-10, -10, W + 20, H + 20);
      const sg = c.createRadialGradient(W / 2, H * 0.55, 4, W / 2, H * 0.55, 90 * S); sg.addColorStop(0, 'rgba(255,220,150,0.9)'); sg.addColorStop(0.25, 'rgba(255,170,80,0.4)'); sg.addColorStop(1, 'rgba(255,120,40,0)');
      c.fillStyle = sg; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(40,16,10,0.85)'; c.beginPath(); c.moveTo(-10, H * 0.63); for (let x = 0; x <= W + 20; x += 24) c.lineTo(x, H * 0.63 - 10 * S - Math.abs(Math.sin(x * 0.02)) * 18 * S); c.lineTo(W + 20, H * 0.63); c.fill();
      // 両軍の陣（旗）
      armyRow(-4, W * 0.3, H * 0.66, ca, t, 1); armyRow(W * 0.7, W + 4, H * 0.66, cd, t + 1, -1);
      // 地面のすじ
      c.strokeStyle = 'rgba(255,200,140,0.08)'; c.lineWidth = 1; for (let k = 0; k < 6; k++) { const y = H * (0.7 + k * 0.05); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      // 砂煙
      for (let i = 0; i < 7; i++) { c.fillStyle = `rgba(230,190,140,${0.1 + st.charging * 0.12})`; c.beginPath(); c.ellipse((i * 71 + t * 40) % (W + 60) - 30, ground + 4 * S, 26 * S, 7 * S, 0, 0, 7); c.fill(); }
      const xa = baseA + (meet - 30 * S - baseA) * st.pa - st.kbA, xd = baseD + (meet + 30 * S - baseD) * st.pd + st.kbD;
      st.kbA *= 0.85; st.kbD *= 0.85;
      // 駆けるときの残像の線
      if (st.charging > 0.05) { c.strokeStyle = `rgba(255,240,220,${0.35 * st.charging})`; c.lineWidth = 1.5; for (let k = 0; k < 6; k++) { const y = ground - (10 + k * 9) * S; c.beginPath(); c.moveTo(xa - 50 * S - k * 6, y); c.lineTo(xa - 90 * S - k * 10, y); c.stroke(); c.beginPath(); c.moveTo(xd + 50 * S + k * 6, y); c.lineTo(xd + 90 * S + k * 10, y); c.stroke(); } }
      if (st.dark > 0) { c.fillStyle = `rgba(0,0,0,${Math.min(0.65, st.dark / 30)})`; c.fillRect(0, 0, W, H); }
      rider(xa, ground, ca, 1, t, st.fa > 0, a, st.swA, st.charging);
      rider(xd, ground, cd, -1, t + 0.37, st.fd > 0, d, st.swD, st.charging);
      if (st.fa > 0) st.fa--; if (st.fd > 0) st.fd--;
      // 火花
      st.sparks = st.sparks.filter(p => p.life > 0);
      st.sparks.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.14; p.life--; c.strokeStyle = `rgba(255,${210 + Math.random() * 45 | 0},140,${p.life / 30})`; c.lineWidth = p.big ? 2.5 : 1.6; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 2, p.y - p.vy * 2); c.stroke(); });
      if (st.flash > 0) { c.fillStyle = `rgba(255,245,220,${st.flash / 16})`; c.fillRect(0, 0, W, H); st.flash--; }
      // 必殺技・会心の大きな文字
      if (st.banner) { const k = (performance.now() - st.banner.t0) / 1400; if (k > 1) st.banner = null; else { c.save(); c.globalAlpha = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1; const sc = 1 + (1 - Math.min(1, k * 5)) * 0.6; c.translate(W / 2, H * 0.3); c.scale(sc, sc); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${Math.round(st.banner.size * S)}px 'Yuji Syuku', serif`; c.lineWidth = 6; c.strokeStyle = '#000'; c.strokeText(st.banner.text, 0, 0); c.fillStyle = st.banner.col; c.shadowColor = st.banner.glow; c.shadowBlur = 18; c.fillText(st.banner.text, 0, 0); c.restore(); } }
      // 数字・文字
      const now = performance.now();
      st.floats = st.floats.filter(f => now - f.t0 < 1000);
      st.floats.forEach(f => { const k = (now - f.t0) / 1000; c.globalAlpha = 1 - k; c.font = `bold ${Math.round(f.size * S)}px sans-serif`; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = '#000'; c.strokeText(f.text, f.x, f.y - k * 30); c.fillStyle = f.col; c.fillText(f.text, f.x, f.y - k * 30); c.globalAlpha = 1; });
      if (st.dark > 0) st.dark--;
      c.restore();
      st.raf = requestAnimationFrame(frame);
    }
    st.raf = requestAnimationFrame(frame);
    const anim = (key, to, ms) => new Promise(res => { const from = st[key], t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); st[key] = from + (to - from) * (k * (2 - k)); if (k < 1) requestAnimationFrame(step); else res(); }; step(); });
    const swing = side => { const key = side === 'a' ? 'swA' : 'swD'; anim(key, 1, 120).then(() => anim(key, 0, 260)); };
    return {
      stop() { cancelAnimationFrame(st.raf); },
      async charge(ms) { st.charging = 1; await Promise.all([anim('pa', 1, ms), anim('pd', 1, ms)]); },
      async back(ms) { st.charging = 0.4; await Promise.all([anim('pa', 0, ms), anim('pd', 0, ms)]); st.charging = 0; },
      swing,
      clash(power) { for (let i = 0; i < (power ? 46 : 24); i++) st.sparks.push({ x: meet, y: ground - 46 * S, vx: (Math.random() - 0.5) * 8, vy: -Math.random() * 5, life: 30, big: power }); st.shake = power ? 12 : 6; if (power) st.flash = 8; },
      hit(side, dmg, kind) {   // side が受けた。kind: 'power' | 'crit' | 'skill'
        const x = side === 'a' ? baseA + (meet - baseA) * 0.7 : baseD - (baseD - meet) * 0.7;
        if (dmg > 0) {
          if (side === 'a') { st.fa = 10; st.kbA = kind ? 40 : 26; } else { st.fd = 10; st.kbD = kind ? 40 : 26; }
          st.floats.push({ x, y: kind ? H * 0.52 : H * 0.3, text: '-' + dmg, col: kind === 'skill' ? '#ff6a2a' : kind ? '#ffd23a' : '#ff6a5a', size: kind ? 28 : 20, t0: performance.now() });
        } else st.floats.push({ x, y: H * 0.3, text: 'かわした！', col: '#bfe6ff', size: 15, t0: performance.now() });
      },
      crit() { st.banner = { text: '会心の一撃！', col: '#ffe066', glow: '#ff9a2a', size: 30, t0: performance.now() }; st.flash = 14; st.shake = 16; for (let i = 0; i < 70; i++) st.sparks.push({ x: meet, y: ground - 46 * S, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 7, life: 36, big: true }); },
      skill(name, col) { st.dark = 34; st.banner = { text: name, col: '#fff', glow: col, size: 32, t0: performance.now() }; st.flash = 18; st.shake = 20; for (let i = 0; i < 90; i++) st.sparks.push({ x: meet, y: ground - 46 * S, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 8, life: 40, big: true }); },
      text(t, col) { st.floats.push({ x: meet, y: H * 0.22, text: t, col: col || '#fff', size: 18, t0: performance.now() }); },
    };
  }

  function run(ua, ud, pSide, autoEnd) {
    return new Promise(resolve => {
      Sound.bgm('duel'); Sound.se('gong');
      const a = ua.g, d = ud.g;
      const ca = G.factions[ua.fi] ? G.factions[ua.fi].color : '#777', cd = ud.fi !== null && G.factions[ud.fi] ? G.factions[ud.fi].color : '#777';
      const el = document.getElementById('duel');
      el.innerHTML = `
        <div class="d-head">
          <div class="d-fighter" id="dA" style="--c:${ca}"><img src="${Portrait.get(a, 'angry', ca)}"><div class="d-name">${a.name}</div><div class="d-war">武力 ${a.war}</div><div class="d-hp"><i style="width:100%"></i><span>100</span></div></div>
          <div class="d-mid"><div class="d-title"><span style="white-space:nowrap">一騎討ち</span></div><div class="d-round">第1合</div></div>
          <div class="d-fighter" id="dD" style="--c:${cd}"><img src="${Portrait.get(d, 'angry', cd)}"><div class="d-name">${d.name}</div><div class="d-war">武力 ${d.war}</div><div class="d-hp"><i style="width:100%"></i><span>100</span></div></div>
        </div>
        <canvas class="d-arena"></canvas>
        <div class="d-chat"></div>
        <div class="d-btns"></div>`;
      el.classList.add('show');
      const chat = el.querySelector('.d-chat'), btns = el.querySelector('.d-btns'), roundEl = el.querySelector('.d-round');
      const hpA = el.querySelector('#dA .d-hp i'), hpD = el.querySelector('#dD .d-hp i');
      const hpAt = el.querySelector('#dA .d-hp span'), hpDt = el.querySelector('#dD .d-hp span');
      const arena = makeArena(el.querySelector('.d-arena'), ca, cd, a, d);
      const pace = ms => new Promise(r => setTimeout(r, ms / Math.max(1, (Battle.watching ? Auto.speed : 1))));
      let ha = 100, hd = 100, round = 0, busy = false;
      // 発言は左右に吹き出しで。実況は真ん中に、攻めた側の色の帯で
      const say = (side, text, kind) => {
        const g = side === 'a' ? a : side === 'd' ? d : null, col = side === 'a' ? ca : side === 'd' ? cd : '#888';
        const m = document.createElement('div');
        if (kind === 'act') { m.className = `d-act ${side}`; m.style.setProperty('--c', col); m.innerHTML = text; }
        else if (!g) { m.className = 'd-narr'; m.innerHTML = text; }
        else { m.className = `d-msg ${side}`; m.style.setProperty('--c', col); m.innerHTML = `<img src="${Portrait.get(g, side === 'a' ? exprA : exprD, col)}"><div><b>${g.name}</b><p>${text}</p></div>`; }
        chat.appendChild(m); chat.scrollTop = chat.scrollHeight;
      };
      let exprA = 'angry', exprD = 'angry';
      const setFace = (side, e) => { if (side === 'a') exprA = e; else exprD = e; el.querySelector(side === 'a' ? '#dA img' : '#dD img').src = Portrait.get(side === 'a' ? a : d, e, side === 'a' ? ca : cd); };
      const setHp = () => { hpA.style.width = Math.max(0, ha) + '%'; hpD.style.width = Math.max(0, hd) + '%'; hpAt.textContent = Math.max(0, ha); hpDt.textContent = Math.max(0, hd); };
      const close = res => { arena.stop(); el.classList.remove('show'); resolve(res); };
      say('a', line(a, 'duelChallenge', { foe: d.name }));
      setTimeout(() => say('d', line(d, 'duelAccept', { foe: a.name })), 500);
      const finish = (winner) => {
        const w = winner === 'a' ? a : d, l = winner === 'a' ? d : a, ws = winner, ls = winner === 'a' ? 'd' : 'a';
        const r = Math.random();
        const outcome = r < 0.3 ? 'killed' : r < 0.75 ? 'captured' : 'fled';
        setFace(ws, 'happy'); setFace(ls, 'sad');
        say(ls, line(l, 'duelLose'));
        say(ws, `<b>${line(w, 'duelWin', { foe: l.name })}</b>`);
        say(null, `${l.name}は${outcome === 'killed' ? '討ち取られた！' : outcome === 'captured' ? '馬から落ち、捕らえられた！' : '馬首を返して逃げ去った！'}`);
        arena.text(`${w.name} の勝利！`, '#ffd23a');
        Sound.se('win');
        btns.innerHTML = '<button class="btn primary">戦場へ戻る</button>';
        btns.querySelector('button').onclick = () => close({ winner, outcome });
        if (autoEnd || Auto.running) setTimeout(() => { const b = btns.querySelector('button'); if (b) b.click(); }, 2400 / Auto.speed);
      };
      const finishFlee = winner => {
        Sound.se('ng');
        btns.innerHTML = '<button class="btn primary">戦場へ戻る</button>';
        btns.querySelector('button').onclick = () => close({ winner, outcome: 'fled' });
        if (autoEnd || Auto.running) setTimeout(() => { const b = btns.querySelector('button'); if (b) b.click(); }, 2000 / Auto.speed);
      };
      const exchange = async (modeP) => {
        if (busy) return; busy = true;
        btns.querySelectorAll('button').forEach(b => b.disabled = true);
        round++; roundEl.textContent = `第${round}合`;
        const modeA = pSide === 'a' ? modeP : (Math.random() < 0.25 ? 'power' : 'atk');
        const modeD = pSide === 'd' ? modeP : (Math.random() < 0.25 ? 'power' : 'atk');
        await arena.charge(320);
        // 一撃ずつ：必殺技・会心・普通・空振りで演出と台詞を変える
        const blow = async (atkSide, defSide, mode, defMode) => {
          const A = atkSide === 'a' ? a : d, D = atkSide === 'a' ? d : a, col = atkSide === 'a' ? ca : cd;
          const r = strike(A, D, mode);
          let x = r.dmg; if (defMode === 'guard' && !r.skill) x = Math.round(x * 0.4);
          arena.swing(atkSide); Sound.se('whoosh');
          if (r.skill) { arena.skill(r.skill.name, col); Sound.se('skill'); say(atkSide, `<b>${r.skill.line}</b>`); await pace(500); }
          else if (r.crit && x > 0) { arena.crit(); Sound.se('crit'); say(atkSide, line(A, 'critical')); }
          arena.clash(mode === 'power' || r.crit || r.skill); if (!r.skill && !(r.crit && x > 0)) Sound.se(x ? (defMode === 'guard' ? 'block' : 'clash') : 'tap');
          arena.hit(defSide, x, r.skill ? 'skill' : r.crit ? 'crit' : mode === 'power' ? 'power' : null);
          const label = r.skill ? `必殺「${r.skill.name}」！` : r.crit ? '会心の一撃！' : mode === 'power' ? (atkSide === 'a' ? '渾身の一撃' : '渾身の反撃') : (atkSide === 'a' ? '斬りつけた' : '反撃');
          say(atkSide, x ? `${label} ${D.name}に <b>${x}</b>` : defMode === 'guard' ? `${D.name}は守りを固めた` : `${D.name}にかわされた`, 'act');
          return x;
        };
        hd -= await blow('a', 'd', modeA, modeD); setHp();
        if (hd > 0) {
          await pace(380);
          if (modeD === 'guard') { say('d', '守りを固めた', 'act'); }
          else { ha -= await blow('d', 'a', modeD, modeA); setHp(); }
        }
        if (ha < 35 && exprA === 'angry') setFace('a', 'shock'); if (hd < 35 && exprD === 'angry') setFace('d', 'shock');
        await arena.back(300);
        busy = false;
        // 逃走判定（剛勇は逃げない）
        if (hd > 0 && ha > 0) {
          if (hd < 25 && !Game.has(d, '剛勇') && pSide !== 'd' && Math.random() < 0.35) { say(null, `${d.name}は形勢不利と見て逃げ出した！`); btns.innerHTML = ''; return setTimeout(() => finishFlee('a'), 500); }
          if (ha < 25 && !Game.has(a, '剛勇') && pSide !== 'a' && Math.random() < 0.35) { say(null, `${a.name}は形勢不利と見て逃げ出した！`); btns.innerHTML = ''; return setTimeout(() => finishFlee('d'), 500); }
        }
        if (ha <= 0 || hd <= 0) { btns.innerHTML = ''; setTimeout(() => finish(ha > hd ? 'a' : 'd'), 500); return; }
        if (round >= 20) { btns.innerHTML = ''; say(null, '決着つかず――'); setTimeout(() => finish(ha >= hd ? 'a' : 'd'), 500); return; }
        btns.querySelectorAll('button').forEach(b => b.disabled = false);
        if (!pSide) setTimeout(() => exchange('atk'), 450 / Math.max(1, (Battle.watching ? Auto.speed : 1)));
      };
      if (pSide) {
        btns.innerHTML = `<button class="btn primary" data-m="atk">攻める</button><button class="btn" data-m="power">渾身</button><button class="btn" data-m="guard">守る</button><button class="btn danger" data-m="flee">退く</button>`;
        btns.querySelectorAll('button').forEach(b => b.onclick = () => {
          const m = b.dataset.m;
          if (m === 'flee') { say(pSide, '……ここは退く！'); btns.innerHTML = ''; return finishFlee(pSide === 'a' ? 'd' : 'a'); }
          exchange(m);
        });
      } else setTimeout(() => exchange('atk'), 1300);
    });
  }
  return { run, quick };
})();
