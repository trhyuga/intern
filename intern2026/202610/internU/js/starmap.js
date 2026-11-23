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
  function clampCam() {
    cam.z = clamp(cam.z, minZ(), 2.2);
    const hw = vw / cam.z / 2, hh = vh / cam.z / 2;
    cam.x = hw * 2 >= WW ? WW / 2 : clamp(cam.x, hw - 40, WW - hw + 40);
    cam.y = hh * 2 >= WH ? WH / 2 : clamp(cam.y, hh - 40, WH - hh + 40);
  }
  const toScreen = (x, y) => [(x - cam.x) * cam.z + vw / 2, (y - cam.y) * cam.z + vh / 2];
  const toWorld = (sx, sy) => [(sx - vw / 2) / cam.z + cam.x, (sy - vh / 2) / cam.z + cam.y];
  function zoomAt(sx, sy, k) {
    const [wx, wy] = toWorld(sx, sy);
    cam.z *= k; clampCam();
    const [nx, ny] = toWorld(sx, sy);
    cam.x += wx - nx; cam.y += wy - ny; clampCam();
  }
  function focus(pid, z) {
    const p = G.planets[pid]; if (!p) return;
    cam.x = p.x; cam.y = p.y; if (z) cam.z = z; clampCam();
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
      if (p.owner === null) continue;
      const col = Game.ownerCol(p.owner);
      const R0 = p.type === 'rift' ? 160 + Math.sin(t * 2) * 12 : 95;
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
      Art.planet(c, p.x, p.y, r, p.type, p.seed, { t });
      const col = Game.ownerCol(p.owner);
      c.strokeStyle = col; c.lineWidth = p.cap ? 3 : 1.6;
      c.beginPath(); c.arc(p.x, p.y, r + 3, 0, 7); c.stroke();
      if (p.cap) { c.strokeStyle = Art.hexA(col, 0.5); c.lineWidth = 1; c.beginPath(); c.arc(p.x, p.y, r + 7, 0, 7); c.stroke(); }
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
  function loop() { draw(); raf = requestAnimationFrame(loop); }
  function start() { if (!raf) { resize(); raf = requestAnimationFrame(loop); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }

  return {
    init, start, stop, resize, focus, toScreen,
    set selPlanet(v) { selPlanet = v; }, get selPlanet() { return selPlanet; },
    set selFleet(v) { selFleet = v; }, get selFleet() { return selFleet; },
    set moveMode(v) { moveMode = v; }, get moveMode() { return moveMode; },
    get cam() { return cam; },
  };
})();
