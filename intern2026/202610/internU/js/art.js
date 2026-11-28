// ============================================================
//  絵（Canvas で描く共通の部品）：艦・紋章・星雲・星空・惑星
// ============================================================
const Art = (() => {
  function srand(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  function mix(a, b, t) {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    const ch = s => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
    return '#' + ((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1);
  }

  // ---------- 艦の形（上向き、長さ1の座標） ----------
  const SHAPES = {
    dd: [[0, -1], [0.28, 0.2], [0.5, 0.65], [0.18, 0.5], [0.12, 0.9], [-0.12, 0.9], [-0.18, 0.5], [-0.5, 0.65], [-0.28, 0.2]],
    cl: [[0, -1], [0.18, -0.55], [0.3, -0.1], [0.42, 0.35], [0.3, 0.55], [0.22, 0.95], [-0.22, 0.95], [-0.3, 0.55], [-0.42, 0.35], [-0.3, -0.1], [-0.18, -0.55]],
    bb: [[0, -1], [0.14, -0.78], [0.22, -0.4], [0.34, -0.2], [0.34, 0.3], [0.46, 0.5], [0.4, 0.78], [0.22, 0.82], [0.2, 1], [-0.2, 1], [-0.22, 0.82], [-0.4, 0.78], [-0.46, 0.5], [-0.34, 0.3], [-0.34, -0.2], [-0.22, -0.4], [-0.14, -0.78]],
    cv: [[0, -1], [0.3, -0.85], [0.42, -0.3], [0.42, 0.6], [0.28, 1], [-0.28, 1], [-0.42, 0.6], [-0.42, -0.3], [-0.3, -0.85]],
    dn: [[0, -1], [0.12, -0.86], [0.18, -0.6], [0.34, -0.45], [0.34, -0.15], [0.5, 0.05], [0.5, 0.45], [0.36, 0.6], [0.36, 0.86], [0.18, 1], [-0.18, 1], [-0.36, 0.86], [-0.36, 0.6], [-0.5, 0.45], [-0.5, 0.05], [-0.34, -0.15], [-0.34, -0.45], [-0.18, -0.6], [-0.12, -0.86]],
    sat: [[0, -0.7], [0.7, 0], [0, 0.7], [-0.7, 0]],
    spore: [[0, -1], [0.5, -0.3], [0.7, 0.6], [0, 0.3], [-0.7, 0.6], [-0.5, -0.3]],
    maw: [[0, -0.6], [0.35, -1], [0.6, -0.3], [0.7, 0.5], [0.3, 1], [-0.3, 1], [-0.7, 0.5], [-0.6, -0.3], [-0.35, -1]],
    crown: [[0, -1], [0.25, -0.6], [0.55, -0.95], [0.6, -0.3], [0.9, 0], [0.55, 0.6], [0.3, 1], [-0.3, 1], [-0.55, 0.6], [-0.9, 0], [-0.6, -0.3], [-0.55, -0.95], [-0.25, -0.6]],
  };
  // 艦を描く：ang はラジアン（0 で上向き）。L は全長(px)
  function ship(c, hull, x, y, ang, L, col, opt = {}) {
    if (typeof ShipArt !== 'undefined') return ShipArt.draw(c, hull, x, y, ang, L, col, opt);   // 詳しい艦の絵（js/shipart.js）
    const pts = SHAPES[hull] || SHAPES.cl;
    c.save(); c.translate(x, y); c.rotate(ang);
    const eclipse = hull === 'spore' || hull === 'maw' || hull === 'crown';
    // 機関の光
    if (!opt.noEngine) {
      const ex = hull === 'sat' ? 0 : L * 0.5;
      const g = c.createRadialGradient(0, ex, 0, 0, ex, L * 0.45);
      g.addColorStop(0, eclipse ? 'rgba(255,40,110,.9)' : 'rgba(160,230,255,.95)'); g.addColorStop(1, 'rgba(80,160,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, ex, L * 0.45, 0, Math.PI * 2); c.fill();
    }
    c.beginPath();
    pts.forEach(([px, py], i) => { const X = px * L * 0.5, Y = py * L * 0.5; i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
    c.closePath();
    if (eclipse) {
      c.fillStyle = '#12020a'; c.fill();
      c.strokeStyle = opt.hit ? '#fff' : '#ff3070'; c.lineWidth = Math.max(1, L * 0.06); c.stroke();
    } else {
      const g = c.createLinearGradient(-L * 0.3, 0, L * 0.3, 0);
      g.addColorStop(0, mix(col, '#000000', 0.55)); g.addColorStop(0.5, mix(col, '#ffffff', 0.25)); g.addColorStop(1, mix(col, '#000000', 0.35));
      c.fillStyle = opt.hit ? '#ffffff' : g; c.fill();
      c.strokeStyle = hexA('#ffffff', 0.5); c.lineWidth = Math.max(0.6, L * 0.035); c.stroke();
      // 艦橋
      if (L > 9 && hull !== 'sat') { c.fillStyle = 'rgba(220,250,255,.85)'; c.fillRect(-L * 0.05, -L * 0.12, L * 0.1, L * 0.14); }
    }
    c.restore();
  }

  // ---------- 紋章 ----------
  function emblem(c, kind, x, y, r, col, col2) {
    c.save(); c.translate(x, y);
    c.lineJoin = 'round';
    const ring = () => { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.strokeStyle = col2; c.lineWidth = r * 0.08; c.stroke(); };
    c.fillStyle = col; c.strokeStyle = col2;
    if (kind === 'crown') {
      ring();
      c.beginPath(); c.moveTo(-r * 0.6, r * 0.35); c.lineTo(-r * 0.62, -r * 0.3); c.lineTo(-r * 0.3, r * 0.02); c.lineTo(0, -r * 0.55); c.lineTo(r * 0.3, r * 0.02); c.lineTo(r * 0.62, -r * 0.3); c.lineTo(r * 0.6, r * 0.35); c.closePath();
      c.fill(); c.lineWidth = r * 0.06; c.stroke();
      c.fillStyle = col2; [-0.62, 0, 0.62].forEach((k, i) => { c.beginPath(); c.arc(r * k, i === 1 ? -r * 0.58 : -r * 0.33, r * 0.08, 0, 7); c.fill(); });
    } else if (kind === 'star') {
      ring();
      c.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.3 : r * 0.72; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath(); c.fill(); c.lineWidth = r * 0.05; c.stroke();
    } else if (kind === 'coin') {
      ring();
      c.beginPath(); c.arc(0, 0, r * 0.62, 0, 7); c.fill();
      c.strokeStyle = col2; c.lineWidth = r * 0.1;
      c.beginPath(); c.moveTo(-r * 0.3, -r * 0.3); c.lineTo(r * 0.3, -r * 0.3); c.moveTo(-r * 0.3, 0); c.lineTo(r * 0.3, 0); c.moveTo(0, -r * 0.45); c.lineTo(0, r * 0.45); c.stroke();
    } else if (kind === 'sun') {
      ring();
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42); c.lineTo(Math.cos(a + 0.13) * r * 0.78, Math.sin(a + 0.13) * r * 0.78); c.lineTo(Math.cos(a - 0.13) * r * 0.78, Math.sin(a - 0.13) * r * 0.78); c.closePath(); c.fill(); }
      c.fillStyle = col2; c.beginPath(); c.arc(0, 0, r * 0.36, 0, 7); c.fill();
      c.fillStyle = col; c.beginPath(); c.arc(0, 0, r * 0.22, 0, 7); c.fill();
    } else if (kind === 'wing') {
      ring();
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(0, r * 0.2);
        c.quadraticCurveTo(s * r * 0.4, -r * 0.6, s * r * 0.8, -r * 0.5);
        c.quadraticCurveTo(s * r * 0.55, -r * 0.1, s * r * 0.7, 0);
        c.quadraticCurveTo(s * r * 0.45, r * 0.15, s * r * 0.55, r * 0.35);
        c.quadraticCurveTo(s * r * 0.3, r * 0.3, 0, r * 0.45); c.closePath(); c.fill();
      }
      c.fillStyle = col2; c.beginPath(); c.moveTo(0, -r * 0.35); c.lineTo(r * 0.12, r * 0.3); c.lineTo(-r * 0.12, r * 0.3); c.closePath(); c.fill();
    } else if (kind === 'gear') {
      ring();
      c.beginPath();
      for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, rr = i % 2 ? r * 0.5 : r * 0.68; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath(); c.fill();
      c.fillStyle = col2; c.beginPath(); c.arc(0, 0, r * 0.26, 0, 7); c.fill();
      c.fillStyle = col; c.beginPath(); c.arc(0, 0, r * 0.12, 0, 7); c.fill();
    } else if (kind === 'eclipse') {
      c.beginPath(); c.arc(0, 0, r, 0, 7); c.fillStyle = '#000'; c.fill();
      c.strokeStyle = '#ff2a6a'; c.lineWidth = r * 0.1; c.stroke();
    }
    c.restore();
  }

  // ---------- 星空と星雲（オフスクリーンに描いて使い回す） ----------
  function nebulaCanvas(w, h, seed, hues, opt = {}) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d'), r = srand(seed);
    c.fillStyle = opt.bg || '#03040a'; c.fillRect(0, 0, w, h);
    // 雲
    c.globalCompositeOperation = 'lighter';
    const n = opt.clouds || 46;
    for (let i = 0; i < n; i++) {
      const hue = hues[Math.floor(r() * hues.length)] + (r() - 0.5) * 30;
      const x = r() * w, y = r() * h, rad = (0.08 + r() * 0.28) * Math.max(w, h);
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      const a = (opt.alpha || 0.09) * (0.4 + r());
      g.addColorStop(0, `hsla(${hue},70%,${45 + r() * 20}%,${a})`);
      g.addColorStop(0.5, `hsla(${hue + 20},70%,30%,${a * 0.4})`);
      g.addColorStop(1, `hsla(${hue},70%,20%,0)`);
      c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill();
    }
    // 暗い筋（塵）
    c.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 14; i++) {
      const x = r() * w, y = r() * h, rad = (0.05 + r() * 0.15) * w;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(0,0,6,.35)'); g.addColorStop(1, 'rgba(0,0,6,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill();
    }
    // 星
    const stars = opt.stars || Math.round(w * h / 900);
    for (let i = 0; i < stars; i++) {
      const x = r() * w, y = r() * h, b = r();
      const s = b > 0.985 ? 1.8 : b > 0.9 ? 1.1 : 0.6;
      c.fillStyle = `hsla(${200 + r() * 60},60%,${80 + r() * 20}%,${0.35 + b * 0.65})`;
      c.fillRect(x, y, s, s);
      if (b > 0.993) {
        c.strokeStyle = 'rgba(220,240,255,.5)'; c.lineWidth = 0.6;
        c.beginPath(); c.moveTo(x - 5, y + 0.9); c.lineTo(x + 6.8, y + 0.9); c.moveTo(x + 0.9, y - 5); c.lineTo(x + 0.9, y + 6.8); c.stroke();
      }
    }
    return cv;
  }

  // ---------- 惑星 ----------
  function planet(c, x, y, r, type, seed, opt = {}) {
    const P = PTYPES[type] || PTYPES.terra, rnd = srand(seed + 11);
    c.save();
    // 大気の光
    if (r > 4 && type !== 'rift') {
      const g = c.createRadialGradient(x, y, r * 0.9, x, y, r * 1.5);
      g.addColorStop(0, hexA(P.col[2], 0.35)); g.addColorStop(1, hexA(P.col[2], 0));
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 1.5, 0, 7); c.fill();
    }
    if (type === 'rift') {
      const t = (opt.t || 0);
      for (let i = 0; i < 3; i++) {
        const g = c.createRadialGradient(x, y, 0, x, y, r * (1.6 + i * 0.5 + Math.sin(t * 2 + i) * 0.15));
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(10,0,6,.95)'); g.addColorStop(0.62, 'rgba(255,40,110,.55)'); g.addColorStop(1, 'rgba(255,40,110,0)');
        c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.6, 0, 7); c.fill();
      }
      c.restore(); return;
    }
    c.beginPath(); c.arc(x, y, r, 0, 7); c.clip();
    const g = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, P.col[2]); g.addColorStop(0.35, P.col[0]); g.addColorStop(1, P.col[1]);
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    if (r > 6) {
      // 模様（帯・大陸）
      if (type === 'gas') {
        for (let i = 0; i < 7; i++) { c.fillStyle = hexA(i % 2 ? P.col[1] : P.col[2], 0.22); c.fillRect(x - r, y - r + (i + rnd() * 0.5) * r * 0.3, r * 2, r * (0.08 + rnd() * 0.12)); }
      } else {
        const n = type === 'ocean' ? 4 : type === 'terra' ? 6 : 8;
        for (let i = 0; i < n; i++) {
          const cx = x + (rnd() - 0.5) * r * 1.6, cy = y + (rnd() - 0.5) * r * 1.6, cr = r * (0.12 + rnd() * 0.3);
          c.fillStyle = type === 'terra' ? 'rgba(60,140,70,.55)' : type === 'ocean' ? 'rgba(230,240,255,.25)' : hexA(P.col[1], 0.35);
          c.beginPath(); c.ellipse(cx, cy, cr, cr * (0.5 + rnd() * 0.5), rnd() * 3, 0, 7); c.fill();
        }
        if (type === 'ruin') { c.strokeStyle = 'rgba(200,180,255,.5)'; c.lineWidth = Math.max(0.5, r * 0.04); for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(x, y, r * (0.3 + i * 0.18), rnd() * 6, rnd() * 6 + 1.5); c.stroke(); } }
      }
      // 夜の側
      const sh = c.createLinearGradient(x - r, y - r, x + r, y + r);
      sh.addColorStop(0.45, 'rgba(0,0,10,0)'); sh.addColorStop(1, 'rgba(0,0,10,.78)');
      c.fillStyle = sh; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    c.restore();
    if (type === 'gas' && r > 6) {
      c.save(); c.strokeStyle = hexA(P.col[2], 0.45); c.lineWidth = Math.max(0.8, r * 0.08);
      c.beginPath(); c.ellipse(x, y, r * 1.7, r * 0.42, -0.35, 0, 7); c.stroke(); c.restore();
    }
  }

  return { srand, hexA, mix, ship, emblem, nebulaCanvas, planet, SHAPES };
})();
