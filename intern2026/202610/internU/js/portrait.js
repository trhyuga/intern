// ============================================================
//  士官の肖像（コードで描く。名前から顔立ちが決まり、表情を変えられる）
//  expr: normal 通常 / angry 怒り / happy 喜び / sad 憂い / shock 驚き
// ============================================================
const Portrait = (() => {
  const cache = new Map();
  const PW = 180, PH = 216;
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const SKINS = ['#f6dcc4', '#f0cfb0', '#e8bf98', '#d8a880', '#c28c62', '#9c6a48', '#7a5038', '#f8e4d4'];
  const HAIRS = ['#1a1418', '#2a1e1a', '#4a2e1e', '#7a4a28', '#c89858', '#e8d090', '#d8d8e0', '#8a2a22', '#283a6a', '#3a6a7a', '#f0f0f4', '#5a3a6a'];
  const EYES = ['#3a5a8a', '#4a7a4a', '#7a4a2a', '#2a2a32', '#8a6a2a', '#5a3a8a', '#2a8a9a', '#a03030', '#6a7a8a'];
  const shade = (hex, k) => Art.mix(hex, k > 1 ? '#ffffff' : '#000000', Math.abs(1 - k));

  function features(key) {
    const S = OFF[key];
    const h = hash(key + S.name), r = Art.srand(h);
    const F = typeof S.fac0 === 'number' ? FACTIONS[S.fac0] : null;
    const old = S.tags.includes('old') || S.age >= 60;
    const cyber = S.tags.includes('cyber');
    let hair = HAIRS[Math.floor(r() * HAIRS.length)];
    if (old) hair = r() < 0.6 ? '#d8d8dc' : '#9a9aa0';
    if (cyber && r() < 0.5) hair = ['#c8f0ff', '#e0e0f0', '#40d8e8', '#f0f0ff'][Math.floor(r() * 4)];
    const styleF = ['long', 'bob', 'pony', 'long', 'side', 'bun'], styleM = ['short', 'swept', 'spiky', 'slick', 'short', 'long', 'buzz'];
    return {
      female: S.female, old, cyber,
      skin: cyber && r() < 0.5 ? '#e8eef4' : SKINS[Math.floor(r() * SKINS.length)],
      hair, eye: cyber ? '#40e8ff' : EYES[Math.floor(r() * EYES.length)],
      style: (S.female ? styleF : styleM)[Math.floor(r() * (S.female ? styleF : styleM).length)],
      jaw: S.female ? 0.86 + r() * 0.06 : 0.92 + r() * 0.12,
      faceL: 1 + (r() - 0.5) * 0.1,
      eyeS: S.female ? 1.08 + r() * 0.12 : 0.9 + r() * 0.15,
      brow: S.female ? 0.6 : 0.9 + r() * 0.4,
      col: F ? F.col : (/^m\d$/.test(S.fac0 || '') ? MINORS.find(m => m.id === S.fac0).col : ['#6a7088', '#8a6a4a', '#4a6a8a', '#7a4a6a'][Math.floor(r() * 4)]),
      col2: F ? F.col2 : '#e0d8c0',
      tags: S.tags, pers: S.pers, r,
      lip: S.female ? ['#c86a6a', '#b85a62', '#d07a78', '#a05058'][Math.floor(r() * 4)] : null,
      fac: S.fac0,
      merit: typeof G !== 'undefined' && G && G.officers[key] ? G.officers[key].merit : initMerit(S),
    };
  }

  function draw(key, expr, rk) {
    const SC = 2;   // 2倍の細かさで描く
    const cv = document.createElement('canvas'); cv.width = PW * SC; cv.height = PH * SC;
    const c = cv.getContext('2d'); c.scale(SC, SC);
    const f = features(key);
    f.rk = rk;
    // 背景：国の色の光と、ぼけた光の粒
    const bg = c.createLinearGradient(0, 0, 0, PH);
    bg.addColorStop(0, shade(f.col, 0.42)); bg.addColorStop(0.6, shade(f.col, 0.16)); bg.addColorStop(1, '#04050b');
    c.fillStyle = bg; c.fillRect(0, 0, PW, PH);
    const br = Art.srand(hash(key) + 7);
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const x = br() * PW, y = br() * PH * 0.75, r = 4 + br() * 16;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, Art.hexA(i % 3 ? f.col : f.col2, 0.22 + br() * 0.15)); g.addColorStop(1, Art.hexA(f.col, 0));
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    if (typeof f.fac === 'number') { c.save(); c.globalAlpha = 0.09; Art.emblem(c, FACTIONS[f.fac].emblem, PW * 0.78, 46, 40, '#ffffff', '#ffffff'); c.restore(); }
    const g0 = c.createRadialGradient(PW / 2, 84, 10, PW / 2, 84, 130); g0.addColorStop(0, Art.hexA(f.col2, 0.22)); g0.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g0; c.fillRect(0, 0, PW, PH);
    const cx = PW / 2, cy = 92;
    backHair(c, f, cx, cy);
    body(c, f, cx);
    // 首と、あごの落とす影
    c.fillStyle = shade(f.skin, 0.86);
    c.beginPath(); c.moveTo(cx - 12, cy + 30); c.lineTo(cx - 13, cy + 72); c.lineTo(cx + 13, cy + 72); c.lineTo(cx + 12, cy + 30); c.fill();
    c.fillStyle = 'rgba(50,15,20,.28)'; c.beginPath(); c.moveTo(cx - 13, cy + 34); c.quadraticCurveTo(cx, cy + 60, cx + 13, cy + 34); c.lineTo(cx + 13, cy + 30); c.lineTo(cx - 13, cy + 30); c.fill();
    // 顔（あごの細い輪郭）
    const fw = 38 * f.jaw, fh = 52 * f.faceL;
    const facePath = () => {
      c.beginPath();
      c.moveTo(cx - fw, cy - 26);
      c.bezierCurveTo(cx - fw - 1, cy - fh * 1.05, cx + fw + 1, cy - fh * 1.05, cx + fw, cy - 26);
      c.bezierCurveTo(cx + fw + 1, cy + 4, cx + fw * 0.78, cy + fh * 0.5, cx + fw * 0.3, cy + fh * 0.84);
      c.quadraticCurveTo(cx, cy + fh * 0.98, cx - fw * 0.3, cy + fh * 0.84);
      c.bezierCurveTo(cx - fw * 0.78, cy + fh * 0.5, cx - fw - 1, cy + 4, cx - fw, cy - 26);
    };
    const fg = c.createRadialGradient(cx - fw * 0.3, cy - 14, 4, cx, cy, fw * 1.6);
    fg.addColorStop(0, shade(f.skin, 1.06)); fg.addColorStop(0.6, f.skin); fg.addColorStop(1, shade(f.skin, 0.88));
    c.fillStyle = fg; facePath(); c.fill();
    // 陰影：右の頬・前髪の下・あご
    c.save(); facePath(); c.clip();
    const sh = c.createLinearGradient(cx - fw, 0, cx + fw, 0);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.62, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(110,40,40,.28)');
    c.fillStyle = sh; c.fillRect(cx - fw - 2, cy - fh, fw * 2 + 4, fh * 2);
    const tg = c.createLinearGradient(0, cy - 44, 0, cy - 14);
    tg.addColorStop(0, 'rgba(70,25,30,.32)'); tg.addColorStop(1, 'rgba(70,25,30,0)');
    c.fillStyle = tg; c.fillRect(cx - fw - 2, cy - 50, fw * 2 + 4, 36);
    c.fillStyle = 'rgba(110,40,40,.16)'; c.beginPath(); c.ellipse(cx + fw * 0.55, cy + 16, fw * 0.32, 14, -0.3, 0, 7); c.fill();
    // 頬紅
    [-1, 1].forEach(s => { const bg2 = c.createRadialGradient(cx + s * 24, cy + 12, 1, cx + s * 24, cy + 12, 13); bg2.addColorStop(0, f.female ? 'rgba(255,110,120,.28)' : 'rgba(220,110,100,.12)'); bg2.addColorStop(1, 'rgba(255,110,120,0)'); c.fillStyle = bg2; c.fillRect(cx + s * 24 - 14, cy, 28, 26); });
    c.restore();
    c.strokeStyle = Art.mix(f.skin, '#3a1a1a', 0.55); c.lineWidth = 0.9; facePath(); c.stroke();
    c.lineWidth = 1.8; c.globalAlpha = 0.45; c.beginPath(); c.moveTo(cx + fw * 0.7, cy + fh * 0.45); c.bezierCurveTo(cx + fw * 0.5, cy + fh * 0.75, cx + fw * 0.2, cy + fh * 0.9, cx, cy + fh * 0.93); c.stroke(); c.globalAlpha = 1;
    // 耳
    [-1, 1].forEach(s => {
      c.fillStyle = shade(f.skin, 0.9); c.beginPath(); c.ellipse(cx + s * (fw - 1), cy - 4, 4.5, 8, s * 0.15, 0, 7); c.fill();
      c.strokeStyle = shade(f.skin, 0.72); c.lineWidth = 0.8; c.beginPath(); c.arc(cx + s * (fw - 1), cy - 4, 2.6, s > 0 ? -1.2 : 1.9, s > 0 ? 1.2 : 4.3); c.stroke();
    });
    if (f.cyber) cyberFace(c, f, cx, cy, fw);
    face(c, f, cx, cy, expr);
    if (f.tags.includes('beard')) beard(c, f, cx, cy, fw, fh);
    frontHair(c, f, cx, cy, fw);
    accessories(c, f, cx, cy, fw, expr);
    crown(c, f, cx, cy);
    // 縁の光（右から国の色の光が当たる）
    c.save(); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = Art.hexA(f.col2, 0.35); c.lineWidth = 2.2;
    c.beginPath(); c.ellipse(cx, cy - 30, 50, 52, 0, -1.3, 0.35); c.stroke();
    c.strokeStyle = Art.hexA(f.col, 0.3); c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(cx + fw - 1, cy - 20); c.bezierCurveTo(cx + fw + 1, cy + 4, cx + fw * 0.78, cy + fh * 0.5, cx + fw * 0.3, cy + fh * 0.84); c.stroke();
    c.restore();
    // 表情の効果
    if (expr === 'angry') { c.strokeStyle = 'rgba(255,60,40,.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx + 44, cy - 52); c.lineTo(cx + 54, cy - 46); c.moveTo(cx + 48, cy - 56); c.lineTo(cx + 52, cy - 44); c.stroke(); }
    if (expr === 'sad') { const sg = c.createLinearGradient(0, 0, 0, 80); sg.addColorStop(0, 'rgba(30,50,120,.3)'); sg.addColorStop(1, 'rgba(30,50,120,0)'); c.fillStyle = sg; c.fillRect(0, 0, PW, 80); }
    if (expr === 'shock') { c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.5; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(cx - 58 + i * 5, cy - 50 + i * 3); c.lineTo(cx - 50 + i * 5, cy - 40 + i * 3); c.stroke(); } }
    // 周辺を少し暗く
    const vg = c.createRadialGradient(PW / 2, PH * 0.45, PH * 0.35, PW / 2, PH * 0.5, PH * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
    c.fillStyle = vg; c.fillRect(0, 0, PW, PH);
    // 縁
    c.strokeStyle = Art.hexA(f.col2, 0.7); c.lineWidth = 2; c.strokeRect(1, 1, PW - 2, PH - 2);
    c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1; c.strokeRect(3.5, 3.5, PW - 7, PH - 7);
    return cv.toDataURL('image/png');
  }

  // 体：軍服・襟の階級章・飾緒・勲章・君主のマント
  function body(c, f, cx) {
    const y0 = 160;
    const isHoly = f.fac === 3 || f.tags.includes('veil');
    const rk = f.rk;   // 0〜10、君主は 'L'
    const lord = rk === 'L';
    // マント（君主と元帥）
    if (lord || rk === 10) {
      const mg = c.createLinearGradient(0, y0 - 10, 0, PH);
      mg.addColorStop(0, shade(f.col, 0.75)); mg.addColorStop(1, shade(f.col, 0.3));
      c.fillStyle = mg;
      c.beginPath(); c.moveTo(cx - 70, y0 + 2); c.quadraticCurveTo(cx - 96, y0 + 40, cx - 92, PH); c.lineTo(cx + 92, PH); c.quadraticCurveTo(cx + 96, y0 + 40, cx + 70, y0 + 2); c.fill();
      c.strokeStyle = f.col2; c.lineWidth = 2; c.stroke();
    }
    const base = f.cyber ? '#3a4452' : isHoly ? '#ece6f4' : shade(f.col, 0.52);
    const bgr = c.createLinearGradient(cx - 80, 0, cx + 80, 0);
    bgr.addColorStop(0, shade(base, 0.8)); bgr.addColorStop(0.45, shade(base, 1.12)); bgr.addColorStop(1, shade(base, 0.7));
    c.fillStyle = bgr;
    c.beginPath(); c.moveTo(cx - 80, PH); c.bezierCurveTo(cx - 76, y0, cx - 40, y0 - 8, cx, y0 - 6); c.bezierCurveTo(cx + 40, y0 - 8, cx + 76, y0, cx + 80, PH); c.fill();
    // 打ち合わせと釦
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(cx + 4, y0 + 30); c.lineTo(cx + 8, PH); c.stroke();
    if (!isHoly) { c.fillStyle = f.col2; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(cx + 13, y0 + 40 + i * 12, 1.9, 0, 7); c.fill(); } }
    // 立ち襟
    c.fillStyle = isHoly ? '#d8cce8' : shade(f.col, 0.32);
    c.beginPath(); c.moveTo(cx - 26, y0 - 8); c.lineTo(cx - 18, y0 + 26); c.lineTo(cx, y0 + 34); c.lineTo(cx + 18, y0 + 26); c.lineTo(cx + 26, y0 - 8); c.lineTo(cx + 16, y0 - 2); c.lineTo(cx, y0 + 10); c.lineTo(cx - 16, y0 - 2); c.closePath(); c.fill();
    c.strokeStyle = Art.hexA(f.col2, 0.8); c.lineWidth = 1; c.stroke();
    // 胸の飾り線
    c.strokeStyle = f.col2; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(cx - 40, y0 + 18); c.lineTo(cx - 22, y0 + 40); c.stroke();
    c.beginPath(); c.moveTo(cx + 40, y0 + 18); c.lineTo(cx + 22, y0 + 40); c.stroke();
    // 肩章（階級が上がるほど房が増える）
    if (!isHoly) {
      [-1, 1].forEach(s => {
        const eg = c.createLinearGradient(0, y0 + 4, 0, y0 + 16); eg.addColorStop(0, shade(f.col2, 1.2)); eg.addColorStop(1, shade(f.col2, 0.7));
        c.fillStyle = eg; c.beginPath(); c.ellipse(cx + s * 58, y0 + 10, 16, 6, s * 0.25, 0, 7); c.fill();
        const n = lord ? 6 : rk >= 6 ? 6 : rk >= 3 ? 4 : 2;
        for (let i = 0; i < n; i++) c.fillRect(cx + s * (46 + i * 4), y0 + 14, 1.6, 6 + (lord || rk >= 6 ? 4 : 0));
      });
    } else {
      c.strokeStyle = '#c8a848'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx - 44, y0 + 6); c.quadraticCurveTo(cx, y0 + 50, cx + 44, y0 + 6); c.stroke();
    }
    // 飾緒（将官以上）
    if (lord || rk >= 6) {
      c.strokeStyle = '#e8c860'; c.lineWidth = 1.8;
      for (let i = 0; i < 2; i++) { c.beginPath(); c.moveTo(cx + 50, y0 + 12); c.quadraticCurveTo(cx + 38 - i * 4, y0 + 46 + i * 8, cx + 16, y0 + 30 + i * 4); c.stroke(); }
    }
    // 襟の階級章：尉官は線、佐官は銀の星、将官は金の星、元帥は月桂の星
    if (typeof rk === 'number' && !isHoly) {
      [-1, 1].forEach(s => {
        const bx = cx + s * 17, by = y0 + 10;
        if (rk <= 2) { c.fillStyle = '#e8d8a0'; for (let i = 0; i <= rk; i++) c.fillRect(bx - 4, by - 4 + i * 3.5, 8, 1.8); }
        else if (rk <= 5) { for (let i = 0; i <= rk - 3; i++) star(c, bx, by - 4 + i * 6, 2.4, '#e4e8f0'); }
        else if (rk <= 9) { for (let i = 0; i <= rk - 6; i++) star(c, bx + (i % 2 ? 2 : -2), by - 5 + i * 4.6, 2.3, '#f2cc58'); }
        else { star(c, bx, by, 4.2, '#ffd860'); c.strokeStyle = '#ffd860'; c.lineWidth = 1; c.beginPath(); c.arc(bx, by, 6, 0.6, 2.6); c.stroke(); }
      });
    }
    // 勲章（武功に応じて）
    const medals = Math.min(4, Math.floor((f.merit || 0) / 45));
    const cols = ['#c83a3a', '#3a7ad8', '#e8c040', '#5ac07a'];
    for (let i = 0; i < medals; i++) { c.fillStyle = cols[i]; c.fillRect(cx - 52 + i * 7, y0 + 30, 6, 4); c.fillStyle = '#f0d070'; c.beginPath(); c.arc(cx - 49 + i * 7, y0 + 39, 2.2, 0, 7); c.fill(); }
    // 国の徽章
    if (typeof f.fac === 'number') Art.emblem(c, FACTIONS[f.fac].emblem, cx - 34, y0 + 56, 8, FACTIONS[f.fac].col, FACTIONS[f.fac].col2);
    if (f.cyber) { c.strokeStyle = '#40e8ff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx - 60, y0 + 30); c.lineTo(cx - 30, y0 + 30); c.lineTo(cx - 20, y0 + 50); c.moveTo(cx + 60, y0 + 34); c.lineTo(cx + 34, y0 + 34); c.stroke(); }
    // 君主の飾り（襷）
    if (lord && (f.fac === 1 || f.fac === 2 || f.fac === 4)) { c.fillStyle = Art.hexA(f.col2, 0.85); c.beginPath(); c.moveTo(cx - 62, y0 + 12); c.lineTo(cx + 40, PH); c.lineTo(cx + 54, PH); c.lineTo(cx - 50, y0 + 4); c.fill(); }
  }
  function star(c, x, y, r, col) {
    c.fillStyle = col; c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); c.fill();
  }
  // 君主の冠・光輪（頭の上に）
  function crown(c, f, cx, cy) {
    if (f.rk !== 'L') return;
    if (f.fac === 0) {
      const y = cy - 70;
      const g = c.createLinearGradient(0, y - 14, 0, y + 4); g.addColorStop(0, '#fff0a0'); g.addColorStop(1, '#c8902a');
      c.fillStyle = g; c.beginPath(); c.moveTo(cx - 30, y + 4); c.lineTo(cx - 32, y - 8); c.lineTo(cx - 18, y - 2); c.lineTo(cx - 8, y - 16); c.lineTo(cx, y - 4); c.lineTo(cx + 8, y - 16); c.lineTo(cx + 18, y - 2); c.lineTo(cx + 32, y - 8); c.lineTo(cx + 30, y + 4); c.closePath(); c.fill();
      c.fillStyle = '#e8303a'; c.beginPath(); c.arc(cx, y - 1, 2.6, 0, 7); c.fill();
    }
    if (f.fac === 5) { c.strokeStyle = 'rgba(80,230,255,.85)'; c.lineWidth = 2; c.beginPath(); c.ellipse(cx, cy - 86, 30, 6, 0, 0, 7); c.stroke(); c.strokeStyle = 'rgba(80,230,255,.3)'; c.lineWidth = 5; c.stroke(); }
  }

  // ---------- 髪：根元から毛先へ細くなる房を、何十本も重ねて描く ----------
  // 3次ベジェ曲線に沿って、両側へ幅をつけた細長い形を作る（毛先ほど細い）
  function strand(c, p0, p1, p2, p3, w, colA, colB, taperRoot = 0.6, ex = 0.85) {
    const N = 16, L = [], Rr = [];
    const at = t => {
      const u = 1 - t;
      return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
              u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
    };
    for (let i = 0; i <= N; i++) {
      const t = i / N, [x, y] = at(t), [x2, y2] = at(Math.min(1, t + 0.02)), [x0, y0] = at(Math.max(0, t - 0.02));
      let nx = -(y2 - y0), ny = x2 - x0; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      // 根元は少し細く、真ん中が太く、毛先へ鋭く細る
      const k = (t < 0.15 ? taperRoot + (1 - taperRoot) * t / 0.15 : 1) * Math.pow(1 - t, ex);
      L.push([x + nx * w * k, y + ny * w * k]); Rr.push([x - nx * w * k, y - ny * w * k]);
    }
    c.beginPath(); c.moveTo(L[0][0], L[0][1]);
    L.forEach(([x, y]) => c.lineTo(x, y));
    for (let i = Rr.length - 1; i >= 0; i--) c.lineTo(Rr[i][0], Rr[i][1]);
    c.closePath();
    const g = c.createLinearGradient(p0[0], p0[1], p3[0], p3[1]);
    g.addColorStop(0, colA); g.addColorStop(1, colB);
    c.fillStyle = g; c.fill();
  }
  function backHair(c, f, cx, cy) {
    const base = shade(f.hair, 0.72), r = Art.srand(hash(f.hair + f.style) + 3);
    c.fillStyle = base;
    // 頭の丸み（顔より一回り大きい）
    c.beginPath(); c.ellipse(cx, cy - 30, 50, 53, 0, 0, 7); c.fill();
    const long = f.style === 'long' || f.style === 'side', bob = f.style === 'bob';
    if (long || bob) {
      // 背中・肩へ流れ落ちる髪：下地を塗ってから、房を重ねて流れを出す
      const bottom = long ? cy + 128 : cy + 46;
      c.beginPath(); c.moveTo(cx - 49, cy - 36);
      c.bezierCurveTo(cx - 64, cy + 20, cx - 66, bottom - 30, cx - (long ? 56 : 44), bottom);
      c.lineTo(cx + (long ? 56 : 44), bottom);
      c.bezierCurveTo(cx + 66, bottom - 30, cx + 64, cy + 20, cx + 49, cy - 36); c.fill();
      const n = long ? 18 : 12;
      for (let i = 0; i < n; i++) {
        const s = i < n / 2 ? -1 : 1, k = (i % (n / 2)) / (n / 2);
        const x0 = cx + s * (20 + k * 28), y0 = cy - 44 + k * 10;
        const x3 = cx + s * (34 + k * 26 + r() * 6), y3 = bottom - r() * 16;
        strand(c, [x0, y0], [x0 + s * 22, y0 + 40], [x3 + s * 10, y3 - 50], [x3, y3], 6 + r() * 4,
          shade(f.hair, 0.95 + r() * 0.15), shade(f.hair, 0.55 + r() * 0.15));
      }
    } else if (f.style === 'pony') {
      c.beginPath(); c.moveTo(cx + 34, cy - 60);
      c.bezierCurveTo(cx + 92, cy - 56, cx + 86, cy + 40, cx + 62, cy + 108);
      c.quadraticCurveTo(cx + 66, cy + 40, cx + 30, cy - 30); c.fill();
      for (let i = 0; i < 7; i++) strand(c, [cx + 40, cy - 56], [cx + 92 + i * 2, cy - 40], [cx + 84 - i * 3, cy + 40], [cx + 56 + i * 3, cy + 100 + r() * 12], 4 + r() * 3, shade(f.hair, 1.1), shade(f.hair, 0.6));
    } else if (f.style === 'bun') {
      c.beginPath(); c.arc(cx + 8, cy - 80, 19, 0, 7); c.fill();
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; strand(c, [cx + 8, cy - 80], [cx + 8 + Math.cos(a) * 20, cy - 80 + Math.sin(a) * 20], [cx + 8 + Math.cos(a + 1) * 16, cy - 80 + Math.sin(a + 1) * 16], [cx + 8 + Math.cos(a + 1.6) * 10, cy - 80 + Math.sin(a + 1.6) * 10], 4, shade(f.hair, 1.1), shade(f.hair, 0.7)); }
    }
    if (f.tags.includes('veil')) {
      c.fillStyle = '#f4f0fa';
      c.beginPath(); c.moveTo(cx - 56, cy - 44); c.bezierCurveTo(cx - 68, cy + 40, cx - 72, cy + 90, cx - 62, cy + 124); c.lineTo(cx + 62, cy + 124); c.bezierCurveTo(cx + 72, cy + 90, cx + 68, cy + 40, cx + 56, cy - 44); c.fill();
    }
  }
  function frontHair(c, f, cx, cy, fw) {
    const col = f.hair, r = Art.srand(hash(f.hair + f.style + fw.toFixed(2)) + 11);
    const top = cy - 76;
    // 頭頂（丸みのある塊）
    const g = c.createLinearGradient(0, top, 0, cy - 20);
    g.addColorStop(0, shade(col, 1.2)); g.addColorStop(1, shade(col, 0.88));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(cx - fw - 9, cy - 6);
    c.bezierCurveTo(cx - fw - 15, top + 2, cx + fw + 15, top + 2, cx + fw + 9, cy - 6);
    c.quadraticCurveTo(cx + fw * 0.6, cy - 52, cx, cy - 54);
    c.quadraticCurveTo(cx - fw * 0.6, cy - 52, cx - fw - 9, cy - 6);
    c.fill();
    if (f.style === 'buzz') {
      c.beginPath(); c.moveTo(cx - fw - 2, cy - 20); c.quadraticCurveTo(cx, cy - 60, cx + fw + 2, cy - 20); c.lineTo(cx + fw + 6, cy - 40); c.quadraticCurveTo(cx, cy - 84, cx - fw - 6, cy - 40); c.closePath(); c.fill();
    } else {
      // 前髪：分け目から左右へ流れる細い房
      const swept = f.style === 'swept' || f.style === 'side' || f.style === 'slick';
      const part = swept ? cx - fw * 0.45 : cx + (r() - 0.5) * 8;
      const n = f.style === 'spiky' ? 10 : f.female ? 15 : 12;
      const baseLen = f.style === 'slick' ? -34 : f.female ? -20 : f.style === 'short' ? -28 : -24;
      const order = [...Array(n).keys()].sort((a, b) => Math.abs(b - n / 2) - Math.abs(a - n / 2));   // 外側から先に描き、中央を上に重ねる
      for (const i of order) {
        const k = (i + 0.5) / n;
        const rx = cx - fw - 6 + (fw * 2 + 12) * k;
        const ry = top + 6 + Math.pow((rx - cx) / (fw + 10), 2) * 24;
        const dir = swept ? 1 : (rx < part ? -1 : 1);
        const len = baseLen + Math.sin(k * Math.PI) * 6 + (r() - 0.5) * 6 - (f.style === 'spiky' ? 4 : 0) + (Math.abs(k - 0.5) > 0.35 ? 10 : 0);
        const tipX = rx + dir * (swept ? 16 + k * 10 : 6 + Math.abs(rx - part) * 0.25) + (r() - 0.5) * 4;
        const tipY = cy + len - (f.style === 'spiky' ? (i % 2) * 8 : 0);
        const w = (fw * 2 + 12) / n * (f.style === 'spiky' ? 1.15 : 1.05) + r() * 1.5;
        const tone = 0.92 + r() * 0.22;
        strand(c, [rx, ry], [rx + dir * 2, ry + 18], [tipX - dir * 6, tipY - 16], [tipX, tipY], w, shade(col, 1.0 * tone), shade(col, 0.82 * tone), 1, 0.55);
      }
      if (f.style === 'spiky') {
        for (let i = 0; i < 5; i++) { const x = cx - 38 + i * 19; strand(c, [x, top + 22], [x + (i - 2) * 3, top + 8], [x + (i - 2) * 8, top - 2], [x + (i - 2) * 11, top - 12 - (i % 2) * 5], 9, shade(col, 1.15), shade(col, 0.95)); }
      }
      // 毛の流れの線
      c.strokeStyle = Art.hexA(shade(col, 0.45), 0.5); c.lineWidth = 0.7;
      for (let i = 0; i < 10; i++) {
        const x = cx - fw + (fw * 2) * (i + 0.5) / 10, dir = swept ? 1 : (x < part ? -1 : 1);
        c.beginPath(); c.moveTo(x, top + 12 + r() * 6); c.bezierCurveTo(x + dir * 2, cy - 50, x + dir * 6, cy - 36, x + dir * (8 + r() * 6), cy - 24 - r() * 10); c.stroke();
      }
    }
    // 横髪（顔の脇を流れ落ちる）
    if (f.female || f.style === 'long' || f.style === 'bob') {
      [-1, 1].forEach(s => {
        const n = f.female ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const x0 = cx + s * (fw + 4 - i * 4), y0 = cy - 40 + i * 4;
          const len = (f.style === 'bob' ? 40 : 58) + r() * 16 - i * 8;
          strand(c, [x0, y0], [x0 + s * 8, y0 + 20], [x0 + s * (2 + i * 2), y0 + len * 0.7], [x0 - s * (2 - i * 3), y0 + len], 5 - i, shade(col, 1.05), shade(col, 0.68));
        }
      });
    }
    // 輪郭の線（頭頂）
    c.strokeStyle = Art.hexA(shade(col, 0.35), 0.55); c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx - fw - 9, cy - 8); c.bezierCurveTo(cx - fw - 15, top, cx + fw + 15, top, cx + fw + 9, cy - 8); c.stroke();
    // つや（天使の輪）と、毛先の透け
    c.save(); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = 'rgba(255,255,255,.13)'; c.lineWidth = 5;
    c.beginPath(); c.ellipse(cx - 4, cy - 66, fw * 0.62, 9, -0.08, Math.PI * 1.18, Math.PI * 1.72); c.stroke();
    const sg = c.createRadialGradient(cx - fw * 0.4, cy - 66, 2, cx - fw * 0.4, cy - 66, 22);
    sg.addColorStop(0, 'rgba(255,255,255,.18)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sg; c.fillRect(cx - fw - 10, cy - 90, fw * 2, 50);
    c.restore();
  }
  function face(c, f, cx, cy, expr) {
    const ey = cy - 4, ex = 16, es = f.eyeS;
    const eyeW = 12.5 * es, eyeH = (f.female ? 9.5 : 7) * es * (expr === 'shock' ? 1.35 : expr === 'happy' ? 0.55 : expr === 'angry' ? 0.8 : expr === 'sad' ? 0.8 : 1);
    [-1, 1].forEach(s => {
      const x = cx + s * ex;
      if (f.tags.includes('patch') && s === 1) return;
      if (f.tags.includes('visor')) return;
      if (expr === 'happy') {
        c.strokeStyle = '#2a1a1a'; c.lineWidth = 2.4;
        c.beginPath(); c.arc(x, ey + 3, eyeW * 0.8, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
        return;
      }
      // 白目
      c.fillStyle = '#fbfbff';
      c.beginPath(); c.ellipse(x, ey, eyeW, eyeH, 0, 0, 7); c.fill();
      // 瞳
      c.save(); c.beginPath(); c.ellipse(x, ey, eyeW, eyeH, 0, 0, 7); c.clip();
      const ir = eyeH * (f.female ? 1.05 : 1.0);
      // 瞳：上は暗く、下へ明るく（アニメ調の塗り）
      const g = c.createLinearGradient(0, ey - ir, 0, ey + ir);
      g.addColorStop(0, shade(f.eye, 0.4)); g.addColorStop(0.45, f.eye); g.addColorStop(1, shade(f.eye, 1.55));
      c.fillStyle = g; c.beginPath(); c.arc(x + s * 1, ey + 1, ir, 0, 7); c.fill();
      c.strokeStyle = shade(f.eye, 0.3); c.lineWidth = 0.9; c.stroke();
      c.fillStyle = '#07070c'; c.beginPath(); c.ellipse(x + s * 1, ey + 1, ir * (expr === 'shock' ? 0.26 : 0.42), ir * (expr === 'shock' ? 0.26 : 0.5), 0, 0, 7); c.fill();
      // 虹彩の筋
      c.strokeStyle = Art.hexA(shade(f.eye, 1.7), 0.35); c.lineWidth = 0.6;
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; c.beginPath(); c.moveTo(x + s + Math.cos(a) * ir * 0.5, ey + 1 + Math.sin(a) * ir * 0.5); c.lineTo(x + s + Math.cos(a) * ir * 0.92, ey + 1 + Math.sin(a) * ir * 0.92); c.stroke(); }
      c.fillStyle = 'rgba(255,255,255,.96)'; c.beginPath(); c.ellipse(x - 2 + s, ey - ir * 0.42, ir * 0.3, ir * 0.24, -0.4, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(x + 2 + s, ey + ir * 0.45, ir * 0.13, 0, 7); c.fill();
      // 上まぶたの影
      c.fillStyle = 'rgba(40,20,30,.22)'; c.fillRect(x - eyeW, ey - eyeH, eyeW * 2, eyeH * 0.5);
      c.restore();
      // 下まつげ・二重のしわ
      c.strokeStyle = 'rgba(60,30,30,.45)'; c.lineWidth = 0.8;
      c.beginPath(); c.ellipse(x, ey, eyeW * 0.92, eyeH, 0, Math.PI * 0.2, Math.PI * 0.8); c.stroke();
      c.strokeStyle = shade(f.skin, 0.68); c.beginPath(); c.ellipse(x, ey - 1.5, eyeW * 1.02, eyeH * 1.3, 0, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
      // まつげ・まぶた
      c.strokeStyle = '#140e12'; c.lineCap = 'round';
      // 目頭は細く、目尻へ太い三日月形
      c.fillStyle = '#140e12'; c.beginPath();
      const A0 = Math.PI * 1.02, A1 = Math.PI * 1.98, NN = 14, pts = [];
      for (let i = 0; i <= NN; i++) { const a = A0 + (A1 - A0) * i / NN; pts.push([x + Math.cos(a) * eyeW, ey + Math.sin(a) * eyeH]); }
      pts.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py));
      for (let i = NN; i >= 0; i--) { const a = A0 + (A1 - A0) * i / NN, outer = s > 0 ? i / NN : 1 - i / NN, th = (f.female ? 1.2 : 0.9) + outer * outer * (f.female ? 3.2 : 2.2); c.lineTo(x + Math.cos(a) * (eyeW + th * 0.3), ey + Math.sin(a) * (eyeH + th)); }
      c.closePath(); c.fill();
      // 目尻のはね
      c.lineWidth = f.female ? 2 : 1.6; c.beginPath(); c.moveTo(x + s * eyeW * 0.96, ey - eyeH * 0.2); c.quadraticCurveTo(x + s * (eyeW + 3), ey - eyeH * 0.5, x + s * (eyeW + (f.female ? 5 : 3)), ey - eyeH * (f.female ? 0.95 : 0.6)); c.stroke();
      c.lineCap = 'butt';
      if (f.female) { c.beginPath(); c.moveTo(x + s * eyeW * 0.95, ey - eyeH * 0.3); c.lineTo(x + s * (eyeW + 4), ey - eyeH * 0.8); c.stroke(); }
    });
    // 眉
    c.strokeStyle = shade(f.hair, 0.6); c.lineWidth = 2.2 + f.brow * 1.6; c.lineCap = 'round';
    [-1, 1].forEach(s => {
      const x = cx + s * ex, by = ey - 13 - (expr === 'shock' ? 5 : 0);
      let a = 0;
      if (expr === 'angry') a = 0.35; if (expr === 'sad') a = -0.3; if (f.pers === '猛進' && expr === 'normal') a = 0.15;
      // 内側（鼻に近い側）を下げると怒り顔、上げると憂い顔
      c.beginPath(); c.moveTo(x - s * 10, by + a * 7); c.lineTo(x + s * 9, by - a * 6); c.stroke();
    });
    c.lineCap = 'butt';
    // 鼻
    c.strokeStyle = shade(f.skin, 0.7); c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(cx + 1, cy + 4); c.lineTo(cx + 3, cy + 14); c.lineTo(cx - 1, cy + 15); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(cx - 1, cy + 8, 1, 3.5, 0, 0, 7); c.fill();
    // 口
    const my = cy + 28;
    c.strokeStyle = f.lip || shade(f.skin, 0.55); c.lineWidth = 2.2; c.fillStyle = '#6a2a2a';
    c.beginPath();
    if (expr === 'happy') { c.moveTo(cx - 10, my - 2); c.quadraticCurveTo(cx, my + 9, cx + 10, my - 2); c.closePath(); c.fill(); c.stroke(); }
    else if (expr === 'angry') { c.moveTo(cx - 9, my + 2); c.lineTo(cx + 9, my); c.stroke(); c.beginPath(); c.moveTo(cx - 6, my + 1); c.lineTo(cx + 6, my + 0.5); c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke(); }
    else if (expr === 'sad') { c.moveTo(cx - 8, my + 3); c.quadraticCurveTo(cx, my - 3, cx + 8, my + 3); c.stroke(); }
    else if (expr === 'shock') { c.ellipse(cx, my + 1, 5, 7, 0, 0, 7); c.fill(); }
    else { c.moveTo(cx - 8, my); c.quadraticCurveTo(cx, my + (f.pers === '奔放' || f.pers === '仁徳' ? 4 : 1.5), cx + 8, my - (f.pers === '野心' ? 2 : 0)); c.stroke(); }
    if (f.female && expr !== 'shock' && expr !== 'happy') { c.fillStyle = Art.hexA(f.lip, 0.35); c.beginPath(); c.ellipse(cx, my + 3, 5, 2, 0, 0, 7); c.fill(); }
    // 頬
    if (f.female || expr === 'happy') { c.fillStyle = 'rgba(255,120,120,.16)'; [-1, 1].forEach(s => { c.beginPath(); c.ellipse(cx + s * 26, cy + 12, 9, 5, 0, 0, 7); c.fill(); }); }
    // 老い
    if (f.old) { c.strokeStyle = shade(f.skin, 0.75); c.lineWidth = 1; [-1, 1].forEach(s => { c.beginPath(); c.moveTo(cx + s * 30, ey + 2); c.lineTo(cx + s * 34, ey + 6); c.moveTo(cx + s * 12, cy + 20); c.quadraticCurveTo(cx + s * 16, cy + 28, cx + s * 14, cy + 34); c.stroke(); }); c.beginPath(); c.moveTo(cx - 12, cy - 38); c.lineTo(cx + 12, cy - 38); c.stroke(); }
  }
  function beard(c, f, cx, cy, fw, fh) {
    c.fillStyle = Art.hexA(shade(f.hair, 0.8), 0.92);
    c.beginPath(); c.moveTo(cx - fw * 0.85, cy + 8);
    c.bezierCurveTo(cx - fw * 0.8, cy + fh * 0.9, cx + fw * 0.8, cy + fh * 0.9, cx + fw * 0.85, cy + 8);
    c.lineTo(cx + 12, cy + 24); c.quadraticCurveTo(cx, cy + 20, cx - 12, cy + 24); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(cx - 14, cy + 22); c.quadraticCurveTo(cx, cy + 16, cx + 14, cy + 22); c.lineTo(cx + 12, cy + 25); c.quadraticCurveTo(cx, cy + 21, cx - 12, cy + 25); c.fill();
  }
  function cyberFace(c, f, cx, cy, fw) {
    c.strokeStyle = 'rgba(80,220,255,.7)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(cx + fw * 0.95, cy - 30); c.lineTo(cx + fw * 0.4, cy - 30); c.lineTo(cx + fw * 0.3, cy - 10); c.lineTo(cx + fw * 0.5, cy + 20); c.lineTo(cx + fw * 0.8, cy + 24); c.stroke();
    c.fillStyle = 'rgba(80,220,255,.9)'; c.fillRect(cx + fw * 0.7, cy - 26, 3, 3); c.fillRect(cx + fw * 0.55, cy + 18, 3, 3);
  }
  function accessories(c, f, cx, cy, fw, expr) {
    const ey = cy - 6;
    if (f.tags.includes('scar')) { c.strokeStyle = 'rgba(150,60,60,.8)'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 30, ey - 22); c.lineTo(cx - 12, ey + 18); c.stroke(); }
    if (f.tags.includes('patch')) {
      c.fillStyle = '#141018'; c.beginPath(); c.ellipse(cx + 18, ey, 12, 10, 0, 0, 7); c.fill();
      c.strokeStyle = '#141018'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(cx - fw, ey - 20); c.lineTo(cx + fw, ey + 6); c.stroke();
    }
    if (f.tags.includes('glasses')) {
      c.strokeStyle = '#c8c8d0'; c.lineWidth = 1.6;
      [-1, 1].forEach(s => { c.strokeRect(cx + s * 18 - 12, ey - 8, 24, 16); });
      c.beginPath(); c.moveTo(cx - 6, ey - 2); c.lineTo(cx + 6, ey - 2); c.stroke();
      c.fillStyle = 'rgba(200,230,255,.15)'; [-1, 1].forEach(s => c.fillRect(cx + s * 18 - 12, ey - 8, 24, 16));
    }
    if (f.tags.includes('visor')) {
      const g = c.createLinearGradient(cx - fw, 0, cx + fw, 0);
      g.addColorStop(0, '#0a1a2a'); g.addColorStop(0.5, f.cyber ? '#1a4a6a' : '#3a1a2a'); g.addColorStop(1, '#0a1a2a');
      c.fillStyle = g; c.beginPath(); c.moveTo(cx - fw - 4, ey - 10); c.lineTo(cx + fw + 4, ey - 10); c.lineTo(cx + fw, ey + 8); c.lineTo(cx - fw, ey + 8); c.closePath(); c.fill();
      c.fillStyle = expr === 'angry' ? '#ff4060' : f.cyber ? '#40e8ff' : '#ff80a0';
      c.fillRect(cx - fw * 0.7, ey - 2, fw * 1.4, 2.5);
    }
    if (f.cyber && !f.tags.includes('visor')) {
      c.fillStyle = 'rgba(80,230,255,.35)'; c.beginPath(); c.arc(cx + 18, ey, 10, 0, 7); c.fill();
    }
    if (f.tags.includes('veil')) {
      c.fillStyle = '#f8f4ff'; c.beginPath(); c.moveTo(cx - 56, cy - 30); c.bezierCurveTo(cx - 50, cy - 90, cx + 50, cy - 90, cx + 56, cy - 30); c.lineTo(cx + 44, cy - 40); c.bezierCurveTo(cx + 30, cy - 70, cx - 30, cy - 70, cx - 44, cy - 40); c.closePath(); c.fill();
      c.strokeStyle = '#d4af37'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 44, cy - 42); c.bezierCurveTo(cx - 30, cy - 70, cx + 30, cy - 70, cx + 44, cy - 42); c.stroke();
      c.fillStyle = '#d4af37'; c.beginPath(); c.arc(cx, cy - 62, 4, 0, 7); c.fill();
    }
  }

  function url(key, expr = 'normal') {
    if (!OFF[key]) return '';
    const live = typeof G !== 'undefined' && G && G.officers && G.officers[key];
    const rk = live ? (Game.isLeader(key) ? 'L' : Game.rankIdx(key)) : (FACTIONS.some(F => F.leader === key) ? 'L' : Game.rankIdx(key));
    const medals = Math.min(4, Math.floor((live ? G.officers[key].merit : initMerit(OFF[key])) / 45));
    const k = key + ':' + expr + ':' + rk + ':' + medals;
    if (!cache.has(k)) cache.set(k, draw(key, expr, rk));
    return cache.get(k);
  }
  return { url };
})();
