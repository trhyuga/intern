// ============================================================
//  会話の背景演出（Canvas 2D）
//  TalkFX.start(bg) で #talk の最初の子として canvas を差し込み、
//  bg ごとのアニメーション背景を描く。#talk から .show が外れたら自動で止まる。
//  静的な部分はオフスクリーンに一度だけ描き、毎フレームは粒子だけを重ねる。
// ============================================================
const TalkFX = (() => {
  let cv = null, ctx = null, raf = 0, kind = 'space', W = 0, H = 0, dpr = 1;
  let base = null, baseKey = '', parts = [], t0 = 0, flick = 0;
  const KINDS = { palace: 1, space: 1, crisis: 1, bridge: 1 };
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const rnd = (a, b) => a + Math.random() * (b - a);

  function css() {
    if (document.getElementById('talkfx-css')) return;
    const s = document.createElement('style');
    s.id = 'talkfx-css';
    s.textContent = '.talkfx{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block}';
    document.head.appendChild(s);
  }
  function facCol() {
    try { if (typeof G !== 'undefined' && G && typeof G.player === 'number' && FACTIONS[G.player]) return FACTIONS[G.player].col; } catch (e) {}
    return '#c03040';
  }

  // ---------- 静的な背景（サイズと種類が変わったときだけ描く） ----------
  function buildBase() {
    const col = kind === 'palace' ? facCol() : '';
    const key = kind + W + 'x' + H + dpr + col;
    if (key === baseKey && base) return;
    baseKey = key;
    base = document.createElement('canvas');
    base.width = W * dpr; base.height = H * dpr;
    const b = base.getContext('2d');
    b.scale(dpr, dpr);
    ({ palace: basePalace, space: baseSpace, crisis: baseCrisis, bridge: baseBridge })[kind](b, col);
    initParts();
  }
  function stars(b, n, x0, y0, w, h, amax) {
    for (let i = 0; i < n; i++) {
      b.globalAlpha = rnd(0.2, amax);
      b.fillStyle = Math.random() < 0.15 ? '#ffd8b0' : Math.random() < 0.3 ? '#b8d0ff' : '#fff';
      const s = Math.random() < 0.08 ? 1.6 : 0.9;
      b.fillRect(x0 + Math.random() * w, y0 + Math.random() * h, s, s);
    }
    b.globalAlpha = 1;
  }
  function basePalace(b, col) {
    let g = b.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a0f22'); g.addColorStop(0.55, '#2c1a2e'); g.addColorStop(1, '#0a0508');
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    // 奥の光（シャンデリア）
    g = b.createRadialGradient(W / 2, H * 0.16, 0, W / 2, H * 0.16, H * 0.55);
    g.addColorStop(0, '#ffd890aa'); g.addColorStop(0.25, '#e0a05040'); g.addColorStop(1, '#00000000');
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    // 奥の大窓（星空）
    const ww = W * 0.34, wx = W / 2 - ww / 2, wy = H * 0.24, wh = H * 0.36;
    b.save(); b.beginPath(); b.moveTo(wx, wy + wh); b.lineTo(wx, wy + ww / 2); b.arc(W / 2, wy + ww / 2, ww / 2, Math.PI, 0); b.lineTo(wx + ww, wy + wh); b.closePath();
    b.fillStyle = '#060a1c'; b.fill(); b.clip(); stars(b, 70, wx, wy, ww, wh, 0.9); b.restore();
    b.strokeStyle = '#d8a85a66'; b.lineWidth = 2; b.stroke();
    // 国旗（垂れ幕）
    const bw = W * 0.11;
    [W * 0.2, W * 0.8].forEach(cx => {
      const y0 = H * 0.08, y1 = H * 0.5;
      const gg = b.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
      gg.addColorStop(0, '#000000'); gg.addColorStop(0.5, col); gg.addColorStop(1, '#000000');
      b.globalAlpha = 0.75; b.fillStyle = gg;
      b.beginPath(); b.moveTo(cx - bw / 2, y0); b.lineTo(cx + bw / 2, y0); b.lineTo(cx + bw / 2, y1); b.lineTo(cx, y1 - bw * 0.5); b.lineTo(cx - bw / 2, y1); b.closePath(); b.fill();
      b.globalAlpha = 0.9; b.strokeStyle = '#e8c070'; b.lineWidth = 1.2; b.stroke();
      b.beginPath(); b.arc(cx, y0 + (y1 - y0) * 0.35, bw * 0.22, 0, Math.PI * 2); b.stroke();
      b.globalAlpha = 1;
    });
    // 柱（遠近の二列）
    const pil = (x, w, top, bot, a) => {
      const gg = b.createLinearGradient(x, 0, x + w, 0);
      gg.addColorStop(0, `rgba(10,5,10,${a})`); gg.addColorStop(0.35, `rgba(90,60,50,${a})`); gg.addColorStop(0.6, `rgba(30,18,20,${a})`); gg.addColorStop(1, `rgba(5,2,5,${a})`);
      b.fillStyle = gg; b.fillRect(x, top, w, bot - top);
      b.fillStyle = `rgba(200,150,80,${a * 0.35})`; b.fillRect(x - w * 0.12, top, w * 1.24, 5); b.fillRect(x - w * 0.12, bot - 6, w * 1.24, 6);
    };
    pil(W * 0.06, W * 0.08, H * 0.05, H * 0.7, 0.9); pil(W * 0.86, W * 0.08, H * 0.05, H * 0.7, 0.9);
    pil(-W * 0.06, W * 0.15, 0, H, 1); pil(W * 0.91, W * 0.15, 0, H, 1);
    // 床（反射）
    g = b.createLinearGradient(0, H * 0.66, 0, H);
    g.addColorStop(0, '#3a2418'); g.addColorStop(1, '#060304');
    b.fillStyle = g; b.fillRect(0, H * 0.68, W, H * 0.32);
    b.strokeStyle = '#d8a85a22'; b.lineWidth = 1;
    for (let i = -6; i <= 6; i++) { b.beginPath(); b.moveTo(W / 2 + i * W * 0.04, H * 0.68); b.lineTo(W / 2 + i * W * 0.3, H); b.stroke(); }
    b.fillStyle = '#7a1a22aa'; b.beginPath(); b.moveTo(W * 0.44, H * 0.68); b.lineTo(W * 0.56, H * 0.68); b.lineTo(W * 0.72, H); b.lineTo(W * 0.28, H); b.fill();
  }
  function baseSpace(b) {
    b.fillStyle = '#02030a'; b.fillRect(0, 0, W, H);
    const neb = (x, y, r, c) => { const g = b.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c); g.addColorStop(1, '#00000000'); b.fillStyle = g; b.fillRect(0, 0, W, H); };
    neb(W * 0.3, H * 0.25, W * 0.7, '#2a3a8a55'); neb(W * 0.8, H * 0.4, W * 0.6, '#6a2a8a40'); neb(W * 0.5, H * 0.1, W * 0.5, '#1a6a9a30');
    stars(b, Math.round(W * H / 900), 0, 0, W, H, 0.7);
    // 惑星の縁
    const R = W * 1.1, cx = W * 0.7, cy = H * 0.5 + R;
    let g = b.createRadialGradient(cx - R * 0.3, cy - R * 0.9, R * 0.2, cx, cy, R);
    g.addColorStop(0, '#3a6ab0'); g.addColorStop(0.6, '#10284a'); g.addColorStop(1, '#030812');
    b.fillStyle = g; b.beginPath(); b.arc(cx, cy, R, 0, Math.PI * 2); b.fill();
    b.save(); b.beginPath(); b.arc(cx, cy, R, 0, Math.PI * 2); b.clip();
    b.globalAlpha = 0.12; b.strokeStyle = '#bfe0ff';
    for (let i = 1; i < 8; i++) { b.lineWidth = rnd(2, 8); b.beginPath(); b.arc(cx, cy, R - i * 14, Math.PI * 1.1, Math.PI * 1.9); b.stroke(); }
    b.restore(); b.globalAlpha = 1;
    b.strokeStyle = '#8ac8ff'; b.lineWidth = 2; b.shadowColor = '#6ab0ff'; b.shadowBlur = 18;
    b.beginPath(); b.arc(cx, cy, R, Math.PI * 1.08, Math.PI * 1.75); b.stroke(); b.shadowBlur = 0;
  }
  function baseCrisis(b) {
    let g = b.createRadialGradient(W / 2, H * 0.28, 0, W / 2, H * 0.28, H * 0.8);
    g.addColorStop(0, '#5a0a2a'); g.addColorStop(0.4, '#2a0420'); g.addColorStop(1, '#040006');
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    stars(b, Math.round(W * H / 2500), 0, 0, W, H, 0.4);
    // 黒い太陽（ベースは本体のみ。コロナは毎フレーム）
    const r = Math.min(W, H) * 0.17, cx = W / 2, cy = H * 0.28;
    g = b.createRadialGradient(cx, cy, r, cx, cy, r * 3.2);
    g.addColorStop(0, '#ff406080'); g.addColorStop(0.3, '#a0205040'); g.addColorStop(1, '#00000000');
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    // 地平の廃墟
    b.fillStyle = '#080006';
    b.beginPath(); b.moveTo(0, H);
    let x = 0; while (x < W) { const h = rnd(H * 0.03, H * 0.12); b.lineTo(x, H * 0.82 - h); x += rnd(8, 30); b.lineTo(x, H * 0.82 - h); }
    b.lineTo(W, H); b.fill();
  }
  function baseBridge(b) {
    b.fillStyle = '#030810'; b.fillRect(0, 0, W, H);
    // 窓の外（宇宙）
    const vx = W * 0.06, vy = H * 0.07, vw = W * 0.88, vh = H * 0.42;
    b.fillStyle = '#01030a'; b.fillRect(vx, vy, vw, vh);
    // 艦橋の骨組み
    b.fillStyle = '#0c1828';
    b.fillRect(0, 0, W, vy); b.fillRect(0, vy + vh, W, H - vy - vh); b.fillRect(0, 0, vx, H); b.fillRect(vx + vw, 0, W - vx - vw, H);
    b.fillRect(W / 2 - 3, vy, 6, vh);
    b.strokeStyle = '#3a7ab0'; b.lineWidth = 1.5; b.strokeRect(vx, vy, vw, vh);
    b.strokeStyle = '#3a7ab040'; b.beginPath(); b.moveTo(vx, vy); b.lineTo(0, 0); b.moveTo(vx + vw, vy); b.lineTo(W, 0); b.moveTo(vx, vy + vh); b.lineTo(0, H * 0.62); b.moveTo(vx + vw, vy + vh); b.lineTo(W, H * 0.62); b.stroke();
    // 操作卓
    const g = b.createLinearGradient(0, H * 0.55, 0, H);
    g.addColorStop(0, '#13243a'); g.addColorStop(1, '#02060c');
    b.fillStyle = g;
    b.beginPath(); b.moveTo(0, H * 0.62); b.lineTo(W * 0.15, H * 0.55); b.lineTo(W * 0.85, H * 0.55); b.lineTo(W, H * 0.62); b.lineTo(W, H); b.lineTo(0, H); b.fill();
    b.strokeStyle = '#4ac0ff55'; b.beginPath(); b.moveTo(W * 0.15, H * 0.55); b.lineTo(W * 0.85, H * 0.55); b.stroke();
    // 卓上の表示
    b.globalAlpha = 0.35; b.strokeStyle = '#4ac0ff';
    for (let i = 0; i < 3; i++) { const x = W * (0.2 + i * 0.22); b.strokeRect(x, H * 0.58, W * 0.16, H * 0.05); b.beginPath(); for (let k = 0; k < 10; k++) b.lineTo(x + k * W * 0.016, H * 0.605 + Math.sin(k * 1.7 + i) * H * 0.012); b.stroke(); }
    b.globalAlpha = 1;
  }

  // ---------- 粒子 ----------
  function initParts() {
    parts = [];
    if (kind === 'palace') for (let i = 0; i < 40; i++) parts.push({ x: rnd(0, W), y: rnd(0, H), v: rnd(4, 14), s: rnd(0.8, 2.2), p: rnd(0, 6.28) });
    else if (kind === 'space') for (let i = 0; i < 90; i++) parts.push({ x: rnd(0, W), y: rnd(0, H), z: rnd(0.2, 1), p: rnd(0, 6.28) });
    else if (kind === 'crisis') for (let i = 0; i < 55; i++) parts.push({ x: rnd(0, W), y: rnd(0, H), v: rnd(10, 30), s: rnd(1, 2.6), p: rnd(0, 6.28) });
    else if (kind === 'bridge') {
      for (let i = 0; i < 70; i++) parts.push({ a: rnd(0, 6.28), d: rnd(0, 1), v: rnd(0.15, 0.5) });
      for (let i = 0; i < 26; i++) parts.push({ led: 1, x: rnd(W * 0.08, W * 0.92), y: rnd(H * 0.66, H * 0.96), c: ['#4ac0ff', '#ffb040', '#40ff90', '#ff4060'][i % 4], f: rnd(0.4, 2.5), p: rnd(0, 6.28) });
    }
  }

  function frame(now) {
    const t = (now - t0) / 1000, dt = 1 / 60;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(base, 0, 0, W, H);
    if (kind === 'palace') {
      // 揺れるシャンデリアの光
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18 + 0.06 * Math.sin(t * 2.1) + 0.03 * Math.sin(t * 7.3);
      ctx.fillStyle = '#ffcf80';
      ctx.beginPath(); ctx.arc(W / 2, H * 0.12, W * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5;
      for (const q of parts) {
        q.y -= q.v * dt; q.x += Math.sin(t * 0.8 + q.p) * 0.25;
        if (q.y < -4) { q.y = H + 4; q.x = rnd(0, W); }
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + q.p);
        ctx.fillStyle = '#ffd890'; ctx.fillRect(q.x, q.y, q.s, q.s);
      }
    } else if (kind === 'space') {
      ctx.globalCompositeOperation = 'lighter';
      // ゆっくり漂う星雲
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 0.3);
      const nx = W * (0.55 + 0.1 * Math.sin(t * 0.07)), ny = H * (0.3 + 0.05 * Math.cos(t * 0.05));
      const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, W * 0.5);
      g.addColorStop(0, '#5a3ab080'); g.addColorStop(1, '#00000000');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (const q of parts) {
        q.x -= q.z * q.z * 6 * dt; if (q.x < -2) { q.x = W + 2; q.y = rnd(0, H); }
        ctx.globalAlpha = q.z * (0.6 + 0.4 * Math.sin(t * 3 + q.p));
        ctx.fillStyle = '#e8f0ff'; const s = q.z * 1.8; ctx.fillRect(q.x, q.y, s, s);
      }
    } else if (kind === 'crisis') {
      const r = Math.min(W, H) * 0.17, cx = W / 2, cy = H * 0.28;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.4);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + 0.2 * pulse;
      ctx.fillStyle = '#ff2050';
      ctx.beginPath();
      for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, k = r * (1.18 + 0.12 * Math.sin(a * 7 + t * 1.3) + 0.08 * Math.sin(a * 13 - t * 2.1)); i ? ctx.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k) : ctx.moveTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k); }
      ctx.fill();
      ctx.globalAlpha = 0.6; ctx.strokeStyle = '#ffb0c0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.02, 0, Math.PI * 2); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      // 全体の脈動
      ctx.globalAlpha = 0.12 * pulse; ctx.fillStyle = '#6a0a50'; ctx.fillRect(0, 0, W, H);
      // 灰
      for (const q of parts) {
        q.y += q.v * dt; q.x += Math.sin(t + q.p) * 0.3 + 0.15;
        if (q.y > H + 3) { q.y = -3; q.x = rnd(0, W); }
        ctx.globalAlpha = 0.5; ctx.fillStyle = q.p > 5 ? '#ff6040' : '#8a7a80';
        ctx.fillRect(q.x, q.y, q.s, q.s * 0.7);
      }
      // ときどきのちらつき
      if (flick > 0) { flick--; ctx.globalAlpha = 0.18 * Math.random(); ctx.fillStyle = Math.random() < 0.5 ? '#fff' : '#000'; ctx.fillRect(0, 0, W, H); }
      else if (Math.random() < 0.004) flick = 4 + (Math.random() * 6 | 0);
    } else if (kind === 'bridge') {
      const vx = W * 0.06, vy = H * 0.07, vw = W * 0.88, vh = H * 0.42, cx = W / 2, cy = vy + vh / 2;
      ctx.save(); ctx.beginPath(); ctx.rect(vx, vy, vw, vh); ctx.clip();
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#cfe6ff'; ctx.lineCap = 'round';
      const M = Math.max(vw, vh) * 0.7;
      for (const q of parts) {
        if (q.led) continue;
        q.d += q.v * dt * (0.3 + q.d); if (q.d > 1) { q.d = 0.02; q.a = rnd(0, 6.28); }
        const c = Math.cos(q.a), s = Math.sin(q.a), d1 = q.d * M, d0 = Math.max(0, d1 - q.d * q.d * 60);
        ctx.globalAlpha = Math.min(1, q.d * 1.6); ctx.lineWidth = 0.6 + q.d * 1.4;
        ctx.beginPath(); ctx.moveTo(cx + c * d0, cy + s * d0 * 0.6); ctx.lineTo(cx + c * d1, cy + s * d1 * 0.6); ctx.stroke();
      }
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
      for (const q of parts) {
        if (!q.led) continue;
        const on = Math.sin(t * q.f * 3 + q.p) > -0.2;
        ctx.globalAlpha = on ? 0.9 : 0.15; ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, 4, 2.5);
      }
      // 窓の映り込み（スキャン線）
      ctx.globalAlpha = 0.07; ctx.fillStyle = '#4ac0ff';
      ctx.fillRect(vx, vy + ((t * 40) % vh), vw, 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function attach() {
    const el = document.getElementById('talk');
    if (!el) return null;
    if (cv.parentNode !== el || el.firstChild !== cv) el.insertBefore(cv, el.firstChild);
    return el;
  }
  function resize(el) {
    const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight;
    const d = Math.min(2, window.devicePixelRatio || 1);
    if (w !== W || h !== H || d !== dpr) {
      W = w; H = h; dpr = d;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    }
    buildBase();
  }
  function loop(now) {
    raf = 0;
    const el = document.getElementById('talk');
    if (!cv || !el || !el.classList.contains('show')) { stop(); return; }
    attach(); resize(el);
    frame(now);
    if (!reduced()) raf = requestAnimationFrame(loop);
    else setTimeout(() => { if (cv && !raf) raf = requestAnimationFrame(loop); }, 400); // 静止画のまま、付け直しだけ見張る
  }

  function start(bg) {
    try {
      css();
      const k = KINDS[bg] ? bg : 'space';
      if (!cv) { cv = document.createElement('canvas'); cv.className = 'talkfx'; ctx = cv.getContext('2d'); t0 = performance.now(); }
      if (k !== kind) { kind = k; baseKey = ''; }
      const el = attach();
      if (!el) return;
      resize(el);
      frame(performance.now());
      if (!raf) raf = requestAnimationFrame(loop);
    } catch (e) { console.warn('TalkFX', e); }
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
    cv = null; ctx = null; base = null; baseKey = ''; parts = []; W = H = 0;
  }
  return { start, stop };
})();
