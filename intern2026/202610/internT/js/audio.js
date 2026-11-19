// ============================================================
//  音（Web Audio でその場で合成。音源ファイルは使わない）
//  BGM：筝・二胡・笛・琵琶・笙・太鼓・鈴を合成し、五音音階の独自の曲を
//       A/B の節に分けて演奏する。地図の曲は季節ごとに変わる。
//  効果音：合戦・一騎討ち・内政・出来事ごとに専用の音を用意する。
// ============================================================
const Sound = (() => {
  let ctx = null, master = null, bgmGain = null, seGain = null, ambGain = null, noiseBuf = null;
  let muted = false;
  let timer = null, curMood = null, curSong = null, step = 0, nextTime = 0, pass = 0, secIdx = 0, secStep = 0;
  let amb = null, ambKind = null, thunderTimer = null;
  try { muted = localStorage.getItem('internT_mute') === '1'; } catch (e) {}

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    // 音割れを防ぐコンプレッサー
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85; master.connect(comp);
    bgmGain = ctx.createGain(); bgmGain.gain.value = 0.3; bgmGain.connect(master);
    seGain = ctx.createGain(); seGain.gain.value = 0.62; seGain.connect(master);
    ambGain = ctx.createGain(); ambGain.gain.value = 0.18; ambGain.connect(master);
    // 共有のノイズ（毎回作らない）
    const nl = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, nl, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    // 広間の響き（BGM と効果音の一部に）
    const conv = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
    conv.buffer = buf;
    const wet = ctx.createGain(); wet.gain.value = 0.32;
    bgmGain.connect(conv); conv.connect(wet); wet.connect(master);
    const seWet = ctx.createGain(); seWet.gain.value = 0.12; seGain.connect(seWet); seWet.connect(conv);
    if (curMood) { const m = curMood; curMood = null; api.bgm(m); }
  }

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const env = (g, t, a, peak, d, end = 0.0008) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); };

  // ---------- 楽器 ----------
  // 筝（撥弦）
  function koto(t, note, vol = 0.22, dur = 1.4, dest) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), g2 = ctx.createGain();
    o.type = 'triangle'; o2.type = 'sawtooth';
    o.frequency.value = midi(note); o2.frequency.value = midi(note) * 1.003;
    f.type = 'lowpass'; f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(500, t + dur);
    env(g, t, 0.004, vol, dur); g2.gain.value = 0.22;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(f); f.connect(dest || bgmGain);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  // 琵琶（硬めの撥弦。長い音はトレモロ）
  function pipa(t, note, vol = 0.2, dur = 0.5, dest) {
    if (dur > 0.45) { const n = Math.floor(dur / 0.07); for (let i = 0; i < n; i++) koto(t + i * 0.07, note, vol * (i ? 0.55 : 1) * (1 - i / n * 0.5), 0.18, dest); return; }
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'square'; o.frequency.value = midi(note);
    f.type = 'bandpass'; f.frequency.value = midi(note) * 3; f.Q.value = 1.2;
    env(g, t, 0.002, vol, dur * 0.9);
    o.connect(f); f.connect(g); g.connect(dest || bgmGain); o.start(t); o.stop(t + dur + 0.05);
    koto(t, note, vol * 0.6, dur, dest);
  }
  // 二胡（擦弦。しゃくり上げとビブラート）
  function erhu(t, note, vol = 0.1, dur = 1.0, dest) {
    const fq = midi(note);
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), fm = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(fq * 0.96, t); o.frequency.exponentialRampToValueAtTime(fq, t + 0.07);
    lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(fq * 0.014, t + Math.min(0.5, dur * 0.6));
    lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 2200; fm.type = 'peaking'; fm.frequency.value = 1200; fm.gain.value = 6; fm.Q.value = 1.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.09); g.gain.setValueAtTime(vol, t + dur * 0.75); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(fm); fm.connect(g); g.connect(dest || bgmGain);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
  // 笛（息の音つき）
  function flute(t, note, vol = 0.09, dur = 1.0, dest) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sine'; o.frequency.value = midi(note);
    lfo.frequency.value = 5; lg.gain.value = midi(note) * 0.01; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.1); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || bgmGain);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    noise(t, vol * 0.5, Math.min(0.25, dur), midi(note) * 2, dest || bgmGain, 'bandpass', 4);
  }
  // 笙（和音を長く鳴らす）
  function sho(t, notes, vol = 0.035, dur = 3) {
    notes.forEach(n => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = midi(n) * (1 + (Math.random() - 0.5) * 0.002);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(bgmGain); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  // 太鼓・小鼓・縁打ち・シンバル・鈴
  function drum(t, vol = 0.5, pitch = 70, dest, len = 0.45) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(pitch * 2, t); o.frequency.exponentialRampToValueAtTime(pitch * 0.6, t + len * 0.55);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g); g.connect(dest || bgmGain); o.start(t); o.stop(t + len + 0.05);
    noise(t, vol * 0.25, 0.07, 1200, dest);
  }
  function rim(t, vol = 0.12, dest) { noise(t, vol, 0.04, 3500, dest, 'bandpass', 3); }
  function cymbal(t, vol = 0.1, dur = 0.9, dest) { noise(t, vol, dur, 7000, dest, 'highpass'); noise(t, vol * 0.6, dur * 0.6, 4200, dest, 'bandpass', 8); }
  function bell(t, note, vol = 0.12, dur = 2.5, dest) {
    [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.9, 0.12]].forEach(([r, a]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = midi(note) * r;
      env(g, t, 0.003, vol * a, dur / Math.sqrt(r));
      o.connect(g); g.connect(dest || bgmGain); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  function noise(t, vol, dur, freq = 3000, dest, type = 'bandpass', q = 1) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || bgmGain);
    s.start(t, Math.random() * 1.5, dur + 0.05);
  }
  // 銅鑼
  function gong(t, vol = 0.35, dest) {
    [55, 82.5, 111, 139, 196].forEach((fq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(fq * 1.03, t); o.frequency.linearRampToValueAtTime(fq, t + 2);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol / (i + 1), t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
      o.connect(g); g.connect(dest || bgmGain); o.start(t); o.stop(t + 4.6);
    });
    noise(t, vol * 0.4, 1.8, 900, dest);
  }
  // 角笛（低い金管のうなり）
  function horn(t, note = 45, vol = 0.18, dur = 1.4, dest) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'sawtooth';
    o.frequency.setValueAtTime(midi(note) * 0.94, t); o.frequency.linearRampToValueAtTime(midi(note), t + 0.2);
    o2.frequency.setValueAtTime(midi(note) * 0.94 * 1.006, t); o2.frequency.linearRampToValueAtTime(midi(note) * 1.006, t + 0.2);
    f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1100, t + 0.3); f.frequency.linearRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.25); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(dest || seGain);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  // 掛け声（大勢の「おおお」）
  function shout(t, vol = 0.3, dur = 1.0, dest, base = 400) {
    [base, base * 1.9, base * 3].forEach((fq, i) => {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6; f.frequency.setValueAtTime(fq * 0.8, t); f.frequency.linearRampToValueAtTime(fq, t + dur * 0.3);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol / (i + 1), t + dur * 0.25); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || seGain); s.start(t, Math.random(), dur + 0.05);
    });
  }
  // 風切り（武器を振る音）
  function whoosh(t, vol = 0.3, dur = 0.22, dest) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(3500, t + dur * 0.6); f.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || seGain); s.start(t, Math.random(), dur + 0.05);
  }
  // 金属の打ち合い
  function metal(t, vol = 0.25, dest) {
    [1870, 2630, 3920, 5210].forEach((fq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = fq * (1 + (Math.random() - 0.5) * 0.04);
      env(g, t, 0.001, vol / (i + 1.5), 0.35 + i * 0.05);
      o.connect(g); g.connect(dest || seGain); o.start(t); o.stop(t + 0.6);
    });
    noise(t, vol * 0.9, 0.08, 5000, dest || seGain, 'highpass');
  }

  // ---------- 曲 ----------
  // 音階（半音の並び）。yo：明るい五音、min：短調の五音、in：都節（哀しく張りつめた音）
  const SCALES = { yo: [0, 2, 4, 7, 9], min: [0, 3, 5, 7, 10], in: [0, 1, 5, 7, 8], ryo: [0, 2, 5, 7, 9] };
  const deg = (root, d, sc) => root + sc[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5);
  // 旋律は8分音符ごとの記号列：数字=音階の度数、- =伸ばす、. =休み
  const tok = s => s.trim().split(/\s+/).filter(x => x !== '|');
  // 太鼓：K=大太鼓 k=小太鼓 r=縁 c=シンバル b=鈴 .=なし（16文字＝1小節を繰り返す）
  // 和音：1小節ごとの根音の度数。伴奏（arp）は和音の構成音を指す数字（0〜3）
  const SONGS = {
    title: { bpm: 60, root: 62, sc: 'min', order: ['A', 'B', 'A', 'C'],
      A: { inst: 'erhu', mel: '4 - - - 3 - 2 - 3 - - - - - . . | 2 - 3 - 4 - 5 - 4 - - - - - . .', ch: [0, -2], arp: '0...2...3...2...', drum: 'K...............', pad: true },
      B: { inst: 'flute', mel: '5 - 6 - 7 - 6 5 4 - - - 3 - 2 - | 3 - 4 - 2 - 1 - 0 - - - - - . .', ch: [1, 0], arp: '0.2.3.2.0.2.3.2.', drum: 'K.......r.......', pad: true },
      C: { inst: 'koto', mel: '7 . 6 . 5 . 4 . 5 - - - 4 . 3 . | 2 . 3 . 4 - 3 2 0 - - - - - . .', ch: [-1, 0], arp: '0.1.2.3.2.1.0.1.', drum: 'K.......K...r...', pad: true },
    },
    map0: { bpm: 88, root: 67, sc: 'yo', order: ['A', 'A', 'B', 'A'],   // 春
      A: { inst: 'koto', mel: '0 2 4 . 5 4 2 . 3 . 2 1 0 - . . | 2 4 5 7 6 . 5 4 2 3 2 1 0 - . .', ch: [0, -1], arp: '0..2..1.0..2..3.', drum: '........r.......' },
      B: { inst: 'flute', mel: '5 - 4 - 5 - 7 - 6 - - - 5 - . . | 4 - 2 - 3 - 4 - 2 - - - 0 - . .', ch: [2, 0], arp: '0.1.2.1.0.1.2.1.', drum: 'k.......r...b...' },
    },
    map1: { bpm: 104, root: 69, sc: 'yo', order: ['A', 'B', 'A', 'B'],  // 夏
      A: { inst: 'pipa', mel: '0 0 2 . 4 . 2 4 5 . 4 2 4 - . . | 5 5 7 . 6 . 5 4 2 . 3 2 0 - . .', ch: [0, 2], arp: '0.2.1.2.0.2.1.2.', drum: 'k...r.k.k...r...' },
      B: { inst: 'flute', mel: '7 - 6 5 4 - 5 - 6 - 5 4 2 - . . | 4 - 5 4 2 - 1 - 0 - - - . . . .', ch: [3, 0], arp: '0.1.2.3.0.1.2.3.', drum: 'k...r.k.k.k.r...' },
    },
    map2: { bpm: 76, root: 64, sc: 'min', order: ['A', 'B', 'A'],    // 秋
      A: { inst: 'erhu', mel: '2 - - 1 0 - - - 1 - 2 - 4 - - - | 3 - - 2 1 - 0 - -1 - - - - - . .', ch: [0, -2], arp: '0..1..2..3..2..1', drum: '................', pad: true },
      B: { inst: 'koto', mel: '4 . 5 . 4 . 2 . 3 - - - 2 . . . | 1 . 2 . 3 . 1 . 0 - - - . . . .', ch: [-1, 0], arp: '0.1.2.1.0.1.2.1.', drum: '........r.......' },
    },
    map3: { bpm: 64, root: 62, sc: 'in', order: ['A', 'B'],          // 冬
      A: { inst: 'flute', mel: '4 - - - 3 - - - 2 - - - 1 - 2 - | 3 - - - - - . . . . . . . . . .', ch: [0, 0], arp: '0.......2.......', drum: 'b...............', pad: true },
      B: { inst: 'koto', mel: '5 . . 4 3 . . . 2 . 1 . 0 - - - | 1 . . 2 3 . 2 . 1 - - - - - . .', ch: [-2, 0], arp: '0...1...2...1...', drum: '........b.......', pad: true },
    },
    battle: { bpm: 138, root: 57, sc: 'min', order: ['A', 'A', 'B', 'C'],
      A: { inst: 'pipa', mel: '0 . 0 2 3 . 2 0 4 . 3 2 3 - - - | 5 . 4 3 2 . 3 4 2 1 0 -1 0 - - -', ch: [0, -1], bass: 'x.x.x.o.x.x.x.o.', drum: 'K.k.K.k.K.k.Kkk.' },
      B: { inst: 'erhu', mel: '5 - - - 6 - 5 4 3 - - - 2 - 3 - | 4 - - - 3 - 2 1 0 - - - - - . .', ch: [2, 0], bass: 'x.x.x.x.x.x.x.x.', drum: 'K.k.K.kkK.k.K.kc' },
      C: { inst: 'pipa', mel: '7 6 5 . 7 6 5 . 4 3 2 . 3 - - - | 2 3 4 . 3 2 1 . 0 - 0 - 0 - . .', ch: [1, 0], bass: 'xxx.xxx.xxx.x.o.', drum: 'KkKkK.k.KkKkKkkc' },
    },
    defend: { bpm: 118, root: 54, sc: 'in', order: ['A', 'B'],
      A: { inst: 'koto', mel: '0 . 1 . 0 . . . 3 . 2 . 1 - - - | 0 . 1 . 2 . 3 . 4 - 3 - 2 - - -', ch: [0, 0], bass: 'x..x..x.x..x..x.', drum: 'K..k..K.K..k..kr' },
      B: { inst: 'erhu', mel: '4 - - - 5 - 4 - 3 - - - 1 - - - | 2 - 3 - 2 - 1 - 0 - - - . . . .', ch: [-2, 0], bass: 'x..x..x.x..x..x.', drum: 'K..k..K.K.kk.kkc' },
    },
    crisis: { bpm: 156, root: 56, sc: 'in', order: ['A', 'B'],
      A: { inst: 'pipa', mel: '0 1 0 . 3 2 1 . 0 1 3 . 4 - - - | 5 4 3 . 4 3 1 . 0 1 0 . 0 - - -', ch: [0, -1], bass: 'xxxxxxxxxxxxxxxx', drum: 'KkKkKkKkKkKkKkkc' },
      B: { inst: 'erhu', mel: '6 - - - 5 - - - 4 - 3 - 1 - - - | 3 - - - 1 - - - 0 - - - - - - -', ch: [1, 0], bass: 'xxxxxxxxxxxxxxxx', drum: 'K.KkK.KkK.KkKkKc' },
    },
    duel: { bpm: 164, root: 55, sc: 'min', order: ['A', 'B'],
      A: { inst: 'pipa', mel: '0 1 0 . 2 . 1 0 3 2 1 . 0 - - - | 4 3 2 . 3 . 2 1 0 1 0 . -1 - - -', ch: [0, -1], bass: 'x.x.x.x.x.x.x.x.', drum: 'KrkrKrkrKrkrKkKc' },
      B: { inst: 'erhu', mel: '5 - - - 4 - 3 - 4 - - - 2 - - - | 3 - 2 - 1 - 0 - 0 - - - - - - -', ch: [2, 0], bass: 'xxxxxxxxxxxxxxxx', drum: 'KKkrKKkrKKkrKkKc' },
    },
    ending: { bpm: 72, root: 65, sc: 'yo', order: ['A', 'B', 'A', 'C'],
      A: { inst: 'erhu', mel: '2 - 4 - 5 - 7 - 6 - 5 4 5 - - - | 4 - 2 - 3 - 4 2 1 - 0 - 0 - . .', ch: [0, 3], arp: '0.1.2.3.2.1.0.1.', drum: 'K.......K.......', pad: true },
      B: { inst: 'flute', mel: '7 - 9 - 8 - 7 - 6 - 5 - 7 - - - | 6 - 5 - 4 - 5 - 2 - - - . . . .', ch: [2, 0], arp: '0.2.3.2.0.2.3.2.', drum: 'K...r...K...r...', pad: true },
      C: { inst: 'koto', mel: '5 4 2 . 4 2 1 . 2 1 0 . 1 - - - | 2 . 4 . 5 . 7 . 10 - - - - - . .', ch: [0, 0], arp: '0123012301230123', drum: 'K...K...K.k.Kkkc', pad: true },
    },
    sad: { bpm: 56, root: 57, sc: 'in', order: ['A', 'B'],
      A: { inst: 'erhu', mel: '4 - - - 3 - - - 1 - - - 0 - - - | 1 - - - 3 - - - 2 - - - - - . .', ch: [0, -2], arp: '0.......2.......', drum: '................', pad: true },
      B: { inst: 'flute', mel: '5 - - 4 3 - - - 4 - 3 - 1 - - - | 0 - - - - - . . . . . . . . . .', ch: [-1, 0], arp: '0...1...2...1...', drum: 'b...............', pad: true },
    },
  };
  Object.values(SONGS).forEach(s => ['A', 'B', 'C'].forEach(k => { if (s[k]) s[k].m = tok(s[k].mel); }));

  function playInst(inst, t, note, dur, vol = 1) {
    if (inst === 'erhu') erhu(t, note + 12, 0.1 * vol, dur);
    else if (inst === 'flute') flute(t, note + 12, 0.085 * vol, dur);
    else if (inst === 'pipa') pipa(t, note, 0.2 * vol, Math.min(dur, 0.9));
    else koto(t, note, 0.22 * vol, Math.max(0.6, dur * 1.3));
  }
  function tick() {
    if (!ctx || !curSong) return;
    const s = curSong, spb = 60 / s.bpm / 2, sc = SCALES[s.sc];
    while (nextTime < ctx.currentTime + 0.3) {
      const sec = s[s.order[secIdx % s.order.length]];
      const i = secStep, bar = Math.floor(i / 16), bi = i % 16;
      const chRoot = sec.ch[bar % sec.ch.length];
      const chord = [chRoot, chRoot + 2, chRoot + 4, chRoot + 5].map(d => deg(s.root, d, sc));
      // 旋律
      const tk = sec.m[i];
      if (tk && tk !== '-' && tk !== '.') {
        let hold = 1; while (sec.m[i + hold] === '-') hold++;
        const n = deg(s.root, +tk, sc);
        // 2周目以降は少し変化（筝なら装飾音、旋律を1オクターブ上げることも）
        const up = pass % 2 === 1 && sec.inst === 'koto' && Math.random() < 0.3 ? 12 : 0;
        playInst(sec.inst, nextTime, n + up, spb * hold * 0.98);
        if (sec.inst === 'koto' && pass > 0 && hold >= 2 && Math.random() < 0.35) koto(nextTime + spb * hold * 0.5, deg(s.root, +tk + 1, sc), 0.12, 0.5);
        // 2周目以降、二胡・笛の旋律に筝で重ねる
        if (pass > 0 && (sec.inst === 'erhu' || sec.inst === 'flute') && hold >= 2) koto(nextTime, n, 0.1, 1.2);
      }
      // 伴奏（分散和音）
      if (sec.arp) { const a = sec.arp[bi]; if (a && a !== '.') koto(nextTime, chord[+a] - 12, 0.11, 1.4); }
      // 低音
      if (sec.bass) { const b = sec.bass[bi]; if (b === 'x') pipa(nextTime, chord[0] - 24, 0.2, 0.25); else if (b === 'o') pipa(nextTime, chord[0] - 12, 0.16, 0.25); }
      else if (bi === 0) koto(nextTime, chord[0] - 24, 0.22, 2.2);
      // 笙
      if (sec.pad && bi === 0) sho(nextTime, [chord[0], chord[1], chord[2]].map(n => n - 12 + (n - 12 < 50 ? 12 : 0)), 0.03, spb * 16);
      // 打楽器
      const d = sec.drum[bi];
      if (d === 'K') drum(nextTime, 0.5, 52, null, 0.6);
      else if (d === 'k') drum(nextTime, 0.22, 130, null, 0.25);
      else if (d === 'r') rim(nextTime, 0.14);
      else if (d === 'c') cymbal(nextTime, 0.08, 0.8);
      else if (d === 'b') bell(nextTime, deg(s.root + 24, 0, sc), 0.05, 2.5);
      nextTime += spb; secStep++;
      if (secStep >= sec.m.length) { secStep = 0; secIdx++; if (secIdx % s.order.length === 0) pass++; }
    }
  }

  // ---------- 環境音（雨） ----------
  function setAmb(kind) {
    if (!ctx || kind === ambKind) return;
    ambKind = kind;
    if (amb) { try { amb.g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.8); amb.s.stop(ctx.currentTime + 1); } catch (e) {} amb = null; }
    if (thunderTimer) { clearInterval(thunderTimer); thunderTimer = null; }
    if (kind === 'rain') {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500; f.Q.value = 0.4;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.5);
      s.connect(f); f.connect(g); g.connect(ambGain); s.start();
      amb = { s, g };
      thunderTimer = setInterval(() => { if (Math.random() < 0.25 && !muted) api.se('thunder'); }, 6000);
    }
  }

  // ---------- 効果音 ----------
  function se(kind) {
    if (!ctx || muted) return;
    const t = ctx.currentTime, S = seGain;
    switch (kind) {
      // 画面操作
      case 'tap': koto(t, 81, 0.1, 0.15, S); break;
      case 'select': koto(t, 86, 0.08, 0.12, S); koto(t + 0.04, 91, 0.06, 0.15, S); break;
      case 'cancel': koto(t, 74, 0.1, 0.15, S); koto(t + 0.05, 69, 0.08, 0.2, S); break;
      case 'page': noise(t, 0.12, 0.12, 2500, S, 'bandpass', 0.8); break;
      case 'ok': koto(t, 76, 0.15, 0.3, S); koto(t + 0.08, 83, 0.15, 0.45, S); break;
      case 'ng': koto(t, 60, 0.18, 0.3, S); koto(t + 0.1, 55, 0.18, 0.5, S); break;
      // 内政
      case 'coin': [88, 93, 100].forEach((n, i) => bell(t + i * 0.06, n, 0.07, 0.5, S)); break;
      case 'build': for (let i = 0; i < 3; i++) { drum(t + i * 0.17, 0.25, 180, S, 0.12); noise(t + i * 0.17, 0.2, 0.06, 1800, S); } break;
      case 'farm': for (let i = 0; i < 2; i++) { drum(t + i * 0.25, 0.22, 90, S, 0.15); noise(t + i * 0.25 + 0.02, 0.15, 0.12, 700, S, 'lowpass'); } [96, 98, 96].forEach((n, i) => flute(t + 0.5 + i * 0.09, n, 0.03, 0.08, S)); break;
      case 'train': for (let i = 0; i < 3; i++) { drum(t + i * 0.22, 0.32, 70, S, 0.3); shout(t + i * 0.22, 0.12, 0.18, S, 380); } break;
      case 'draft': drum(t, 0.4, 60, S, 0.5); drum(t + 0.3, 0.4, 60, S, 0.5); shout(t + 0.35, 0.18, 0.8, S, 330); break;
      case 'alms': [79, 83, 86].forEach((n, i) => koto(t + i * 0.12, n, 0.12, 0.8, S)); break;
      case 'great': [0, 4, 7, 12, 16].forEach((d, i) => bell(t + i * 0.07, 84 + d, 0.06, 1.2, S)); koto(t + 0.38, 96, 0.1, 0.8, S); break;
      case 'join': [0, 2, 4, 7, 9, 12].forEach((d, i) => koto(t + i * 0.08, 72 + d, 0.16, 0.8, S)); bell(t + 0.5, 84, 0.08, 1.5, S); break;
      case 'win': [0, 2, 4, 7, 9, 12].forEach((d, i) => koto(t + i * 0.09, 72 + d, 0.17, 0.8, S)); break;
      case 'bell': bell(t, 79, 0.12, 2.5, S); bell(t + 0.25, 86, 0.08, 2.5, S); break;
      case 'event': bell(t, 74, 0.1, 3, S); bell(t + 0.4, 81, 0.08, 3, S); erhu(t + 0.3, 69, 0.06, 1.4, S); break;
      case 'death': bell(t, 57, 0.16, 4, S); erhu(t + 0.4, 69, 0.07, 1.0, S); erhu(t + 1.4, 65, 0.07, 1.6, S); break;
      case 'season': [79, 76, 74, 79, 86].forEach((n, i) => koto(t + i * 0.1, n, 0.11, 0.9, S)); break;
      case 'ally': bell(t, 81, 0.09, 2, S); bell(t + 0.2, 88, 0.09, 2, S); koto(t + 0.4, 93, 0.1, 1, S); break;
      // 合戦
      case 'hit': noise(t, 0.5, 0.18, 2500, S); drum(t, 0.3, 90, S); break;
      case 'slash': whoosh(t, 0.25, 0.15, S); noise(t + 0.1, 0.45, 0.15, 2200, S); drum(t + 0.1, 0.28, 85, S); shout(t + 0.08, 0.06, 0.4, S, 420); break;
      case 'clash': metal(t, 0.3, S); break;
      case 'block': metal(t, 0.22, S); drum(t, 0.18, 160, S, 0.15); break;
      case 'whoosh': whoosh(t, 0.3, 0.22, S); break;
      case 'crit': whoosh(t, 0.35, 0.16, S); drum(t + 0.12, 0.6, 45, S, 0.7); metal(t + 0.12, 0.35, S); noise(t + 0.12, 0.5, 0.4, 1500, S, 'lowpass'); bell(t + 0.15, 96, 0.08, 1.2, S); break;
      case 'skill': {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.45);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + 0.5);
        o.connect(f); f.connect(g); g.connect(S); o.start(t); o.stop(t + 0.55);
        gong(t + 0.45, 0.35, S); drum(t + 0.45, 0.7, 42, S, 0.9); metal(t + 0.5, 0.3, S); break;
      }
      case 'arrow': whoosh(t, 0.18, 0.12, S); noise(t, 0.2, 0.15, 6000, S, 'highpass'); break;
      case 'volley': for (let i = 0; i < 6; i++) { whoosh(t + i * 0.04, 0.14, 0.15, S); } noise(t + 0.3, 0.3, 0.3, 2000, S); break;
      case 'fire': noise(t, 0.6, 1.2, 500, S, 'lowpass'); for (let i = 0; i < 6; i++) noise(t + 0.1 + Math.random() * 0.8, 0.2, 0.04, 3000, S); break;
      case 'confuse': [0, 1, 0, -1, 0, 1].forEach((d, i) => koto(t + i * 0.07, 80 + d * 3, 0.11, 0.2, S)); break;
      case 'gateBreak': drum(t, 0.8, 38, S, 1.0); noise(t, 0.6, 1.4, 400, S, 'lowpass'); for (let i = 0; i < 8; i++) noise(t + 0.2 + i * 0.1, 0.25, 0.08, 1200 + Math.random() * 1500, S); shout(t + 0.4, 0.2, 1.4, S, 360); break;
      case 'horse': for (let i = 0; i < 4; i++) { drum(t + i * 0.09 + (i % 2) * 0.02, 0.12, 180, S, 0.08); } break;
      case 'march': for (let i = 0; i < 4; i++) drum(t + i * 0.18, 0.4, 65, S); break;
      case 'warcry': horn(t, 45, 0.16, 1.3, S); horn(t + 0.05, 52, 0.08, 1.2, S); drum(t, 0.5, 55, S, 0.6); drum(t + 0.4, 0.5, 55, S, 0.6); shout(t + 0.5, 0.3, 1.4, S, 360); break;
      case 'horn': horn(t, 45, 0.18, 1.6, S); horn(t + 0.9, 52, 0.15, 1.2, S); break;
      case 'cheer': shout(t, 0.3, 1.5, S, 420); shout(t + 0.2, 0.2, 1.3, S, 520); for (let i = 0; i < 3; i++) drum(t + i * 0.25, 0.3, 60, S); break;
      case 'thunder': noise(t, 0.6, 2.5, 180, S, 'lowpass'); noise(t, 0.4, 0.3, 1200, S); break;
      case 'gong': gong(t, 0.4, S); break;
      // 勝敗のファンファーレ
      case 'victory': {
        const ph = [[0, 0], [0.18, 4], [0.36, 7], [0.54, 9], [0.8, 12]];
        ph.forEach(([dt, d]) => { pipa(t + dt, 69 + d, 0.18, 0.3, S); });
        erhu(t + 0.8, 81, 0.09, 1.6, S); koto(t + 0.8, 69, 0.18, 2, S); drum(t, 0.5, 55, S, 0.6); drum(t + 0.8, 0.6, 50, S, 0.8); cymbal(t + 0.8, 0.12, 1.5, S); shout(t + 0.9, 0.18, 1.2, S, 420); break;
      }
      case 'defeat': [[0, 69], [0.4, 68], [0.8, 64], [1.3, 62]].forEach(([dt, n]) => erhu(t + dt, n, 0.08, 0.6, S)); drum(t, 0.4, 45, S, 1); bell(t + 1.3, 50, 0.12, 3, S); break;
    }
  }

  const api = {
    init,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('internT_mute', muted ? '1' : '0'); } catch (e) {}
      if (master) master.gain.value = muted ? 0 : 0.85;
      return muted;
    },
    // mood：title / map（季節で曲が変わる）/ battle / defend / crisis / duel / ending / sad
    bgm(mood) {
      let key = mood;
      if (mood === 'map') key = 'map' + ((typeof G !== 'undefined' && G && G.season >= 0) ? G.season : 0);
      if (!ctx) { curMood = mood; return; }
      if (curMood === key) return;
      curMood = key; curSong = SONGS[key] || null;
      step = 0; secIdx = 0; secStep = 0; pass = 0; nextTime = ctx.currentTime + 0.12;
      if (timer) clearInterval(timer);
      timer = null;
      if (curSong) { timer = setInterval(tick, 60); if (key === 'title' || key === 'ending') gong(ctx.currentTime + 0.1, 0.3); }
      if (key !== 'battle' && key !== 'defend' && key !== 'crisis' && key !== 'duel') setAmb(null);
    },
    get mood() { return curMood; },
    stop() { curMood = null; curSong = null; if (timer) clearInterval(timer); timer = null; setAmb(null); },
    amb: setAmb,
    se,
  };
  return api;
})();
