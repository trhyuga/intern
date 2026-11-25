// ============================================================
//  星図：星雲・航路・勢力圏・艦隊。指でつまんで拡大、ドラッグで移動
// ============================================================
const StarMap = (() => {
  const WW = 1000, WH = 1500;
  let cv, c, dpr = 1, vw = 0, vh = 0;
  let cam = { x: WW / 2, y: WH / 2, z: 0.4 };
  let bg = null, raf = null, t0 = performance.now();
  let selPlanet = null, selFleet = null, moveMode = null;
  const pointers = new Map(); let pinch = null, drag = null, moved = false;
  let onTap = () => { };
  // ---------- 飾りの下ごしらえ（重い物は先に描いておき、毎フレームは貼るだけ） ----------
  const glowCache = new Map();
  // 柔らかい光の玉（色ごとに一度だけ作る）
  function glow(col, a = 1) {
    const k = col + a; let g = glowCache.get(k); if (g) return g;
    g = document.createElement('canvas'); g.width = g.height = 64;
    const x = g.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, Art.hexA(col, a)); gr.addColorStop(0.35, Art.hexA(col, a * 0.45)); gr.addColorStop(1, Art.hexA(col, 0));
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); glowCache.set(k, g); return g;
  }
  const blit = (img, x, y, R) => c.drawImage(img, x - R, y - R, R * 2, R * 2);
  // 瞬く星（2層、画面の座標で視差つき）
  let stars = null;
  function makeStars() {
    const r = Art.srand(777); stars = [];
    for (let i = 0; i < 170; i++) stars.push({ x: r(), y: r(), s: 0.5 + r() * (i < 30 ? 1.6 : 0.9), ph: r() * 6.3, sp: 0.6 + r() * 2.2, l: i < 60 ? 0.12 : 0.05, w: r() < 0.25 });
  }
  // 星雲と勢力圏の光（持ち主が変わった時だけ描き直す）
  const LS = 0.5; let layer = null, layerKey = '';
  function ownKey() { let k = ''; for (const p of G.planets) k += (p.owner === null ? '_' : p.owner) + p.type + (p.pop | 0) + ','; return k; }
  function buildLayer() {
    if (!layer) { layer = document.createElement('canvas'); layer.width = WW * LS; layer.height = WH * LS; }
    const x = layer.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, layer.width, layer.height);
    x.setTransform(LS, 0, 0, LS, 0, 0); x.globalCompositeOperation = 'lighter';
    // 星系ごとの星雲（星系の色相で、いくつかの雲を重ねる）
    for (const s of SYSTEMS) {
      const r = Art.srand(s.id * 97 + 13);
      for (let i = 0; i < 7; i++) {
        const a = r() * 6.3, d = r() * 190, R = 110 + r() * 170, h = s.hue + (r() - 0.5) * 50;
        const cx = s.x + Math.cos(a) * d, cy = s.y + Math.sin(a) * d * 1.2;
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, R);
        g.addColorStop(0, `hsla(${h},70%,${45 + r() * 20}%,${0.07 + r() * 0.06})`); g.addColorStop(0.6, `hsla(${h},70%,35%,.03)`); g.addColorStop(1, `hsla(${h},70%,30%,0)`);
        x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
      }
      // 塵の帯
      for (let i = 0; i < 40; i++) {
        const a = r() * 6.3, d = r() * 260;
        x.fillStyle = `hsla(${s.hue + 20},60%,80%,${0.04 + r() * 0.08})`;
        x.beginPath(); x.arc(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, 0.8 + r() * 2.2, 0, 7); x.fill();
      }
    }
    // 勢力圏（持ち主の色の柔らかい光。裂け目は脈打つので毎フレーム描く）
    for (const p of G.planets) {
      if (p.owner === null || p.type === 'rift') continue;
      const col = Game.ownerCol(p.owner), R0 = p.owner === 'E' ? 120 : 100;
      const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, R0);
      g.addColorStop(0, Art.hexA(col, p.owner === 'E' ? 0.3 : 0.17)); g.addColorStop(0.55, Art.hexA(col, p.owner === 'E' ? 0.12 : 0.07)); g.addColorStop(1, Art.hexA(col, 0));
      x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, R0, 0, 7); x.fill();
    }
    // 惑星そのものの柔らかい光
    x.globalAlpha = 0.5;
    for (const p of G.planets) { if (p.type === 'rift') continue; const R = planetR(p) * 2.6; x.drawImage(glow((PTYPES[p.type] || PTYPES.terra).col[2]), p.x - R, p.y - R, R * 2, R * 2); }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  }

  function init(canvas, tapFn) {
    cv = canvas; c = cv.getContext('2d'); onTap = tapFn;
    bg = Art.nebulaCanvas(500, 750, 4242, [8, 214, 160, 270, 28, 240], { alpha: 0.075, stars: 900 });
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    window.addEventListener('resize', resize);
    resize();
  }
  function resize() {
    if (!cv) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect(); vw = r.width; vh = r.height;
    cv.width = vw * dpr; cv.height = vh * dpr;
    clampCam();
  }
  const minZ = () => Math.min(vw / WW, vh / WH) * 0.95;
  // 星図の上下に重なっているパネル（作戦室・選んだもののカード・会敵の帯・上の帯）の高さ
  function insets() {
    const h = sel => { const e = document.querySelector(sel); return e && e.offsetParent !== null && getComputedStyle(e).display !== 'none' ? e.offsetHeight : 0; };
    const bottom = Math.max(h('#warroom.show'), h('#quick.show') ? h('#quick.show') + 16 : 0);
    const top = Math.max(h('#raid.show') ? h('#raid.show') + 16 : 0, h('#autobar.show'));
    return { top, bottom };
  }
  function clampCam() {
    cam.z = clamp(cam.z, minZ(), 2.2);
    const ins = insets();
    const hw = vw / cam.z / 2, hh = vh / cam.z / 2, it = ins.top / cam.z, ib = ins.bottom / cam.z;
    cam.x = hw * 2 >= WW ? WW / 2 : clamp(cam.x, hw - 40, WW - hw + 40);
    // パネルに隠れる分だけ、上下へ余計に動かせる（いちばん下の星も、パネルの上に出せる）
    cam.y = hh * 2 - it - ib >= WH ? WH / 2 + (ib - it) / 2 : clamp(cam.y, hh - 40 - it, WH - hh + 40 + ib);
  }
  const toScreen = (x, y) => [(x - cam.x) * cam.z + vw / 2, (y - cam.y) * cam.z + vh / 2];
  const toWorld = (sx, sy) => [(sx - vw / 2) / cam.z + cam.x, (sy - vh / 2) / cam.z + cam.y];
  function zoomAt(sx, sy, k) {
    const [wx, wy] = toWorld(sx, sy);
    cam.z *= k; clampCam();
    const [nx, ny] = toWorld(sx, sy);
    cam.x += wx - nx; cam.y += wy - ny; clampCam();
  }
  // yFrac：画面の高さのどこに星を置くか（作戦室が下半分を覆うときは 0.25）
  function focus(pid, z, yFrac) {
    const p = G.planets[pid]; if (!p) return;
    if (z) cam.z = z;
    const ins = insets();
    // 見えている範囲（パネルを除いた所）の真ん中に星を置く
    cam.x = p.x; cam.y = p.y + (yFrac ? (0.5 - yFrac) * vh / cam.z : (ins.bottom - ins.top) / 2 / cam.z); clampCam();
  }
  // 2つの星がどちらも見えるように寄せる（侵攻の矢印を見せるとき）
  function focusPair(a, b, yFrac) {
    const A = G.planets[a], B = G.planets[b]; if (!A || !B) return;
    const span = Math.max(Math.abs(A.x - B.x) + 160, (Math.abs(A.y - B.y) + 160) * (yFrac ? 2 : 1));
    cam.z = clamp(Math.min(vw / span, 1.1), minZ(), 1.1);
    const my = (A.y + B.y) / 2;
    const ins = insets();
    cam.x = (A.x + B.x) / 2; cam.y = my + (yFrac ? (0.5 - yFrac) * vh / cam.z : (ins.bottom - ins.top) / 2 / cam.z); clampCam();
  }
  function down(e) {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: cam.z }; drag = null; }
    else { drag = { x: e.offsetX, y: e.offsetY, cx: cam.x, cy: cam.y }; moved = false; }
  }
  function move(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      zoomAt(mx, my, (pinch.z * d / pinch.d) / cam.z);
      moved = true;
    } else if (drag) {
      const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
      if (Math.hypot(dx, dy) > 6) moved = true;
      if (moved) { cam.x = drag.cx - dx / cam.z; cam.y = drag.cy - dy / cam.z; clampCam(); }
    }
  }
  function up(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && !moved && pointers.size === 0) tap(e.offsetX, e.offsetY);
    if (pointers.size === 0) drag = null;
  }
  function tap(sx, sy) {
    // 艦隊の印
    for (const f of fleetMarks()) { const [x, y] = toScreen(f.x, f.y); if (Math.hypot(sx - x, sy - y) < 16) { onTap({ fleet: f.fl }); return; } }
    let best = null, bd = 34;
    for (const p of G.planets) { const [x, y] = toScreen(p.x, p.y); const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = p; } }
    onTap(best ? { planet: best.id } : {});
  }
  // 艦隊の印の位置（星のまわりに並べる）
  function fleetMarks() {
    const out = [], by = new Map();
    for (const fl of G.fleets) { if (!fl.ships.length) continue; if (!by.has(fl.at)) by.set(fl.at, []); by.get(fl.at).push(fl); }
    for (const [pid, list] of by) {
      const p = G.planets[pid];
      list.sort((a, b) => (a.fac === G.player ? -1 : 1) - (b.fac === G.player ? -1 : 1));
      list.forEach((fl, i) => { const a = -Math.PI / 2 + 0.7 + i * 0.75; out.push({ fl, x: p.x + Math.cos(a) * 30, y: p.y + Math.sin(a) * 30 }); });
    }
    return out;
  }
  function planetR(p) { return p.type === 'rift' ? 14 : 7 + Math.sqrt(p.pop) * 0.9; }

  // ---------- 描く ----------
  function draw() {
    const t = (performance.now() - t0) / 1000;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#02030a'; c.fillRect(0, 0, vw, vh);
    // 背景（少し遅れて動く）
    const bx = (cam.x / WW - 0.5) * 40, by = (cam.y / WH - 0.5) * 40;
    const [ox, oy] = toScreen(0, 0);
    c.globalAlpha = 1;
    c.drawImage(bg, ox + bx * 0.5 - 20, oy + by * 0.5 - 20, WW * cam.z + 40, WH * cam.z + 40);
    // 瞬く星（視差）
    if (!stars) makeStars();
    const W2 = vw + 20, H2 = vh + 20;
    for (const s of stars) {
      const px = ((s.x * W2 - cam.x * cam.z * s.l) % W2 + W2) % W2 - 10, py = ((s.y * H2 - cam.y * cam.z * s.l) % H2 + H2) % H2 - 10;
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
      if (s.s > 1.4) { c.globalAlpha = a * 0.7; blit(glow(s.w ? '#ffd8b0' : '#bcd4ff'), px, py, s.s * 3.2); }
      c.globalAlpha = a; c.fillStyle = s.w ? '#ffe6c8' : '#e6eeff'; c.fillRect(px - s.s / 2, py - s.s / 2, s.s, s.s);
    }
    c.globalAlpha = 1;
    // 星雲と勢力圏（下ごしらえ済みの絵を貼る）
    const k = ownKey(); if (!layer || k !== layerKey) { buildLayer(); layerKey = k; }
    c.globalCompositeOperation = 'lighter';
    c.drawImage(layer, ox, oy, WW * cam.z, WH * cam.z);
    c.globalCompositeOperation = 'source-over';
    c.save();
    c.translate(vw / 2, vh / 2); c.scale(cam.z, cam.z); c.translate(-cam.x, -cam.y);
    // 星系の名前
    c.textAlign = 'center';
    for (const s of SYSTEMS) {
      c.fillStyle = `hsla(${s.hue},60%,75%,.18)`; c.font = '700 34px "Shippori Mincho B1",serif';
      c.fillText(s.name, s.x, s.y - 230);
    }
    // 勢力圏
    c.globalCompositeOperation = 'lighter';
    for (const p of G.planets) {
      if (p.owner === null || p.type !== 'rift') continue;
      const col = Game.ownerCol(p.owner);
      const R0 = 160 + Math.sin(t * 2) * 12;
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, R0);
      g.addColorStop(0, Art.hexA(col, p.owner === 'E' ? 0.3 : 0.16)); g.addColorStop(1, Art.hexA(col, 0));
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, R0, 0, 7); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    // 航路
    for (const [a, b] of Game.LANES) {
      const A = G.planets[a], B = G.planets[b];
      const same = A.owner !== null && A.owner === B.owner;
      const gate = A.sys !== B.sys;
      c.strokeStyle = same ? Art.hexA(Game.ownerCol(A.owner), 0.55) : gate ? 'rgba(190,210,255,.32)' : 'rgba(150,170,210,.22)';
      c.lineWidth = gate ? 2.2 : 1.4;
      if (A.type === 'rift' || B.type === 'rift') { c.strokeStyle = `rgba(255,40,110,${0.4 + Math.sin(t * 3) * 0.2})`; c.lineWidth = 2.5; }
      if (gate) c.setLineDash([10, 7]);
      c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
      c.setLineDash([]);
    }
    // 航路を流れる光
    c.globalCompositeOperation = 'lighter';
    for (const [a, b] of Game.LANES) {
      const A = G.planets[a], B = G.planets[b];
      const rift = A.type === 'rift' || B.type === 'rift';
      const same = A.owner !== null && A.owner === B.owner;
      const col = rift ? '#ff2a6a' : same ? Game.ownerCol(A.owner) : '#9fc0ff';
      const L = Math.hypot(B.x - A.x, B.y - A.y) || 1, n = L > 260 ? 2 : 1;
      const dir = (a * 7 + b * 3) % 2 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        let f = ((t * (rift ? 70 : 38)) / L + (a * 0.137 + b * 0.291) + i / n) % 1; if (dir < 0) f = 1 - f;
        const fade = Math.sin(f * Math.PI);
        c.globalAlpha = (same || rift ? 0.95 : 0.6) * fade;
        blit(glow(col), A.x + (B.x - A.x) * f, A.y + (B.y - A.y) * f, rift ? 9 : 7);
      }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    // 移動の予定
    for (const fl of G.fleets) {
      if (fl.fac !== G.player) continue;
      const tgt = fl.route ?? fl.dest;
      if (tgt === null || tgt === undefined) continue;
      const path = Game.path(fl.at, tgt, n => Game.friendly(G.player, G.planets[n].owner)) || [fl.at, tgt];
      c.strokeStyle = 'rgba(120,230,255,.85)'; c.lineWidth = 3; c.setLineDash([8, 6]); c.lineDashOffset = -t * 30;
      c.beginPath(); path.forEach((id, i) => { const p = G.planets[id]; i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }); c.stroke();
      c.setLineDash([]); c.lineDashOffset = 0;
      const e = G.planets[tgt]; c.strokeStyle = 'rgba(120,230,255,.9)'; c.lineWidth = 2; c.beginPath(); c.arc(e.x, e.y, planetR(e) + 10 + Math.sin(t * 4) * 2, 0, 7); c.stroke();
    }
    drawThreats(t);
    drawRaids(t);
    // 移動先の候補
    if (moveMode) {
      const fl = moveMode;
      for (const p of G.planets) {
        if (p.id === fl.at) continue;
        const ok = Game.canEnter(G.player, p.id) && Game.path(fl.at, p.id, n => Game.friendly(G.player, G.planets[n].owner));
        if (!ok) continue;
        const hostile = !Game.friendly(G.player, p.owner);
        c.strokeStyle = hostile ? `rgba(255,110,90,${0.6 + Math.sin(t * 5) * 0.3})` : `rgba(120,230,255,${0.5 + Math.sin(t * 5) * 0.3})`;
        c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, planetR(p) + 8, 0, 7); c.stroke();
      }
    }
    // 惑星
    for (const p of G.planets) {
      const r = planetR(p);
      const PT = PTYPES[p.type] || PTYPES.terra;
      if (p.owner === 'E') drawCorrupt(p, r, t);
      Art.planet(c, p.x, p.y, r, p.type, p.seed, { t });
      if (p.type === 'rift') drawBlackSun(p, r, t);
      else {
        // 大気の縁（光の当たる側）
        c.strokeStyle = Art.hexA(PT.col[2], 0.75); c.lineWidth = 1.2;
        c.beginPath(); c.arc(p.x, p.y, r - 0.4, Math.PI * 0.95, Math.PI * 1.75); c.stroke();
        if (p.type === 'ice' || p.type === 'ruin') { c.strokeStyle = Art.hexA(PT.col[0], 0.35); c.lineWidth = 0.8; c.beginPath(); c.ellipse(p.x, p.y, r * 1.55, r * 0.35, 0.3, 0, 7); c.stroke(); }
        if (p.owner === 'E') { c.fillStyle = `rgba(60,0,40,${0.35 + Math.sin(t * 2.5 + p.id) * 0.12})`; c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill(); }
      }
      const col = Game.ownerCol(p.owner);
      c.strokeStyle = col; c.lineWidth = p.cap ? 3 : 1.6;
      c.beginPath(); c.arc(p.x, p.y, r + 3, 0, 7); c.stroke();
      if (p.cap) { c.strokeStyle = Art.hexA(col, 0.5); c.lineWidth = 1; c.beginPath(); c.arc(p.x, p.y, r + 7, 0, 7); c.stroke(); drawCrown(p.x, p.y - r - (typeof p.owner === 'string' && p.owner !== 'E' ? 20 : 11), col, t); }
      // 防衛衛星
      for (let i = 0; i < Math.min(10, p.def); i++) {
        const a = t * 0.4 + i * Math.PI * 2 / Math.max(1, p.def);
        c.fillStyle = '#dfe8ff'; c.fillRect(p.x + Math.cos(a) * (r + 5) - 1, p.y + Math.sin(a) * (r + 5) * 0.45 - 1, 2, 2);
      }
      if (p.id === selPlanet) { c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.setLineDash([4, 4]); c.beginPath(); c.arc(p.x, p.y, r + 13, t, t + 7); c.stroke(); c.setLineDash([]); }
      // 名前
      if (cam.z > 0.42 || p.cap) {
        c.font = `${p.cap ? 700 : 500} ${Math.max(11, 13 / Math.sqrt(cam.z))}px "Shippori Mincho B1",serif`;
        c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(p.name, p.x + 1, p.y + r + 17);
        c.fillStyle = p.owner === G.player ? '#ffffff' : '#c8d2e6'; c.fillText(p.name, p.x, p.y + r + 16);
      }
      // 小勢力・蝕の印
      if (typeof p.owner === 'string' && p.owner !== 'E') { c.fillStyle = col; c.font = '700 11px sans-serif'; c.fillText('◆', p.x, p.y - r - 6); }
      if (p.build.length && p.owner === G.player) { c.fillStyle = '#9ae0ff'; c.font = '10px sans-serif'; c.fillText('⚙', p.x + r + 6, p.y - r); }
      if (p.dock.length && p.owner === G.player) { c.fillStyle = '#dfe8ff'; c.font = '10px sans-serif'; c.fillText('⚓' + p.dock.length, p.x - r - 10, p.y - r); }
    }
    // 艦隊
    for (const m of fleetMarks()) {
      const fl = m.fl, col = Game.ownerCol(fl.fac);
      const sel = fl === selFleet;
      // エンジンの尾（星から外へ流れる）と光
      const P0 = G.planets[fl.at], ex = m.x - P0.x, ey = m.y - P0.y, el = Math.hypot(ex, ey) || 1;
      c.globalCompositeOperation = 'lighter';
      const tr = c.createLinearGradient(m.x, m.y, m.x + ex / el * 22, m.y + ey / el * 22);
      tr.addColorStop(0, Art.hexA(col, 0.55)); tr.addColorStop(1, Art.hexA(col, 0));
      c.strokeStyle = tr; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(m.x, m.y); c.lineTo(m.x + ex / el * (18 + Math.sin(t * 9 + fl.at) * 3), m.y + ey / el * (18 + Math.sin(t * 9 + fl.at) * 3)); c.stroke(); c.lineCap = 'butt';
      c.globalAlpha = 0.6 + Math.sin(t * 3 + fl.at) * 0.15; blit(glow(col), m.x, m.y, 20); c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.save(); c.translate(m.x, m.y);
      if (sel) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 13, 0, 7); c.stroke(); }
      c.fillStyle = 'rgba(0,0,0,.55)'; c.beginPath(); c.arc(0, 0, 10, 0, 7); c.fill();
      if (fl.fac === 'E') Art.ship(c, 'maw', 0, 0, 0, 16, col, { noEngine: true });
      else Art.ship(c, 'cl', 0, 0, 0, 15, col, { noEngine: true });
      c.fillStyle = '#fff'; c.font = '700 10px sans-serif'; c.textAlign = 'center';
      c.fillText(fl.ships.length, 0, 21);
      if ((fl.route ?? fl.dest) !== null && (fl.route ?? fl.dest) !== undefined && fl.fac === G.player) { c.fillStyle = '#7ae0ff'; c.fillText('▶', 12, -8); }
      c.restore();
    }
    c.restore();
  }
  // 蝕に染まった星：紫と赤の触手がうごめく
  function drawCorrupt(p, r, t) {
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    const n = p.type === 'rift' ? 9 : 6, rr = Art.srand(p.seed + 5);
    for (let i = 0; i < n; i++) {
      const a0 = rr() * 6.3 + Math.sin(t * 0.4 + i) * 0.3, len = r * (p.type === 'rift' ? 3.4 : 2.4) * (0.75 + 0.25 * Math.sin(t * 1.7 + i * 2.1));
      const sx = p.x + Math.cos(a0) * r * 0.8, sy = p.y + Math.sin(a0) * r * 0.8;
      const ex = p.x + Math.cos(a0) * (r + len), ey = p.y + Math.sin(a0) * (r + len);
      const bend = Math.sin(t * 1.3 + i * 1.7) * len * 0.45;
      const mx = (sx + ex) / 2 - Math.sin(a0) * bend, my = (sy + ey) / 2 + Math.cos(a0) * bend;
      c.strokeStyle = i % 2 ? `rgba(170,40,255,${0.35 + Math.sin(t * 3 + i) * 0.15})` : `rgba(255,30,90,${0.35 + Math.sin(t * 2.6 + i) * 0.15})`;
      c.lineWidth = Math.max(1, r * 0.22);
      c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(mx, my, ex, ey); c.stroke();
    }
    c.restore();
  }
  // 裂け目：黒い太陽（光冠と回る光の筋）。深淵はさらに大きく、まがまがしく
  function drawBlackSun(p, r, t) {
    const ab = !!p.abyss, k = ab ? 1.5 : 1;
    c.save(); c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.7 + Math.sin(t * 2) * 0.2; blit(glow(ab ? '#ff1040' : '#ff2a6a'), p.x, p.y, r * 3.6 * k); c.globalAlpha = 1;
    c.translate(p.x, p.y); c.rotate(t * (ab ? -0.25 : 0.18));
    const n = ab ? 18 : 12;
    for (let i = 0; i < n; i++) {
      const a = i * Math.PI * 2 / n, l = r * (1.9 + 0.7 * Math.sin(t * 2.2 + i * 1.3)) * k;
      c.strokeStyle = i % 2 ? 'rgba(255,60,120,.45)' : 'rgba(190,60,255,.4)'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05); c.lineTo(Math.cos(a) * l, Math.sin(a) * l); c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    // 事象の地平（黒い核と細い光の縁）
    c.fillStyle = '#000'; c.beginPath(); c.arc(0, 0, r * 0.95, 0, 7); c.fill();
    c.strokeStyle = `rgba(255,${ab ? 60 : 120},${ab ? 80 : 170},${0.75 + Math.sin(t * 4) * 0.2})`; c.lineWidth = 1.6; c.beginPath(); c.arc(0, 0, r * 0.98, 0, 7); c.stroke();
    if (ab) { c.strokeStyle = 'rgba(255,40,70,.6)'; c.lineWidth = 1.2; c.setLineDash([3, 5]); c.beginPath(); c.arc(0, 0, r * 2.4, 0, 7); c.stroke(); c.setLineDash([]); }
    c.restore();
  }
  // 首都の冠
  function drawCrown(x, y, col, t) {
    c.save(); c.translate(x, y);
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.55 + Math.sin(t * 2) * 0.15; blit(glow('#ffd76a'), 0, 0, 11); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.beginPath(); c.moveTo(-6, 3); c.lineTo(-7, -4); c.lineTo(-3, -1); c.lineTo(0, -6); c.lineTo(3, -1); c.lineTo(7, -4); c.lineTo(6, 3); c.closePath();
    c.fillStyle = '#ffd76a'; c.fill(); c.strokeStyle = Art.mix(col, '#000000', 0.3); c.lineWidth = 1; c.stroke();
    c.restore();
  }
  // ---------- 侵攻の矢印（今月と先月、どこからどこへ攻め込んだか） ----------
  let raidFocus = null;
  const RES_TXT = { take: '制圧', repel: '撃退', free: '無血', fight: '交戦' };
  function arrow(A, B, col, w, alpha, t, danger, strong) {
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const sx = A.x + ux * (planetR(A) + 8), sy = A.y + uy * (planetR(A) + 8);
    const ex = B.x - ux * (planetR(B) + 12), ey = B.y - uy * (planetR(B) + 12);
    // 少し弧を描く（往復の矢印が重ならないように、進む向きの右へふくらむ）
    const bend = Math.min(60, L * 0.18), mx = (sx + ex) / 2 - uy * bend, my = (sy + ey) / 2 + ux * bend;
    c.save(); c.globalAlpha = alpha; c.lineCap = 'round';
    if (danger) { c.strokeStyle = `rgba(255,60,50,${0.55 + Math.sin(t * 6) * 0.35})`; c.lineWidth = w + 6; c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(mx, my, ex, ey); c.stroke(); }
    c.strokeStyle = Art.hexA(col, 0.95); c.lineWidth = w;
    c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(mx, my, ex, ey); c.stroke();
    // 流れる光
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = Math.max(1.2, w * 0.35); c.setLineDash([6, 22]); c.lineDashOffset = -t * (strong ? 70 : 40);
    c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(mx, my, ex, ey); c.stroke(); c.setLineDash([]);
    // 矢じり（曲線の終わりの向き）
    const ax = ex - mx, ay = ey - my, al = Math.hypot(ax, ay) || 1, vx = ax / al, vy = ay / al, hs = w * 2.6 + 6;
    c.fillStyle = danger ? '#ff4a3a' : Art.hexA(col, 1);
    c.beginPath(); c.moveTo(ex + vx * 4, ey + vy * 4); c.lineTo(ex - vx * hs - vy * hs * 0.6, ey - vy * hs + vx * hs * 0.6); c.lineTo(ex - vx * hs + vy * hs * 0.6, ey - vy * hs - vx * hs * 0.6); c.closePath(); c.fill();
    c.restore();
  }
  function drawRaids(t) {
    // 月が変わると G.turn が1つ進むので、「直近の月」と「その前の月」の2か月分を描く
    const list = (G.raids || []).filter(r => r.t >= G.turn - 2 && G.planets[r.from] && G.planets[r.to]);
    if (!list.length) return;
    const lastT = Math.max(...list.map(x => x.t));
    for (const r of list) {
      const A = G.planets[r.from], B = G.planets[r.to];
      const now = r.t === lastT;
      const foc = raidFocus && raidFocus.from === r.from && raidFocus.to === r.to;
      const mine = r.fac === G.player, hit = r.def === G.player;
      const alpha = raidFocus ? (foc ? 1 : 0.18) : now ? (mine || hit ? 0.95 : 0.6) : 0.3;
      const w = foc ? 6 : mine || hit ? 4 : 2.6;
      arrow(A, B, Game.ownerCol(r.fac), w, alpha, t, hit && (foc || now), foc);
      // 戦いの星の印と結果の札
      c.save(); c.globalAlpha = alpha; c.textAlign = 'center';
      c.font = `700 ${foc ? 18 : 14}px sans-serif`; c.fillStyle = hit ? '#ff6a5a' : '#ffe0a0';
      c.fillText('⚔', B.x - planetR(B) - 12, B.y - planetR(B) - 4);
      if (r.res) {
        const txt = RES_TXT[r.res] || '', win = r.res === 'take' || r.res === 'free';
        const col = Game.ownerCol(win ? r.fac : r.def);
        c.font = '700 11px sans-serif'; const tw = c.measureText(txt).width + 10, y = B.y - planetR(B) - 26;
        c.fillStyle = 'rgba(0,0,0,.75)'; c.fillRect(B.x - tw / 2, y - 11, tw, 15);
        c.strokeStyle = col; c.lineWidth = 1.2; c.strokeRect(B.x - tw / 2, y - 11, tw, 15);
        c.fillStyle = col; c.fillText(txt, B.x, y);
      }
      c.restore();
    }
  }
  // 自国の星の隣に敵の艦隊がいれば、その航路を赤い点線にし、星に「！」を出す
  function drawThreats(t) {
    if (G.player === undefined || G.player === null) return;
    const warned = new Set();
    for (const fl of G.fleets) {
      if (!fl.ships.length || fl.fac === G.player || Game.friendly(fl.fac, G.player)) continue;
      if (fl.fac !== 'E' && !Game.canAttack(fl.fac, G.player)) continue;
      for (const n of Game.ADJ[fl.at] || []) {
        const P = G.planets[n]; if (P.owner !== G.player) continue;
        const A = G.planets[fl.at];
        c.strokeStyle = `rgba(255,80,70,${0.45 + Math.sin(t * 4) * 0.25})`; c.lineWidth = 2.4; c.setLineDash([5, 6]); c.lineDashOffset = t * 20;
        c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(P.x, P.y); c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
        warned.add(n);
      }
    }
    c.save(); c.textAlign = 'center'; c.font = '900 15px sans-serif';
    for (const n of warned) { const P = G.planets[n]; c.fillStyle = `rgba(255,90,70,${0.7 + Math.sin(t * 6) * 0.3})`; c.fillText('！', P.x + planetR(P) + 9, P.y + 5); }
    c.restore();
  }
  function loop() { draw(); raf = requestAnimationFrame(loop); }
  function start() { if (!raf) { resize(); raf = requestAnimationFrame(loop); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }

  return {
    init, start, stop, resize, focus, focusPair, toScreen,
    set raidFocus(v) { raidFocus = v; }, get raidFocus() { return raidFocus; },
    set selPlanet(v) { selPlanet = v; }, get selPlanet() { return selPlanet; },
    set selFleet(v) { selFleet = v; }, get selFleet() { return selFleet; },
    set moveMode(v) { moveMode = v; }, get moveMode() { return moveMode; },
    get cam() { return cam; },
  };
})();
