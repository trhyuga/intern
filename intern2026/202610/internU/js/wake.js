// ============================================================
//  画面を消さない（Screen Wake Lock API）
//  ゲームを開いている間、iPhone などが自動でスリープしないようにする
//  - iOS Safari は 16.4 から（18.4 から完全に）対応。対応していなければ何もしない
//  - 画面が隠れると（アプリの切り替えなど）ロックは外れるので、戻ってきた時に取り直す
//  - メニューで切り替えられる（覚えておく）
// ============================================================
const Wake = (() => {
  const KEY = 'seisou_wake';
  let lock = null, want = true;
  try { want = localStorage.getItem(KEY) !== '0'; } catch (e) { }
  const supported = () => 'wakeLock' in navigator;
  async function acquire() {
    if (!want || !supported() || lock || document.visibilityState !== 'visible') return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } catch (e) { lock = null; }   // 省電力モードなどで断られることがある
  }
  async function release() { try { if (lock) await lock.release(); } catch (e) { } lock = null; }
  function set(on) {
    want = on;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { }
    if (on) acquire(); else release();
  }
  function init() {
    // 最初に画面に触れた時（ブラウザによっては操作がないと取れない）と、戻ってきた時に取り直す
    ['pointerdown', 'touchend', 'click'].forEach(ev => document.addEventListener(ev, () => acquire(), { capture: true, passive: true }));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') acquire(); });
    acquire();
  }
  return { init, set, supported, get on() { return want; }, get active() { return !!lock; } };
})();
