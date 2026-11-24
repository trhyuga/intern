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
    spore: [[0, 0.8, 0.12]], maw: [[0, 0.75, 0.16]], crown: [],
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

  // ---------- 蝕（生きている艦） ----------
  function drawEclipse(c, hull, u, white) {
    const vein = 'rgba(255,40,110,.9)';
    if (hull === 'spore') {
      c.beginPath();
      for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, r = u * (0.55 + 0.18 * Math.sin(a * 5) + 0.1 * Math.sin(a * 3 + 1)); const x = Math.cos(a) * r * 0.8, y = Math.sin(a) * r; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.closePath();
    } else if (hull === 'maw') {
      // 顎：前に開いた三日月
      c.beginPath(); c.moveTo(-u * 0.7, -u * 0.6);
      c.quadraticCurveTo(-u * 0.95, u * 0.4, 0, u * 0.9); c.quadraticCurveTo(u * 0.95, u * 0.4, u * 0.7, -u * 0.6);
      c.quadraticCurveTo(u * 0.35, -u * 0.05, 0, -u * 0.15); c.quadraticCurveTo(-u * 0.35, -u * 0.05, -u * 0.7, -u * 0.6); c.closePath();
    } else {
      // 黒冠：棘の輪
      c.beginPath();
      for (let i = 0; i <= 32; i++) { const a = i / 32 * Math.PI * 2, r = u * (i % 2 ? 0.55 : 0.95 + (i % 4 === 0 ? 0.12 : 0)); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.closePath();
    }
    if (white) { c.fillStyle = '#fff'; c.fill(); return; }
    const g = c.createRadialGradient(-u * 0.2, -u * 0.25, 0, 0, 0, u);
    g.addColorStop(0, '#3a0a26'); g.addColorStop(0.6, '#14040e'); g.addColorStop(1, '#050005');
    c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(255,48,112,.85)'; c.lineWidth = Math.max(0.8, u * 0.05); c.stroke();
    // 脈打つ筋
    c.save(); c.clip();
    c.strokeStyle = vein; c.lineWidth = Math.max(0.6, u * 0.03);
    for (let i = 0; i < 7; i++) { const a = i * 0.9; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(Math.cos(a + 0.6) * u * 0.5, Math.sin(a + 0.6) * u * 0.5, Math.cos(a) * u, Math.sin(a) * u); c.stroke(); }
    c.restore();
    // 目
    const eg = c.createRadialGradient(0, hull === 'maw' ? u * 0.3 : 0, 0, 0, hull === 'maw' ? u * 0.3 : 0, u * (hull === 'crown' ? 0.45 : 0.28));
    eg.addColorStop(0, '#ffffff'); eg.addColorStop(0.25, '#ff4a8a'); eg.addColorStop(1, 'rgba(255,30,100,0)');
    c.fillStyle = eg; c.beginPath(); c.arc(0, hull === 'maw' ? u * 0.3 : 0, u * (hull === 'crown' ? 0.45 : 0.28), 0, 7); c.fill();
    // 顎の牙
    if (hull === 'maw') { c.fillStyle = '#f0d0e0'; for (let i = -3; i <= 3; i++) { const x = i * u * 0.16; c.beginPath(); c.moveTo(x - u * 0.05, -u * 0.12 + Math.abs(i) * u * -0.06); c.lineTo(x, -u * 0.32 + Math.abs(i) * u * -0.06); c.lineTo(x + u * 0.05, -u * 0.12 + Math.abs(i) * u * -0.06); c.fill(); } }
  }

  // 覚えておいた絵を返す（L：艦の長さ px）
  function sprite(hull, L, col, white) {
    const Lb = Math.max(6, Math.round(L / 2) * 2);
    const key = `${hull}|${Lb}|${col}|${white ? 1 : 0}`;
    let cv = cache.get(key);
    if (cv) return cv;
    const u = Lb * 0.5 * RES, S = Math.ceil(u * 2.6);
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
    const cv = sprite(hull, L, col, false), S = cv.width / RES, u = L * 0.5;
    c.save(); c.translate(x, y); c.rotate(ang);
    if (!opt.noEngine) flames(c, hull, u, opt.t || performance.now() / 1000, opt.thrust ?? 0.6, eclipse);
    c.drawImage(cv, -S / 2, -S / 2, S, S);
    // 被弾の閃き
    if (opt.hit) { c.globalAlpha = Math.min(1, opt.hitK ?? 0.8); c.globalCompositeOperation = 'lighter'; const w = sprite(hull, L, col, true); c.drawImage(w, -S / 2, -S / 2, S, S); }
    c.restore();
  }
  return { draw, sprite, ENG };
})();
