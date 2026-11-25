// ============================================================
//  演出：タイトル背景・オープニング・エンディング・スタッフロール
//  （画像ファイルは使わず、すべて Canvas でその場で描く）
// ============================================================
const Cinema = (() => {
  const ease = k => k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k);
  const easeOut = k => k < 0 ? 0 : k > 1 ? 1 : 1 - Math.pow(1 - k, 3);
  const fade = (t, a, b, f = 1) => t < a || t > b ? 0 : Math.min(1, (t - a) / f, (b - t) / f);
  function fit(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), r = cv.getBoundingClientRect();
    cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr);
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, W: r.width, H: r.height };
  }
  // 星の層（奥行き）
  function makeStars(n, seed) { const r = Art.srand(seed); return Array.from({ length: n }, () => ({ x: r() * 2 - 1, y: r() * 2 - 1, z: r(), b: r() })); }
  function starfield(c, W, H, stars, t, speed = 0.05, warp = 0) {
    for (const s of stars) {
      let z = ((s.z - t * speed) % 1 + 1) % 1;
      const k = 1 / (0.05 + z), x = W / 2 + s.x * W * 0.5 * k * 0.3, y = H / 2 + s.y * H * 0.5 * k * 0.3;
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const a = Math.min(1, (1 - z) * 1.4) * (0.4 + s.b * 0.6);
      const sz = (1 - z) * 2 + 0.3;
      if (warp > 0) {
        const k2 = 1 / (0.05 + z + warp * 0.05), x2 = W / 2 + s.x * W * 0.5 * k2 * 0.3, y2 = H / 2 + s.y * H * 0.5 * k2 * 0.3;
        c.strokeStyle = `rgba(200,225,255,${a})`; c.lineWidth = sz; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
      } else { c.fillStyle = `rgba(210,230,255,${a})`; c.fillRect(x, y, sz, sz); }
    }
  }
  // ---------- 字幕（文字は Canvas に描かず、上に重ねた HTML で出す） ----------
  //  Safari の Canvas の文字（字間など）に左右されないように。
  //  毎フレーム「いま見せる文」を集め、同じ文の要素は使い回す。
  let capEl = null; const capPool = new Map(); let capUsed = new Set();
  function capBegin(el) { capEl = el; capUsed = new Set(); }
  function capEnd() { for (const [k, d] of capPool) if (!capUsed.has(k)) { d.remove(); capPool.delete(k); } }
  function capClear() { capPool.forEach(d => d.remove()); capPool.clear(); capUsed = new Set(); }
  function putCap(s, x, y, size, a, opt, maxW) {
    if (!capEl || a <= 0.01 || !s) return;
    let key = s, n = 0;
    while (capUsed.has(key)) key = s + '#' + (++n);
    capUsed.add(key);
    let d = capPool.get(key);
    if (!d) { d = document.createElement('div'); d.className = 'cap'; d.textContent = s; capEl.appendChild(d); capPool.set(key, d); }
    const ls = opt.ls || 0, glow = opt.glow || 'rgba(120,180,255,.8)', blur = opt.blur ?? 12;
    const clip = opt.clip !== undefined ? `clip-path:inset(-40% ${Math.max(0, (1 - opt.clip) * 100)}% -40% -10%);-webkit-clip-path:inset(-40% ${Math.max(0, (1 - opt.clip) * 100)}% -40% -10%);` : '';
    d.style.cssText = `left:${x}px;top:${y}px;font-size:${size}px;opacity:${Math.min(1, a)};color:${opt.col || '#eef4ff'};font-weight:${opt.w || 600};`
      + `letter-spacing:${ls}px;padding-left:${ls}px;text-shadow:0 0 ${blur}px ${glow},0 0 ${Math.round(blur / 3)}px ${glow},0 1px 3px #000;`
      + (maxW ? `width:${Math.round(maxW)}px;white-space:normal;` : 'white-space:nowrap;') + clip;
  }
  function textC(c, s, x, y, size, a, opt = {}) { putCap(s, x, y, size, a, opt, null); }
  function textBlock(c, s, x, y, size, a, maxW, opt = {}) { putCap(s, x, y, size, a, opt, maxW || null); }
  // 艦隊のシルエット
  function fleet(c, cx, cy, n, ang, L, col, seed, spread = 1) {
    const r = Art.srand(seed);
    for (let i = 0; i < n; i++) {
      const dx = (r() - 0.5) * 160 * spread, dy = (r() - 0.5) * 90 * spread, s = 0.5 + r() * 0.9;
      Art.ship(c, ['dd', 'cl', 'bb', 'cl', 'dd', 'cv'][i % 6], cx + dx, cy + dy, ang, L * s, col);
    }
  }
  // 蝕（黒い円と紅い光冠）
  function eclipse(c, x, y, r, k, t) {
    const g = c.createRadialGradient(x, y, r * 0.9, x, y, r * (2.2 + Math.sin(t * 1.3) * 0.1));
    g.addColorStop(0, `rgba(255,40,100,${0.7 * k})`); g.addColorStop(0.3, `rgba(255,60,90,${0.25 * k})`); g.addColorStop(1, 'rgba(255,30,80,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.4, 0, 7); c.fill();
    for (let i = 0; i < 14; i++) {
      const a = i * Math.PI / 7 + t * 0.08, L = r * (1.3 + Math.sin(t * 2 + i * 1.7) * 0.25);
      c.strokeStyle = `rgba(255,80,130,${0.35 * k})`; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.quadraticCurveTo(x + Math.cos(a + 0.2) * L, y + Math.sin(a + 0.2) * L, x + Math.cos(a + 0.35) * L * 1.1, y + Math.sin(a + 0.35) * L * 1.1); c.stroke();
    }
    c.fillStyle = '#000'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  // 航路門
  function gate(c, x, y, r, k, t) {
    c.save(); c.translate(x, y);
    for (let i = 0; i < 3; i++) {
      c.strokeStyle = `rgba(140,200,255,${(0.5 - i * 0.12) * k})`; c.lineWidth = 6 - i * 2;
      c.beginPath(); c.ellipse(0, 0, r * (1 + i * 0.08), r * 0.32 * (1 + i * 0.08), 0, 0, 7); c.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8 + t * 0.4;
      c.fillStyle = `rgba(220,240,255,${0.8 * k})`;
      c.fillRect(Math.cos(a) * r - 2, Math.sin(a) * r * 0.32 - 2, 4, 4);
    }
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(255,255,255,${0.9 * k * k})`); g.addColorStop(0.4, `rgba(140,200,255,${0.4 * k})`); g.addColorStop(1, 'rgba(80,120,255,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, r, r * 0.32, 0, 0, 7); c.fill();
    c.restore();
  }

  // ---------------- 共通の飾り（静的な層はキャッシュ） ----------------
  // 渦巻銀河の一枚絵（色 col の腕）。回すだけで動いて見える
  const galCache = new Map();
  function galaxyCanvas(size, seed, col, col2) {
    const key = size + '|' + seed + '|' + col + '|' + col2;
    if (galCache.has(key)) return galCache.get(key);
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const c = cv.getContext('2d'), R = size / 2, r = Art.srand(seed);
    c.globalCompositeOperation = 'lighter';
    // 核
    const g = c.createRadialGradient(R, R, 0, R, R, R * 0.35);
    g.addColorStop(0, 'rgba(255,248,230,.9)'); g.addColorStop(0.25, Art.hexA(col2, 0.45)); g.addColorStop(1, Art.hexA(col, 0));
    c.fillStyle = g; c.fillRect(0, 0, size, size);
    // 腕（4本の対数螺旋に沿った星と靄）
    const arms = 4;
    for (let i = 0; i < 5200; i++) {
      const arm = i % arms, d = Math.pow(r(), 0.7);
      const th = arm * Math.PI * 2 / arms + d * 5.2 + (r() - 0.5) * (0.5 + (1 - d) * 0.6);
      const rr = d * R * 0.96, x = R + Math.cos(th) * rr, y = R + Math.sin(th) * rr;
      const big = r() < 0.06;
      if (big) {
        const gg = c.createRadialGradient(x, y, 0, x, y, 6 + r() * 10);
        gg.addColorStop(0, Art.hexA(r() < 0.5 ? col : col2, 0.12)); gg.addColorStop(1, Art.hexA(col, 0));
        c.fillStyle = gg; c.beginPath(); c.arc(x, y, 16, 0, 7); c.fill();
      } else {
        const w = r() < 0.2 ? '255,255,255' : null;
        c.fillStyle = w ? `rgba(${w},${0.35 + r() * 0.5})` : Art.hexA(r() < 0.6 ? col2 : col, 0.25 + r() * 0.5);
        const sz = 0.6 + r() * 1.3; c.fillRect(x, y, sz, sz);
      }
    }
    galCache.set(key, cv);
    return cv;
  }
  // 光のにじみ（加算の円）
  function bloom(c, x, y, r, col, a) {
    if (a <= 0.01 || r <= 0) return;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.25, Art.hexA(col, a * 0.6)); g.addColorStop(1, Art.hexA(col, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  // 花火（時間 t から決定的に描く：毎フレーム同じ結果）
  function fireworks(c, W, H, t, cols, rate = 1.2, yMax = 0.6, seed = 1) {
    const life = 2.6, step = 1 / rate;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let n = Math.floor((t - life) / step); n <= Math.floor(t / step); n++) {
      if (n < 0) continue;
      const r = Art.srand(n * 977 + seed), born = n * step + r() * step * 0.8, k = (t - born) / life;
      if (k < 0 || k > 1) continue;
      const x = W * (0.12 + r() * 0.76), y = H * (0.08 + r() * (yMax - 0.08)), col = cols[Math.floor(r() * cols.length)];
      const R = Math.min(W, H) * (0.12 + r() * 0.14), N = 26 + Math.floor(r() * 18), e = easeOut(k * 1.6);
      const a = Math.pow(1 - k, 1.5);
      if (k < 0.12) bloom(c, x, y, R * 0.7, col, (1 - k / 0.12) * 0.8);
      bloom(c, x, y + k * k * R * 0.3, R * 1.1 * e, col, 0.16 * a);
      // 尾を引く火の粉（一本のパスにまとめて描く）
      const e2 = easeOut(Math.max(0, k * 1.6 - 0.12)), sag = k * k * R * 0.5, sag2 = Math.max(0, k - 0.08) ** 2 * R * 0.5;
      c.strokeStyle = Art.hexA(col, a * 0.8); c.lineWidth = 1 + (1 - k) * 1.4; c.lineCap = 'round';
      c.beginPath();
      const ps = [];
      for (let i = 0; i < N; i++) {
        const an = i / N * Math.PI * 2 + r() * 0.1, cs = Math.cos(an), sn = Math.sin(an);
        const px = x + cs * R * e, py = y + sn * R * e + sag; ps.push(px, py);
        c.moveTo(x + cs * R * e2, y + sn * R * e2 + sag2); c.lineTo(px, py);
      }
      c.stroke();
      c.fillStyle = `rgba(255,250,235,${a})`;
      const sz = 1.4 + (1 - k) * 2;
      for (let i = 0; i < ps.length; i += 2) if ((i / 2 + n) % 3 || k < 0.7 || Math.sin(t * 30 + i) > 0) c.fillRect(ps[i] - sz / 2, ps[i + 1] - sz / 2, sz, sz);
    }
    c.restore();
  }
  // 流れ星
  function shootingStars(c, W, H, t, seed = 5) {
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    for (let n = Math.floor(t / 2.2) - 1; n <= Math.floor(t / 2.2); n++) {
      if (n < 0) continue;
      const r = Art.srand(n * 131 + seed), born = n * 2.2 + r() * 2, k = (t - born) / 0.9;
      if (k < 0 || k > 1 || r() < 0.3) continue;
      const x0 = W * (0.1 + r() * 0.9), y0 = H * r() * 0.45, ang = Math.PI * (0.72 + r() * 0.12), L = 60 + r() * 90, sp = W * 0.6;
      const x = x0 + Math.cos(ang) * sp * k, y = y0 + Math.sin(ang) * sp * k, a = Math.sin(k * Math.PI);
      const gr = c.createLinearGradient(x, y, x - Math.cos(ang) * L, y - Math.sin(ang) * L);
      gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(160,200,255,0)');
      c.strokeStyle = gr; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, y); c.lineTo(x - Math.cos(ang) * L, y - Math.sin(ang) * L); c.stroke();
    }
    c.restore();
  }
  // 黒い太陽（大きな蝕と光冠）。光冠はキャッシュした画像を回す
  let coronaCv = null;
  function coronaSprite() {
    if (coronaCv) return coronaCv;
    const S = 512, R = S / 2, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d'), r = Art.srand(42); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(R, R, R * 0.2, R, R, R);
    g.addColorStop(0, 'rgba(255,230,240,.9)'); g.addColorStop(0.24, 'rgba(255,90,140,.55)'); g.addColorStop(0.45, 'rgba(200,40,120,.18)'); g.addColorStop(1, 'rgba(120,20,90,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, L = R * (0.3 + r() * 0.65), w = 0.01 + r() * 0.03;
      const gg = c.createRadialGradient(R, R, R * 0.2, R, R, L);
      gg.addColorStop(0, `rgba(255,${150 + r() * 80},${180 + r() * 60},.35)`); gg.addColorStop(1, 'rgba(255,60,120,0)');
      c.fillStyle = gg; c.beginPath(); c.moveTo(R, R); c.arc(R, R, L, a - w, a + w); c.closePath(); c.fill();
    }
    coronaCv = cv; return cv;
  }
  function blackSun(c, x, y, r, k, t) {
    const sp = coronaSprite(), s = r * 4.6 * (1 + Math.sin(t * 0.7) * 0.02);
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = k;
    c.translate(x, y); c.rotate(t * 0.02); c.drawImage(sp, -s / 2, -s / 2, s, s);
    c.rotate(-t * 0.05); c.globalAlpha = k * 0.5; c.drawImage(sp, -s * 0.4, -s * 0.4, s * 0.8, s * 0.8);
    c.restore();
    // 縁の細い光（ダイヤモンドリング風）
    c.save(); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = `rgba(255,220,235,${0.8 * k})`; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, r * 1.01, 0, 7); c.stroke();
    const da = -Math.PI * 0.25 + Math.sin(t * 0.2) * 0.3;
    bloom(c, x + Math.cos(da) * r, y + Math.sin(da) * r, r * 0.5, '#ffd0e0', 0.7 * k);
    c.restore();
    c.fillStyle = '#000'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }

  // ---------------- タイトル背景 ----------------
  let titleRaf = null;
  function title() {
    stopTitle();
    const cv = document.getElementById('titlecv');
    let { c, W, H } = fit(cv);
    const neb = Art.nebulaCanvas(420, 760, 777, [230, 270, 330, 200], { alpha: 0.1, stars: 500 });
    // 手前を漂う靄（縁の柔らかい色の雲をひとつの画像に）
    const neb2 = document.createElement('canvas'); neb2.width = 256; neb2.height = 256;
    { const q = neb2.getContext('2d'), r = Art.srand(4242); q.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) { const x = 40 + r() * 176, y = 40 + r() * 176, rr = 20 + r() * 50, h = [300, 200, 330, 260][i % 4];
        const g = q.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, `hsla(${h},80%,60%,.10)`); g.addColorStop(1, `hsla(${h},80%,50%,0)`);
        q.fillStyle = g; q.beginPath(); q.arc(x, y, rr, 0, 7); q.fill(); } }
    const gal = galaxyCanvas(640, 77, '#6a7cff', '#c8b0ff');
    const stars = makeStars(260, 3);
    const t0 = performance.now();
    const onR = () => ({ c, W, H } = fit(cv));
    window.addEventListener('resize', onR);
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      const M = Math.min(W, H);
      c.fillStyle = '#01020a'; c.fillRect(0, 0, W, H);
      // 奥：星雲（ゆっくり視差）
      const z = 1.1 + Math.sin(t * 0.05) * 0.04;
      c.drawImage(neb, -W * (z - 1) / 2 + Math.sin(t * 0.03) * 10, -H * (z - 1) / 2, W * z, H * z);
      starfield(c, W, H, stars, t, 0.012);
      // 渦巻銀河（傾けて、ゆっくり回す）
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.75 * ease(t / 3);
      c.translate(W * 0.5 + Math.sin(t * 0.04) * 14, H * 0.5 + Math.cos(t * 0.05) * 8); c.rotate(-0.35); c.scale(1, 0.42); c.rotate(t * 0.025);
      const gs = M * 1.9; c.drawImage(gal, -gs / 2, -gs / 2, gs, gs);
      c.restore();
      // 手前を漂う星雲（逆向きの視差）
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const sp = 5 + i * 3, ww = W * (1.1 + i * 0.3), xx = ((t * sp + i * W * 0.7) % (W + ww)) - ww, yy = H * (0.05 + i * 0.3) + Math.sin(t * 0.1 + i) * 20;
        c.globalAlpha = 0.8; c.drawImage(neb2, W - xx - ww, yy, ww, ww * 0.8);
      }
      c.restore();
      shootingStars(c, W, H, t);
      // 黒い太陽が題字の後ろから昇る
      const sunY = H * 0.31 + (1 - easeOut(t / 7)) * H * 0.22, sunR = M * 0.16;
      // 紋章が太陽のまわりを巡る（奥側）
      const orb = (front) => FACTIONS.forEach((F, i) => {
        const an = t * 0.12 + i * Math.PI / 3, sn = Math.sin(an);
        if ((sn > 0) !== front) return;
        const x = W / 2 + Math.cos(an) * M * 0.44, y = sunY + sn * M * 0.12, d = 0.65 + sn * 0.35;
        c.save(); c.globalAlpha = (front ? 0.6 : 0.35 + d * 0.4) * ease((t - 1.5 - i * 0.3) / 1.5);
        bloom(c, x, y, M * 0.07 * d, F.col, 0.35);
        Art.emblem(c, F.emblem, x, y, M * 0.036 * d, F.col, F.col2);
        c.restore();
      });
      orb(false);
      blackSun(c, W / 2, sunY, sunR, ease(t / 2.5), t);
      orb(true);
      // 惑星の地平
      const pr = W * 1.4;
      const g = c.createRadialGradient(W / 2, H + pr * 0.82, pr * 0.9, W / 2, H + pr * 0.82, pr * 1.05);
      g.addColorStop(0, 'rgba(60,120,220,.0)'); g.addColorStop(0.8, 'rgba(90,160,255,.35)'); g.addColorStop(1, 'rgba(90,160,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(W / 2, H + pr * 0.82, pr * 1.05, 0, 7); c.fill();
      c.fillStyle = '#02040c'; c.beginPath(); c.arc(W / 2, H + pr * 0.82, pr * 0.92, 0, 7); c.fill();
      // 横切る艦隊
      const fx = ((t * 18) % (W + 400)) - 200;
      fleet(c, fx, H * 0.62, 7, Math.PI / 2, 16, '#7a90b8', 21, 0.8);
      titleRaf = requestAnimationFrame(loop);
    };
    titleRaf = requestAnimationFrame(loop);
    title._off = () => window.removeEventListener('resize', onR);
  }
  function stopTitle() { if (titleRaf) cancelAnimationFrame(titleRaf); titleRaf = null; if (title._off) title._off(); }

  // ---------------- 汎用の再生器 ----------------
  let playing = null;   // 再生中の映像（二重に始まらないように）
  function play(screenId, cvId, dur, drawFn, opt = {}) {
    if (playing) playing();   // 前の再生を黙って止める
    return new Promise(res => {
      UI.show(screenId);
      const scr = document.getElementById(screenId), cv = document.getElementById(cvId);
      const capLayer = scr.querySelector('.cine-cap');
      capClear();
      let { c, W, H } = fit(cv);
      const onR = () => ({ c, W, H } = fit(cv));
      window.addEventListener('resize', onR);
      const t0 = performance.now();
      let raf = null, done = false, skipT = 0;
      const stop = () => { if (done) return false; done = true; cancelAnimationFrame(raf); window.removeEventListener('resize', onR); scr.querySelector('.skip').onclick = null; scr.onclick = null; capClear(); if (playing === stop) playing = null; return true; };
      const end = () => { if (stop()) res(); };
      playing = () => { if (stop()) res(); };   // 次の映像に替わる時も、待っている側を止めたままにしない
      const skip = scr.querySelector('.skip');
      skip.onclick = e => { e.stopPropagation(); Sound.se('click'); end(); };
      if (opt.tap) scr.onclick = () => { skipT += opt.tap(((performance.now() - t0) / 1000) + skipT) || 0; };
      const loop = () => {
        const t = (performance.now() - t0) / 1000 + skipT;
        if (t >= dur) { end(); return; }
        c.setTransform(Math.min(2, window.devicePixelRatio || 1), 0, 0, Math.min(2, window.devicePixelRatio || 1), 0, 0);
        capBegin(capLayer);
        drawFn(c, W, H, t);
        capEnd();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
  }

  // ---------------- オープニング ----------------
  function opening() {
    stopTitle();
    Sound.bgm('title');
    const neb = Art.nebulaCanvas(480, 860, 2024, [220, 260, 300, 190], { alpha: 0.11, stars: 700 });
    const neb2 = Art.nebulaCanvas(480, 860, 9, [10, 340, 20], { alpha: 0.08, stars: 300 });
    const stars = makeStars(380, 11);
    const hits = new Set();
    const hit = (t, at, kind = 'timp') => { if (t >= at && !hits.has(at)) { hits.add(at); if (Sound.ctx) Sound.drum(Sound.ctx.currentTime + 0.01, kind, 1.2); } };
    const D = 84;
    return play('opening', 'opcv', D, (c, W, H, t) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      const M = Math.min(W, H);
      // ---- 1. 闇と語り（0〜9）
      if (t < 10) {
        starfield(c, W, H, stars, t, 0.01);
        textC(c, '宇宙暦三〇一二年。', W / 2, H * 0.42, 20, fade(t, 1, 5.2, 1.2));
        textC(c, '人類が星の海へ漕ぎ出して、千年。', W / 2, H * 0.52, 17, fade(t, 4.6, 9.6, 1.2));
      }
      // ---- 2. 星雲を進む（9〜19）
      if (t >= 9 && t < 20) {
        const k = (t - 9) / 11, a = fade(t, 9, 20, 1.5);
        c.globalAlpha = a;
        const z = 1 + k * 0.5;
        c.drawImage(neb, -W * (z - 1) / 2, -H * (z - 1) / 2 - k * 40, W * z, H * z);
        // 渦巻銀河の上をカメラが流れる
        const gal = galaxyCanvas(512, 77, '#6a8cff', '#ffd9a0'), gs = M * (1.5 + k * 0.9);
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * 0.85;
        c.translate(W * (0.75 - k * 0.5), H * (0.35 + k * 0.2)); c.scale(1, 0.62); c.rotate(-0.5 + t * 0.03);
        c.drawImage(gal, -gs / 2, -gs / 2, gs, gs); c.restore();
        c.globalAlpha = 1;
        starfield(c, W, H, stars, t, 0.08 + k * 0.1, k > 0.8 ? (k - 0.8) * 5 : 0);
        textBlock(c, '星と星とを結ぶ「航路門」の網の上に、', W / 2, H * 0.78, 16, fade(t, 10.5, 15, 1));
        textBlock(c, '六つの国が並び立っていた。', W / 2, H * 0.78, 18, fade(t, 15, 19.5, 1));
      }
      // ---- 3. 航路門と六つの国（19〜37）
      if (t >= 19 && t < 37.5) {
        const a = fade(t, 19, 37.5, 1);
        c.globalAlpha = a * 0.7; c.drawImage(neb, 0, 0, W, H); c.globalAlpha = 1;
        starfield(c, W, H, stars, t, 0.02);
        const gk = easeOut((t - 19.5) / 3);
        hit(t, 20);
        gate(c, W / 2, H * 0.5, M * 0.42 * gk, a * gk, t);
        // 紋章を順に
        FACTIONS.forEach((F, i) => {
          const at = 22.5 + i * 2.2;
          const k = easeOut((t - at) / 0.8);
          if (t < at) return;
          hit(t, at, 'kick');
          const ang = -Math.PI / 2 + i * Math.PI / 3;
          const R0 = M * 0.33;
          const x = W / 2 + Math.cos(ang) * R0, y = H * 0.5 + Math.sin(ang) * R0 * 1.25;
          c.save(); c.globalAlpha = a * k;
          const g = c.createRadialGradient(x, y, 0, x, y, M * 0.12); g.addColorStop(0, Art.hexA(F.col, 0.5)); g.addColorStop(1, Art.hexA(F.col, 0));
          c.fillStyle = g; c.beginPath(); c.arc(x, y, M * 0.12, 0, 7); c.fill();
          Art.emblem(c, F.emblem, x, y, M * 0.07 * (0.6 + k * 0.4), F.col, F.col2);
          c.restore();
          // 中心の門へ伸びる光の航路
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * k * 0.5;
          c.strokeStyle = F.col; c.lineWidth = 1.2; c.setLineDash([4, 6]); c.lineDashOffset = -t * 20;
          c.beginPath(); c.moveTo(x, y); c.lineTo(W / 2 + (x - W / 2) * (1 - k), H * 0.5 + (y - H * 0.5) * (1 - k)); c.stroke(); c.restore();
          if (t < at + 1.2) bloom(c, x, y, M * 0.2 * (1 - (t - at) / 1.2), F.col, a * 0.6 * (1 - (t - at) / 1.2));
          const ta = a * fade(t, at, at + 2.2, 0.35);
          textC(c, F.name, W / 2, H * 0.5, 22, ta, { glow: F.col, blur: 18 });
          textC(c, '「' + F.motto + '」', W / 2, H * 0.5 + 30, 13, ta * 0.9, { col: F.col2 });
        });
        if (t > 36) { c.fillStyle = `rgba(255,255,255,${(t - 36) / 1.5})`; c.fillRect(0, 0, W, H); }
      }
      // ---- 4. 艦隊戦（37.5〜52）
      if (t >= 37.5 && t < 52.5) {
        const k = (t - 37.5) / 15, a = fade(t, 37.5, 52.5, 0.6);
        c.globalAlpha = a; c.drawImage(neb2, 0, 0, W, H); c.globalAlpha = 1;
        starfield(c, W, H, stars, t, 0.03);
        const ax = -W * 0.1 + easeOut(k * 1.6) * W * 0.38, bx = W * 1.1 - easeOut(k * 1.6) * W * 0.38;
        fleet(c, ax, H * 0.42, 12, Math.PI / 2, 22, '#e0483c', 5, 1.4);
        fleet(c, bx, H * 0.58, 12, -Math.PI / 2, 22, '#4a90e8', 6, 1.4);
        if (k > 0.3) {
          const r = Art.srand(Math.floor(t * 12));
          c.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 9; i++) {
            const x1 = ax + (r() - 0.5) * 160, y1 = H * 0.42 + (r() - 0.5) * 90, x2 = bx + (r() - 0.5) * 160, y2 = H * 0.58 + (r() - 0.5) * 90;
            const red = r() < 0.5;
            c.strokeStyle = red ? 'rgba(255,140,110,.8)' : 'rgba(120,220,255,.8)'; c.lineWidth = 1.5 + r() * 2;
            c.beginPath(); if (red) { c.moveTo(x1, y1); c.lineTo(x2, y2); } else { c.moveTo(x2, y2); c.lineTo(x1, y1); } c.stroke();
          }
          for (let i = 0; i < 4; i++) {
            const x = (ax + bx) / 2 + (r() - 0.5) * W * 0.6, y = H / 2 + (r() - 0.5) * H * 0.3, rr = 8 + r() * 30;
            const g = c.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, 'rgba(255,240,200,.9)'); g.addColorStop(0.5, 'rgba(255,140,60,.5)'); g.addColorStop(1, 'rgba(255,60,20,0)');
            c.fillStyle = g; c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill();
          }
          c.globalCompositeOperation = 'source-over';
          if (Math.random() < 0.08 && Sound.ctx) Sound.se('boom');
        }
        hit(t, 42); hit(t, 46);
        textBlock(c, '誇りのために。利のために。信仰のために。', W / 2, H * 0.14, 16, fade(t, 39, 45, 1));
        textBlock(c, '人は、星の海でも争いをやめなかった。', W / 2, H * 0.86, 17, fade(t, 45, 52, 1));
      }
      // ---- 5. 蝕の予兆（52.5〜66）
      if (t >= 52.5 && t < 66.5) {
        const k = (t - 52.5) / 14, a = fade(t, 52.5, 66.5, 1);
        starfield(c, W, H, stars, t, 0.004);
        const sx = W / 2, sy = H * 0.42;
        // 遠い星
        const sg = c.createRadialGradient(sx, sy, 0, sx, sy, M * 0.18);
        sg.addColorStop(0, `rgba(255,250,230,${a})`); sg.addColorStop(0.15, `rgba(255,220,160,${a * 0.6})`); sg.addColorStop(1, 'rgba(255,180,100,0)');
        c.fillStyle = sg; c.beginPath(); c.arc(sx, sy, M * 0.18, 0, 7); c.fill();
        // 影が覆う
        const cover = ease((k - 0.25) / 0.55);
        // 周りの星が、ひとつずつ消える
        const rr = Art.srand(303);
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 26; i++) {
          const px = rr() * W, py = rr() * H * 0.9, off = 56 + rr() * 9, col = rr() < 0.5 ? '#bcd8ff' : '#ffe0b0';
          const life = t < off ? 1 : Math.max(0, 1 - (t - off) / 0.35);
          if (t >= off && t < off + 0.35) bloom(c, px, py, 14, '#ff4080', 0.5 * (1 - (t - off) / 0.35));
          if (life > 0) bloom(c, px, py, 5 + 3 * Math.sin(t * 3 + i), col, a * life * 0.8);
        }
        c.restore();
        if (cover > 0) blackSun(c, sx + (1 - cover) * M * 0.35, sy - (1 - cover) * M * 0.1, M * 0.06 + cover * M * 0.02, cover * a, t);
        hit(t, 61, 'timp');
        textBlock(c, 'だが、誰も気づいていなかった。', W / 2, H * 0.72, 16, fade(t, 54, 59, 1));
        textBlock(c, '遠い星が、ひとつ、またひとつと――', W / 2, H * 0.72, 16, fade(t, 59, 63, 0.8));
        textBlock(c, '消えていくことに。', W / 2, H * 0.72, 19, fade(t, 63, 66.3, 0.6), W * 0.9, { col: '#ffb0c0', glow: 'rgba(255,40,100,.9)' });
      }
      // ---- 6. 題字（66.5〜84）
      if (t >= 66.5) {
        const k = t - 66.5;
        c.globalAlpha = Math.min(1, k / 2) * 0.8; c.drawImage(neb, 0, 0, W, H); c.globalAlpha = 1;
        starfield(c, W, H, stars, t, 0.01);
        eclipse(c, W * 0.5, H * 0.24, M * 0.05, Math.min(1, k / 3) * 0.8, t);
        hit(t, 67.5); hit(t, 68.2, 'crash');
        // 光の筆で書かれる題字
        const size = Math.min(W / 6, 80);
        const reveal = easeOut((k - 0.8) / 3.2);
        textC(c, CONFIG.title, W / 2, H * 0.5, size, reveal > 0 ? 1 : 0, { w: 800, glow: 'rgba(120,190,255,1)', blur: 30, ls: size * 0.12, col: '#ffffff', clip: reveal });
        // 筆の光（題字の左端から右端へ）
        const tw = size * CONFIG.title.length * 1.12;
        if (reveal > 0 && reveal < 1) {
          const x = W / 2 - tw / 2 + tw * reveal; const g = c.createRadialGradient(x, H * 0.5, 0, x, H * 0.5, size * 0.9);
          g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.3, 'rgba(150,210,255,.5)'); g.addColorStop(1, 'rgba(80,140,255,0)');
          c.fillStyle = g; c.beginPath(); c.arc(x, H * 0.5, size * 0.9, 0, 7); c.fill();
        }
        textC(c, '― ' + CONFIG.sub + ' ―', W / 2, H * 0.5 + size * 1.25, Math.min(16, W / 24), ease((k - 4) / 2), { ls: 6, col: '#cfe2ff' });
        // 線
        const lk = ease((k - 3.5) / 2);
        c.strokeStyle = `rgba(180,210,255,${lk * 0.6})`; c.lineWidth = 1;
        c.beginPath(); c.moveTo(W / 2 - W * 0.38 * lk, H * 0.5 + size * 0.9); c.lineTo(W / 2 + W * 0.38 * lk, H * 0.5 + size * 0.9); c.stroke();
        if (k > 15) { c.fillStyle = `rgba(0,0,0,${(k - 15) / 2.5})`; c.fillRect(0, 0, W, H); }
      }
    }, { tap: t => t < 66 ? 0 : 0 });
  }

  // ---------------- 蝕の襲来（その時まで、プレイヤーには知らせない） ----------------
  function eclipseArrival(phase = 'first', cycle = 1) {
    Sound.stopBgm();
    const TX = {
      first: { pre: '異常な重力波を観測――', title: '蝕、来たる', sub: '― ECLIPSE ―', line: '星を喰らうものが、来た。', n: 1 },
      great: { pre: '銀河の三方で、同時に重力波――', title: '大蝕', sub: '― THE GREAT ECLIPSE ―', line: 'あれは、先触れにすぎなかった。', n: 3 },
      ret: { pre: '閉じたはずの裂け目が、ふたたび――', title: '再蝕', sub: `― ECLIPSE RETURNS・${cycle}度目 ―`, line: '根を断たぬかぎり、蝕は何度でも来る。', n: Math.min(4, 1 + cycle) },
    }[phase] || {};
    const stars = makeStars(320, 66);
    const neb = Art.nebulaCanvas(420, 760, 404, [230, 260], { alpha: 0.07, stars: 400 });
    const hits = new Set();
    const at = (t, k, fn) => { if (t >= k && !hits.has(k)) { hits.add(k); fn(); } };
    const br = Art.srand(717), bright = Array.from({ length: 20 }, () => ({ x: br(), y: br() * 0.9, s: br() }));
    const swarm = Array.from({ length: 70 * Math.min(3, TX.n || 1) }, (_, i) => { const r = Art.srand(i * 13 + 5); r(); r(); return { a: i * 2.39996 + r() * 0.3, sp: 0.4 + r() * 1.2, d: r() * 0.4, s: 6 + r() * 14, h: r() < 0.8 ? 'spore' : 'maw' }; });
    return play('opening', 'opcv', 17, (c, W, H, t) => {
      const M = Math.min(W, H), cx = W / 2, cy = H * 0.42;
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      // 1. いつもの静かな宇宙（0〜2.5）……のはずが
      const shake = t > 2.5 && t < 8 ? (Math.random() - 0.5) * (t > 4.5 && t < 6 ? 18 : 10) * (1 - (t - 2.5) / 5.5) : 0;
      c.save(); c.translate(shake, shake * 0.6);
      c.globalAlpha = t < 2.5 ? 1 : Math.max(0.25, 1 - (t - 2.5) / 3); c.drawImage(neb, 0, 0, W, H); c.globalAlpha = 1;
      starfield(c, W, H, stars, t, 0.01);
      // 明るい星が、ひとつずつ消えていく
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < bright.length; i++) {
        const b = bright[i], off = 0.5 + i * 0.13, L = t < off ? 1 : Math.max(0, 1 - (t - off) / 0.25);
        if (L > 0) bloom(c, b.x * W, b.y * H, 4 + b.s * 5, '#cfe0ff', L * 0.9);
        else if (t < off + 0.6) bloom(c, b.x * W, b.y * H, 10, '#ff2a6a', 0.4 * (1 - (t - off - 0.25) / 0.35));
      }
      c.restore();
      if (t < 2.6) textC(c, TX.pre, W / 2, H * 0.82, 15, fade(t, 0.4, 2.6, 0.4), { col: '#ffb0b0', glow: 'rgba(255,60,60,.8)' });
      // 2. 宇宙に亀裂（2.5〜5）
      if (t >= 2.5) {
        at(t, 2.5, () => { Sound.se('alarm'); if (Sound.ctx) Sound.drum(Sound.ctx.currentTime + 0.01, 'timp', 1.4); });
        const k = easeOut((t - 2.5) / 2);
        c.strokeStyle = `rgba(255,60,120,${0.9})`; c.lineWidth = 2 + k * 3; c.shadowColor = '#ff2a6a'; c.shadowBlur = 20;
        c.beginPath();
        const r = Art.srand(9);
        for (let i = 0; i <= 12; i++) { const x = cx + (i / 12 - 0.5) * W * 1.1 * k, y = cy + (r() - 0.5) * 40 * k; i ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.stroke(); c.shadowBlur = 0;
      }
      // 3. 裂け目が開く（4.5〜）
      if (t >= 4.5) {
        at(t, 4.5, () => { Sound.se('bigboom'); if (Sound.ctx) Sound.drum(Sound.ctx.currentTime + 0.01, 'crash', 1.5); });
        const k = easeOut((t - 4.5) / 2.5);
        const POS = TX.n === 1 ? [[cx, cy, 1]] : [[cx, cy, 1], [W * 0.2, H * 0.2, 0.55], [W * 0.82, H * 0.66, 0.6], [W * 0.25, H * 0.75, 0.5]].slice(0, TX.n);
        for (const [px, py, sc] of POS) {
          const rr = M * (0.05 + k * 0.32) * sc;
          blackSun(c, px, py, rr * 0.55, Math.min(1, k * 1.5), t);
          for (let i = 0; i < 2; i++) {
            const g = c.createRadialGradient(px, py, 0, px, py, rr * (1.3 + i * 0.5 + Math.sin(t * 3 + i) * 0.05));
            g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(15,0,8,.95)'); g.addColorStop(0.68, 'rgba(255,40,110,.6)'); g.addColorStop(1, 'rgba(255,40,110,0)');
            c.fillStyle = g; c.beginPath(); c.ellipse(px, py, rr * (2.2 + i * 0.4), rr * (0.9 + i * 0.25), 0, 0, 7); c.fill();
          }
        }
        // 紅い稲妻
        if (t < 12) {
          const lr = Art.srand(Math.floor(t * 9));
          c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(255,70,110,.85)'; c.shadowColor = '#ff2050'; c.shadowBlur = 14;
          for (let j = 0; j < 3; j++) {
            if (lr() < 0.45) continue;
            let a0 = lr() * 7, x = cx + Math.cos(a0) * M * 0.12, y = cy + Math.sin(a0) * M * 0.12;
            c.lineWidth = 1 + lr() * 2; c.beginPath(); c.moveTo(x, y);
            for (let s2 = 0; s2 < 9; s2++) { a0 += (lr() - 0.5) * 0.9; x += Math.cos(a0) * M * 0.07; y += Math.sin(a0) * M * 0.07; c.lineTo(x, y); }
            c.stroke();
          }
          c.restore();
        }
        if (t < 5.2) { c.fillStyle = `rgba(255,220,230,${1 - (t - 4.5) / 0.7})`; c.fillRect(-20, -20, W + 40, H + 40); }
      }
      // 4. 群れが溢れ出す（6〜）
      if (t >= 6) {
        at(t, 6, () => { Sound.bgm('crisis'); });
        for (const s of swarm) {
          const k = (t - 6 - s.d) * s.sp; if (k < 0) continue;
          const dist = k * M * 0.35, x = cx + Math.cos(s.a) * dist * 1.3, y = cy + Math.sin(s.a) * dist;
          Art.ship(c, s.h, x, y, s.a + Math.PI / 2, s.s * (0.6 + Math.min(1, k) * 0.6), '#ff2a6a');
        }
      }
      c.restore();
      // 5. 名前（9〜）
      if (t >= 9) {
        at(t, 9, () => { if (Sound.ctx) Sound.drum(Sound.ctx.currentTime + 0.01, 'timp', 1.6); });
        const a = Math.min(1, (t - 9) / 0.6);
        c.fillStyle = `rgba(0,0,0,${a * 0.45})`; c.fillRect(0, 0, W, H);
        const st = Math.max(0, 1 - (t - 9) / 0.35), sj = st * 8 * (Math.random() - 0.5);
        if (t < 9.6) { c.fillStyle = `rgba(255,40,90,${0.35 * (1 - (t - 9) / 0.6)})`; c.fillRect(0, 0, W, H); }
        textC(c, TX.title, W / 2 + sj, H * 0.4 + sj, Math.min(W / (1.3 + TX.title.length * 1.3), 150) * (1 + st * 1.2), a, { w: 800, col: '#ffffff', glow: 'rgba(255,30,100,1)', blur: 40 });
        textC(c, TX.sub, W / 2, H * 0.4 + Math.min(W / 2.6, 150) * 0.85, 15, Math.min(1, (t - 10) / 1), { ls: 6, col: '#ffc0d0', glow: 'rgba(255,40,110,.9)' });
        textBlock(c, TX.line, W / 2, H * 0.78, 18, fade(t, 11, 16.8, 0.8), W * 0.9, { col: '#ffe0e8', glow: 'rgba(255,40,110,.9)' });
      }
      if (t > 16) { c.fillStyle = `rgba(0,0,0,${(t - 16)})`; c.fillRect(0, 0, W, H); }
    });
  }

  // ---------------- エンディング ----------------
  function ending(rec) {
    stopTitle();
    Sound.bgm('ending');
    const F = FACTIONS[rec.fac];
    const neb = Art.nebulaCanvas(480, 860, 31 + rec.fac, [F.col === '#e0483c' ? 8 : 220, 260, 40], { alpha: 0.1, stars: 600 });
    const stars = makeStars(320, 17);
    const galGrey = galaxyCanvas(560, 31, '#5a6a88', '#a8b4cc');
    const galF = galaxyCanvas(560, 31, F.col, F.col2);
    const fwCols = [F.col, F.col2, '#fff2c0', '#ffffff'];
    // 銀河（色が勢力の色へ移っていく）
    const drawGalaxy = (c, W, H, t, a, uni, cy = 0.45, sc = 1.7) => {
      if (a <= 0.01) return;
      const M = Math.min(W, H), gs = M * sc;
      c.save(); c.globalCompositeOperation = 'lighter';
      c.translate(W / 2, H * cy); c.rotate(-0.3); c.scale(1, 0.45); c.rotate(t * 0.03);
      if (uni < 1) { c.globalAlpha = a * (1 - uni); c.drawImage(galGrey, -gs / 2, -gs / 2, gs, gs); }
      if (uni > 0) { c.globalAlpha = a * uni; c.drawImage(galF, -gs / 2, -gs / 2, gs, gs); }
      c.restore();
    };
    // 帰還する艦隊（地平の光へ向かって小さくなっていく）
    const homeward = Array.from({ length: 22 }, (_, i) => { const r = Art.srand(i * 71 + 3); return { sx: r() * 1.4 - 0.2, sy: -0.1 - r() * 0.3, d: r() * 9, sp: 0.09 + r() * 0.06, s: 0.6 + r() * 0.8, h: ['dd', 'cl', 'bb', 'cv', 'cl'][i % 5] }; });[rec.fac][rec.type === 'conquest' ? 'conquest' : 'peace'];
    const T = ENDING_TEXT[rec.fac][rec.type === 'conquest' ? 'conquest' : 'peace'];
    const cards = rec.epi || [];
    const t1 = 22, t2 = t1 + 20, perCard = 5.2, t3 = t2 + cards.length * perCard;
    const rollLines = staffRoll(rec);
    const rollDur = 6 + rollLines.length * 0.75;
    const D = t3 + rollDur + 6;
    const imgs = {};
    cards.forEach(cd => { const im = new Image(); im.src = Portrait.url(cd.k, cd.dead ? 'sad' : 'happy'); imgs[cd.k] = im; });
    const lead = new Image(); lead.src = Portrait.url(rec.leader || F.leader, 'happy');
    let tapSkip = 0;
    return play('ending', 'endcv', D, (c, W, H, t) => {
      const M = Math.min(W, H);
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      // ---- 1. 終わり方の情景（0〜t1）
      if (t < t1) {
        const a = fade(t, 0, t1, 1.5);
        c.globalAlpha = a; c.drawImage(neb, 0, 0, W, H); c.globalAlpha = 1;
        starfield(c, W, H, stars, t, 0.01);
        const uni = ease((t - 3) / 10);
        drawGalaxy(c, W, H, t, a * 0.8, uni, rec.type === 'conquest' ? 0.3 : 0.45);
        if (t > 9) fireworks(c, W, H, t, fwCols, 1.1 * a, rec.type === 'conquest' ? 0.3 : 0.55, rec.fac + 1);
        if (rec.type === 'conquest') {
          // 覇道：首都の上に旗艦と艦隊が並ぶ
          const pr = W * 1.1;
          Art.planet(c, W / 2, H + pr * 0.6, pr, PTYPES[rec.capType] ? rec.capType : 'terra', 5);
          const k = easeOut(t / 10);
          fleet(c, W / 2, H * 0.45 + (1 - k) * 80, 16, 0, 26, F.col, 9, 1.8);
          c.save(); c.globalCompositeOperation = 'lighter'; bloom(c, W / 2, H * 0.36 + (1 - k) * 60, M * 0.45, F.col, 0.35 * a * k); c.restore();
          Art.ship(c, 'dn', W / 2, H * 0.36 + (1 - k) * 60, 0, M * 0.32, F.col);
          Art.emblem(c, F.emblem, W / 2, H * 0.16, M * 0.08 * a, F.col, F.col2);
        } else {
          // 和平：すべての航路門に光が灯る
          const nodes = G0nodes(W, H);
          const k = t / 14;
          c.lineWidth = 1.5;
          nodes.lanes.forEach(([i, j], n) => {
            const lk = clamp(k * nodes.lanes.length / 1.2 - n * 0.6, 0, 1);
            if (lk <= 0) return;
            const A = nodes.pts[i], B = nodes.pts[j];
            c.strokeStyle = uni > 0.02 ? Art.hexA(Art.mix('#a0dcff', F.col2, uni), lk * 0.85) : `rgba(160,220,255,${lk * 0.8})`;
            c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(A.x + (B.x - A.x) * lk, A.y + (B.y - A.y) * lk); c.stroke();
          });
          nodes.pts.forEach((p, i) => {
            const pk = clamp(k * 2 - i * 0.04, 0, 1);
            const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14 * pk + 2);
            g.addColorStop(0, `rgba(255,255,255,${pk})`); g.addColorStop(1, Art.hexA(Art.mix('#8cc8ff', F.col, uni), 0));
            c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, 16, 0, 7); c.fill();
          });
          // 六つの紋章が中央に寄り添い、ひとつの光になる
          const gather = ease((t - 13) / 5);
          c.save(); c.globalCompositeOperation = 'lighter'; bloom(c, W / 2, H * 0.45, M * (0.2 + gather * 0.35), F.col, 0.5 * gather * a); c.restore();
          FACTIONS.forEach((FF, i) => { if (!rec.alive.includes(FF.id)) return; const ang = -Math.PI / 2 + i * Math.PI / 3 + gather * 0.6, R = 1 - gather * 0.55, x = W / 2 + Math.cos(ang) * M * 0.36 * R, y = H * 0.45 + Math.sin(ang) * M * 0.42 * R; c.save(); c.globalCompositeOperation = 'lighter'; bloom(c, x, y, M * 0.1, FF.col, 0.4 * ease((t - 4 - i * 0.6) / 1.5) * a); c.restore(); Art.emblem(c, FF.emblem, x, y, M * 0.05 * ease((t - 4 - i * 0.6) / 1.5), FF.col, FF.col2); });
        }
        textC(c, rec.type === 'conquest' ? '― 覇　道 ―' : '― 和　平 ―', W / 2, H * 0.08, 20, fade(t, 1, t1 - 1, 1), { ls: 8, col: '#fff4d0', glow: rec.type === 'conquest' ? F.col : 'rgba(140,200,255,1)' });
        T.forEach((line, i) => textBlock(c, line, W / 2, H * 0.82, 16, fade(t, 3 + i * 6, 9 + i * 6, 1), W * 0.88));
      }
      // ---- 2. 勢力の結末と一枚絵（t1〜t2）
      if (t >= t1 && t < t2) {
        const k = t - t1, a = fade(t, t1, t2, 1.2);
        // 夜明けの地平
        const sky = c.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#02030c'); sky.addColorStop(0.55, Art.mix(F.col, '#02030c', 0.75)); sky.addColorStop(0.78, Art.mix(F.col2, F.col, 0.5)); sky.addColorStop(1, '#000');
        c.globalAlpha = a; c.fillStyle = sky; c.fillRect(0, 0, W, H);
        starfield(c, W, H * 0.6, stars, t, 0.005);
        // 昇る光
        const sunY = H * 0.78 - ease(k / 10) * H * 0.08;
        const sg = c.createRadialGradient(W / 2, sunY, 0, W / 2, sunY, M * 0.6);
        sg.addColorStop(0, 'rgba(255,250,230,.95)'); sg.addColorStop(0.1, Art.hexA(F.col2, 0.7)); sg.addColorStop(1, Art.hexA(F.col, 0));
        c.fillStyle = sg; c.beginPath(); c.arc(W / 2, sunY, M * 0.6, 0, 7); c.fill();
        // 帰還する艦隊
        c.globalAlpha = a;
        for (const f of homeward) {
          const q = (k - f.d) * f.sp; if (q < 0 || q > 1) continue;
          const e = easeOut(q), x = W * f.sx + (W / 2 - W * f.sx) * e, y = H * f.sy + (sunY - H * f.sy) * e;
          const ang = Math.atan2(sunY - H * f.sy, W / 2 - W * f.sx) + Math.PI / 2;
          c.globalAlpha = a * Math.min(1, (1 - q) * 3);
          Art.ship(c, f.h, x, y, ang, M * 0.09 * f.s * (1 - e * 0.7), Art.mix(F.col, '#000000', 0.35));
          if (q > 0.85) { c.save(); c.globalCompositeOperation = 'lighter'; bloom(c, x, y, 10, F.col2, (q - 0.85) * 4 * a); c.restore(); }
        }
        c.globalAlpha = a;
        if (k > 6) fireworks(c, W, H * 0.75, k, fwCols, 0.9, 0.45, rec.fac + 7);
        // 地平（惑星の弧）
        const pr = W * 2.2;
        c.fillStyle = '#04050c'; c.beginPath(); c.arc(W / 2, H * 0.8 + pr, pr, 0, 7); c.fill();
        c.strokeStyle = Art.hexA(F.col2, 0.8); c.lineWidth = 2; c.beginPath(); c.arc(W / 2, H * 0.8 + pr, pr, Math.PI * 1.3, Math.PI * 1.7); c.stroke();
        // 君主の肖像
        if (lead.complete) {
          const iw = M * 0.42, ih = iw * 1.2, x = W / 2 - iw / 2, y = H * 0.2;
          c.save(); c.globalAlpha = a * ease((k - 1) / 2);
          c.shadowColor = F.col; c.shadowBlur = 30;
          c.drawImage(lead, x, y, iw, ih);
          c.restore();
          c.strokeStyle = Art.hexA(F.col2, a * 0.8); c.lineWidth = 1.5; c.strokeRect(x - 6, y - 6, iw + 12, ih + 12);
        }
        Art.emblem(c, F.emblem, W / 2, H * 0.12, M * 0.05, F.col, F.col2);
        c.globalAlpha = 1;
        const FT = ENDING_FACTION[rec.fac][rec.type === 'conquest' ? 0 : 1];
        FT.forEach((line, i) => textBlock(c, line, W / 2, H * 0.88, 15, fade(t, t1 + 2 + i * 5.5, t1 + 7.5 + i * 5.5, 0.9), W * 0.88, { glow: F.col }));
      }
      // ---- 3. 士官のその後（t2〜t3）
      if (t >= t2 && t < t3) {
        c.globalAlpha = 0.5; c.drawImage(neb, 0, 0, W, H); c.globalAlpha = 1;
        starfield(c, W, H, stars, t, 0.006);
        drawGalaxy(c, W, H, t, 0.35, 1, 0.5, 2.2);
        const i = Math.floor((t - t2) / perCard), k = t - t2 - i * perCard, cd = cards[i];
        if (cd) {
          const a = fade(k, 0, perCard, 0.6);
          const im = imgs[cd.k];
          const iw = Math.min(M * 0.38, 170), ih = iw * 1.2;
          const x = W / 2 - iw / 2, y = H * 0.16 + (1 - easeOut(k / 1.2)) * 20;
          c.save(); c.globalAlpha = a;
          if (cd.dead) c.filter = 'grayscale(0.8)';
          if (im.complete) c.drawImage(im, x, y, iw, ih);
          c.restore();
          c.strokeStyle = `rgba(230,220,190,${a * 0.6})`; c.strokeRect(x - 5, y - 5, iw + 10, ih + 10);
          const o = OFF[cd.k];
          textC(c, o.name, W / 2, y + ih + 34, 20, a, { col: '#fff4d8' });
          textC(c, cd.dead ? `${o.epi}　― 戦没 ―` : o.epi, W / 2, y + ih + 58, 12, a * 0.85, { col: cd.dead ? '#c0c8d8' : '#cfe2ff' });
          textBlock(c, cd.text, W / 2, y + ih + 110, 14, a, W * 0.86);
        }
      }
      // ---- 4. スタッフロールと記録（t3〜）
      if (t >= t3) {
        const k = t - t3;
        c.globalAlpha = 0.6; c.drawImage(neb, 0, 0, W, H); c.globalAlpha = 1;
        starfield(c, W, H, stars, t, 0.02);
        drawGalaxy(c, W, H, t, 0.55, 1, 0.5, 2.0);
        shootingStars(c, W, H, k, 9);
        // 名前の通り道を少し暗くして読みやすく
        const sh = c.createLinearGradient(0, 0, W, 0); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.5, 'rgba(0,0,0,.35)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = sh; c.fillRect(0, 0, W, H);
        if (k > rollDur - 2) { fireworks(c, W, H, k, fwCols, 1.6, 0.42, 99); c.save(); c.globalCompositeOperation = 'lighter'; bloom(c, W / 2, H / 2, M * 0.7, F.col, 0.35 * ease((k - rollDur) / 2)); c.restore(); }
        const y0 = H + 20 - k * 46;
        rollLines.forEach((l, i) => {
          const y = y0 + i * 34;
          if (y < -40 || y > H + 40) return;
          const edge = Math.min(1, y / 80, (H - y) / 80);
          if (l.h) textC(c, l.t, W / 2, y, l.big ? 30 : 13, edge, { col: l.big ? '#ffffff' : '#9ab8e0', ls: l.big ? 6 : 3, w: l.big ? 800 : 600 });
          else textC(c, l.t, W / 2, y, 16, edge, { col: '#eef2ff' });
        });
        if (k > rollDur) { textC(c, '― 完 ―', W / 2, H / 2, 28, ease((k - rollDur) / 2), { ls: 10 }); }
      }
    }, { tap: t => { if (t < t1) return t1 - t; if (t < t2) return t2 - t; if (t < t3) return perCard - ((t - t2) % perCard); return 0; } });
  }
  // 和平の絵：航路の網（実際の星図から）
  function G0nodes(W, H) {
    const pts = PLANET_SRC.map(([id, n, sys, dx, dy]) => ({ x: (SYSTEMS[sys].x + dx) / 1000 * W * 0.9 + W * 0.05, y: (SYSTEMS[sys].y + dy) / 1500 * H * 0.75 + H * 0.06 }));
    const lanes = [];
    pts.forEach((p, i) => { const near = pts.map((q, j) => [j, Math.hypot(p.x - q.x, p.y - q.y)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 2); near.forEach(([j]) => { if (i < j) lanes.push([i, j]); }); });
    GATE_LANES.forEach(l => lanes.push(l));
    return { pts, lanes };
  }
  function staffRoll(rec) {
    const F = FACTIONS[rec.fac];
    const L = [];
    const h = (t, big) => L.push({ t, h: true, big });
    const n = t => L.push({ t });
    const gap = () => L.push({ t: '' });
    h(CONFIG.title, true); n('― ' + CONFIG.sub + ' ―'); gap(); gap();
    h('記録');
    n(`${F.name}　${rec.type === 'conquest' ? '武力統一' : '和平'}`);
    n(`${rec.dateFrom} ― ${rec.dateTo}（${rec.months}か月）`);
    n(`艦隊戦 ${rec.battles}回（勝 ${rec.won}・敗 ${rec.lost}）`);
    n(`撃沈 ${rec.sunk}隻 ／ 喪失 ${rec.lostShips}隻`);
    n(`結んだ同盟 ${rec.allies}`);
    if (rec.eclipse) n(rec.eclipse);
    gap();
    if (rec.big && rec.big.length) { h('主な会戦'); rec.big.slice(0, 6).forEach(b => n(`${b.name}（${b.won ? '勝利' : '敗北'}）`)); gap(); }
    h('功臣'); (rec.epi || []).slice(0, 8).forEach(e => n(OFF[e.k].name)); gap();
    // 共に戦った士官たち（いま遊んでいる記録のときだけ）
    try {
      if (liveRecs.has(rec) && typeof G !== 'undefined' && G && G.player === rec.fac && typeof Game !== 'undefined' && Game.officersOf) {
        const seen = new Set((rec.epi || []).map(e => e.k));
        const rest = Game.officersOf(rec.fac).filter(k => OFF[k] && !seen.has(k)).sort((a, b) => ((G.officers[b] && G.officers[b].merit) || 0) - ((G.officers[a] && G.officers[a].merit) || 0)).slice(0, 12);
        if (rest.length) { h('共に戦った士官たち'); rest.forEach(k => n(OFF[k].name)); gap(); }
      }
    } catch (e) { }
    if (rec.fallen && rec.fallen.length) { h('星になった者たち'); rec.fallen.slice(0, 8).forEach(k => n(OFF[k].name)); gap(); }
    gap();
    h('企画・制作'); n(CONFIG.credit); gap();
    h('プログラム・絵・音・シナリオ'); n(`${CONFIG.credit} ／ with Claude`); gap();
    h('参考にした作品のジャンル'); n('ターン制の宇宙戦略ゲームと、'); n('スペースオペラのウォーゲームたち'); gap();
    h('Special Thanks'); n('この銀河で戦い、語り合った'); n('すべての士官たちへ'); gap(); gap();
    h('そして、遊んでくれたあなたへ'); gap(); gap();
    return L;
  }

  return { title, stopTitle, opening, ending, eclipseArrival };
})();

// ============================================================
//  エンディングの文と記録
// ============================================================
const ENDING_TEXT = {
  0: { conquest: ['紅の艦隊が、最後の星の空を覆った。', '若き獅子帝は、ついに銀河を一つの玉座のもとに束ねた。', 'その治世を、人々は畏れと共に「獅子の秩序」と呼んだ。'],
       peace: ['帝国は剣を収め、六つの旗と並んで立った。', '五百年の帝政が初めて選んだのは、征服ではなく盟約だった。', '若き皇帝は言った。「盾とは、並ぶ者のためにある」と。'] },
  1: { conquest: ['自由の旗が、銀河のすべての星に掲げられた。', '共和国は勝利した。だがその勝利が、自由を損なわぬように――', '議会は、最初の法として、軍の解散を議決した。'],
       peace: ['白い議事堂に、六つの国の使節が集った。', '銀河で初めての「星間議会」が開かれた日、', '首相は短く、「これが、私たちの自由です」と語った。'] },
  2: { conquest: ['すべての星が、企業連合の帳簿に記された。', '銀河はひとつの市場となり、金は止まることなく巡り始めた。', '総裁は満足げに言った。「ようやく、採算が合った」'],
       peace: ['関税は消え、航路門は誰にでも開かれた。', '銀河中の市場が繋がり、かつてない繁栄が訪れた。', '戦より商いのほうが儲かる――それを証明した国の名は、長く語り継がれた。'] },
  3: { conquest: ['光の大聖堂の鐘が、銀河の果てまで鳴り響いた。', '聖教国は、すべての星を光のもとに導いた。', 'だが聖女は、誰にも祈りを強いることはなかった。'],
       peace: ['聖女の巡礼は、ついにすべての国を巡り終えた。', '光は、分け合うほど強くなる。', 'その言葉は、六つの国の子どもたちが最初に覚える言葉となった。'] },
  4: { conquest: ['辺境の流れ者たちが、銀河の主となった。', '誰の旗にも跪かなかった者たちは、自らの旗を掲げた。', 'だが盟主は、王を名乗ることだけは最後まで拒んだ。'],
       peace: ['辺境の港町で、六つの国の代表が杯を交わした。', '跪かず、並んで立つ。', '辺境の流儀は、こうして銀河の流儀となった。'] },
  5: { conquest: ['演算塔の光が、すべての星を結んだ。', '機巧院は銀河を記録し、守り、導く者となった。', '統括知性は記した。「この記憶を、次の一万年へ」'],
       peace: ['機巧院は、古代の記録をすべての国に開いた。', '人と機械と、六つの国が、同じ記憶を分け合った。', '一万二千年前に途絶えた物語は、ここから再び綴られる。'] },
};
const ENDING_FACTION = {
  0: [['帝都ヴァルハイムの空に、黄金の環が輝いている。', '獅子帝の名は、銀河の歴史の最初の頁に刻まれた。', '――あの日の少年は、もういない。'], ['帝都に、六つの国の旗が並んだ。', '若き皇帝は、摂政の墓前に盟約の写しを供えた。', '――「見ていてくれたか、ゲルハルト」']],
  1: [['リベルタスの記念碑に、新しい名が刻まれた。', '共和国は勝った。そして、勝ったあとも共和国であり続けた。', '――自由は、守り続ける者の手にだけ残る。'], ['セレスタ・プライムの尖塔に、朝日が差す。', '星間議会の最初の議長には、帝国の者が選ばれた。', '――首相は、それを心から喜んだという。']],
  2: [['メルカトルの夜は、今日も明るい。', '銀河のすべての取引が、この星を通る。', '――黄金の時代と、人は呼んだ。'], ['商都の灯りは、今や銀河中に灯っている。', '人々は戦の代わりに、値切りで争うようになった。', '――それはそれで、なかなか骨の折れる争いだった。']],
  3: [['聖都ルミナリアの大聖堂に、銀河中から巡礼が集う。', '聖女は今日も、変わらず祈りを捧げている。', '――消えた星々の、魂の安らぎのために。'], ['光の大聖堂の扉は、あらゆる者に開かれている。', '帝国の兵も、機巧院の機械も、そこでは同じ一人の巡礼者だ。', '――聖女は、それをいちばんの奇跡と呼んだ。']],
  4: [['ノヴァ・ヘイヴンの酒場は、今夜も騒がしい。', '銀河の主となっても、辺境の者たちは変わらなかった。', '――盟主の椅子は、今も酒樽のままだ。'], ['辺境の港には、あらゆる国の船が寄港する。', '流れ者も、大国の兵も、同じ酒場で同じ歌を歌う。', '――辺境は、銀河でいちばん賑やかな場所になった。']],
  5: [['ゼノアの演算塔は、今日も止まらない。', '銀河のすべての記憶が、そこに集められている。', '――次に闇が来るときのために。'], ['演算塔の扉が開き、人々が古代の記録を読みに来る。', '機械は語り、人は学び、記憶は受け継がれていく。', '――我らは記憶を継ぐ。それは、もう機巧院だけの言葉ではない。']],
};
const EPILOGUE = {
  '猛進': ['その後も前線に立ち続け、「{epi}」の名は辺境の子どもたちの遊び歌になった。', '戦が終わると退屈だとこぼし、やがて辺境警備隊の鬼教官となった。'],
  '沈着': ['軍の最高位に就き、生涯一度も声を荒げることがなかったという。', '退役後は小さな星で畑を耕し、静かに余生を送った。訪ねる者は絶えなかった。'],
  '策士': ['戦史の講義で、その名を聞かぬ士官候補生はいない。', '外交の場に転じ、舌先ひとつで幾つもの争いを未然に防いだ。'],
  '仁徳': ['傷ついた兵たちのための療養所を建て、そこで長く暮らした。', '各地の復興を指揮し、人々からは今も親しみを込めて名を呼ばれている。'],
  '野心': ['さらなる高みを目指し続け、ついには国の要職に上り詰めた。', '平和な世では野心の行き場がなく、やがて新しい航路の開拓に身を投じた。'],
  '忠烈': ['最後まで主のそばを離れず、その忠義は物語となって語り継がれた。', '主の盾として生きた日々を誇りに、静かに剣を置いた。'],
  '奔放': ['ある日ふらりと姿を消し、銀河のどこかで噂だけが聞こえてくる。', '戦後は旅芸人のように星々を渡り歩き、行く先々で騒ぎを起こしたという。'],
};
const Ending = (() => {
  const liveRecs = new WeakSet();   // いま終わったゲームの記録（見返しと区別する）
  function record(type) {
    const me = G.player, f = G.facs[me];
    const mine = Object.keys(G.officers).filter(k => G.officers[k].fac === me && G.officers[k].st === 'act');
    const fallen = Object.keys(G.officers).filter(k => G.officers[k].st === 'dead' && G.officers[k].ever === me || (G.officers[k].st === 'dead' && G.officers[k].merit > 0 && G.officers[k].fac === me));
    const leader = f.leader && G.officers[f.leader] && G.officers[f.leader].fac === me ? f.leader : mine.sort((a, b) => OFF[b].ldr - OFF[a].ldr)[0];
    const ti = type === 'conquest' ? 0 : 1;
    const epi = [];
    if (leader) epi.push({ k: leader, text: LEADER_EPI[leader] ? LEADER_EPI[leader][ti] : `${FACTIONS[me].name}の君主として、新しい時代を治めた。` });
    const top = mine.filter(k => k !== leader).sort((a, b) => G.officers[b].merit - G.officers[a].merit).slice(0, 5);
    top.forEach(k => epi.push({ k, text: EPILOGUE[OFF[k].pers][ti].replace('{epi}', OFF[k].epi) }));
    // 因縁の二人
    for (const [a, b, kind, desc] of OFFICER_TIES) {
      if (epi.length >= 9) break;
      if (isMine(a) && isMine(b) && !epi.some(e => e.k === a || e.k === b)) {
        epi.push({ k: a, text: kind === 'bond' ? `${OFF[b].name}と共に戦後を生きた。${desc}――その絆は、最後まで変わらなかった。` : `${OFF[b].name}とは、戦後も事あるごとに張り合った。${desc}。だが互いの葬儀には、必ず出ると約束していたという。` });
      }
    }
    fallen.sort((a, b) => G.officers[b].merit - G.officers[a].merit).slice(0, 2).forEach(k => epi.push({ k, dead: true, text: `${G.officers[k].diedWhere}に散る。その名は戦没者の碑の最上段に刻まれ、花の絶える日はない。` }));
    const capType = G.planets[f.capital] ? G.planets[f.capital].type : 'terra';
    const rec = {
      type, fac: me, leader, epi, fallen, capType,
      alive: G.facs.filter(x => x.alive).map(x => x.id),
      dateFrom: Game.dateStr(1), dateTo: Game.dateStr(G.turn), months: G.turn - 1,
      battles: G.rec.battles, won: G.rec.won, lost: G.rec.lost, sunk: G.rec.sunk, lostShips: G.rec.lostShips, allies: G.rec.allies, big: G.rec.big,
      eclipse: G.eclipse.defeated ? `蝕を退けた（${Game.dateStr(G.eclipse.defeatedAt)}）` : G.eclipse.arrived ? '' : '蝕の到来より前に、銀河はまとまった',
      when: Date.now(),
    };
    try {
      const list = JSON.parse(localStorage.getItem(CONFIG.recKey) || '[]');
      list.unshift(rec); localStorage.setItem(CONFIG.recKey, JSON.stringify(list.slice(0, 20)));
    } catch (e) { }
    liveRecs.add(rec);
    return rec;
  }
  function showRecords() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(CONFIG.recKey) || '[]'); } catch (e) { }
    if (!list.length) { UI.modal('<h2>記録</h2><p>まだ天下を定めた記録はありません。</p>'); return; }
    UI.modal(`<h2>記録</h2><div class="recs">${list.map((r, i) => `<div class="rec" style="--c:${FACTIONS[r.fac].col}"><b>${FACTIONS[r.fac].name}　${r.type === 'conquest' ? '武力統一' : '和平'}</b><small>${r.dateTo}・${r.months}か月・会戦${r.battles}</small><button class="btn small" data-r="${i}">エンディングを見る</button></div>`).join('')}</div>`, [{ t: '閉じる', v: null }], {
      onOpen: m => m.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => { m.classList.remove('show'); Cinema.stopTitle(); await Cinema.ending(list[+b.dataset.r]); UI.toTitle(); }),
    });
  }
  return { record, showRecords };
})();
const LEADER_EPI = {
  alexis: ['獅子帝として四十年を治め、帝国史上最も偉大な皇帝と呼ばれた。', '帝国を立憲の国へと改め、自らは「最初の市民」を名乗った。'],
  eliza: ['勝利の翌年に首相を退き、故郷の小さな町で教師になった。', '星間議会の設立を見届け、「これでようやく眠れる」と笑った。'],
  magnus: ['銀河一の富豪として死んだ。遺産の大半は、なぜか孤児院に寄付されていた。', '総裁の座をリンに譲り、余生を値切りの稽古に捧げたという。'],
  celestina: ['聖女の座を退き、一人の修道女として療養所で人々に仕えた。', '巡礼の旅を生涯続け、その足跡は銀河の地図に光の道として記された。'],
  gard: ['盟主の座を娘に譲り、酒場の主人になった。客の話を聞くのがうまかったという。', '辺境の氏族すべてから「父」と呼ばれ、穏やかな晩年を過ごした。'],
  idea: ['演算塔の中枢に戻り、銀河の記憶を守り続けている。今も、きっと。', '人間の子どもたちに古代の記録を語り聞かせることを、何より好んだ。'],
};
