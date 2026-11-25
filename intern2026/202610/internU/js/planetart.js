// 惑星の挿絵：種類・持ち主・防衛衛星・人口から、星ごとに固有の一枚を描いてキャッシュする
const PlanetArt = (() => {
  const cache = new Map();
  (() => { // 小さなスタイルだけ注入（style.css は触らない）
    if (typeof document === 'undefined') return;
    const st = document.createElement('style');
    st.textContent = '.pl-hero{display:block;width:100%;max-width:340px;aspect-ratio:340/150;height:auto;margin:0 auto 10px;border-radius:10px;border:1px solid rgba(160,190,255,.18);box-shadow:0 4px 18px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.03);object-fit:cover;background:#03050c}';
    document.head.appendChild(st);
  })();

  function rng(seed) { let s = (seed * 2654435761 + 1013904223) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  const hex = (c, a) => { const n = parseInt(c.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const mix = (c1, c2, t) => { const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16); const m = (x, y) => Math.round(x + (y - x) * t); return '#' + ((1 << 24) + (m(a >> 16, b >> 16) << 16) + (m((a >> 8) & 255, (b >> 8) & 255) << 8) + m(a & 255, b & 255)).toString(16).slice(1); };
  const ownerColOf = o => (typeof Game !== 'undefined' && Game.ownerCol) ? Game.ownerCol(o) : '#8a93a6';

  function backdrop(x, w, h, r, hue) {
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#02030a'); g.addColorStop(1, `hsl(${hue},40%,7%)`);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // 星雲
    for (let i = 0; i < 3; i++) {
      const nx = r() * w, ny = r() * h, nr = (0.3 + r() * 0.5) * w;
      const ng = x.createRadialGradient(nx, ny, 0, nx, ny, nr);
      ng.addColorStop(0, `hsla(${hue + (r() - 0.5) * 80},70%,45%,0.13)`); ng.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = ng; x.fillRect(0, 0, w, h);
    }
    for (let i = 0; i < w * h / 260; i++) {
      const sx = r() * w, sy = r() * h, b = r();
      x.fillStyle = `rgba(${200 + b * 55 | 0},${210 + b * 45 | 0},255,${0.25 + b * 0.7})`;
      x.fillRect(sx, sy, b > 0.93 ? 1.6 : 0.8, b > 0.93 ? 1.6 : 0.8);
      if (b > 0.985) { x.fillStyle = 'rgba(220,230,255,0.35)'; x.fillRect(sx - 3, sy + 0.4, 7, 0.6); x.fillRect(sx + 0.4, sy - 3, 0.6, 7); }
    }
  }

  function blobs(x, cx, cy, R, r, n, col, a0, a1, sz) {
    for (let i = 0; i < n; i++) {
      const ang = r() * Math.PI * 2, d = Math.sqrt(r()) * R, bx = cx + Math.cos(ang) * d, by = cy + Math.sin(ang) * d * 0.9, br = R * (sz[0] + r() * sz[1]);
      x.fillStyle = hex(col, a0 + r() * (a1 - a0));
      x.beginPath(); x.ellipse(bx, by, br * (1 + r() * 0.8), br * (0.5 + r() * 0.5), r() * Math.PI, 0, Math.PI * 2); x.fill();
    }
  }

  function surface(x, p, P, cx, cy, R, r, evil) {
    const [c0, c1, c2] = P.col, t = p.type;
    const base = x.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
    base.addColorStop(0, mix(c0, '#ffffff', 0.15)); base.addColorStop(0.7, c0); base.addColorStop(1, mix(c0, '#000000', 0.4));
    x.fillStyle = base; x.fillRect(cx - R, cy - R, R * 2, R * 2);
    if (t === 'gas') {
      const nb = 9 + (r() * 6 | 0);
      for (let i = 0; i < nb; i++) {
        const yy = cy - R + (i + r() * 0.5) * (2 * R / nb), bh = R * (0.06 + r() * 0.16);
        x.fillStyle = hex(i % 2 ? c1 : c2, 0.25 + r() * 0.35);
        x.beginPath(); x.moveTo(cx - R, yy);
        const amp = R * 0.03 * (1 + r()), fq = 2 + r() * 4, ph = r() * 6;
        for (let k = 0; k <= 20; k++) { const xx = cx - R + k * R / 10; x.lineTo(xx, yy + Math.sin(k / 20 * fq * Math.PI + ph) * amp); }
        for (let k = 20; k >= 0; k--) { const xx = cx - R + k * R / 10; x.lineTo(xx, yy + bh + Math.sin(k / 20 * fq * Math.PI + ph + 1) * amp); }
        x.fill();
      }
      // 大嵐
      const sx = cx + (r() - 0.6) * R * 0.8, sy = cy + (r() - 0.3) * R * 0.6, sr = R * (0.12 + r() * 0.08);
      const sg = x.createRadialGradient(sx, sy, 0, sx, sy, sr);
      sg.addColorStop(0, hex(c2, 0.9)); sg.addColorStop(0.5, hex(c1, 0.8)); sg.addColorStop(1, hex(c1, 0));
      x.fillStyle = sg; x.beginPath(); x.ellipse(sx, sy, sr * 1.7, sr, 0, 0, Math.PI * 2); x.fill();
      return;
    }
    if (t === 'terra') { blobs(x, cx, cy, R, r, 14, c1, 0.75, 0.95, [0.12, 0.22]); blobs(x, cx, cy, R, r, 10, '#c8a868', 0.25, 0.5, [0.05, 0.1]); }
    if (t === 'ocean') { blobs(x, cx, cy, R, r, 10, c1, 0.3, 0.6, [0.15, 0.25]); blobs(x, cx, cy, R, r, 6, '#4f9a5e', 0.7, 0.9, [0.02, 0.05]); }
    if (t === 'desert') { blobs(x, cx, cy, R, r, 18, c1, 0.25, 0.55, [0.08, 0.2]); blobs(x, cx, cy, R, r, 8, c2, 0.15, 0.3, [0.05, 0.12]);
      x.strokeStyle = hex(c1, 0.35); x.lineWidth = R * 0.012; for (let i = 0; i < 7; i++) { const yy = cy + (r() - 0.5) * R * 1.6; x.beginPath(); x.moveTo(cx - R, yy); x.bezierCurveTo(cx - R * 0.3, yy - R * 0.15, cx + R * 0.3, yy + R * 0.15, cx + R, yy + (r() - 0.5) * R * 0.2); x.stroke(); } }
    if (t === 'ice') { blobs(x, cx, cy, R, r, 14, c1, 0.25, 0.5, [0.08, 0.2]);
      x.strokeStyle = 'rgba(90,150,200,0.45)'; x.lineWidth = R * 0.01; for (let i = 0; i < 9; i++) { x.beginPath(); let px = cx + (r() - 0.5) * R * 1.6, py = cy + (r() - 0.5) * R * 1.6; x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (r() - 0.5) * R * 0.5; py += (r() - 0.5) * R * 0.5; x.lineTo(px, py); } x.stroke(); } }
    if (t === 'barren' || t === 'ruin' || t === 'ice' || t === 'desert') {
      blobs(x, cx, cy, R, r, 8, c1, 0.2, 0.45, [0.1, 0.2]);
      const nc = t === 'barren' ? 22 : 9;
      for (let i = 0; i < nc; i++) {
        const ang = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.92, kx = cx + Math.cos(ang) * d, ky = cy + Math.sin(ang) * d, kr = R * (0.025 + r() * r() * 0.13);
        const sq = Math.sqrt(Math.max(0.15, 1 - (d / R) ** 2));
        x.fillStyle = hex(mix(c1, '#000000', 0.3), 0.55); x.beginPath(); x.ellipse(kx, ky, kr, kr * sq, ang, 0, Math.PI * 2); x.fill();
        x.strokeStyle = hex(c2, 0.35); x.lineWidth = kr * 0.25; x.beginPath(); x.ellipse(kx + kr * 0.1, ky + kr * 0.1, kr, kr * sq, ang, Math.PI * 0.9, Math.PI * 1.9); x.stroke();
      }
    }
    if (t === 'ruin') { // 古代の光路
      x.strokeStyle = 'rgba(140,230,255,0.55)'; x.lineWidth = R * 0.012; x.shadowColor = '#7fe8ff'; x.shadowBlur = 6;
      for (let i = 0; i < 6; i++) { x.beginPath(); let px = cx + (r() - 0.5) * R, py = cy + (r() - 0.5) * R; x.moveTo(px, py); for (let k = 0; k < 4; k++) { if (k % 2) px += (r() - 0.5) * R * 0.6; else py += (r() - 0.5) * R * 0.6; x.lineTo(px, py); } x.stroke(); }
      x.shadowBlur = 0;
    }
    if (t === 'ice' || t === 'terra' || t === 'ocean') { // 極冠
      const cap = t === 'ice' ? 0.42 : 0.22;
      x.fillStyle = 'rgba(245,250,255,0.85)';
      x.beginPath(); x.ellipse(cx, cy - R, R * 0.9, R * cap * (0.8 + r() * 0.4), 0, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.ellipse(cx, cy + R, R * 0.8, R * cap * (0.6 + r() * 0.4), 0, 0, Math.PI * 2); x.fill();
    }
    if (t === 'terra' || t === 'ocean' || t === 'ice') { // 雲
      const n = t === 'ocean' ? 26 : 18;
      for (let i = 0; i < n; i++) {
        const yy = cy + (r() - 0.5) * R * 1.8, xx = cx + (r() - 0.5) * R * 1.8, cw = R * (0.15 + r() * 0.35);
        x.fillStyle = `rgba(255,255,255,${0.18 + r() * 0.35})`;
        x.beginPath(); x.ellipse(xx, yy, cw, cw * (0.12 + r() * 0.12), (r() - 0.5) * 0.4, 0, Math.PI * 2); x.fill();
      }
      if (r() < 0.6) { // 渦巻く低気圧
        const sx = cx + (r() - 0.5) * R, sy = cy + (r() - 0.5) * R; x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = R * 0.03;
        x.beginPath(); for (let a = 0; a < 12; a += 0.3) { const rr = a * R * 0.012; x.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr * 0.7); } x.stroke();
      }
    }
    if (evil) { // 侵食：黒い脈と赤い亀裂
      x.fillStyle = 'rgba(20,0,12,0.55)'; x.fillRect(cx - R, cy - R, R * 2, R * 2);
      x.strokeStyle = 'rgba(255,40,110,0.85)'; x.shadowColor = '#ff2a6a'; x.shadowBlur = 8;
      for (let i = 0; i < 9; i++) { x.lineWidth = R * (0.008 + r() * 0.015); x.beginPath(); let px = cx + (r() - 0.5) * R * 1.4, py = cy + (r() - 0.5) * R * 1.4; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - 0.5) * R * 0.35; py += (r() - 0.5) * R * 0.35; x.lineTo(px, py); } x.stroke(); }
      x.shadowBlur = 0;
    }
  }

  function cityLights(x, cx, cy, R, r, pop, evil) {
    const n = Math.min(160, Math.round(pop * 1.6));
    for (let i = 0; i < n; i++) {
      const ang = (r() - 0.5) * Math.PI * 0.9, d = Math.sqrt(r()) * R * 0.95;
      const lx = cx + Math.abs(Math.cos(ang)) * d * 0.95 + R * 0.05, ly = cy + Math.sin(ang) * d;
      if ((lx - cx) ** 2 + (ly - cy) ** 2 > R * R * 0.9 || lx < cx + R * 0.25) continue;
      x.fillStyle = evil ? `rgba(255,60,120,${0.4 + r() * 0.5})` : `rgba(255,${190 + r() * 50 | 0},120,${0.35 + r() * 0.55})`;
      const s = R * (0.008 + r() * 0.014); x.fillRect(lx, ly, s, s);
    }
  }

  function ring(x, cx, cy, R, r, col, back) {
    const rx = R * (1.9 + r() * 0.3), ry = R * 0.42, tilt = -0.18;
    x.save(); x.translate(cx, cy); x.rotate(tilt);
    x.beginPath(); x.rect(-rx * 1.2, back ? -ry * 1.5 : 0, rx * 2.4, ry * 1.5); x.clip();
    for (let i = 0; i < 6; i++) { x.strokeStyle = hex(col, 0.14 + r() * 0.3); x.lineWidth = R * (0.03 + r() * 0.06); const k = 0.72 + i * 0.055; x.beginPath(); x.ellipse(0, 0, rx * k, ry * k, 0, 0, Math.PI * 2); x.stroke(); }
    x.restore();
  }

  function satellites(x, cx, cy, R, def, col, back, r) {
    if (!def) return;
    const rx = R * 1.55, ry = R * 0.32, tilt = 0.22, n = Math.min(def, 24), off = r() * 6;
    x.save(); x.translate(cx, cy); x.rotate(tilt);
    x.strokeStyle = hex(col, back ? 0.22 : 0.5); x.lineWidth = 1; x.setLineDash([3, 3]);
    x.beginPath(); x.ellipse(0, 0, rx, ry, 0, back ? Math.PI : 0, back ? Math.PI * 2 : Math.PI); x.stroke(); x.setLineDash([]);
    for (let i = 0; i < n; i++) {
      const a = off + i / n * Math.PI * 2, s = Math.sin(a);
      if ((s < 0) !== back) continue;
      const sx = Math.cos(a) * rx, sy = s * ry, z = back ? 0.7 : 1;
      x.fillStyle = hex(col, 0.35 * z); x.beginPath(); x.arc(sx, sy, R * 0.07 * z, 0, Math.PI * 2); x.fill();
      x.fillStyle = col; x.fillRect(sx - R * 0.045 * z, sy - R * 0.012, R * 0.09 * z, R * 0.024);
      x.fillStyle = '#ffffff'; x.fillRect(sx - R * 0.012, sy - R * 0.012, R * 0.024, R * 0.024);
    }
    x.restore();
  }

  function rift(x, cx, cy, R, r) {
    // 黒い太陽：降着円盤とコロナ
    const g = x.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 2.4);
    g.addColorStop(0, 'rgba(255,48,112,0.6)'); g.addColorStop(0.3, 'rgba(160,20,90,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, cx * 4, cy * 4);
    x.save(); x.translate(cx, cy);
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, len = R * (1.1 + r() * 0.9);
      x.strokeStyle = `rgba(255,${60 + r() * 120 | 0},${120 + r() * 80 | 0},${0.1 + r() * 0.3})`; x.lineWidth = 0.6 + r() * 1.5;
      x.beginPath(); x.moveTo(Math.cos(a) * R, Math.sin(a) * R); x.quadraticCurveTo(Math.cos(a + 0.3) * len * 0.8, Math.sin(a + 0.3) * len * 0.8, Math.cos(a + 0.5) * len, Math.sin(a + 0.5) * len); x.stroke();
    }
    x.rotate(-0.25);
    for (let i = 0; i < 7; i++) { x.strokeStyle = `rgba(255,${120 + i * 18},${170 + i * 10},${0.55 - i * 0.06})`; x.lineWidth = R * 0.05; x.beginPath(); x.ellipse(0, 0, R * (1.25 + i * 0.12), R * (0.28 + i * 0.03), 0, Math.PI, Math.PI * 2); x.stroke(); }
    x.restore();
    x.fillStyle = '#000'; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(255,200,230,0.95)'; x.lineWidth = R * 0.04; x.shadowColor = '#ff3070'; x.shadowBlur = 14;
    x.beginPath(); x.arc(cx, cy, R * 1.01, 0, Math.PI * 2); x.stroke(); x.shadowBlur = 0;
    x.save(); x.translate(cx, cy); x.rotate(-0.25);
    for (let i = 0; i < 7; i++) { x.strokeStyle = `rgba(255,${120 + i * 18},${170 + i * 10},${0.75 - i * 0.08})`; x.lineWidth = R * 0.05; x.beginPath(); x.ellipse(0, 0, R * (1.25 + i * 0.12), R * (0.28 + i * 0.03), 0, 0, Math.PI); x.stroke(); }
    x.restore();
  }

  function vortex(x, cx, cy, R, r) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, R * 3);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.15, 'rgba(60,0,40,0.9)'); g.addColorStop(0.5, 'rgba(120,10,80,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, cx * 4, cy * 4);
    x.save(); x.translate(cx, cy); x.scale(1, 0.55);
    const arms = 5;
    for (let a = 0; a < arms; a++) {
      for (let j = 0; j < 3; j++) {
        x.strokeStyle = `rgba(255,${40 + j * 60},${120 + j * 40},${0.5 - j * 0.12})`; x.lineWidth = R * (0.08 - j * 0.02);
        x.beginPath();
        for (let t = 0; t < 1; t += 0.03) { const ang = a / arms * Math.PI * 2 + t * 5 + j * 0.12, rr = R * 0.15 + t * R * 2.8; x.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
        x.stroke();
      }
    }
    x.restore();
    for (let i = 0; i < 60; i++) { const ang = r() * Math.PI * 2, rr = R * (0.3 + r() * 2.5); x.fillStyle = `rgba(255,${150 + r() * 100 | 0},220,${r() * 0.8})`; x.fillRect(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.55, 1.2, 1.2); }
    x.fillStyle = '#000'; x.beginPath(); x.ellipse(cx, cy, R * 0.35, R * 0.2, 0, 0, Math.PI * 2); x.fill();
  }

  function draw(p, w, h) {
    const dpr = 2, cv = document.createElement('canvas'); cv.width = w * dpr; cv.height = h * dpr;
    const x = cv.getContext('2d'); x.scale(dpr, dpr);
    const P = PTYPES[p.type] || PTYPES.terra, r = rng((p.id + 1) * 7919 + (p.seed || 0));
    const evil = p.owner === 'E', hue = p.type === 'rift' || evil || p.abyss ? 330 : (typeof SYSTEMS !== 'undefined' && SYSTEMS[p.sys] ? SYSTEMS[p.sys].hue : 220);
    backdrop(x, w, h, r, hue);
    const cx = w * (0.56 + r() * 0.1), cy = h * 0.52, R = h * 0.36;
    if (p.abyss) { vortex(x, cx, cy, R, r); }
    else if (p.type === 'rift') { rift(x, cx, cy, R * 0.75, r); }
    else {
      // 恒星光（左上）
      const sg = x.createRadialGradient(0, 0, 0, 0, 0, w * 0.5); sg.addColorStop(0, 'rgba(255,240,210,0.22)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = sg; x.fillRect(0, 0, w, h);
      const ringed = p.type === 'gas' ? r() < 0.75 : p.type === 'ice' || p.type === 'barren' ? r() < 0.2 : false;
      const ringCol = evil ? '#ff2a6a' : P.col[2];
      const atm = evil ? '#ff2a6a' : p.type === 'barren' ? '#b0a8a0' : P.col[p.type === 'desert' || p.type === 'gas' ? 2 : 0];
      if (ringed) ring(x, cx, cy, R, rng(p.id + 5), ringCol, true);
      satellites(x, cx, cy, R, p.def | 0, ownerColOf(p.owner), true, rng(p.id + 9));
      // 大気の光暈
      const ag = x.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.35);
      ag.addColorStop(0, hex(atm, p.type === 'barren' ? 0.15 : 0.5)); ag.addColorStop(1, hex(atm, 0));
      x.fillStyle = ag; x.beginPath(); x.arc(cx, cy, R * 1.35, 0, Math.PI * 2); x.fill();
      x.save(); x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.clip();
      surface(x, p, P, cx, cy, R, r, evil);
      // 昼夜境界
      const tg = x.createLinearGradient(cx - R * 0.6, cy - R * 0.4, cx + R * 0.9, cy + R * 0.5);
      tg.addColorStop(0, 'rgba(0,0,0,0)'); tg.addColorStop(0.45, 'rgba(0,0,8,0.25)'); tg.addColorStop(0.7, 'rgba(0,0,10,0.82)'); tg.addColorStop(1, 'rgba(0,0,12,0.95)');
      x.fillStyle = tg; x.fillRect(cx - R, cy - R, R * 2, R * 2);
      if (p.pop > 0 && p.type !== 'gas') cityLights(x, cx, cy, R, rng(p.id + 3), p.pop, evil);
      // 縁の大気散乱
      const rim = x.createRadialGradient(cx, cy, R * 0.82, cx, cy, R);
      rim.addColorStop(0, hex(atm, 0)); rim.addColorStop(1, hex(atm, p.type === 'barren' ? 0.12 : 0.45));
      x.fillStyle = rim; x.fillRect(cx - R, cy - R, R * 2, R * 2);
      x.restore();
      // 昼側の光る縁
      x.strokeStyle = hex(mix(atm, '#ffffff', 0.5), 0.6); x.lineWidth = 1.2;
      x.beginPath(); x.arc(cx, cy, R, Math.PI * 0.85, Math.PI * 1.65); x.stroke();
      if (ringed) ring(x, cx, cy, R, rng(p.id + 5), ringCol, false);
      satellites(x, cx, cy, R, p.def | 0, ownerColOf(p.owner), false, rng(p.id + 9));
    }
    // 周辺減光
    const vg = x.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, w * 0.65);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = vg; x.fillRect(0, 0, w, h);
    return cv.toDataURL('image/jpeg', 0.86);
  }

  function url(p, w = 340, h = 150) {
    const key = [p.id, p.type, p.owner, p.abyss ? 1 : 0, Math.min(24, p.def | 0), Math.round((p.pop || 0) / 10), w, h].join('|');
    let u = cache.get(key);
    if (!u) { try { u = draw(p, w, h); } catch (e) { u = ''; } if (cache.size > 24) cache.clear(); cache.set(key, u); }
    return u;
  }
  return { url };
})();
