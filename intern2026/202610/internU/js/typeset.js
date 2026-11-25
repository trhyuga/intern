// ============================================================
//  文の組み方：改行のあとに1〜2文字だけ残る行（泣き別れ）を作らない
//  ・段落（\n で区切る）ごとに、最後の行が短すぎる時は、段落の幅を少しずつ詰めて
//    行の数を変えずに、最後の行へ文字を回す
//  ・1文字ずつ出す時も、先に全文で行の折り返しを決めておく（出ていない字は透明に）。
//    途中で折り返しが変わって、字が跳ねないように
// ============================================================
const Typeset = (() => {
  // 段落の行を数え、最後の行の幅を測る
  function info(p) {
    const r = document.createRange(); r.selectNodeContents(p);
    const rs = [...r.getClientRects()].filter(x => x.width > 0.5);
    if (!rs.length) return null;
    const left = p.getBoundingClientRect().left, tops = [];
    rs.forEach(x => { if (!tops.some(t => Math.abs(t - x.top) < x.height * 0.5)) tops.push(x.top); });
    tops.sort((a, b) => a - b);
    const lastTop = tops[tops.length - 1];
    const last = Math.max(...rs.filter(x => Math.abs(x.top - lastTop) < x.height * 0.5).map(x => x.right)) - left;
    return { n: tops.length, last };
  }
  // 最後の行が短い段落の幅を詰める
  function fitPara(p) {
    p.style.maxWidth = '';
    const W = p.getBoundingClientRect().width;
    if (!W) return;
    const I = info(p);
    if (!I || I.n < 2) return;
    const fs = parseFloat(getComputedStyle(p).fontSize) || 15;
    const enough = w => Math.max(fs * 4.5, w * 0.34);
    if (I.last >= enough(W)) return;
    let w = W, best = 0;
    for (let k = 0; k < 24; k++) {
      w -= fs * 0.5;
      if (w < W * 0.55) break;
      p.style.maxWidth = w + 'px';
      const J = info(p);
      if (!J || J.n > I.n) break;   // 行が増えるなら、そこまで
      best = w;
      if (J.last >= enough(w)) break;
    }
    p.style.maxWidth = best ? best + 'px' : '';
  }
  // el に text を段落ごとに組む。返す物：shown(n) で先頭から n 文字を見せる、all() で全部見せる
  function set(el, text) {
    el.textContent = '';
    const paras = String(text || '').split('\n').map(line => {
      const p = document.createElement('span'); p.className = 'ts-p';
      const a = document.createElement('span'), b = document.createElement('span'); b.className = 'ts-rest';
      b.textContent = line || ' ';
      p.appendChild(a); p.appendChild(b); el.appendChild(p);
      return { p, a, b, line };
    });
    let fitted = false;
    const fit = force => { if ((fitted && !force) || !el.isConnected) return; fitted = true; try { paras.forEach(x => fitPara(x.p)); } catch (e) { } };
    fit();
    let shownN = -1;
    function shown(n) {
      fit();
      if (n === shownN) return; shownN = n;
      let rest = n;
      for (const x of paras) {
        const k = Math.max(0, Math.min(x.line.length, rest));
        x.a.textContent = x.line.slice(0, k);
        x.b.textContent = x.line.slice(k) || (k === 0 && !x.line ? ' ' : '');
        rest -= x.line.length + 1;
      }
    }
    return { shown, all: () => shown(1e9), fit, length: String(text || '').length };
  }
  // 1文字ずつ出す（step 文字ずつ、ms ごと）。onTick(n) は毎回、onDone は出し終えた時
  function type(el, text, step, ms, onTick, onDone) {
    const T = set(el, text);
    let n = 0;
    T.shown(0);
    const h = setInterval(() => {
      n += step; T.shown(n);
      if (onTick) onTick(n);
      if (n >= T.length) { clearInterval(h); if (onDone) onDone(); }
    }, ms);
    return { stop: () => clearInterval(h), finish: () => { clearInterval(h); T.all(); if (onDone) onDone(); }, h };
  }
  // すぐに全部見せる文（字幕など）
  function plain(el, text) { const T = set(el, text); T.all(); return T; }
  return { type, plain, set, fitPara };
})();
