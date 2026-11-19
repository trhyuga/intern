// ============================================================
//  武将の肖像（コードで描く。名前から顔立ちが決まり、表情を変えられる）
//  expr: 'normal' 通常 / 'angry' 怒り / 'happy' 喜び / 'sad' 憂い / 'shock' 驚き
// ============================================================
const Portrait = (() => {
  const cache = new Map();
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const SKINS = ['#e9c39c', '#e2b48a', '#d9a87c', '#edc9a6', '#d4a07a', '#e6bb92'];
  const HAIRS = ['#1b1410', '#231a14', '#2b1f17', '#141010'];

  function features(g) {
    const r = rng(hash(g.name));
    const o = (typeof PORTRAIT_OVERRIDE !== 'undefined' && PORTRAIT_OVERRIDE[g.name]) || {};
    const age = o.old ? 0.9 : o.young ? 0.15 : Math.min(0.85, Math.max(0.15, (205 - g.appear) / 40 + r() * 0.2));
    let hat;
    if (o.hat) hat = o.hat;
    else if (g.female) hat = 'bun';
    else if (g.isLord) hat = 'crown';
    else if (g.int > g.war + 12) hat = r() < 0.6 ? 'scholar' : 'cap';
    else if (g.war >= 80) hat = r() < 0.6 ? 'helm' : 'band';
    else hat = ['cap', 'helm', 'band', 'cap'][Math.floor(r() * 4)];
    let beard;
    if (o.beard) beard = o.beard;
    else if (g.female) beard = 'none';
    else {
      const pool = age < 0.3 ? ['none', 'none', 'thin'] : age < 0.6 ? ['thin', 'goatee', 'full', 'none'] : ['goatee', 'full', 'long', 'thin'];
      beard = pool[Math.floor(r() * pool.length)];
      if (g.war >= 85 && r() < 0.35) beard = 'tiger';
    }
    return {
      skin: o.skin || SKINS[Math.floor(r() * SKINS.length)],
      hair: HAIRS[Math.floor(r() * HAIRS.length)],
      faceW: (o.fat ? 1.15 : 0.92 + r() * 0.16) * (g.female ? 0.92 : 1),
      jaw: r(), age, hat, beard,
      brow: o.brow || (g.female ? 1 : 1 + Math.floor(r() * 3 + (g.war > 80 ? 1 : 0))),
      eye: o.eye || (g.female ? 'soft' : ['almond', 'sharp', 'almond', 'round'][Math.floor(r() * 4)]),
      eyeY: r() * 4 - 2, mouthW: 0.8 + r() * 0.4, nose: r(),
      armor: !g.female && g.war >= g.int, eyepatch: !!o.eyepatch, fan: !!o.fan, ugly: !!o.ugly, ears: !!o.ears,
      female: !!g.female, bald: !!o.bald,
      beardColor: beard === 'white' ? '#e8e4dc' : beard === 'red' ? '#7a2e14' : (age > 0.75 ? '#6a625a' : '#1b1410'),
    };
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r * k))); g = Math.max(0, Math.min(255, Math.round(g * k))); b = Math.max(0, Math.min(255, Math.round(b * k)));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function draw(c, g, expr, color) {
    const f = features(g);
    const W = 120, H = 150, cx = 60;
    const ink = '#2a1a10';
    color = color || '#6a5a4a';
    // 背景
    const bg = c.createRadialGradient(cx, 60, 10, cx, 75, 95);
    bg.addColorStop(0, shade(color, 1.35)); bg.addColorStop(1, shade(color, 0.45));
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    // 墨のにじみ
    c.globalAlpha = 0.12; c.fillStyle = '#000';
    for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(10 + i * 22, 140 - (i % 2) * 10, 25, 0, 7); c.fill(); }
    c.globalAlpha = 1;

    // 体
    const bodyCol = shade(color, 0.85);
    c.fillStyle = bodyCol; c.strokeStyle = ink; c.lineWidth = 2;
    c.beginPath(); c.moveTo(8, H); c.quadraticCurveTo(14, 112, 44, 106); c.lineTo(76, 106); c.quadraticCurveTo(106, 112, 112, H); c.closePath(); c.fill(); c.stroke();
    if (f.armor) {
      c.strokeStyle = shade(color, 0.5); c.lineWidth = 1.2;
      for (let y = 118; y < H; y += 7) for (let x = 16 + (y % 14 ? 0 : 5); x < 106; x += 10) { c.beginPath(); c.arc(x, y, 5, 0, Math.PI); c.stroke(); }
      c.fillStyle = '#c9a227'; c.strokeStyle = ink; c.lineWidth = 1.5;
      c.beginPath(); c.ellipse(24, 120, 14, 9, -0.4, 0, 7); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(96, 120, 14, 9, 0.4, 0, 7); c.fill(); c.stroke();
    } else {
      c.fillStyle = '#f2ead8'; c.strokeStyle = ink; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(44, 106); c.lineTo(60, 136); c.lineTo(76, 106); c.lineTo(70, 106); c.lineTo(60, 124); c.lineTo(50, 106); c.closePath(); c.fill(); c.stroke();
    }
    // 首
    c.fillStyle = shade(f.skin, 0.85); c.fillRect(50, 92, 20, 16);

    const fw = 26 * f.faceW, top = 38, chin = 104 + (f.jaw > 0.6 ? 2 : 0);
    // 髪（後ろ）
    c.fillStyle = f.hair;
    if (f.female) { c.beginPath(); c.ellipse(cx, 70, fw + 10, 44, 0, 0, 7); c.fill(); }
    // 耳
    c.fillStyle = f.skin; c.strokeStyle = ink; c.lineWidth = 1.5;
    const ew = f.ears ? 9 : 6, eh = f.ears ? 16 : 10;
    [-1, 1].forEach(s => { c.beginPath(); c.ellipse(cx + s * (fw + 1), 72, ew, eh, 0, 0, 7); c.fill(); c.stroke(); });
    // 顔
    const fg = c.createLinearGradient(cx - fw, 0, cx + fw, 0);
    fg.addColorStop(0, shade(f.skin, 0.88)); fg.addColorStop(0.45, f.skin); fg.addColorStop(1, shade(f.skin, 0.78));
    c.fillStyle = fg;
    c.beginPath();
    c.moveTo(cx, top);
    c.bezierCurveTo(cx + fw * 1.05, top, cx + fw * 1.05, 70, cx + fw * (0.85 + f.jaw * 0.1), 84);
    c.quadraticCurveTo(cx + fw * 0.55, chin, cx, chin);
    c.quadraticCurveTo(cx - fw * 0.55, chin, cx - fw * (0.85 + f.jaw * 0.1), 84);
    c.bezierCurveTo(cx - fw * 1.05, 70, cx - fw * 1.05, top, cx, top);
    c.fill(); c.stroke();
    // 頬の赤み（喜び）・しわ（年齢）
    if (expr === 'happy' || f.female) { c.fillStyle = 'rgba(220,90,80,0.22)'; [-1, 1].forEach(s => { c.beginPath(); c.ellipse(cx + s * 15, 82, 7, 4, 0, 0, 7); c.fill(); }); }
    if (f.age > 0.6) {
      c.strokeStyle = 'rgba(60,30,20,0.45)'; c.lineWidth = 1;
      [-1, 1].forEach(s => { c.beginPath(); c.moveTo(cx + s * 10, 80); c.quadraticCurveTo(cx + s * 15, 88, cx + s * 12, 95); c.stroke(); });
      c.beginPath(); c.moveTo(cx - 9, 52); c.lineTo(cx + 9, 52); c.stroke();
      c.beginPath(); c.moveTo(cx - 7, 56); c.lineTo(cx + 7, 56); c.stroke();
    }
    if (f.ugly) { c.fillStyle = 'rgba(80,40,20,0.35)'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(cx - 14 + i * 6, 86 + (i % 2) * 3, 1.3, 0, 7); c.fill(); } }

    // 前髪（帽子の下）
    c.fillStyle = f.hair;
    if (!f.bald) { c.beginPath(); c.moveTo(cx - fw, 60); c.quadraticCurveTo(cx - fw, top - 4, cx, top - 6); c.quadraticCurveTo(cx + fw, top - 4, cx + fw, 60); c.quadraticCurveTo(cx + fw * 0.6, 46, cx, 46); c.quadraticCurveTo(cx - fw * 0.6, 46, cx - fw, 60); c.fill(); }

    // 眉
    const ey = 66 + f.eyeY;
    c.strokeStyle = f.age > 0.8 ? '#8a8078' : f.hair; c.lineCap = 'round';
    c.lineWidth = 1.5 + f.brow * 0.9;
    [-1, 1].forEach(s => {
      let inY = ey - 8, outY = ey - 9;
      if (expr === 'angry') { inY = ey - 4; outY = ey - 12; }
      else if (expr === 'sad') { inY = ey - 12; outY = ey - 7; }
      else if (expr === 'shock') { inY = ey - 13; outY = ey - 12; }
      else if (expr === 'happy') { inY = ey - 10; outY = ey - 10; }
      c.beginPath(); c.moveTo(cx + s * 4, inY); c.quadraticCurveTo(cx + s * 12, (inY + outY) / 2 - 3, cx + s * 19, outY); c.stroke();
    });
    c.lineCap = 'butt';

    // 目
    [-1, 1].forEach(s => {
      const ex = cx + s * 11;
      if (f.eyepatch && s === 1) {
        c.fillStyle = '#1a1210'; c.beginPath(); c.ellipse(ex, ey, 7, 6, 0, 0, 7); c.fill();
        c.strokeStyle = '#1a1210'; c.lineWidth = 2; c.beginPath(); c.moveTo(ex - 6, ey - 4); c.lineTo(cx - fw, 52); c.moveTo(ex + 6, ey - 3); c.lineTo(cx + fw + 2, 62); c.stroke();
        return;
      }
      c.strokeStyle = ink; c.lineWidth = 1.6;
      if (expr === 'happy') { c.beginPath(); c.arc(ex, ey + 2, 5, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); return; }
      let w = 6.5, h = f.eye === 'sharp' ? 2.6 : f.eye === 'round' ? 4.2 : 3.4;
      if (expr === 'shock') { h += 1.8; w += 0.5; }
      if (expr === 'angry') h -= 0.6;
      if (expr === 'sad') h -= 0.5;
      c.fillStyle = '#fbf6ec';
      c.beginPath();
      const tilt = (f.eye === 'sharp' ? 2 : 0.5) * s * -1;
      c.moveTo(ex - w, ey + tilt * (s > 0 ? -1 : 1) * 0); c.quadraticCurveTo(ex, ey - h * 2, ex + w, ey - (f.eye === 'sharp' ? 2 : 0));
      c.quadraticCurveTo(ex, ey + h * 1.4, ex - w, ey);
      c.fill(); c.stroke();
      const irisC = f.eye === 'green' ? '#2e5a3a' : '#2a1a10';
      c.fillStyle = irisC; c.beginPath(); c.arc(ex + (expr === 'sad' ? 0 : s * -0.5), ey - h * 0.3, Math.min(3, h * 0.9), 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + 1, ey - h * 0.5, 0.9, 0, 7); c.fill();
      if (f.female) { c.strokeStyle = ink; c.lineWidth = 2.2; c.beginPath(); c.moveTo(ex - w, ey); c.quadraticCurveTo(ex, ey - h * 2, ex + w, ey); c.stroke(); }
    });
    // 鼻
    c.strokeStyle = shade(f.skin, 0.55); c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(cx - 1, ey + 2); c.quadraticCurveTo(cx - 3 - f.nose * 2, ey + 12, cx - 4, ey + 15); c.quadraticCurveTo(cx, ey + 18, cx + 4, ey + 15); c.stroke();

    // 口
    const my = 92;
    const mw = 8 * f.mouthW;
    c.strokeStyle = ink; c.lineWidth = 1.6;
    if (expr === 'angry') {
      c.fillStyle = '#5a1a14'; c.beginPath(); c.moveTo(cx - mw, my - 1); c.quadraticCurveTo(cx, my - 5, cx + mw, my - 1); c.quadraticCurveTo(cx, my + 7, cx - mw, my - 1); c.fill(); c.stroke();
      c.fillStyle = '#f4efe4'; c.fillRect(cx - mw * 0.7, my - 3, mw * 1.4, 2.2);
    } else if (expr === 'happy') {
      c.fillStyle = '#7a2a20'; c.beginPath(); c.moveTo(cx - mw, my - 2); c.quadraticCurveTo(cx, my + 8, cx + mw, my - 2); c.closePath(); c.fill(); c.stroke();
    } else if (expr === 'sad') {
      c.beginPath(); c.moveTo(cx - mw * 0.8, my + 2); c.quadraticCurveTo(cx, my - 3, cx + mw * 0.8, my + 2); c.stroke();
    } else if (expr === 'shock') {
      c.fillStyle = '#4a1a14'; c.beginPath(); c.ellipse(cx, my, 3.5, 4.5, 0, 0, 7); c.fill(); c.stroke();
    } else {
      c.beginPath(); c.moveTo(cx - mw * 0.8, my); c.quadraticCurveTo(cx, my + 1.5, cx + mw * 0.8, my); c.stroke();
    }
    if (f.female) { c.fillStyle = '#c0392b'; c.beginPath(); c.ellipse(cx, my + 0.5, 4, 1.8, 0, 0, 7); c.fill(); }

    // ひげ
    c.fillStyle = f.beardColor; c.strokeStyle = f.beardColor;
    const b = f.beard;
    if (b !== 'none') {
      // 口ひげ
      c.lineWidth = b === 'thin' ? 1.5 : 2.6;
      [-1, 1].forEach(s => { c.beginPath(); c.moveTo(cx, my - 5); c.quadraticCurveTo(cx + s * 8, my - 6, cx + s * (b === 'thin' ? 12 : 14), my + (b === 'thin' ? 4 : 1)); c.stroke(); });
    }
    if (b === 'goatee' || b === 'red') { c.beginPath(); c.moveTo(cx - 5, my + 6); c.quadraticCurveTo(cx, my + 24, cx + 5, my + 6); c.fill(); }
    if (b === 'thin') { c.lineWidth = 1.2; c.beginPath(); c.moveTo(cx, my + 7); c.lineTo(cx, my + 18); c.stroke(); }
    if (b === 'full' || b === 'white' || b === 'red') {
      c.beginPath(); c.moveTo(cx - fw * 0.85, 80); c.quadraticCurveTo(cx - fw * 0.8, chin + 10, cx, chin + 12); c.quadraticCurveTo(cx + fw * 0.8, chin + 10, cx + fw * 0.85, 80);
      c.quadraticCurveTo(cx + 10, my + 4, cx, my + 6); c.quadraticCurveTo(cx - 10, my + 4, cx - fw * 0.85, 80); c.fill();
    }
    if (b === 'long') {
      c.beginPath(); c.moveTo(cx - fw * 0.7, 84); c.quadraticCurveTo(cx - 16, 130, cx, 146); c.quadraticCurveTo(cx + 16, 130, cx + fw * 0.7, 84);
      c.quadraticCurveTo(cx + 8, my + 5, cx, my + 7); c.quadraticCurveTo(cx - 8, my + 5, cx - fw * 0.7, 84); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.15)'; c.lineWidth = 1;
      for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(cx + i * 4, my + 10); c.quadraticCurveTo(cx + i * 5, 125, cx + i * 2, 140); c.stroke(); }
    }
    if (b === 'tiger') {
      c.lineWidth = 2;
      for (let i = -6; i <= 6; i++) { const a = i / 6; c.beginPath(); c.moveTo(cx + a * fw * 0.9, 82 + Math.abs(a) * -4); c.lineTo(cx + a * fw * 1.15, chin + 6 - Math.abs(a) * 10); c.stroke(); }
      c.beginPath(); c.moveTo(cx - fw * 0.9, 82); c.quadraticCurveTo(cx, chin + 14, cx + fw * 0.9, 82); c.quadraticCurveTo(cx, my + 4, cx - fw * 0.9, 82); c.fill();
    }
    // 口をひげの上に再描画（怒り・喜び時に見えるように）
    if ((expr === 'angry' || expr === 'happy' || expr === 'shock') && b !== 'none' && b !== 'thin') {
      c.fillStyle = expr === 'shock' ? '#4a1a14' : expr === 'angry' ? '#5a1a14' : '#7a2a20';
      c.beginPath(); c.ellipse(cx, my + 1, mw * 0.7, 3.2, 0, 0, 7); c.fill();
    }

    // かぶりもの
    drawHat(c, f, cx, top, fw, color, ink);

    // 羽扇
    if (f.fan) {
      c.save(); c.translate(98, 124); c.rotate(-0.5);
      c.fillStyle = '#f4f0e6'; c.strokeStyle = ink; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-22, -26, 0, -44); c.quadraticCurveTo(22, -26, 0, 0); c.fill(); c.stroke();
      for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(0, -2); c.lineTo(i * 5, -38 + Math.abs(i) * 3); c.stroke(); }
      c.fillStyle = '#7a4a20'; c.fillRect(-2, 0, 4, 14);
      c.restore();
    }
    // 枠
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, W - 3, H - 3);
  }

  function drawHat(c, f, cx, top, fw, color, ink) {
    c.strokeStyle = ink; c.lineWidth = 1.8;
    switch (f.hat) {
      case 'crown': {
        c.fillStyle = '#1a1410';
        c.beginPath(); c.moveTo(cx - 14, top + 4); c.lineTo(cx - 12, top - 16); c.lineTo(cx + 12, top - 16); c.lineTo(cx + 14, top + 4); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#2a2018'; c.fillRect(cx - 30, top - 24, 60, 8); c.strokeRect(cx - 30, top - 24, 60, 8);
        c.fillStyle = '#c9a227';
        for (let i = -3; i <= 3; i++) { c.fillRect(cx + i * 8 - 1, top - 16, 2, 12); c.beginPath(); c.arc(cx + i * 8, top - 4, 2, 0, 7); c.fill(); }
        c.fillStyle = '#c9a227'; c.fillRect(cx - 2, top - 30, 4, 7);
        break;
      }
      case 'scholar': {
        c.fillStyle = '#e8e2d2';
        c.beginPath(); c.moveTo(cx - fw - 2, top + 14); c.quadraticCurveTo(cx - fw, top - 14, cx, top - 18); c.quadraticCurveTo(cx + fw, top - 14, cx + fw + 2, top + 14); c.quadraticCurveTo(cx, top + 4, cx - fw - 2, top + 14); c.fill(); c.stroke();
        c.strokeStyle = '#9a9080'; c.lineWidth = 1;
        for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(cx + i * 7, top + 8); c.lineTo(cx + i * 5, top - 14); c.stroke(); }
        c.fillStyle = '#e8e2d2'; c.strokeStyle = ink; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(cx + fw - 2, top + 8); c.quadraticCurveTo(cx + fw + 14, top + 18, cx + fw + 8, top + 40); c.lineTo(cx + fw + 3, top + 38); c.quadraticCurveTo(cx + fw + 6, top + 20, cx + fw - 4, top + 12); c.fill(); c.stroke();
        break;
      }
      case 'helm': case 'lion': {
        const hc = f.hat === 'lion' ? '#d8d4cc' : '#7a7068';
        const hg = c.createLinearGradient(cx - fw, 0, cx + fw, 0); hg.addColorStop(0, shade(hc, 0.7)); hg.addColorStop(0.4, shade(hc, 1.25)); hg.addColorStop(1, shade(hc, 0.6));
        c.fillStyle = hg;
        c.beginPath(); c.moveTo(cx - fw - 6, top + 22); c.quadraticCurveTo(cx - fw - 4, top - 18, cx, top - 20); c.quadraticCurveTo(cx + fw + 4, top - 18, cx + fw + 6, top + 22); c.lineTo(cx + fw - 2, top + 20); c.quadraticCurveTo(cx, top + 8, cx - fw + 2, top + 20); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#c9a227'; c.beginPath(); c.moveTo(cx, top - 4); c.lineTo(cx - 8, top + 12); c.lineTo(cx + 8, top + 12); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = f.hat === 'lion' ? '#e8e0d0' : '#b0281e';
        c.beginPath(); c.moveTo(cx - 3, top - 20); c.quadraticCurveTo(cx - 14, top - 40, cx + 6, top - 46); c.quadraticCurveTo(cx + 2, top - 30, cx + 3, top - 20); c.fill();
        break;
      }
      case 'band': {
        c.fillStyle = shade(color, 0.7);
        c.beginPath(); c.moveTo(cx - fw - 2, top + 12); c.quadraticCurveTo(cx, top - 2, cx + fw + 2, top + 12); c.lineTo(cx + fw + 2, top + 20); c.quadraticCurveTo(cx, top + 8, cx - fw - 2, top + 20); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = f.bald ? 'rgba(0,0,0,0)' : '#1b1410';
        if (!f.bald) { c.beginPath(); c.arc(cx, top - 6, 9, 0, 7); c.fill(); }
        c.fillStyle = shade(color, 0.7); c.beginPath(); c.moveTo(cx + fw, top + 14); c.lineTo(cx + fw + 16, top + 30); c.lineTo(cx + fw + 10, top + 34); c.lineTo(cx + fw - 2, top + 18); c.fill(); c.stroke();
        break;
      }
      case 'green': {
        c.fillStyle = '#2f6a3a';
        c.beginPath(); c.moveTo(cx - fw - 3, top + 14); c.quadraticCurveTo(cx - fw, top - 16, cx, top - 20); c.quadraticCurveTo(cx + fw, top - 16, cx + fw + 3, top + 14); c.quadraticCurveTo(cx, top + 4, cx - fw - 3, top + 14); c.fill(); c.stroke();
        c.fillStyle = '#c9a227'; c.beginPath(); c.arc(cx, top - 4, 3.5, 0, 7); c.fill();
        break;
      }
      case 'pheasant': {
        c.fillStyle = '#b0281e';
        c.beginPath(); c.moveTo(cx - fw - 4, top + 16); c.quadraticCurveTo(cx - fw, top - 16, cx, top - 18); c.quadraticCurveTo(cx + fw, top - 16, cx + fw + 4, top + 16); c.quadraticCurveTo(cx, top + 4, cx - fw - 4, top + 16); c.fill(); c.stroke();
        c.fillStyle = '#c9a227'; c.fillRect(cx - 18, top + 2, 36, 5);
        c.strokeStyle = '#d9b850'; c.lineWidth = 3;
        [-1, 1].forEach(s => { c.beginPath(); c.moveTo(cx + s * 6, top - 14); c.bezierCurveTo(cx + s * 20, top - 60, cx + s * 50, top - 50, cx + s * 58, top - 20); c.stroke(); });
        c.strokeStyle = '#7a5a20'; c.lineWidth = 1;
        [-1, 1].forEach(s => { for (let k = 0; k < 6; k++) { const t = k / 6; const x = cx + s * (6 + t * 50), y = top - 14 - Math.sin(t * Math.PI) * 38; c.beginPath(); c.moveTo(x, y - 2); c.lineTo(x, y + 2); c.stroke(); } });
        break;
      }
      case 'feather': {
        c.fillStyle = '#8a3a20'; c.fillRect(cx - fw - 2, top + 6, (fw + 2) * 2, 8);
        ['#c0392b', '#e0a020', '#2f8a4e', '#2f5aa8'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.ellipse(cx - 15 + i * 10, top - 10, 4, 16, (i - 1.5) * 0.25, 0, 7); c.fill(); });
        break;
      }
      case 'bun': {
        c.fillStyle = f.hair; c.beginPath(); c.arc(cx, top - 6, 13, 0, 7); c.fill();
        c.beginPath(); c.arc(cx - 20, top + 2, 9, 0, 7); c.fill(); c.beginPath(); c.arc(cx + 20, top + 2, 9, 0, 7); c.fill();
        c.fillStyle = '#c9a227'; c.fillRect(cx - 22, top - 8, 44, 3);
        c.fillStyle = '#c0392b'; c.beginPath(); c.arc(cx + 14, top - 10, 3.5, 0, 7); c.fill();
        break;
      }
      default: { // cap 冠
        c.fillStyle = '#1a1410';
        c.beginPath(); c.moveTo(cx - 12, top + 4); c.lineTo(cx - 10, top - 16); c.quadraticCurveTo(cx, top - 22, cx + 10, top - 16); c.lineTo(cx + 12, top + 4); c.closePath(); c.fill(); c.stroke();
        c.strokeStyle = '#c9a227'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx - 24, top - 6); c.lineTo(cx + 24, top - 6); c.stroke();
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
  const GENERIC = { name: '守備隊長', war: 50, int: 40, appear: 180 };
  return { get, draw, GENERIC };
})();
