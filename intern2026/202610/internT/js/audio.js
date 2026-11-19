// ============================================================
//  音（Web Audio でその場で合成。音源ファイルは使わない）
//  BGM は五音音階で自動生成する独自の曲。
// ============================================================
const Sound = (() => {
  let ctx = null, master = null, bgmGain = null, seGain = null;
  let muted = false;
  let timer = null, curMood = null, step = 0, nextTime = 0;
  try { muted = localStorage.getItem('internT_mute') === '1'; } catch (e) {}

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    bgmGain = ctx.createGain(); bgmGain.gain.value = 0.32; bgmGain.connect(master);
    seGain = ctx.createGain(); seGain.gain.value = 0.6; seGain.connect(master);
    // 簡易リバーブ
    const conv = ctx.createConvolver();
    const len = ctx.sampleRate * 1.8, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5); }
    conv.buffer = buf;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    bgmGain.connect(conv); conv.connect(wet); wet.connect(master);
  }

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  // 撥弦（筝のような音）
  function pluck(t, note, vol = 0.3, dur = 1.2, dest) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sawtooth';
    o.frequency.value = midi(note); o2.frequency.value = midi(note) * 1.002;
    f.type = 'lowpass'; f.frequency.setValueAtTime(4000, t); f.frequency.exponentialRampToValueAtTime(600, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(f); f.connect(dest || bgmGain);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  // 笛
  function flute(t, note, vol = 0.12, dur = 1.0) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sine'; o.frequency.value = midi(note);
    lfo.frequency.value = 5.2; lg.gain.value = midi(note) * 0.012; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.12); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(bgmGain);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
  // 太鼓
  function drum(t, vol = 0.5, pitch = 70, dest) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(pitch * 2, t); o.frequency.exponentialRampToValueAtTime(pitch * 0.6, t + 0.25);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.connect(g); g.connect(dest || bgmGain); o.start(t); o.stop(t + 0.5);
    noise(t, vol * 0.25, 0.08, 1200, dest);
  }
  function noise(t, vol, dur, freq = 3000, dest, type = 'bandpass') {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur)), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || bgmGain); s.start(t);
  }
  // 銅鑼
  function gong(t, vol = 0.35) {
    [55, 82.5, 111, 139].forEach((fq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(fq * 1.02, t); o.frequency.linearRampToValueAtTime(fq, t + 2);
      g.gain.setValueAtTime(vol / (i + 1), t); g.gain.exponentialRampToValueAtTime(0.001, t + 4);
      o.connect(g); g.connect(bgmGain); o.start(t); o.stop(t + 4.1);
    });
    noise(t, vol * 0.4, 1.5, 900);
  }

  // ---- 曲の定義（五音音階: ド レ ミ ソ ラ） ----
  const SCALE = [0, 2, 4, 7, 9];
  const deg = (root, d) => root + SCALE[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5);
  // 旋律は固定パターン＋少しの揺らぎで作る
  const MOODS = {
    title:  { bpm: 66, root: 62, mel: [4,null,3,2, 3,null,null,null, 2,null,1,0, 1,null,null,null, 0,1,2,4, 3,null,2,null, 1,null,null,0, -1,null,null,null], bass: [0,null,null,null, -2,null,null,null], drum: [1,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0], fl: true },
    map:    { bpm: 84, root: 64, mel: [0,2,4,null, 5,4,2,null, 3,null,2,1, 0,null,null,null, 2,4,5,7, 6,null,5,4, 2,3,2,1, 0,null,null,null], bass: [0,null,-1,null, -2,null,-1,null], drum: [0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0], fl: false },
    battle: { bpm: 132, root: 57, mel: [0,null,0,2, 3,null,2,0, 4,null,3,2, 3,null,null,null, 5,null,4,3, 2,null,3,4, 2,1,0,-1, 0,null,null,null], bass: [0,0,null,0, -2,-2,null,-2], drum: [1,0,2,0,1,1,2,0, 1,0,2,0,1,0,2,2], fl: false },
    duel:   { bpm: 150, root: 55, mel: [0,1,0,null, 2,null,1,0, 3,2,1,null, 0,null,null,null], bass: [0,0,0,0, -1,-1,-1,-1], drum: [1,2,1,2,1,2,1,2, 1,2,1,2,1,1,2,2], fl: false },
    ending: { bpm: 72, root: 65, mel: [2,null,4,null, 5,null,7,null, 6,null,5,4, 5,null,null,null, 4,null,2,null, 3,null,4,2, 1,null,0,null, 0,null,null,null], bass: [0,null,null,null, -2,null,null,null], drum: [0,0,0,0,0,0,0,0, 1,0,0,0,0,0,0,0], fl: true },
    sad:    { bpm: 60, root: 57, mel: [4,null,3,null, 1,null,0,null, 1,null,3,null, 2,null,null,null], bass: [0,null,null,null,-2,null,null,null], drum: [0,0,0,0,0,0,0,0], fl: true },
  };

  function tick() {
    if (!ctx || !curMood) return;
    const m = MOODS[curMood];
    const spb = 60 / m.bpm / 2; // 8分音符
    while (nextTime < ctx.currentTime + 0.25) {
      const i = step % m.mel.length;
      const n = m.mel[i];
      if (n !== null && n !== undefined) {
        if (m.fl && (step % 4 === 0)) flute(nextTime, deg(m.root + 12, n), 0.08, spb * 3.5);
        pluck(nextTime, deg(m.root, n), 0.22, curMood === 'battle' || curMood === 'duel' ? 0.5 : 1.6);
      }
      const b = m.bass[step % m.bass.length];
      if (b !== null && b !== undefined) pluck(nextTime, deg(m.root - 24, b), 0.28, curMood === 'battle' ? 0.4 : 1.4);
      const d = m.drum[step % m.drum.length];
      if (d === 1) drum(nextTime, 0.45, 60);
      if (d === 2) drum(nextTime, 0.22, 140);
      nextTime += spb; step++;
    }
  }

  return {
    init,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('internT_mute', muted ? '1' : '0'); } catch (e) {}
      if (master) master.gain.value = muted ? 0 : 0.8;
      return muted;
    },
    bgm(mood) {
      if (!ctx) return;
      if (curMood === mood) return;
      curMood = mood; step = 0; nextTime = ctx.currentTime + 0.1;
      if (timer) clearInterval(timer);
      if (mood) { timer = setInterval(tick, 60); if (mood === 'title' || mood === 'ending') gong(ctx.currentTime + 0.1, 0.3); }
    },
    stop() { curMood = null; if (timer) clearInterval(timer); timer = null; },
    se(kind) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      switch (kind) {
        case 'tap': pluck(t, 81, 0.12, 0.15, seGain); break;
        case 'ok': pluck(t, 76, 0.15, 0.3, seGain); pluck(t + 0.08, 83, 0.15, 0.4, seGain); break;
        case 'ng': pluck(t, 60, 0.2, 0.3, seGain); pluck(t + 0.1, 57, 0.2, 0.4, seGain); break;
        case 'hit': noise(t, 0.5, 0.18, 2500, seGain); drum(t, 0.3, 90, seGain); break;
        case 'clash': noise(t, 0.6, 0.25, 5000, seGain, 'highpass'); pluck(t, 96, 0.15, 0.3, seGain); break;
        case 'fire': noise(t, 0.4, 0.8, 600, seGain, 'lowpass'); break;
        case 'arrow': noise(t, 0.25, 0.15, 6000, seGain, 'highpass'); break;
        case 'gong': gong(t, 0.4); break;
        case 'win': [0, 2, 4, 7, 9, 12].forEach((d, i) => pluck(t + i * 0.09, 72 + d, 0.18, 0.8, seGain)); break;
        case 'march': for (let i = 0; i < 4; i++) drum(t + i * 0.18, 0.4, 65, seGain); break;
      }
    },
  };
})();
