// ============================================================
//  艦の絵（詳しい船体・陰影・装甲板・砲塔・窓・紋の色帯）
//  一度描いた絵は大きさ・色ごとに覚えておき、毎フレームは回して貼るだけ（スマホでも軽く）
//  機関の炎は毎フレーム描く（揺らぎ・推力で長さが変わる）
// ============================================================
const ShipArt = (() => {
  const cache = new Map();
  const RES = 2;   // 覚えておく絵の解像度（2倍で描いて縮めて貼る）
  const hex2 = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mix = (a, b, k) => { const A = hex2(a), B = hex2(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`; };
  const rgba = (h, a) => { const [r, g, b] = hex2(h); return `rgba(${r},${g},${b},${a})`; };

  // 船体の輪郭（長さ2・機首が上 y=-1）。x は半幅
  const HULL = {
    dd: [[0, -1], [0.1, -0.78], [0.16, -0.45], [0.2, 0.15], [0.4, 0.5], [0.38, 0.8], [0.16, 0.72], [0.14, 0.96], [-0.14, 0.96], [-0.16, 0.72], [-0.38, 0.8], [-0.4, 0.5], [-0.2, 0.15], [-0.16, -0.45], [-0.1, -0.78]],
    cl: [[0, -1], [0.1, -0.82], [0.17, -0.5], [0.22, -0.28], [0.36, -0.12], [0.38, 0.34], [0.27, 0.5], [0.26, 0.94], [-0.26, 0.94], [-0.27, 0.5], [-0.38, 0.34], [-0.36, -0.12], [-0.22, -0.28], [-0.17, -0.5], [-0.1, -0.82]],
    bb: [[0, -1], [0.13, -0.86], [0.22, -0.6], [0.28, -0.38], [0.44, -0.22], [0.46, 0.42], [0.36, 0.6], [0.34, 0.95], [-0.34, 0.95], [-0.36, 0.6], [-0.46, 0.42], [-0.44, -0.22], [-0.28, -0.38], [-0.22, -0.6], [-0.13, -0.86]],
    cv: [[0, -0.96], [0.2, -0.9], [0.3, -0.78], [0.32, 0.46], [0.52, 0.58], [0.52, 0.8], [0.3, 0.95], [-0.3, 0.95], [-0.52, 0.8], [-0.52, 0.58], [-0.32, 0.46], [-0.3, -0.78], [-0.2, -0.9]],
    dn: [[0, -1], [0.09, -0.9], [0.16, -0.62], [0.24, -0.48], [0.38, -0.36], [0.38, -0.1], [0.52, 0.08], [0.52, 0.5], [0.38, 0.62], [0.36, 0.96], [-0.36, 0.96], [-0.38, 0.62], [-0.52, 0.5], [-0.52, 0.08], [-0.38, -0.1], [-0.38, -0.36], [-0.24, -0.48], [-0.16, -0.62], [-0.09, -0.9]],
  };
  // 機関の位置（x, y, 大きさ）
  const ENG = {
    dd: [[0, 0.97, 0.13], [0.3, 0.8, 0.07], [-0.3, 0.8, 0.07]],
    cl: [[0.13, 0.95, 0.11], [-0.13, 0.95, 0.11]],
    bb: [[0, 0.96, 0.13], [0.2, 0.96, 0.1], [-0.2, 0.96, 0.1]],
    cv: [[0.16, 0.96, 0.11], [-0.16, 0.96, 0.11], [0.42, 0.82, 0.07], [-0.42, 0.82, 0.07]],
    dn: [[0.08, 0.97, 0.1], [-0.08, 0.97, 0.1], [0.24, 0.97, 0.1], [-0.24, 0.97, 0.1]],
    spore: [[0, 0.72, 0.1]], maw: [[0, 0.8, 0.14]], crown: [],
    sat: [],
  };
  // 砲塔（x, y, 大きさ）
  const TUR = {
    dd: [[0, -0.32, 0.07]],
    cl: [[0, -0.42, 0.08], [0, 0.1, 0.08], [0.24, 0.12, 0.05], [-0.24, 0.12, 0.05]],
    bb: [[0, -0.55, 0.09], [0, -0.22, 0.1], [0.3, 0.05, 0.07], [-0.3, 0.05, 0.07], [0.3, 0.32, 0.07], [-0.3, 0.32, 0.07]],
    cv: [[0.2, -0.6, 0.05], [-0.2, -0.6, 0.05]],
    dn: [[0, -0.7, 0.07], [0, -0.42, 0.1], [0.24, -0.22, 0.08], [-0.24, -0.22, 0.08], [0.38, 0.22, 0.08], [-0.38, 0.22, 0.08], [0.38, 0.42, 0.07], [-0.38, 0.42, 0.07]],
  };
  const poly = (c, pts, u, sx = 1, sy = 1) => { c.beginPath(); pts.forEach(([x, y], i) => { const X = x * u * sx, Y = y * u * sy; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); };

  // ---------- 人の艦 ----------
  function drawHuman(c, hull, u, col, white) {
    const pts = HULL[hull] || HULL.cl;
    const metal = mix(col, '#8a98b0', 0.62), dark = mix(col, '#0a0e18', 0.72), light = mix(col, '#ffffff', 0.55);
    // 船体：左右に陰影（光は左上から）
    poly(c, pts, u);
    if (white) { c.fillStyle = '#ffffff'; c.fill(); return; }
    let g = c.createLinearGradient(-u * 0.5, -u, u * 0.5, u);
    g.addColorStop(0, light); g.addColorStop(0.35, metal); g.addColorStop(0.75, dark); g.addColorStop(1, '#05070c');
    c.fillStyle = g; c.fill();
    c.save(); c.clip();
    // 装甲板：内側に少し小さい輪郭を重ねる
    poly(c, pts, u, 0.72, 0.86); c.fillStyle = rgba('#000000', 0.16); c.fill();
    poly(c, pts, u, 0.48, 0.72); g = c.createLinearGradient(-u * 0.3, 0, u * 0.3, 0); g.addColorStop(0, rgba('#ffffff', 0.18)); g.addColorStop(1, rgba('#000000', 0.2)); c.fillStyle = g; c.fill();
    // 板の継ぎ目
    c.strokeStyle = rgba('#000000', 0.35); c.lineWidth = Math.max(0.6, u * 0.018);
    for (let i = -4; i <= 4; i++) { const y = i * u * 0.2; c.beginPath(); c.moveTo(-u * 0.6, y); c.lineTo(u * 0.6, y + u * 0.02); c.stroke(); }
    c.beginPath(); c.moveTo(0, -u); c.lineTo(0, u); c.stroke();
    // 国の色帯（機首寄りと翼）
    c.fillStyle = rgba(col, 0.9);
    c.fillRect(-u * 0.6, -u * 0.62, u * 1.2, u * 0.06);
    c.fillRect(-u * 0.6, u * 0.42, u * 1.2, u * 0.05);
    c.restore();
    // 縁の光（左側）と影の線
    poly(c, pts, u);
    c.strokeStyle = rgba('#ffffff', 0.55); c.lineWidth = Math.max(0.7, u * 0.025); c.stroke();
    // 空母：甲板の線と格納庫の口
    if (hull === 'cv') {
      c.fillStyle = rgba('#0a0e18', 0.8); c.fillRect(-u * 0.22, -u * 0.72, u * 0.44, u * 1.1);
      c.strokeStyle = rgba('#ffd860', 0.7); c.lineWidth = Math.max(0.6, u * 0.02); c.setLineDash([u * 0.06, u * 0.06]);
      c.beginPath(); c.moveTo(0, -u * 0.7); c.lineTo(0, u * 0.36); c.stroke(); c.setLineDash([]);
      for (const s of [-1, 1]) { c.fillStyle = rgba('#7ad0ff', 0.55); c.fillRect(s * u * 0.18 - u * 0.03, -u * 0.66, u * 0.06, u * 0.98); }
    }
    // 弩級：中央の光る炉
    if (hull === 'dn') {
      const rg = c.createRadialGradient(0, u * 0.2, 0, 0, u * 0.2, u * 0.22);
      rg.addColorStop(0, 'rgba(220,250,255,.95)'); rg.addColorStop(0.4, rgba(col, 0.7)); rg.addColorStop(1, rgba(col, 0));
      c.fillStyle = rg; c.beginPath(); c.arc(0, u * 0.2, u * 0.22, 0, 7); c.fill();
    }
    // 砲塔：丸い基部と、機首へ向く砲身
    for (const [x, y, r] of TUR[hull] || []) {
      const X = x * u, Y = y * u, R = r * u;
      c.strokeStyle = mix(col, '#20283a', 0.5); c.lineWidth = Math.max(0.8, R * 0.45);
      c.beginPath(); c.moveTo(X - R * 0.35, Y); c.lineTo(X - R * 0.35, Y - R * 2.2); c.moveTo(X + R * 0.35, Y); c.lineTo(X + R * 0.35, Y - R * 2.2); c.stroke();
      const tg = c.createRadialGradient(X - R * 0.3, Y - R * 0.3, 0, X, Y, R);
      tg.addColorStop(0, light); tg.addColorStop(1, dark);
      c.fillStyle = tg; c.beginPath(); c.arc(X, Y, R, 0, 7); c.fill();
      c.strokeStyle = rgba('#000000', 0.5); c.lineWidth = Math.max(0.5, R * 0.15); c.stroke();
    }
    // 艦橋
    if (hull !== 'cv') {
      const by = hull === 'dd' ? 0.1 : hull === 'dn' ? -0.05 : 0.3;
      c.fillStyle = mix(col, '#d8e4f0', 0.6); c.fillRect(-u * 0.09, by * u, u * 0.18, u * 0.16);
      c.fillStyle = 'rgba(170,240,255,.95)'; c.fillRect(-u * 0.07, by * u + u * 0.02, u * 0.14, u * 0.035);
    } else { c.fillStyle = mix(col, '#d8e4f0', 0.6); c.fillRect(u * 0.24, -u * 0.1, u * 0.1, u * 0.26); }
    // 窓の灯り
    c.fillStyle = 'rgba(255,240,190,.85)';
    const wn = hull === 'dd' ? 3 : hull === 'dn' ? 9 : 6;
    for (let i = 0; i < wn; i++) for (const s of [-1, 1]) { const y = -u * 0.35 + i * u * 0.9 / wn; c.fillRect(s * u * (hull === 'dd' ? 0.12 : 0.2) - u * 0.012, y, u * 0.024, u * 0.024); }
    // 機関のノズル
    for (const [x, y, r] of ENG[hull] || []) {
      c.fillStyle = '#10141c'; c.fillRect((x - r) * u, (y - 0.06) * u, r * 2 * u, 0.1 * u);
      const eg = c.createRadialGradient(x * u, y * u, 0, x * u, y * u, r * u);
      eg.addColorStop(0, 'rgba(200,245,255,.95)'); eg.addColorStop(1, 'rgba(80,170,255,0)');
      c.fillStyle = eg; c.beginPath(); c.arc(x * u, y * u, r * u, 0, 7); c.fill();
    }
  }

  // ---------- 防衛衛星 ----------
  function drawSat(c, u, col, white) {
    if (white) { c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, u * 0.9, 0, 7); c.fill(); return; }
    // 太陽板
    for (const s of [-1, 1]) {
      const g = c.createLinearGradient(s * u * 0.3, 0, s * u * 1, 0);
      g.addColorStop(0, '#1a3060'); g.addColorStop(1, '#3a70c0');
      c.fillStyle = g; c.fillRect(s > 0 ? u * 0.32 : -u, -u * 0.22, u * 0.68, u * 0.44);
      c.strokeStyle = 'rgba(150,200,255,.5)'; c.lineWidth = Math.max(0.5, u * 0.02);
      for (let i = 1; i < 4; i++) { const x = s * (u * 0.32 + i * u * 0.17); c.beginPath(); c.moveTo(x, -u * 0.22); c.lineTo(x, u * 0.22); c.stroke(); }
    }
    // 輪と軸
    c.strokeStyle = mix(col, '#c0c8d8', 0.5); c.lineWidth = Math.max(1, u * 0.09);
    c.beginPath(); c.arc(0, 0, u * 0.42, 0, 7); c.stroke();
    const g = c.createRadialGradient(-u * 0.1, -u * 0.1, 0, 0, 0, u * 0.3);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, mix(col, '#a0b0c8', 0.4)); g.addColorStop(1, '#202838');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, u * 0.3, 0, 7); c.fill();
    c.fillStyle = rgba(col, 0.95); c.beginPath(); c.arc(0, 0, u * 0.1, 0, 7); c.fill();
  }

  // ---------- 蝕（生きている艦：おぞましい異形） ----------
  // 決まった乱数（同じ種類はいつも同じ形）
  const srand = seed => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  // 光る線（にじみ付き）
  function glowLine(c, u, col, w, blur, fn) {
    c.save(); c.strokeStyle = col; c.lineWidth = Math.max(0.5, u * w); c.lineCap = 'round';
    c.shadowColor = col; c.shadowBlur = u * blur; c.beginPath(); fn(); c.stroke(); c.restore();
  }
  // 枝分かれする脈（中心から外へ、くねくねと）
  function veins(c, u, rnd, n, x0, y0, len, col, w) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.6, L = len * (0.65 + rnd() * 0.45);
      const bx = x0 + Math.cos(a) * L, by = y0 + Math.sin(a) * L;
      const k1 = (rnd() - 0.5) * 0.9, k2 = (rnd() - 0.5) * 0.9;
      glowLine(c, u, col, w, 0.12, () => {
        c.moveTo(x0, y0);
        c.bezierCurveTo(x0 + Math.cos(a + k1) * L * 0.4, y0 + Math.sin(a + k1) * L * 0.4, x0 + Math.cos(a + k2) * L * 0.75, y0 + Math.sin(a + k2) * L * 0.75, bx, by);
        // 小枝
        const m = 0.6 + rnd() * 0.2, mx = x0 + (bx - x0) * m, my = y0 + (by - y0) * m, b = a + (rnd() < 0.5 ? 0.7 : -0.7);
        c.moveTo(mx, my); c.quadraticCurveTo(mx + Math.cos(b) * L * 0.2, my + Math.sin(b) * L * 0.2, mx + Math.cos(b + 0.3) * L * 0.35, my + Math.sin(b + 0.3) * L * 0.35);
      });
    }
  }
  // 触手（根元 x,y から角度 a へ、うねる。先ほど細い）
  function tendril(c, u, x, y, a, len, w0, wav, col, glow) {
    const N = 10, pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, off = Math.sin(t * Math.PI * 1.6 + wav) * len * 0.16 * t;
      pts.push([x + Math.cos(a) * len * t - Math.sin(a) * off, y + Math.sin(a) * len * t + Math.cos(a) * off]);
    }
    c.save(); c.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const t = i / N; c.lineWidth = Math.max(0.4, w0 * u * (1 - t * 0.85));
      c.strokeStyle = col; c.beginPath(); c.moveTo(pts[i][0], pts[i][1]); c.lineTo(pts[i + 1][0], pts[i + 1][1]); c.stroke();
    }
    if (glow) { c.strokeStyle = glow; c.shadowColor = glow; c.shadowBlur = u * 0.08; c.lineWidth = Math.max(0.3, w0 * u * 0.25); c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py)); c.stroke(); }
    c.restore();
  }
  // 牙（根元の中心 x,y、向き a、長さ L、太さ w）
  function fang(c, x, y, a, L, w) {
    const nx = Math.cos(a), ny = Math.sin(a), px = -ny, py = nx;
    c.beginPath(); c.moveTo(x + px * w, y + py * w);
    c.quadraticCurveTo(x + nx * L * 0.6 + px * w * 0.6, y + ny * L * 0.6 + py * w * 0.6, x + nx * L + px * w * 0.25, y + ny * L + py * w * 0.25);
    c.quadraticCurveTo(x + nx * L * 0.5 - px * w * 0.4, y + ny * L * 0.5 - py * w * 0.4, x - px * w, y - py * w); c.closePath();
    const g = c.createLinearGradient(x, y, x + nx * L, y + ny * L);
    g.addColorStop(0, '#6a3040'); g.addColorStop(0.35, '#e8d2c0'); g.addColorStop(1, '#fff6ea');
    c.fillStyle = g; c.fill();
  }
  // 肉の塊（でこぼこの楕円）
  function blob(c, cx, cy, rx, ry, rnd, bumps, amp) {
    const ph = rnd() * 7, ph2 = rnd() * 7;
    c.beginPath();
    for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, k = 1 + amp * Math.sin(a * bumps + ph) + amp * 0.5 * Math.sin(a * (bumps + 3) + ph2); const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k; i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.closePath();
  }
  // 燃える眼（縦の瞳）
  function eye(c, x, y, r, slit) {
    let g = c.createRadialGradient(x, y, 0, x, y, r * 2.2);
    g.addColorStop(0, 'rgba(255,80,40,.75)'); g.addColorStop(0.5, 'rgba(255,20,90,.25)'); g.addColorStop(1, 'rgba(255,0,80,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.2, 0, 7); c.fill();
    g = c.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
    g.addColorStop(0, '#fffbe0'); g.addColorStop(0.25, '#ffd040'); g.addColorStop(0.6, '#ff4a10'); g.addColorStop(0.9, '#a00020'); g.addColorStop(1, '#300008');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    if (slit) {
      c.fillStyle = '#0a0004'; c.beginPath(); c.moveTo(x, y - r * 0.85); c.quadraticCurveTo(x + r * 0.22, y, x, y + r * 0.85); c.quadraticCurveTo(x - r * 0.22, y, x, y - r * 0.85); c.fill();
      c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.4, r * 0.1, 0, 7); c.fill();
    }
  }

  // 胞子：棘だらけの種の莢。紫紅の脈が光る
  function drawSpore(c, u) {
    const rnd = srand(71);
    // 後ろへ垂れる細い触手
    for (let i = 0; i < 5; i++) tendril(c, u, (i - 2) * u * 0.1, u * 0.5, Math.PI / 2 + (i - 2) * 0.22, u * (0.55 + rnd() * 0.25), 0.07, i * 1.3, '#3a0a24', 'rgba(255,60,180,.55)');
    // 棘（外側へ、少し反る）
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2 + rnd() * 0.15, ex = Math.cos(a) * 0.5, ey = Math.sin(a) * 0.72;
      const L = u * (0.3 + rnd() * 0.32) * (ey < -0.4 ? 1.35 : 1);
      const bx = ex * u * 0.9, by = ey * u * 0.9, w = u * 0.055;
      const nx = Math.cos(a), ny = Math.sin(a), px = -ny, py = nx, bend = (rnd() - 0.5) * 0.5;
      c.beginPath(); c.moveTo(bx + px * w, by + py * w);
      c.quadraticCurveTo(bx + nx * L * 0.6 + px * L * bend, by + ny * L * 0.6 + py * L * bend, bx + nx * L, by + ny * L);
      c.quadraticCurveTo(bx + nx * L * 0.5 + px * L * bend * 0.6, by + ny * L * 0.5 + py * L * bend * 0.6, bx - px * w, by - py * w); c.closePath();
      const g = c.createLinearGradient(bx, by, bx + nx * L, by + ny * L); g.addColorStop(0, '#2a0618'); g.addColorStop(0.7, '#6a1840'); g.addColorStop(1, '#ff80c0');
      c.fillStyle = g; c.fill();
    }
    // 莢の本体
    blob(c, 0, 0, u * 0.5, u * 0.72, rnd, 7, 0.06);
    let g = c.createRadialGradient(-u * 0.18, -u * 0.3, 0, 0, 0, u * 0.8);
    g.addColorStop(0, '#6a1a48'); g.addColorStop(0.45, '#2c0820'); g.addColorStop(1, '#070008');
    c.fillStyle = g; c.fill();
    c.save(); c.clip();
    // 縦の溝（種の継ぎ目）
    c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = Math.max(0.6, u * 0.04);
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * u * 0.05, -u * 0.75); c.quadraticCurveTo(i * u * 0.24, 0, i * u * 0.05, u * 0.75); c.stroke(); }
    // 光る脈
    veins(c, u, rnd, 9, 0, u * 0.08, u * 0.7, 'rgba(255,50,200,.95)', 0.035);
    // 内側の脈打つ芯
    g = c.createRadialGradient(0, u * 0.08, 0, 0, u * 0.08, u * 0.4);
    g.addColorStop(0, 'rgba(255,220,250,.95)'); g.addColorStop(0.3, 'rgba(255,40,170,.7)'); g.addColorStop(1, 'rgba(120,0,80,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, u * 0.08, u * 0.4, 0, 7); c.fill();
    c.restore();
    // ぬめる縁と照り
    blob(c, 0, 0, u * 0.5, u * 0.72, srand(71), 7, 0.06);
    c.strokeStyle = 'rgba(255,90,190,.6)'; c.lineWidth = Math.max(0.6, u * 0.03); c.stroke();
    c.fillStyle = 'rgba(255,200,240,.35)'; c.beginPath(); c.ellipse(-u * 0.2, -u * 0.38, u * 0.07, u * 0.16, -0.4, 0, 7); c.fill();
    // 先端の小さな眼
    eye(c, 0, -u * 0.5, u * 0.09, true);
  }

  // 顎：牙の並ぶ巨大な口を持つ獣。口の奥が赤く燃える
  function drawMaw(c, u) {
    const rnd = srand(313);
    // 後ろの触手（太い束）
    for (let i = 0; i < 7; i++) { const s = i - 3; tendril(c, u, s * u * 0.12, u * 0.55, Math.PI / 2 + s * 0.2, u * (0.5 + rnd() * 0.25), 0.11, i * 0.9, '#2a0616', 'rgba(255,40,90,.5)'); }
    // 脇の触手（獲物をつかむ）
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) tendril(c, u, s * u * 0.62, u * (0.0 + i * 0.25), s > 0 ? -0.2 + i * 0.5 : Math.PI + 0.2 - i * 0.5, u * 0.5, 0.08, i * 2 + (s > 0 ? 0 : 1.5), '#301020', 'rgba(255,60,120,.45)');
    // 胴（背の甲殻）
    blob(c, 0, u * 0.18, u * 0.7, u * 0.62, rnd, 6, 0.05);
    let g = c.createRadialGradient(-u * 0.25, -u * 0.05, 0, 0, u * 0.2, u * 0.85);
    g.addColorStop(0, '#5a2030'); g.addColorStop(0.5, '#260a14'); g.addColorStop(1, '#060004');
    c.fillStyle = g; c.fill();
    c.save(); c.clip();
    // 甲殻の節
    c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = Math.max(0.7, u * 0.035);
    for (let i = 0; i < 5; i++) { const y = u * (0.05 + i * 0.16); c.beginPath(); c.moveTo(-u * 0.8, y + u * 0.12); c.quadraticCurveTo(0, y - u * 0.1, u * 0.8, y + u * 0.12); c.stroke(); }
    c.strokeStyle = 'rgba(255,170,190,.12)'; c.lineWidth = Math.max(0.5, u * 0.02);
    for (let i = 0; i < 5; i++) { const y = u * (0.08 + i * 0.16); c.beginPath(); c.moveTo(-u * 0.7, y + u * 0.12); c.quadraticCurveTo(0, y - u * 0.1, u * 0.7, y + u * 0.12); c.stroke(); }
    veins(c, u, rnd, 7, 0, u * 0.55, u * 0.7, 'rgba(255,30,90,.8)', 0.025);
    c.restore();
    // 大顎（左右から前へ伸びる鎌）
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * u * 0.62, u * 0.1);
      c.bezierCurveTo(s * u * 0.95, -u * 0.35, s * u * 0.7, -u * 0.95, s * u * 0.18, -u * 1.15);
      c.bezierCurveTo(s * u * 0.45, -u * 0.8, s * u * 0.5, -u * 0.4, s * u * 0.32, -u * 0.05); c.closePath();
      g = c.createLinearGradient(s * u * 0.8, 0, s * u * 0.2, -u * 1.1); g.addColorStop(0, '#1a0610'); g.addColorStop(0.6, '#4a1a26'); g.addColorStop(1, '#c08070');
      c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(255,60,110,.55)'; c.lineWidth = Math.max(0.5, u * 0.025); c.stroke();
      // 大顎の内側の牙
      for (let i = 0; i < 4; i++) { const t = 0.2 + i * 0.18; fang(c, s * u * (0.42 - t * 0.12), -u * (0.05 + t * 0.85), s > 0 ? Math.PI * 0.95 : 0.05 * Math.PI, u * 0.16, u * 0.035); }
    }
    // 口（裂け目）と奥の赤い光
    c.save();
    c.beginPath(); c.ellipse(0, -u * 0.18, u * 0.36, u * 0.42, 0, 0, 7);
    g = c.createRadialGradient(0, -u * 0.12, 0, 0, -u * 0.18, u * 0.45);
    g.addColorStop(0, '#fff0c0'); g.addColorStop(0.12, '#ff6020'); g.addColorStop(0.4, '#c00018'); g.addColorStop(0.8, '#3a0008'); g.addColorStop(1, '#100004');
    c.fillStyle = g; c.shadowColor = '#ff2010'; c.shadowBlur = u * 0.3; c.fill(); c.restore();
    // 口のまわりに牙を三重に並べる（外側ほど大きい）
    for (let ring = 0; ring < 3; ring++) {
      const n = 14 - ring * 3, rx = u * (0.36 - ring * 0.09), ry = u * (0.42 - ring * 0.1), L = u * (0.15 - ring * 0.03);
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + ring * 0.4, x = Math.cos(a) * rx, y = -u * 0.18 + Math.sin(a) * ry;
        fang(c, x, y, a + Math.PI, L * (0.8 + rnd() * 0.4), u * (0.04 - ring * 0.008));
      }
    }
    // 喉の奥の眼
    eye(c, 0, -u * 0.12, u * 0.07, false);
    // 頭の眼の群れ
    for (const [x, y, r] of [[-0.42, 0.28, 0.07], [0.42, 0.28, 0.07], [-0.3, 0.42, 0.05], [0.3, 0.42, 0.05], [-0.52, 0.12, 0.045], [0.52, 0.12, 0.045]]) eye(c, x * u, y * u, r * u, true);
  }

  // 黒冠：黒い甲殻の輪に、燃える巨眼。棘の光冠をまとう
  function drawCrown(c, u) {
    const rnd = srand(909);
    // 外へ揺れる触手（光冠のすき間から）
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + 0.3; tendril(c, u, Math.cos(a) * u * 0.78, Math.sin(a) * u * 0.78, a + 0.35, u * 0.42, 0.06, i, '#1a0410', 'rgba(255,40,140,.55)'); }
    // 棘の光冠（長短交互、少し反る）
    c.save(); c.shadowColor = 'rgba(255,40,100,.9)'; c.shadowBlur = u * 0.06;
    const N = 26;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, L = u * (i % 2 ? 0.28 : 0.46) * (0.85 + rnd() * 0.3), base = u * 0.78, w = u * (i % 2 ? 0.05 : 0.075);
      const bx = Math.cos(a) * base, by = Math.sin(a) * base, nx = Math.cos(a), ny = Math.sin(a), px = -ny, py = nx;
      c.beginPath(); c.moveTo(bx + px * w, by + py * w);
      c.quadraticCurveTo(bx + nx * L * 0.6 + px * L * 0.18, by + ny * L * 0.6 + py * L * 0.18, bx + nx * L + px * L * 0.12, by + ny * L + py * L * 0.12);
      c.quadraticCurveTo(bx + nx * L * 0.4, by + ny * L * 0.4, bx - px * w, by - py * w); c.closePath();
      const g = c.createLinearGradient(bx, by, bx + nx * L, by + ny * L); g.addColorStop(0, '#08020a'); g.addColorStop(0.6, '#3a0a22'); g.addColorStop(1, '#ff4a90');
      c.fillStyle = g; c.fill();
    }
    c.restore();
    // 輪（黒い甲殻）
    c.beginPath(); c.arc(0, 0, u * 0.84, 0, 7); c.arc(0, 0, u * 0.5, 0, 7, true);
    let g = c.createRadialGradient(-u * 0.3, -u * 0.35, u * 0.1, 0, 0, u * 0.9);
    g.addColorStop(0, '#3a3040'); g.addColorStop(0.5, '#120a14'); g.addColorStop(1, '#020003');
    c.fillStyle = g; c.fill('evenodd');
    // 甲殻の板（区切りと照り）
    c.save(); c.beginPath(); c.arc(0, 0, u * 0.84, 0, 7); c.arc(0, 0, u * 0.5, 0, 7, true); c.clip('evenodd');
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      c.strokeStyle = 'rgba(0,0,0,.85)'; c.lineWidth = Math.max(0.8, u * 0.03);
      c.beginPath(); c.moveTo(Math.cos(a) * u * 0.48, Math.sin(a) * u * 0.48); c.quadraticCurveTo(Math.cos(a + 0.12) * u * 0.7, Math.sin(a + 0.12) * u * 0.7, Math.cos(a) * u * 0.86, Math.sin(a) * u * 0.86); c.stroke();
      c.strokeStyle = 'rgba(200,170,220,.16)'; c.lineWidth = Math.max(0.6, u * 0.02);
      c.beginPath(); c.arc(0, 0, u * 0.78, a + 0.06, a + 0.46); c.stroke();
    }
    // 割れ目から漏れる光
    veins(c, u, rnd, 12, 0, 0, u * 0.95, 'rgba(255,40,120,.75)', 0.018);
    c.restore();
    c.strokeStyle = 'rgba(255,50,120,.65)'; c.lineWidth = Math.max(0.6, u * 0.02);
    c.beginPath(); c.arc(0, 0, u * 0.84, 0, 7); c.stroke();
    // 輪の内側：眼を吊る肉の膜と筋
    c.beginPath(); c.arc(0, 0, u * 0.5, 0, 7);
    g = c.createRadialGradient(0, 0, u * 0.2, 0, 0, u * 0.5); g.addColorStop(0, '#5a0a10'); g.addColorStop(1, '#14020a');
    c.fillStyle = g; c.fill();
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; glowLine(c, u, 'rgba(255,90,60,.7)', 0.03, 0.1, () => { c.moveTo(Math.cos(a) * u * 0.5, Math.sin(a) * u * 0.5); c.quadraticCurveTo(Math.cos(a + 0.4) * u * 0.38, Math.sin(a + 0.4) * u * 0.38, Math.cos(a) * u * 0.28, Math.sin(a) * u * 0.28); }); }
    // 燃える巨眼
    eye(c, 0, 0, u * 0.3, true);
    // 内縁の棘（眼をにらむ牙）
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; fang(c, Math.cos(a) * u * 0.5, Math.sin(a) * u * 0.5, a + Math.PI, u * 0.1, u * 0.03); }
  }

  function drawEclipse(c, hull, u, white) {
    if (hull === 'spore') drawSpore(c, u); else if (hull === 'maw') drawMaw(c, u); else drawCrown(c, u);
    if (white) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = '#fff'; c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.restore(); }
  }
  // 蝕の脈動（毎フレーム、軽い光を重ねるだけ）
  function pulse(c, hull, u, t) {
    const k = 0.5 + 0.5 * Math.sin(t * (hull === 'crown' ? 2.2 : 3.4));
    const cy = hull === 'spore' ? u * 0.08 : hull === 'maw' ? -u * 0.15 : 0, r = u * (hull === 'crown' ? 0.75 : hull === 'maw' ? 0.6 : 0.55);
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(0, cy, 0, 0, cy, r);
    g.addColorStop(0, hull === 'spore' ? `rgba(255,60,200,${0.3 + 0.35 * k})` : `rgba(255,70,30,${0.25 + 0.3 * k})`); g.addColorStop(1, 'rgba(255,0,90,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, cy, r, 0, 7); c.fill();
    c.restore();
  }

  const ECL_SCALE = { spore: 1.6, maw: 1.25, crown: 1 };
  // 蝕艦の淡い光輪（暗い紅の背景でも一目でわかるように）
  function halo(c, hull, u, t) {
    const k = 0.5 + 0.5 * Math.sin(t * 2.6 + (hull === 'maw' ? 1 : 0));
    const r = u * (hull === 'crown' ? 1.05 : 0.95);
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(0, 0, r * 0.55, 0, 0, r * 1.25);
    g.addColorStop(0, 'rgba(255,60,220,0)'); g.addColorStop(0.6, `rgba(255,70,230,${0.1 + 0.12 * k})`); g.addColorStop(1, 'rgba(255,40,200,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 1.25, 0, 7); c.fill();
    c.strokeStyle = `rgba(255,110,240,${0.22 + 0.2 * k})`; c.lineWidth = Math.max(0.8, u * 0.06);
    c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke();
    c.restore();
  }
  // 覚えておいた絵を返す（L：艦の長さ px）
  function sprite(hull, L, col, white) {
    const Lb = Math.max(6, Math.round(L / 2) * 2);
    const key = `${hull}|${Lb}|${col}|${white ? 1 : 0}`;
    let cv = cache.get(key);
    if (cv) return cv;
    const u = Lb * 0.5 * RES, S = Math.ceil(u * (hull === 'spore' || hull === 'maw' || hull === 'crown' ? 3 : 2.6));
    cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d');
    c.translate(S / 2, S / 2);
    if (hull === 'sat') drawSat(c, u, col, white);
    else if (hull === 'spore' || hull === 'maw' || hull === 'crown') drawEclipse(c, hull, u, white);
    else drawHuman(c, hull, u, col, white);
    if (cache.size > 600) cache.clear();
    cache.set(key, cv);
    return cv;
  }
  // 機関の炎（毎フレーム。重ねて明るく）
  function flames(c, hull, u, t, thrust, eclipse) {
    const list = ENG[hull] || [];
    if (!list.length) return;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const [x, y, r] of list) {
      const fl = 0.75 + 0.25 * Math.sin(t * 40 + x * 13) + Math.random() * 0.15;
      const len = u * (0.35 + 0.55 * thrust) * fl, w = r * u * 1.3;
      const X = x * u, Y = y * u;
      const g = c.createLinearGradient(X, Y, X, Y + len);
      if (eclipse) { g.addColorStop(0, 'rgba(255,120,170,.9)'); g.addColorStop(0.4, 'rgba(255,30,100,.5)'); g.addColorStop(1, 'rgba(120,0,40,0)'); }
      else { g.addColorStop(0, 'rgba(230,250,255,.95)'); g.addColorStop(0.3, 'rgba(110,200,255,.7)'); g.addColorStop(1, 'rgba(40,90,255,0)'); }
      c.fillStyle = g; c.beginPath(); c.moveTo(X - w, Y); c.quadraticCurveTo(X, Y + len * 1.15, X + w, Y); c.closePath(); c.fill();
    }
    c.restore();
  }
  // 描く：Art.ship と同じ引数（L は艦の長さ）
  function draw(c, hull, x, y, ang, L, col, opt = {}) {
    const eclipse = hull === 'spore' || hull === 'maw' || hull === 'crown';
    // 蝕艦は戦場で見えやすく（見た目だけ拡大。当たり判定は変えない）
    if (eclipse && !opt.noEngine) L *= ECL_SCALE[hull] || 1;
    const cv = sprite(hull, L, col, false), S = cv.width / RES, u = L * 0.5;
    c.save(); c.translate(x, y); c.rotate(ang);
    if (eclipse && !opt.noEngine) halo(c, hull, u, opt.t || performance.now() / 1000);
    if (!opt.noEngine) flames(c, hull, u, opt.t || performance.now() / 1000, opt.thrust ?? 0.6, eclipse);
    c.drawImage(cv, -S / 2, -S / 2, S, S);
    if (eclipse && !opt.noEngine) pulse(c, hull, u, opt.t || performance.now() / 1000);
    // 被弾の閃き
    if (opt.hit) { c.globalAlpha = Math.min(1, opt.hitK ?? 0.8); c.globalCompositeOperation = 'lighter'; const w = sprite(hull, L, col, true); c.drawImage(w, -S / 2, -S / 2, S, S); }
    c.restore();
  }
  return { draw, sprite, ENG, RES };
})();
