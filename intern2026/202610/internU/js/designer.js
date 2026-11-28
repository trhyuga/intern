// ============================================================
//  艦の設計（AI の自動設計と、プレイヤーの設計画面の部品）
// ============================================================
const Designer = (() => {
  function unlockedMods(fid) {
    const f = G.facs[fid];
    return Object.keys(MODULES).filter(k => Object.entries(MODULES[k].req).every(([b, v]) => b === 'forb' ? f.forb.includes(v) : f.tech[b] >= v));
  }
  function unlockedHulls(fid) {
    const f = G.facs[fid];
    return Object.keys(HULLS).filter(k => Object.entries(HULLS[k].req).every(([b, v]) => f.tech[b] >= v));
  }
  // いちばん強い武器・防具を選ぶ
  function best(fid, list) { const u = unlockedMods(fid); return list.find(k => u.includes(k)); }

  // AI：技術が進んだら設計を作り直す
  function autoDesign(fid) {
    const f = G.facs[fid];
    const sig = JSON.stringify(f.tech) + f.forb.join();
    if (f.autoSig === sig) return;
    f.autoSig = sig;
    const hulls = unlockedHulls(fid);
    const W = best(fid, ['void', 'pc', 'rail', 'las']), W2 = best(fid, ['rail', 'las']), Wc = best(fid, ['pls', 'las']);
    const D = best(fid, ['shd', 'arm']);
    const plans = [];
    plans.push(['自動・駆逐艦', 'dd', [Wc, 'thr']]);
    plans.push(['自動・巡洋艦', 'cl', [W2, 'msl', D]]);
    if (hulls.includes('bb')) plans.push(['自動・戦艦', 'bb', [W, W2, 'msl', D, best(fid, ['ecm', 'pd'])]]);
    if (hulls.includes('cv')) plans.push(['自動・空母', 'cv', ['hg', 'hg', 'pd', D]]);
    if (hulls.includes('dn')) plans.push(['自動・弩級艦', 'dn', [W, W, W2, 'msl', D, 'arm', best(fid, ['soul', 'cmd', 'rep', 'pd'])]]);
    // 古い自動設計を消して作り直す（艦はそのまま）
    f.designs = f.designs.filter(id => !G.designs[id].auto);
    plans.forEach(([n, h, m]) => Game.newDesign(fid, n, h, m.filter(Boolean).slice(0, HULLS[h].slots), true));
  }
  // AI が造る設計を選ぶ
  function pickBuild(fid, pl) {
    const f = G.facs[fid];
    const ds = f.designs.map(id => G.designs[id]).filter(d => Game.designUnlocked(d, fid) && Game.canBuildHull(pl, d.hull));
    if (!ds.length) return null;
    const afford = ds.filter(d => Game.designCost(d, fid) <= f.funds - 60);
    if (!afford.length) return null;
    // 費用あたりの強さで選び、少しばらつかせる
    let bestD = null, bs = -1;
    for (const d of afford) {
      const st = Game.designStats(d, fid);
      const v = (st.dps * 1.6 + st.hp * 0.05 + st.shield * 0.03) / Game.designCost(d, fid) * (0.8 + Math.random() * 0.4) * (d.hull === 'bb' || d.hull === 'dn' ? 1.15 : 1);
      if (v > bs) { bs = v; bestD = d; }
    }
    return bestD;
  }
  return { unlockedMods, unlockedHulls, autoDesign, pickBuild };
})();
