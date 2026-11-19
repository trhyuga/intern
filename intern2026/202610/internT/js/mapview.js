// ============================================================
//  全国地図（ドラッグで移動・ピンチで拡大縮小・タップで都市を選ぶ）
// ============================================================
const MapView = (() => {
  const MW = 1000, MH = 920;
  let cv, ctx, W, H, dpr, scale = 1, ox = 0, oy = 0, base = null;
  let selected = -1, highlight = null, onTapCity = null, arrows = [], raf = null, dirty = true;
  const pointers = new Map(); let pinch0 = null, drag0 = null, moved = false;

  function init(canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    window.addEventListener('resize', resize);
    resize();
    const loop = () => { if (dirty || arrows.length) { render(); dirty = false; } raf = requestAnimationFrame(loop); };
    loop();
  }
  function resize() {
    if (!cv) return;
    const r = cv.parentElement.getBoundingClientRect();
    W = r.width; H = r.height; dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const fit = Math.min(W / MW, H / MH);
    if (!base || scale < fit) { scale = Math.max(fit, W / MW * 1.4); }
    buildBase();
    clampView(); dirty = true;
  }
  function clampView() {
    const mw = MW * scale, mh = MH * scale;
    ox = mw <= W ? (W - mw) / 2 : clamp(ox, W - mw, 0);
    oy = mh <= H ? (H - mh) / 2 : clamp(oy, H - mh, 0);
  }
  function zoomAt(x, y, k) {
    const fit = Math.min(W / MW, H / MH);
    const ns = clamp(scale * k, fit, 3.2);
    const mx = (x - ox) / scale, my = (y - oy) / scale;
    scale = ns; ox = x - mx * scale; oy = y - my * scale; clampView(); dirty = true;
  }
  function centerOn(ci) {
    const c = G.cities[ci]; ox = W / 2 - c.x * scale; oy = H / 2 - c.y * scale; clampView(); dirty = true;
  }

  // 地形（変わらない部分）を一枚の絵にしておく
  function buildBase() {
    base = document.createElement('canvas');
    const S = 1.6; base.width = MW * S; base.height = MH * S;
    const c = base.getContext('2d'); c.scale(S, S);
    // 海
    const sea = c.createLinearGradient(0, 0, MW, MH); sea.addColorStop(0, '#2c5470'); sea.addColorStop(1, '#1d3b52');
    c.fillStyle = sea; c.fillRect(0, 0, MW, MH);
    c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = 1;
    for (let y = 0; y < MH; y += 14) { c.beginPath(); for (let x = 0; x <= MW; x += 20) c.lineTo(x, y + Math.sin(x / 30 + y) * 2); c.stroke(); }
    // 陸
    c.beginPath(); MAP_LAND.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
    const land = c.createRadialGradient(500, 450, 100, 500, 450, 700); land.addColorStop(0, '#d8c79a'); land.addColorStop(1, '#b9a575');
    c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 20; c.fillStyle = land; c.fill(); c.restore();
    c.lineWidth = 3; c.strokeStyle = '#6a5a3a'; c.stroke();
    // 紙の質感
    c.save(); c.clip();
    for (let i = 0; i < 2500; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '90,70,40' : '255,250,230'},0.07)`; c.fillRect(Math.random() * MW, Math.random() * MH, 2, 2); }
    // 北の草原・西の砂漠・南の緑
    const tint = (x, y, r, col) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); };
    tint(100, 250, 250, 'rgba(220,190,120,0.5)'); tint(350, 120, 300, 'rgba(160,170,110,0.35)');
    tint(400, 800, 350, 'rgba(110,150,90,0.35)'); tint(200, 700, 250, 'rgba(110,150,90,0.3)'); tint(700, 750, 250, 'rgba(110,150,90,0.3)');
    // 山
    MAP_MOUNTAINS.forEach(([x, y]) => {
      for (let k = 0; k < 3; k++) {
        const mx = x + (k - 1) * 16, my = y + (k === 1 ? -6 : 0), h = 20 + (k === 1 ? 8 : 0);
        c.fillStyle = '#8a7a5a'; c.beginPath(); c.moveTo(mx - 14, my + 10); c.lineTo(mx, my - h + 10); c.lineTo(mx + 14, my + 10); c.fill();
        c.fillStyle = '#a8987a'; c.beginPath(); c.moveTo(mx, my - h + 10); c.lineTo(mx + 14, my + 10); c.lineTo(mx + 4, my + 10); c.fill();
        c.strokeStyle = '#5a4a30'; c.lineWidth = 1; c.beginPath(); c.moveTo(mx - 14, my + 10); c.lineTo(mx, my - h + 10); c.lineTo(mx + 14, my + 10); c.stroke();
      }
    });
    c.restore();
    // 川
    MAP_RIVERS.forEach(rv => {
      c.lineCap = 'round'; c.lineJoin = 'round';
      [[rv.w + 4, 'rgba(40,70,90,0.35)'], [rv.w, '#4f86a8'], [rv.w * 0.35, 'rgba(255,255,255,0.35)']].forEach(([w, col]) => {
        c.lineWidth = w; c.strokeStyle = col; c.beginPath();
        rv.pts.forEach(([x, y], i) => { if (!i) c.moveTo(x, y); else { const [px, py] = rv.pts[i - 1]; c.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2); } });
        const last = rv.pts[rv.pts.length - 1]; c.lineTo(last[0], last[1]); c.stroke();
      });
      const m = rv.pts[Math.floor(rv.pts.length / 2)];
      c.font = 'bold 15px serif'; c.fillStyle = 'rgba(30,60,90,0.8)'; c.fillText(rv.name, m[0] + 8, m[1] - 8);
    });
    // 地方名
    c.font = 'bold 26px serif'; c.fillStyle = 'rgba(90,60,30,0.22)'; c.textAlign = 'center';
    [['涼州', 140, 360], ['并州', 470, 160], ['冀州', 650, 280], ['幽州', 790, 110], ['青州', 800, 395], ['兗州', 660, 440], ['豫州', 610, 510], ['徐州', 770, 500], ['司隷', 430, 360], ['雍州', 300, 380], ['益州', 200, 740], ['荊州', 480, 700], ['揚州', 760, 700]].forEach(([n, x, y]) => c.fillText(n, x, y));
    c.textAlign = 'left';
  }

  function render() {
    if (!ctx || !G) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1d3b52'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);
    ctx.drawImage(base, 0, 0, MW, MH);
    // 道
    ROADS.forEach(([a, b]) => {
      const A = G.cities.find(c => c.id === a), Bc = G.cities.find(c => c.id === b);
      const same = A.owner !== null && A.owner === Bc.owner;
      ctx.strokeStyle = same ? hexA(G.factions[A.owner].color, 0.75) : 'rgba(90,60,30,0.55)';
      ctx.lineWidth = same ? 4 : 2.2; ctx.setLineDash(same ? [] : [6, 5]);
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(Bc.x, Bc.y); ctx.stroke();
    });
    ctx.setLineDash([]);
    // 進軍の矢印
    const now = performance.now();
    arrows = arrows.filter(a => now - a.t0 < a.dur);
    arrows.forEach(a => {
      const k = Math.min(1, (now - a.t0) / (a.dur * 0.7));
      const A = G.cities[a.from], Bc = G.cities[a.to];
      const x = A.x + (Bc.x - A.x) * k, y = A.y + (Bc.y - A.y) * k;
      ctx.strokeStyle = a.color; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(x, y); ctx.stroke();
      const ang = Math.atan2(Bc.y - A.y, Bc.x - A.x);
      ctx.fillStyle = a.color; ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * 14, y + Math.sin(ang) * 14); ctx.lineTo(x + Math.cos(ang + 2.4) * 12, y + Math.sin(ang + 2.4) * 12); ctx.lineTo(x + Math.cos(ang - 2.4) * 12, y + Math.sin(ang - 2.4) * 12); ctx.fill();
    });
    // 都市
    G.cities.forEach(c => {
      const col = c.owner === null ? '#8a8a7a' : G.factions[c.owner].color;
      const isCap = c.owner !== null && G.factions[c.owner].capital === c.i;
      const hl = highlight && highlight.includes(c.i);
      if (hl) { ctx.fillStyle = 'rgba(255,230,80,' + (0.35 + Math.sin(now / 200) * 0.2) + ')'; ctx.beginPath(); ctx.arc(c.x, c.y, 26, 0, 7); ctx.fill(); dirty = true; }
      if (c.i === selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c.x, c.y, 22, 0, 7); ctx.stroke(); }
      // 城の形
      const s = isCap ? 14 : 11;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(c.x - s + 2, c.y - s * 0.6 + 3, s * 2, s * 1.4);
      ctx.fillStyle = col; ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1.5;
      ctx.fillRect(c.x - s, c.y - s * 0.6, s * 2, s * 1.4); ctx.strokeRect(c.x - s, c.y - s * 0.6, s * 2, s * 1.4);
      // 屋根
      ctx.fillStyle = '#2a2420'; ctx.beginPath(); ctx.moveTo(c.x - s - 3, c.y - s * 0.6); ctx.lineTo(c.x, c.y - s * 1.4); ctx.lineTo(c.x + s + 3, c.y - s * 0.6); ctx.fill();
      if (isCap) { ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(c.x, c.y - s * 1.55, 3.5, 0, 7); ctx.fill(); }
      // 名前
      ctx.font = `bold ${scale < 0.6 ? 20 : 15}px serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,250,235,0.9)'; ctx.strokeText(c.name, c.x, c.y + s + 15);
      ctx.fillStyle = '#2a1a10'; ctx.fillText(c.name, c.x, c.y + s + 15);
      if (c.owner === G.player) { ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.fillText(Math.round(c.troops / 1000) + 'k', c.x, c.y + 4); }
    });
    ctx.restore();
  }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

  function hit(x, y) {
    const mx = (x - ox) / scale, my = (y - oy) / scale;
    let best = -1, bd = 30 / Math.min(1, scale) + 6;
    G.cities.forEach(c => { const d = Math.hypot(c.x - mx, c.y - my); if (d < bd) { bd = d; best = c.i; } });
    return best;
  }
  function down(e) {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size === 1) { drag0 = { x: e.offsetX, y: e.offsetY, ox, oy }; moved = false; }
    if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinch0 = { d: Math.hypot(p.x - q.x, p.y - q.y), scale, cx: (p.x + q.x) / 2, cy: (p.y + q.y) / 2 }; moved = true; }
  }
  function move(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size === 2 && pinch0) {
      const [p, q] = [...pointers.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      zoomAt(pinch0.cx, pinch0.cy, (pinch0.scale * d / pinch0.d) / scale);
    } else if (pointers.size === 1 && drag0) {
      const dx = e.offsetX - drag0.x, dy = e.offsetY - drag0.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (moved) { ox = drag0.ox + dx; oy = drag0.oy + dy; clampView(); dirty = true; }
    }
  }
  function up(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = null;
    if (pointers.size === 0) {
      if (!moved && drag0) { const ci = hit(e.offsetX, e.offsetY); if (onTapCity) onTapCity(ci); }
      drag0 = null;
    }
  }

  return {
    init, resize, centerOn,
    set onTap(fn) { onTapCity = fn; },
    select(i) { selected = i; dirty = true; },
    setHighlight(list) { highlight = list; dirty = true; },
    refresh() { dirty = true; },
    march(from, to, color) { arrows.push({ from, to, color, t0: performance.now(), dur: 1200 }); dirty = true; return new Promise(r => setTimeout(r, 900 / (G.opts.aiSpeed || 1))); },
  };
})();
