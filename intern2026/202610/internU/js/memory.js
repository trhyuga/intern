// ============================================================
//  メモリの後始末（iPhone の Safari で、メモリ不足で落ちないように）
//  ・覚えておいた絵（顔・艦・惑星）を捨てる。必要になれば描き直す
//  ・アプリを裏に回した時（iOS は裏でメモリの多いページから閉じる）と、ゲームを始めた時に行う
// ============================================================
const Memory = (() => {
  function trim() {
    try { if (typeof Portrait !== 'undefined' && Portrait.purge) Portrait.purge(); } catch (e) { }
    try { if (typeof PlanetArt !== 'undefined' && PlanetArt.purge) PlanetArt.purge(); } catch (e) { }
    // 艦の絵は、戦いの最中は使い続けるので捨てない
    try { const b = document.getElementById('battle'); if (typeof ShipArt !== 'undefined' && ShipArt.purge && !(b && b.classList.contains('show'))) ShipArt.purge(); } catch (e) { }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') trim(); });
    window.addEventListener('pagehide', trim);
  }
  return { trim };
})();
