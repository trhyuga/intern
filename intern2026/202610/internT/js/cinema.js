// ============================================================
//  演出：オープニング・タイトル背景・エンディング
//  （絵はすべて Canvas でその場で描く）
// ============================================================
const Cinema = (() => {
  let titleRaf = null;
  function genByName(name) {
    const l = GENERAL_SRC.trim().split('\n').find(x => x.startsWith(name + ','));
    const p = l.split(',');
    return { name: p[0], lead: +p[1], war: +p[2], int: +p[3], pol: +p[4], cha: +p[5], traits: p[6] === '-' ? [] : p[6].split(' '), appear: +p[8], female: p[10] === 'F', isLord: true };
  }
  function fit(cv) {
    const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, W: r.width, H: r.height };
  }
  const ease = k => k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k);
  const fade = (t, a, b, f = 0.8) => t < a || t > b ? 0 : Math.min(1, (t - a) / f, (b - t) / f);

  // 山並み（決まった形を作っておく）
  function ridge(seed, n) { const pts = []; let s = seed; for (let i = 0; i <= n; i++) { s = (s * 9301 + 49297) % 233280; pts.push(s / 233280); } return pts; }
  const R1 = ridge(7, 14), R2 = ridge(19, 10), R3 = ridge(31, 8);
  function mountains(c, W, H, base, amp, pts, col, off = 0) {
    c.fillStyle = col; c.beginPath(); c.moveTo(-50, H);
    pts.forEach((v, i) => { const x = -50 + (W + 100) * i / (pts.length - 1) + off; const y = base - v * amp; c.lineTo(x, y); });
    c.lineTo(W + 50, H); c.closePath(); c.fill();
  }
  function text(c, W, y, str, alpha, size = 20, col = '#f6e8c6') {
    if (alpha <= 0) return;
    c.globalAlpha = alpha; c.textAlign = 'center'; c.font = `500 ${size}px 'Shippori Mincho B1', serif`;
    c.shadowColor = '#000'; c.shadowBlur = 8; c.fillStyle = col; c.fillText(str, W / 2, y);
    c.shadowBlur = 0; c.globalAlpha = 1;
  }
  function flag(c, x, y, h, col, ch, wave) {
    c.strokeStyle = '#2a1a10'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h); c.stroke();
    const fw = h * 0.45, fh = h * 0.55;
    c.fillStyle = col; c.beginPath(); c.moveTo(x, y - h);
    for (let i = 0; i <= 10; i++) c.lineTo(x + fw * i / 10, y - h + Math.sin(wave + i * 0.6) * 4);
    for (let i = 10; i >= 0; i--) c.lineTo(x + fw * i / 10, y - h + fh + Math.sin(wave + i * 0.6) * 4);
    c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.font = `bold ${fh * 0.5}px 'Yuji Syuku', serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(ch, x + fw / 2, y - h + fh / 2 + Math.sin(wave + 3) * 3); c.textBaseline = 'alphabetic';
  }

  function opening(cv, skipBtn) {
    return new Promise(resolve => {
      Sound.bgm('title');
      const { c, W, H } = fit(cv);
      const stars = Array.from({ length: 120 }, () => [Math.random() * W, Math.random() * H * 0.7, Math.random() * 1.5 + 0.3, Math.random() * 6]);
      const embers = Array.from({ length: 80 }, () => [Math.random() * W, H + Math.random() * H, Math.random() * 1 + 0.4, Math.random() * 3 + 1]);
      const heroes = ['曹操', '劉備', '孫権'].map(genByName);
      const hcols = ['#2f5aa8', '#2f8a4e', '#c0392b'];
      const pcanvas = heroes.map((g, i) => { const p = document.createElement('canvas'); p.width = 240; p.height = 300; const pc = p.getContext('2d'); pc.scale(2, 2); Portrait.draw(pc, g, 'normal', hcols[i]); return p; });
      const T = 34;
      let t0 = performance.now(), done = false, raf, gonged = false;
      const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); skipBtn.onclick = null; resolve(); };
      skipBtn.onclick = e => { e.stopPropagation(); finish(); };
      const frame = () => {
        const t = (performance.now() - t0) / 1000;
        c.clearRect(0, 0, W, H);
        // ---- 1. 夜空（0-8秒）
        if (t < 9) {
          const a = fade(t, 0, 9, 1.2);
          c.globalAlpha = a;
          const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#05060f'); g.addColorStop(1, '#1a1428'); c.fillStyle = g; c.fillRect(0, 0, W, H);
          stars.forEach(([x, y, r, p]) => { c.fillStyle = `rgba(255,250,220,${0.4 + Math.sin(t * 2 + p) * 0.3})`; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); });
          const mx = W * 0.72, my = H * 0.24 - t * 3;
          const mg = c.createRadialGradient(mx, my, 10, mx, my, 120); mg.addColorStop(0, 'rgba(255,240,200,0.5)'); mg.addColorStop(1, 'rgba(255,240,200,0)');
          c.fillStyle = mg; c.fillRect(0, 0, W, H);
          c.fillStyle = '#f4ead0'; c.beginPath(); c.arc(mx, my, 38, 0, 7); c.fill();
          mountains(c, W, H, H * 0.78, 90, R2, '#0d0a14');
          mountains(c, W, H, H * 0.9, 60, R3, '#07050a', -t * 4);
          c.globalAlpha = 1;
          text(c, W, H * 0.45, '後漢の末。', fade(t, 1, 8.5) * a, 22);
          text(c, W, H * 0.45 + 38, '朝廷は乱れ、民は飢えに苦しんだ。', fade(t, 2.5, 8.5) * a, 17);
        }
        // ---- 2. 燃える都（8-16秒）
        if (t > 8 && t < 17) {
          const a = fade(t, 8, 17, 1);
          c.globalAlpha = a;
          const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a0402'); g.addColorStop(0.6, '#7a1a08'); g.addColorStop(1, '#ff7a1a'); c.fillStyle = g; c.fillRect(0, 0, W, H);
          // 城の影
          c.fillStyle = '#0a0302';
          const by = H * 0.72;
          c.fillRect(0, by, W, H - by);
          for (let i = 0; i < 6; i++) {
            const x = W * (0.05 + i * 0.17), w = W * 0.12, h = 50 + (i % 3) * 30;
            c.fillRect(x, by - h, w, h);
            c.beginPath(); c.moveTo(x - 10, by - h); c.lineTo(x + w / 2, by - h - 26); c.lineTo(x + w + 10, by - h); c.fill();
          }
          embers.forEach(e => { e[1] -= e[3] * 1.2; e[0] += Math.sin(t * 2 + e[3]) * 0.6; if (e[1] < -10) { e[1] = H + 10; e[0] = Math.random() * W; } c.fillStyle = `rgba(255,${150 + Math.random() * 80 | 0},40,0.8)`; c.beginPath(); c.arc(e[0], e[1], e[2] * 1.6, 0, 7); c.fill(); });
          c.globalAlpha = 1;
          text(c, W, H * 0.32, '黄巾の乱ののち、', fade(t, 9, 16.5) * a, 19);
          text(c, W, H * 0.32 + 36, '都は暴君の手に落ちる。', fade(t, 10.5, 16.5) * a, 19);
        }
        // ---- 3. 群雄の旗（16-24秒）
        if (t > 16 && t < 25) {
          const a = fade(t, 16, 25, 1);
          c.globalAlpha = a;
          const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a3a5a'); g.addColorStop(0.7, '#d8a070'); g.addColorStop(1, '#f0c890'); c.fillStyle = g; c.fillRect(0, 0, W, H);
          mountains(c, W, H, H * 0.62, 120, R1, '#5a6a8a', -(t - 16) * 3);
          mountains(c, W, H, H * 0.74, 90, R2, '#3a4560', -(t - 16) * 7);
          const flags = [['曹', '#2f5aa8'], ['劉', '#2f8a4e'], ['孫', '#c0392b'], ['袁', '#c9a227'], ['董', '#5b3a8c'], ['呂', '#7a2a5a'], ['馬', '#a85a3a']];
          flags.forEach(([ch, col], i) => {
            const k = ease((t - 16.5 - i * 0.35) / 1.2);
            const x = W * (0.08 + i * 0.135), y = H * 0.92 + (1 - k) * 200 - (i % 2) * 30;
            flag(c, x, y, 140 + (i % 3) * 20, col, ch, t * 3 + i);
          });
          mountains(c, W, H, H * 0.95, 40, R3, '#1a1a24');
          c.globalAlpha = 1;
          text(c, W, H * 0.2, '各地に群雄が立ち、', fade(t, 17, 24.5) * a, 19);
          text(c, W, H * 0.2 + 36, '天下は千々に乱れた。', fade(t, 18.5, 24.5) * a, 19);
        }
        // ---- 4. 英雄（24-30秒）
        if (t > 24 && t < 31) {
          const a = fade(t, 24, 31, 0.8);
          c.globalAlpha = a; c.fillStyle = '#0c0805'; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
          const pw = Math.min(W * 0.3, 130), ph = pw * 1.25;
          heroes.forEach((h, i) => {
            const k = ease((t - 24.3 - i * 0.6) / 0.8);
            c.globalAlpha = a * k;
            const x = W / 2 + (i - 1) * (pw + 8) - pw / 2, y = H * 0.32 + (1 - k) * 30;
            c.drawImage(pcanvas[i], x, y, pw, ph);
            c.strokeStyle = '#d4af37'; c.lineWidth = 2; c.strokeRect(x, y, pw, ph);
            text(c, x + pw / 2 - W / 2 + W / 2, 0, '', 0);
            c.globalAlpha = a * k; c.textAlign = 'center'; c.font = `24px 'Yuji Syuku', serif`; c.fillStyle = '#f6e8c6'; c.fillText(h.name, x + pw / 2, y + ph + 30);
            c.globalAlpha = 1;
          });
          text(c, W, H * 0.22, '英雄たちの、覇の道が始まる。', fade(t, 26, 30.5) * a, 18);
        }
        // ---- 5. 題字（30-34秒）
        if (t > 30) {
          const a = Math.min(1, (t - 30) / 0.6);
          c.fillStyle = '#0c0805'; c.fillRect(0, 0, W, H);
          if (!gonged) { gonged = true; Sound.se('gong'); }
          // 墨のしぶき
          c.globalAlpha = a * 0.9; c.fillStyle = '#a8241a';
          for (let i = 0; i < 18; i++) { const ang = i * 2.4, r = 40 + (i * 37 % 90) * ease((t - 30) / 0.5); c.beginPath(); c.arc(W / 2 + Math.cos(ang) * r, H * 0.42 + Math.sin(ang) * r * 0.6, 6 + (i % 4) * 5, 0, 7); c.fill(); }
          c.beginPath(); c.ellipse(W / 2, H * 0.42, W * 0.38 * ease((t - 30) / 0.4), 60, -0.1, 0, 7); c.fill();
          c.globalAlpha = 1;
          const chars = '群雄天下';
          const fs = Math.min(W / 5, 84);
          [...chars].forEach((ch, i) => {
            const k = ease((t - 30.3 - i * 0.18) / 0.5);
            c.globalAlpha = k; c.font = `${fs}px 'Yuji Syuku', serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillStyle = '#f6e8c6'; c.shadowColor = '#000'; c.shadowBlur = 12;
            c.fillText(ch, W / 2 + (i - 1.5) * fs * 0.98, H * 0.42 + (1 - k) * 20);
            c.shadowBlur = 0; c.textBaseline = 'alphabetic';
          });
          c.globalAlpha = 1;
          text(c, W, H * 0.42 + fs * 0.9, '― 三 国 英 傑 伝 ―', ease((t - 31.4) / 0.8), 18, '#f0d27a');
        }
        if (t >= T) return finish();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
  }

  function titleBG(cv) {
    cancelAnimationFrame(titleRaf);
    const { c, W, H } = fit(cv);
    const petals = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 4 + 3, v: Math.random() * 0.6 + 0.3, r: Math.random() * 6 }));
    const t0 = performance.now();
    const frame = () => {
      if (UI.cur !== 'title') return;
      const t = (performance.now() - t0) / 1000;
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#120608'); g.addColorStop(0.55, '#4a1210'); g.addColorStop(1, '#c0602a'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      const mx = W * 0.5, my = H * 0.42;
      const mg = c.createRadialGradient(mx, my, 20, mx, my, W * 0.6); mg.addColorStop(0, 'rgba(255,200,140,0.5)'); mg.addColorStop(1, 'rgba(255,200,140,0)'); c.fillStyle = mg; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffdcae'; c.beginPath(); c.arc(mx, my, W * 0.2, 0, 7); c.fill();
      mountains(c, W, H, H * 0.62, 130, R1, '#3a1410', Math.sin(t / 8) * 10);
      mountains(c, W, H, H * 0.76, 100, R2, '#24100c', Math.sin(t / 6) * 18);
      // 騎馬の影
      const hx = ((t * 18) % (W + 200)) - 100, hy = H * 0.74;
      c.fillStyle = '#140806';
      c.beginPath(); c.ellipse(hx, hy, 22, 9, 0, 0, 7); c.fill();
      c.fillRect(hx + 14, hy - 18, 8, 16); c.beginPath(); c.ellipse(hx + 24, hy - 18, 9, 5, -0.4, 0, 7); c.fill();
      const leg = Math.sin(t * 10) * 6; c.fillRect(hx - 16 + leg, hy, 3, 16); c.fillRect(hx - 8 - leg, hy, 3, 16); c.fillRect(hx + 10 + leg, hy, 3, 16); c.fillRect(hx + 16 - leg, hy, 3, 16);
      c.fillRect(hx - 2, hy - 26, 7, 18); c.beginPath(); c.arc(hx + 1, hy - 30, 5, 0, 7); c.fill();
      c.strokeStyle = '#140806'; c.lineWidth = 2; c.beginPath(); c.moveTo(hx - 10, hy - 5); c.lineTo(hx + 12, hy - 52); c.stroke();
      c.fillStyle = '#a8241a'; c.beginPath(); c.moveTo(hx + 12, hy - 52); c.lineTo(hx - 6, hy - 48 + Math.sin(t * 6) * 3); c.lineTo(hx + 8, hy - 40); c.fill();
      mountains(c, W, H, H * 0.9, 50, R3, '#0c0605');
      // 霧
      for (let i = 0; i < 3; i++) { const y = H * (0.7 + i * 0.08); c.fillStyle = 'rgba(255,220,200,0.05)'; c.fillRect(0, y + Math.sin(t / 3 + i) * 6, W, 30); }
      // 花びら
      petals.forEach(p => { p.y += p.v; p.x += Math.sin(t + p.r) * 0.5; if (p.y > H) { p.y = -10; p.x = Math.random() * W; } c.fillStyle = 'rgba(255,190,200,0.75)'; c.beginPath(); c.ellipse(p.x, p.y, p.s, p.s * 0.55, t + p.r, 0, 7); c.fill(); });
      titleRaf = requestAnimationFrame(frame);
    };
    titleRaf = requestAnimationFrame(frame);
  }

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
      const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); skipBtn.onclick = null; rollEl.innerHTML = ''; resolve(); };
      skipBtn.onclick = finish;
      const rays = Array.from({ length: 14 }, (_, i) => i);
      const frame = () => {
        const t = (performance.now() - t0) / 1000;
        if (win) {
          const k = Math.min(1, t / 8);
          const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, `rgb(${30 + k * 60},${30 + k * 80},${70 + k * 90})`); g.addColorStop(0.6, `rgb(${120 + k * 120},${80 + k * 100},${60 + k * 40})`); g.addColorStop(1, '#ffd890'); c.fillStyle = g; c.fillRect(0, 0, W, H);
          const sy = H * 0.7 - k * H * 0.22;
          c.save(); c.translate(W / 2, sy); c.globalAlpha = 0.15 * k;
          rays.forEach(i => { c.rotate(Math.PI * 2 / rays.length); c.fillStyle = '#fff6d0'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-30, -H); c.lineTo(30, -H); c.fill(); });
          c.restore(); c.globalAlpha = 1;
          c.fillStyle = '#fff2c0'; c.beginPath(); c.arc(W / 2, sy, 50, 0, 7); c.fill();
          mountains(c, W, H, H * 0.72, 110, R1, '#6a4a3a');
          mountains(c, W, H, H * 0.84, 80, R2, '#3a2a22');
          // 勝者の旗
          flag(c, W * 0.5, H * 0.86, 160, f.color, f.name[0], t * 2.5);
          mountains(c, W, H, H * 0.96, 30, R3, '#1a120c');
        } else {
          const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a0a12'); g.addColorStop(1, '#2a2430'); c.fillStyle = g; c.fillRect(0, 0, W, H);
          mountains(c, W, H, H * 0.74, 100, R1, '#15121a');
          c.strokeStyle = 'rgba(200,210,230,0.25)'; c.lineWidth = 1;
          for (let i = 0; i < 50; i++) { const x = (i * 97 + t * 200) % W, y = (i * 53 + t * 400) % H; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 4, y + 14); c.stroke(); }
          flag(c, W * 0.5, H * 0.9, 120, '#3a3a3a', f.name[0], t * 1.2);
        }
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 0, W, H);
        const y = H - (t - 2) * 34;
        roll.style.transform = `translateY(${Math.min(0, y - H)}px)`;
        if (t > 2 && -(y - H) > roll.offsetHeight + H * 0.2) return finish();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
  }

  return { opening, titleBG, ending };
})();
