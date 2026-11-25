// ============================================================
//  士官の肖像（コードで描く。名前から顔立ちが決まり、表情を変えられる）
//  expr: normal 通常 / angry 怒り / happy 喜び / sad 憂い / shock 驚き
// ============================================================
const Portrait = (() => {
  // 覚えておく数に上限をつける（iPhone のメモリ不足で落ちないように）。
  //  大きな顔（会話・人物の詳細）と、小さな顔（一覧・作戦室など）を別々に覚える。古い物から捨てる
  const cache = new Map(), small = new Map();
  const BIG_MAX = 36, SMALL_MAX = 260, TW = 96, TH = 115;
  const PW = 180, PH = 216;
  function remember(m, k, v, max) { m.set(k, v); while (m.size > max) m.delete(m.keys().next().value); return v; }
  function recall(m, k) { const v = m.get(k); if (v !== undefined) { m.delete(k); m.set(k, v); } return v; }
  // キャンバスの中身を手放す（Safari は参照が消えても、すぐには放さないことがある）
  const free = cv => { try { cv.width = cv.height = 0; } catch (e) { } };
  let thumbCv = null;
  function toUrls(cv, wantSmall) {
    const big = cv.toDataURL('image/jpeg', 0.9);
    let sm = null;
    if (wantSmall) {
      if (!thumbCv) { thumbCv = document.createElement('canvas'); thumbCv.width = TW * 2; thumbCv.height = TH * 2; }
      const t = thumbCv.getContext('2d'); t.imageSmoothingQuality = 'high'; t.drawImage(cv, 0, 0, thumbCv.width, thumbCv.height);
      sm = thumbCv.toDataURL('image/jpeg', 0.88);
    }
    free(cv);
    return { big, sm };
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const ANIME_SKINS = ['#fde9dd', '#fbe1d0', '#f8dac6', '#f3d0b8', '#e9c1a2', '#d8a882', '#bf8c68', '#fff1e8'];
  const SKINS = ['#f6dcc4', '#f0cfb0', '#e8bf98', '#d8a880', '#c28c62', '#9c6a48', '#7a5038', '#f8e4d4'];
  const HAIRS = ['#1a1418', '#2a1e1a', '#4a2e1e', '#7a4a28', '#c89858', '#e8d090', '#d8d8e0', '#8a2a22', '#283a6a', '#3a6a7a', '#f0f0f4', '#5a3a6a'];
  const EYES = ['#3a5a8a', '#4a7a4a', '#7a4a2a', '#2a2a32', '#8a6a2a', '#5a3a8a', '#2a8a9a', '#a03030', '#6a7a8a'];
  const shade = (hex, k) => Art.mix(hex, k > 1 ? '#ffffff' : '#000000', Math.abs(1 - k));

  function features(key, S0) {
    const S = S0 || OFF[key];
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
      skin: cyber && r() < 0.5 ? '#e8eef4' : (STYLE === 'anime' && S.female ? ANIME_SKINS : SKINS)[Math.floor(r() * SKINS.length)],
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
      merit: S0 ? 0 : typeof G !== 'undefined' && G && G.officers[key] ? G.officers[key].merit : initMerit(S),
    };
  }

  function draw(key, expr, rk, S0) {
    const SC = 2;   // 2倍の細かさで描く
    const cv = document.createElement('canvas'); cv.width = PW * SC; cv.height = PH * SC;
    const c = cv.getContext('2d'); c.scale(SC, SC);
    const f = features(key, S0);
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
    if (STYLE === 'anime') animeFigure(c, f, cx, cy, expr); else classicFigure(c, f, cx, cy, expr);
    finishPortrait(c, f, cx, cy, expr);
    return cv;
  }
  function classicFigure(c, f, cx, cy, expr) {
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
  }
  function finishPortrait(c, f, cx, cy, expr) {
    const fw = 38 * f.jaw, fh = 52 * f.faceL;
    // 縁の光（右から国の色の光が当たる）
    if (STYLE !== 'anime') {
    c.save(); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = Art.hexA(f.col2, 0.35); c.lineWidth = 2.2;
    c.beginPath(); c.ellipse(cx, cy - 30, 50, 52, 0, -1.3, 0.35); c.stroke();
    c.strokeStyle = Art.hexA(f.col, 0.3); c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(cx + fw - 1, cy - 20); c.bezierCurveTo(cx + fw + 1, cy + 4, cx + fw * 0.78, cy + fh * 0.5, cx + fw * 0.3, cy + fh * 0.84); c.stroke();
    c.restore();
    }
    // 表情の効果
    if (expr === 'angry' && STYLE !== 'anime') { c.strokeStyle = 'rgba(255,60,40,.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx + 44, cy - 52); c.lineTo(cx + 54, cy - 46); c.moveTo(cx + 48, cy - 56); c.lineTo(cx + 52, cy - 44); c.stroke(); }
    if (expr === 'sad') { const sg = c.createLinearGradient(0, 0, 0, 80); sg.addColorStop(0, 'rgba(30,50,120,.3)'); sg.addColorStop(1, 'rgba(30,50,120,0)'); c.fillStyle = sg; c.fillRect(0, 0, PW, 80); }
    if (expr === 'shock' && STYLE !== 'anime') { c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.5; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(cx - 58 + i * 5, cy - 50 + i * 3); c.lineTo(cx - 50 + i * 5, cy - 40 + i * 3); c.stroke(); } }
    // 周辺を少し暗く
    const vg = c.createRadialGradient(PW / 2, PH * 0.45, PH * 0.35, PW / 2, PH * 0.5, PH * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, STYLE === 'anime' ? 'rgba(0,0,0,.3)' : 'rgba(0,0,0,.45)');
    c.fillStyle = vg; c.fillRect(0, 0, PW, PH);
    // 粒子（フィルムのざらつき）。アニメ調は塗りをきれいに見せるため、かけない
    c.save(); c.globalAlpha = STYLE === 'anime' ? 0 : 0.07; c.globalCompositeOperation = 'overlay'; c.fillStyle = c.createPattern(grain(), 'repeat'); c.fillRect(0, 0, PW, PH); c.restore();
    // 縁
    c.strokeStyle = Art.hexA(f.col2, 0.7); c.lineWidth = 2; c.strokeRect(1, 1, PW - 2, PH - 2);
    c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1; c.strokeRect(3.5, 3.5, PW - 7, PH - 7);
  }
  // ============================================================
  //  アニメ調の顔（大きな瞳・小さな鼻と口・とがったあご・くっきりした影・太い房の前髪）
  // ============================================================
  let STYLE = 'anime';
  try { const v = localStorage.getItem('seisou_face'); if (v === 'classic' || v === 'anime') STYLE = v; } catch (e) { }
  const lineCol = f => Art.mix(f.skin, '#2a1014', 0.72);
  function animeFigure(c, f, cx, cy, expr) {
    backHair(c, f, cx, cy);
    const fem = f.female;
    // 男性は「これまでの絵」の骨格（すっきりした逆三角の輪郭）を、アニメ調の線と塗りで描く（精悍さを残す）
    const fw = fem ? 36.5 * (0.94 + (f.jaw - 0.86) * 0.5) : 38 * f.jaw, fh = 52 * f.faceL, chinY = fem ? cy + 45 * f.faceL : cy + fh * 0.98;
    const LC = lineCol(f);
    // 首（描き方の講座の目安）：正面で頭の幅の約半分。女性は目の中心より少し内側の幅で細く、男性は太め。
    //  肩の付け根へ少し外へ広がる。首筋の描き込みは控えめ（華奢に見える）。付け根は襟に隠す
    const nw = fem ? 15 : 14;
    c.fillStyle = shade(f.skin, 0.93);
    c.beginPath(); c.moveTo(cx - nw, cy + 20); c.lineTo(cx - nw, cy + 58); c.quadraticCurveTo(cx - nw, cy + 66, cx - nw - 8, cy + 72); c.lineTo(cx + nw + 8, cy + 72); c.quadraticCurveTo(cx + nw, cy + 66, cx + nw, cy + 58); c.lineTo(cx + nw, cy + 20); c.fill();
    c.strokeStyle = LC; c.lineWidth = 0.95; c.beginPath();
    [-1, 1].forEach(s => { c.moveTo(cx + s * nw, cy + 32); c.lineTo(cx + s * nw, cy + 58); c.quadraticCurveTo(cx + s * nw, cy + 65, cx + s * (nw + 6), cy + 70); });
    c.stroke();
    if (!fem) { c.strokeStyle = Art.hexA(LC, 0.3); c.lineWidth = 0.8; c.beginPath(); [-1, 1].forEach(s => { c.moveTo(cx + s * (nw - 5), cy + 42); c.lineTo(cx + s * 4, cy + 64); }); c.stroke(); }
    body(c, f, cx);
    // あごの下の影（首の丸みに沿った弧）
    c.fillStyle = shade(f.skin, 0.76);
    c.beginPath(); c.moveTo(cx - nw - 0.5, cy + 26); c.quadraticCurveTo(cx, chinY + 14, cx + nw + 0.5, cy + 26); c.lineTo(cx + nw, cy + 20); c.lineTo(cx - nw, cy + 20); c.fill();
    // 顔の形：ふっくらした頬と、小さくとがったあご
    // 頬からあご先まで（右のこめかみから左のこめかみまで）。女性は丸い頬と小さく丸いあご、男性は逆三角
    const jaw = y0 => {
      if (fem) {
        c.bezierCurveTo(cx + fw + 1.5, cy - 6, cx + fw * 0.94, cy + 16, cx + fw * 0.6, cy + 31);
        c.quadraticCurveTo(cx + fw * 0.28, chinY - 4, cx + fw * 0.1, chinY - 0.5);
        c.quadraticCurveTo(cx, chinY + 0.7, cx - fw * 0.1, chinY - 0.5);
        c.quadraticCurveTo(cx - fw * 0.28, chinY - 4, cx - fw * 0.6, cy + 31);
        c.bezierCurveTo(cx - fw * 0.94, cy + 16, cx - fw - 1.5, cy - 6, cx - fw, y0);
      } else {
        c.bezierCurveTo(cx + fw + 1, cy + 4, cx + fw * 0.78, cy + fh * 0.5, cx + fw * 0.3, cy + fh * 0.84);
        c.quadraticCurveTo(cx, cy + fh * 0.98, cx - fw * 0.3, cy + fh * 0.84);
        c.bezierCurveTo(cx - fw * 0.78, cy + fh * 0.5, cx - fw - 1, cy + 4, cx - fw, y0);
      }
    };
    const facePath = () => {
      c.beginPath();
      c.moveTo(cx - fw, cy - 36);
      c.bezierCurveTo(cx - fw - 2, cy - 80, cx + fw + 2, cy - 80, cx + fw, cy - 36);
      jaw(cy - 36);
      c.closePath();
    };
    // 耳：横髪のある髪型（女性・長い髪・おかっぱ）は髪に隠れるので描かない
    if (!(fem || f.style === 'long' || f.style === 'bob' || f.style === 'side')) [-1, 1].forEach(s => {
      c.fillStyle = shade(f.skin, 0.95); c.beginPath(); c.ellipse(cx + s * (fw - 1), cy + 11, 4, 8, s * 0.2, 0, 7); c.fill();
      c.strokeStyle = LC; c.lineWidth = 0.9; c.stroke();
    });
    const fg = c.createLinearGradient(0, cy - 40, 0, chinY);
    fg.addColorStop(0, shade(f.skin, 1.03)); fg.addColorStop(1, f.skin);
    c.fillStyle = fg; facePath(); c.fill();
    // 影：右の頬の縁（くっきりした三日月）
    c.save(); facePath(); c.clip();
    c.fillStyle = Art.hexA(shade(f.skin, 0.8), 0.5);
    c.beginPath(); c.ellipse(cx + fw * 1.38, cy + 4, fw * 0.6, 60, 0.12, 0, 7); c.fill();
    c.restore();
    c.strokeStyle = LC; c.lineWidth = 1.05; c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(cx + fw, cy - 20);
    jaw(cy - 20);
    c.stroke();
    // ここから顔の部品：顔の輪郭の内側にだけ描く（はみ出さない）
    c.save(); facePath(); c.clip();
    // 頬の赤み（ふんわり）と、照れの斜線
    const blush = fem ? 0.32 : expr === 'happy' ? 0.1 : 0;
    [-1, 1].forEach(s => {
      const bx = cx + s * fw * 0.6, by = cy + 16;
      const g = c.createRadialGradient(bx, by, 0, bx, by, 12); g.addColorStop(0, `rgba(255,105,120,${blush})`); g.addColorStop(1, 'rgba(255,105,120,0)');
      c.fillStyle = g; c.fillRect(bx - 13, by - 9, 26, 18);
      if (fem || expr === 'happy') { c.strokeStyle = `rgba(230,80,95,${fem ? 0.5 : 0.35})`; c.lineWidth = 0.9; c.lineCap = 'round'; c.beginPath(); for (let i = 0; i < 3; i++) { const hx = bx - 5 + i * 4; c.moveTo(hx + 1.5, by - 2.5); c.lineTo(hx - 1.5, by + 2.5); } c.stroke(); c.lineCap = 'butt'; }
    });
    if (f.cyber) cyberFace(c, f, cx, cy + 6, fw);
    const E = animeEyes(c, f, cx, cy, expr);
    animeMouth(c, f, cx, cy, expr);
    c.restore();
    if (f.tags.includes('beard')) animeBeard(c, f, cx, cy, fw, chinY);
    animeFrontHair(c, f, cx, cy, fw, facePath);
    c.save(); facePath(); c.clip();   // 眉・眼鏡・傷なども顔の内側だけ
    animeBrows(c, f, cx, E, expr);
    animeAccessories(c, f, cx, cy, fw, expr, E);
    c.restore();
    animeVeil(c, f, cx, cy);
    animeMarks(c, f, cx, cy, fw, expr, E);
    crown(c, f, cx, cy);
  }
  function animeEyes(c, f, cx, cy, expr) {
    const fem = f.female, old = f.old;
    // 目の大きさと間隔（描き方の講座の図から）：目と目の間は目1つ分、顔の幅はおよそ目尻から目尻まで
    //  女性は目を少し大きく、間を目0.7個分に詰める（見比べて、離れすぎず大きすぎない所）
    const W = (fem ? 11.5 : 11.5) * f.eyeS * (old ? 0.92 : 1), H = (fem ? 11.5 : 7) * f.eyeS * (old ? 0.85 : 1) * (expr === 'shock' ? 1.3 : 1);
    const ey = cy + (fem ? 4 : -2), ex = fem ? W * 1.68 : 17.5;
    const LC = lineCol(f), lash = '#1a0e12';
    const E = { ey, ex, W, H };
    [-1, 1].forEach(s => {
      const x = cx + s * ex;
      if (f.tags.includes('visor')) return;
      if (f.tags.includes('patch') && s === 1) return;
      const inner = x - s * W, outer = x + s * W;
      if (expr === 'happy') {
        // にっこり：上に弓なりの線
        c.strokeStyle = lash; c.lineWidth = fem ? 3.2 : 2.8; c.lineCap = 'round';
        c.beginPath(); c.moveTo(inner, ey + 3); c.quadraticCurveTo(x, ey - H * 0.75, outer, ey + 3); c.stroke();
        if (fem) { c.lineWidth = 1.6; c.beginPath(); c.moveTo(outer, ey + 2); c.lineTo(outer + s * 4, ey - 1); c.stroke(); }
        c.lineCap = 'butt';
        return;
      }
      // 上まぶたの線：表情で傾ける（怒り＝目頭が下がる、憂い＝目頭が上がる）
      let iY = ey - H * 0.32, oY = ey - H * (f.female ? 0.22 : 0.3), cY = ey - H * 1.12;   // ほぼ水平（目尻を上げるときつく見える）
      if (expr === 'angry') { iY = ey - H * 0.02; oY = ey - H * 0.62; cY = ey - H * 0.82; }
      if (expr === 'sad') { iY = ey - H * 0.6; oY = ey - H * 0.12; cY = ey - H * 1.05; }
      if (!fem && expr === 'normal') { iY = ey - H * 0.15; oY = ey - H * 0.48; cY = ey - H * 1.02; }   // 男性：目尻が少し上がった、鋭い目
      const bY = ey + H * 0.95;
      const shape = () => { c.beginPath(); c.moveTo(inner, iY); c.quadraticCurveTo(x, cY, outer, oY); c.quadraticCurveTo(outer + s * 0.5, ey + H * 0.6, x + s * W * 0.3, bY); c.quadraticCurveTo(inner + s * 1, ey + H * 0.9, inner, iY); c.closePath(); };
      // 白目（上は影で青み）
      c.fillStyle = '#ffffff'; shape(); c.fill();
      c.save(); shape(); c.clip();
      c.fillStyle = 'rgba(150,160,200,.45)'; c.beginPath(); c.moveTo(inner - 2, iY - 2); c.quadraticCurveTo(x, cY - 2, outer + 2, oY - 2); c.lineTo(outer + 2, oY + H * 0.4); c.quadraticCurveTo(x, cY + H * 0.75, inner - 2, iY + H * 0.4); c.fill();
      // 瞳（大きく縦長）
      const ir = { x: x + s * W * 0.05 * (expr === 'sad' ? 0 : 1), y: ey + H * 0.2, rx: W * (fem ? 0.66 : 0.55) * (expr === 'shock' ? 0.6 : 1), ry: H * (fem ? 1.08 : 1.15) * (expr === 'shock' ? 0.55 : 1) };
      const g = c.createLinearGradient(0, ir.y - ir.ry, 0, ir.y + ir.ry);
      g.addColorStop(0, shade(f.eye, 0.22)); g.addColorStop(0.45, shade(f.eye, 0.75)); g.addColorStop(0.8, f.eye); g.addColorStop(1, shade(f.eye, 1.75));
      c.fillStyle = g; c.beginPath(); c.ellipse(ir.x, ir.y, ir.rx, ir.ry, 0, 0, 7); c.fill();
      // 下の光の溜まり
      c.save(); c.globalCompositeOperation = 'lighter';
      const lg = c.createRadialGradient(ir.x, ir.y + ir.ry * 0.6, 0, ir.x, ir.y + ir.ry * 0.6, ir.rx * 0.9);
      lg.addColorStop(0, Art.hexA(shade(f.eye, 1.6), 0.55)); lg.addColorStop(1, Art.hexA(shade(f.eye, 1.6), 0));
      c.fillStyle = lg; c.beginPath(); c.ellipse(ir.x, ir.y, ir.rx, ir.ry, 0, 0, 7); c.fill();
      c.restore();
      // 瞳孔と縁
      c.fillStyle = shade(f.eye, 0.12); c.beginPath(); c.ellipse(ir.x, ir.y - ir.ry * 0.05, ir.rx * (expr === 'shock' ? 0.3 : 0.42), ir.ry * (expr === 'shock' ? 0.3 : 0.48), 0, 0, 7); c.fill();
      c.strokeStyle = shade(f.eye, 0.18); c.lineWidth = 1; c.beginPath(); c.ellipse(ir.x, ir.y, ir.rx - 0.4, ir.ry - 0.4, 0, 0, 7); c.stroke();
      // 上まぶたの落とす影（くっきり）
      c.fillStyle = 'rgba(30,15,40,.2)'; c.beginPath(); c.moveTo(inner - 2, iY - 3); c.quadraticCurveTo(x, cY - 3, outer + 2, oY - 3); c.lineTo(outer + 2, oY + H * 0.28); c.quadraticCurveTo(x, cY + H * 0.62, inner - 2, iY + H * 0.28); c.fill();
      // ハイライト：大きな光・小さな光・下のきらめき
      if (expr !== 'shock') {
        c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(ir.x - s * ir.rx * 0.32, ir.y - ir.ry * 0.38, ir.rx * 0.36, ir.ry * 0.26, -0.4 * s, 0, 7); c.fill();
        c.beginPath(); c.arc(ir.x + s * ir.rx * 0.38, ir.y + ir.ry * 0.3, ir.rx * 0.14, 0, 7); c.fill();
        if (fem) { c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(ir.x - s * ir.rx * 0.1, ir.y + ir.ry * 0.55, ir.rx * 0.09, 0, 7); c.fill(); }
      } else { c.fillStyle = '#fff'; c.beginPath(); c.arc(ir.x - ir.rx * 0.3, ir.y - ir.ry * 0.3, ir.rx * 0.2, 0, 7); c.fill(); }
      if (expr === 'sad') { c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(ir.x, ir.y + ir.ry * 0.62, ir.rx * 0.7, ir.ry * 0.14, 0, 0, 7); c.fill(); }
      if (f.cyber) { c.strokeStyle = 'rgba(200,255,255,.65)'; c.lineWidth = 0.6; c.beginPath(); c.ellipse(ir.x, ir.y, ir.rx * 0.65, ir.ry * 0.65, 0, 0, 7); c.stroke(); }
      c.restore();
      // 上まつげの太い線（目尻へ太く、外へはねる）
      const th0 = fem ? 1.6 : 1.4, th1 = fem ? 4.2 : 2.6;
      c.fillStyle = lash; c.beginPath();
      const N = 16, P = [], Q = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, u = 1 - t;
        const px = u * u * inner + 2 * u * t * x + t * t * outer, py = u * u * iY + 2 * u * t * cY + t * t * oY;
        const th = th0 + (th1 - th0) * t * t;
        P.push([px, py]); Q.push([px, py - th]);
      }
      c.moveTo(P[0][0], P[0][1]); P.forEach(p => c.lineTo(p[0], p[1]));
      // 目尻のはね
      const wing = fem ? 3.5 : 2;
      c.lineTo(outer + s * wing, oY - (fem ? 4 : 2.5));
      for (let i = N; i >= 0; i--) c.lineTo(Q[i][0], Q[i][1]);
      c.closePath(); c.fill();
      if (fem) {
        c.strokeStyle = lash; c.lineWidth = 1.1; c.lineCap = 'round'; c.beginPath();
        for (let i = 0; i < 3; i++) { const t = 0.62 + i * 0.14, u = 1 - t; const px = u * u * inner + 2 * u * t * x + t * t * outer, py = u * u * iY + 2 * u * t * cY + t * t * oY - (th0 + (th1 - th0) * t * t); c.moveTo(px, py); c.lineTo(px + s * (2.5 + i), py - 3 - i * 0.6); }
        c.stroke(); c.lineCap = 'butt';
      }
      // 二重の線
      c.strokeStyle = Art.hexA(LC, 0.6); c.lineWidth = 0.8; c.beginPath(); c.moveTo(inner + s * W * 0.2, iY - (fem ? 5 : 4)); c.quadraticCurveTo(x, cY - (fem ? 6 : 4), outer - s * 1, oY - (fem ? 6 : 4.5)); c.stroke();
      // 下まつげ（目尻寄りに短く）
      c.strokeStyle = Art.hexA(lash, 0.75); c.lineWidth = fem ? 1.1 : 0.9; c.beginPath(); c.moveTo(outer - s * 0.5, oY + H * 0.75); c.quadraticCurveTo(outer - s * W * 0.3, bY + 0.5, x + s * W * 0.05, bY + 0.6); c.stroke();
      if (old) { c.strokeStyle = Art.hexA(LC, 0.45); c.lineWidth = 0.8; c.beginPath(); c.moveTo(outer + s * 3, ey + 2); c.lineTo(outer + s * 7, ey + 4); c.moveTo(outer + s * 3, ey + 6); c.lineTo(outer + s * 6, ey + 9); c.stroke(); }
    });
    return E;
  }
  function animeBrows(c, f, cx, E, expr) {
    const fem = f.female;
    c.save(); c.globalAlpha = fem ? 0.92 : 1;
    c.fillStyle = shade(f.hair, (f.hair === '#f0f0f4' || f.hair === '#d8d8e0' ? 0.6 : 0.55) * (fem ? 1 : 0.85));
    [-1, 1].forEach(s => {
      const x = cx + s * E.ex, by = E.ey - E.H - (fem ? 11 : 4) - (expr === 'shock' ? 4 : 0);   // 女性は眉と目を離して柔らかく、男性は近づけて精悍に
      let a = 0; if (expr === 'angry') a = 1; if (expr === 'sad') a = -1; if (!fem && expr === 'normal' && f.pers === '猛進') a = 0.5;
      const iX = x - s * (E.W * (fem ? 0.95 : 0.9)), oX = x + s * (E.W * (fem ? 1.05 : 0.95));
      const iY = by + a * 5 + (a < 0 ? -1 : 0), oY = by - a * 3 + (a < 0 ? 2 : 0) + 1;
      const t = fem ? 1.6 : 3.2 + f.brow * 1.4;
      if (fem) { c.beginPath(); c.moveTo(iX, iY); c.quadraticCurveTo(x, by - 3 - (a === 0 ? 1 : 0), oX, oY); c.quadraticCurveTo(x, by - 3 - t - (a === 0 ? 1 : 0), iX - s * 0.5, iY - t); c.closePath(); c.fill(); }
      // 男性：眉頭が太く、眉尻へ細くなる、まっすぐな眉（これまでの絵の精悍な眉）
      else { c.beginPath(); c.moveTo(iX, iY + 0.5); c.quadraticCurveTo(x, by - 1, oX, oY); c.lineTo(oX - s * 1.5, oY - t * 0.45); c.quadraticCurveTo(x, by - 1 - t, iX + s * 0.3, iY - t + 0.5); c.closePath(); c.fill(); }
    });
    c.restore();
  }
  function animeMouth(c, f, cx, cy, expr) {
    const fem = f.female, my = cy + (fem ? 31 : 28) * f.faceL, LC = lineCol(f);
    if (!fem) {
      c.fillStyle = 'rgba(120,50,50,.14)'; c.beginPath(); c.moveTo(cx + 1.5, cy + 3); c.quadraticCurveTo(cx + 6, cy + 12, cx + 4, cy + 15.5); c.lineTo(cx, cy + 15.5); c.quadraticCurveTo(cx + 3, cy + 10, cx + 1.5, cy + 3); c.fill();
      c.strokeStyle = Art.hexA(LC, 0.55); c.lineWidth = 1; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx + 3.5, cy + 12.5); c.quadraticCurveTo(cx + 3.5, cy + 15.5, cx - 1, cy + 15.6); c.stroke();
    }
    // 鼻：小さな影と点
    c.strokeStyle = Art.hexA(LC, 0.45); c.lineWidth = 1; c.lineCap = 'round';
    if (fem) { c.beginPath(); c.moveTo(cx + 1.6, cy + 16.5); c.lineTo(cx + 0.4, cy + 18); c.stroke(); }
    c.strokeStyle = LC; c.lineWidth = 1.3;
    if (expr === 'happy') {
      // 笑顔：口角の上がった弧（口の中や舌は描かない）
      c.lineWidth = 1.4; c.beginPath(); c.moveTo(cx - 7, my - 1.5); c.quadraticCurveTo(cx, my + 6, cx + 7, my - 1.5); c.stroke();
    } else if (expr === 'angry') {
      c.beginPath(); c.moveTo(cx - 7, my + 1); c.lineTo(cx + 7, my - 0.5); c.lineTo(cx + 5, my + 5); c.lineTo(cx - 5, my + 5.5); c.closePath();
      c.fillStyle = '#6a1a26'; c.fill(); c.save(); c.clip(); c.fillStyle = '#fff'; c.fillRect(cx - 8, my - 1, 16, 2.6); c.restore(); c.stroke();
    } else if (expr === 'sad') {
      c.beginPath(); c.moveTo(cx - 6, my + 3); c.quadraticCurveTo(cx - 3, my - 0.5, cx, my + 1); c.quadraticCurveTo(cx + 3, my - 0.5, cx + 6, my + 3); c.stroke();
    } else if (expr === 'shock') {
      c.beginPath(); c.ellipse(cx, my + 2, 3.6, 4.8, 0, 0, 7); c.fillStyle = '#7a2232'; c.fill(); c.stroke();
    } else {
      const smile = f.pers === '奔放' || f.pers === '仁徳' || fem;
      if (smile) { c.beginPath(); c.moveTo(cx - 5.5, my); c.quadraticCurveTo(cx, my + 3, cx + 5.5, my - 0.5); c.stroke(); }
      else { c.beginPath(); c.moveTo(cx - 7.5, my); c.quadraticCurveTo(cx, my + 1.2, cx + 7.5, my - (f.pers === '野心' ? 1.8 : 0)); c.stroke(); }
    }
    c.lineCap = 'butt';
  }
  function animeBeard(c, f, cx, cy, fw, chinY) {
    const col = shade(f.hair, 0.8), LC = Art.hexA(shade(f.hair, 0.4), 0.8);
    c.fillStyle = col; c.strokeStyle = LC; c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx - fw * 0.92, cy + 4);
    c.bezierCurveTo(cx - fw * 0.9, cy + 26, cx - fw * 0.5, chinY + 6, cx, chinY + 9);
    c.bezierCurveTo(cx + fw * 0.5, chinY + 6, cx + fw * 0.9, cy + 26, cx + fw * 0.92, cy + 4);
    c.lineTo(cx + fw * 0.7, cy + 18); c.quadraticCurveTo(cx + 10, cy + 40, cx, cy + 40); c.quadraticCurveTo(cx - 10, cy + 40, cx - fw * 0.7, cy + 18); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(cx - 12, cy + 28); c.quadraticCurveTo(cx, cy + 22, cx + 12, cy + 28); c.lineTo(cx + 9, cy + 30); c.quadraticCurveTo(cx, cy + 26, cx - 9, cy + 30); c.closePath(); c.fill(); c.stroke();
  }
  // 前髪：太い房を先の尖った形で重ね、線で縁取る。額には房の形の影を落とす
  function animeFrontHair(c, f, cx, cy, fw, facePath) {
    const col = f.hair, r = Art.srand(hash(f.hair + f.style + 'a') + 11), HL = Art.hexA(shade(col, 0.42), 0.9);
    const top = cy - 80;
    const fem = f.female, st = f.style;
    // 頭頂の塊
    const dome = () => { c.beginPath(); c.moveTo(cx - fw - 10, cy - 2); c.bezierCurveTo(cx - fw - 19, cy - 108, cx + fw + 19, cy - 108, cx + fw + 10, cy - 2); c.quadraticCurveTo(cx + fw * 0.6, cy - 36, cx, cy - 40); c.quadraticCurveTo(cx - fw * 0.6, cy - 36, cx - fw - 10, cy - 2); c.closePath(); };
    const g = c.createLinearGradient(0, top, 0, cy - 10); g.addColorStop(0, shade(col, 1.08)); g.addColorStop(1, shade(col, 0.9));
    c.fillStyle = g; dome(); c.fill();
    c.strokeStyle = Art.hexA(shade(col, 0.4), 0.6); c.lineWidth = 0.9; c.beginPath(); c.moveTo(cx - fw - 10, cy - 4); c.bezierCurveTo(cx - fw - 19, cy - 108, cx + fw + 19, cy - 108, cx + fw + 10, cy - 4); c.stroke();
    if (st === 'buzz') return;
    // 房の並び
    const swept = st === 'swept' || st === 'side' || st === 'slick';
    const n = st === 'spiky' ? 7 : fem ? 9 : 8;
    const part = swept ? cx - fw * 0.5 : cx + (r() - 0.5) * 10;
    const locks = [];
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      const rx = cx - fw - 6 + (fw * 2 + 12) * k;
      const ry = cy - 74 + Math.pow((rx - cx) / (fw + 10), 2) * 30;   // 房は生え際から（頭頂はなめらかな塊のまま）
      const dir = swept ? 1 : (rx < part ? -1 : 1);
      const edge = Math.abs(k - 0.5) > 0.36;
      // 長さに強弱：3本ごとに長い房、その間は短い房（束になって見えるように）
      const longL = i % 3 === 1, shortL = i % 3 === 2;
      let tipY = cy + (st === 'slick' ? -40 : fem ? -12 : st === 'short' ? -24 : -17) + (edge ? (fem ? 16 : 10) : 0) + (longL ? 4 : shortL ? -9 : -3) + (r() - 0.5) * 5;
      if (st === 'spiky') tipY -= 4 + (i % 2) * 6;
      // 目にかからないように：顔の内側の房は、眉の少し下まで
      if (!edge) tipY = Math.min(tipY, fem ? cy + 4 - 11.5 * f.eyeS * 1.15 - 5 : cy - 2 - 7 * f.eyeS - 12);   // 男性は眉が見えるところまで
      else tipY = Math.min(tipY, fem ? cy - 2 : cy - 14);
      const bend = swept ? 16 + k * 12 : 5 + Math.abs(rx - part) * 0.3;
      const tipX = rx + dir * bend + (r() - 0.5) * 3;
      const w = (fw * 2 + 12) / n * (st === 'spiky' ? 1.1 : 1.0) * (longL ? 1.15 : shortL ? 0.8 : 1);
      locks.push({ p0: [rx, ry], p1: [rx + dir * 1, ry + 14], p2: [tipX - dir * (6 + bend * 0.2), tipY - 12], p3: [tipX, tipY], w: w * 1.25, dir, tone: 0.95 + r() * 0.1 });
    }
    if (!swept && st !== 'slick') {
      const tY = fem ? cy + 4 - 11.5 * f.eyeS * 1.15 - 7 : cy - 2 - 7 * f.eyeS - 13;
      locks.push({ p0: [part, cy - 76], p1: [part, cy - 52], p2: [part + 1, tY - 12], p3: [part + 2, tY], w: (fw * 2 + 12) / n * 1.3, dir: 1, tone: 1.02 });
    }
    // 額に落ちる房の影（くっきり、少し下へずらす）
    c.save(); facePath(); c.clip();
    locks.forEach(L => strand(c, [L.p0[0] + 1, L.p0[1] + 6], [L.p1[0] + 1, L.p1[1] + 6], [L.p2[0] + 1, L.p2[1] + 6], [L.p3[0] + 1.5, L.p3[1] + 6], L.w, shade(f.skin, 0.8), shade(f.skin, 0.8), 1, 0.8));
    c.restore();
    const order = [...locks.keys()].sort((a, b) => Math.abs(b - n / 2) - Math.abs(a - n / 2));   // 分け目の房（最後の番号）は真ん中に重ねる
    const HL2 = Art.hexA(shade(col, 0.4), 0.32);
    for (const i of order) {
      const L = locks[i];
      // 付け根は頭頂の色（塊に溶け込む）、毛先へやや明るく。縁の線は描かない（塊の大きな形を見せる）
      strand(c, L.p0, L.p1, L.p2, L.p3, L.w, shade(col, 1.06), shade(col, 0.97 * L.tone), 1, 0.75);
      // 房の片側のくっきりした影（細い暗い筋）
      const o = L.dir * L.w * 0.42;
      if (i % 3 === 1) strand(c, [L.p1[0] + o * 0.8, L.p1[1]], [L.p1[0] + o * 0.7, L.p1[1] + 8], [L.p2[0] + o * 0.5, L.p2[1] + 4], [L.p3[0] - L.dir * 0.5, L.p3[1] - 2], L.w * 0.3, shade(col, 0.76), shade(col, 0.72), 1, 0.7);
    }
    c.save(); c.strokeStyle = HL2; c.lineWidth = 0.8; c.lineCap = 'round';
    locks.forEach(L => { c.beginPath(); c.moveTo(L.p3[0] - L.dir * L.w * 0.18, L.p3[1] - 12); c.quadraticCurveTo(L.p3[0] - L.dir * L.w * 0.05, L.p3[1] - 4, L.p3[0], L.p3[1]); c.stroke(); });
    c.restore();
    if (st === 'spiky') { for (let i = 0; i < 5; i++) { const x = cx - 36 + i * 18; strand(c, [x, top + 24], [x + (i - 2) * 3, top + 10], [x + (i - 2) * 8, top - 2], [x + (i - 2) * 11, top - 12 - (i % 2) * 5], 9, shade(col, 1.08), shade(col, 0.95), 1, 0.8, HL); } }
    // 横髪（顔の脇に、先の尖った房）
    if (fem || st === 'long' || st === 'bob') {
      [-1, 1].forEach(s => {
        const x0 = cx + s * (fw + 2), y0 = cy - 56;
        const len = st === 'bob' ? 78 : fem ? 96 : 82;
        strand(c, [x0, y0], [x0 + s * 9, y0 + 24], [x0 + s * 4, y0 + len * 0.75], [x0 - s * 3, y0 + len], 7.5, shade(col, 1.0), shade(col, 0.82), 1, 0.85, Art.hexA(shade(col, 0.4), 0.32));
        strand(c, [x0 - s * 4, y0 + 4], [x0 + s * 2, y0 + 26], [x0 + s * 1, y0 + len * 0.6], [x0 - s * 1, y0 + len * 0.78], 5, shade(col, 0.95), shade(col, 0.8), 1, 0.85, Art.hexA(shade(col, 0.4), 0.32));
      });
    }
    // つや：天使の輪（ぎざぎざの明るい帯）
    c.save(); dome(); c.clip();
    c.fillStyle = Art.hexA(shade(col, 1.5), col === '#1a1418' || col === '#2a1e1a' ? 0.3 : 0.32);
    c.beginPath();
    const ry0 = cy - 66, span = fw * 1.2;
    c.moveTo(cx - span / 2 - 4, ry0 + 3);
    c.quadraticCurveTo(cx - 4, ry0 - 8, cx + span / 2 - 4, ry0 + 3);
    for (let i = 8; i >= 0; i--) { const x = cx - 4 - span / 2 + span * i / 8; c.lineTo(x, ry0 - 1 + (i % 2 ? 5 : 1) - Math.sin(i / 8 * Math.PI) * 6); }
    c.closePath(); c.fill();
    c.restore();
    // アホ毛（奔放な者に）
    if (f.pers === '奔放' || (fem && r() < 0.25)) { c.strokeStyle = shade(col, 0.95); c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx + 2, top + 6); c.bezierCurveTo(cx + 4, top - 12, cx + 18, top - 14, cx + 12, top - 4); c.stroke(); c.strokeStyle = HL; c.lineWidth = 0.7; c.stroke(); c.lineCap = 'butt'; }
  }
  function animeAccessories(c, f, cx, cy, fw, expr, E) {
    const ey = E.ey, tags = f.tags;
    if (tags.includes('scar')) { c.strokeStyle = 'rgba(170,70,75,.85)'; c.lineWidth = 1.8; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx - 30, ey - 18); c.lineTo(cx - 14, ey + 16); c.moveTo(cx - 27, ey - 8); c.lineTo(cx - 21, ey - 11); c.moveTo(cx - 22, ey + 4); c.lineTo(cx - 16, ey + 1); c.stroke(); c.lineCap = 'butt'; }
    if (tags.includes('patch')) {
      c.fillStyle = '#18121a'; c.beginPath(); c.ellipse(cx + E.ex, ey + 1, E.W + 2, E.H * 0.8 + 3, 0, 0, 7); c.fill();
      c.strokeStyle = '#18121a'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(cx - fw - 2, ey - 22); c.lineTo(cx + fw + 2, ey + 4); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.ellipse(cx + E.ex - 4, ey - 3, 4, 2, -0.4, 0, 7); c.fill();
    }
    if (tags.includes('glasses')) {
      c.strokeStyle = '#2a2a38'; c.lineWidth = 1.4;
      [-1, 1].forEach(s => { const x = cx + s * E.ex; c.beginPath(); c.roundRect ? c.roundRect(x - E.W - 3.5, ey - E.H * 0.75, E.W * 2 + 7, E.H * 1.6, 4) : c.rect(x - E.W - 3.5, ey - E.H * 0.75, E.W * 2 + 7, E.H * 1.6); c.stroke(); c.fillStyle = 'rgba(200,230,255,.12)'; c.fill(); c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x - E.W, ey + E.H * 0.4); c.lineTo(x - E.W * 0.4, ey - E.H * 0.4); c.stroke(); c.restore(); });
      c.beginPath(); c.moveTo(cx - E.ex + E.W + 3.5, ey - 2); c.quadraticCurveTo(cx, ey - 5, cx + E.ex - E.W - 3.5, ey - 2); c.stroke();
    }
    if (tags.includes('visor')) {
      const g = c.createLinearGradient(cx - fw, 0, cx + fw, 0);
      g.addColorStop(0, '#0a1a2a'); g.addColorStop(0.5, f.cyber ? '#1a4a6a' : '#3a1a2a'); g.addColorStop(1, '#0a1a2a');
      c.fillStyle = g; c.beginPath(); c.moveTo(cx - fw - 2, ey - 12); c.lineTo(cx + fw + 2, ey - 12); c.lineTo(cx + fw + 2, ey + 9); c.lineTo(cx - fw - 2, ey + 9); c.closePath(); c.fill();
      c.strokeStyle = lineCol(f); c.lineWidth = 1; c.stroke();
      c.fillStyle = expr === 'angry' ? '#ff4060' : f.cyber ? '#40e8ff' : '#ff80a0';
      c.fillRect(cx - fw * 0.7, ey - 2, fw * 1.4, 2.5);
    }
    if (f.cyber && !tags.includes('visor')) { c.fillStyle = 'rgba(80,230,255,.3)'; c.beginPath(); c.arc(cx + E.ex, ey + 2, E.W + 1, 0, 7); c.fill(); }
  }
  // 聖衣のかぶり物（頭にかぶる物なので、顔の内側に限らない）
  function animeVeil(c, f, cx, cy) {
    if (f.tags.includes('veil')) {
      c.fillStyle = '#f8f4ff'; c.beginPath(); c.moveTo(cx - 56, cy - 30); c.bezierCurveTo(cx - 50, cy - 92, cx + 50, cy - 92, cx + 56, cy - 30); c.lineTo(cx + 46, cy - 42); c.bezierCurveTo(cx + 30, cy - 72, cx - 30, cy - 72, cx - 46, cy - 42); c.closePath(); c.fill();
      c.strokeStyle = '#d4af37'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 46, cy - 44); c.bezierCurveTo(cx - 30, cy - 72, cx + 30, cy - 72, cx + 46, cy - 44); c.stroke();
      c.fillStyle = '#d4af37'; c.beginPath(); c.arc(cx, cy - 64, 4, 0, 7); c.fill();
    }
  }
  // 漫画の記号：怒りの筋・涙・冷や汗・青ざめの縦線
  function animeMarks(c, f, cx, cy, fw, expr, E) {
    if (expr === 'sad' && !f.tags.includes('visor')) {
      const tx = cx - E.ex - E.W * 0.2, ty = E.ey + E.H * 0.9;
      c.fillStyle = 'rgba(170,220,255,.75)'; c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx - 2.6, ty + 9, tx - 1, ty + 18); c.quadraticCurveTo(tx + 1.8, ty + 10, tx + 1.6, ty); c.fill();
      c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(tx - 0.6, ty + 14, 1, 0, 7); c.fill();
    }
    if (expr === 'shock') {
      c.strokeStyle = 'rgba(70,100,190,.55)'; c.lineWidth = 1.1;
      for (let i = 0; i < 6; i++) { const x = cx - 22 + i * 8; c.beginPath(); c.moveTo(x, cy - 40); c.lineTo(x, cy - 40 + 10 + (i % 2) * 6); c.stroke(); }
      const sx = cx + fw + 2, sy = cy - 26;
      c.fillStyle = 'rgba(190,230,255,.9)'; c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(sx - 5, sy + 10, sx, sy + 13); c.quadraticCurveTo(sx + 5, sy + 10, sx, sy); c.fill();
      c.strokeStyle = 'rgba(60,110,170,.7)'; c.lineWidth = 0.8; c.stroke();
    }
  }


  let grainCv = null;
  function grain() {
    if (grainCv) return grainCv;
    grainCv = document.createElement('canvas'); grainCv.width = grainCv.height = 96;
    const gc = grainCv.getContext('2d'), im = gc.createImageData(96, 96), r = Art.srand(1234);
    for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255 | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    gc.putImageData(im, 0, 0); return grainCv;
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
    // 襟の内側の白いシャツと、襟に沿う国の色の縁取り
    if (!f.cyber) {
      c.fillStyle = isHoly ? '#fff' : '#eceaf0'; c.beginPath(); c.moveTo(cx - 12, y0 - 4); c.lineTo(cx, y0 + 8); c.lineTo(cx + 12, y0 - 4); c.lineTo(cx + 9, y0 - 7); c.lineTo(cx - 9, y0 - 7); c.closePath(); c.fill();
    }
    c.strokeStyle = f.col2; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(cx - 24, y0 - 6); c.lineTo(cx - 17, y0 + 24); c.lineTo(cx, y0 + 32); c.lineTo(cx + 17, y0 + 24); c.lineTo(cx + 24, y0 - 6); c.stroke();
    // 折り返しの襟（ラペル）
    const lp = isHoly ? '#c8bcdc' : shade(f.col, 0.4);
    [-1, 1].forEach(s => {
      c.fillStyle = lp; c.beginPath(); c.moveTo(cx + s * 18, y0 + 25); c.lineTo(cx + s * 34, y0 + 14); c.lineTo(cx + s * 30, y0 + 42); c.lineTo(cx + s * 5, y0 + 34); c.closePath(); c.fill();
      c.strokeStyle = Art.hexA(f.col2, 0.75); c.lineWidth = 1; c.stroke();
    });
    // 肩の縫い目と体の陰
    const bs = c.createLinearGradient(cx - 80, 0, cx + 80, 0); bs.addColorStop(0, 'rgba(0,0,0,.35)'); bs.addColorStop(0.3, 'rgba(0,0,0,0)'); bs.addColorStop(0.75, 'rgba(0,0,0,0)'); bs.addColorStop(1, 'rgba(0,0,0,.4)');
    c.fillStyle = bs; c.beginPath(); c.moveTo(cx - 80, PH); c.bezierCurveTo(cx - 76, y0, cx - 40, y0 - 8, cx, y0 - 6); c.bezierCurveTo(cx + 40, y0 - 8, cx + 76, y0, cx + 80, PH); c.fill();
    const ng = c.createLinearGradient(0, y0 - 8, 0, y0 + 18); ng.addColorStop(0, 'rgba(0,0,0,.35)'); ng.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = ng; c.fillRect(cx - 30, y0 - 8, 60, 26);
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
  function strand(c, p0, p1, p2, p3, w, colA, colB, taperRoot = 0.6, ex = 0.85, line = null) {
    const N = 12, L = [], Rr = [];
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
    if (line) { c.strokeStyle = line; c.lineWidth = 0.9; c.lineJoin = 'round'; c.stroke(); }
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
        strand(c, [rx, ry], [rx + dir * 2, ry + 18], [tipX - dir * 6, tipY - 16], [tipX, tipY], w, shade(col, 1.0 * tone), shade(col, 0.82 * tone), 0.55, 0.55);
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
      // 光の筋（細く明るい毛のつや）
      c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const x = cx - fw * 0.8 + (fw * 1.6) * (i + 0.5) / 7, dir = swept ? 1 : (x < part ? -1 : 1);
        c.strokeStyle = 'rgba(255,250,240,' + (0.1 + r() * 0.12).toFixed(2) + ')'; c.lineWidth = 0.8 + r() * 0.8;
        c.beginPath(); c.moveTo(x, cy - 66 + r() * 4); c.quadraticCurveTo(x + dir * 3, cy - 56, x + dir * (5 + r() * 4), cy - 46 - r() * 6); c.stroke();
      }
      c.restore();
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
        // 横髪のつや
        const x0 = cx + s * (fw + 3), y0 = cy - 30;
        strand(c, [x0, y0], [x0 + s * 6, y0 + 16], [x0 + s * 3, y0 + 34], [x0 + s * 1, y0 + 46], 1.3, Art.hexA(shade(col, 1.6), 0.55), Art.hexA(shade(col, 1.6), 0));
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
        c.strokeStyle = '#1e1216'; c.lineWidth = f.female ? 2.8 : 2.4; c.lineCap = 'round';
        c.beginPath(); c.arc(x, ey + 4, eyeW * 0.85, Math.PI * 1.12, Math.PI * 1.88); c.stroke();
        if (f.female) { c.lineWidth = 1.2; c.beginPath(); const px = x + Math.cos(Math.PI * (1.5 + s * 0.38)) * eyeW * 0.85, py = ey + 4 + Math.sin(Math.PI * (1.5 + s * 0.38)) * eyeW * 0.85; c.moveTo(px, py); c.lineTo(px + s * 4, py - 2); c.stroke(); }
        c.lineCap = 'butt';
        return;
      }
      // まぶたの上のほのかな影（女性は色味のあるアイシャドウ）
      const es2 = c.createRadialGradient(x + s * 2, ey - eyeH, 0, x + s * 2, ey - eyeH, eyeW * 1.2);
      es2.addColorStop(0, f.female ? Art.hexA(Art.mix(f.lip || '#b06070', f.eye, 0.4), 0.3) : 'rgba(90,40,40,.14)'); es2.addColorStop(1, 'rgba(90,40,40,0)');
      c.fillStyle = es2; c.fillRect(x - eyeW * 1.3, ey - eyeH - 10, eyeW * 2.6, eyeH + 10);
      // 白目（上まぶたの落とす影で、上側を少し青灰に）
      const wg = c.createLinearGradient(0, ey - eyeH, 0, ey + eyeH);
      wg.addColorStop(0, '#c8c8dc'); wg.addColorStop(0.45, '#f6f6fc'); wg.addColorStop(1, '#ffffff');
      c.fillStyle = wg;
      c.beginPath(); c.ellipse(x, ey, eyeW, eyeH, 0, 0, 7); c.fill();
      // 瞳
      c.save(); c.beginPath(); c.ellipse(x, ey, eyeW, eyeH, 0, 0, 7); c.clip();
      const ir = eyeH * (f.female ? 1.05 : 1.0) * (expr === 'shock' ? 0.78 : 1);
      const ix = x + s * 1, iy = ey + 1;
      // 瞳：上は暗く、下へ明るく（アニメ調の塗り）を、何層も重ねる
      const g = c.createLinearGradient(0, iy - ir, 0, iy + ir);
      g.addColorStop(0, shade(f.eye, 0.28)); g.addColorStop(0.4, shade(f.eye, 0.8)); g.addColorStop(0.75, f.eye); g.addColorStop(1, shade(f.eye, 1.7));
      c.fillStyle = g; c.beginPath(); c.arc(ix, iy, ir, 0, 7); c.fill();
      // 下半分に光の溜まり（三日月形の明るさ）
      const lg = c.createRadialGradient(ix, iy + ir * 0.55, 0, ix, iy + ir * 0.55, ir * 0.75);
      lg.addColorStop(0, Art.hexA(shade(f.eye, 1.9), 0.75)); lg.addColorStop(1, Art.hexA(shade(f.eye, 1.9), 0));
      c.fillStyle = lg; c.beginPath(); c.arc(ix, iy, ir, 0, 7); c.fill();
      // 縁の濃い輪
      c.strokeStyle = shade(f.eye, 0.22); c.lineWidth = 1.1; c.beginPath(); c.arc(ix, iy, ir - 0.4, 0, 7); c.stroke();
      // 虹彩の筋
      c.strokeStyle = Art.hexA(shade(f.eye, 1.8), 0.3); c.lineWidth = 0.5;
      c.beginPath();
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; c.moveTo(ix + Math.cos(a) * ir * 0.45, iy + Math.sin(a) * ir * 0.45); c.lineTo(ix + Math.cos(a) * ir * 0.9, iy + Math.sin(a) * ir * 0.9); }
      c.stroke();
      // 瞳孔
      const pr = expr === 'shock' ? 0.22 : expr === 'angry' ? 0.3 : 0.4;
      c.fillStyle = shade(f.eye, 0.12); c.beginPath(); c.ellipse(ix, iy, ir * pr, ir * pr * 1.2, 0, 0, 7); c.fill();
      // 上まぶたの影（瞳の上側を暗く）
      const ug = c.createLinearGradient(0, ey - eyeH, 0, ey - eyeH * 0.1);
      ug.addColorStop(0, 'rgba(20,10,25,.55)'); ug.addColorStop(1, 'rgba(20,10,25,0)');
      c.fillStyle = ug; c.fillRect(x - eyeW, ey - eyeH, eyeW * 2, eyeH);
      // ハイライト：大きな光・小さな光・細い反射
      if (expr !== 'sad' || f.female) {
        c.fillStyle = 'rgba(255,255,255,.97)'; c.beginPath(); c.ellipse(ix - s * 0 - ir * 0.32, iy - ir * 0.4, ir * 0.3, ir * 0.24, -0.5, 0, 7); c.fill();
      }
      c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.arc(ix + ir * 0.38, iy + ir * 0.38, ir * 0.12, 0, 7); c.fill();
      if (expr === 'sad') { c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(ix, iy + ir * 0.7, ir * 0.55, ir * 0.12, 0, 0, 7); c.fill(); }
      if (f.cyber) { c.strokeStyle = 'rgba(200,255,255,.6)'; c.lineWidth = 0.5; c.beginPath(); c.arc(ix, iy, ir * 0.62, 0, 7); c.stroke(); }
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
      if (f.female) {
        c.beginPath(); c.moveTo(x + s * eyeW * 0.95, ey - eyeH * 0.3); c.lineTo(x + s * (eyeW + 4), ey - eyeH * 0.8); c.stroke();
        // まつげ：外側ほど長く跳ねる細い毛
        c.lineWidth = 1; c.lineCap = 'round'; c.beginPath();
        for (let i = 0; i < 4; i++) { const t = 0.55 + i * 0.13, an = Math.PI * (1.5 + s * (t - 0.5) * 0.98); const px = x + Math.cos(an) * eyeW, py = ey + Math.sin(an) * (eyeH + 1.5); c.moveTo(px, py); c.lineTo(px + s * (2 + i * 1.3), py - 2.4 - i * 0.6); }
        c.stroke();
        // 下まつげ（目尻寄りに少し）
        c.strokeStyle = 'rgba(40,20,25,.6)'; c.lineWidth = 0.7; c.beginPath();
        for (let i = 0; i < 2; i++) { const an = Math.PI * (0.5 - s * (0.22 + i * 0.1)); const px = x + Math.cos(an) * eyeW * 0.95, py = ey + Math.sin(an) * eyeH; c.moveTo(px, py); c.lineTo(px + s * 1.2, py + 2); }
        c.stroke(); c.lineCap = 'butt';
      }
      // まぶたの下のほのかな影（目の下の赤み）
      const ub = c.createRadialGradient(x, ey + eyeH + 2, 0, x, ey + eyeH + 2, eyeW);
      ub.addColorStop(0, f.female ? 'rgba(220,100,110,.14)' : 'rgba(150,70,70,.08)'); ub.addColorStop(1, 'rgba(220,100,110,0)');
      c.fillStyle = ub; c.fillRect(x - eyeW, ey + eyeH - 4, eyeW * 2, 12);
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
    c.fillStyle = 'rgba(120,50,50,.16)'; c.beginPath(); c.moveTo(cx + 1.5, cy + 3); c.quadraticCurveTo(cx + 6, cy + 12, cx + 4, cy + 15.5); c.lineTo(cx, cy + 15.5); c.quadraticCurveTo(cx + 3, cy + 10, cx + 1.5, cy + 3); c.fill();
    c.strokeStyle = shade(f.skin, 0.66); c.lineWidth = 1.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx + 3.5, cy + 12); c.quadraticCurveTo(cx + 3.5, cy + 15, cx - 1, cy + 15.2); c.stroke(); c.lineCap = 'butt';
    c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(cx - 1, cy + 8, 1, 3.5, 0, 0, 7); c.fill();
    // 口
    const my = cy + 28;
    c.strokeStyle = f.lip || shade(f.skin, 0.55); c.lineWidth = 2.2; c.fillStyle = '#6a2a2a';
    c.beginPath();
    if (expr === 'happy') {
      c.moveTo(cx - 10, my - 2); c.quadraticCurveTo(cx, my + 11, cx + 10, my - 2); c.quadraticCurveTo(cx, my + 1, cx - 10, my - 2); c.closePath();
      c.fillStyle = '#7a2a32'; c.fill();
      c.save(); c.clip(); c.fillStyle = '#e86a78'; c.beginPath(); c.ellipse(cx, my + 7, 6, 3.5, 0, 0, 7); c.fill(); c.fillStyle = '#fff'; c.fillRect(cx - 8, my - 2, 16, 2.4); c.restore();
      c.lineWidth = 1.2; c.beginPath(); c.moveTo(cx - 10, my - 2); c.quadraticCurveTo(cx, my + 11, cx + 10, my - 2); c.stroke();
    }
    else if (expr === 'angry') {
      c.moveTo(cx - 10, my + 3); c.quadraticCurveTo(cx, my - 3, cx + 10, my + 2); c.lineTo(cx + 7, my + 5); c.quadraticCurveTo(cx, my + 3, cx - 7, my + 6); c.closePath();
      c.fillStyle = '#5a1a22'; c.fill(); c.save(); c.clip(); c.fillStyle = '#f4f0f0'; c.fillRect(cx - 10, my - 3, 20, 3.6); c.restore();
      c.lineWidth = 1.4; c.stroke();
    }
    else if (expr === 'sad') { c.moveTo(cx - 8, my + 3); c.quadraticCurveTo(cx, my - 3, cx + 8, my + 3); c.stroke(); }
    else if (expr === 'shock') { c.ellipse(cx, my + 1, 5, 7, 0, 0, 7); const og = c.createLinearGradient(0, my - 6, 0, my + 8); og.addColorStop(0, '#3a1018'); og.addColorStop(1, '#a8404a'); c.fillStyle = og; c.fill(); c.lineWidth = 1; c.stroke(); }
    else { c.moveTo(cx - 8, my); c.quadraticCurveTo(cx, my + (f.pers === '奔放' || f.pers === '仁徳' ? 4 : 1.5), cx + 8, my - (f.pers === '野心' ? 2 : 0)); c.stroke(); }
    if (f.female && expr !== 'shock' && expr !== 'happy') { c.fillStyle = Art.hexA(f.lip, 0.35); c.beginPath(); c.ellipse(cx, my + 3, 5, 2, 0, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.ellipse(cx - 1.5, my + 3, 1.6, 0.7, 0, 0, 7); c.fill(); }
    // 下唇の下の小さな影
    c.fillStyle = 'rgba(110,40,40,.12)'; c.beginPath(); c.ellipse(cx, my + 8, 5, 1.6, 0, 0, 7); c.fill();
    // 頬（照れ線つき）
    if (f.female || expr === 'happy') {
      c.fillStyle = expr === 'happy' ? 'rgba(255,110,120,.24)' : 'rgba(255,120,120,.16)'; [-1, 1].forEach(s => { c.beginPath(); c.ellipse(cx + s * 25, cy + 12, 9, 5, 0, 0, 7); c.fill(); });
      if (expr === 'happy' && f.female) { c.strokeStyle = 'rgba(220,80,90,.45)'; c.lineWidth = 0.8; [-1, 1].forEach(s => { c.beginPath(); for (let i = 0; i < 3; i++) { c.moveTo(cx + s * (20 + i * 3.5), cy + 14); c.lineTo(cx + s * (22 + i * 3.5), cy + 10); } c.stroke(); }); }
    }
    if (expr === 'angry') { const ag = c.createLinearGradient(0, ey - 20, 0, ey - 2); ag.addColorStop(0, 'rgba(90,20,30,.22)'); ag.addColorStop(1, 'rgba(90,20,30,0)'); c.fillStyle = ag; c.fillRect(cx - 30, ey - 20, 60, 18); }
    if (expr === 'sad' && !f.tags.includes('visor')) {
      // 目尻に光る涙
      const tx = cx - ex - 6, ty = ey + 9;
      const tg = c.createLinearGradient(0, ty, 0, ty + 12); tg.addColorStop(0, 'rgba(200,235,255,.9)'); tg.addColorStop(1, 'rgba(160,210,255,.5)');
      c.fillStyle = tg; c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx - 3, ty + 8, tx, ty + 11); c.quadraticCurveTo(tx + 3, ty + 8, tx, ty); c.fill();
      c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(tx - 0.6, ty + 8.5, 0.8, 0, 7); c.fill();
    }
    if (expr === 'shock') {
      // 冷や汗
      const sx = cx + 34, sy = cy - 34;
      c.fillStyle = 'rgba(190,230,255,.85)'; c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(sx - 4.5, sy + 9, sx, sy + 12); c.quadraticCurveTo(sx + 4.5, sy + 9, sx, sy); c.fill();
      c.strokeStyle = 'rgba(60,110,160,.6)'; c.lineWidth = 0.7; c.stroke();
      // 顔の上半分の青ざめ
      const pg = c.createLinearGradient(0, cy - 50, 0, cy - 10); pg.addColorStop(0, 'rgba(60,90,170,.2)'); pg.addColorStop(1, 'rgba(60,90,170,0)'); c.fillStyle = pg; c.fillRect(cx - 34, cy - 50, 68, 40);
    }
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
    return get(key + ':' + expr + ':' + rk + ':' + medals, () => draw(key, expr, rk), false);
  }
  // 描いて、大きな顔と小さな顔を覚える。thumb のときは小さな顔を返す
  function get(k, mk, thumb) {
    let v = recall(thumb ? small : cache, k);
    if (v) return v;
    const big = !thumb && recall(cache, k);
    if (big) return big;
    const u = toUrls(mk(), true);
    remember(small, k, u.sm, SMALL_MAX);
    if (!thumb) remember(cache, k, u.big, BIG_MAX);
    return thumb ? u.sm : u.big;
  }
  // 一覧・作戦室など、小さく見せる所の顔（軽い）
  function thumb(key, expr = 'normal') {
    if (!OFF[key]) return '';
    const live = typeof G !== 'undefined' && G && G.officers && G.officers[key];
    const rk = live ? (Game.isLeader(key) ? 'L' : Game.rankIdx(key)) : (FACTIONS.some(F => F.leader === key) ? 'L' : Game.rankIdx(key));
    const medals = Math.min(4, Math.floor((live ? G.officers[key].merit : initMerit(OFF[key])) / 45));
    return get(key + ':' + expr + ':' + rk + ':' + medals, () => draw(key, expr, rk), true);
  }
  // 一般の将兵（名のない艦長など）。seed ごとに決まった顔
  function generic(seed, fac, expr = 'normal') {
    return get('gen:' + seed + ':' + expr, () => {
      const r = Art.srand(hash(seed));
      const fem = r() < 0.35, t = r();
      const S0 = { name: seed, fac0: fac, female: fem, age: 25 + Math.floor(r() * 30), pers: '沈着', tags: [!fem && t < 0.3 ? 'beard' : t > 0.82 ? 'scar' : ''].filter(Boolean) };
      return draw('gen' + seed, expr, 1, S0);
    }, false);
  }
  // メモリが足りない時など：覚えた顔をすべて捨てる（必要になれば描き直す）
  function purge() { cache.clear(); small.clear(); if (thumbCv) { free(thumbCv); thumbCv = null; } }
  // 顔の描き方（'anime' アニメ調 / 'classic' これまでの絵）
  function setStyle(v) { if (v !== 'anime' && v !== 'classic') return; STYLE = v; try { localStorage.setItem('seisou_face', v); } catch (e) { } purge(); }
  return { url, thumb, generic, purge, setStyle, get style() { return STYLE; } };
})();
