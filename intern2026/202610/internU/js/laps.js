// ============================================================
//  周回（クリアした国の数で、物語の長さと厚みが増えていく）
//  ・一周目：「早い」で1時間ほどで、蝕を根絶して終幕へ。物語は本筋と蝕の話が中心、人物の会話は少なめ
//  ・国をクリアするごとに、蝕の来る時期・各段階の間が延び、出来事と人物どうしの会話が増える
//  ・6か国すべてをクリアすると、今までどおりの全部入り（長い年月と、全大国との盟約か統一が終幕の条件）
//  数値はゲームの開始時に G に写して保存する（途中でクリアの数が変わっても、そのゲームは同じ長さ）
// ============================================================
const Laps = (() => {
  const KEY = 'seisou_laps_v1';
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function write(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { } }
  // クリアした国（重複なし）
  function cleared() { const d = read(); return Object.keys(d.clears || {}).map(Number).filter(n => n >= 0 && n < 6); }
  function tier() { const d = read(); return d.all ? 6 : cleared().length; }
  // クリアの記録（和平・統一のとき）
  function record(fid, type) {
    if (type !== 'peace' && type !== 'conquest') return;
    const d = read(); d.clears = d.clears || {}; d.clears[fid] = (d.clears[fid] || 0) + 1; d.runs = (d.runs || 0) + 1; write(d);
  }
  // 段階ごとの値（0〜6）
  //  pace：蝕の時期と各段階の間の倍率（元の長さ＝1）／content：人物の物語・会話・幕間の出やすさ／keys：深淵に要る核の欠片
  const TABLE = [
    { pace: 0.34, content: 0.18, keys: 1, seal: 0.35, packs: ['om'] },
    { pace: 0.42, content: 0.3, keys: 1, seal: 0.45, packs: ['om', 'cr', 'n'] },
    { pace: 0.52, content: 0.42, keys: 2, seal: 0.55, packs: ['om', 'cr', 'n', 'al', 'rv'] },
    { pace: 0.62, content: 0.55, keys: 2, seal: 0.65, packs: ['om', 'cr', 'n', 'al', 'rv', 'ec', 'af'] },
    { pace: 0.74, content: 0.68, keys: 2, seal: 0.78, packs: ['om', 'cr', 'n', 'al', 'rv', 'ec', 'af', 'sq'] },
    { pace: 0.86, content: 0.82, keys: 3, seal: 0.9, packs: ['om', 'cr', 'n', 'al', 'rv', 'ec', 'af', 'sq', 'ny'] },
    { pace: 1, content: 1, keys: 3, seal: 1, packs: null },
  ];
  // 新しいゲームの開始時に G に写す
  function stamp(G) { const t = tier(); G.lap = Object.assign({ tier: t }, TABLE[t]); }
  // いまのゲームの値（古いセーブは全部入り）
  const cur = () => (typeof G !== 'undefined' && G && G.lap) || Object.assign({ tier: 6 }, TABLE[6]);
  const pace = () => cur().pace;
  const content = () => cur().content;
  const full = () => cur().tier >= 6;
  // 出来事の束（id の頭）がこの周で出るか
  const PACK = id => { const m = /^(om|cr|al|rv|ec|af|ny|sq|n)\d|^(sq)_/.exec(id || ''); return m ? (m[1] || m[2]) : null; };
  function packOn(id) { const p = PACK(id), L = cur().packs; return !p || !L || L.includes(p); }
  // 月数を、この周の長さに縮める（最低 min）
  const T = (n, min = 1) => Math.max(min, Math.round(n * pace()));
  return { tier, cleared, record, stamp, pace, content, full, packOn, T, keys: () => cur().keys, seal: () => cur().seal, cur, unlockAll: () => { const d = read(); d.all = true; write(d); } };
})();
