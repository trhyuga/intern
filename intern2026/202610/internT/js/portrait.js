// ============================================================
//  武将の肖像（コードで描く。名前から顔立ちが決まり、表情を変えられる）
//  ゲームイラスト風：面長で輪郭のはっきりした顔、鋭い目、影つきの塗り、光沢のある鎧
//  expr: 'normal' 通常 / 'angry' 怒り / 'happy' 喜び / 'sad' 憂い / 'shock' 驚き
// ============================================================
const Portrait = (() => {
  const cache = new Map();
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const SKINS = ['#f2d2b0', '#ecc6a0', '#e6bc94', '#f0ccaa', '#e0b48a', '#eac29c'];
  const HAIRS = ['#16110e', '#1d1612', '#221a15', '#121014', '#1a1418'];

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r * k))); g = Math.max(0, Math.min(255, Math.round(g * k))); b = Math.max(0, Math.min(255, Math.round(b * k)));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function mix(a, b, t) {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    const ch = s => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
    return '#' + ((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1);
  }

  function features(g) {
    const r = rng(hash(g.name));
    const o = (typeof PORTRAIT_OVERRIDE !== 'undefined' && PORTRAIT_OVERRIDE[g.name]) || {};
    const age = o.old ? 0.9 : o.young ? 0.12 : Math.min(0.85, Math.max(0.12, (205 - g.appear) / 40 + r() * 0.2));
    let hat;
    if (o.hat) hat = o.hat;
    else if (g.female) hat = 'bun';
    else if (g.isLord) hat = 'crown';
    else if (g.int > g.war + 12) hat = r() < 0.6 ? 'scholar' : 'cap';
    else if (g.war >= 80) hat = r() < 0.65 ? 'helm' : 'band';
    else hat = ['cap', 'helm', 'band', 'cap', 'helm'][Math.floor(r() * 5)];
    let beard;
    if (o.beard) beard = o.beard;
    else if (g.female) beard = 'none';
    else {
      const pool = age < 0.3 ? ['none', 'none', 'none', 'thin'] : age < 0.6 ? ['thin', 'goatee', 'full', 'none', 'thin'] : ['goatee', 'full', 'thin', 'goatee'];
      beard = pool[Math.floor(r() * pool.length)];
      if (g.war >= 88 && r() < 0.3) beard = 'tiger';
    }
    const warrior = !g.female && g.war >= g.int;
    const fierce = g.traits && (g.traits.includes('猪突') || g.traits.includes('剛勇'));
    return {
      skin: o.skin || SKINS[Math.floor(r() * SKINS.length)],
      hair: HAIRS[Math.floor(r() * HAIRS.length)],
      hairHi: '#4a3a34',
      w: g.female ? 17.5 : (o.fat ? 22.5 : 18.5 + (warrior ? 1.5 : 0) + r() * 1.5),
      len: r(), age, hat, beard, warrior, fierce,
      brow: g.female ? 1.6 : (o.brow ? 1.8 + o.brow * 0.45 : 2.2 + r() * 0.8 + (fierce ? 0.7 : 0)),
      eyeTilt: g.female ? 1 : (fierce ? 2.6 : 1.4 + r() * 1.0) * (o.eye === 'round' ? 0.4 : 1),
      eyeOpen: g.female ? 3.6 : (o.eye === 'round' ? 3.6 : o.eye === 'sharp' ? 2.6 : 2.9 + r() * 0.5),
      iris: o.eye === 'green' ? '#2f6a4a' : (r() < 0.5 ? '#3a2416' : '#2a1a12'),
      sidelock: g.female || r() < 0.75, longHair: g.female || (!warrior && r() < 0.35),
      eyepatch: !!o.eyepatch, fan: !!o.fan, female: !!g.female, bald: !!o.bald,
      cape: !g.female && (g.isLord || g.lead >= 85 || warrior && r() < 0.5),
      scar: fierce && r() < 0.35,
      beardColor: beard === 'white' ? '#dcd8d0' : beard === 'red' ? '#8a3418' : (age > 0.78 ? '#7a726a' : '#17110e'),
      lightDir: 1,
    };
  }

  // 表情ごとの動き
  const EXPR = {
    normal: { bIn: 0, bOut: 0, open: 1, iris: 0, mouth: 'line' },
    angry:  { bIn: 3.2, bOut: -1.2, open: 0.82, iris: 0, mouth: 'grit' },
    happy:  { bIn: -0.8, bOut: -0.4, open: 0.78, iris: 0, mouth: 'smirk' },
    sad:    { bIn: -3, bOut: 1.6, open: 0.7, iris: 1.2, mouth: 'down' },
    shock:  { bIn: -3.5, bOut: -2.5, open: 1.35, iris: 0, mouth: 'open' },
  };

  function draw(c, g, expr, color) {
    const f = features(g);
    const E = EXPR[expr] || EXPR.normal;
    const W = 120, H = 150, cx = 60;
    const ink = '#1a100a';
    color = color || '#6a5a4a';
    const top = 37, chin = 98 + f.len * 3, ey = 66;

    // ---------- 背景 ----------
    const bg = c.createRadialGradient(cx, 55, 8, cx, 70, 105);
    bg.addColorStop(0, shade(color, 1.45)); bg.addColorStop(0.55, shade(color, 0.8)); bg.addColorStop(1, shade(color, 0.28));
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    // 光の筋
    c.save(); c.globalAlpha = 0.13; c.fillStyle = '#fff';
    for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(cx, 40); c.lineTo(-20 + i * 40, -10); c.lineTo(-5 + i * 40, -10); c.closePath(); c.fill(); }
    c.restore();
    // 墨の払い
    c.save(); c.globalAlpha = 0.28; c.fillStyle = shade(color, 0.25);
    c.beginPath(); c.moveTo(-5, 120); c.quadraticCurveTo(60, 95, 125, 40); c.lineTo(125, 62); c.quadraticCurveTo(70, 112, -5, 140); c.fill();
    c.restore();

    // ---------- 後ろ髪・マント ----------
    if (f.longHair) {
      c.fillStyle = f.hair;
      c.beginPath(); c.moveTo(cx - f.w - 4, 55); c.quadraticCurveTo(cx - f.w - 14, 100, cx - f.w - 8, 128); c.lineTo(cx + f.w + 8, 128); c.quadraticCurveTo(cx + f.w + 14, 100, cx + f.w + 4, 55); c.closePath(); c.fill();
    }
    if (f.cape) {
      const cg = c.createLinearGradient(0, 100, 0, 150); cg.addColorStop(0, shade(color, 0.75)); cg.addColorStop(1, shade(color, 0.35));
      c.fillStyle = cg;
      c.beginPath(); c.moveTo(cx - 34, 106); c.quadraticCurveTo(cx - 62, 128, cx - 66, 152); c.lineTo(cx + 66, 152); c.quadraticCurveTo(cx + 62, 128, cx + 34, 106); c.closePath(); c.fill();
    }

    // ---------- 首 ----------
    const neckW = f.female ? 7 : f.warrior ? 11 : 9;
    c.fillStyle = shade(f.skin, 0.9);
    c.beginPath(); c.moveTo(cx - neckW, 86); c.lineTo(cx - neckW - 1, 110); c.lineTo(cx + neckW + 1, 110); c.lineTo(cx + neckW, 86); c.fill();
    c.fillStyle = 'rgba(80,30,20,0.35)';
    c.beginPath(); c.moveTo(cx - neckW, chin - 6); c.quadraticCurveTo(cx, chin + 10, cx + neckW, chin - 6); c.lineTo(cx + neckW, chin + 6); c.lineTo(cx - neckW, chin + 6); c.fill();
    if (f.warrior && !f.female) { c.strokeStyle = 'rgba(80,30,20,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(cx - 5, 100); c.lineTo(cx - 3, 108); c.moveTo(cx + 5, 100); c.lineTo(cx + 3, 108); c.stroke(); }

    // ---------- 体 ----------
    drawBody(c, f, cx, color, ink);

    // ---------- 横の髪（顔の後ろ） ----------
    c.fillStyle = f.hair;
    c.beginPath(); c.ellipse(cx, top + 18, f.w + 4, 24, 0, Math.PI, 0); c.fill();
    c.fillRect(cx - f.w - 4, top + 16, 8, 26); c.fillRect(cx + f.w - 4, top + 16, 8, 26);

    // ---------- 耳 ----------
    c.fillStyle = shade(f.skin, 0.92); c.strokeStyle = shade(f.skin, 0.55); c.lineWidth = 1;
    [-1, 1].forEach(s => { c.beginPath(); c.ellipse(cx + s * (f.w - 0.5), ey + 3, 3.4, 6.5, s * 0.15, 0, 7); c.fill(); c.stroke(); });

    // ---------- 顔 ----------
    const facePath = () => {
      const w = f.w;
      c.beginPath();
      c.moveTo(cx, top);
      c.bezierCurveTo(cx + w * 0.95, top, cx + w + 1, top + 12, cx + w, 60);
      c.lineTo(cx + w - 0.6, 73);
      c.quadraticCurveTo(cx + w - 1.2, chin - 12, cx + w * (f.female ? 0.5 : 0.62), chin - 5);
      c.quadraticCurveTo(cx + w * 0.22, chin + 0.5, cx, chin);
      c.quadraticCurveTo(cx - w * 0.22, chin + 0.5, cx - w * (f.female ? 0.5 : 0.62), chin - 5);
      c.quadraticCurveTo(cx - w + 1.2, chin - 12, cx - w + 0.6, 73);
      c.lineTo(cx - w, 60);
      c.bezierCurveTo(cx - w - 1, top + 12, cx - w * 0.95, top, cx, top);
      c.closePath();
    };
    const fg = c.createLinearGradient(cx - f.w, top, cx + f.w, chin);
    fg.addColorStop(0, shade(f.skin, 1.05)); fg.addColorStop(0.5, f.skin); fg.addColorStop(1, shade(f.skin, 0.9));
    facePath(); c.fillStyle = fg; c.fill();
    // 影（光は左上から）
    c.save(); facePath(); c.clip();
    c.fillStyle = 'rgba(120,50,30,0.22)';
    c.beginPath(); c.moveTo(cx + f.w * 0.5, top); c.lineTo(cx + f.w + 3, top); c.lineTo(cx + f.w + 3, chin + 2); c.lineTo(cx + 2, chin + 2);
    c.quadraticCurveTo(cx + f.w * 0.55, chin - 10, cx + f.w * 0.62, 76); c.quadraticCurveTo(cx + f.w * 0.75, 64, cx + f.w * 0.5, top); c.fill();
    // 頬骨の影
    c.fillStyle = 'rgba(120,50,30,0.13)';
    [-1, 1].forEach(s => { c.beginPath(); c.moveTo(cx + s * f.w, 72); c.quadraticCurveTo(cx + s * f.w * 0.6, 78, cx + s * f.w * 0.55, 88); c.lineTo(cx + s * f.w, 90); c.fill(); });
    // 前髪の影
    c.fillStyle = 'rgba(60,20,10,0.25)'; c.fillRect(cx - f.w, top, f.w * 2, 14);
    if (f.female || expr === 'happy') { c.fillStyle = 'rgba(230,110,100,0.18)'; [-1, 1].forEach(s => { c.beginPath(); c.ellipse(cx + s * 11, 79, 5, 2.5, 0, 0, 7); c.fill(); }); }
    c.restore();
    facePath(); c.strokeStyle = shade(f.skin, 0.45); c.lineWidth = 1.2; c.stroke();
    // 縁の光
    c.save(); facePath(); c.clip(); c.strokeStyle = 'rgba(255,240,220,0.5)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx - f.w + 1, 58); c.lineTo(cx - f.w + 1.5, 76); c.stroke(); c.restore();

    // しわ（年配）・傷
    if (f.age > 0.62) {
      c.strokeStyle = 'rgba(110,50,30,0.35)'; c.lineWidth = 0.9;
      [-1, 1].forEach(s => { c.beginPath(); c.moveTo(cx + s * 6, 79); c.quadraticCurveTo(cx + s * 9, 85, cx + s * 8, 91); c.stroke(); c.beginPath(); c.moveTo(cx + s * 13, ey + 4); c.quadraticCurveTo(cx + s * 10, ey + 6, cx + s * 6, ey + 5); c.stroke(); });
      c.beginPath(); c.moveTo(cx - 6, top + 9); c.lineTo(cx + 6, top + 9); c.stroke();
    }
    if (f.scar) { c.strokeStyle = 'rgba(150,50,40,0.7)'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(cx - 15, ey - 2); c.lineTo(cx - 9, ey + 12); c.stroke(); }

    // ---------- 眉 ----------
    [-1, 1].forEach(s => {
      const inX = cx + s * 3.2, outX = cx + s * 15.5;
      const inY = ey - 6 + E.bIn, outY = ey - 9.5 - f.eyeTilt * 0.6 + E.bOut;
      const th = f.brow;
      c.fillStyle = f.age > 0.8 ? '#8a8078' : f.hair;
      c.beginPath();
      c.moveTo(inX, inY + th * 0.6);
      c.quadraticCurveTo((inX + outX) / 2, (inY + outY) / 2 - 2.5, outX + s * 1.5, outY + 0.5);
      c.quadraticCurveTo((inX + outX) / 2, (inY + outY) / 2 - 2.5 + th * 0.9, inX, inY + th * 0.6 + th);
      c.closePath(); c.fill();
    });

    // ---------- 目 ----------
    [-1, 1].forEach(s => {
      const ex = cx + s * 8.6;
      if (f.eyepatch && s === 1) {
        c.fillStyle = '#16100c'; c.beginPath(); c.ellipse(ex, ey, 6.5, 5, 0, 0, 7); c.fill();
        c.strokeStyle = '#16100c'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(ex - 5, ey - 3); c.lineTo(cx - f.w, top + 14); c.moveTo(ex + 5, ey - 2); c.lineTo(cx + f.w + 1, ey + 2); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.ellipse(ex - 2, ey - 2, 2, 1.2, 0, 0, 7); c.fill();
        return;
      }
      const w = f.female ? 6.2 : 6.6, open = f.eyeOpen * E.open;
      const inX = ex - s * w * 0.9, inY = ey + 0.6, outX = ex + s * w, outY = ey - f.eyeTilt;
      const eyePath = () => { c.beginPath(); c.moveTo(inX, inY); c.quadraticCurveTo(ex, ey - open * 1.55, outX, outY); c.quadraticCurveTo(ex + s * 1, ey + open * 0.95, inX, inY); c.closePath(); };
      eyePath(); c.fillStyle = '#f6f1e8'; c.fill();
      c.save(); eyePath(); c.clip();
      const ir = expr === 'shock' ? 2.3 : (f.female ? 3.1 : 2.8);
      const ix = ex + s * 0.2, iy = ey - 0.6 + E.iris;
      const ig = c.createRadialGradient(ix - 0.6, iy - 0.8, 0.3, ix, iy, ir);
      ig.addColorStop(0, shade(f.iris, 2.2)); ig.addColorStop(1, f.iris);
      c.fillStyle = ig; c.beginPath(); c.arc(ix, iy, ir, 0, 7); c.fill();
      c.fillStyle = '#080404'; c.beginPath(); c.arc(ix, iy, ir * 0.45, 0, 7); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(ex - 8, ey - 8, 16, 4.2);
      c.restore();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ix - 0.9, iy - 1, 0.85, 0, 7); c.fill();
      // まぶた
      c.strokeStyle = ink; c.lineCap = 'round';
      c.lineWidth = f.female ? 2 : 1.8;
      c.beginPath(); c.moveTo(inX, inY); c.quadraticCurveTo(ex, ey - open * 1.55, outX, outY); c.lineTo(outX + s * 1.6, outY - 0.6); c.stroke();
      if (f.female) { c.lineWidth = 1; c.beginPath(); c.moveTo(outX, outY); c.lineTo(outX + s * 2.6, outY - 2); c.stroke(); }
      c.lineWidth = 0.8; c.strokeStyle = 'rgba(40,20,10,0.6)';
      c.beginPath(); c.moveTo(ex - s * 1, ey + open * 0.75); c.quadraticCurveTo(ex + s * 3, ey + open * 0.7, outX - s * 0.5, outY + 0.8); c.stroke();
      c.strokeStyle = 'rgba(90,40,25,0.45)'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(ex - s * 3, ey - open * 1.5 - 1.6); c.quadraticCurveTo(ex + s * 1, ey - open * 1.8 - 2, outX - s * 0.5, outY - 2); c.stroke();
      c.lineCap = 'butt';
    });

    // ---------- 鼻 ----------
    c.strokeStyle = 'rgba(110,50,30,0.55)'; c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(cx + 1.6, ey + 2); c.quadraticCurveTo(cx + 3.2, ey + 9, cx + 3, ey + 13); c.stroke();
    c.fillStyle = 'rgba(110,50,30,0.3)'; c.beginPath(); c.moveTo(cx - 3, ey + 14.5); c.quadraticCurveTo(cx, ey + 16.5, cx + 3.5, ey + 14); c.quadraticCurveTo(cx, ey + 15.2, cx - 3, ey + 14.5); c.fill();
    c.fillStyle = 'rgba(255,245,230,0.4)'; c.fillRect(cx - 1.2, ey + 3, 1.2, 8);

    // ---------- 口 ----------
    const my = 85 + f.len * 1.5;
    c.strokeStyle = shade(f.skin, 0.35); c.lineWidth = 1.3; c.lineCap = 'round';
    if (E.mouth === 'grit') {
      c.fillStyle = '#3a0e0a'; c.beginPath(); c.moveTo(cx - 6, my - 0.5); c.quadraticCurveTo(cx, my - 2.5, cx + 6, my - 0.5); c.lineTo(cx + 5, my + 3.5); c.quadraticCurveTo(cx, my + 4.5, cx - 5, my + 3.5); c.closePath(); c.fill();
      c.fillStyle = '#f2ece0'; c.fillRect(cx - 4.6, my - 0.6, 9.2, 1.8); c.fillRect(cx - 4, my + 2, 8, 1.2);
      c.stroke();
    } else if (E.mouth === 'smirk') {
      c.beginPath(); c.moveTo(cx - 5.5, my); c.quadraticCurveTo(cx, my + 2.2, cx + 6, my - 1.8); c.stroke();
    } else if (E.mouth === 'down') {
      c.beginPath(); c.moveTo(cx - 5, my + 1.2); c.quadraticCurveTo(cx, my - 1, cx + 5, my + 1.2); c.stroke();
    } else if (E.mouth === 'open') {
      c.fillStyle = '#3a0e0a'; c.beginPath(); c.ellipse(cx, my + 1, 3, 3.8, 0, 0, 7); c.fill();
    } else {
      c.beginPath(); c.moveTo(cx - 5, my); c.quadraticCurveTo(cx, my + 0.8, cx + 5, my - 0.3); c.stroke();
    }
    c.lineCap = 'butt';
    c.strokeStyle = 'rgba(110,50,30,0.3)'; c.lineWidth = 1; c.beginPath(); c.moveTo(cx - 2.5, my + 4.5); c.lineTo(cx + 2.5, my + 4.5); c.stroke();
    if (f.female) { c.fillStyle = 'rgba(200,60,60,0.75)'; c.beginPath(); c.ellipse(cx, my + 0.8, 3.6, 1.5, 0, 0, 7); c.fill(); }

    // ---------- ひげ ----------
    drawBeard(c, f, cx, chin, my, expr);

    // ---------- 前髪・もみあげ ----------
    if (!f.bald) {
      c.fillStyle = f.hair;
      // 生え際
      c.beginPath(); c.moveTo(cx - f.w - 1, 60); c.quadraticCurveTo(cx - f.w - 1, top - 3, cx, top - 5); c.quadraticCurveTo(cx + f.w + 1, top - 3, cx + f.w + 1, 60);
      c.quadraticCurveTo(cx + f.w - 2, top + 9, cx + 4, top + 7); c.quadraticCurveTo(cx, top + 4, cx - 4, top + 7); c.quadraticCurveTo(cx - f.w + 2, top + 9, cx - f.w - 1, 60); c.fill();
      // 前に垂れる束
      [-1, 1].forEach(s => {
        c.beginPath(); c.moveTo(cx + s * 3, top + 2); c.quadraticCurveTo(cx + s * 10, top + 10, cx + s * 9, ey - 9); c.quadraticCurveTo(cx + s * 13, top + 10, cx + s * 10, top + 3); c.fill();
      });
      if (f.sidelock) {
        [-1, 1].forEach(s => {
          c.beginPath(); c.moveTo(cx + s * (f.w - 2), 52); c.quadraticCurveTo(cx + s * (f.w + 3), 74, cx + s * (f.w - 1), f.female ? 104 : 92); c.quadraticCurveTo(cx + s * (f.w + 0.5), 74, cx + s * (f.w - 5), 56); c.fill();
        });
      }
      // つや
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(cx - 13, top + 2); c.quadraticCurveTo(cx - 6, top - 3, cx + 2, top - 3); c.stroke();
    }

    // ---------- かぶりもの ----------
    drawHat(c, f, cx, top, color, ink);

    // ---------- 羽扇 ----------
    if (f.fan) {
      c.save(); c.translate(100, 128); c.rotate(-0.45);
      const fg2 = c.createLinearGradient(0, -46, 0, 0); fg2.addColorStop(0, '#ffffff'); fg2.addColorStop(1, '#d8d0c0');
      c.fillStyle = fg2; c.strokeStyle = '#6a5a4a'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-20, -24, -2, -46); c.quadraticCurveTo(0, -48, 2, -46); c.quadraticCurveTo(20, -24, 0, 0); c.fill(); c.stroke();
      for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(0, -2); c.quadraticCurveTo(i * 3, -20, i * 4.5, -40 + Math.abs(i) * 3); c.stroke(); }
      c.fillStyle = '#5a3a1a'; c.fillRect(-1.8, -1, 3.6, 15);
      c.restore();
    }

    // ---------- 仕上げ ----------
    const vg = c.createRadialGradient(cx, 70, 50, cx, 75, 100);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(212,175,55,0.55)'; c.lineWidth = 2; c.strokeRect(1, 1, W - 2, H - 2);
  }

  function drawBody(c, f, cx, color, ink) {
    if (f.warrior) {
      const metal = mix(color, '#8a8a90', 0.45);
      // 胴
      const bg = c.createLinearGradient(cx - 40, 0, cx + 40, 0);
      bg.addColorStop(0, shade(metal, 0.55)); bg.addColorStop(0.35, shade(metal, 1.25)); bg.addColorStop(0.6, metal); bg.addColorStop(1, shade(metal, 0.45));
      c.fillStyle = bg;
      c.beginPath(); c.moveTo(cx - 44, 152); c.lineTo(cx - 40, 118); c.quadraticCurveTo(cx - 28, 104, cx - 12, 104); c.lineTo(cx + 12, 104); c.quadraticCurveTo(cx + 28, 104, cx + 40, 118); c.lineTo(cx + 44, 152); c.closePath(); c.fill();
      // 札（小札）の模様
      c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 0.8;
      for (let y = 122; y < 152; y += 5) { c.beginPath(); c.moveTo(cx - 36, y); c.lineTo(cx + 36, y); c.stroke(); }
      for (let y = 122; y < 152; y += 5) for (let x = cx - 34 + ((y / 5) % 2) * 3; x < cx + 36; x += 6) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 5); c.stroke(); }
      // 胸当て
      const pg = c.createLinearGradient(cx - 16, 110, cx + 16, 140); pg.addColorStop(0, shade(color, 1.35)); pg.addColorStop(1, shade(color, 0.6));
      c.fillStyle = pg;
      c.beginPath(); c.moveTo(cx - 17, 110); c.quadraticCurveTo(cx, 106, cx + 17, 110); c.lineTo(cx + 14, 138); c.quadraticCurveTo(cx, 144, cx - 14, 138); c.closePath(); c.fill();
      c.strokeStyle = '#d4af37'; c.lineWidth = 1.5; c.stroke();
      // 獣面の飾り
      c.fillStyle = '#d4af37'; c.beginPath(); c.arc(cx, 124, 5, 0, 7); c.fill();
      c.fillStyle = shade(color, 0.5); c.beginPath(); c.arc(cx - 1.8, 123, 1, 0, 7); c.arc(cx + 1.8, 123, 1, 0, 7); c.fill();
      // 肩当て
      [-1, 1].forEach(s => {
        for (let k = 2; k >= 0; k--) {
          const sg = c.createLinearGradient(cx + s * 26, 104 + k * 6, cx + s * 52, 124 + k * 6);
          sg.addColorStop(0, shade(metal, 1.4 - k * 0.15)); sg.addColorStop(1, shade(metal, 0.55));
          c.fillStyle = sg;
          c.beginPath(); c.moveTo(cx + s * 20, 106 + k * 7); c.quadraticCurveTo(cx + s * 40, 98 + k * 7, cx + s * 54, 116 + k * 8); c.quadraticCurveTo(cx + s * 40, 120 + k * 7, cx + s * 22, 116 + k * 7); c.closePath(); c.fill();
          c.strokeStyle = '#c9a227'; c.lineWidth = 1; c.stroke();
        }
      });
      // 襟
      c.fillStyle = shade(color, 0.45);
      c.beginPath(); c.moveTo(cx - 14, 102); c.lineTo(cx - 6, 116); c.lineTo(cx, 108); c.lineTo(cx + 6, 116); c.lineTo(cx + 14, 102); c.closePath(); c.fill();
    } else {
      // 衣（重ね襟）
      const rg = c.createLinearGradient(cx - 40, 100, cx + 40, 152); rg.addColorStop(0, shade(color, 1.15)); rg.addColorStop(1, shade(color, 0.45));
      c.fillStyle = rg;
      c.beginPath(); c.moveTo(cx - 46, 152); c.quadraticCurveTo(cx - 42, 112, cx - 14, 104); c.lineTo(cx + 14, 104); c.quadraticCurveTo(cx + 42, 112, cx + 46, 152); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 1;
      [-1, 1].forEach(s => { c.beginPath(); c.moveTo(cx + s * 30, 116); c.quadraticCurveTo(cx + s * 36, 134, cx + s * 34, 152); c.stroke(); });
      // 内側の白い襟
      c.fillStyle = '#efe9dc';
      c.beginPath(); c.moveTo(cx - 13, 103); c.lineTo(cx + 4, 140); c.lineTo(cx + 10, 140); c.lineTo(cx - 6, 103); c.fill();
      c.beginPath(); c.moveTo(cx + 13, 103); c.lineTo(cx - 2, 132); c.lineTo(cx + 4, 136); c.lineTo(cx + 7, 103); c.fill();
      // 金の縁
      c.strokeStyle = '#d4af37'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(cx - 6, 103); c.lineTo(cx + 10, 140); c.moveTo(cx + 7, 103); c.lineTo(cx + 4, 136); c.stroke();
      c.fillStyle = shade(color, 0.4); c.fillRect(cx - 22, 138, 44, 6);
      c.fillStyle = '#d4af37'; c.fillRect(cx - 3, 137.5, 6, 7);
    }
  }

  function drawBeard(c, f, cx, chin, my, expr) {
    const b = f.beard; if (b === 'none') return;
    const col = f.beardColor;
    const hi = mix(col, '#ffffff', 0.25);
    c.fillStyle = col;
    // 口ひげ（左右に流れて下がる）
    const mus = (len, th) => {
      [-1, 1].forEach(s => {
        c.beginPath(); c.moveTo(cx, my - 3.4);
        c.quadraticCurveTo(cx + s * 5, my - 4.6, cx + s * len, my + len * 0.45);
        c.quadraticCurveTo(cx + s * 5, my - 4.6 + th, cx + s * 0.5, my - 3.4 + th * 0.6);
        c.closePath(); c.fill();
      });
    };
    const strands = (x0, y0, x1, y1, n, spread) => { c.strokeStyle = hi; c.lineWidth = 0.6; c.globalAlpha = 0.6; for (let i = 0; i < n; i++) { const k = (i / (n - 1) - 0.5) * spread; c.beginPath(); c.moveTo(x0 + k, y0); c.quadraticCurveTo(x0 + k * 1.2, (y0 + y1) / 2, x1 + k * 0.4, y1); c.stroke(); } c.globalAlpha = 1; };
    if (b === 'thin') { mus(9, 1.6); c.beginPath(); c.moveTo(cx - 2, chin - 3); c.quadraticCurveTo(cx, chin + 9, cx + 0.5, chin + 12); c.quadraticCurveTo(cx + 1.5, chin + 6, cx + 2, chin - 3); c.fill(); return; }
    if (b === 'goatee' || b === 'red') {
      mus(10, 2.2);
      c.beginPath(); c.moveTo(cx - 5, chin - 4); c.quadraticCurveTo(cx - 3, chin + 12, cx, chin + 18); c.quadraticCurveTo(cx + 3, chin + 12, cx + 5, chin - 4); c.quadraticCurveTo(cx, chin - 1, cx - 5, chin - 4); c.fill();
      strands(cx, chin - 2, cx, chin + 16, 4, 6);
      if (b === 'goatee') return;
    }
    if (b === 'full' || b === 'white' || b === 'red') {
      mus(11, 2.6);
      const w = f.w;
      c.beginPath();
      c.moveTo(cx - w + 0.5, 70);
      c.quadraticCurveTo(cx - w - 1, chin - 4, cx - w * 0.55, chin + 6);
      c.quadraticCurveTo(cx - 4, chin + 14, cx, chin + 20);
      c.quadraticCurveTo(cx + 4, chin + 14, cx + w * 0.55, chin + 6);
      c.quadraticCurveTo(cx + w + 1, chin - 4, cx + w - 0.5, 70);
      c.lineTo(cx + w - 3, 72); c.quadraticCurveTo(cx + w - 4, chin - 8, cx + 7, my + 3.5);
      c.quadraticCurveTo(cx, my + 6, cx - 7, my + 3.5);
      c.quadraticCurveTo(cx - w + 4, chin - 8, cx - w + 3, 72); c.closePath(); c.fill();
      strands(cx, my + 6, cx, chin + 18, 6, 14);
    }
    if (b === 'long') {
      mus(12, 2.6);
      const w = f.w;
      const lg = c.createLinearGradient(0, my, 0, 150); lg.addColorStop(0, col); lg.addColorStop(1, shade(col === '#17110e' ? '#2a201a' : col, 0.8));
      c.fillStyle = lg;
      c.beginPath();
      c.moveTo(cx - w + 1, 72);
      c.quadraticCurveTo(cx - w, chin, cx - 13, chin + 14);
      c.quadraticCurveTo(cx - 10, 136, cx - 1, 150);
      c.lineTo(cx + 1, 150);
      c.quadraticCurveTo(cx + 10, 136, cx + 13, chin + 14);
      c.quadraticCurveTo(cx + w, chin, cx + w - 1, 72);
      c.lineTo(cx + w - 3.5, 74); c.quadraticCurveTo(cx + w - 5, chin - 8, cx + 7, my + 3.5);
      c.quadraticCurveTo(cx, my + 6, cx - 7, my + 3.5);
      c.quadraticCurveTo(cx - w + 5, chin - 8, cx - w + 3.5, 74); c.closePath(); c.fill();
      strands(cx, my + 7, cx, 146, 7, 18);
    }
    if (b === 'tiger') {
      mus(12, 3);
      const w = f.w;
      c.beginPath(); c.moveTo(cx - w, 66);
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI * (1 - i / 12);
        const rx = w + 6, ry = chin - 62 + 12;
        const x = cx + Math.cos(a) * rx * (i % 2 ? 1.12 : 0.92), y = 72 + Math.sin(a) * ry * (i % 2 ? 1.15 : 0.95);
        c.lineTo(x, y);
      }
      c.lineTo(cx + w, 66); c.lineTo(cx + w - 3, 70); c.quadraticCurveTo(cx + w - 4, chin - 8, cx + 7, my + 3.5); c.quadraticCurveTo(cx, my + 6, cx - 7, my + 3.5); c.quadraticCurveTo(cx - w + 4, chin - 8, cx - w + 3, 70); c.closePath(); c.fill();
      strands(cx, my + 6, cx, chin + 14, 7, 20);
    }
    // 口を見せる（怒り・驚き）
    if (expr === 'angry' || expr === 'shock') {
      c.fillStyle = '#3a0e0a';
      if (expr === 'angry') { c.beginPath(); c.ellipse(cx, my + 1.5, 5.5, 2.6, 0, 0, 7); c.fill(); c.fillStyle = '#f2ece0'; c.fillRect(cx - 4.2, my + 0.2, 8.4, 1.6); }
      else { c.beginPath(); c.ellipse(cx, my + 1, 3, 3.8, 0, 0, 7); c.fill(); }
    }
  }

  function drawHat(c, f, cx, top, color, ink) {
    const w = f.w;
    switch (f.hat) {
      case 'crown': {
        // 冠（板と玉すだれ）
        const g1 = c.createLinearGradient(0, top - 22, 0, top + 4); g1.addColorStop(0, '#2a2420'); g1.addColorStop(1, '#0e0a08');
        c.fillStyle = g1;
        c.beginPath(); c.moveTo(cx - 11, top + 4); c.lineTo(cx - 9, top - 14); c.lineTo(cx + 9, top - 14); c.lineTo(cx + 11, top + 4); c.closePath(); c.fill();
        c.strokeStyle = '#d4af37'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(cx - 10.5, top); c.lineTo(cx + 10.5, top); c.stroke();
        const g2 = c.createLinearGradient(0, top - 24, 0, top - 16); g2.addColorStop(0, '#3a3028'); g2.addColorStop(1, '#141010');
        c.fillStyle = g2; c.beginPath(); c.moveTo(cx - 30, top - 17); c.lineTo(cx - 26, top - 24); c.lineTo(cx + 26, top - 24); c.lineTo(cx + 30, top - 17); c.closePath(); c.fill();
        c.strokeStyle = '#d4af37'; c.lineWidth = 1; c.stroke();
        for (let i = -3; i <= 3; i++) {
          const x = cx + i * 8;
          c.strokeStyle = 'rgba(212,175,55,0.8)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(x, top - 17); c.lineTo(x, top - 4 + Math.abs(i) * 1.2); c.stroke();
          for (let k = 0; k < 3; k++) { c.fillStyle = k % 2 ? '#c0392b' : '#f0d27a'; c.beginPath(); c.arc(x, top - 14 + k * 4, 1.3, 0, 7); c.fill(); }
        }
        c.fillStyle = '#d4af37'; c.beginPath(); c.moveTo(cx - 34, top - 6); c.lineTo(cx + 34, top - 6); c.lineTo(cx + 34, top - 4.6); c.lineTo(cx - 34, top - 4.6); c.fill();
        break;
      }
      case 'scholar': {
        // 綸巾
        const g1 = c.createLinearGradient(cx - w, top - 16, cx + w, top + 10); g1.addColorStop(0, '#f6f2e8'); g1.addColorStop(1, '#bdb6a6');
        c.fillStyle = g1;
        c.beginPath(); c.moveTo(cx - w - 1, top + 11); c.quadraticCurveTo(cx - w - 1, top - 14, cx, top - 17); c.quadraticCurveTo(cx + w + 1, top - 14, cx + w + 1, top + 11); c.quadraticCurveTo(cx, top + 4, cx - w - 1, top + 11); c.fill();
        c.strokeStyle = 'rgba(80,70,60,0.5)'; c.lineWidth = 0.7;
        for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(cx + i * 5, top + 6); c.quadraticCurveTo(cx + i * 4.5, top - 4, cx + i * 3, top - 15); c.stroke(); }
        c.fillStyle = '#3a3a48'; c.fillRect(cx - w - 1, top + 6, w * 2 + 2, 4);
        c.fillStyle = g1;
        c.beginPath(); c.moveTo(cx + w - 1, top + 7); c.quadraticCurveTo(cx + w + 13, top + 18, cx + w + 9, top + 44); c.lineTo(cx + w + 4, top + 42); c.quadraticCurveTo(cx + w + 6, top + 22, cx + w - 3, top + 11); c.fill();
        break;
      }
      case 'helm': case 'lion': {
        const hc = f.hat === 'lion' ? '#e4e0d8' : mix(color, '#9a9aa0', 0.6);
        const hg = c.createLinearGradient(cx - w - 6, 0, cx + w + 6, 0);
        hg.addColorStop(0, shade(hc, 0.55)); hg.addColorStop(0.35, shade(hc, 1.35)); hg.addColorStop(0.55, hc); hg.addColorStop(1, shade(hc, 0.45));
        // 側面の垂れ
        c.fillStyle = shade(hc, 0.7);
        [-1, 1].forEach(s => { c.beginPath(); c.moveTo(cx + s * (w - 1), top + 10); c.lineTo(cx + s * (w + 7), top + 14); c.lineTo(cx + s * (w + 6), top + 36); c.lineTo(cx + s * (w + 1), top + 32); c.closePath(); c.fill(); c.strokeStyle = '#c9a227'; c.lineWidth = 0.8; c.stroke(); });
        c.fillStyle = hg;
        c.beginPath(); c.moveTo(cx - w - 5, top + 14); c.quadraticCurveTo(cx - w - 4, top - 17, cx, top - 20); c.quadraticCurveTo(cx + w + 4, top - 17, cx + w + 5, top + 14); c.quadraticCurveTo(cx, top + 6, cx - w - 5, top + 14); c.fill();
        // 眉庇と金の飾り
        c.fillStyle = '#c9a227';
        c.beginPath(); c.moveTo(cx - w - 5, top + 14); c.quadraticCurveTo(cx, top + 5, cx + w + 5, top + 14); c.lineTo(cx + w + 5, top + 11); c.quadraticCurveTo(cx, top + 2, cx - w - 5, top + 11); c.fill();
        c.beginPath(); c.moveTo(cx, top - 6); c.lineTo(cx - 6, top + 7); c.lineTo(cx, top + 4); c.lineTo(cx + 6, top + 7); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(cx - 7, top - 8, 3, 7, -0.5, 0, 7); c.fill();
        // 房
        c.fillStyle = f.hat === 'lion' ? '#f4f0e8' : '#b0281e';
        c.beginPath(); c.moveTo(cx - 2, top - 19); c.quadraticCurveTo(cx - 6, top - 38, cx + 10, top - 46); c.quadraticCurveTo(cx + 4, top - 32, cx + 3, top - 19); c.fill();
        c.beginPath(); c.moveTo(cx + 1, top - 30); c.quadraticCurveTo(cx + 18, top - 34, cx + 26, top - 20); c.quadraticCurveTo(cx + 14, top - 26, cx + 2, top - 24); c.fill();
        break;
      }
      case 'band': {
        // 髷と鉢巻
        if (!f.bald) { c.fillStyle = f.hair; c.beginPath(); c.ellipse(cx, top - 8, 7, 6, 0, 0, 7); c.fill(); c.fillStyle = '#d4af37'; c.fillRect(cx - 4, top - 4, 8, 2); }
        const bc = shade(color, 0.85);
        c.fillStyle = bc;
        c.beginPath(); c.moveTo(cx - w - 2, top + 9); c.quadraticCurveTo(cx, top + 1, cx + w + 2, top + 9); c.lineTo(cx + w + 2, top + 15); c.quadraticCurveTo(cx, top + 7, cx - w - 2, top + 15); c.closePath(); c.fill();
        c.fillStyle = '#d4af37'; c.beginPath(); c.arc(cx, top + 8, 2.2, 0, 7); c.fill();
        c.fillStyle = bc;
        c.beginPath(); c.moveTo(cx + w, top + 11); c.quadraticCurveTo(cx + w + 14, top + 12, cx + w + 22, top + 26); c.lineTo(cx + w + 16, top + 27); c.quadraticCurveTo(cx + w + 10, top + 17, cx + w, top + 15); c.fill();
        c.beginPath(); c.moveTo(cx + w, top + 13); c.quadraticCurveTo(cx + w + 10, top + 22, cx + w + 12, top + 38); c.lineTo(cx + w + 7, top + 37); c.quadraticCurveTo(cx + w + 6, top + 24, cx + w - 1, top + 16); c.fill();
        break;
      }
      case 'green': {
        const g1 = c.createLinearGradient(cx - w, top - 18, cx + w, top + 12); g1.addColorStop(0, '#3f8a4e'); g1.addColorStop(1, '#1e4a28');
        c.fillStyle = g1;
        c.beginPath(); c.moveTo(cx - w - 2, top + 12); c.quadraticCurveTo(cx - w - 1, top - 16, cx, top - 20); c.quadraticCurveTo(cx + w + 1, top - 16, cx + w + 2, top + 12); c.quadraticCurveTo(cx, top + 4, cx - w - 2, top + 12); c.fill();
        c.strokeStyle = '#d4af37'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(cx - w - 2, top + 11); c.quadraticCurveTo(cx, top + 3, cx + w + 2, top + 11); c.stroke();
        c.fillStyle = '#d4af37'; c.beginPath(); c.arc(cx, top - 3, 3, 0, 7); c.fill();
        c.fillStyle = '#e8d070'; c.beginPath(); c.arc(cx - 0.8, top - 3.8, 1, 0, 7); c.fill();
        c.fillStyle = g1; c.beginPath(); c.moveTo(cx + w, top + 8); c.quadraticCurveTo(cx + w + 12, top + 20, cx + w + 8, top + 42); c.lineTo(cx + w + 3, top + 40); c.quadraticCurveTo(cx + w + 5, top + 22, cx + w - 2, top + 12); c.fill();
        break;
      }
      case 'pheasant': {
        // 紫金の冠と長い雉の尾羽
        c.strokeStyle = '#e0c060'; c.lineWidth = 2.6; c.lineCap = 'round';
        [-1, 1].forEach(s => { c.beginPath(); c.moveTo(cx + s * 5, top - 10); c.bezierCurveTo(cx + s * 16, top - 52, cx + s * 46, top - 50, cx + s * 58, top - 14); c.stroke(); });
        c.strokeStyle = '#7a5a20'; c.lineWidth = 1;
        [-1, 1].forEach(s => { for (let k = 1; k < 8; k++) { const t = k / 8; const x = cx + s * (5 + t * 52), y = top - 10 - Math.sin(t * Math.PI) * 36; c.beginPath(); c.moveTo(x - 1.5, y - 1.5); c.lineTo(x + 1.5, y + 1.5); c.stroke(); } });
        c.lineCap = 'butt';
        const g1 = c.createLinearGradient(cx - w, top - 14, cx + w, top + 12); g1.addColorStop(0, '#f0d27a'); g1.addColorStop(0.5, '#b8902a'); g1.addColorStop(1, '#6a4a10');
        c.fillStyle = g1;
        c.beginPath(); c.moveTo(cx - w - 3, top + 12); c.quadraticCurveTo(cx - w - 2, top - 10, cx, top - 14); c.quadraticCurveTo(cx + w + 2, top - 10, cx + w + 3, top + 12); c.quadraticCurveTo(cx, top + 4, cx - w - 3, top + 12); c.fill();
        c.fillStyle = '#5b2a7a'; c.beginPath(); c.moveTo(cx - 8, top + 6); c.lineTo(cx, top - 10); c.lineTo(cx + 8, top + 6); c.closePath(); c.fill();
        c.fillStyle = '#c0392b'; c.beginPath(); c.arc(cx, top + 1, 2.5, 0, 7); c.fill();
        break;
      }
      case 'feather': {
        ['#c0392b', '#e0a020', '#2f8a4e', '#2f5aa8', '#c0392b'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.ellipse(cx - 16 + i * 8, top - 10, 3.4, 15, (i - 2) * 0.28, 0, 7); c.fill(); });
        c.fillStyle = '#7a3a18'; c.fillRect(cx - w - 2, top + 4, (w + 2) * 2, 7);
        c.fillStyle = '#d4af37'; for (let i = -2; i <= 2; i++) { c.beginPath(); c.arc(cx + i * 7, top + 7.5, 1.6, 0, 7); c.fill(); }
        break;
      }
      case 'bun': {
        c.fillStyle = f.hair; c.beginPath(); c.ellipse(cx, top - 7, 11, 9, 0, 0, 7); c.fill();
        c.beginPath(); c.arc(cx - 17, top + 1, 7, 0, 7); c.fill(); c.beginPath(); c.arc(cx + 17, top + 1, 7, 0, 7); c.fill();
        c.strokeStyle = '#d4af37'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(cx - 22, top - 12); c.lineTo(cx + 6, top - 2); c.stroke();
        c.fillStyle = '#c0392b'; c.beginPath(); c.arc(cx + 12, top - 9, 3, 0, 7); c.fill();
        c.fillStyle = '#f0d27a'; c.beginPath(); c.arc(cx - 22, top - 12, 2, 0, 7); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, top - 7, 8, 3.6, 5.2); c.stroke();
        break;
      }
      default: { // 冠（文官・武官の小冠）
        c.fillStyle = f.hair; c.beginPath(); c.ellipse(cx, top - 6, 8, 7, 0, 0, 7); c.fill();
        const g1 = c.createLinearGradient(0, top - 18, 0, top); g1.addColorStop(0, '#2e2622'); g1.addColorStop(1, '#0e0a08');
        c.fillStyle = g1;
        c.beginPath(); c.moveTo(cx - 9, top + 1); c.lineTo(cx - 8, top - 14); c.quadraticCurveTo(cx, top - 19, cx + 8, top - 14); c.lineTo(cx + 9, top + 1); c.closePath(); c.fill();
        c.strokeStyle = '#d4af37'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(cx - 20, top - 7); c.lineTo(cx + 20, top - 7); c.stroke();
        c.fillStyle = '#d4af37'; c.beginPath(); c.arc(cx - 20, top - 7, 1.6, 0, 7); c.arc(cx + 20, top - 7, 1.6, 0, 7); c.fill();
      }
    }
  }

  function get(g, expr = 'normal', color) {
    const key = g.name + '|' + expr + '|' + (color || '');
    if (cache.has(key)) return cache.get(key);
    const cv = document.createElement('canvas');
    cv.width = 240; cv.height = 300;
    const c = cv.getContext('2d'); c.scale(2, 2);
    draw(c, g, expr, color);
    const url = cv.toDataURL('image/png');
    cache.set(key, url);
    return url;
  }
  // 守備隊長（無名）
  const GENERIC = { name: '守備隊長', war: 50, int: 40, appear: 180, traits: [] };
  return { get, draw, GENERIC };
})();
