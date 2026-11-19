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
        playerSide: plan.atkFi === G.player ? 'atk' : 'def', gateHP: to.def * 2 + 300, gateMax: to.def * 2 + 300, log: [], sel: null, mode: 'idle', reach: null, targets: null, over: false,
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
        const pos = [[0, 4], [1, 3], [1, 5], [3, 3], [3, 5]];
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
      B.weather = pickWeather();
      setupDOM(opts && opts.auto);
      Sound.bgm('battle');
      Sound.se('march');
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
    const avail = root.getBoundingClientRect().height - 250;
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
    const range = Game.has(u.g, '弓術') ? 2 : 1;
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
    await new Promise(res => { const step = () => { const k = Math.min(1, (performance.now() - t0) / dur * (G.opts.aiSpeed || 1)); const e = k * (2 - k); u.y = fr + (r - fr) * e; u.x = fc + (c - fc) * e; if (k < 1) requestAnimationFrame(step); else res(); }; step(); });
  }

  async function doAttack(a, r, c) {
    if (r === 2 && c === 4 && B.tiles[2][4].t === 'gate' && !unitAt(r, c)) {
      // 城門攻撃
      const dmg = Math.round(Math.pow(a.troops, 0.8) * 0.9 * ((a.g.lead || 40) + a.g.war) / 120 * rnd(0.85, 1.15));
      B.gateHP -= dmg; Sound.se('hit'); slash(r, c); addFloater(r, c, `門-${dmg}`, '#ffd23a');
      if (B.gateHP <= 0) {
        B.tiles[2][4].t = 'road'; B.tiles[2][3].t = 'road'; B.tiles[2][5].t = 'road';   // 門の両脇の城壁も崩れる
        buildTerrainLayer(window.devicePixelRatio || 1);
        Sound.se('gong'); await banner('城門、破れたり！', 1000); addLog(`${a.g.name}隊が城門を破った！ 城壁も崩れた`);
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
    if (ranged) { Sound.se('arrow'); arrow(a, d); await sleep(350); } else { Sound.se('hit'); slash(r, c); }
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
      d.confused = 2; addFloater(d.r, d.c, '混乱', '#ffd23a'); addLog(`${d.g.name}隊は混乱した！`); Sound.se('ok');
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
    Sound.se('gong'); setTimeout(() => Sound.se('clash'), 250);
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
  function willAcceptDuel(d, a) {
    if (d.gi < 0) return false;
    // 総大将は討たれると負け。軍師が止める（賢いほど止める。相手が同格以上のとき）
    if (d.commander && a.g.war >= d.g.war - 4) {
      const smart = (B.watch && d.side === B.playerSide) ? B.smart : 0.35;
      if (Math.random() < 0.45 + 0.5 * smart) { d._held = true; return false; }
    }
    if (Game.has(d.g, '剛勇')) return true;
    if (Game.has(d.g, '臆病') || Game.has(d.g, '慎重')) return Math.random() < 0.15;
    return Math.random() < 0.45 + (d.g.war - a.g.war) / 60;
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
      if (!auto) await UI.talk(d.g, 'normal', d._held ? `${d.g.name}「……総大将が軽々しく動くわけにはいかん。相手にするな！」` : `${d.g.name}「${line(d.g, 'duelRefuse')}」`, G.factions[d.fi] ? G.factions[d.fi].color : '#777');
      d._held = false;
      d.morale = Math.max(0, d.morale - 8); a.morale = Math.min(100, a.morale + 5);
      addLog(`${d.g.name}は一騎打ちを避けた（士気が下がった）`);
      return;
    }
    const res = auto ? Duel.quick(a.g, d.g) : await Duel.run(a, d, B.watch ? null : a.side === B.playerSide ? 'a' : d.side === B.playerSide ? 'd' : null, B.watch);
    Sound.bgm('battle');
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
  const REINF = { name: '援軍', lead: 60, war: 60, int: 45, pol: 40, cha: 50, appear: 180, traits: [] };
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
        Sound.se('gong');
        await banner(`${fname(sd)}、背水の陣！`, 1300);
        addLog(`${fname(sd)}は追い詰められて奮い立った！（3日間、攻撃力が上がる）`);
        if (cmd.gi >= 0 && !auto) await UI.talk(cmd.g, 'angry', `${cmd.g.name}「退路はない！ ここで死力を尽くせ！」`, cmd.fi === null ? '#777' : G.factions[cmd.fi].color, { tag: '背水の陣' });
      }
    }
    // 援軍：隣の自都市から駆けつけることがある（各陣営1回まで）
    if (B.day >= 3) for (const sd of ['def', 'atk']) {
      if (B.reinf[sd]) continue;
      const fi = sd === 'atk' ? B.atkFi : B.defFi;
      if (fi === null) continue;
      if (Math.random() > (sd === 'def' ? 0.08 : 0.05)) continue;
      const src = B.to.adj.map(a => G.cities[a]).filter(c => c.owner === fi && c.i !== B.from.i && c.troops > 7000).sort((a, b2) => b2.troops - a.troops)[0];
      if (!src) continue;
      const pos = freeTile(sd); if (!pos) continue;
      const amt = Math.round(clamp(src.troops * 0.2, 1500, 6000) / 100) * 100;
      src.troops -= amt;
      B.reinf[sd] = true;
      const u = mkUnit(null, sd, fi, amt, pos[0], pos[1]);
      u.g = REINF; u.src = src.i; u.train = src.train; u.morale = 95;
      B.units.push(u);
      Sound.se('march');
      await banner(`${src.name}から援軍到着！`, 1300);
      addLog(`${src.name}から${fname(sd)}の援軍 ${amt} が駆けつけた！`);
    }
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
    for (const u of B.units.filter(u => u.alive && u.side === B.playerSide && !u.acted && u.gi >= 0)) {
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
      if (u.side === B.playerSide && !u.acted) { B.sel = u; B.mode = 'move'; B.reach = moveRange(u); B.targets = null; setActions([{ label: 'この場で行動', cls: 'primary', fn: () => { B.reach = null; u.prev = [u.r, u.c]; actMenu(u); } }, { label: '戻る', fn: () => { B.sel = null; B.reach = null; B.mode = 'idle'; showInfo(null); idleActions(); } }]); }
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
      .filter(o => bold ? u.g.war >= o.g.war - 3 : timid ? u.g.war >= o.g.war + 12 : u.g.war >= o.g.war + 6)
      .sort((a, b) => (b.commander ? 20 : 0) + (u.g.war - b.g.war) - ((a.commander ? 20 : 0) + (u.g.war - a.g.war)));
    const t = cands[0];
    if (!t) return false;
    if (u.commander && u.g.war < t.g.war + 12) return false;   // 総大将は大差で勝てる相手にだけ挑む
    let p = bold ? 0.6 : timid ? 0.2 : 0.4;
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
    if (u.side === 'def' && !rogue) {
      const keepGuard = u.commander && B.tiles[u.r][u.c].t === 'keep';
      if (keepGuard || (dist(nearest, u) > 4 && B.tiles[2][4].t === 'gate')) {
        const t = attackTargets(u).filter(([r, c]) => unitAt(r, c));
        if (t.length) { const [r, c] = t.sort((a, b) => unitAt(a[0], a[1]).troops - unitAt(b[0], b[1]).troops)[0]; await doAttack(u, r, c); return; }
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
    Sound.se(pWin ? 'win' : 'ng');
    await banner(pWin ? '勝利！' : '敗北…', 1400);
    const res = {
      atkWin: winner === 'atk', reason,
      atkLeft: B.units.filter(u => u.side === 'atk' && u.status !== 'killed' && u.src == null).reduce((s, u) => s + (u.alive || u.status === 'retreat' ? u.troops : 0), 0),
      defLeft: B.units.filter(u => u.side === 'def' && u.src == null).reduce((s, u) => s + (u.alive || u.status === 'retreat' ? u.troops : 0), 0) + (B.reserve || 0),
      captured: B.units.filter(u => u.gi >= 0 && u.status === 'captured').map(u => u.gi),
      killed: B.units.filter(u => u.gi >= 0 && u.status === 'killed').map(u => u.gi),
      days: B.day,
    };
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
    let hit = 0.65 + (a.war - d.war) / 120;
    let dmg = rnd(8, 16) * Math.pow(a.war / Math.max(30, d.war), 1.4);
    if (mode === 'power') { hit -= 0.25; dmg *= 2; }
    if (Game.has(a, '剛勇')) dmg *= 1.1;
    dmg *= Game.topK(a, 'war', 1.1, 1.18);   // 豪傑
    return Math.random() < clamp(hit, 0.15, 0.95) ? Math.round(dmg) : 0;
  }
  function quick(a, d) {
    let ha = 100, hd = 100;
    for (let i = 0; i < 30 && ha > 0 && hd > 0; i++) { hd -= strike(a, d, 'atk'); if (hd > 0) ha -= strike(d, a, 'atk'); }
    const winner = ha > hd ? 'a' : 'd';
    const r = Math.random();
    return { winner, outcome: r < 0.3 ? 'killed' : r < 0.75 ? 'captured' : 'fled' };
  }
  // pSide: 'a' or 'd' プレイヤーが操作する側（null なら観戦）
  function run(ua, ud, pSide, autoEnd) {
    return new Promise(resolve => {
      Sound.bgm('duel'); Sound.se('gong');
      const a = ua.g, d = ud.g;
      const ca = G.factions[ua.fi] ? G.factions[ua.fi].color : '#777', cd = ud.fi !== null && G.factions[ud.fi] ? G.factions[ud.fi].color : '#777';
      const el = document.getElementById('duel');
      el.innerHTML = `
        <div class="d-title">一騎討ち</div>
        <div class="d-row">
          <div class="d-side" id="dA"><img src="${Portrait.get(a, 'angry', ca)}"><div class="d-name">${a.name}</div><div class="d-war">武力 ${a.war}</div><div class="d-hp"><i style="width:100%"></i></div></div>
          <div class="d-vs">VS</div>
          <div class="d-side" id="dD"><img src="${Portrait.get(d, 'angry', cd)}"><div class="d-name">${d.name}</div><div class="d-war">武力 ${d.war}</div><div class="d-hp"><i style="width:100%"></i></div></div>
        </div>
        <div class="d-log"></div>
        <div class="d-btns"></div>`;
      el.classList.add('show');
      const logEl = el.querySelector('.d-log'), btns = el.querySelector('.d-btns');
      const hpA = el.querySelector('#dA .d-hp i'), hpD = el.querySelector('#dD .d-hp i');
      let ha = 100, hd = 100, round = 0;
      const log = t => { logEl.innerHTML = `<div>${t}</div>` + logEl.innerHTML; };
      log(`${a.name}「${line(a, 'duelChallenge', { foe: d.name })}」`);
      setTimeout(() => log(`${d.name}「${line(d, 'duelAccept', { foe: a.name })}」`), 500);
      const flash = id => { const s = el.querySelector(id); s.classList.remove('hit'); void s.offsetWidth; s.classList.add('hit'); };
      const finish = (winner) => {
        const w = winner === 'a' ? a : d, l = winner === 'a' ? d : a;
        const r = Math.random();
        const outcome = r < 0.3 ? 'killed' : r < 0.75 ? 'captured' : 'fled';
        el.querySelector(winner === 'a' ? '#dA img' : '#dD img').src = Portrait.get(w, 'happy', winner === 'a' ? ca : cd);
        el.querySelector(winner === 'a' ? '#dD img' : '#dA img').src = Portrait.get(l, 'sad', winner === 'a' ? cd : ca);
        log(`${l.name}「${line(l, 'duelLose')}」`);
        log(`<b>${w.name}「${line(w, 'duelWin', { foe: l.name })}」</b>`);
        log(`${l.name}は${outcome === 'killed' ? '討ち取られた！' : outcome === 'captured' ? '馬から落ち、捕らえられた！' : '馬首を返して逃げ去った！'}`);
        Sound.se('win');
        btns.innerHTML = '<button class="btn primary">戦場へ戻る</button>';
        btns.querySelector('button').onclick = () => { el.classList.remove('show'); resolve({ winner, outcome }); };
        if (autoEnd || Auto.running) setTimeout(() => { const b = btns.querySelector('button'); if (b) b.click(); }, 2200 / Auto.speed);
      };
      const exchange = (modeP) => {
        round++;
        const modeA = pSide === 'a' ? modeP : (Math.random() < 0.25 ? 'power' : 'atk');
        const modeD = pSide === 'd' ? modeP : (Math.random() < 0.25 ? 'power' : 'atk');
        let x = strike(a, d, modeA); if (modeD === 'guard') x = Math.round(x * 0.4);
        hd -= x; flash('#dD'); Sound.se(x ? 'clash' : 'tap');
        log(x ? `${a.name}の${modeA === 'power' ? '渾身の一撃' : '攻撃'}！ ${d.name}に${x}` : `${a.name}の攻撃は空を切った`);
        if (hd > 0) {
          let y = strike(d, a, modeD); if (modeA === 'guard') y = Math.round(y * 0.4);
          if (modeD === 'guard') y = 0;
          ha -= y; setTimeout(() => { flash('#dA'); Sound.se(y ? 'clash' : 'tap'); }, 250);
          log(y ? `${d.name}の反撃！ ${a.name}に${y}` : modeD === 'guard' ? `${d.name}は守りを固めた` : `${d.name}の攻撃をかわした`);
        }
        hpA.style.width = Math.max(0, ha) + '%'; hpD.style.width = Math.max(0, hd) + '%';
        // 逃走判定（剛勇は逃げない）
        if (hd > 0 && ha > 0) {
          if (hd < 25 && !Game.has(d, '剛勇') && pSide !== 'd' && Math.random() < 0.35) { log(`${d.name}は形勢不利と見て逃げ出した！`); return setTimeout(() => { btns.innerHTML = ''; finishFlee('a'); }, 500); }
          if (ha < 25 && !Game.has(a, '剛勇') && pSide !== 'a' && Math.random() < 0.35) { log(`${a.name}は形勢不利と見て逃げ出した！`); return setTimeout(() => { btns.innerHTML = ''; finishFlee('d'); }, 500); }
        }
        if (ha <= 0 || hd <= 0) { btns.innerHTML = ''; setTimeout(() => finish(ha > hd ? 'a' : 'd'), 600); return; }
        if (round >= 20) { btns.innerHTML = ''; log('決着つかず、両者引き分けた'); setTimeout(() => finish(ha >= hd ? 'a' : 'd'), 600); return; }
        if (!pSide) setTimeout(() => exchange('atk'), 650);
      };
      const finishFlee = winner => {
        Sound.se('ng');
        btns.innerHTML = '<button class="btn primary">戦場へ戻る</button>';
        btns.querySelector('button').onclick = () => { el.classList.remove('show'); resolve({ winner, outcome: 'fled' }); };
        if (autoEnd || Auto.running) setTimeout(() => { const b = btns.querySelector('button'); if (b) b.click(); }, 2000 / Auto.speed);
      };
      if (pSide) {
        btns.innerHTML = `<button class="btn primary" data-m="atk">攻める</button><button class="btn" data-m="power">渾身</button><button class="btn" data-m="guard">守る</button><button class="btn danger" data-m="flee">退く</button>`;
        btns.querySelectorAll('button').forEach(b => b.onclick = () => {
          const m = b.dataset.m;
          if (m === 'flee') { log(`${pSide === 'a' ? a.name : d.name}は退いた`); btns.innerHTML = ''; return finishFlee(pSide === 'a' ? 'd' : 'a'); }
          exchange(m);
        });
      } else setTimeout(() => exchange('atk'), 1200);
    });
  }
  return { run, quick };
})();
