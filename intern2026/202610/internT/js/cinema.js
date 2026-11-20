// ============================================================
//  演出：オープニング・タイトル背景・エンディング
//  （画像ファイルは使わず、すべて Canvas でその場で描く）
// ============================================================
const Cinema = (() => {
  let titleRaf = null;
  function genByName(name) {
    const l = GENERAL_SRC.trim().split('\n').find(x => x.startsWith(name + ','));
    const p = l.split(',');
    return { name: p[0], lead: +p[1], war: +p[2], int: +p[3], pol: +p[4], cha: +p[5], traits: p[6] === '-' ? [] : p[6].split(' '), appear: +p[8], female: p[10] === 'F', isLord: true };
  }
  function fit(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), r = cv.getBoundingClientRect();
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, W: r.width, H: r.height, dpr };
  }
  const ease = k => k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k);
  const easeOut = k => k < 0 ? 0 : k > 1 ? 1 : 1 - Math.pow(1 - k, 3);
  const fade = (t, a, b, f = 0.8) => t < a || t > b ? 0 : Math.min(1, (t - a) / f, (b - t) / f);
  // 決まった乱数（毎回同じ景色にするため）
  function srand(seed) { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

  // ---------------- 部品 ----------------
  // なめらかな山の稜線（中点変位法）
  function makeRidge(seed, n = 64, rough = 0.55) {
    const r = srand(seed), pts = new Array(n + 1).fill(0);
    pts[0] = r(); pts[n] = r();
    let step = n, amp = 1;
    while (step > 1) {
      const half = step / 2;
      for (let i = half; i < n; i += step) pts[i] = (pts[i - half] + pts[i + half]) / 2 + (r() - 0.5) * amp;
      step = half; amp *= rough;
    }
    const mn = Math.min(...pts), mx = Math.max(...pts);
    return pts.map(v => (v - mn) / (mx - mn || 1));
  }
  const RIDGES = [makeRidge(7), makeRidge(19), makeRidge(31), makeRidge(53), makeRidge(71)];
  function mountains(c, W, H, base, amp, ridge, col, off = 0, fog) {
    const span = W + 200;
    c.beginPath(); c.moveTo(-100, H);
    ridge.forEach((v, i) => { const x = -100 + span * i / (ridge.length - 1) + (off % 200); c.lineTo(x, base - v * amp); });
    c.lineTo(W + 100, H); c.closePath();
    if (typeof col === 'string') c.fillStyle = col; else { const g = c.createLinearGradient(0, base - amp, 0, H); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]); c.fillStyle = g; }
    c.fill();
    if (fog) { const g = c.createLinearGradient(0, base - amp * 0.3, 0, base + 30); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, fog); c.fillStyle = g; c.fillRect(0, base - amp * 0.3, W, amp * 0.3 + 40); }
  }
  // 稜線の上に松
  function pines(c, W, base, amp, ridge, col, seed, off = 0) {
    const r = srand(seed), span = W + 200;
    c.fillStyle = col;
    for (let i = 0; i < 26; i++) {
      const k = r(), idx = Math.floor(k * (ridge.length - 1));
      const x = -100 + span * idx / (ridge.length - 1) + (off % 200), y = base - ridge[idx] * amp;
      const h = 8 + r() * 14;
      c.beginPath(); c.moveTo(x, y - h); c.lineTo(x - h * 0.35, y + 2); c.lineTo(x + h * 0.35, y + 2); c.fill();
      c.beginPath(); c.moveTo(x, y - h * 1.3); c.lineTo(x - h * 0.25, y - h * 0.4); c.lineTo(x + h * 0.25, y - h * 0.4); c.fill();
    }
  }
  function sky(c, W, H, stops) { const g = c.createLinearGradient(0, 0, 0, H); stops.forEach(([o, col]) => g.addColorStop(o, col)); c.fillStyle = g; c.fillRect(0, 0, W, H); }
  function glow(c, x, y, r, col, a = 1) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = a; c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.globalAlpha = 1; }
  function moon(c, x, y, r) {
    glow(c, x, y, r * 4, 'rgba(255,240,200,0.35)');
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r); g.addColorStop(0, '#fffbea'); g.addColorStop(1, '#e8dcb8');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    c.fillStyle = 'rgba(160,150,120,0.25)'; [[0.3, -0.2, 0.22], [-0.25, 0.25, 0.16], [0.1, 0.4, 0.1], [-0.35, -0.3, 0.12]].forEach(([dx, dy, rr]) => { c.beginPath(); c.arc(x + dx * r, y + dy * r, rr * r, 0, 7); c.fill(); });
  }
  // 雲（やわらかい塊）
  function makeClouds(seed, n, W, H) { const r = srand(seed); return Array.from({ length: n }, () => ({ x: r() * W * 1.4 - W * 0.2, y: r() * H * 0.45, s: 30 + r() * 70, v: 4 + r() * 10, a: 0.12 + r() * 0.2 })); }
  function clouds(c, list, t, W, col) {
    list.forEach(cl => {
      const x = ((cl.x + t * cl.v) % (W * 1.6)) - W * 0.3;
      c.globalAlpha = cl.a; c.fillStyle = col;
      for (let k = 0; k < 5; k++) { c.beginPath(); c.ellipse(x + (k - 2) * cl.s * 0.45, cl.y + Math.sin(k * 1.7) * cl.s * 0.12, cl.s * 0.55, cl.s * 0.22, 0, 0, 7); c.fill(); }
    });
    c.globalAlpha = 1;
  }
  // 宮殿・城の影（反り返った屋根）
  function roof(c, x, y, w, h) { c.beginPath(); c.moveTo(x - w / 2 - h * 0.6, y - h * 0.15); c.quadraticCurveTo(x - w / 2, y + h * 0.05, x - w / 2 + h * 0.2, y + h * 0.1); c.lineTo(x + w / 2 - h * 0.2, y + h * 0.1); c.quadraticCurveTo(x + w / 2, y + h * 0.05, x + w / 2 + h * 0.6, y - h * 0.15); c.lineTo(x + w * 0.3, y - h); c.lineTo(x - w * 0.3, y - h); c.closePath(); c.fill(); }
  function palace(c, x, base, s, col, lit) {
    c.fillStyle = col;
    c.fillRect(x - 70 * s, base - 14 * s, 140 * s, 14 * s);                       // 基壇
    c.fillRect(x - 46 * s, base - 40 * s, 92 * s, 26 * s); roof(c, x, base - 40 * s, 100 * s, 18 * s);
    c.fillRect(x - 32 * s, base - 70 * s, 64 * s, 22 * s); roof(c, x, base - 70 * s, 74 * s, 16 * s);
    c.fillRect(x - 18 * s, base - 96 * s, 36 * s, 18 * s); roof(c, x, base - 96 * s, 46 * s, 14 * s);
    c.fillRect(x - 1.5 * s, base - 118 * s, 3 * s, 10 * s);
    // 左右の楼閣
    [-1, 1].forEach(d => { c.fillRect(x + d * 95 * s - 14 * s, base - 34 * s, 28 * s, 34 * s); roof(c, x + d * 95 * s, base - 34 * s, 34 * s, 12 * s); });
    if (lit) { c.fillStyle = lit; for (let i = -3; i <= 3; i++) c.fillRect(x + i * 11 * s - 2 * s, base - 32 * s, 4 * s, 7 * s); for (let i = -2; i <= 2; i++) c.fillRect(x + i * 10 * s - 2 * s, base - 62 * s, 4 * s, 6 * s); }
  }
  function castleWall(c, x0, x1, y, h, col) { c.fillStyle = col; c.fillRect(x0, y - h, x1 - x0, h); for (let x = x0; x < x1; x += 10) c.fillRect(x, y - h - 5, 6, 5); }
  // 兵士の列（槍と旗）
  function army(c, x0, x1, y, size, col, t, flagCol, dir = 1) {
    c.fillStyle = col; c.strokeStyle = col; c.lineWidth = Math.max(1, size * 0.12);
    for (let x = x0, i = 0; x < x1; x += size * 0.9, i++) {
      const bob = Math.sin(t * 6 + i) * size * 0.06, xx = x + (t * 12 * dir) % (size * 0.9);
      c.beginPath(); c.arc(xx, y - size * 1.05 + bob, size * 0.16, 0, 7); c.fill();
      c.fillRect(xx - size * 0.15, y - size * 0.9 + bob, size * 0.3, size * 0.55);
      c.fillRect(xx - size * 0.15, y - size * 0.36 + bob, size * 0.1, size * 0.36); c.fillRect(xx + size * 0.05, y - size * 0.36 + bob, size * 0.1, size * 0.36);
      c.beginPath(); c.moveTo(xx + size * 0.25, y - size * 0.2 + bob); c.lineTo(xx + size * 0.32, y - size * 1.7 + bob); c.stroke();
      if (flagCol && i % 6 === 0) { c.fillStyle = flagCol; c.beginPath(); c.moveTo(xx + size * 0.32, y - size * 1.7 + bob); c.lineTo(xx + size * 0.32 + size * 0.5 * dir, y - size * 1.55 + Math.sin(t * 5 + i) * 2 + bob); c.lineTo(xx + size * 0.32, y - size * 1.35 + bob); c.fill(); c.fillStyle = col; }
    }
  }
  // 騎馬武者の影
  function rider(c, x, y, s, col, t, flagCol) {
    c.fillStyle = col; c.strokeStyle = col;
    const leg = Math.sin(t * 12) * 6 * s;
    c.beginPath(); c.ellipse(x, y, 24 * s, 9 * s, 0, 0, 7); c.fill();                 // 胴
    c.beginPath(); c.moveTo(x + 16 * s, y - 4 * s); c.quadraticCurveTo(x + 26 * s, y - 20 * s, x + 32 * s, y - 22 * s); c.lineTo(x + 36 * s, y - 16 * s); c.quadraticCurveTo(x + 28 * s, y - 10 * s, x + 22 * s, y + 2 * s); c.fill();   // 首と頭
    c.lineWidth = 3 * s; [[-16, 1], [-9, -1], [12, 1], [18, -1]].forEach(([dx, d]) => { c.beginPath(); c.moveTo(x + dx * s, y + 4 * s); c.lineTo(x + dx * s + leg * d, y + 20 * s); c.stroke(); });
    c.beginPath(); c.moveTo(x - 22 * s, y - 2 * s); c.quadraticCurveTo(x - 34 * s, y + 2 * s, x - 36 * s, y + 12 * s); c.stroke();   // 尾
    c.fillRect(x - 4 * s, y - 26 * s, 8 * s, 20 * s); c.beginPath(); c.arc(x, y - 30 * s, 5 * s, 0, 7); c.fill();     // 武者
    c.lineWidth = 2 * s; c.beginPath(); c.moveTo(x - 14 * s, y - 2 * s); c.lineTo(x + 20 * s, y - 58 * s); c.stroke();      // 槍
    if (flagCol) { c.fillStyle = flagCol; c.beginPath(); c.moveTo(x + 20 * s, y - 58 * s); c.lineTo(x + 2 * s, y - 52 * s + Math.sin(t * 8) * 3 * s); c.lineTo(x + 16 * s, y - 44 * s); c.fill(); }
  }
  function birds(c, list, t, W, col) {
    c.strokeStyle = col; c.lineWidth = 1.4;
    list.forEach(b => { const x = (b.x + t * b.v) % (W + 60) - 30, y = b.y + Math.sin(t + b.x) * 4, f = Math.sin(t * 8 + b.x) * 3;
      c.beginPath(); c.moveTo(x - 6, y - f); c.quadraticCurveTo(x - 3, y - 2, x, y); c.quadraticCurveTo(x + 3, y - 2, x + 6, y - f); c.stroke(); });
  }
  function flag(c, x, y, h, col, ch, wave) {
    c.strokeStyle = '#2a1a10'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h); c.stroke();
    const fw = h * 0.45, fh = h * 0.55;
    const g = c.createLinearGradient(x, 0, x + fw, 0); g.addColorStop(0, col); g.addColorStop(1, shadeCol(col, 0.7));
    c.fillStyle = g; c.beginPath(); c.moveTo(x, y - h);
    for (let i = 0; i <= 10; i++) c.lineTo(x + fw * i / 10, y - h + Math.sin(wave + i * 0.6) * 4);
    for (let i = 10; i >= 0; i--) c.lineTo(x + fw * i / 10, y - h + fh + Math.sin(wave + i * 0.6) * 4);
    c.closePath(); c.fill();
    c.strokeStyle = '#d4af37'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#fff'; c.font = `bold ${fh * 0.5}px 'Yuji Syuku', serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(ch, x + fw / 2, y - h + fh / 2 + Math.sin(wave + 3) * 3); c.textBaseline = 'alphabetic';
  }
  function shadeCol(hex, k) { const n = parseInt(hex.slice(1), 16); const f = v => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
  // 朱印
  function seal(c, x, y, s, txt, a = 1, rot = -0.08) {
    c.save(); c.globalAlpha = a; c.translate(x, y); c.rotate(rot);
    c.fillStyle = '#b8241a'; c.fillRect(-s / 2, -s / 2, s, s);
    c.strokeStyle = 'rgba(255,240,230,0.85)'; c.lineWidth = s * 0.05; c.strokeRect(-s * 0.4, -s * 0.4, s * 0.8, s * 0.8);
    c.fillStyle = '#fff3e6'; c.font = `${s * 0.34}px 'Yuji Syuku', serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const ch = [...txt]; if (ch.length === 2) { c.fillText(ch[0], 0, -s * 0.18); c.fillText(ch[1], 0, s * 0.2); } else c.fillText(txt, 0, 0);
    c.textBaseline = 'alphabetic'; c.restore();
  }
  // 墨しぶき（ぽたぽた垂れる）
  function inkSplash(c, x, y, R, k, col, seed) {
    const r = srand(seed);
    c.fillStyle = col;
    c.beginPath(); c.ellipse(x, y, R * 1.1 * k, R * 0.42 * k, -0.08, 0, 7); c.fill();
    for (let i = 0; i < 22; i++) {
      const a = r() * Math.PI * 2, d = R * (0.5 + r() * 0.9) * k, rr = (2 + r() * 10) * k;
      c.beginPath(); c.arc(x + Math.cos(a) * d * 1.3, y + Math.sin(a) * d * 0.5, rr, 0, 7); c.fill();
    }
    for (let i = 0; i < 6; i++) { const dx = (r() - 0.5) * R * 1.6, len = (20 + r() * 40) * k; c.fillRect(x + dx - 2, y + R * 0.3 * k, 4, len); c.beginPath(); c.arc(x + dx, y + R * 0.3 * k + len, 4, 0, 7); c.fill(); }
  }
  // 粒子（火の粉・花びら・ホタル）
  function makeParticles(n, W, H, seed) { const r = srand(seed); return Array.from({ length: n }, () => ({ x: r() * W, y: r() * H, v: 0.3 + r(), s: 1 + r() * 3, p: r() * 6 })); }
  // 粗い紙の質感と周辺減光（最後にかぶせる）
  let grain = null;
  function finish(c, W, H, vig = 0.55) {
    if (!grain) { grain = document.createElement('canvas'); grain.width = 160; grain.height = 160; const g = grain.getContext('2d'); const d = g.createImageData(160, 160); for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 14; } g.putImageData(d, 0, 0); }
    c.fillStyle = c.createPattern(grain, 'repeat'); c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${vig})`); c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  // 字幕の後ろに敷く半透明の帯（明るい背景でも読めるように）
  function band(c, W, y, h, alpha) {
    if (alpha <= 0) return;
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.2, 'rgba(10,6,4,0.55)'); g.addColorStop(0.8, 'rgba(10,6,4,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = alpha; c.fillStyle = g; c.fillRect(0, y, W, h); c.globalAlpha = 1;
  }
  function text(c, W, y, str, alpha, size = 20, col = '#f6e8c6') {
    if (alpha <= 0) return;
    c.globalAlpha = alpha; c.textAlign = 'center'; c.font = `500 ${size}px 'Shippori Mincho B1', serif`;
    const yy = y + (1 - alpha) * 6;
    c.lineWidth = 4; c.strokeStyle = 'rgba(10,6,4,0.75)'; c.lineJoin = 'round'; c.strokeText(str, W / 2, yy);
    c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 10; c.fillStyle = col; c.fillText(str, W / 2, yy);
    c.shadowBlur = 0; c.globalAlpha = 1;
  }
  // 縦書きの字幕（右寄せ）
  function vtext(c, x, y, str, alpha, size = 22, col = '#f6e8c6') {
    if (alpha <= 0) return;
    c.globalAlpha = alpha; c.textAlign = 'center'; c.font = `${size}px 'Yuji Syuku', serif`; c.fillStyle = col; c.shadowColor = '#000'; c.shadowBlur = 10;
    [...str].forEach((ch, i) => c.fillText(ch, x, y + i * size * 1.15));
    c.shadowBlur = 0; c.globalAlpha = 1;
  }

  // ================= オープニング =================
  function opening(cv, skipBtn) {
    return new Promise(resolve => {
      Sound.bgm('title');
      const { c, W, H } = fit(cv);
      const r = srand(3);
      const stars = Array.from({ length: 220 }, () => { const x = r() * W, y = r() * H * 0.75; const band = Math.abs((y - H * 0.1) - x * 0.35) < 60; return [x, y, r() * 1.4 + 0.3 + (band ? 0.3 : 0), r() * 6, band]; });
      const embers = makeParticles(110, W, H, 5);
      const smoke = makeParticles(26, W, H, 9);
      const cl1 = makeClouds(11, 7, W, H), cl2 = makeClouds(13, 6, W, H);
      const flock = Array.from({ length: 9 }, (_, i) => ({ x: i * 18 + (i % 2) * 8, y: H * 0.22 + (i % 3) * 10, v: 22 }));
      const heroes = ['曹操', '劉備', '孫権'].map(genByName);
      const hcols = ['#2f5aa8', '#2f8a4e', '#c0392b'];
      const pcanvas = heroes.map((g, i) => { const p = document.createElement('canvas'); p.width = 240; p.height = 300; const pc = p.getContext('2d'); pc.scale(2, 2); Portrait.draw(pc, g, 'normal', hcols[i]); return p; });
      // 題字を筆で書く用の下絵
      const fs = Math.min(W / 4.6, 92);
      const titleCv = document.createElement('canvas'); titleCv.width = W * 2; titleCv.height = fs * 2.6 * 2;
      const tc = titleCv.getContext('2d'); tc.scale(2, 2); tc.font = `${fs}px 'Yuji Syuku', serif`; tc.textAlign = 'center'; tc.textBaseline = 'middle';
      tc.shadowColor = 'rgba(0,0,0,0.8)'; tc.shadowBlur = 14; tc.fillStyle = '#f6e8c6';
      const chars = [...'群雄天下'];
      const T = 38;
      let t0 = performance.now(), done = false, raf, gonged = false;
      const finishOp = () => { if (done) return; done = true; cancelAnimationFrame(raf); skipBtn.onclick = null; resolve(); };
      skipBtn.onclick = e => { e.stopPropagation(); finishOp(); };
      const frame = () => {
        const t = (performance.now() - t0) / 1000;
        c.clearRect(0, 0, W, H);
        // ---- 1. 夜空（0-9秒）
        if (t < 10) {
          const a = fade(t, 0, 10, 1.4);
          c.globalAlpha = a;
          sky(c, W, H, [[0, '#03040c'], [0.55, '#0f1230'], [1, '#2a1f3a']]);
          // 天の川
          c.save(); c.translate(W * 0.1, 0); c.rotate(0.35); glow(c, W * 0.35, H * 0.15, W * 0.55, 'rgba(160,170,255,0.10)'); c.restore();
          stars.forEach(([x, y, rr, p, band]) => { const tw = 0.45 + Math.sin(t * 2.2 + p) * 0.35; c.fillStyle = band ? `rgba(220,225,255,${tw})` : `rgba(255,250,225,${tw})`; c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill(); if (rr > 1.4) glow(c, x, y, rr * 5, 'rgba(255,250,220,0.18)'); });
          // 流れ星
          const sk = (t % 4.5) / 0.7; if (sk < 1) { const sx = W * 0.85 - sk * W * 0.5, sy = H * 0.08 + sk * H * 0.12; c.strokeStyle = `rgba(255,255,255,${1 - sk})`; c.lineWidth = 1.5; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 50, sy - 12); c.stroke(); }
          moon(c, W * 0.74, H * 0.22 - t * 2, 34);
          clouds(c, cl1, t, W, '#3a3550');
          mountains(c, W, H, H * 0.7, 140, RIDGES[0], ['#1a1830', '#0b0a16'], -t * 3, 'rgba(60,60,100,0.35)');
          mountains(c, W, H, H * 0.82, 110, RIDGES[1], ['#0e0c18', '#06050b'], -t * 6, 'rgba(40,40,70,0.4)');
          pines(c, W, H * 0.82, 110, RIDGES[1], '#050409', 4, -t * 6);
          mountains(c, W, H, H * 0.94, 60, RIDGES[2], '#030206', -t * 10);
          // 丘の上の騎馬
          rider(c, W * 0.22, H * 0.86 - RIDGES[2][14] * 60 + 6, 0.9, '#030206', t * 0.15, null);
          c.globalAlpha = 1;
          vtext(c, W * 0.86, H * 0.36, '後漢の末', fade(t, 1, 9.5) * a, 24);
          // 黄巾の檄（「蒼天已に死す、黄天当に立つべし。歳は甲子に在り、天下大吉」）
          band(c, W, H * 0.6 - 34, 112, fade(t, 2.2, 9.5) * a);
          text(c, W, H * 0.6, '蒼天、已に死す。', fade(t, 2.2, 9.5) * a, 26);
          text(c, W, H * 0.6 + 40, '黄天、当に立つべし。', fade(t, 4, 9.5) * a, 26);
          text(c, W, H * 0.6 + 72, '歳は甲子に在り　天下大吉', fade(t, 6, 9.5) * a, 14);
        }
        // ---- 2. 燃える都（9-18秒）
        if (t > 9 && t < 18.5) {
          const a = fade(t, 9, 18.5, 1.1), lt = t - 9;
          c.globalAlpha = a;
          sky(c, W, H, [[0, '#120203'], [0.45, '#5a0f06'], [0.8, '#c24512'], [1, '#ff9a3a']]);
          glow(c, W * 0.5, H * 0.7, W * 0.9, `rgba(255,120,30,${0.35 + Math.sin(t * 9) * 0.06})`);
          // 煙
          smoke.forEach((p, i) => { const x = p.x + Math.sin(t * 0.5 + i) * 30, y = H * 0.6 - ((lt * 18 * p.v + p.y) % (H * 0.7)); const s = 40 + (H * 0.6 - y) * 0.25; c.globalAlpha = a * 0.22; c.fillStyle = '#1a0a08'; c.beginPath(); c.arc(x, y, s, 0, 7); c.fill(); });
          c.globalAlpha = a;
          mountains(c, W, H, H * 0.62, 70, RIDGES[3], '#2a0806');
          // 宮殿と城壁
          palace(c, W * 0.5, H * 0.74, Math.min(1.35, W / 290), '#0d0303', `rgba(255,170,60,${0.6 + Math.sin(t * 13) * 0.3})`);
          castleWall(c, 0, W, H * 0.78, 22, '#0a0202');
          // 炎
          for (let i = 0; i < 14; i++) { const x = (i / 13) * W, h = 30 + Math.sin(t * 7 + i * 1.7) * 14 + (i % 3) * 18; const g = c.createLinearGradient(0, H * 0.78 - h, 0, H * 0.78); g.addColorStop(0, 'rgba(255,220,120,0)'); g.addColorStop(0.5, 'rgba(255,140,40,0.8)'); g.addColorStop(1, 'rgba(255,60,20,0.9)'); c.fillStyle = g; c.beginPath(); c.moveTo(x - 22, H * 0.78); c.quadraticCurveTo(x - 10, H * 0.78 - h * 0.6, x + Math.sin(t * 9 + i) * 6, H * 0.78 - h); c.quadraticCurveTo(x + 10, H * 0.78 - h * 0.6, x + 22, H * 0.78); c.fill(); }
          c.fillStyle = '#080101'; c.fillRect(0, H * 0.78, W, H * 0.22);
          // 逃げる人々
          army(c, -40, W + 40, H * 0.9, 14, '#050000', lt, null, -1);
          embers.forEach(e => { e.y -= e.v * 1.6; e.x += Math.sin(t * 2 + e.p) * 0.7; if (e.y < -10) { e.y = H; e.x = Math.random() * W; } const tw = 0.5 + Math.sin(t * 10 + e.p) * 0.5; c.fillStyle = `rgba(255,${150 + tw * 90 | 0},60,${0.9 * a})`; c.beginPath(); c.arc(e.x, e.y, e.s * 0.8, 0, 7); c.fill(); });
          c.globalAlpha = 1;
          band(c, W, H * 0.2 - 30, 78, fade(t, 10, 18) * a);
          text(c, W, H * 0.2, '黄巾の炎は漢土を焼き、', fade(t, 10, 18) * a, 19);
          text(c, W, H * 0.2 + 36, '洛陽は暴君の手に落ちた。', fade(t, 11.5, 18) * a, 19);
        }
        // ---- 3. 群雄の旗と軍勢（18-27秒）
        if (t > 18 && t < 27.5) {
          const a = fade(t, 18, 27.5, 1), lt = t - 18;
          c.globalAlpha = a;
          sky(c, W, H, [[0, '#1c2848'], [0.45, '#6a5a78'], [0.75, '#e0a070'], [1, '#ffd49a']]);
          // 朝日と光の筋
          const sx = W * 0.5, sy = H * 0.56;
          c.save(); c.translate(sx, sy); c.globalAlpha = a * 0.16; for (let i = 0; i < 16; i++) { c.rotate(Math.PI * 2 / 16 + lt * 0.004); c.fillStyle = '#fff3d0'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-24, -H); c.lineTo(24, -H); c.fill(); } c.restore(); c.globalAlpha = a;
          glow(c, sx, sy, 160, 'rgba(255,230,170,0.8)');
          c.fillStyle = '#fff1c8'; c.beginPath(); c.arc(sx, sy, 34, 0, 7); c.fill();
          clouds(c, cl2, t, W, '#ffe2c0');
          birds(c, flock, lt, W, 'rgba(40,30,40,0.8)');
          mountains(c, W, H, H * 0.6, 120, RIDGES[0], ['#6f6a8c', '#4a4766'], -lt * 4, 'rgba(255,220,190,0.35)');
          mountains(c, W, H, H * 0.72, 90, RIDGES[1], ['#3d3b56', '#25243a'], -lt * 9, 'rgba(255,200,170,0.25)');
          // 行進する軍勢
          army(c, -60, W + 60, H * 0.82, 11, '#1a1622', lt, '#a8241a', 1);
          const flags = [['曹', '#2f5aa8'], ['劉', '#2f8a4e'], ['孫', '#c0392b'], ['袁', '#c9a227'], ['董', '#5b3a8c'], ['呂', '#7a2a5a'], ['馬', '#a85a3a']];
          flags.forEach(([ch, col], i) => { const k = easeOut((lt - 0.5 - i * 0.3) / 1.1); const x = W * (0.07 + i * 0.137), y = H * 0.97 + (1 - k) * 220 - (i % 2) * 26; flag(c, x, y, 150 + (i % 3) * 22, col, ch, t * 3 + i); });
          mountains(c, W, H, H * 0.99, 30, RIDGES[2], '#120f18');
          // 砂煙
          for (let i = 0; i < 8; i++) { glow(c, ((i * 97 + lt * 30) % (W + 100)) - 50, H * 0.84, 40, 'rgba(230,200,160,0.25)'); }
          c.globalAlpha = 1;
          // 演義の書き出し（「天下の大勢、分かるること久しければ必ず合し、合すること久しければ必ず分かる」）
          band(c, W, H * 0.16 - 30, 112, fade(t, 19, 27) * a);
          text(c, W, H * 0.16, '天下の大勢、', fade(t, 19, 27) * a, 19);
          text(c, W, H * 0.16 + 34, '分かれて久しければ必ず合し、', fade(t, 20.3, 27) * a, 19);
          text(c, W, H * 0.16 + 68, '合して久しければ必ず分かる。', fade(t, 21.6, 27) * a, 19);
        }
        // ---- 4. 英雄（27-33秒）
        if (t > 27 && t < 33.5) {
          const a = fade(t, 27, 33.5, 0.8), lt = t - 27;
          c.globalAlpha = a; sky(c, W, H, [[0, '#0c0805'], [1, '#1e120a']]); c.globalAlpha = 1;
          const pw = Math.min(W * 0.3, 132), ph = pw * 1.25;
          // 墨しぶきは肖像の後ろ（全員ぶんを先に描く）
          heroes.forEach((h, i) => {
            const k = easeOut((lt - 0.2 - i * 0.55) / 0.7);
            const x = W / 2 + (i - 1) * (pw + 8) - pw / 2, y = H * 0.33 + (1 - k) * 40;
            c.globalAlpha = a * k * 0.85;
            inkSplash(c, x + pw / 2, y + ph * 1.02, pw * 0.55, k, shadeCol(hcols[i], 0.4), 20 + i);
          });
          c.globalAlpha = 1;
          heroes.forEach((h, i) => {
            const k = easeOut((lt - 0.2 - i * 0.55) / 0.7);
            const x = W / 2 + (i - 1) * (pw + 8) - pw / 2, y = H * 0.33 + (1 - k) * 40;
            c.globalAlpha = a * k;
            const z = 1 + lt * 0.015;
            c.save(); c.beginPath(); c.rect(x, y, pw, ph); c.clip(); c.translate(x + pw / 2, y + ph / 2); c.scale(z, z); c.drawImage(pcanvas[i], -pw / 2, -ph / 2, pw, ph); c.restore();
            c.strokeStyle = '#d4af37'; c.lineWidth = 2; c.strokeRect(x, y, pw, ph);
            c.font = `26px 'Yuji Syuku', serif`; c.textAlign = 'center'; c.fillStyle = '#f6e8c6'; c.shadowColor = '#000'; c.shadowBlur = 8; c.fillText(h.name, x + pw / 2, y + ph + 34); c.shadowBlur = 0;
            seal(c, x + pw - 10, y + ph - 8, 20, ['魏', '蜀', '呉'][i], a * k);
            c.globalAlpha = 1;
          });
          text(c, W, H * 0.2, '群雄、天下に割拠す。', fade(t, 28.2, 33) * a, 20);
          text(c, W, H * 0.2 + 34, '天下を一つにするは、誰か――。', fade(t, 29.4, 33) * a, 18);
        }
        // ---- 5. 題字（33-38秒）
        if (t > 33) {
          const lt = t - 33;
          sky(c, W, H, [[0, '#0b0705'], [1, '#160d08']]);
          if (!gonged) { gonged = true; Sound.se('gong'); }
          const ty = H * 0.42;
          inkSplash(c, W / 2, ty, W * 0.36, easeOut(lt / 0.45), '#8f1a12', 77);
          glow(c, W / 2, ty, W * 0.6, `rgba(255,90,40,${0.2 * easeOut(lt / 0.6)})`);
          // 一文字ずつ筆で書く
          const cw = fs * 1.02;
          chars.forEach((ch, i) => {
            const k = ease((lt - 0.35 - i * 0.28) / 0.45);
            if (k <= 0) return;
            const cx = W / 2 + (i - 1.5) * cw;
            tc.clearRect(0, 0, W, fs * 2.6 * 2); tc.fillText(ch, W / 2, fs * 1.3);
            c.save(); c.beginPath(); c.rect(cx - cw / 2, ty - fs * 0.75, cw, fs * 1.5 * k); c.clip();
            c.drawImage(titleCv, cx - W / 2, ty - fs * 1.3, W, fs * 2.6);
            c.restore();
            if (k < 1) { c.fillStyle = 'rgba(20,10,5,0.8)'; c.beginPath(); c.arc(cx + Math.sin(k * 9) * cw * 0.2, ty - fs * 0.75 + fs * 1.5 * k, fs * 0.08, 0, 7); c.fill(); }
          });
          text(c, W, ty + fs * 1.05, '― 三 国 英 傑 伝 ―', ease((lt - 1.7) / 0.8), 18, '#f0d27a');
          const sk = ease((lt - 2.2) / 0.25);
          if (sk > 0) seal(c, Math.min(W - 26, W / 2 + cw * 2.0), ty + fs * 0.62, 34 * (1.6 - sk * 0.6), '英傑', sk);
          // 火の粉
          embers.slice(0, 50).forEach(e => { e.y -= e.v; if (e.y < 0) { e.y = H; e.x = Math.random() * W; } c.fillStyle = `rgba(255,170,80,${0.6 * ease(lt / 1)})`; c.beginPath(); c.arc(e.x, e.y, e.s * 0.6, 0, 7); c.fill(); });
        }
        finish(c, W, H);
        if (t >= T) return finishOp();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
  }

  // ================= タイトル背景 =================
  function titleBG(cv) {
    cancelAnimationFrame(titleRaf);
    const { c, W, H } = fit(cv);
    const petals = makeParticles(46, W, H, 21);
    const cl = makeClouds(17, 8, W, H);
    const flock = Array.from({ length: 7 }, (_, i) => ({ x: i * 22 + (i % 2) * 10 + W * 0.2, y: H * 0.18 + (i % 3) * 9, v: 14 }));
    const fireflies = makeParticles(18, W, H, 33);
    const t0 = performance.now();
    const frame = () => {
      if (UI.cur !== 'title') return;
      const t = (performance.now() - t0) / 1000;
      sky(c, W, H, [[0, '#14060a'], [0.35, '#4a1210'], [0.62, '#b8542a'], [0.75, '#f0a050'], [1, '#2a0e08']]);
      // 夕日と光の筋
      const sx = W * 0.5, sy = H * 0.5;
      c.save(); c.translate(sx, sy); c.globalAlpha = 0.12; for (let i = 0; i < 18; i++) { c.rotate(Math.PI * 2 / 18); c.fillStyle = '#ffe6b0'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-18, -H * 0.9); c.lineTo(18, -H * 0.9); c.fill(); } c.restore(); c.globalAlpha = 1;
      glow(c, sx, sy, W * 0.7, 'rgba(255,190,120,0.55)');
      c.fillStyle = '#ffe2b4'; c.beginPath(); c.arc(sx, sy, W * 0.17, 0, 7); c.fill();
      clouds(c, cl, t, W, '#ffc89a');
      birds(c, flock, t, W, 'rgba(30,10,10,0.75)');
      mountains(c, W, H, H * 0.6, 150, RIDGES[0], ['#7a3a2a', '#4a1e18'], Math.sin(t / 10) * 10, 'rgba(255,170,120,0.3)');
      mountains(c, W, H, H * 0.68, 120, RIDGES[1], ['#4a1c16', '#2a100c'], Math.sin(t / 8) * 18, 'rgba(255,150,100,0.22)');
      // 丘の上の城
      const hx = W * 0.72, hy = H * 0.66 - 20;
      palace(c, hx, hy, Math.min(0.5, W / 760), '#1e0a08', `rgba(255,200,120,${0.5 + Math.sin(t * 3) * 0.2})`);
      pines(c, W, H * 0.68, 120, RIDGES[1], '#1a0806', 7, Math.sin(t / 8) * 18);
      // 川（照り返し）
      const ry = H * 0.8;
      const rg = c.createLinearGradient(0, ry - 10, 0, ry + 30); rg.addColorStop(0, '#6a2a1a'); rg.addColorStop(1, '#2a0e08'); c.fillStyle = rg; c.fillRect(0, ry - 8, W, 40);
      for (let i = 0; i < 14; i++) { const w = 20 + (i % 4) * 18; c.fillStyle = `rgba(255,210,140,${0.25 + Math.sin(t * 2 + i) * 0.15})`; c.fillRect(sx - w / 2 + Math.sin(t + i) * 8, ry - 4 + i * 2.4, w, 1.4); }
      mountains(c, W, H, H * 0.86, 60, RIDGES[2], '#140605', Math.sin(t / 6) * 12);
      // 駆ける騎馬
      const hxp = ((t * 26) % (W + 220)) - 110;
      rider(c, hxp, H * 0.84, 0.75, '#0c0302', t, '#a8241a');
      rider(c, hxp - 70, H * 0.86, 0.6, '#0c0302', t + 0.3, null);
      // 霧
      for (let i = 0; i < 3; i++) { const y = H * (0.66 + i * 0.07); const g = c.createLinearGradient(0, y - 20, 0, y + 20); g.addColorStop(0, 'rgba(255,220,200,0)'); g.addColorStop(0.5, 'rgba(255,220,200,0.07)'); g.addColorStop(1, 'rgba(255,220,200,0)'); c.fillStyle = g; c.fillRect(0, y - 20 + Math.sin(t / 3 + i) * 6, W, 40); }
      // ホタル（下の方）
      fireflies.forEach(f => { const x = f.x + Math.sin(t * 0.7 + f.p) * 20, y = H * 0.75 + (f.y % (H * 0.25)) + Math.cos(t * 0.9 + f.p) * 10; const a = 0.4 + Math.sin(t * 3 + f.p) * 0.4; glow(c, x, y, 8, `rgba(255,230,140,${a})`); });
      // 花びら
      petals.forEach(p => { p.y += p.v * 0.8; p.x += Math.sin(t + p.p) * 0.6; if (p.y > H) { p.y = -10; p.x = Math.random() * W; } c.save(); c.translate(p.x, p.y); c.rotate(t * 1.5 + p.p); c.fillStyle = 'rgba(255,195,205,0.85)'; c.beginPath(); c.ellipse(0, 0, p.s + 2, (p.s + 2) * 0.5, 0, 0, 7); c.fill(); c.fillStyle = 'rgba(255,240,240,0.6)'; c.beginPath(); c.ellipse(-1, -0.5, p.s * 0.6, p.s * 0.25, 0, 0, 7); c.fill(); c.restore(); });
      finish(c, W, H, 0.6);
      titleRaf = requestAnimationFrame(frame);
    };
    titleRaf = requestAnimationFrame(frame);
  }

  // ================= エンディング =================
  function ending(cv, rollEl, skipBtn, kind) {
    return new Promise(resolve => {
      const win = kind === 'win';
      Sound.bgm(win ? 'ending' : 'sad');
      const { c, W, H } = fit(cv);
      const f = G.factions[G.player], lord = Game.lordOf(G.player) || G.gens[f.lord];
      const myGens = G.gens.filter(g => g.state === 'serve' && g.faction === G.player).sort((a, b) => (b.wins * 3 + b.duels * 5 + b.lead + b.war + b.int) - (a.wins * 3 + a.duels * 5 + a.lead + a.war + a.int));
      const fallen = G.gens.filter(g => g.state === 'dead' && g.deathReason === '戦死' && g.faction === G.player);
      const sc = SCENARIOS.find(s => s.id === G.scen);
      const H_ = Game.has;
      const epi = win ? [
        `${G.year}年。`,
        `${lord.name}は、ついに天下を平定した。`,
        H_(lord, '仁徳') ? '戦に疲れた民は、新しい君主の慈しみに涙したという。' : H_(lord, '野心') ? '力で束ねた天下を、恐れと共に人々は仰ぎ見た。' : '長く続いた乱世は、ここに終わりを告げた。',
        '荒れた田畑には再び麦が実り、街道には商人の声が戻る。',
        '英雄たちの名は、のちの世まで語り継がれていく――。',
      ] : [
        `${G.year}年。`,
        `${f.name}の夢は、ここに潰えた。`,
        '乱世はなお続く。',
        '天下を手にするのは、果たして誰か――。',
      ];
      const roll = document.createElement('div'); roll.className = 'roll';
      roll.innerHTML = `<h2>${win ? '天下統一' : '覇業ならず'}</h2>` + epi.map(p => `<p>${p}</p>`).join('') +
        (myGens.length ? `<h3>${win ? '功 臣' : '最後まで従った者たち'}</h3>` + myGens.slice(0, 16).map(g => `<div class="cr"><img src="${Portrait.get(g, win ? 'happy' : 'sad', f.color)}"><div><b>${g.name}</b><small>統${g.lead} 武${g.war} 知${g.int} 政${g.pol} 魅${g.cha}<br>戦功 ${g.wins}　一騎討ち ${g.duels}勝</small></div></div>`).join('') : '') +
        (fallen.length ? `<h3>散っていった者たち</h3><p>${fallen.map(g => g.name).join('　')}</p>` : '') +
        `<h3>戦 績</h3><p>シナリオ「${sc.title}」<br>${sc.dream ? '' : sc.year + '年 〜 '}${G.year}年<br>戦い ${G.stats.battles}回　勝利 ${G.stats.wins}回<br>捕らえた武将 ${G.stats.captured}人　登用 ${G.stats.recruited}人<br>一騎討ち勝利 ${G.stats.duelsWon}回</p>` +
        `<h3>制 作</h3><p>群雄天下 ― 三国英傑伝 ―<br>intern2026 / internT</p><p>絵・音・物語　すべてプログラムで生成</p><p>Powered by GitHub + Vercel + Claude</p>` +
        `<div class="fin">完</div>`;
      rollEl.innerHTML = ''; rollEl.appendChild(roll);
      const t0 = performance.now();
      let done = false, raf;
      const finishEnd = () => { if (done) return; done = true; cancelAnimationFrame(raf); skipBtn.onclick = null; rollEl.innerHTML = ''; resolve(); };
      skipBtn.onclick = finishEnd;
      const lanterns = makeParticles(30, W, H, 41);
      const confetti = makeParticles(60, W, H, 43);
      const rain = makeParticles(90, W, H, 47);
      const crows = Array.from({ length: 5 }, (_, i) => ({ x: i * 40, y: H * 0.25 + (i % 2) * 14, v: 18 }));
      const cl = makeClouds(19, 7, W, H);
      const crowd = srand(5);
      const crowdPts = Array.from({ length: 70 }, () => [crowd() * W, crowd()]);
      const frame = () => {
        const t = (performance.now() - t0) / 1000;
        if (win) {
          const k = Math.min(1, t / 8);
          sky(c, W, H, [[0, `rgb(${40 + k * 60},${50 + k * 90},${100 + k * 90})`], [0.5, `rgb(${150 + k * 90},${110 + k * 90},${100 + k * 40})`], [0.8, '#ffdc9a'], [1, '#f6c27a']]);
          const sy = H * 0.66 - k * H * 0.2;
          c.save(); c.translate(W / 2, sy); c.globalAlpha = 0.14 * k; for (let i = 0; i < 18; i++) { c.rotate(Math.PI * 2 / 18 + t * 0.002); c.fillStyle = '#fff6d0'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-26, -H); c.lineTo(26, -H); c.fill(); } c.restore(); c.globalAlpha = 1;
          glow(c, W / 2, sy, 200, 'rgba(255,240,190,0.8)');
          c.fillStyle = '#fff4cc'; c.beginPath(); c.arc(W / 2, sy, 46, 0, 7); c.fill();
          clouds(c, cl, t, W, '#fff0d8');
          mountains(c, W, H, H * 0.66, 120, RIDGES[0], ['#8a6a5a', '#6a4a3a'], 0, 'rgba(255,230,200,0.35)');
          mountains(c, W, H, H * 0.74, 90, RIDGES[1], ['#5a3e30', '#3a281e'], 0, 'rgba(255,220,180,0.25)');
          // 宮殿と勝者の旗
          palace(c, W / 2, H * 0.86, Math.min(1.3, W / 300), '#2a1a12', 'rgba(255,220,140,0.9)');
          [-1, 1].forEach(d => flag(c, W / 2 + d * W * 0.38, H * 0.9, 130, f.color, f.name[0], t * 2.5 + d));
          // 歓声を上げる人々
          c.fillStyle = '#1a100a';
          crowdPts.forEach(([x, p]) => { const j = Math.abs(Math.sin(t * 6 + p * 20)) * 4; c.beginPath(); c.arc(x, H * 0.94 - j, 4, 0, 7); c.fill(); c.fillRect(x - 3, H * 0.94 - j + 3, 6, 10); c.fillRect(x + (p > 0.5 ? 2 : -4), H * 0.94 - j - 6 - j, 2, 8); });
          c.fillStyle = '#120a06'; c.fillRect(0, H * 0.96, W, H * 0.04);
          c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, 0, W, H);   // 字幕を読みやすく
          // 天灯
          lanterns.forEach(l => { l.y -= l.v * 0.5; l.x += Math.sin(t * 0.5 + l.p) * 0.3; if (l.y < -20) { l.y = H + 20; l.x = Math.random() * W; } glow(c, l.x, l.y, 18, 'rgba(255,200,110,0.55)'); c.fillStyle = '#ffd08a'; c.beginPath(); c.moveTo(l.x - 4, l.y - 5); c.lineTo(l.x + 4, l.y - 5); c.lineTo(l.x + 3, l.y + 5); c.lineTo(l.x - 3, l.y + 5); c.fill(); });
          // 紙吹雪（金と朱）
          if (t > 2) confetti.forEach(p => { p.y += p.v * 1.2; p.x += Math.sin(t * 2 + p.p) * 0.8; if (p.y > H) { p.y = -10; p.x = Math.random() * W; } c.save(); c.translate(p.x, p.y); c.rotate(t * 3 + p.p); c.fillStyle = p.p > 3 ? '#e8c050' : '#d0402a'; c.fillRect(-3, -1.5, 6, 3); c.restore(); });
        } else {
          sky(c, W, H, [[0, '#07080e'], [0.6, '#1c1a26'], [1, '#2a2430']]);
          clouds(c, cl, t * 0.5, W, '#3a3644');
          birds(c, crows, t, W, 'rgba(10,10,14,0.9)');
          mountains(c, W, H, H * 0.7, 110, RIDGES[0], ['#1c1a24', '#121018'], 0, 'rgba(80,80,100,0.3)');
          mountains(c, W, H, H * 0.82, 80, RIDGES[1], '#0c0a10');
          // 折れた旗
          c.save(); c.translate(W * 0.5, H * 0.92); c.rotate(-0.35); flag(c, 0, 0, 120, '#3a3a3a', f.name[0], t * 0.6); c.restore();
          c.fillStyle = '#08070a'; c.fillRect(0, H * 0.92, W, H * 0.08);
          c.strokeStyle = 'rgba(190,200,220,0.35)'; c.lineWidth = 1;
          rain.forEach(p => { p.y += 9 + p.v * 4; p.x -= 2; if (p.y > H) { p.y = -10; p.x = Math.random() * (W + 60); } c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - 4, p.y + 14); c.stroke(); });
          if (Math.random() < 0.004) { c.fillStyle = 'rgba(220,230,255,0.25)'; c.fillRect(0, 0, W, H); }
          c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, 0, W, H);
        }
        finish(c, W, H, 0.5);
        const y = H - (t - 2) * 34;
        roll.style.transform = `translateY(${Math.min(0, y - H)}px)`;
        if (t > 2 && -(y - H) > roll.offsetHeight + H * 0.2) return finishEnd();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
  }

  return { opening, titleBG, ending };
})();
